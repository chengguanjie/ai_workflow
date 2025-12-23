/**
 * 带工具调用的 AI 处理节点处理器
 * 
 * 扩展标准 PROCESS 节点，支持 AI Function Calling
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import type { ChatResponseWithTools, OpenAITool, ToolCall, ToolCallResult, ClaudeTool } from '@/lib/ai/function-calling/types'
import { replaceVariables } from '../utils'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { getRelevantContext } from '@/lib/knowledge/search'
import { OpenAIProvider } from '@/lib/ai/providers/openai'
import { AnthropicProvider } from '@/lib/ai/providers/anthropic'
import {
  functionCallingService,
  toolRegistry,
  toOpenAIFormat,
  toClaudeFormat,
  getProviderFormat,
} from '@/lib/ai/function-calling'

/**
 * 扩展的处理节点配置（支持工具）
 */
interface ProcessNodeWithToolsConfig extends ProcessNodeConfig {
  config: ProcessNodeConfig['config'] & {
    /** 启用的工具列表 */
    enabledTools?: string[]
    /** 是否启用工具调用 */
    enableToolCalling?: boolean
    /** 工具调用模式 */
    toolChoice?: 'auto' | 'none' | 'required'
    /** 最大工具调用轮次 */
    maxToolCallRounds?: number
  }
}

export class ProcessWithToolsNodeProcessor implements NodeProcessor {
  nodeType = 'PROCESS_WITH_TOOLS'

  private openaiProvider = new OpenAIProvider()
  private anthropicProvider = new AnthropicProvider()

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const processNode = node as ProcessNodeWithToolsConfig

