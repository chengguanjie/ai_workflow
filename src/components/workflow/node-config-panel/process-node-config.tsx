'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Loader2, AlertCircle, Database, BookOpen } from 'lucide-react'
import type { KnowledgeItem, RAGConfig } from '@/types/workflow'
import { PromptTabContent } from './shared/prompt-tab-content'
import { OutputTabContent } from './shared/output-tab-content'
import { ModalityConfig } from './shared/modality-config'
import { MODALITY_TO_OUTPUT_TYPE, type OutputType } from '@/lib/workflow/debug-panel/types'
import { guessOutputTypeFromPromptAndTools } from '@/lib/workflow/debug-panel/utils'
import type { AIProviderConfig } from './shared/types'
import type { ToolConfig } from './shared/tools-section'
import { Slider } from '@/components/ui/slider'
import { SHENSUAN_DEFAULT_MODELS } from '@/lib/ai/types'
import type { ModelModality } from '@/lib/ai/types'

// 对于 PROCESS 节点，我们现在固定使用文本模型进行提示词与工具编排，
// 其他模态能力通过工具或专用节点实现，因此这里不再暴露模态选择给用户。
const FIXED_MODALITY: ModelModality = 'text'

type ProcessTabType = 'ai' | 'knowledge' | 'prompt' | 'output'

interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  documentCount: number
  chunkCount: number
  isActive: boolean
}

interface ProcessNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function ProcessNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: ProcessNodeConfigPanelProps) {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [loadingKBs, setLoadingKBs] = useState(true)
  const [activeTab, setActiveTab] = useState<ProcessTabType>('prompt')

  const processConfig = (config || {}) as {
    aiConfigId?: string // 企业配置 ID
    model?: string
    modality?: ModelModality // 模型类别（显式保存，避免从 model 推断失败）
    knowledgeItems?: KnowledgeItem[]
    knowledgeBaseId?: string // RAG 知识库 ID
    ragConfig?: RAGConfig
    systemPrompt?: string
    userPrompt?: string
    temperature?: number
    maxTokens?: number
    tools?: ToolConfig[] // 工具配置
    enableToolCalling?: boolean // 是否启用工具调用
    // 多模态配置
    imageSize?: string
    imageCount?: number
    imageQuality?: string
    imageStyle?: string
    negativePrompt?: string
    videoDuration?: number
    videoAspectRatio?: string
    videoResolution?: string
    referenceImage?: string
    ttsVoice?: string
    ttsSpeed?: number
    ttsFormat?: string
    transcriptionLanguage?: string
    transcriptionFormat?: string
    embeddingDimensions?: number
    expectedOutputType?: OutputType
  } || {}

  // Avoid stale-closure updates from async effects overwriting user-edited config (e.g. expectedOutputType).
  const processConfigRef = useRef(processConfig)
  useEffect(() => {
    processConfigRef.current = processConfig
  }, [processConfig])

  // 包装 onUpdate，同时更新 ref，确保后续操作能获取到最新值
  const updateConfig = useCallback((newConfig: typeof processConfig) => {
    processConfigRef.current = newConfig
    onUpdate(newConfig)
  }, [onUpdate])

  // PROCESS 节点固定使用文本模型；modality 只在配置中用于标记，无需用户选择
  const [selectedModality] = useState<ModelModality>(FIXED_MODALITY)

  const knowledgeItems = processConfig.knowledgeItems || []
  const ragConfig = processConfig.ragConfig || { topK: 5, threshold: 0.7 }

