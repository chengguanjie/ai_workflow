'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { ModelModality } from '@/lib/ai/types'
import { SHENSUAN_DEFAULT_MODELS } from '@/lib/ai/types'

// ============================================
// Types
// ============================================

interface AIProviderConfig {
  id: string
  name: string
  provider: string
  baseUrl?: string
  defaultModel: string
  models: string[]
  isDefault: boolean
  displayName: string
}

interface ModelSelectorProps {
  modality: ModelModality
  selectedProvider?: string
  selectedModel?: string
  onProviderChange: (providerId: string) => void
  onModelChange: (model: string) => void
  disabled?: boolean
  className?: string
}

// ============================================
// ModelSelector Component
// ============================================

/**
 * ModelSelector - A component for selecting AI provider and model
 * 
 * Dynamically loads models based on the selected modality and automatically
 * selects the default model for that modality when the modality changes.
 */
export function ModelSelector({
  modality,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  disabled = false,
  className
}: ModelSelectorProps) {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Use refs to store the latest callback values to avoid re-triggering useEffect
  const onProviderChangeRef = useRef(onProviderChange)
  const onModelChangeRef = useRef(onModelChange)
  const selectedProviderRef = useRef(selectedProvider)
  const selectedModelRef = useRef(selectedModel)
  
  // Update refs when props change
  useEffect(() => {
    onProviderChangeRef.current = onProviderChange
    onModelChangeRef.current = onModelChange
    selectedProviderRef.current = selectedProvider
    selectedModelRef.current = selectedModel
  })

  // Load providers when modality changes
  useEffect(() => {
    let isMounted = true
    
    async function loadProviders() {
      setLoading(true)
      setError(null)
      
      try {
        const url = `/api/ai/providers?modality=${modality}`
        const res = await fetch(url)
        
        if (!res.ok) {
          throw new Error('Failed to load providers')
        }
        
        const resData = await res.json()
        
        if (!isMounted) return
        
        if (resData.success && resData.data) {
          const providerList = resData.data.providers || []
          setProviders(providerList)
          
          // Auto-select default provider and model if not already selected
          if (providerList.length > 0) {
            const defaultProvider = resData.data.defaultProvider || providerList[0]
            
            // If no provider is selected, select the default one
            if (!selectedProviderRef.current) {
              onProviderChangeRef.current(defaultProvider.id)
              onModelChangeRef.current(defaultProvider.defaultModel)
            } else {
              // Provider is selected, check if we need to update the model
              const currentProvider = providerList.find((p: AIProviderConfig) => p.id === selectedProviderRef.current)
              if (currentProvider) {
                // If current model is not in the new model list, select the default
                if (!currentProvider.models.includes(selectedModelRef.current || '')) {
                  onModelChangeRef.current(currentProvider.defaultModel)
                }
              } else {
                // Current provider not found, select default
                onProviderChangeRef.current(defaultProvider.id)
                onModelChangeRef.current(defaultProvider.defaultModel)
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load providers:', err)
        if (isMounted) {
          setError('加载服务商列表失败')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    
    loadProviders()
    
    return () => {
      isMounted = false
    }
  }, [modality]) // Only reload when modality changes

  // Handle provider change
  const handleProviderChange = useCallback((providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    onProviderChange(providerId)
    
    // Auto-select the default model for this provider
    if (provider) {
      onModelChange(provider.defaultModel)
    }
  }, [providers, onProviderChange, onModelChange])

  // Get current provider
  const currentProvider = providers.find(p => p.id === selectedProvider)

  if (loading) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载模型列表...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            尚未配置 AI 服务商，请前往{' '}
            <a href="/settings/ai-config" className="underline font-medium">
              设置 → AI 配置
            </a>{' '}
            添加
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Provider Select */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            服务商配置
          </Label>
          <Select
            value={selectedProvider || ''}
            onValueChange={handleProviderChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="选择服务商配置..." />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.displayName}
                  {provider.isDefault && ' (默认)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Model Select */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            模型
          </Label>
          {currentProvider && currentProvider.models.length > 0 ? (
            <Select
              value={selectedModel || currentProvider.defaultModel || ''}
              onValueChange={onModelChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder="选择模型..." />
              </SelectTrigger>
              <SelectContent>
                {currentProvider.models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                    {model === currentProvider.defaultModel && ' (默认)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-xs text-muted-foreground py-2">
              请先选择服务商配置
            </div>
          )}
          {currentProvider && (
            <p className="text-xs text-muted-foreground mt-1">
              默认模型: {currentProvider.defaultModel}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get the default model for a given modality
 */
export function getDefaultModelForModality(modality: ModelModality): string {
  return SHENSUAN_DEFAULT_MODELS[modality] || SHENSUAN_DEFAULT_MODELS.text
}

/**
 * Filter models by modality from a provider's model list
 */
export function filterModelsByModality(
  models: string[],
  modality: ModelModality,
  modalityModels: Record<ModelModality, readonly string[]>
): string[] {
  const allowedModels = modalityModels[modality] || []
  return models.filter(model => allowedModels.includes(model))
}

export default ModelSelector
