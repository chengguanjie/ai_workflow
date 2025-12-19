'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, AlertCircle } from 'lucide-react'
import type { AIProviderConfig } from './types'

interface AIProviderSelectProps {
  aiConfigId?: string
  model?: string
  temperature?: number
  maxTokens?: number
  onProviderChange: (configId: string) => void
  onModelChange: (model: string) => void
  onTemperatureChange?: (temperature: number) => void
  onMaxTokensChange?: (maxTokens: number) => void
  showAdvancedSettings?: boolean
  defaultTemperature?: number
  defaultMaxTokens?: number
}

export function AIProviderSelect({
  aiConfigId,
  model,
  temperature,
  maxTokens,
  onProviderChange,
  onModelChange,
  onTemperatureChange,
  onMaxTokensChange,
  showAdvancedSettings = true,
  defaultTemperature = 0.7,
  defaultMaxTokens = 2048,
}: AIProviderSelectProps) {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          setProviders(data.providers || [])
          // 如果节点没有选择配置，使用默认配置
          if (!aiConfigId && data.defaultProvider) {
            onProviderChange(data.defaultProvider.id)
            if (!model) {
              onModelChange(data.defaultProvider.defaultModel)
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
  }, [])

  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    onProviderChange(configId)
    if (selected && !model) {
      onModelChange(selected.defaultModel)
    }
  }

  const selectedProvider = providers.find(p => p.id === aiConfigId)

  if (loadingProviders) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载服务商...
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>尚未配置 AI 服务商，请前往 <a href="/settings/ai-config" className="underline font-medium">设置 → AI 配置</a> 添加</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>服务商配置</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={aiConfigId || ''}
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
            value={model || selectedProvider.defaultModel || ''}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {selectedProvider.models.map((m) => (
              <option key={m} value={m}>
                {m}{m === selectedProvider.defaultModel ? ' (默认)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={model || ''}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={selectedProvider?.defaultModel || '输入模型名称'}
          />
        )}
        {selectedProvider && (
          <p className="text-xs text-muted-foreground">
            默认模型: {selectedProvider.defaultModel}
          </p>
        )}
      </div>

      {showAdvancedSettings && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Temperature</Label>
            <Input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature ?? defaultTemperature}
              onChange={(e) => onTemperatureChange?.(parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Tokens</Label>
            <Input
              type="number"
              min="1"
              max="128000"
              value={maxTokens ?? defaultMaxTokens}
              onChange={(e) => onMaxTokensChange?.(parseInt(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Hook to load providers (for components that need more control)
export function useAIProviders() {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [defaultProvider, setDefaultProvider] = useState<AIProviderConfig | null>(null)

  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          setProviders(data.providers || [])
          setDefaultProvider(data.defaultProvider || null)
        }
      } catch (error) {
        console.error('Failed to load providers:', error)
      } finally {
        setLoading(false)
      }
    }
    loadProviders()
  }, [])

  return { providers, loading, defaultProvider }
}
