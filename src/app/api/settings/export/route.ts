import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET: 导出企业数据
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 只有 OWNER 可以导出数据
    if (session.user.role !== 'OWNER') {
      return NextResponse.json({ error: '只有企业所有者可以导出数据' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'all'
    const format = searchParams.get('format') || 'json'

    const organizationId = session.user.organizationId

    // 根据类型获取数据
    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      organizationId,
    }

    if (type === 'all' || type === 'organization') {
      exportData.organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          description: true,
          industry: true,
          website: true,
          phone: true,
          address: true,
          plan: true,
          createdAt: true,
        },
      })
    }

    if (type === 'all' || type === 'members') {
      exportData.members = await prisma.user.findMany({
        where: { organizationId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      })
    }

    if (type === 'all' || type === 'workflows') {
      exportData.workflows = await prisma.workflow.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          tags: true,
          isActive: true,
          isPublic: true,
          version: true,
          config: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    }

    if (type === 'all' || type === 'executions') {
      // 只导出最近30天的执行记录
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      exportData.executions = await prisma.execution.findMany({
        where: {
          workflow: { organizationId },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          id: true,
          status: true,
          input: true,
          output: true,
          startedAt: true,
          completedAt: true,
          duration: true,
          totalTokens: true,
          workflowId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // 最多1000条
      })
    }

    if (type === 'all' || type === 'audit-logs') {
      // 只导出最近90天的审计日志
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      exportData.auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId,
          createdAt: { gte: ninetyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000, // 最多5000条
      })
    }

    // 记录审计日志
    await prisma.auditLog.create({
      data: {
        action: 'organization.data_exported',
        resource: 'organization',
        resourceId: organizationId,
        detail: { type, format },
        userId: session.user.id,
        organizationId,
      },
    })

    if (format === 'json') {
      return NextResponse.json(exportData, {
        headers: {
          'Content-Disposition': `attachment; filename="organization-export-${new Date().toISOString().split('T')[0]}.json"`,
        },
      })
    }

    // CSV 格式暂不支持（数据结构复杂）
    return NextResponse.json({ error: '暂只支持 JSON 格式导出' }, { status: 400 })
  } catch (error) {
    console.error('Failed to export data:', error)
    return NextResponse.json({ error: '导出数据失败' }, { status: 500 })
  }
}