  // 加载可用的服务商列表（根据选择的模态）
  useEffect(() => {
    async function loadProviders() {
      try {
        setLoadingProviders(true)
        // PROCESS 节点固定按文本模态加载可用模型
        const res = await fetch(`/api/ai/providers?modality=${FIXED_MODALITY}`)
        if (res.ok) {
          const data = await res.json()
          const providerList = data.data?.providers || []
          setProviders(providerList)

          // 在调用 onUpdate 之前获取最新的配置，避免覆盖用户在 fetch 期间做出的选择
          const latestConfig = processConfigRef.current

          // 如果节点已经有 model 配置，不要覆盖它
          // 只有在以下情况才设置默认值：
          // 1. 节点完全没有 model 配置
          // 2. 且不是在切换节点（避免用旧节点的 modality 设置新节点的配置）
          // 3. 或者用户主动切换了 modality
          const hasExistingModel = !!latestConfig.model
          if (hasExistingModel) {
            // 节点已有 model 配置，只需检查 aiConfigId 是否需要设置
            if (!latestConfig.aiConfigId && data.data?.defaultProvider) {
              // 重新获取最新配置，确保不覆盖用户的选择
              const freshConfig = processConfigRef.current
              updateConfig({
                ...freshConfig,
                modality: FIXED_MODALITY,
                aiConfigId: data.data.defaultProvider.id,
              })
            }
          } else {
            // 节点没有 model 配置时，为其设置文本模态的默认模型
            if (data.data?.defaultProvider) {
              const defaultModel =
                SHENSUAN_DEFAULT_MODELS[FIXED_MODALITY] ||
                data.data.defaultProvider.defaultModel
              // 重新获取最新配置，确保不覆盖用户的选择
              const freshConfig = processConfigRef.current
              updateConfig({
                ...freshConfig,
                modality: FIXED_MODALITY,
                aiConfigId: data.data.defaultProvider.id,
                model: defaultModel,
              })
            }
          }
        }
      } catch (error) {
        console.error('Failed to load providers:', error)
      } finally {
        setLoadingProviders(false)
      }
    }
    loadProviders()
  // 添加 nodeId 作为依赖，确保节点切换时能正确处理
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModality, nodeId])

