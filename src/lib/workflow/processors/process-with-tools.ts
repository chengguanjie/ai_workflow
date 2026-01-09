/**
 * 带工具调用的 AI 处理节点处理器
 * 
 * 扩展标准 PROCESS 节点，支持 AI Function Calling
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { OutputType } from '@/lib/workflow/debug-panel/types'
import type { ContentPart } from '@/lib/ai/types'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import type {
  ChatResponseWithTools,
  OpenAITool,
  ToolCall,
  ToolCallResult,
  ClaudeTool,
  ToolExecutionContext,
} from '@/lib/ai/function-calling/types'
import { applyInputBindingsToContext, createContentPartsFromText, replaceVariablesInConfig } from '../utils'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { getRelevantContext } from '@/lib/knowledge/search'
import { OpenAIProvider } from '@/lib/ai/providers/openai'
import { AnthropicProvider } from '@/lib/ai/providers/anthropic'
import { ensureImportedFilesFromContext } from '../imported-files'
import { buildRagQuery } from '../rag'
import {
  formatNetworkError,
  getNetworkErrorHint,
  isFormattedNetworkError,
  isRetryableNetworkError,
} from '@/lib/http/fetch-with-timeout'
import {
  functionCallingService,
  toolRegistry,
  toOpenAIFormat,
  toClaudeFormat,
  mapUIToolToExecutor,
  isToolImplemented,
  initializeDefaultTools,
} from '@/lib/ai/function-calling'

/**
 * 基础聊天消息类型
 */
type BaseChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }

/**
 * 工具结果消息类型 (OpenAI 格式)
 */
