/**
 * 逻辑节点路由辅助工具
 *
 * 根据 LOGIC 节点输出动态激活边，实现条件分支等逻辑控制。
 */

import type { EdgeConfig, NodeConfig } from '@/types/workflow'
import type { NodeOutput } from '../types'

export interface LogicRoutingContext {
  nodes: NodeConfig[]
  edges: EdgeConfig[]
  nodeOutputs: Map<string, NodeOutput>
}

/**
 * 根据逻辑节点输出和工作流边，计算应该被跳过的节点集合。
 * 
 * 工作原理：
 * 1. 遍历所有 LOGIC 类型节点
 * 2. 根据节点输出中的 matchedTargetNodeId 确定激活的目标节点
 * 3. 将未被激活的分支标记为跳过
 */
export function computeSkippedNodes(
  ctx: LogicRoutingContext
): Set<string> {
  const skippedNodes = new Set<string>()

  for (const node of ctx.nodes) {
    if (node.type !== 'LOGIC') continue

    const output = ctx.nodeOutputs.get(node.id)
    if (!output || output.status !== 'success') continue

    const data = output.data as Record<string, unknown>
    const mode = data.mode as string

    if (mode === 'condition' || mode === 'switch') {
      const matchedTargetNodeId = data.matchedTargetNodeId as string | null

      const outgoingEdges = ctx.edges.filter(e => e.source === node.id)
      
      for (const edge of outgoingEdges) {
        if (matchedTargetNodeId && edge.target !== matchedTargetNodeId) {
          const unreachableNodes = getReachableNodesExclusive(
            edge.target,
            ctx.edges,
            matchedTargetNodeId
          )
          for (const nodeId of unreachableNodes) {
            skippedNodes.add(nodeId)
          }
        }
      }
    }
  }

  return skippedNodes
}

/**
 * 获取从起始节点可达的所有节点（排除某些节点及其后续）
 */
function getReachableNodesExclusive(
  startNodeId: string,
  edges: EdgeConfig[],
  excludeNodeId: string
): Set<string> {
  const reachable = new Set<string>()
  const queue = [startNodeId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (reachable.has(nodeId) || nodeId === excludeNodeId) continue
    reachable.add(nodeId)

    const outgoingEdges = edges.filter(e => e.source === nodeId)
    for (const edge of outgoingEdges) {
      if (!reachable.has(edge.target) && edge.target !== excludeNodeId) {
        queue.push(edge.target)
      }
    }
  }

  return reachable
}

/**
 * 检查节点是否应该被执行（基于 LOGIC 节点路由结果）
 */
export function shouldExecuteNode(
  nodeId: string,
  ctx: LogicRoutingContext
): boolean {
  for (const node of ctx.nodes) {
    if (node.type !== 'LOGIC') continue

    const output = ctx.nodeOutputs.get(node.id)
    if (!output || output.status !== 'success') continue

    const data = output.data as Record<string, unknown>
    const mode = data.mode as string

    if (mode === 'condition' || mode === 'switch') {
      const matchedTargetNodeId = data.matchedTargetNodeId as string | null
      
      const outgoingEdges = ctx.edges.filter(e => e.source === node.id)
      
      const isDirectTarget = outgoingEdges.some(e => e.target === nodeId)
      
      if (isDirectTarget) {
        if (matchedTargetNodeId && matchedTargetNodeId !== nodeId) {
          return false
        }
      }
    }
  }

  return true
}

/**
 * 根据逻辑节点输出计算活跃的边
 */
export function computeActiveEdges(
  workflowEdges: EdgeConfig[],
  ctx: LogicRoutingContext
): EdgeConfig[] {
  const activeEdges: EdgeConfig[] = []

  for (const edge of workflowEdges) {
    const sourceNode = ctx.nodes.find(n => n.id === edge.source)
    
    if (!sourceNode || sourceNode.type !== 'LOGIC') {
      activeEdges.push(edge)
      continue
    }

    const output = ctx.nodeOutputs.get(edge.source)
    if (!output || output.status !== 'success') {
      activeEdges.push(edge)
      continue
    }

    const data = output.data as Record<string, unknown>
    const mode = data.mode as string

    if (mode === 'split' || mode === 'merge') {
      activeEdges.push(edge)
    } else if (mode === 'condition' || mode === 'switch') {
      const matchedTargetNodeId = data.matchedTargetNodeId as string | null
      
      if (!matchedTargetNodeId || edge.target === matchedTargetNodeId) {
        activeEdges.push(edge)
      }
    } else {
      activeEdges.push(edge)
    }
  }

  return activeEdges
}
