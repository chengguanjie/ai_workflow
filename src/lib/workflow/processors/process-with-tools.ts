/**
 * 带工具调用的 AI 处理节点处理器
 * 
 * 扩展标准 PROCESS 节点，支持 AI Function Calling
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import type { ChatResponseWithTools, OpenAITool, ToolCall, ToolCallResult, ClaudeTool } from '@/lib/ai/function-calling/types'
import { replaceVariables, createContentPartsFromText } from '../utils'
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
  mapUIToolToExecutor,
  isNotificationTool,
  getNotificationPlatform,
  isToolImplemented,
  initializeDefaultTools,
} from '@/lib/ai/function-calling'

/**
 * UI 层工具配置类型（来自 tools-section.tsx）
 */
interface UIToolConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * 扩展的处理节点配置（支持工具）
 */
interface ProcessNodeWithToolsConfig extends ProcessNodeConfig {
  config: ProcessNodeConfig['config'] & {
    /** UI 配置的工具列表 */
    tools?: UIToolConfig[]
    /** 启用的工具列表（后端格式，会从 tools 自动转换） */
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

    // 确保工具已初始化
    initializeDefaultTools()

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

      // 3. 处理用户提示词中的变量引用 (支持多模态)
      const rawUserPrompt = processNode.config?.userPrompt || ''
      context.addLog?.('step', '正在解析用户提示词变量 (支持多模态)...', 'VARIABLE')

      const userContentParts = createContentPartsFromText(rawUserPrompt, context)
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

      // 4. 从知识库检索相关内容 (RAG)
      const knowledgeBaseId = processNode.config?.knowledgeBaseId
      if (knowledgeBaseId) {
        context.addLog?.('step', `正在检索知识库 (ID: ${knowledgeBaseId})...`, 'RAG', {
          query: userPromptText
        })
        try {
          const ragContext = await this.retrieveKnowledgeContext(
            knowledgeBaseId,
            userPromptText,
            processNode.config?.ragConfig,
            { apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl }
          )
          if (ragContext) {
            // ...
            systemPrompt = `${systemPrompt}\n\n## 知识库检索结果\n${ragContext}`
            // ...
          } else {
            context.addLog?.('warning', '知识库检索未找到相关内容', 'RAG')
          }
        } catch (err) {
          context.addLog?.('error', `知识库检索失败: ${err}`, 'RAG')
        }
      }

      // 5. 准备工具
      const enableToolCalling = processNode.config?.enableToolCalling ?? false
      
      // 从 UI 工具配置转换为后端工具名称
      const uiTools = processNode.config?.tools || []
      const enabledToolNames = this.convertUIToolsToExecutorNames(uiTools, context)
      
      // 如果没有指定工具但启用了工具调用，使用后端提供的 enabledTools 或全部工具
      const finalEnabledTools = enabledToolNames.length > 0 
        ? enabledToolNames 
        : processNode.config?.enabledTools

      const { openaiTools, claudeTools, toolDescriptions } = this.prepareToolsWithDescriptions(
        enableToolCalling,
        finalEnabledTools,
        aiConfig.provider
      )

      if (openaiTools.length > 0 || claudeTools.length > 0) {
        const toolListText = toolDescriptions.map(t => `- ${t.name}: ${t.description}`).join('\n')
        systemPrompt = `${systemPrompt}\n\n## 可用工具\n${toolListText}\n\n当需要执行上述操作时，请调用相应的工具。`
        context.addLog?.('info', `已启用 ${toolDescriptions.length} 个工具`, 'TOOLS', {
          tools: toolDescriptions.map(t => t.name)
        })
      }

      // 6. 构建消息
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[]; tool_calls?: ToolCall[] }> = []
      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt })
      }

      const isPureText = userContentParts.every(p => p.type === 'text')
      if (isPureText) {
        messages.push({ role: 'user', content: userPromptText })
      } else {
        messages.push({ role: 'user', content: userContentParts })
      }

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
   * 将 UI 工具配置转换为后端执行器名称
   */
  private convertUIToolsToExecutorNames(
    uiTools: UIToolConfig[],
    context: ExecutionContext
  ): string[] {
    const enabledExecutorNames: string[] = []
    
    for (const tool of uiTools) {
      if (!tool.enabled) continue
      
      const executorName = mapUIToolToExecutor(tool.type)
      
      // 检查工具是否已实现
      if (!isToolImplemented(tool.type)) {
        context.addLog?.('warning', `工具 "${tool.name}" (${tool.type}) 尚未实现，将被跳过`, 'TOOLS')
        continue
      }
      
      // 检查执行器是否存在
      const executor = toolRegistry.get(executorName)
      if (!executor) {
        context.addLog?.('warning', `未找到工具执行器: ${executorName} (来自 ${tool.type})`, 'TOOLS')
        continue
      }
      
      // 避免重复添加（通知工具共用一个执行器）
      if (!enabledExecutorNames.includes(executorName)) {
        enabledExecutorNames.push(executorName)
      }
    }
    
    return enabledExecutorNames
  }

  /**
   * 准备工具列表（带描述信息）
   */
  private prepareToolsWithDescriptions(
    enabled: boolean,
    enabledToolNames: string[] | undefined,
    provider: string
  ): { 
    openaiTools: OpenAITool[]
    claudeTools: ClaudeTool[]
    toolDescriptions: Array<{ name: string; description: string }>
  } {
    if (!enabled) {
      return { openaiTools: [], claudeTools: [], toolDescriptions: [] }
    }

    const definitions = enabledToolNames && enabledToolNames.length > 0
      ? enabledToolNames
        .map(name => toolRegistry.get(name)?.getDefinition())
        .filter((d): d is NonNullable<typeof d> => d !== undefined)
      : toolRegistry.getAllDefinitions()

    const toolDescriptions = definitions.map(d => ({
      name: d.name,
      description: d.description,
    }))

    const format = getProviderFormat(provider)

    if (format === 'claude') {
      return {
        openaiTools: [],
        claudeTools: definitions.map(toClaudeFormat),
        toolDescriptions,
      }
    }

    return {
      openaiTools: definitions.map(toOpenAIFormat),
      claudeTools: [],
      toolDescriptions,
    }
  }

  /**
   * 准备工具列表（保留旧方法以兼容）
   */
  private prepareTools(
    enabled: boolean,
    enabledToolNames: string[] | undefined,
    provider: string
  ): { openaiTools: OpenAITool[]; claudeTools: ClaudeTool[] } {
    const result = this.prepareToolsWithDescriptions(enabled, enabledToolNames, provider)
    return {
      openaiTools: result.openaiTools,
      claudeTools: result.claudeTools,
    }
  }

  /**
   * 执行带工具的 AI 调用
   */
  private async executeWithTools(
    aiConfig: AIConfigCache,
    model: string,
    initialMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[]; tool_calls?: ToolCall[] }>,
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
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[]; tool_calls?: ToolCall[] }> = [...initialMessages]
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
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
      const provider = aiConfig.provider.toLowerCase()
      const isClaudeProvider = provider.includes('anthropic') || provider.includes('claude')
      
      messages = [
        ...messages,
        {
          role: 'assistant' as const,
          content: response.content || '',
          tool_calls: response.toolCalls,
        },
      ]

      // 添加工具结果消息（使用正确的格式）
      if (isClaudeProvider) {
        // Claude 格式：使用 user 角色但包含 tool_result 内容
        const toolResultContent = functionCallingService.buildClaudeToolResultMessages(toolResults)
        messages.push({
          role: 'user' as const,
          content: toolResultContent as any,
        })
      } else {
        // OpenAI 格式：使用 tool 角色
        const toolResultMessages = functionCallingService.buildToolResultMessages(
          response.toolCalls,
          toolResults
        )
        for (const msg of toolResultMessages) {
          messages.push(msg as any)
        }
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
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[]; tool_calls?: ToolCall[] }>,
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

    let apiKey = await prisma.apiKey.findFirst({ where })

    // 如果指定了ID但没找到，尝试降级使用默认配置
    if (!apiKey && configId) {
      context.addLog?.('warning', `指定的 AI 配置 (ID: ${configId}) 未找到，尝试使用默认配置...`, 'CONFIG')
      apiKey = await prisma.apiKey.findFirst({
        where: { organizationId: context.organizationId, isDefault: true, isActive: true }
      })
    }

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
