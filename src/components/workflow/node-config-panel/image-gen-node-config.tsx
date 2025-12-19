'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertCircle, Image as ImageIcon, Wand2 } from 'lucide-react'
import { HighlightedTextarea } from './shared/highlighted-textarea'
import { OutputTabContent } from './shared/output-tab-content'
import type { ImageGenNodeConfigData, ImageSize, ImageQuality, ImageGenProvider } from '@/types/workflow'

type ImageGenTabType = 'basic' | 'advanced' | 'output'

interface AIProviderConfig {
  id: string
  provider: string
  displayName: string
  defaultModel: string
  models: string[]
  isDefault: boolean
}

interface ImageGenNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

const SIZE_OPTIONS: { value: ImageSize; label: string }[] = [
  { value: '256x256', label: '256×256 (小)' },
  { value: '512x512', label: '512×512 (中)' },
  { value: '1024x1024', label: '1024×1024 (标准)' },
  { value: '1024x1792', label: '1024×1792 (竖版)' },
  { value: '1792x1024', label: '1792×1024 (横版)' },
]

const QUALITY_OPTIONS: { value: ImageQuality; label: string; description: string }[] = [
  { value: 'standard', label: '标准', description: '更快生成速度' },
  { value: 'hd', label: '高清', description: '更高图像质量' },
]

const PROVIDER_OPTIONS: { value: ImageGenProvider; label: string }[] = [
  { value: 'OPENAI', label: 'OpenAI (DALL-E)' },
  { value: 'STABILITYAI', label: 'Stability AI' },
  { value: 'ALIYUN_TONGYI', label: '阿里通义' },
  { value: 'SHENSUAN', label: '胜算云' },
]

const STYLE_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'vivid', label: '鲜明' },
  { value: 'natural', label: '自然' },
]

