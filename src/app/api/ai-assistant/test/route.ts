import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { executeWorkflow } from '@/lib/workflow/engine'
import type { WorkflowConfig } from '@/types/workflow'
import { ApiResponse } from '@/lib/api/api-response'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const { workflowId, testInput, timeout = 60 } = body

    if (!workflowId) {
      return ApiResponse.error('工作流ID不能为空', 400)
    }

    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    const config = workflow.config as unknown as WorkflowConfig
    if (!config || !config.nodes || config.nodes.length === 0) {
      return ApiResponse.success({
        success: false,
        error: '工作流配置为空，请先添加节点',
        analysis: '工作流没有任何节点，无法执行测试。请先通过AI助手生成工作流或手动添加节点。'
      })
    }

    const inputNodes = config.nodes.filter(n => n.type === 'INPUT')
    const missingInputs: string[] = []

    for (const node of inputNodes) {
      const fields = (node.config as { fields?: Array<{ name: string; required?: boolean; value?: string }> })?.fields || []
      for (const field of fields) {
        if (field.required && !testInput?.[field.name] && !field.value) {
          missingInputs.push(`${node.name}.${field.name}`)
        }
      }
    }

    if (missingInputs.length > 0) {
      return ApiResponse.success({
        success: false,
        error: '缺少必填输入',
        missingInputs,
        analysis: `以下必填字段未提供值：${missingInputs.join(', ')}。请在测试输入中提供这些值。`
      })
    }

    const timeoutMs = Math.min(timeout, 300) * 1000
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`测试执行超时 (${timeout}秒)`)), timeoutMs)
    })

    const startTime = Date.now()

    let result
    try {
      result = await Promise.race([
        executeWorkflow(workflowId, session.user.organizationId, session.user.id, testInput),
        timeoutPromise,
      ])
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : '执行失败'

      return ApiResponse.success({
        success: false,
        duration,
        error: errorMessage,
        analysis: analyzeError(errorMessage, config),
      })
    }

    const execution = await prisma.execution.findUnique({
      where: { id: result.executionId },
      include: {
        logs: {
          orderBy: { startedAt: 'asc' },
        },
      },
    })

    const nodeResults = execution?.logs.map(log => ({
      nodeId: log.nodeId,
      nodeName: log.nodeName,
      nodeType: log.nodeType,
      status: log.status === 'COMPLETED' ? 'success' as const : 'error' as const,
      error: log.error || undefined,
      output: log.output,
      duration: log.duration,
      promptTokens: log.promptTokens,
      completionTokens: log.completionTokens,
    })) || []

    const analysis = analyzeResult(result, nodeResults, config)

    return ApiResponse.success({
      success: result.status === 'COMPLETED',
      executionId: result.executionId,
      status: result.status,
      duration: result.duration,
      output: result.output,
      error: result.error,
      totalTokens: result.totalTokens,
      nodeResults,
      analysis,
      outputFiles: result.outputFiles,
    })
  } catch (error) {
    console.error('Test execution error:', error)
    return ApiResponse.error(
      error instanceof Error ? error.message : '测试执行失败',
      500,
      {
        success: false,
        analysis: '发生未知错误，请检查工作流配置是否正确。'
      }
    )
  }
}

function analyzeError(error: string, config: WorkflowConfig): string {
  const analysis: string[] = []

  if (error.includes('超时')) {
    analysis.push('执行超时可能的原因：')
    analysis.push('1. AI模型响应时间过长')
    analysis.push('2. 工作流节点过多或处理数据量过大')
    analysis.push('3. 外部API调用延迟')
    analysis.push('建议：减少节点数量或增加超时时间')
  } else if (error.includes('API') || error.includes('apiKey') || error.includes('授权')) {
    analysis.push('API配置问题：')
    analysis.push('1. 检查AI服务商配置是否正确')
    analysis.push('2. 确认API Key是否有效')
    analysis.push('3. 检查网络连接')
  } else if (error.includes('节点') && error.includes('失败')) {
    const nodeNameMatch = error.match(/节点 "([^"]+)"/)
    if (nodeNameMatch) {
      const nodeName = nodeNameMatch[1]
      const node = config.nodes.find(n => n.name === nodeName)
      if (node) {
        analysis.push(`节点 "${nodeName}" 执行失败`)
        if (node.type === 'PROCESS') {
          analysis.push('可能原因：')
          analysis.push('1. 系统提示词或用户提示词格式问题')
          analysis.push('2. 变量引用错误（如 {{节点名.字段名}} 格式不正确）')
          analysis.push('3. 引用的节点或字段不存在')
        } else if (node.type === 'HTTP') {
          analysis.push('可能原因：')
          analysis.push('1. URL配置错误')
          analysis.push('2. 认证信息不正确')
          analysis.push('3. 目标服务不可用')
        }
      }
    }
  } else if (error.includes('变量') || error.includes('引用')) {
    analysis.push('变量引用问题：')
    analysis.push('1. 检查变量格式是否为 {{节点名.字段名}}')
    analysis.push('2. 确认引用的节点是否存在')
    analysis.push('3. 确认引用的字段名是否正确')
  }

  if (analysis.length === 0) {
    analysis.push('执行出错，请检查：')
    analysis.push('1. 工作流配置是否完整')
    analysis.push('2. 节点之间的连接是否正确')
    analysis.push('3. 所有必填配置是否已填写')
  }

  return analysis.join('\n')
}

function analyzeResult(
  result: { status: string; error?: string; output?: Record<string, unknown> },
  nodeResults: Array<{ nodeName: string; status: string; error?: string; nodeType: string }>,
  config: WorkflowConfig
): string {
  const analysis: string[] = []

  const successNodes = nodeResults.filter(n => n.status === 'success')
  const failedNodes = nodeResults.filter(n => n.status === 'error')

  if (result.status === 'COMPLETED') {
    analysis.push(`执行成功！共 ${nodeResults.length} 个节点全部执行完成。`)

    if (result.output && Object.keys(result.output).length > 0) {
      analysis.push('\n输出结果分析：')
      const outputContent = typeof result.output.content === 'string'
        ? result.output.content
        : JSON.stringify(result.output, null, 2)

      if (outputContent.length > 500) {
        analysis.push(`输出内容较长（${outputContent.length} 字符），请查看完整输出。`)
      } else {
        analysis.push('输出内容已生成，请查看上方输出结果。')
      }
    } else {
      analysis.push('\n注意：工作流执行成功但没有输出内容，可能需要检查OUTPUT节点的配置。')
    }
  } else {
    analysis.push(`执行失败。成功 ${successNodes.length} 个节点，失败 ${failedNodes.length} 个节点。`)

    if (failedNodes.length > 0) {
      analysis.push('\n失败节点分析：')
      for (const node of failedNodes) {
        analysis.push(`- ${node.nodeName} (${node.nodeType}): ${node.error || '未知错误'}`)
      }
    }

    if (result.error) {
      analysis.push(`\n错误信息：${result.error}`)
    }
  }

  const processNodes = config.nodes.filter(n => n.type === 'PROCESS')
  if (processNodes.length > 0) {
    const processResults = nodeResults.filter(n => n.nodeType === 'PROCESS')
    const allProcessSuccess = processResults.every(n => n.status === 'success')

    if (!allProcessSuccess) {
      analysis.push('\nAI处理节点优化建议：')
      analysis.push('1. 检查系统提示词是否清晰定义了AI的角色和任务')
      analysis.push('2. 检查用户提示词中的变量引用是否正确')
      analysis.push('3. 考虑降低temperature值以获得更稳定的输出')
    }
  }

  return analysis.join('\n')
}