  // 加载知识库列表
  const loadKnowledgeBases = useCallback(async () => {
    try {
      setLoadingKBs(true)
      const res = await fetch('/api/knowledge-bases')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setKnowledgeBases(data.data.knowledgeBases || [])
        }
      }
    } catch (error) {
      console.error('Failed to load knowledge bases:', error)
    } finally {
      setLoadingKBs(false)
    }
  }, [])

  useEffect(() => {
    loadKnowledgeBases()
  }, [loadKnowledgeBases])

  /**
   * 根据当前的 userPrompt 和 tools，尝试自动推断一个更贴合意图的 expectedOutputType。
   * 仅在用户尚未显式设置非默认输出类型时生效（默认 text 模态对应 json）。
   */
  const withIntentExpectedOutputType = (
    baseConfig: typeof processConfig,
    overrides: Partial<typeof processConfig>
  ): typeof processConfig => {
    const merged = { ...baseConfig, ...overrides }

    const guessed = guessOutputTypeFromPromptAndTools({
      userPrompt: merged.userPrompt,
      tools: (merged.tools as any[]) || [],
    })

    if (!guessed) return merged

    const currentExpected = merged.expectedOutputType as OutputType | undefined
    const defaultForText = MODALITY_TO_OUTPUT_TYPE[FIXED_MODALITY]

    // 如果之前没有设置，或者仍然是文本模态的默认 json，则用意图推断的结果覆盖
    if (!currentExpected || currentExpected === defaultForText) {
      return {
        ...merged,
        expectedOutputType: guessed,
      }
    }

    // 用户已经有了明确的非默认选择，则不强制覆盖
    return merged
  }

  const handleChange = (key: string, value: unknown) => {
    // 使用 ref 获取最新配置，避免闭包问题
    const latestConfig = processConfigRef.current
    let nextConfig: typeof processConfig = { ...latestConfig, [key]: value }

    // 当用户修改 userPrompt 时，尝试基于提示词 + 工具配置推断期望输出类型
    if (key === 'userPrompt') {
      nextConfig = withIntentExpectedOutputType(latestConfig, {
        userPrompt: value as string,
      })
    }

    updateConfig(nextConfig)
  }

  /**
   * 当节点的模态（或模型）发生变化时，根据模态为节点设置一个更贴合的期望输出类型。
   * 这个字段主要用于画布上的徽标展示和调试面板的默认值，不会限制用户在输出节点中的实际格式选择。
   */
  const syncExpectedOutputTypeWithModality = (nextModality: ModelModality | undefined) => {
    if (!nextModality) return
    const mapped = MODALITY_TO_OUTPUT_TYPE[nextModality] as OutputType | undefined
    if (!mapped) return

    // 使用 ref 获取最新配置
    const latestConfig = processConfigRef.current

    // 只有当还没有设置 expectedOutputType 时，才会自动写入，避免覆盖用户手工选择
    if (!latestConfig.expectedOutputType) {
      updateConfig({
        ...latestConfig,
        modality: nextModality,
        expectedOutputType: mapped,
      })
    } else if (latestConfig.modality !== nextModality) {
      // 如果之前的模态和现在不一致，同时当前的 expectedOutputType 仍然是旧模态默认值，
      // 则认为用户没有手动修改过，可以安全地跟随模态更新。
      const previousMapped = latestConfig.modality
        ? MODALITY_TO_OUTPUT_TYPE[latestConfig.modality as ModelModality]
        : undefined
      if (!previousMapped || previousMapped === latestConfig.expectedOutputType) {
        updateConfig({
          ...latestConfig,
          modality: nextModality,
          expectedOutputType: mapped,
        })
      } else {
        // 用户已经手动调整过输出类型，只同步 modality，不再强制覆盖 expectedOutputType
        updateConfig({
          ...latestConfig,
          modality: nextModality,
        })
      }
    }
  }

  const handleRAGConfigChange = (key: keyof RAGConfig, value: number) => {
    handleChange('ragConfig', { ...ragConfig, [key]: value })
  }

  // 当选择服务商时，自动填充默认模型
  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    // 使用 ref 获取最新配置
    const latestConfig = processConfigRef.current
    // 切换服务商时，始终更新为新服务商的默认模型
    // 因为不同服务商的模型列表不同，旧的 model 可能在新服务商中不存在
    const nextConfig = {
      ...latestConfig,
      aiConfigId: configId,
      model: selected?.defaultModel || '',
    }

    // 根据默认模型推断模态，并同步期望输出类型
    const nextModality = FIXED_MODALITY
    syncExpectedOutputTypeWithModality(nextModality)

    updateConfig(nextConfig)
  }

  const addKnowledgeItem = () => {
    const newItem: KnowledgeItem = {
      id: `kb_${Date.now()}`,
      name: `知识库 ${knowledgeItems.length + 1}`,
      content: '',
    }
    handleChange('knowledgeItems', [...knowledgeItems, newItem])
  }

  const updateKnowledgeItem = (index: number, updates: Partial<KnowledgeItem>) => {
    const newItems = [...knowledgeItems]
    newItems[index] = { ...newItems[index], ...updates }
    handleChange('knowledgeItems', newItems)
  }

  const removeKnowledgeItem = (index: number) => {
    const newItems = knowledgeItems.filter((_, i) => i !== index)
    handleChange('knowledgeItems', newItems)
  }

  // 处理工具配置变更
  const handleToolsChange = (tools: ToolConfig[]) => {
    // 检查是否有启用的工具
    const hasEnabledTools = tools.some(tool => tool.enabled)

    // 使用 ref 获取最新配置
    const latestConfig = processConfigRef.current

    // 先根据新的工具配置和现有提示词，推断一个更贴合意图的 expectedOutputType
    const intentSynced = withIntentExpectedOutputType(latestConfig, {
      tools,
    })

    // 更新工具配置，同时自动设置 enableToolCalling
    updateConfig({
      ...intentSynced,
      tools,
      enableToolCalling: hasEnabledTools,
    })
  }

  // 处理输出类型变更
  const handleExpectedOutputTypeChange = useCallback((type: OutputType) => {
    // 使用 ref 获取最新配置，避免闭包陷阱
    const latestConfig = processConfigRef.current
    updateConfig({
      ...latestConfig,
      expectedOutputType: type,
    })
  }, [updateConfig])

  const selectedProvider = providers.find(p => p.id === processConfig.aiConfigId)
  const selectedKB = knowledgeBases.find(kb => kb.id === processConfig.knowledgeBaseId)

  // Tab 配置
  const tabs: { key: ProcessTabType; label: string; badge?: number }[] = [
    { key: 'ai', label: 'AI 配置' },
    { key: 'knowledge', label: '引用知识库', badge: (knowledgeItems.length + (processConfig.knowledgeBaseId ? 1 : 0)) || undefined },
    { key: 'prompt', label: '提示词' },
    { key: 'output', label: '输出' },
  ]

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* AI 配置 Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-4">
          {loadingProviders ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载服务商...
            </div>
          ) : providers.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>尚未配置 AI 服务商，请前往 <a href="/settings/ai-config" className="underline font-medium">设置 → AI 配置</a> 添加</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>服务商配置</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={processConfig.aiConfigId || ''}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  <option value="">选择服务商配置...</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName}{provider.isDefault ? ' (默认)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>模型</Label>
                {selectedProvider && selectedProvider.models && selectedProvider.models.length > 0 ? (
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={processConfig.model || selectedProvider.defaultModel || ''}
                    onChange={(e) => handleChange('model', e.target.value)}
                  >
                    {selectedProvider.models.map((model) => (
                      <option key={model} value={model}>
                        {model}{model === selectedProvider.defaultModel ? ' (默认)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={processConfig.model || ''}
                    onChange={(e) => handleChange('model', e.target.value)}
                    placeholder={selectedProvider?.defaultModel || '输入模型名称'}
                  />
                )}
                {selectedProvider && (
                  <p className="text-xs text-muted-foreground">
                    默认模型: {selectedProvider.defaultModel}
                  </p>
                )}
              </div>

              {/* 文本/代码模态的参数配置 */}
              {(selectedModality === 'text' || selectedModality === 'code') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Temperature</Label>
                    <Input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={processConfig.temperature || 0.7}
                      onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Tokens</Label>
                    <Input
                      type="number"
                      min="1"
                      max="128000"
                      value={processConfig.maxTokens || 2048}
                      onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {/* 模态特定配置 */}
              <ModalityConfig
                modality={selectedModality}
                config={processConfig}
                onChange={handleChange}
              />
            </>
          )}
        </div>
      )}

      {/* 知识库 Tab */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          {/* RAG 知识库选择 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">RAG 知识库</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              选择知识库，AI 将自动检索相关内容作为上下文
            </p>

            {loadingKBs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载知识库...
              </div>
            ) : (
              <>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={processConfig.knowledgeBaseId || ''}
                  onChange={(e) => handleChange('knowledgeBaseId', e.target.value || undefined)}
                >
                  <option value="">不使用知识库</option>
                  {knowledgeBases.filter(kb => kb.isActive).map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name} ({kb.documentCount} 文档, {kb.chunkCount} 分块)
                    </option>
                  ))}
                </select>

                {selectedKB && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Database className="h-4 w-4" />
                      <span className="font-medium">{selectedKB.name}</span>
                    </div>
                    {selectedKB.description && (
                      <p className="text-xs text-muted-foreground">{selectedKB.description}</p>
                    )}

                    {/* RAG 配置 */}
                    <div className="space-y-3 pt-2 border-t">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">检索数量 (Top K)</Label>
                          <span className="text-xs text-muted-foreground">{ragConfig.topK}</span>
                        </div>
                        <Slider
                          value={[ragConfig.topK || 5]}
                          onValueChange={([v]) => handleRAGConfigChange('topK', v)}
                          min={1}
                          max={20}
                          step={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">相似度阈值</Label>
                          <span className="text-xs text-muted-foreground">{(ragConfig.threshold || 0.7).toFixed(2)}</span>
                        </div>
                        <Slider
                          value={[ragConfig.threshold || 0.7]}
                          onValueChange={([v]) => handleRAGConfigChange('threshold', v)}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {knowledgeBases.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    暂无可用知识库，请先 <Link href="/knowledge-bases" className="text-primary underline">创建知识库</Link>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t pt-4" />

          {/* 静态知识库 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <div>
                  <Label className="text-sm font-medium">静态知识</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    添加固定文本作为 AI 参考上下文
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={addKnowledgeItem}>
                <Plus className="mr-1 h-3 w-3" />
                添加
              </Button>
            </div>

            {knowledgeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed rounded-lg">
                <div className="text-muted-foreground mb-2">
                  <svg className="h-8 w-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">
                  点击「添加」按钮添加静态参考资料
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {knowledgeItems.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Input
                        value={item.name}
                        onChange={(e) => updateKnowledgeItem(index, { name: e.target.value })}
                        className="h-8 text-sm font-medium flex-1 mr-2"
                        placeholder="知识库名称"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeKnowledgeItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <textarea
                      className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                      placeholder="输入知识库内容..."
                      value={item.content}
                      onChange={(e) => updateKnowledgeItem(index, { content: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 提示词 Tab */}
      {activeTab === 'prompt' && (
        <PromptTabContent
          processConfig={processConfig}
          knowledgeItems={knowledgeItems}
          onSystemPromptChange={(value) => handleChange('systemPrompt', value)}
          onUserPromptChange={(value) => handleChange('userPrompt', value)}
          onToolsChange={handleToolsChange}
          onExpectedOutputTypeChange={handleExpectedOutputTypeChange}
        />
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
