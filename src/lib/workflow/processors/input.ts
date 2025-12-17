/**
 * 输入节点处理器
 */

import type { NodeConfig, InputNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'

export class InputNodeProcessor implements NodeProcessor {
  nodeType = 'INPUT'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const inputNode = node as InputNodeConfig

    try {
      const fields = inputNode.config?.fields || []
      const data: Record<string, unknown> = {}

      // 将输入字段转换为输出数据
      for (const field of fields) {
        data[field.name] = field.value
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data,
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
        error: error instanceof Error ? error.message : '处理输入节点失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }
}

export const inputNodeProcessor = new InputNodeProcessor()
