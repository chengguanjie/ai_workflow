/**
 * 触发器节点处理器
 *
 * 触发器节点是工作流的起始点，负责：
 * 1. 接收触发输入数据
 * 2. 合并默认输入模板
 * 3. 将数据传递给下游节点
 */

import type { NodeConfig, TriggerNodeConfig, TriggerNodeConfigData } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'

export class TriggerNodeProcessor implements NodeProcessor {
  nodeType = 'TRIGGER'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const triggerNode = node as TriggerNodeConfig
    const config = triggerNode.config as TriggerNodeConfigData | undefined

    try {
      // 获取触发器配置
      const triggerType = config?.triggerType || 'MANUAL'
      const inputTemplate = config?.inputTemplate || {}

      // 获取触发时传入的数据（存储在 globalVariables 中）
      const triggerInput = (context.globalVariables?.triggerInput as Record<string, unknown>) || {}

      // 合并输入模板和触发输入（触发输入优先）
      const mergedData: Record<string, unknown> = {
        ...inputTemplate,
        ...triggerInput,
      }

      // 构建输出数据
      const data: Record<string, unknown> = {
        // 触发器元数据
        _trigger: {
          type: triggerType,
          timestamp: startedAt.toISOString(),
          enabled: config?.enabled ?? true,
          webhookPath: config?.webhookPath,
          cronExpression: config?.cronExpression,
          timezone: config?.timezone,
        },
        // 触发器输入数据（可被下游节点引用）
        ...mergedData,
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
        error: error instanceof Error ? error.message : '处理触发器节点失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }
}

export const triggerNodeProcessor = new TriggerNodeProcessor()