export function ImageGenNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: ImageGenNodeConfigPanelProps) {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [activeTab, setActiveTab] = useState<ImageGenTabType>('basic')

  const imageGenConfig = (config || {}) as ImageGenNodeConfigData

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          // 过滤支持图像生成的服务商
          const imageProviders = (data.providers || []).filter((p: AIProviderConfig) =>
            ['OPENAI', 'STABILITYAI', 'ALIYUN_TONGYI', 'SHENSUAN'].includes(p.provider)
          )
          setProviders(imageProviders)

          // 如果节点没有选择配置，或者当前配置已不存在，使用默认配置
          const currentConfigExists = imageGenConfig.aiConfigId &&
            imageProviders.some((p: AIProviderConfig) => p.id === imageGenConfig.aiConfigId)

          if (!currentConfigExists && imageProviders.length > 0) {
            const defaultProvider = imageProviders.find((p: AIProviderConfig) => p.isDefault) || imageProviders[0]
            onUpdate({
              ...imageGenConfig,
              aiConfigId: defaultProvider.id,
              provider: defaultProvider.provider as ImageGenProvider,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...imageGenConfig, [key]: value })
  }

  // 当选择服务商时，更新配置
  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    handleChange('aiConfigId', configId)
    if (selected) {
      handleChange('provider', selected.provider as ImageGenProvider)
    }
  }

  const selectedProvider = providers.find(p => p.id === imageGenConfig.aiConfigId)

  // Tab 配置
  const tabs: { key: ImageGenTabType; label: string }[] = [
    { key: 'basic', label: '基本配置' },
    { key: 'advanced', label: '高级选项' },
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
          </button>
        ))}
      </div>

      {/* 基本配置 Tab */}
      {activeTab === 'basic' && (
        <div className="space-y-4">
          {/* 服务商选择 */}
          {loadingProviders ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载服务商...
            </div>
          ) : providers.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                尚未配置支持图像生成的 AI 服务商，请前往{' '}
                <a href="/settings/ai-config" className="underline font-medium">设置 → AI 配置</a>{' '}
                添加 OpenAI 或 Stability AI
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>服务商配置</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={imageGenConfig.aiConfigId || ''}
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
          )}

          {/* 模型选择 */}
          {selectedProvider && (
            <div className="space-y-2">
              <Label>模型</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={imageGenConfig.imageModel || ''}
                onChange={(e) => handleChange('imageModel', e.target.value)}
              >
                <option value="">使用默认模型</option>
                {selectedProvider.provider === 'OPENAI' && (
                  <>
                    <option value="dall-e-3">DALL-E 3 (推荐)</option>
                    <option value="dall-e-2">DALL-E 2</option>
                  </>
                )}
                {selectedProvider.provider === 'STABILITYAI' && (
                  <>
                    <option value="stable-diffusion-xl-1024-v1-0">SDXL 1.0</option>
                    <option value="stable-diffusion-v1-6">SD 1.6</option>
                  </>
                )}
              </select>
            </div>
          )}

          {/* 图像描述提示词 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <Label>图像描述</Label>
            </div>
            <HighlightedTextarea
              className="bg-background"
              placeholder="描述你想生成的图像，支持使用 {{节点名.字段}} 引用其他节点的输出..."
              value={imageGenConfig.prompt || ''}
              onChange={(value) => handleChange('prompt', value)}
              minHeight="120px"
            />
            <p className="text-xs text-muted-foreground">
              提示：详细描述场景、风格、颜色、氛围等细节可以获得更好的效果
            </p>
          </div>

          {/* 图像尺寸 */}
          <div className="space-y-2">
            <Label>图像尺寸</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={imageGenConfig.size || '1024x1024'}
              onChange={(e) => handleChange('size', e.target.value as ImageSize)}
            >
              {SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 生成数量 */}
          <div className="space-y-2">
            <Label>生成数量</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="4"
                value={imageGenConfig.n || 1}
                onChange={(e) => handleChange('n', parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">张图片（最多 4 张）</span>
            </div>
          </div>
        </div>
      )}

      {/* 高级选项 Tab */}
      {activeTab === 'advanced' && (
        <div className="space-y-4">
          {/* 图像质量 */}
          <div className="space-y-2">
            <Label>图像质量</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    (imageGenConfig.quality || 'standard') === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50'
                  }`}
                  onClick={() => handleChange('quality', option.value)}
                >
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 风格预设 */}
          <div className="space-y-2">
            <Label>风格预设</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={imageGenConfig.style || ''}
              onChange={(e) => handleChange('style', e.target.value || undefined)}
            >
              {STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              仅 DALL-E 3 支持风格预设
            </p>
          </div>

          {/* 负面提示词 */}
          <div className="space-y-2">
            <Label>负面提示词（可选）</Label>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="描述不希望出现在图像中的元素..."
              value={imageGenConfig.negativePrompt || ''}
              onChange={(e) => handleChange('negativePrompt', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              仅 Stability AI 支持负面提示词
            </p>
          </div>

          {/* 输出文件名 */}
          <div className="space-y-2">
            <Label>输出文件名（可选）</Label>
            <Input
              placeholder="例如：generated_{{timestamp}}.png"
              value={imageGenConfig.outputFileName || ''}
              onChange={(e) => handleChange('outputFileName', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              支持变量：{'{{timestamp}}'}, {'{{index}}'}
            </p>
          </div>

          {/* 参考图片 URL */}
          <div className="space-y-2">
            <Label>参考图片 URL（可选）</Label>
            <Input
              placeholder="https://example.com/reference.jpg"
              value={imageGenConfig.referenceImageUrl || ''}
              onChange={(e) => handleChange('referenceImageUrl', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              用于图生图功能（部分模型支持）
            </p>
          </div>
        </div>
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}

      {/* 预览区域 */}
      {imageGenConfig.prompt && (
        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" />
            配置预览
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>尺寸: {imageGenConfig.size || '1024x1024'}</div>
            <div>数量: {imageGenConfig.n || 1} 张</div>
            <div>质量: {imageGenConfig.quality === 'hd' ? '高清' : '标准'}</div>
            {imageGenConfig.style && <div>风格: {imageGenConfig.style}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
