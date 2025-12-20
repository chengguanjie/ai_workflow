/**
 * GROUP 节点处理器
 * 
 * GROUP 节点是一个组织性节点，用于将多个节点分组管理。
 * 它本身不执行任何逻辑处理，只是将上游输入透传到输出。
 */

import type { NodeConfig, GroupNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'

export class GroupNodeProcessor implements NodeProcessor {
  nodeType = 'GROUP'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const groupNode = node as GroupNodeConfig

    try {
      const childNodeIds = groupNode.config?.childNodeIds || []
      
      const childOutputs: Record<string, unknown> = {}
      for (const childId of childNodeIds) {
        const childOutput = context.nodeOutputs.get(childId)
        if (childOutput && childOutput.status === 'success') {
          childOutputs[childOutput.nodeName] = childOutput.data
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          childNodeIds,
          childCount: childNodeIds.length,
          label: groupNode.config?.label || node.name,
          childOutputs,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '处理分组节点失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }
}

export const groupNodeProcessor = new GroupNodeProcessor()
