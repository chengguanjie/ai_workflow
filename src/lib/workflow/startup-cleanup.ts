/**
 * 启动时清理卡住的执行记录
 *
 * 当服务器重启时，之前处于 RUNNING 或 PENDING 状态的执行记录
 * 可能永远不会完成（因为内存中的执行状态已丢失）
 * 此模块在启动时将这些记录标记为 FAILED
 */

import { prisma } from '@/lib/db'

/**
 * 清理卡住的执行记录
 * 将所有 RUNNING 和 PENDING 状态的执行记录标记为 FAILED
 */
export async function cleanupStuckExecutions(): Promise<{
  cleaned: number
  executions: Array<{ id: string; workflowId: string; status: string }>
}> {
  try {
    // 查找所有卡住的执行记录
    const stuckExecutions = await prisma.execution.findMany({
      where: {
        status: { in: ['RUNNING', 'PENDING'] },
      },
      select: {
        id: true,
        workflowId: true,
        status: true,
        startedAt: true,
        workflow: {
          select: { name: true },
        },
      },
    })

    if (stuckExecutions.length === 0) {
      console.log('[StartupCleanup] 没有发现卡住的执行记录')
      return { cleaned: 0, executions: [] }
    }

    // 批量更新为 FAILED 状态
    const updateResult = await prisma.execution.updateMany({
      where: {
        id: { in: stuckExecutions.map((e) => e.id) },
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: '服务器重启：执行被中断。请重新执行工作流。',
      },
    })

    console.log(
      `[StartupCleanup] 已清理 ${updateResult.count} 条卡住的执行记录:`,
      stuckExecutions.map((e) => ({
        id: e.id,
        workflow: e.workflow.name,
        status: e.status,
      }))
    )

    return {
      cleaned: updateResult.count,
      executions: stuckExecutions.map((e) => ({
        id: e.id,
        workflowId: e.workflowId,
        status: e.status,
      })),
    }
  } catch (error) {
    console.error('[StartupCleanup] 清理卡住的执行记录失败:', error)
    return { cleaned: 0, executions: [] }
  }
}
