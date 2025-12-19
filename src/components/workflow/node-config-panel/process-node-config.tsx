'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Loader2, AlertCircle } from 'lucide-react'
import type { KnowledgeItem } from '@/types/workflow'
import { PromptTabContent } from './shared/prompt-tab-content'
import type { AIProviderConfig } from './shared/types'

type ProcessTabType = 'ai' | 'knowledge' | 'prompt'

interface ProcessNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function ProcessNodeConfigPanel({
  config,
  onUpdate,
}: ProcessNodeConfigPanelProps) {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [activeTab, setActiveTab] = useState<ProcessTabType>('ai')

  const processConfig = config as {
    aiConfigId?: string // 企业配置 ID
    model?: string
    knowledgeItems?: KnowledgeItem[]
    systemPrompt?: string
    userPrompt?: string
    temperature?: number
    maxTokens?: number
  } || {}

  const knowledgeItems = processConfig.knowledgeItems || []

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          setProviders(data.providers || [])
          // 如果节点没有选择配置，使用默认配置
          if (!processConfig.aiConfigId && data.defaultProvider) {
            onUpdate({
              ...processConfig,
              aiConfigId: data.defaultProvider.id,
              model: data.defaultProvider.defaultModel,
            })
          }
        }
      } catch (error) {
        console.error('Failed to load providers:', error)
      } finally {
        setLoadingProviders(false)
      }
    }
    loadProviders()
  }, [])

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...processConfig, [key]: value })
  }

  // 当选择服务商时，自动填充默认模型
  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    handleChange('aiConfigId', configId)
    if (selected && !processConfig.model) {
      handleChange('model', selected.defaultModel)
    }
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

  // Tab 配置
  const tabs: { key: ProcessTabType; label: string; badge?: number }[] = [
    { key: 'ai', label: 'AI 配置' },
    { key: 'knowledge', label: '知识库', badge: knowledgeItems.length || undefined },
    { key: 'prompt', label: '提示词' },
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>参考知识库</Label>
              <p className="text-xs text-muted-foreground mt-1">
                添加知识库文本作为 AI 参考上下文
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addKnowledgeItem}>
              <Plus className="mr-1 h-3 w-3" />
              添加
            </Button>
          </div>

          {knowledgeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg">
              <div className="text-muted-foreground mb-2">
                <svg className="h-10 w-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                暂无知识库
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                点击上方「添加」按钮添加参考资料
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
                    className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                    placeholder="输入知识库内容..."
                    value={item.content}
                    onChange={(e) => updateKnowledgeItem(index, { content: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    引用方式: {'{{'}知识库.{item.name}{'}}'}
                  </p>
                </div>
              ))}
            </div>
          )}
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
    </div>
  )
}
