'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Loader2, AlertCircle, Database, BookOpen } from 'lucide-react'
import type { KnowledgeItem, RAGConfig } from '@/types/workflow'
import { PromptTabContent } from './shared/prompt-tab-content'
import { OutputTabContent } from './shared/output-tab-content'
import type { AIProviderConfig } from './shared/types'
import { Slider } from '@/components/ui/slider'

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

  const processConfig = config as {
    aiConfigId?: string // 企业配置 ID
    model?: string
    knowledgeItems?: KnowledgeItem[]
    knowledgeBaseId?: string // RAG 知识库 ID
    ragConfig?: RAGConfig
    systemPrompt?: string
    userPrompt?: string
    temperature?: number
    maxTokens?: number
  } || {}

  const knowledgeItems = processConfig.knowledgeItems || []
  const ragConfig = processConfig.ragConfig || { topK: 5, threshold: 0.7 }

  // 加载可用的服务商列表（文本模态）
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers?modality=text')
        if (res.ok) {
          const data = await res.json()
          const providerList = data.providers || []
          setProviders(providerList)

          // 如果节点没有选择配置，或者当前配置已不存在，使用默认配置
          const currentConfigExists = processConfig.aiConfigId &&
            providerList.some((p: AIProviderConfig) => p.id === processConfig.aiConfigId)

          if (!currentConfigExists && data.defaultProvider) {
            // 使用默认服务商配置
            onUpdate({
              ...processConfig,
              aiConfigId: data.defaultProvider.id,
              model: data.defaultProvider.defaultModel, // 始终使用服务商的默认模型
            })
          } else if (currentConfigExists && !processConfig.model) {
            // 配置存在但 model 为空，使用当前服务商的默认模型
            const currentProvider = providerList.find((p: AIProviderConfig) => p.id === processConfig.aiConfigId)
            if (currentProvider?.defaultModel) {
              onUpdate({
                ...processConfig,
                model: currentProvider.defaultModel,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...processConfig, [key]: value })
  }

  const handleRAGConfigChange = (key: keyof RAGConfig, value: number) => {
    handleChange('ragConfig', { ...ragConfig, [key]: value })
  }

  // 当选择服务商时，自动填充默认模型
  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    // 切换服务商时，始终更新为新服务商的默认模型
    // 因为不同服务商的模型列表不同，旧的 model 可能在新服务商中不存在
    onUpdate({
      ...processConfig,
      aiConfigId: configId,
      model: selected?.defaultModel || '',
    })
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

  const selectedProvider = providers.find(p => p.id === processConfig.aiConfigId)
  const selectedKB = knowledgeBases.find(kb => kb.id === processConfig.knowledgeBaseId)

  // Tab 配置
  const tabs: { key: ProcessTabType; label: string; badge?: number }[] = [
    { key: 'ai', label: 'AI 配置' },
    { key: 'knowledge', label: '知识库', badge: (knowledgeItems.length + (processConfig.knowledgeBaseId ? 1 : 0)) || undefined },
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
        />
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
