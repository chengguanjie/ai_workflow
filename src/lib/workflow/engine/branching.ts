/**
 * 条件分支处理模块
 * 
 * 负责处理条件节点的分支逻辑，决定哪些节点应该被跳过
 */

import type { NodeConfig, WorkflowConfig } from '@/types/workflow'
import type { NodeOutput } from '../types'
import { getConditionBranchNodes } from '../utils'

/**
 * 处理条件分支
 * 根据条件节点的执行结果，标记需要跳过的分支节点
 */
export function handleConditionBranching(
        conditionNode: NodeConfig,
        result: NodeOutput,
        edges: WorkflowConfig['edges'],
        skippedNodes: Set<string>
): void {
        const conditionResult = result.data?.result === true || result.data?.conditionsMet === true

        // 获取要跳过的分支
        const branchToSkip = conditionResult ? 'false' : 'true'
        const nodesToSkip = getConditionBranchNodes(
                conditionNode.id,
                edges,
                branchToSkip as 'true' | 'false'
        )

        // 递归标记所有需要跳过的节点
        markNodesForSkipping(nodesToSkip, conditionNode.id, edges, skippedNodes)
}

/**
 * 递归标记需要跳过的节点
 */
export function markNodesForSkipping(
        nodeIds: string[],
        conditionNodeId: string,
        edges: WorkflowConfig['edges'],
        skippedNodes: Set<string>
): void {
        const queue = [...nodeIds]
        const visited = new Set<string>()

        while (queue.length > 0) {
                const nodeId = queue.shift()!
                if (visited.has(nodeId)) continue
                visited.add(nodeId)

                // 检查这个节点是否只有来自被跳过分支的入边
                // 如果有其他有效的入边，则不应该跳过
                const incomingEdges = edges.filter(e => e.target === nodeId)
                const hasValidIncomingEdge = incomingEdges.some(e => {
                        if (e.source === conditionNodeId) {
                                return false // 来自条件节点的边
                        }
                        return !skippedNodes.has(e.source) // 来自非跳过节点的边
                })

                if (!hasValidIncomingEdge) {
                        skippedNodes.add(nodeId)

                        // 继续标记下游节点
                        const outgoingEdges = edges.filter(e => e.source === nodeId)
                        for (const edge of outgoingEdges) {
                                if (!visited.has(edge.target)) {
                                        queue.push(edge.target)
                                }
                        }
                }
        }
}

/**
 * 标记依赖于失败节点的下游节点为跳过
 */
export function markDependentNodesForSkipping(
        failedNodeId: string,
        nodes: NodeConfig[],
        edges: WorkflowConfig['edges'],
        failedNodes: Set<string>,
        skippedNodes: Set<string>,
        isMergeNode: (node: NodeConfig) => boolean,
        getPredecessorIds: (nodeId: string, edges: WorkflowConfig['edges']) => string[]
): void {
        const queue = [failedNodeId]
        const visited = new Set<string>()

        while (queue.length > 0) {
                const nodeId = queue.shift()!
                if (visited.has(nodeId)) continue
                visited.add(nodeId)

                // 获取所有下游节点
                const successors = edges
                        .filter(e => e.source === nodeId)
                        .map(e => e.target)

                for (const successorId of successors) {
                        const successorNode = nodes.find(n => n.id === successorId)

                        // MERGE 节点不跳过，它可以处理部分分支失败的情况
                        if (successorNode && isMergeNode(successorNode)) {
                                continue
                        }

                        // 检查该节点是否还有其他有效的前置节点
                        const predecessorIds = getPredecessorIds(successorId, edges)
                        const hasValidPredecessor = predecessorIds.some(
                                id => !failedNodes.has(id) && !skippedNodes.has(id) && id !== failedNodeId
                        )

                        if (!hasValidPredecessor) {
                                skippedNodes.add(successorId)
                                queue.push(successorId)
                        }
                }
        }
}
