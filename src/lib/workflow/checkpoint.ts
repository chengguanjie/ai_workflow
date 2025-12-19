/**
 * 工作流执行检查点管理
 *
 * 支持断点续执行功能：
 * - 保存已完成节点的输出
 * - 记录执行进度
 * - 恢复执行状态
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

/**
 * 检查点数据结构
 */
export interface CheckpointData {
  // 已完成节点的输出
  completedNodes: Record<string, {
    output: unknown
    status: 'COMPLETED' | 'FAILED'
    completedAt: string
  }>
  // 失败的节点 ID
  failedNodeId?: string
  // 执行上下文
  context: {
    nodeResults: Record<string, unknown>
    variables: Record<string, unknown>
  }
  // 检查点版本（用于兼容性）
  version: number
  // 工作流版本 hash（用于检测工作流变更）
  workflowHash: string
}

/**
 * 创建工作流内容的 hash
 * 用于检测工作流是否已变更
 */
export function createWorkflowHash(nodes: unknown[], edges: unknown[]): string {
  const content = JSON.stringify({ nodes, edges })
  // 简单的 hash 实现
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

/**
 * 保存检查点
 */
export async function saveCheckpoint(
  executionId: string,
  checkpointData: CheckpointData
): Promise<void> {
  await prisma.execution.update({
    where: { id: executionId },
    data: {
      checkpoint: checkpointData as unknown as Prisma.InputJsonValue,
      lastCheckpoint: new Date(),
      canResume: true,
    },
  })
}

/**
 * 加载检查点
 */
export async function loadCheckpoint(
  executionId: string
): Promise<CheckpointData | null> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    select: { checkpoint: true },
  })

  if (!execution?.checkpoint) {
    return null
  }

  return execution.checkpoint as unknown as CheckpointData
}

/**
 * 验证检查点是否可用于恢复
 * 检查工作流是否已变更
 */
export async function validateCheckpoint(
  executionId: string,
  currentWorkflowHash: string
): Promise<{ valid: boolean; reason?: string }> {
  const checkpoint = await loadCheckpoint(executionId)

  if (!checkpoint) {
    return { valid: false, reason: '没有可用的检查点' }
  }

  if (checkpoint.version !== 1) {
    return { valid: false, reason: '检查点版本不兼容' }
  }

  if (checkpoint.workflowHash !== currentWorkflowHash) {
    return { valid: false, reason: '工作流已变更，无法恢复' }
  }

  return { valid: true }
}

/**
 * 标记执行为可恢复状态
 */
export async function markAsResumable(
  executionId: string,
  failedNodeId: string
): Promise<void> {
  // 更新检查点添加失败节点信息
  const checkpoint = await loadCheckpoint(executionId)
  if (checkpoint) {
    checkpoint.failedNodeId = failedNodeId
    await saveCheckpoint(executionId, checkpoint)
  }

  await prisma.execution.update({
    where: { id: executionId },
    data: { canResume: true },
  })
}

/**
 * 清除检查点（执行完成后）
 */
export async function clearCheckpoint(executionId: string): Promise<void> {
  await prisma.execution.update({
    where: { id: executionId },
    data: {
      checkpoint: Prisma.DbNull,
      canResume: false,
    },
  })
}

/**
 * 获取可恢复的执行列表
 */
export async function getResumableExecutions(
  workflowId: string,
  limit = 10
): Promise<Array<{
  id: string
  status: string
  error: string | null
  lastCheckpoint: Date | null
  createdAt: Date
}>> {
  const executions = await prisma.execution.findMany({
    where: {
      workflowId,
      canResume: true,
      status: 'FAILED',
    },
    select: {
      id: true,
      status: true,
      error: true,
      lastCheckpoint: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return executions
}

/**
 * 创建恢复执行记录
 */
export async function createResumedExecution(
  originalExecutionId: string,
  workflowId: string,
  _organizationId: string,
  userId: string,
  input: Record<string, unknown>
): Promise<string> {
  // 获取原执行的检查点
  const originalExecution = await prisma.execution.findUnique({
    where: { id: originalExecutionId },
    select: { checkpoint: true },
  })

  if (!originalExecution?.checkpoint) {
    throw new Error('原执行没有可用的检查点')
  }

  // 创建新的执行记录
  const newExecution = await prisma.execution.create({
    data: {
      workflowId,
      userId,
      input: input as Prisma.InputJsonValue,
      status: 'PENDING',
      checkpoint: originalExecution.checkpoint as Prisma.InputJsonValue,
      resumedFromId: originalExecutionId,
    },
  })

  // 标记原执行为已恢复（不再可恢复）
  await prisma.execution.update({
    where: { id: originalExecutionId },
    data: { canResume: false },
  })

  return newExecution.id
}
