/**
 * GROUP 节点处理器
 * 
 * GROUP 节点是一个视觉分组功能，用于在UI中组织节点。
 * 在执行时，它会透传其最后一个子节点的输出。
 */

import type { NodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput, NodeProcessor } from '../types'

interface GroupConfig {
  childNodeIds?: string[]
  [key: string]: unknown
}

export const groupNodeProcessor: NodeProcessor = {
  nodeType: 'GROUP',
  
  async process(node: NodeConfig, context: ExecutionContext): Promise<NodeOutput> {
    const startTime = Date.now()
    const config = node.config as GroupConfig | undefined
    
    // 获取子节点ID列表
    const childNodeIds = config?.childNodeIds || []
    
    if (childNodeIds.length === 0) {
      // 没有子节点，返回空输出
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {},
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }
    }
    
    // 获取最后一个子节点的输出
    const lastChildId = childNodeIds[childNodeIds.length - 1]
    const lastChildOutput = context.nodeOutputs.get(lastChildId)
    
    if (!lastChildOutput) {
      // 最后一个子节点还没有执行，返回等待状态
      // 这种情况不应该发生，因为执行顺序应该保证子节点先执行
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'skipped',
        data: {},
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration: Date.now() - startTime,
        error: `子节点 ${lastChildId} 尚未执行`,
      }
    }
    
    // 如果最后一个子节点失败，GROUP 节点也失败
    if (lastChildOutput.status === 'error') {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: lastChildOutput.data || {},
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration: Date.now() - startTime,
        error: lastChildOutput.error,
      }
    }
    
    // 透传最后一个子节点的输出
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'success',
      data: lastChildOutput.data || {},
      startedAt: new Date(startTime),
      completedAt: new Date(),
      duration: Date.now() - startTime,
    }
  },
}
