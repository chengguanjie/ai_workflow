/**
 * Webhook 触发端点
 *
 * POST /api/webhooks/[path]
 *
 * 外部系统通过 Webhook 触发工作流执行
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'
import { verifySignature } from '@/lib/webhook/signature'

interface RouteParams {
  params: Promise<{ path: string }>
}

// 获取客户端 IP
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  return 'unknown'
}

/**
 * POST /api/webhooks/[path]
 *
 * Webhook 触发工作流
 *
 * Headers:
 *   X-Webhook-Signature: t=<timestamp>,v1=<signature> (可选，如果配置了密钥)
 *   Content-Type: application/json
 *
 * Request body:
 * {
 *   input?: Record<string, unknown>  // 工作流输入
 *   async?: boolean                   // 是否异步执行（默认 true）
 * }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { path: webhookPath } = await params
  const startTime = Date.now()

  // 查找触发器
  const trigger = await prisma.workflowTrigger.findUnique({
    where: { webhookPath },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          isActive: true,
          deletedAt: true,
          organizationId: true,
        },
      },
    },
  })

  if (!trigger) {
    return NextResponse.json(
      { error: 'Webhook 不存在' },
      { status: 404 }
    )
  }

  // 检查触发器是否启用
  if (!trigger.enabled) {
    return NextResponse.json(
      { error: 'Webhook 已禁用' },
      { status: 403 }
    )
  }

  // 检查工作流状态
  if (!trigger.workflow.isActive || trigger.workflow.deletedAt) {
    // 记录日志
    await prisma.triggerLog.create({
      data: {
        triggerId: trigger.id,
        status: 'SKIPPED',
        requestMethod: request.method,
        requestIp: getClientIp(request),
        errorMessage: '工作流未激活或已删除',
        triggeredAt: new Date(),
        completedAt: new Date(),
        duration: Date.now() - startTime,
      },
    })

    return NextResponse.json(
      { error: '工作流未激活' },
      { status: 400 }
    )
  }

  // 获取请求体
  let rawBody: string
  let body: Record<string, unknown>
  try {
    rawBody = await request.text()
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json(
      { error: '请求体格式无效' },
      { status: 400 }
    )
  }

  // 验证签名（如果配置了密钥）
  if (trigger.webhookSecret) {
    const signatureHeader = request.headers.get('x-webhook-signature')
    const verifyResult = verifySignature(
      signatureHeader,
      rawBody,
      trigger.webhookSecret
    )

    if (!verifyResult.valid) {
      // 记录日志
      await prisma.triggerLog.create({
        data: {
          triggerId: trigger.id,
          status: 'FAILED',
          requestMethod: request.method,
          requestHeaders: JSON.parse(JSON.stringify(Object.fromEntries(request.headers.entries()))),
          requestBody: JSON.parse(JSON.stringify(body)),
          requestIp: getClientIp(request),
          errorMessage: `签名验证失败: ${verifyResult.error}`,
          triggeredAt: new Date(),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          responseCode: 401,
        },
      })

      return NextResponse.json(
        { error: `签名验证失败: ${verifyResult.error}` },
        { status: 401 }
      )
    }
  }

  // 合并输入：触发器模板 + 请求体输入
  const workflowInput = {
    ...(trigger.inputTemplate as Record<string, unknown> || {}),
    ...(body.input as Record<string, unknown> || {}),
    _webhook: {
      path: webhookPath,
      triggerId: trigger.id,
      triggerName: trigger.name,
      requestIp: getClientIp(request),
      triggeredAt: new Date().toISOString(),
    },
  }

  const asyncExecution = body.async !== false // 默认异步

  // 创建触发日志
  const triggerLog = await prisma.triggerLog.create({
    data: {
      triggerId: trigger.id,
      status: 'RUNNING',
      requestMethod: request.method,
      requestHeaders: JSON.parse(JSON.stringify(Object.fromEntries(request.headers.entries()))),
      requestBody: JSON.parse(JSON.stringify(body)),
      requestIp: getClientIp(request),
      triggeredAt: new Date(),
    },
  })

  try {
    // 更新触发器统计
    await prisma.workflowTrigger.update({
      where: { id: trigger.id },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    })

    if (asyncExecution) {
      // 异步执行
      const taskId = await executionQueue.enqueue(
        trigger.workflow.id,
        trigger.workflow.organizationId,
        trigger.createdById,
        workflowInput
      )

      // 更新日志
      await prisma.triggerLog.update({
        where: { id: triggerLog.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          duration: Date.now() - startTime,
          responseCode: 202,
        },
      })

      // 更新成功时间
      await prisma.workflowTrigger.update({
        where: { id: trigger.id },
        data: { lastSuccessAt: new Date() },
      })

      return NextResponse.json({
        success: true,
        taskId,
        status: 'pending',
        message: '工作流已加入执行队列',
        pollUrl: `/api/v1/tasks/${taskId}`,
      }, { status: 202 })
    } else {
      // 同步执行
      const result = await executeWorkflow(
        trigger.workflow.id,
        trigger.workflow.organizationId,
        trigger.createdById,
        workflowInput
      )

      const isSuccess = result.status === 'COMPLETED'

      // 更新日志
      await prisma.triggerLog.update({
        where: { id: triggerLog.id },
        data: {
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          executionId: result.executionId,
          completedAt: new Date(),
          duration: Date.now() - startTime,
          responseCode: isSuccess ? 200 : 500,
          errorMessage: result.error,
        },
      })

      // 更新触发器状态
      await prisma.workflowTrigger.update({
        where: { id: trigger.id },
        data: isSuccess
          ? { lastSuccessAt: new Date() }
          : { lastFailureAt: new Date() },
      })

      if (!isSuccess) {
        return NextResponse.json({
          success: false,
          status: result.status,
          error: result.error,
          executionId: result.executionId,
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        status: result.status,
        output: result.output,
        executionId: result.executionId,
        duration: result.duration,
        totalTokens: result.totalTokens,
      })
    }
  } catch (error) {
    console.error('Webhook execution error:', error)

    // 更新日志
    await prisma.triggerLog.update({
      where: { id: triggerLog.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        responseCode: 500,
        errorMessage: error instanceof Error ? error.message : '执行失败',
      },
    })

    // 更新失败时间
    await prisma.workflowTrigger.update({
      where: { id: trigger.id },
      data: { lastFailureAt: new Date() },
    })

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '工作流执行失败',
    }, { status: 500 })
  }
}

// GET: 用于测试 Webhook 是否存在
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { path: webhookPath } = await params

  const trigger = await prisma.workflowTrigger.findUnique({
    where: { webhookPath },
    select: {
      id: true,
      name: true,
      enabled: true,
      workflow: {
        select: {
          name: true,
          isActive: true,
        },
      },
    },
  })

  if (!trigger) {
    return NextResponse.json(
      { error: 'Webhook 不存在' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    exists: true,
    name: trigger.name,
    enabled: trigger.enabled,
    workflowName: trigger.workflow.name,
    workflowActive: trigger.workflow.isActive,
  })
}

// OPTIONS: 支持 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Signature',
      'Access-Control-Max-Age': '86400',
    },
  })
}
