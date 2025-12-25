/**
 * 处理节点处理器（AI 处理）
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables, createContentPartsFromText } from '../utils'
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
      // 1. 获取 AI 配置
      context.addLog?.('step', '正在加载 AI 服务商配置...', 'CONFIG')
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
      context.addLog?.('success', `已加载 AI 配置: ${aiConfig.provider}`, 'CONFIG', {
        model: processNode.config?.model || aiConfig.defaultModel
      })

      // 2. 构建系统提示词
      let systemPrompt = processNode.config?.systemPrompt || ''
      context.addLog?.('step', '正在构建系统提示词...', 'PROMPT')

      // 添加静态知识库内容
      const knowledgeItems = processNode.config?.knowledgeItems || []
      if (knowledgeItems.length > 0) {
        context.addLog?.('info', `检测到 ${knowledgeItems.length} 个参考规则`, 'KNOWLEDGE')
        const knowledgeText = knowledgeItems
          .map((item) => `【${item.name}】\n${item.content}`)
          .join('\n\n')
        systemPrompt = `${systemPrompt}\n\n参考资料：\n${knowledgeText}`
      }

      // 添加导入文件内容 (用于调试验证)
      if (context.importedFiles && context.importedFiles.length > 0) {
        context.addLog?.('info', `处理 ${context.importedFiles.length} 个导入文件`, 'FILE_IMPORT')
        const filesText = context.importedFiles
          .map((file) => `【文件：${file.name}】\n${file.content}`)
          .join('\n\n')
        systemPrompt = `${systemPrompt}\n\n上传的文件资料：\n${filesText}`
      }

      // 3. 处理用户提示词中的变量引用 (支持多模态)
      const rawUserPrompt = processNode.config?.userPrompt || ''
      context.addLog?.('step', '正在解析用户提示词变量...', 'VARIABLE')

      // 使用 createContentPartsFromText 解析变量，支持多模态对象
      const userContentParts = createContentPartsFromText(rawUserPrompt, context)

      // 提取纯文本用于日志记录和 RAG 检索
      const userPromptText = userContentParts
        .map(p => p.type === 'text' ? p.text : `[${p.type}]`)
        .join('')

      if (!userPromptText.trim() && userContentParts.length === 0) {
        throw new Error('用户提示词不能为空')
      }

      // 记录变量替换结果
      if (rawUserPrompt !== userPromptText) {
        context.addLog?.('info', '变量替换完成', 'VARIABLE', {
          original: rawUserPrompt,
          replacedPreview: userPromptText.slice(0, 100) + '...',
          partsCount: userContentParts.length
        })
      }

      // 4. 从知识库检索相关内容 (RAG) - RAG 目前仅支持文本检索
      const knowledgeBaseId = processNode.config?.knowledgeBaseId
      if (knowledgeBaseId) {
        // ... (RAG 逻辑保持不变，使用 userPromptText 检索)
        context.addLog?.('step', `正在检索知识库 (ID: ${knowledgeBaseId})...`, 'RAG', {
          query: userPromptText,
          config: processNode.config?.ragConfig
        })

        try {
          const ragContext = await this.retrieveKnowledgeContext(
            knowledgeBaseId,
            userPromptText,
            processNode.config?.ragConfig,
            aiConfig ? { apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl } : undefined
          )

          if (ragContext) {
            // ...
            systemPrompt = `${systemPrompt}\n\n## 知识库检索结果\n${ragContext}`
          }
          // ...
        } catch (err) {
          // ...
        }
      }

      // 5. 构建消息并调用 AI
      // 类型定义需要根据 ai/types.ts 更新，支持 ContentPart[]
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[] }> = []

      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt })
      }

      // 如果只有纯文本，发送字符串；否则发送 ContentPart 数组
      const isPureText = userContentParts.every(p => p.type === 'text')
      if (isPureText) {
        messages.push({ role: 'user', content: userPromptText })
      } else {
        messages.push({ role: 'user', content: userContentParts })
      }

      const model = processNode.config?.model || aiConfig.defaultModel
      const temperature = processNode.config?.temperature ?? 0.7
      const maxTokens = processNode.config?.maxTokens ?? 2048

      context.addLog?.('step', '正在调用 AI 模型...', 'AI_CALL', {
        provider: aiConfig.provider,
        model,
        temperature,
        messageCount: messages.length
      })

      // 调用 AI
      const response = await aiService.chat(
        aiConfig.provider,
        {
          model,
          messages,
          temperature,
          maxTokens,
        },
        aiConfig.apiKey,
        aiConfig.baseUrl
      )

      context.addLog?.('success', 'AI 处理完成', 'AI_CALL', {
        tokens: response.usage,
        outputPreview: response.content.slice(0, 100) + '...'
      })

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

    let apiKey = await prisma.apiKey.findFirst({ where })

    // 如果指定了ID但没找到，尝试降级使用默认配置
    if (!apiKey && configId) {
      context.addLog?.('warning', `指定的 AI 配置 (ID: ${configId}) 未找到，尝试使用默认配置...`, 'CONFIG')
      apiKey = await prisma.apiKey.findFirst({
        where: { organizationId: context.organizationId, isDefault: true, isActive: true }
      })
    }

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
