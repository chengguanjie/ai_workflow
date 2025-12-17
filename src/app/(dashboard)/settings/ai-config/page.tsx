'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, TestTube, Check, X, Star, ChevronDown, ChevronUp } from 'lucide-react'

// AI 服务商配置 - 包含预设模型
const AI_PROVIDERS = [
  {
    id: 'SHENSUAN',
    name: '胜算云',
    description: '支持 Claude、Gemini、DeepSeek 等多种模型',
    placeholder: 'hUVll9...',
    defaultBaseUrl: 'https://router.shengsuanyun.com/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4.5',
    presetModels: [
      { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', description: '最强大的 Claude 模型' },
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: '平衡性能与速度' },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', description: '最快速的 Claude 模型' },
      { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Google 最新模型' },
      { id: 'deepseek/deepseek-v3.2-think', name: 'DeepSeek V3.2 Think', description: '深度思考推理模型' },
    ],
  },
  {
    id: 'OPENROUTER',
    name: 'OpenRouter',
    description: '国际 AI 服务聚合平台，支持多种模型',
    placeholder: 'sk-or-v1-...',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4.5',
    presetModels: [
      { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', description: '最强大的 Claude 模型' },
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: '平衡性能与速度' },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', description: '最快速的 Claude 模型' },
      { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Google 最新模型' },
    ],
  },
] as const

type AIProviderType = typeof AI_PROVIDERS[number]['id']

interface ProviderConfig {
  id: string
  provider: AIProviderType
  name: string
  baseUrl: string
  defaultModel: string
  models: string[]
  keyMasked?: string
  isDefault: boolean
  isActive: boolean
}

interface NewProviderForm {
  provider: AIProviderType
  name: string
  baseUrl: string
  defaultModel: string
  selectedModels: string[]
  apiKey: string
}

export default function AIConfigPage() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null)
  const [newForm, setNewForm] = useState<NewProviderForm>({
    provider: 'SHENSUAN',
    name: '',
    baseUrl: AI_PROVIDERS[0].defaultBaseUrl,
    defaultModel: AI_PROVIDERS[0].defaultModel,
    selectedModels: AI_PROVIDERS[0].presetModels.map(m => m.id),
    apiKey: '',
  })

  // 加载现有配置
  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    try {
      const res = await fetch('/api/settings/ai-config')
      if (res.ok) {
        const data = await res.json()
        setConfigs(data.configs || [])
      }
    } catch (error) {
      console.error('Failed to load AI configs:', error)
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  // 获取当前服务商的配置信息
  const getProviderInfo = (providerId: AIProviderType) => {
    return AI_PROVIDERS.find(p => p.id === providerId)
  }

  // 切换服务商时更新表单
  const handleProviderChange = (providerId: AIProviderType) => {
    const info = getProviderInfo(providerId)
    if (info) {
      setNewForm(prev => ({
        ...prev,
        provider: providerId,
        baseUrl: info.defaultBaseUrl,
        defaultModel: info.defaultModel,
        selectedModels: info.presetModels.map(m => m.id),
      }))
    }
  }

  // 切换模型选择
  const toggleModelSelection = (modelId: string) => {
    setNewForm(prev => ({
      ...prev,
      selectedModels: prev.selectedModels.includes(modelId)
        ? prev.selectedModels.filter(id => id !== modelId)
        : [...prev.selectedModels, modelId],
    }))
  }

  // 添加新配置
  const handleAddConfig = async () => {
    if (!newForm.name.trim()) {
      toast.error('请输入配置名称')
      return
    }
    if (!newForm.apiKey.trim()) {
      toast.error('请输入 API Key')
      return
    }
    if (newForm.selectedModels.length === 0) {
      toast.error('请至少选择一个模型')
      return
    }

    setSaving('new')
    try {
      const res = await fetch('/api/settings/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newForm.provider,
          name: newForm.name,
          baseUrl: newForm.baseUrl,
          defaultModel: newForm.defaultModel,
          models: newForm.selectedModels,
          apiKey: newForm.apiKey,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '添加失败')
      }

      toast.success('配置已添加')
      setShowAddForm(false)
      // 重置表单
      const defaultProvider = AI_PROVIDERS[0]
      setNewForm({
        provider: 'SHENSUAN',
        name: '',
        baseUrl: defaultProvider.defaultBaseUrl,
        defaultModel: defaultProvider.defaultModel,
        selectedModels: defaultProvider.presetModels.map(m => m.id),
        apiKey: '',
      })
      loadConfigs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败')
    } finally {
      setSaving(null)
    }
  }

  // 删除配置
  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('确定删除这个配置吗？')) return

    setSaving(configId)
    try {
      const res = await fetch(`/api/settings/ai-config/${configId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('删除失败')
      }

      toast.success('配置已删除')
      loadConfigs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setSaving(null)
    }
  }

  // 设为默认
  const handleSetDefault = async (configId: string) => {
    setSaving(configId)
    try {
      const res = await fetch(`/api/settings/ai-config/${configId}/default`, {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('设置失败')
      }

      toast.success('已设为默认配置')
      loadConfigs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置失败')
    } finally {
      setSaving(null)
    }
  }

  // 测试连接
  const handleTestConfig = async (configId: string) => {
    setTesting(configId)
    try {
      const res = await fetch(`/api/settings/ai-config/${configId}/test`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '连接测试失败')
      }

      toast.success(`连接成功！模型: ${data.model}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '连接测试失败')
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currentProviderInfo = getProviderInfo(newForm.provider)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI 配置</h1>
        <p className="text-muted-foreground">
          配置企业级 AI 服务商，工作流节点可以选择使用这些配置
        </p>
      </div>

      {/* 已配置的服务商列表 */}
      <div className="space-y-4">
        {configs.length === 0 && !showAddForm && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <p className="text-muted-foreground mb-4">尚未配置任何 AI 服务商</p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                添加配置
              </Button>
            </CardContent>
          </Card>
        )}

        {configs.map((config) => {
          const providerInfo = getProviderInfo(config.provider)
          const isExpanded = expandedConfig === config.id
          return (
            <Card key={config.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{config.name}</CardTitle>
                    <Badge variant="secondary">{providerInfo?.name}</Badge>
                    {config.isDefault && (
                      <Badge variant="default" className="bg-primary">
                        <Star className="mr-1 h-3 w-3" />
                        默认
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConfig(config.id)}
                      disabled={testing === config.id}
                    >
                      {testing === config.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <TestTube className="mr-1 h-3 w-3" />
                      )}
                      测试
                    </Button>
                    {!config.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(config.id)}
                        disabled={saving === config.id}
                      >
                        {saving === config.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Star className="mr-1 h-3 w-3" />
                        )}
                        设为默认
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteConfig(config.id)}
                      disabled={saving === config.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">默认模型：</span>
                    <span className="ml-2 font-mono text-xs">{config.defaultModel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">API Key：</span>
                    <span className="ml-2 font-mono">{config.keyMasked}</span>
                  </div>
                </div>

                {config.baseUrl && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Base URL：</span>
                    <span className="ml-2 font-mono text-xs">{config.baseUrl}</span>
                  </div>
                )}

                {/* 展开/收起可用模型 */}
                <div>
                  <button
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpandedConfig(isExpanded ? null : config.id)}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    可用模型 ({config.models?.length || 0})
                  </button>

                  {isExpanded && config.models && config.models.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {config.models.map((model) => (
                        <Badge key={model} variant="outline" className="font-mono text-xs">
                          {model}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 添加新配置表单 */}
      {showAddForm ? (
        <Card>
          <CardHeader>
            <CardTitle>添加 AI 配置</CardTitle>
            <CardDescription>
              配置新的 AI 服务商，API Key 将被安全加密存储
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>服务商</Label>
                <Select
                  value={newForm.provider}
                  onValueChange={(value: AIProviderType) => handleProviderChange(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {currentProviderInfo?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label>配置名称</Label>
                <Input
                  placeholder="例如：生产环境、测试环境"
                  value={newForm.name}
                  onChange={e => setNewForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>API Base URL</Label>
              <Input
                placeholder={currentProviderInfo?.defaultBaseUrl}
                value={newForm.baseUrl}
                onChange={e => setNewForm(prev => ({ ...prev, baseUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                API 请求的基础地址
              </p>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={currentProviderInfo?.placeholder}
                value={newForm.apiKey}
                onChange={e => setNewForm(prev => ({ ...prev, apiKey: e.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <Label>可用模型</Label>
              <p className="text-xs text-muted-foreground">
                选择此配置下可使用的模型，节点配置时可从这些模型中选择
              </p>
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto border rounded-lg p-3">
                {currentProviderInfo?.presetModels.map((model) => (
                  <label
                    key={model.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={newForm.selectedModels.includes(model.id)}
                      onCheckedChange={() => toggleModelSelection(model.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{model.name}</p>
                      <p className="text-xs text-muted-foreground">{model.description}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{model.id}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>默认模型</Label>
              <Select
                value={newForm.defaultModel}
                onValueChange={(value) => setNewForm(prev => ({ ...prev, defaultModel: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择默认模型" />
                </SelectTrigger>
                <SelectContent>
                  {newForm.selectedModels.map(modelId => {
                    const model = currentProviderInfo?.presetModels.find(m => m.id === modelId)
                    return (
                      <SelectItem key={modelId} value={modelId}>
                        {model?.name || modelId}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                节点未指定模型时使用此默认模型
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleAddConfig} disabled={saving === 'new'}>
                {saving === 'new' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                保存配置
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                <X className="mr-2 h-4 w-4" />
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : configs.length > 0 && (
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加配置
        </Button>
      )}
    </div>
  )
}