    try {
      // 1. 获取 AI 配置
      context.addLog?.('step', '正在加载 AI 服务商配置...', 'CONFIG')
      const aiConfig = await this.getAIConfig(
        processNode.config?.aiConfigId,
        context
      )

      if (!aiConfig) {
        throw new Error(
          processNode.config?.aiConfigId
            ? `找不到指定的 AI 服务商配置 (ID: ${processNode.config.aiConfigId})`
            : `未找到默认的 AI 服务商配置`
        )
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

      // 3. 处理用户提示词中的变量引用
      const rawUserPrompt = processNode.config?.userPrompt || ''
      context.addLog?.('step', '正在解析用户提示词变量...', 'VARIABLE')
      const userPrompt = replaceVariables(
        rawUserPrompt,
        context
      )

      if (!userPrompt.trim()) {
        throw new Error('用户提示词不能为空')
      }

      // 记录变量替换结果
      if (rawUserPrompt !== userPrompt) {
        context.addLog?.('info', '变量替换完成', 'VARIABLE', {
          original: rawUserPrompt,
          replaced: userPrompt
        })
      }

      // 4. 从知识库检索相关内容 (RAG)
      const knowledgeBaseId = processNode.config?.knowledgeBaseId
      if (knowledgeBaseId) {
        context.addLog?.('step', `正在检索知识库 (ID: ${knowledgeBaseId})...`, 'RAG', {
          query: userPrompt
        })
        try {
          const ragContext = await this.retrieveKnowledgeContext(
            knowledgeBaseId,
            userPrompt,
            processNode.config?.ragConfig,
            { apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl }
          )
          if (ragContext) {
            context.addLog?.('success', '知识库检索成功', 'RAG', {
              contextPreview: ragContext.slice(0, 200) + '...'
            })
            systemPrompt = `${systemPrompt}\n\n## 知识库检索结果\n${ragContext}`
          } else {
            context.addLog?.('warning', '知识库检索未找到相关内容', 'RAG')
          }
        } catch (err) {
          context.addLog?.('error', `知识库检索失败: ${err}`, 'RAG')
        }
      }

      // 5. 准备工具
      const enableToolCalling = processNode.config?.enableToolCalling ?? false
      context.addLog?.('step', `准备工具... (启用状态: ${enableToolCalling})`, 'TOOLS')
      const { openaiTools, claudeTools } = this.prepareTools(
        enableToolCalling,
        processNode.config?.enabledTools,
        aiConfig.provider
      )

      if (enableToolCalling) {
        const toolCount = openaiTools.length + claudeTools.length
        context.addLog?.('info', `已加载 ${toolCount} 个工具定义`, 'TOOLS', {
          tools: [...openaiTools, ...claudeTools].map(t => t.function?.name || t.name)
        })
      }

      // 如果启用了工具，添加工具使用说明到系统提示词
      if (openaiTools.length > 0 || claudeTools.length > 0) {
        systemPrompt = `${systemPrompt}\n\n你可以使用以下工具来完成任务。当需要执行某个操作时，请调用相应的工具。`
      }

      // 6. 构建消息
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt })
      }
      messages.push({ role: 'user', content: userPrompt })

      const model = processNode.config?.model || aiConfig.defaultModel
      const maxRounds = processNode.config?.maxToolCallRounds ?? 5 // default increased

      // 7. 执行带工具的 AI 调用
      context.addLog?.('step', '开始执行 AI 处理 (带工具支持)...', 'EXECUTE', {
        model,
        maxRounds,
        toolChoice: processNode.config?.toolChoice || 'auto'
      })

      const result = await this.executeWithTools(
        aiConfig,
        model,
        messages,
        openaiTools,
        claudeTools,
        processNode.config?.toolChoice || 'auto',
        processNode.config?.temperature ?? 0.7,
        processNode.config?.maxTokens ?? 2048,
        maxRounds,
        context
      )

      context.addLog?.('success', 'AI 处理完成', 'EXECUTE', {
        rounds: result.rounds,
        tokens: result.usage,
        toolCallsCount: result.toolCallHistory.length
      })

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          结果: result.content,
          model: result.model,
          toolCalls: result.toolCallHistory,
          toolCallRounds: result.rounds,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        tokenUsage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
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
   * 准备工具列表
   */
  private prepareTools(
    enabled: boolean,
    enabledToolNames: string[] | undefined,
    provider: string
  ): { openaiTools: OpenAITool[]; claudeTools: ClaudeTool[] } {
    if (!enabled) return { openaiTools: [], claudeTools: [] }

    const definitions = enabledToolNames && enabledToolNames.length > 0
      ? enabledToolNames
        .map(name => toolRegistry.get(name)?.getDefinition())
        .filter((d): d is NonNullable<typeof d> => d !== undefined)
      : toolRegistry.getAllDefinitions()

    const format = getProviderFormat(provider)

    if (format === 'claude') {
      return {
        openaiTools: [],
        claudeTools: definitions.map(toClaudeFormat),
      }
    }

    return {
      openaiTools: definitions.map(toOpenAIFormat),
      claudeTools: [],
    }
  }

  /**
   * 执行带工具的 AI 调用
   */
  private async executeWithTools(
    aiConfig: AIConfigCache,
    model: string,
    initialMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    openaiTools: OpenAITool[],
    claudeTools: ClaudeTool[],
    toolChoice: 'auto' | 'none' | 'required',
    temperature: number,
    maxTokens: number,
    maxRounds: number,
    context: ExecutionContext
  ): Promise<{
    content: string
    model: string
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    toolCallHistory: Array<{ call: ToolCall; result: ToolCallResult }>
    rounds: number
  }> {
    const toolCallHistory: Array<{ call: ToolCall; result: ToolCallResult }> = []
    let messages = [...initialMessages]
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let rounds = 0
    let lastResponse: ChatResponseWithTools | null = null

    const toolContext = {
      executionId: context.executionId,
      workflowId: context.workflowId,
      organizationId: context.organizationId,
      userId: context.userId,
      variables: context.globalVariables,
    }

    while (rounds < maxRounds) {
      rounds++
      context.addLog?.('info', `第 ${rounds} 轮: 等待 AI 响应...`, 'ROUND', { rounds, maxRounds })

      // 调用 AI
      const response = await this.callAIWithTools(
        aiConfig,
        model,
        messages,
        openaiTools,
        claudeTools,
        toolChoice,
        temperature,
        maxTokens
      )

      // 累计 token 使用
      totalUsage.promptTokens += response.usage.promptTokens
      totalUsage.completionTokens += response.usage.completionTokens
      totalUsage.totalTokens += response.usage.totalTokens

      lastResponse = response

      // 如果没有工具调用，返回结果
      if (!response.toolCalls || response.toolCalls.length === 0) {
        context.addLog?.('info', `第 ${rounds} 轮: AI 未发起工具调用，结束`, 'ROUND', {
          contentPreview: response.content?.slice(0, 100)
        })
        break
      }

      context.addLog?.('step', `第 ${rounds} 轮: AI 发起 ${response.toolCalls.length} 个工具调用`, 'TOOL_CALL', {
        toolCalls: response.toolCalls.map(c => ({
          name: c.function.name,
          args: c.function.arguments
        }))
      })

      // 执行工具调用
      const toolResults = await functionCallingService.executeToolCalls(
        response.toolCalls,
        toolContext
      )

      // 记录工具调用历史和日志
      for (let i = 0; i < response.toolCalls.length; i++) {
        const call = response.toolCalls[i]
        const result = toolResults[i]

        toolCallHistory.push({
          call,
          result: toolResults[i],
        })

        const logType = result.success ? 'success' : 'error'
        const logMsg = `工具 [${call.function.name}] 执行${result.success ? '成功' : '失败'}`
        context.addLog?.(logType, logMsg, 'TOOL_EXEC', {
          args: call.function.arguments,
          result: result.success ? result.result : result.error
        })
      }

      // 构建新的消息，包含工具调用结果
      messages = [
        ...messages,
        {
          role: 'assistant' as const,
          content: response.content || '',
          tool_calls: response.toolCalls, // 确保传递 tool_calls 以保持对话历史完整性
        },
      ]

      // 添加工具结果消息
      for (let i = 0; i < response.toolCalls.length; i++) {
        const result = toolResults[i]
        messages.push({
          role: 'user' as const,
          content: `工具 ${result.toolName} 执行结果: ${result.success
            ? JSON.stringify(result.result)
            : `错误: ${result.error}`
            }`,
        })
      }
    }

    return {
      content: lastResponse?.content || '',
      model: lastResponse?.model || model,
      usage: totalUsage,
      toolCallHistory,
      rounds,
    }
  }

  /**
   * 调用带工具的 AI
   */
  private async callAIWithTools(
    aiConfig: AIConfigCache,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    openaiTools: OpenAITool[],
    claudeTools: ClaudeTool[],
    toolChoice: 'auto' | 'none' | 'required',
    temperature: number,
    maxTokens: number
  ): Promise<ChatResponseWithTools> {
    const provider = aiConfig.provider.toLowerCase()

    if (provider.includes('anthropic') || provider.includes('claude')) {
      // Claude 的 tool_choice 格式不同
      let claudeToolChoice: { type: 'auto' | 'any' | 'tool'; name?: string } | undefined
      if (toolChoice === 'required') {
        claudeToolChoice = { type: 'any' }
      } else if (toolChoice === 'auto') {
        claudeToolChoice = { type: 'auto' }
      }
      // toolChoice === 'none' 时不传 tool_choice

      return this.anthropicProvider.chatWithTools(
        {
          model,
          messages,
          tools: claudeTools,
          tool_choice: claudeToolChoice,
          temperature,
          maxTokens,
        },
        aiConfig.apiKey,
        aiConfig.baseUrl
      )
    }

    // 默认使用 OpenAI 兼容格式
    return this.openaiProvider.chatWithTools(
      {
        model,
        messages,
        tools: openaiTools,
        tool_choice: toolChoice,
        temperature,
        maxTokens,
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )
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
      const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId, isActive: true },
      })

      if (!knowledgeBase) {
        console.warn(`知识库不存在或已禁用: ${knowledgeBaseId}`)
        return null
      }

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
   * 获取 AI 配置
   */
  private async getAIConfig(
    configId: string | undefined,
    context: ExecutionContext
  ): Promise<AIConfigCache | null> {
    if (configId && context.aiConfigs.has(configId)) {
      return context.aiConfigs.get(configId)!
    }

    const where = configId
      ? { id: configId, organizationId: context.organizationId, isActive: true }
      : { organizationId: context.organizationId, isDefault: true, isActive: true }

    const apiKey = await prisma.apiKey.findFirst({ where })

    if (!apiKey) {
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

    context.aiConfigs.set(apiKey.id, config)
    return config
  }
}

export const processWithToolsNodeProcessor = new ProcessWithToolsNodeProcessor()
