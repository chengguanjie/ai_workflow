/**
 * 处理节点处理器（AI 处理）
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { ContentPart, ModelModality } from '@/lib/ai/types'
import { getModelModality, SHENSUAN_DEFAULT_MODELS } from '@/lib/ai/types'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { applyInputBindingsToContext, createContentPartsFromText, rewritePromptReferencesToInputs } from '../utils'
import { aiService } from '@/lib/ai'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { getRelevantContext } from '@/lib/knowledge/search'
import { formatNetworkError, isFormattedNetworkError, isRetryableNetworkError } from '@/lib/http/fetch-with-timeout'
import { routeByModality } from './modality-router'
import { MODALITY_TO_OUTPUT_TYPE, type OutputType } from '@/lib/workflow/debug-panel/types'

export class ProcessNodeProcessor implements NodeProcessor {
  nodeType = 'PROCESS'

  private extractAudioInputFromParts(parts: ContentPart[]): { url?: string; data?: ArrayBuffer } | undefined {
    for (const part of parts) {
      if (part.type === 'audio_url' && typeof part.audio_url?.url === 'string') {
        return { url: part.audio_url.url }
      }
      if (part.type === 'input_audio' && typeof part.input_audio?.data === 'string') {
        try {
          const buf = Buffer.from(part.input_audio.data, 'base64')
          const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
          return { data: arrayBuffer }
        } catch {
          // ignore
        }
      }
    }
    return undefined
  }

  private extractJsonFromText(text: string): string | null {
    const trimmed = text.trim()
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenceMatch?.[1]) {
      const candidate = fenceMatch[1].trim()
      if (candidate.startsWith('{') || candidate.startsWith('[')) return candidate
    }

    // Find first JSON object/array substring with simple bracket matching.
    const startIndex = (() => {
      const obj = trimmed.indexOf('{')
      const arr = trimmed.indexOf('[')
      if (obj === -1) return arr
      if (arr === -1) return obj
      return Math.min(obj, arr)
    })()
    if (startIndex === -1) return null

    const startChar = trimmed[startIndex]
    const openChar = startChar
    const closeChar = startChar === '{' ? '}' : ']'

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
    if (normalized > 16_384) return undefined
    return normalized
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async callChatWithRetry(
    doCall: () => Promise<Awaited<ReturnType<typeof aiService.chat>>>,
    context: ExecutionContext,
    label: string
  ): Promise<Awaited<ReturnType<typeof aiService.chat>>> {
    const maxAttempts = 5

    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await doCall()
      } catch (err) {
        lastError = err
        if (!isRetryableNetworkError(err)) {
          throw err
        }
        if (attempt >= maxAttempts) {
          throw err
        }
        const delay = 1500 * Math.pow(2, attempt - 1)
        context.addLog?.(
          'warning',
          `${label} 网络错误，${Math.round(delay)}ms 后重试（${attempt}/${maxAttempts}）`,
          'AI_RETRY',
          { attempt, maxAttempts }
        )
        await this.sleep(delay)
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} 失败`)
  }

  private mergeContinuation(current: string, next: string): string {
    if (!current) return next
    if (!next) return current

    // Avoid obvious duplication: trim overlapping suffix/prefix (up to 400 chars).
    const maxWindow = 400
    const suffix = current.slice(-maxWindow)
    for (let overlap = Math.min(suffix.length, next.length); overlap >= 20; overlap--) {
      if (suffix.slice(-overlap) === next.slice(0, overlap)) {
        return current + next.slice(overlap)
      }
    }
    return current + next
  }

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const processNode = node as ProcessNodeConfig

    let provider: string | undefined
    let model: string | undefined
    let temperature: number | undefined
    let maxTokens: number | undefined
    let userPromptText = ''

    try {
      // 1. 获取 AI 配置
      context.addLog?.('step', '正在加载 AI 服务商配置...', 'CONFIG')
      const aiConfig = await this.getAIConfig(
        processNode.config?.aiConfigId,
        context
      )
      provider = aiConfig?.provider

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

      // 输入绑定：注入 inputs.*，供提示词使用 {{inputs.xxx}}
      applyInputBindingsToContext(processNode.config?.inputBindings, context)

      // 将已绑定的 {{上游.字段}} 改写为 {{inputs.slot}}，以便运行时统一走 inputs.*
      const effectiveUserPrompt = rewritePromptReferencesToInputs(rawUserPrompt, processNode.config?.inputBindings)

      // 使用 createContentPartsFromText 解析变量，支持多模态对象
      const userContentParts = createContentPartsFromText(effectiveUserPrompt, context)

      // 提取纯文本用于日志记录和 RAG 检索
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
            const sources = Array.from(ragContext.matchAll(/\[来源:\s*([^\]]+)\]/g))
              .map((m) => String(m[1] || '').trim())
              .filter(Boolean)
            context.addLog?.('info', '知识库检索完成', 'RAG', {
              sources: Array.from(new Set(sources)).slice(0, 10),
              contextChars: ragContext.length,
              contextPreview: ragContext.slice(0, 300) + (ragContext.length > 300 ? '...' : ''),
            })
            systemPrompt = `${systemPrompt}\n\n## 知识库检索结果\n${ragContext}`
          } else {
            context.addLog?.('warning', '知识库检索无结果（继续执行）', 'RAG', {
              knowledgeBaseId,
              query: userPromptText,
            })
          }
          // ...
        } catch {
          // RAG 检索失败时继续执行，不中断流程
          context.addLog?.('warning', '知识库检索失败（已忽略，继续执行）', 'RAG', {
            knowledgeBaseId,
            query: userPromptText,
          })
        }
      }

      // 5. 构建消息并调用 AI
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }> = []

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

      model = processNode.config?.model || aiConfig.defaultModel
      temperature = processNode.config?.temperature ?? 0.7

      // maxTokens：用户配置的是“期望上限”，但必须被模型上下文限制所约束
      // 当前策略：不向服务商传递 maxTokens，让模型/网关自行决定输出长度。
      const configMaxTokens = processNode.config?.maxTokens
      maxTokens = this.normalizeMaxTokens(configMaxTokens)
      if (typeof configMaxTokens === 'number' && configMaxTokens > 0 && maxTokens === undefined) {
        context.addLog?.('warning', `maxTokens=${configMaxTokens} 过大，已忽略并使用模型默认值`, 'MODEL_CONFIG', {
          requestedMaxTokens: configMaxTokens,
          effectiveMaxTokens: null,
        })
      }

      // 记录详细的模型配置信息，便于问题诊断
      context.addLog?.('info', '模型配置详情', 'MODEL_CONFIG', {
        configuredModel: processNode.config?.model || '(未配置，使用默认)',
        actualModel: model,
        aiConfigId: processNode.config?.aiConfigId || '(使用默认配置)',
        defaultModel: aiConfig.defaultModel,
        provider: aiConfig.provider
      })

      context.addLog?.('step', '正在调用 AI 模型...', 'AI_CALL', {
        provider: aiConfig.provider,
        model,
        temperature,
        maxTokens: maxTokens ?? '(使用模型默认值)',
        messageCount: messages.length
      })

      const explicitModality = processNode.config?.modality as ModelModality | undefined
      const inferredModality = model ? getModelModality(model) : null
      const modality = explicitModality || inferredModality || 'text'

      // SHENSUAN: if user selected a non-text modality but left model empty, use system default.
      if (
        aiConfig.provider === 'SHENSUAN' &&
        explicitModality &&
        explicitModality !== 'text' &&
        explicitModality !== 'code' &&
        (!processNode.config?.model || String(processNode.config.model).trim() === '')
      ) {
        model = SHENSUAN_DEFAULT_MODELS[explicitModality]
      }

      const effectiveOutputType =
        (processNode.config?.expectedOutputType as OutputType | undefined) ||
        MODALITY_TO_OUTPUT_TYPE[modality] ||
        'text'

      // For plain text/code: keep the original robust chat path (retry + JSON repair).
      if (modality === 'text' || modality === 'code') {
        let response: Awaited<ReturnType<typeof aiService.chat>>
        try {
          response = await this.callChatWithRetry(
            () =>
              aiService.chat(
                aiConfig.provider,
                {
                  model: model!,
                  messages,
                  temperature,
                  maxTokens,
                },
                aiConfig.apiKey,
                aiConfig.baseUrl
              ),
            context,
            'AI 调用失败'
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

        const normalizedContent = this.normalizeOutputContent(
          response.content,
          effectiveOutputType
        )

        const finalContent =
          effectiveOutputType === 'json'
            ? await this.repairInvalidJsonOutputIfNeeded(
                aiConfig,
                model!,
                temperature!,
                maxTokens,
                response.content,
                normalizedContent,
                context
              )
            : normalizedContent

        context.addLog?.('success', 'AI 处理完成', 'AI_CALL', {
          tokens: response.usage,
          finishReason: response.finishReason,
          segments: response.segments ?? 1,
          outputPreview: finalContent.slice(0, 100) + '...'
        })

        return {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'success',
          outputType: effectiveOutputType,
          input: {
            provider: aiConfig.provider,
            model: model!,
            temperature: temperature!,
            maxTokens: maxTokens ?? null,
            systemPrompt,
            userPrompt: userPromptText,
            messageCount: messages.length,
            modality,
          },
          data: {
            结果: finalContent,
            result: finalContent,
            model: response.model,
            _meta: {
              modality,
              finishReason: response.finishReason,
              segments: response.segments ?? 1,
              wasAutoContinued: response.wasAutoContinued ?? false,
              requestedMaxTokens: configMaxTokens ?? null,
              effectiveMaxTokens: maxTokens ?? null,
              truncated: response.finishReason === 'length' || response.finishReason === 'max_tokens',
            },
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
      }

      // Other modalities: route to the correct API (image/video/tts/transcription/embedding/ocr).
      const audioInput = this.extractAudioInputFromParts(userContentParts)
      const multimodalContent = isPureText ? undefined : userContentParts

      let routed
      try {
        routed = await routeByModality({
          model: model!,
          prompt: userPromptText,
          systemPrompt,
          config: {
            ...(processNode.config || {}),
            temperature: temperature!,
            maxTokens: maxTokens,
          } as any,
          aiConfig,
          context,
          multimodalContent: multimodalContent as any,
          audioInput,
        })
      } catch (err) {
        if (isFormattedNetworkError(err)) {
          throw err
        }
        if (isRetryableNetworkError(err)) {
          throw formatNetworkError(err, 'AI 调用失败')
        }
        throw err
      }

      if (!routed?.success) {
        throw new Error(routed?.error || 'AI 调用失败')
      }

      const output = routed.output as any
      const outputType =
        (processNode.config?.expectedOutputType as OutputType | undefined) ||
        MODALITY_TO_OUTPUT_TYPE[modality] ||
        effectiveOutputType

      let data: Record<string, unknown> = {
        model: output.model || model,
        modality,
        output,
      }
      let tokenUsage: NodeOutput['tokenUsage'] | undefined

      if (output._type === 'text') {
        const raw = String(output.content || '')
        const normalized = this.normalizeOutputContent(raw, outputType)
        const final =
          outputType === 'json'
            ? await this.repairInvalidJsonOutputIfNeeded(
                aiConfig,
                model!,
                temperature!,
                maxTokens,
                raw,
                normalized,
                context
              )
            : normalized
        data = {
          ...data,
          结果: final,
          result: final,
        }
        if (output.usage) {
          tokenUsage = {
            promptTokens: output.usage.promptTokens || 0,
            completionTokens: output.usage.completionTokens || 0,
            totalTokens: output.usage.totalTokens || 0,
          }
        }
      } else if (output._type === 'image-gen') {
        const firstUrl = output.images?.[0]?.url || ''
        data = { ...data, images: output.images || [], 结果: firstUrl, result: firstUrl, prompt: output.prompt }
      } else if (output._type === 'video-gen') {
        const firstUrl = output.videos?.[0]?.url || ''
        data = { ...data, videos: output.videos || [], taskId: output.taskId, 结果: firstUrl || output.taskId, result: firstUrl || output.taskId, prompt: output.prompt }
      } else if (output._type === 'audio-tts') {
        const url = output.audio?.url || ''
        data = { ...data, audio: output.audio, text: output.text, 结果: url, result: url }
      } else if (output._type === 'audio-transcription') {
        data = { ...data, text: output.text, segments: output.segments, language: output.language, 结果: output.text, result: output.text }
      } else if (output._type === 'embedding') {
        data = { ...data, embeddings: output.embeddings || [], dimensions: output.dimensions || 0, 结果: JSON.stringify(output.embeddings || []), result: JSON.stringify(output.embeddings || []) }
      }

      context.addLog?.('success', 'AI 处理完成', 'AI_CALL', {
        modality,
        outputType,
      })

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        outputType,
        input: {
          provider: aiConfig.provider,
          model: model!,
          temperature: temperature!,
          maxTokens: maxTokens ?? null,
          systemPrompt,
          userPrompt: userPromptText,
          messageCount: messages.length,
          modality,
        },
        data,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        ...(tokenUsage ? { tokenUsage } : {}),
      }
    } catch (error) {
      // 记录错误信息到日志，确保调试时能看到详细的错误上下文
      const errorMessage = error instanceof Error ? error.message : 'AI 处理失败'
      context.addLog?.('error', `AI 处理失败: ${errorMessage}`, 'AI_CALL', {
        configuredModel: processNode.config?.model,
        aiConfigId: processNode.config?.aiConfigId,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      })

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        input: {
          provider: provider ?? null,
          model: model ?? null,
          temperature: temperature ?? null,
          maxTokens: maxTokens ?? null,
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
    aiConfig: { provider: AIConfigCache['provider']; apiKey: string; baseUrl: string; defaultModel: string },
    model: string,
    temperature: number,
    maxTokens: number | undefined,
    rawContent: string,
    normalizedContent: string,
    context: ExecutionContext
  ): Promise<string> {
    const extracted = this.extractJsonFromText(normalizedContent) || this.extractJsonFromText(rawContent)
    if (!extracted) return normalizedContent
    try {
      const parsed = JSON.parse(extracted)
      return JSON.stringify(parsed)
    } catch {
      // fall through
    }

    context.addLog?.('warning', '检测到 JSON 输出不合法，尝试自动修复为严格 JSON', 'AI_CALL')

    let repaired: Awaited<ReturnType<typeof aiService.chat>>
    try {
      repaired = await this.callChatWithRetry(
        () =>
          aiService.chat(
            aiConfig.provider,
            {
              model,
              temperature: Math.min(0.2, temperature),
              maxTokens: maxTokens && maxTokens > 0 ? Math.min(maxTokens, 4096) : 4096,
              messages: [
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
                    rawContent,
                },
              ],
            },
            aiConfig.apiKey,
            aiConfig.baseUrl
          ),
        context,
        'AI JSON 修复失败'
      )
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
