/**
 * MERGE 节点处理器
 *
 * 用于合并多个并行分支的执行结果
 * 支持三种合并策略：all（全部完成）、any（任一完成）、race（竞速）
 */

import type { NodeProcessor, ExecutionContext, NodeOutput } from '../types'
import type { MergeNodeConfig, MergeNodeConfigData, EdgeConfig, NodeConfig } from '@/types/workflow'
import { getPredecessorIds } from '../utils'

/**
 * 分支执行结果
 */
interface BranchResult {
  nodeId: string
  nodeName: string
  status: 'success' | 'error' | 'pending'
  output?: Record<string, unknown>
  error?: string
}

/**
 * 处理 MERGE 节点
 *
 * MERGE 节点会收集所有入边节点的输出，并根据配置的合并策略进行处理
 */
async function processMergeNode(
  node: MergeNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const startTime = new Date()

  const config = node.config as MergeNodeConfigData
  const {
    mergeStrategy = 'all',
    errorStrategy = 'fail_fast',
    outputMode = 'merge',
  } = config

  // 获取所有前置节点的输出
  const branchResults: BranchResult[] = []

  // 遍历 context 中的节点输出，找到所有入边节点的结果
  for (const [nodeId, output] of context.nodeOutputs) {
    // MERGE 节点不处理自身
    if (nodeId === node.id) continue

    branchResults.push({
      nodeId: output.nodeId,
      nodeName: output.nodeName,
      status: output.status === 'success' ? 'success' : output.status === 'error' ? 'error' : 'pending',
      output: output.data,
      error: output.error,
    })
  }

  // 根据错误策略处理失败的分支
  const failedBranches = branchResults.filter((b) => b.status === 'error')
  const successfulBranches = branchResults.filter((b) => b.status === 'success')

  if (failedBranches.length > 0) {
    switch (errorStrategy) {
      case 'fail_fast':
        // 立即失败
        return {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: 'MERGE',
          status: 'error',
          data: {
            failedBranches: failedBranches.map((b) => ({
              nodeId: b.nodeId,
              nodeName: b.nodeName,
              error: b.error,
            })),
          },
          error: `并行分支执行失败: ${failedBranches.map((b) => b.nodeName).join(', ')}`,
          startedAt: startTime,
          completedAt: new Date(),
          duration: Date.now() - startTime.getTime(),
        }

      case 'continue':
        // 继续使用成功的分支
        // 后面会处理
        break

      case 'collect':
        // 收集所有错误但不立即失败
        // 后面会处理
        break
    }
  }

  // 根据合并策略处理结果
  let mergedOutput: Record<string, unknown> = {}

  switch (mergeStrategy) {
    case 'all':
      // 需要所有分支都完成
      if (successfulBranches.length === 0 && errorStrategy === 'fail_fast') {
        return {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: 'MERGE',
          status: 'error',
          data: {},
          error: '没有成功完成的分支',
          startedAt: startTime,
          completedAt: new Date(),
          duration: Date.now() - startTime.getTime(),
        }
      }
      mergedOutput = mergeOutputs(successfulBranches, outputMode)
      break

    case 'any':
      // 只需要任一分支完成
      if (successfulBranches.length > 0) {
        mergedOutput = mergeOutputs(successfulBranches, outputMode)
      } else if (errorStrategy !== 'fail_fast') {
        mergedOutput = {}
      }
      break

    case 'race':
      // 使用第一个完成的分支（通常是最快的）
      if (successfulBranches.length > 0) {
        mergedOutput = mergeOutputs([successfulBranches[0]], 'first')
      }
      break
  }

  // 添加元数据
  mergedOutput._merge = {
    strategy: mergeStrategy,
    totalBranches: branchResults.length,
    successfulBranches: successfulBranches.length,
    failedBranches: failedBranches.length,
    branchNames: successfulBranches.map((b) => b.nodeName),
  }

  // 如果有失败的分支且策略是 collect，添加错误信息
  if (failedBranches.length > 0 && errorStrategy === 'collect') {
    mergedOutput._errors = failedBranches.map((b) => ({
      nodeId: b.nodeId,
      nodeName: b.nodeName,
      error: b.error,
    }))
  }

  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: 'MERGE',
    status: 'success',
    data: mergedOutput,
    startedAt: startTime,
    completedAt: new Date(),
    duration: Date.now() - startTime.getTime(),
  }
}

/**
 * 根据输出模式合并分支结果
 */
function mergeOutputs(
  branches: BranchResult[],
  outputMode: 'merge' | 'array' | 'first'
): Record<string, unknown> {
  switch (outputMode) {
    case 'merge':
      // 合并所有分支输出到一个对象
      const merged: Record<string, unknown> = {}
      for (const branch of branches) {
        if (branch.output) {
          merged[branch.nodeName] = branch.output
        }
      }
      return merged

    case 'array':
      // 将所有分支输出作为数组
      return {
        branches: branches.map((b) => ({
          nodeId: b.nodeId,
          nodeName: b.nodeName,
          output: b.output,
        })),
      }

    case 'first':
      // 只使用第一个分支的输出
      if (branches.length > 0 && branches[0].output) {
        return branches[0].output
      }
      return {}
  }
}

/**
 * 获取 MERGE 节点的所有入边节点 ID
 */
export function getMergePredecessorIds(
  mergeNodeId: string,
  edges: EdgeConfig[]
): string[] {
  return getPredecessorIds(mergeNodeId, edges)
}

/**
 * MERGE 节点处理器
 */
export const mergeNodeProcessor: NodeProcessor = {
  nodeType: 'MERGE',
  process: (node: NodeConfig, context: ExecutionContext) =>
    processMergeNode(node as MergeNodeConfig, context),
}

export { processMergeNode }
