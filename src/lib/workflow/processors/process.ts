/**
 * 处理节点处理器（AI 处理）
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables } from '../utils'
import { aiService } from '@/lib/ai'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { getRelevantContext } from '@/lib/knowledge/search'

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
        // 提供更详细的错误信息
        if (processNode.config?.aiConfigId) {
          throw new Error(
            `找不到指定的 AI 服务商配置 (ID: ${processNode.config.aiConfigId})。` +
            `请检查配置是否已被删除或禁用，或者重新选择一个有效的配置。`
          )
        } else {
          throw new Error(
            `未找到默认的 AI 服务商配置。请在"设置 → AI 配置"中添加并设置默认的 AI 服务商。`
          )
        }
      }

      // 构建系统提示词
      let systemPrompt = processNode.config?.systemPrompt || ''

      // 添加静态知识库内容
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

      // 从知识库检索相关内容 (RAG)
      const knowledgeBaseId = processNode.config?.knowledgeBaseId
      if (knowledgeBaseId) {
        const ragContext = await this.retrieveKnowledgeContext(
          knowledgeBaseId,
          userPrompt,
          processNode.config?.ragConfig,
          aiConfig ? { apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl } : undefined
        )
        if (ragContext) {
          systemPrompt = `${systemPrompt}\n\n## 知识库检索结果\n${ragContext}`
        }
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
   * 从知识库检索相关上下文
   */
  private async retrieveKnowledgeContext(
    knowledgeBaseId: string,
    query: string,
    ragConfig?: { topK?: number; threshold?: number; maxContextTokens?: number },
    apiConfig?: { apiKey?: string; baseUrl?: string }
  ): Promise<string | null> {
    try {
      // 获取知识库配置
      const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId, isActive: true },
      })

      if (!knowledgeBase) {
        console.warn(`知识库不存在或已禁用: ${knowledgeBaseId}`)
        return null
      }

      // 检索相关内容
      const context = await getRelevantContext({
        knowledgeBaseId,
        query,
        topK: ragConfig?.topK ?? 5,
        threshold: ragConfig?.threshold ?? 0.7,
        embeddingModel: knowledgeBase.embeddingModel,
        embeddingProvider: knowledgeBase.embeddingProvider,
        maxTokens: ragConfig?.maxContextTokens ?? 4000,
        apiKey: apiConfig?.apiKey,
        baseUrl: apiConfig?.baseUrl,
      })

      return context || null
    } catch (error) {
      console.error('知识库检索失败:', error)
      return null
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
      // 添加详细的错误日志，帮助诊断问题
      if (configId) {
        // 尝试查找配置，忽略组织和激活状态，看看是否存在
        const anyConfig = await prisma.apiKey.findFirst({
          where: { id: configId },
          select: {
            id: true,
            organizationId: true,
            isActive: true,
            isDefault: true,
            name: true,
          },
        })

        if (anyConfig) {
          console.error('[ProcessNode] AI 配置查找失败，配置详情:', {
            configId,
            configExists: true,
            configOrganizationId: anyConfig.organizationId,
            expectedOrganizationId: context.organizationId,
            isActive: anyConfig.isActive,
            isDefault: anyConfig.isDefault,
            configName: anyConfig.name,
          })
        } else {
          console.error('[ProcessNode] AI 配置不存在:', configId)
        }
      } else {
        console.error('[ProcessNode] 未找到默认 AI 配置，organizationId:', context.organizationId)
      }
      return null
    }

    const decryptedKey = safeDecryptApiKey(apiKey.keyEncrypted)

    const config: AIConfigCache = {
      id: apiKey.id,
      provider: apiKey.provider,
      baseUrl: apiKey.baseUrl,
      apiKey: decryptedKey,
      defaultModel: apiKey.defaultModel,
    }

    // 缓存配置
    context.aiConfigs.set(apiKey.id, config)

    return config
  }
}

export const processNodeProcessor = new ProcessNodeProcessor()
