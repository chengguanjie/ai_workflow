/**
 * 处理节点处理器（AI 处理）
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables } from '../utils'
import { aiService } from '@/lib/ai'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'

export class ProcessNodeProcessor implements NodeProcessor {
  nodeType = 'PROCESS'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const processNode = node as ProcessNodeConfig

    try {
      // 获取 AI 配置
      const aiConfig = await this.getAIConfig(
        processNode.config?.aiConfigId,
        context
      )

      if (!aiConfig) {
        throw new Error('未配置 AI 服务商')
      }

      // 构建系统提示词
      let systemPrompt = processNode.config?.systemPrompt || ''

      // 添加知识库内容
      const knowledgeItems = processNode.config?.knowledgeItems || []
      if (knowledgeItems.length > 0) {
        const knowledgeText = knowledgeItems
          .map((item) => `【${item.name}】\n${item.content}`)
          .join('\n\n')
        systemPrompt = `${systemPrompt}\n\n参考资料：\n${knowledgeText}`
      }

      // 处理用户提示词中的变量引用
      const userPrompt = replaceVariables(
        processNode.config?.userPrompt || '',
        context
      )

      if (!userPrompt.trim()) {
        throw new Error('用户提示词不能为空')
      }

      // 构建消息
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt })
      }
      messages.push({ role: 'user', content: userPrompt })

      // 调用 AI
      const model = processNode.config?.model || aiConfig.defaultModel
      const response = await aiService.chat(
        aiConfig.provider,
        {
          model,
          messages,
          temperature: processNode.config?.temperature ?? 0.7,
          maxTokens: processNode.config?.maxTokens ?? 2048,
        },
        aiConfig.apiKey,
        aiConfig.baseUrl
      )

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          结果: response.content,
          model: response.model,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        },
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : 'AI 处理失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 获取 AI 配置（带缓存）
   */
  private async getAIConfig(
    configId: string | undefined,
    context: ExecutionContext
  ): Promise<AIConfigCache | null> {
    // 查找已缓存的配置
    if (configId && context.aiConfigs.has(configId)) {
      return context.aiConfigs.get(configId)!
    }

    // 从数据库加载
    const where = configId
      ? { id: configId, organizationId: context.organizationId, isActive: true }
      : { organizationId: context.organizationId, isDefault: true, isActive: true }

    const apiKey = await prisma.apiKey.findFirst({ where })

    if (!apiKey) {
      return null
    }

    const config: AIConfigCache = {
      id: apiKey.id,
      provider: apiKey.provider,
      baseUrl: apiKey.baseUrl,
      apiKey: decryptApiKey(apiKey.keyEncrypted),
      defaultModel: apiKey.defaultModel,
    }

    // 缓存配置
    context.aiConfigs.set(apiKey.id, config)

    return config
  }
}

export const processNodeProcessor = new ProcessNodeProcessor()