type ToolResultMessage = { role: 'tool'; tool_call_id: string; content: string }

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

  private extractJsonFromText(text: string): string | null {
    const trimmed = text.trim()
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenceMatch?.[1]) {
      const candidate = fenceMatch[1].trim()
      if (candidate.startsWith('{') || candidate.startsWith('[')) return candidate
    }

    const startIndex = (() => {
      const obj = trimmed.indexOf('{')
      const arr = trimmed.indexOf('[')
      if (obj === -1) return arr
      if (arr === -1) return obj
      return Math.min(obj, arr)
    })()
    if (startIndex === -1) return null

    const openChar = trimmed[startIndex]
    const closeChar = openChar === '{' ? '}' : ']'

    let depth = 0
    let inString = false
    let escape = false

    for (let i = startIndex; i < trimmed.length; i++) {
      const ch = trimmed[i]

      if (inString) {
        if (escape) {
          escape = false
          continue
        }
        if (ch === '\\') {
          escape = true
          continue
        }
        if (ch === '"') {
          inString = false
        }
        continue
      }

      if (ch === '"') {
        inString = true
        continue
      }

      if (ch === openChar) depth++
      if (ch === closeChar) depth--

      if (depth === 0) {
        return trimmed.slice(startIndex, i + 1)
      }
    }

    return null
  }

  private normalizeOutputContent(content: string, expectedOutputType?: unknown): string {
    const expected = typeof expectedOutputType === 'string' ? expectedOutputType : undefined
    if (!expected) return content

    if (expected === 'json') {
      const extracted = this.extractJsonFromText(content)
      if (!extracted) return content
      try {
        const parsed = JSON.parse(extracted)
        return JSON.stringify(parsed)
      } catch {
        return content
      }
    }

    if (expected === 'html') {
      const trimmed = content.trim()
      const fenceMatch = trimmed.match(/```(?:html)?\s*([\s\S]*?)\s*```/i)
      if (fenceMatch?.[1]) return fenceMatch[1].trim()
      const firstTag = trimmed.indexOf('<')
      if (firstTag !== -1) return trimmed.slice(firstTag)
      return content
    }

    return content
  }

  private normalizeMaxTokens(configMaxTokens: unknown): number | undefined {
    if (typeof configMaxTokens !== 'number') return undefined
    // 当值 <= 0（包括 -1 表示无限制）时，返回 undefined 让 API 使用模型默认最大值
    if (!Number.isFinite(configMaxTokens) || configMaxTokens <= 0) return undefined
    const normalized = Math.floor(configMaxTokens)
    // 过大的 maxTokens 往往会触发上游网关 400（或导致极不稳定的长输出），改为让模型使用默认值。
    // 这里使用保守上限，避免不同 Provider 的 max_tokens 上限差异导致报错。
    if (normalized > 16_384) return undefined
    return normalized
  }

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const processNode = node as ProcessNodeWithToolsConfig

    let provider: string | undefined
    let model: string | undefined
    let temperature: number | undefined
    let maxTokens: number | undefined
    let providerBaseUrl: string | null = null
    let systemPrompt = ''
    let userPromptText = ''
    let toolChoice: 'auto' | 'none' | 'required' | undefined
    let maxRounds: number | undefined

    // 确保工具已初始化
    initializeDefaultTools()

    try {
      // 1. 获取 AI 配置
      context.addLog?.('step', '正在加载 AI 服务商配置...', 'CONFIG')
      const aiConfig = await this.getAIConfig(
        processNode.config?.aiConfigId,
        context
      )
      provider = aiConfig?.provider
      providerBaseUrl = aiConfig?.baseUrl || null

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
      systemPrompt = processNode.config?.systemPrompt || ''
      context.addLog?.('step', '正在构建系统提示词...', 'PROMPT')

      await ensureImportedFilesFromContext(context)

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

      // 输入绑定：注入 inputs.*，供提示词使用 {{inputs.xxx}}
      applyInputBindingsToContext(processNode.config?.inputBindings, context)

      const userContentParts = createContentPartsFromText(rawUserPrompt, context)
      userPromptText = userContentParts
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
        const ragQuery = buildRagQuery({ userPromptText, importedFiles: context.importedFiles, maxChars: 2000 })
        if (!ragQuery.trim()) {
          context.addLog?.('warning', '知识库检索已跳过：缺少可用于检索的文本（提示词/导入文件为空）', 'RAG')
        } else {
          context.addLog?.('step', `正在检索知识库 (ID: ${knowledgeBaseId})...`, 'RAG', {
            query: ragQuery,
            config: processNode.config?.ragConfig
          })
          try {
            const ragContext = await this.retrieveKnowledgeContext(
              knowledgeBaseId,
              ragQuery,
              processNode.config?.ragConfig,
              { apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl, provider: aiConfig.provider }
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
      }

      // 5. 准备工具
      // 从 UI 工具配置转换为后端工具名称
      const uiTools = processNode.config?.tools || []
      const enabledToolNames = this.convertUIToolsToExecutorNames(uiTools, context)

      // 判断是否启用工具调用：显式设置 enableToolCalling 或有已启用的 UI 工具
      const hasEnabledUITools = uiTools.some(tool => tool.enabled)
      const enableToolCalling = processNode.config?.enableToolCalling ?? hasEnabledUITools

      // 如果没有指定工具但启用了工具调用，使用后端提供的 enabledTools 或全部工具
      const finalEnabledTools = enabledToolNames.length > 0
        ? enabledToolNames
        : processNode.config?.enabledTools

      model = processNode.config?.model || aiConfig.defaultModel
      if (enableToolCalling && typeof model === 'string') {
        const lower = model.toLowerCase()
        if (lower.startsWith('anthropic/') && lower.includes(':thinking')) {
          const before = model
          model = model.replace(/:thinking/gi, '')
          context.addLog?.('warning', '工具调用下禁用 thinking 模型后缀（避免上游 400）', 'MODEL_CONFIG', {
            before,
            after: model,
          })
        }
      }
      const { openaiTools, claudeTools, toolDescriptions } = this.prepareToolsWithDescriptions(
        enableToolCalling,
        finalEnabledTools,
        aiConfig.provider,
        model
      )

      if (openaiTools.length > 0 || claudeTools.length > 0) {
        const toolListText = toolDescriptions.map(t => `- ${t.name}: ${t.description}`).join('\n')

        // 替换工具配置中的变量引用（如 {{用户输入.原文链接}} -> 实际值）
        const resolvedUITools = uiTools.map(tool => ({
          ...tool,
          config: tool.config ? replaceVariablesInConfig(tool.config, context) : tool.config
        }))

        // 生成用户预配置的工具参数说明（使用替换后的配置）
        const toolConfigText = this.buildToolConfigInstructions(resolvedUITools)

        // 增强的工具调用提示词
        systemPrompt = `${systemPrompt}

## 可用工具
${toolListText}${toolConfigText}

## 重要指令
你必须使用上述工具来完成任务。请直接根据已有信息调用工具执行任务，不要询问用户补充信息。
- 如果是图片生成任务，立即调用 image_gen_ai 工具，根据内容生成合适的 prompt
- 如果是视频生成任务，立即调用 video_gen_ai 工具
- 如果是音频生成任务，立即调用 audio_gen_ai 工具
- 即使信息看起来不完整，也应该基于现有内容创造性地生成合适的参数`
        context.addLog?.('info', `已启用 ${toolDescriptions.length} 个工具`, 'TOOLS', {
          tools: toolDescriptions.map(t => t.name)
        })
      }

      // 6. 构建消息
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }> = []
      if (systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt })
      }

      // 如果期望输出为 JSON，则在 system prompt 里追加强约束，避免模型输出解释性文字
      // 说明：这里不改变用户的原始 prompt（便于调试/复用），只在系统层做格式约束。
      if (processNode.config?.expectedOutputType === 'json') {
        const jsonConstraint =
          '\n\n## 输出格式要求（必须严格遵守）\n' +
          '- 只输出【一个】JSON 对象（以 { 开头，以 } 结尾）。\n' +
          '- 不要输出 Markdown、不要 ``` 代码块、不要解释文字、不要前后缀。\n' +
          '- 字段必须齐全，不允许省略。\n' +
          '- 字符串内的双引号必须正确转义，确保 JSON.parse 可解析。\n'
        // 追加到最后，覆盖上游更弱的指令
        const lastSystem = messages.find(m => m.role === 'system')
        if (lastSystem && typeof lastSystem.content === 'string') {
          lastSystem.content = lastSystem.content + jsonConstraint
        } else {
          messages.push({ role: 'system', content: jsonConstraint })
        }
      }

      const isPureText = userContentParts.every(p => p.type === 'text')
      if (isPureText) {
        messages.push({ role: 'user', content: userPromptText })
      } else {
        messages.push({ role: 'user', content: userContentParts })
      }

      maxRounds = processNode.config?.maxToolCallRounds ?? 5 // default increased

      // 如果启用了生成类工具（图片/视频/音频），自动使用 required 模式确保工具被调用
      const generativeTools = ['image_gen_ai', 'video_gen_ai', 'audio_gen_ai']
      const hasGenerativeTool = finalEnabledTools?.some(t => generativeTools.includes(t)) ?? false
      const effectiveToolChoice = hasGenerativeTool 
        ? 'required' as const
        : (processNode.config?.toolChoice || 'auto') as 'auto' | 'none' | 'required'
      toolChoice = effectiveToolChoice

      // 7. 执行带工具的 AI 调用
      context.addLog?.('step', '开始执行 AI 处理 (带工具支持)...', 'EXECUTE', {
        model,
        maxRounds,
        toolChoice: effectiveToolChoice
      })

      const useClaudeAPI = this.isClaudeFormat(aiConfig.provider, model)
      const isProxy = this.isProxyProvider(aiConfig.provider.toLowerCase())

      context.addLog?.('info', '准备调用 AI', 'AI_CALL', {
        provider: aiConfig.provider,
        model,
        isProxyService: isProxy,
        useClaudeAPI,
        apiFormat: useClaudeAPI ? 'Anthropic (/v1/messages)' : 'OpenAI (/v1/chat/completions)',
        hasOpenAITools: openaiTools.length > 0,
        hasClaudeTools: claudeTools.length > 0,
        toolCount: openaiTools.length + claudeTools.length,
        enableToolCalling,
        baseUrl: aiConfig.baseUrl ? `${aiConfig.baseUrl.substring(0, 30)}...` : 'default',
      })

      // 如果用户没有指定 maxTokens 或设置为 -1（无限制），传递 undefined 让 API 使用模型默认最大值
      const configMaxTokens = processNode.config?.maxTokens
      maxTokens = this.normalizeMaxTokens(configMaxTokens)
      if (typeof configMaxTokens === 'number' && configMaxTokens > 0 && maxTokens === undefined) {
        context.addLog?.('warning', `maxTokens=${configMaxTokens} 过大，已忽略并使用模型默认值`, 'MODEL_CONFIG', {
          requestedMaxTokens: configMaxTokens,
          effectiveMaxTokens: null,
        })
      }

      temperature = processNode.config?.temperature ?? 0.7
      const result = await this.executeWithTools(
        aiConfig,
        model,
        messages,
        openaiTools,
        claudeTools,
        effectiveToolChoice,
        temperature,
        maxTokens,
        maxRounds,
        Boolean(processNode.config?.expectedOutputType),
        context
      )

      context.addLog?.('success', 'AI 处理完成', 'EXECUTE', {
        rounds: result.rounds,
        tokens: result.usage,
        toolCallsCount: result.toolCallHistory.length
      })

      let normalizedContent = this.normalizeOutputContent(
        result.content,
        processNode.config?.expectedOutputType
      )

      // JSON 输出：尽最大努力确保下游拿到的是“严格 JSON 字符串”
      // 策略：
      // 1) normalizeOutputContent 已尝试从围栏/文本中提取 JSON 并 stringify
      // 2) 若仍无法 JSON.parse，则尝试 AI 修复
      // 3) 若修复后仍不合法，直接返回节点错误（避免下游拿到被二次包装的字符串）
      if (processNode.config?.expectedOutputType === 'json') {
        normalizedContent = await this.repairInvalidJsonOutputIfNeeded(
          aiConfig,
          model,
          result.content,
          temperature,
          maxTokens,
          normalizedContent,
          context
        )

        const extracted = this.extractJsonFromText(normalizedContent) || normalizedContent
        try {
          const parsed = JSON.parse(extracted)
          normalizedContent = JSON.stringify(parsed)
        } catch {
          // 降级：避免整条工作流因 JSON 轻微不合规而中断；下游一般使用 {{节点名}} 直接消费文本。
          context.addLog?.('warning', 'JSON 输出仍无法严格解析，已降级为文本输出继续执行', 'AI_CALL')
          normalizedContent = extracted
        }
      }

      // 基础输出数据：始终保留文本结果与工具调用历史
      const data: Record<string, unknown> = {
        结果: normalizedContent,
        model: result.model,
        toolCalls: result.toolCallHistory,
        toolCallRounds: result.rounds,
        _meta: {
          finishReason: result.finishReason,
          segments: result.segments ?? 1,
          wasAutoContinued: (result.segments ?? 1) > 1,
          requestedMaxTokens: configMaxTokens ?? null,
          effectiveMaxTokens: maxTokens ?? null,
          truncated: result.finishReason === 'length',
        },
      }

      let outputType: OutputType | undefined

      // 聚合所有成功的工具调用结果（图片/视频/音频）
      if (result.toolCallHistory.length > 0) {
        const allImages: Array<{ url?: string; b64?: string; revisedPrompt?: string }> = []
        const allVideos: Array<{ url?: string; duration?: number; format?: string }> = []
        let lastAudio: Record<string, unknown> | undefined
        let lastAudioText: string | undefined
        let lastTaskId: string | undefined

        for (const item of result.toolCallHistory) {
          if (!item.result?.success || !item.result.result || typeof item.result.result !== 'object') {
            continue
          }

          const toolResult = item.result.result as Record<string, unknown>
          const type = toolResult._type as string | undefined

          if (type === 'image-gen' && Array.isArray(toolResult.images)) {
            allImages.push(...(toolResult.images as Array<{ url?: string; b64?: string; revisedPrompt?: string }>))
          } else if (type === 'video-gen' && Array.isArray(toolResult.videos)) {
            allVideos.push(...(toolResult.videos as Array<{ url?: string; duration?: number; format?: string }>))
            if (toolResult.taskId) {
              lastTaskId = toolResult.taskId as string
            }
          } else if (type === 'audio-tts' && toolResult.audio) {
            lastAudio = toolResult.audio as Record<string, unknown>
            if (toolResult.text) {
              lastAudioText = toolResult.text as string
            }
          }
        }

        // 按优先级设置输出类型和数据
        if (allImages.length > 0) {
          data.images = allImages
          const imageUrls = allImages
            .filter((img) => typeof img.url === 'string' && img.url)
            .map((img, index) => ({
              index: index + 1,
              url: img.url as string,
              description: img.revisedPrompt || `图片${index + 1}`,
            }))
          data.imageUrls = imageUrls
          data.imageUrlsText = imageUrls
            .map((img) => `图片${img.index}: ${img.url}${img.description ? ` (${img.description})` : ''}`)
            .join('\n')
          outputType = 'image'
        }
        if (allVideos.length > 0) {
          data.videos = allVideos
          if (lastTaskId) {
            data.taskId = lastTaskId
          }
          if (!outputType) outputType = 'video'
        }
        if (lastAudio) {
          data.audio = lastAudio
          if (lastAudioText) {
            data.text = lastAudioText
          }
          if (!outputType) outputType = 'audio'
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        input: {
          provider: aiConfig.provider,
          baseUrl: aiConfig.baseUrl || null,
          model,
          temperature,
          maxTokens: maxTokens ?? null,
          toolChoice: toolChoice ?? null,
          maxRounds: maxRounds ?? null,
          systemPrompt,
          userPrompt: userPromptText,
          messageCount: messages.length,
          hasTools: (openaiTools.length + claudeTools.length) > 0,
        },
        data,
        outputType,
        aiProvider: aiConfig.provider,
        aiModel: result.model,
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
      let errorMessage = error instanceof Error ? error.message : 'AI 处理失败'
      
      if (isRetryableNetworkError(error)) {
        const hint = getNetworkErrorHint(error)
        context.addLog?.('error', `网络连接错误: ${errorMessage}`, 'NETWORK_ERROR', {
          hint,
          suggestion: '请检查网络连接，或稍后重试',
        })

        if (!isFormattedNetworkError(error) && hint) {
          errorMessage = `${errorMessage}\n\n可能原因: ${hint}\n\n建议: 检查网络连接是否正常，如使用代理请确认配置正确，稍后重试`
        }
      } else {
        // 记录错误信息到日志，确保调试时能看到详细的错误上下文
        context.addLog?.('error', `AI 处理失败: ${errorMessage}`, 'AI_CALL', {
          configuredModel: processNode.config?.model,
          aiConfigId: processNode.config?.aiConfigId,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        })
      }
      
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        input: {
          provider: provider ?? null,
          baseUrl: providerBaseUrl,
          model: model ?? null,
          temperature: temperature ?? null,
          maxTokens: maxTokens ?? null,
          toolChoice: toolChoice ?? null,
          maxRounds: maxRounds ?? null,
          systemPrompt: systemPrompt || null,
          userPrompt: userPromptText || null,
        },
        data: {},
        error: errorMessage,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  private async repairInvalidJsonOutputIfNeeded(
    aiConfig: AIConfigCache,
    model: string,
    rawContent: string,
    temperature: number,
    maxTokens: number | undefined,
    normalizedContent: string,
    context: ExecutionContext
  ): Promise<string> {
    const extracted = this.extractJsonFromText(normalizedContent) || this.extractJsonFromText(rawContent)
    if (!extracted) return normalizedContent
    try {
      const parsed = JSON.parse(extracted)
      return JSON.stringify(parsed)
    } catch {
      // fall through to AI repair
    }

    context.addLog?.('warning', '检测到 JSON 输出不合法，尝试自动修复为严格 JSON', 'AI_CALL')

    // Prefer repairing the extracted JSON-ish payload (usually much shorter than rawContent),
    // otherwise the repair call may fail due to length/noise (markdown fences, extra text).
    const MAX_REPAIR_INPUT_CHARS = 20_000
    let repairInput = extracted || rawContent
    const wasTruncated = repairInput.length > MAX_REPAIR_INPUT_CHARS
    if (wasTruncated) repairInput = repairInput.slice(0, MAX_REPAIR_INPUT_CHARS)

    const repairMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content:
          '你是一个严格的 JSON 修复器。你的任务是将输入内容修复为【单个 JSON 对象】。\n' +
          '- 只输出 JSON，不要 Markdown/```，不要解释文字。\n' +
          '- 保持原有字段结构与键名，不要新增字段。\n' +
          '- 修复常见问题：未转义的双引号、缺失逗号/括号、非法换行等。\n',
      },
      {
        role: 'user',
        content:
          '请将下面内容修复为严格 JSON（必须可被 JSON.parse 解析），并只输出 JSON：\n\n' +
          (wasTruncated
            ? '【注意】输入内容过长，已截断；如果正文(content)过长或含有大量引号/换行，请在不新增字段的前提下对正文做合理截断/清洗，以确保 JSON 可解析。\n\n' +
              repairInput
            : repairInput),
      },
    ]

    let repaired: ChatResponseWithTools
    try {
      repaired = await this.callAIWithToolsAdaptive({
        aiConfig,
        model,
        messages: repairMessages,
        openaiTools: [],
        claudeTools: [],
        toolChoice: 'none',
        temperature: Math.min(0.2, temperature),
        maxTokens: maxTokens && maxTokens > 0 ? Math.min(maxTokens, 4096) : 4096,
      })
    } catch {
      return normalizedContent
    }

    const repairedExtracted = this.extractJsonFromText(repaired.content || '')
    if (!repairedExtracted) return normalizedContent
    try {
      const parsed = JSON.parse(repairedExtracted)
      return JSON.stringify(parsed)
    } catch {
      return normalizedContent
    }
  }

  /**
   * 构建工具配置说明（告诉 AI 用户预配置的参数）
   */
  private buildToolConfigInstructions(uiTools: UIToolConfig[]): string {
    const instructions: string[] = []

    for (const tool of uiTools) {
      if (!tool.enabled || !tool.config) continue

      const executorName = mapUIToolToExecutor(tool.type)

      // HTTP 请求工具的预配置参数
      if (tool.type === 'http-request' && tool.config.url) {
        const params: string[] = []
        params.push(`url: "${tool.config.url}"`)
        if (tool.config.method) params.push(`method: "${tool.config.method}"`)
        if (tool.config.extractContent) {
          params.push(`extract_content: true`)
          if (tool.config.maxContentLength) {
            params.push(`max_content_length: ${tool.config.maxContentLength}`)
          }
        }
        if (tool.config.headers && Array.isArray(tool.config.headers) && (tool.config.headers as Array<{ key: string; value: string }>).length > 0) {
          const headersObj: Record<string, string> = {}
          for (const h of tool.config.headers as Array<{ key: string; value: string }>) {
            if (h.key) headersObj[h.key] = h.value
          }
          if (Object.keys(headersObj).length > 0) {
            params.push(`headers: ${JSON.stringify(headersObj)}`)
          }
        }
        if (tool.config.timeout && tool.config.timeout !== 30000) {
          params.push(`timeout: ${tool.config.timeout}`)
        }
        if (tool.config.body) {
          params.push(`body: ${tool.config.body}`)
        }

        instructions.push(`\n### 工具 "${tool.name}" (${executorName}) 的预设参数：\n请使用以下参数调用此工具：\n${params.join('\n')}`)
      }

      // 飞书多维表格工具的预配置参数（不包含鉴权 token）
      if (tool.type === 'feishu-bitable') {
        const params: string[] = []
        if (tool.config.appToken) params.push(`app_token: "${tool.config.appToken}"`)
        if (tool.config.tableId) params.push(`table_id: "${tool.config.tableId}"`)
        if (tool.config.operation) params.push(`operation: "${tool.config.operation}"`)
        if (params.length > 0) {
          instructions.push(
            `\n### 工具 "${tool.name}" (${executorName}) 的预设参数：\n` +
            `请优先复用以下参数调用此工具：\n${params.join('\n')}\n` +
            `注意：飞书鉴权 token 不在此处提供，运行环境需配置 FEISHU_TENANT_ACCESS_TOKEN。`
          )
        }
      }

      // 图片生成工具预设参数
      if (tool.type === 'image-gen-ai') {
        const params: string[] = []
        if (tool.config.model) params.push(`model: "${tool.config.model}"`)
        if (tool.config.imageSize) params.push(`image_size: "${tool.config.imageSize}"`)
        if (tool.config.imageQuality) params.push(`image_quality: "${tool.config.imageQuality}"`)
        if (tool.config.imageStyle) params.push(`image_style: "${tool.config.imageStyle}"`)
        if (tool.config.negativePrompt) params.push(`negative_prompt: "${tool.config.negativePrompt}"`)
        
        const imageCount = (tool.config.imageCount as number) || 1
        if (params.length > 0 || imageCount > 0) {
          instructions.push(
            `\n### 工具 "${tool.name}" (${executorName}) 的预设参数：\n` +
            `**重要**：只调用此工具 ${imageCount} 次，每次生成 1 张图片，总共生成 ${imageCount} 张图片。\n` +
            `请务必使用以下参数调用此工具，不要自行更改模型或尺寸：\n${params.join('\n')}`
          )
        }
      }

      // 视频生成工具预设参数
      if (tool.type === 'video-gen-ai') {
        const params: string[] = []
        if (tool.config.model) params.push(`model: "${tool.config.model}"`)
        if (tool.config.videoDuration) params.push(`video_duration: ${tool.config.videoDuration}`)
        if (tool.config.videoAspectRatio) params.push(`video_aspect_ratio: "${tool.config.videoAspectRatio}"`)
        if (tool.config.videoResolution) params.push(`video_resolution: "${tool.config.videoResolution}"`)
        if (params.length > 0) {
          instructions.push(`\n### 工具 "${tool.name}" (${executorName}) 的预设参数：\n请务必使用以下参数调用此工具：\n${params.join('\n')}`)
        }
      }

      // 语音生成工具预设参数
      if (tool.type === 'audio-tts-ai') {
        const params: string[] = []
        if (tool.config.model) params.push(`model: "${tool.config.model}"`)
        if (tool.config.ttsVoice) params.push(`voice: "${tool.config.ttsVoice}"`)
        if (tool.config.ttsSpeed) params.push(`tts_speed: ${tool.config.ttsSpeed}`)
        if (tool.config.ttsFormat) params.push(`output_format: "${tool.config.ttsFormat}"`)
        if (params.length > 0) {
          instructions.push(`\n### 工具 "${tool.name}" (${executorName}) 的预设参数：\n请务必使用以下参数调用此工具：\n${params.join('\n')}`)
        }
      }

      // 可以为其他工具类型添加类似的逻辑
    }

    return instructions.length > 0 ? '\n' + instructions.join('\n') : ''
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
    provider: string,
    model: string
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

    // 使用新的检测方法，同时检查 provider 和 model
    const isClaudeFormat = this.isClaudeFormat(provider, model)

    if (isClaudeFormat) {
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
    provider: string,
    model: string = ''
  ): { openaiTools: OpenAITool[]; claudeTools: ClaudeTool[] } {
    const result = this.prepareToolsWithDescriptions(enabled, enabledToolNames, provider, model)
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
    initialMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }>,
    openaiTools: OpenAITool[],
    claudeTools: ClaudeTool[],
    toolChoice: 'auto' | 'none' | 'required',
    temperature: number,
    maxTokens: number | undefined,
    maxRounds: number,
    requireFinalResponse: boolean,
    context: ExecutionContext
  ): Promise<{
    content: string
    model: string
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    toolCallHistory: Array<{ call: ToolCall; result: ToolCallResult }>
    rounds: number
    finishReason: ChatResponseWithTools['finishReason']
    segments?: number
  }> {
    const toolCallHistory: Array<{ call: ToolCall; result: ToolCallResult }> = []
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }> = [...initialMessages]
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let rounds = 0
    let lastResponse: ChatResponseWithTools | null = null
    let hasSuccessfulToolCalls = false // 标记是否已有成功的工具调用
    let currentToolChoice: 'auto' | 'none' | 'required' = toolChoice
    let shouldForceFinalTextFormat = false

    const toolContext: ToolExecutionContext = {
      executionId: context.executionId,
      workflowId: context.workflowId,
      organizationId: context.organizationId,
      userId: context.userId,
      variables: context.globalVariables,
      aiConfig: {
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        baseUrl: aiConfig.baseUrl,
        defaultModel: aiConfig.defaultModel,
      },
    }

    while (rounds < maxRounds) {
      rounds++
      context.addLog?.('info', `第 ${rounds} 轮: 等待 AI 响应...`, 'ROUND', { rounds, maxRounds })

      console.log(`[PROCESS_WITH_TOOLS] 第 ${rounds} 轮开始，调用 AI...`)
      const startTime = Date.now()

      // 调用 AI
      let response: ChatResponseWithTools
      try {
        response = await this.callAIWithTools(
          aiConfig,
          model,
          messages,
          openaiTools,
          claudeTools,
          currentToolChoice,
          temperature,
          maxTokens
        )
      } catch (err) {
        if (isFormattedNetworkError(err)) {
          throw err
        }
        if (isRetryableNetworkError(err)) {
          throw formatNetworkError(err, 'AI 调用失败')
        }
        throw err
      }

      console.log(`[PROCESS_WITH_TOOLS] 第 ${rounds} 轮 AI 响应完成，耗时 ${Date.now() - startTime}ms`)

      // 累计 token 使用
      totalUsage.promptTokens += response.usage.promptTokens
      totalUsage.completionTokens += response.usage.completionTokens
      totalUsage.totalTokens += response.usage.totalTokens

      lastResponse = response

      // 如果没有工具调用
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // 如果已有成功的工具调用，任务完成，不再强制
        if (hasSuccessfulToolCalls) {
          context.addLog?.('info', `第 ${rounds} 轮: 工具已成功执行，任务完成`, 'ROUND')
          break
        }
        
        // 如果 toolChoice 是 required 但没有工具调用，追加强制提示后重试
        if (toolChoice === 'required' && rounds < maxRounds) {
          context.addLog?.('warning', `第 ${rounds} 轮: toolChoice=required 但未收到工具调用，追加强制提示后重试`, 'ROUND', {
            contentPreview: response.content?.slice(0, 100)
          })
          
          // 追加一条用户消息强制工具调用
          messages = [
            ...messages,
            { role: 'assistant' as const, content: response.content || '' },
            { 
              role: 'user' as const, 
              content: '请立即使用工具执行任务，不要回复文字。直接调用工具生成内容。' 
            }
          ]
          continue // 进入下一轮
        }
        
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

      // 检查是否有成功的工具调用
      if (toolResults.some(r => r.success)) {
        hasSuccessfulToolCalls = true
      }

      // 对于生成类工具（图片/视频/音频），成功执行后直接返回，不需要再让 AI 处理结果
      const generativeToolNames = ['image_gen_ai', 'video_gen_ai', 'audio_gen_ai']
      const isGenerativeToolCall = response.toolCalls.some(tc => 
        generativeToolNames.includes(tc.function.name)
      )
      
      if (isGenerativeToolCall && hasSuccessfulToolCalls) {
        if (!requireFinalResponse) {
          context.addLog?.('info', `第 ${rounds} 轮: 生成类工具执行成功，任务完成`, 'ROUND')
          break
        }
        // 某些节点既需要生成类工具结果，也需要模型输出（例如严格 JSON 规划结果）。
        // 此时继续下一轮，但禁用后续工具调用，让模型基于工具结果给出最终文本输出。
        currentToolChoice = 'none'
        shouldForceFinalTextFormat = true
        context.addLog?.('info', `第 ${rounds} 轮: 生成类工具已执行，继续生成最终文本输出`, 'ROUND')
      }

      // 构建新的消息，包含工具调用结果
      const isClaudeProvider = this.isClaudeFormat(aiConfig.provider, model)
      
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
          content: toolResultContent as unknown as ContentPart[],
        })
      } else {
        // OpenAI 格式：使用 tool 角色
        const toolResultMessages = functionCallingService.buildToolResultMessages(
          response.toolCalls,
          toolResults
        )
        for (const msg of toolResultMessages) {
          // OpenAI 工具结果消息使用 'tool' 角色，需要类型断言
          (messages as Array<BaseChatMessage | ToolResultMessage>).push(msg)
        }
      }

      if (shouldForceFinalTextFormat) {
        shouldForceFinalTextFormat = false
        messages.push({
          role: 'user' as const,
          content:
            '现在请基于工具执行结果，严格按照系统提示的【输出格式要求】返回最终结果：只输出一个 JSON 对象（以 { 开头，以 } 结尾），不要 Markdown，不要图片链接，不要任何解释文字。',
        })
      }
    }

    // 如果最终是因为长度截断，自动续写拼接，确保输出完整
    let finalContent = lastResponse?.content || ''
    let finalModel = lastResponse?.model || model
    let finalFinishReason = lastResponse?.finishReason || 'stop'
    let segments = 1

    if (this.isTruncationFinishReason(finalFinishReason)) {
      const continued = await this.autoContinueFinalText({
        aiConfig,
        model,
        temperature,
        maxTokens,
        initialMessages,
        contentSoFar: finalContent,
        context,
      })

      finalContent = continued.content
      finalModel = continued.model
      finalFinishReason = continued.finishReason
      segments = continued.segments

      totalUsage.promptTokens += continued.usage.promptTokens
      totalUsage.completionTokens += continued.usage.completionTokens
      totalUsage.totalTokens += continued.usage.totalTokens
    }

    return {
      content: finalContent,
      model: finalModel,
      usage: totalUsage,
      toolCallHistory,
      rounds,
      finishReason: finalFinishReason,
      segments,
    }
  }

  private isTruncationFinishReason(reason: string | undefined): boolean {
    const r = (reason || '').toLowerCase()
    return r === 'length' || r === 'max_tokens' || r.includes('max_tokens') || r.includes('length')
  }

  private extractMaxTokenHintFromError(message: string): number | null {
    const patterns: RegExp[] = [
      /\bmax[_\s-]?tokens?\b[^0-9]{0,40}\b(?:<=|less than or equal to)\s*(\d{2,7})/i,
      /\bbetween\s+1\s+and\s+(\d{2,7})\b/i,
    ]
    for (const re of patterns) {
      const m = message.match(re)
      if (m?.[1]) {
        const n = Number(m[1])
        if (Number.isFinite(n) && n > 0) return n
      }
    }
    return null
  }

  private async autoContinueFinalText(options: {
    aiConfig: AIConfigCache
    model: string
    temperature: number
    maxTokens: number | undefined
    initialMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }>
    contentSoFar: string
    context: ExecutionContext
  }): Promise<{
    content: string
    model: string
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    finishReason: ChatResponseWithTools['finishReason']
    segments: number
  }> {
    const maxSegmentsEnv = Number(process.env.AI_AUTOCONTINUE_MAX_SEGMENTS || '')
    const maxSegments = Number.isFinite(maxSegmentsEnv) && maxSegmentsEnv > 0 ? Math.floor(maxSegmentsEnv) : 8
    const tailChars = 4000
    const overlapProbeChars = 2000
    const maxMergedChars = 200_000
    const maxTotalTokens = 120_000

    let merged = options.contentSoFar || ''
    let segments = 1
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let lastFinishReason: ChatResponseWithTools['finishReason'] = 'length'
    let lastModel = options.model

    while (segments < maxSegments && this.isTruncationFinishReason(lastFinishReason)) {
      if (merged.length >= maxMergedChars) break
      if (totalUsage.totalTokens >= maxTotalTokens) break

      const tail = merged.slice(-tailChars)

      const systemMsg = options.initialMessages.find(m => m.role === 'system')
      const lastUserMsg = [...options.initialMessages].reverse().find(m => m.role === 'user')
      const userSummary =
        typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content.slice(0, 2000)
          : '[non-text user content]'

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        ...(systemMsg && typeof systemMsg.content === 'string' ? [{ role: 'system' as const, content: systemMsg.content }] : []),
        {
          role: 'user' as const,
          content:
            `任务指令（摘要）：\n${userSummary}\n\n` +
            `请继续输出，从上一次输出的末尾继续，不要重复已输出内容。\n` +
            `上一次输出的末尾如下（不要重复这段）：\n${tail}\n\n` +
            `直接续写正文，不要解释。`,
        },
      ]

      const next = await this.callAIWithToolsAdaptive({
        aiConfig: options.aiConfig,
        model: options.model,
        messages,
        openaiTools: [],
        claudeTools: [],
        toolChoice: 'none',
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      })

      const nextContent = next.content || ''
      const probe = merged.slice(-overlapProbeChars)
      const deduped = this.removeLeadingOverlap(probe, nextContent)
      if (deduped.trim().length < 20) break
      merged += deduped

      totalUsage.promptTokens += next.usage.promptTokens
      totalUsage.completionTokens += next.usage.completionTokens
      totalUsage.totalTokens += next.usage.totalTokens

      segments++
      lastFinishReason = next.finishReason
      lastModel = next.model
      options.context.addLog?.('info', `输出被截断，已自动续写拼接 (段 ${segments})`, 'MODEL_CONFIG', {
        model: options.model,
        finishReason: next.finishReason,
      })
    }

    return {
      content: merged,
      model: lastModel,
      usage: totalUsage,
      finishReason: this.isTruncationFinishReason(lastFinishReason) ? lastFinishReason : 'stop',
      segments,
    }
  }

  private removeLeadingOverlap(prevTail: string, next: string): string {
    if (!prevTail || !next) return next
    const max = Math.min(prevTail.length, next.length, 2000)
    for (let len = max; len >= 50; len--) {
      const suffix = prevTail.slice(-len)
      if (next.startsWith(suffix)) return next.slice(len)
    }
    return next
  }

  /**
   * 检测是否应该使用 Anthropic 原生 API（/v1/messages）
   *
   * 重要：代理服务（如 SHENSUAN、OpenRouter）使用 OpenAI 兼容 API 格式，
   * 即使底层模型是 Claude，也应该使用 OpenAI 格式。
   * 只有直连 Anthropic 时才使用 Claude 原生格式。
   */
  private isClaudeFormat(provider: string, _model: string): boolean {
    const providerLower = provider.toLowerCase()

    // 只有直连 Anthropic 时才使用 Claude 原生 API 格式
    // 代理服务（SHENSUAN、OpenRouter 等）使用 OpenAI 兼容 API
    if (providerLower === 'anthropic' || providerLower === 'claude') {
      return true
    }

    // 检查是否包含 anthropic（但排除代理服务）
    // 注意：不检查模型名称，因为代理服务可能路由到 Claude 但使用 OpenAI API 格式
    if (providerLower.includes('anthropic') && !this.isProxyProvider(providerLower)) {
      return true
    }

    return false
  }

  /**
   * 检测是否是代理服务提供商
   */
  private isProxyProvider(provider: string): boolean {
    const proxyProviders = [
      'shensuan',    // 胜算云
      'openrouter',  // OpenRouter
      'together',    // Together AI
      'fireworks',   // Fireworks AI
      'groq',        // Groq
      'deepinfra',   // DeepInfra
      'perplexity',  // Perplexity
      'anyscale',    // Anyscale
    ]

    return proxyProviders.some(p => provider.includes(p))
  }

  /**
   * 调用带工具的 AI
   */
  private async callAIWithTools(
    aiConfig: AIConfigCache,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }>,
    openaiTools: OpenAITool[],
    claudeTools: ClaudeTool[],
    toolChoice: 'auto' | 'none' | 'required',
    temperature: number,
    maxTokens: number | undefined
  ): Promise<ChatResponseWithTools> {
    return this.callAIWithToolsAdaptive({
      aiConfig,
      model,
      messages,
      openaiTools,
      claudeTools,
      toolChoice,
      temperature,
      maxTokens,
    })
  }

  private async callAIWithToolsAdaptive(options: {
    aiConfig: AIConfigCache
    model: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: ToolCall[] }>
    openaiTools: OpenAITool[]
    claudeTools: ClaudeTool[]
    toolChoice: 'auto' | 'none' | 'required'
    temperature: number
    maxTokens: number | undefined
  }): Promise<ChatResponseWithTools> {
    const isClaudeProvider = this.isClaudeFormat(options.aiConfig.provider, options.model)

    console.log('[callAIWithTools] API 选择:', {
      provider: options.aiConfig.provider,
      model: options.model,
      isClaudeProvider,
      willUseEndpoint: isClaudeProvider ? '/v1/messages' : '/v1/chat/completions',
      toolCount: isClaudeProvider ? options.claudeTools.length : options.openaiTools.length,
    })

    let currentMax = options.maxTokens
    let attempt = 0
    const maxAttempts = 6

    while (attempt < maxAttempts) {
      attempt++
      try {
        if (isClaudeProvider) {
          // Claude 的 tool_choice 格式不同
          let claudeToolChoice: { type: 'auto' | 'any' | 'tool'; name?: string } | undefined
          if (options.toolChoice === 'required') {
            claudeToolChoice = { type: 'any' }
          } else if (options.toolChoice === 'auto') {
            claudeToolChoice = { type: 'auto' }
          }
          // toolChoice === 'none' 时不传 tool_choice

          return await this.anthropicProvider.chatWithTools(
            {
              model: options.model,
              messages: options.messages,
              tools: options.claudeTools,
              tool_choice: claudeToolChoice,
              temperature: options.temperature,
              maxTokens: currentMax,
            },
            options.aiConfig.apiKey,
            options.aiConfig.baseUrl
          )
        }

        // 默认使用 OpenAI 兼容格式
        return await this.openaiProvider.chatWithTools(
          {
            model: options.model,
            messages: options.messages,
            tools: options.openaiTools,
            tool_choice: options.toolChoice,
            temperature: options.temperature,
            maxTokens: currentMax,
          },
          options.aiConfig.apiKey,
          options.aiConfig.baseUrl
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const hinted = this.extractMaxTokenHintFromError(msg)
        if (hinted && hinted > 0) {
          const next = Math.max(1, hinted)
          if (next === currentMax) throw err
          currentMax = next
          continue
        }

        const looksTokenRelated =
          msg.toLowerCase().includes('max_tokens') ||
          msg.toLowerCase().includes('maximum context') ||
          msg.toLowerCase().includes('context length') ||
          msg.toLowerCase().includes('too many tokens')

        if (!looksTokenRelated) throw err
        if (!currentMax || currentMax <= 1) throw err

        currentMax = Math.max(1, Math.floor(currentMax / 2))
      }
    }

    // Should not reach here
    return this.openaiProvider.chatWithTools(
      {
        model: options.model,
        messages: options.messages,
        tools: options.openaiTools,
        tool_choice: options.toolChoice,
        temperature: options.temperature,
        maxTokens: currentMax,
      },
      options.aiConfig.apiKey,
      options.aiConfig.baseUrl
    )
  }

  /**
   * 从知识库检索相关上下文
   */
  private async retrieveKnowledgeContext(
    knowledgeBaseId: string,
    query: string,
    ragConfig?: { topK?: number; threshold?: number; maxContextTokens?: number },
    apiConfig?: { apiKey?: string; baseUrl?: string; provider?: AIConfigCache['provider'] }
  ): Promise<string | null> {
    try {
      const knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId, isActive: true },
      })

      if (!knowledgeBase) {
        console.warn(`知识库不存在或已禁用: ${knowledgeBaseId}`)
        return null
      }

      let apiKey = apiConfig?.apiKey
      let baseUrl = apiConfig?.baseUrl

      if (!apiKey || apiConfig?.provider !== knowledgeBase.embeddingProvider) {
        const embeddingApiKey = await prisma.apiKey.findFirst({
          where: {
            organizationId: knowledgeBase.organizationId,
            provider: knowledgeBase.embeddingProvider,
            isActive: true,
          },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        })

        if (embeddingApiKey) {
          apiKey = safeDecryptApiKey(embeddingApiKey.keyEncrypted) || apiKey
          baseUrl = embeddingApiKey.baseUrl || baseUrl
        }
      }

      const context = await getRelevantContext({
        knowledgeBaseId,
        query,
        topK: ragConfig?.topK ?? 5,
        threshold: ragConfig?.threshold ?? 0.7,
        embeddingModel: knowledgeBase.embeddingModel,
        embeddingProvider: knowledgeBase.embeddingProvider,
        maxTokens: ragConfig?.maxContextTokens ?? 4000,
        apiKey,
        baseUrl,
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
