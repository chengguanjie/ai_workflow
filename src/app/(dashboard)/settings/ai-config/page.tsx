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
import { Loader2, Plus, Trash2, TestTube, Check, X, Star, ChevronDown, ChevronUp, Type, Code, ImageIcon, Video, Mic, FileText, Pencil } from 'lucide-react'
import { type ModelModality, SHENSUAN_MODELS, SHENSUAN_DEFAULT_MODELS } from '@/lib/ai/types'
import { normalizeModels } from '@/lib/ai/normalize-models'

// 模态类型定义
const MODALITY_CONFIG: {
  id: ModelModality
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
    { id: 'text', label: '文本', description: '聊天、推理、内容生成', icon: Type },
    { id: 'code', label: '代码', description: '代码生成与优化', icon: Code },
    { id: 'image-gen', label: '图片生成', description: '文生图、图生图', icon: ImageIcon },
    { id: 'video-gen', label: '视频生成', description: '文生视频、图生视频', icon: Video },
    { id: 'audio-transcription', label: '音频转录', description: '语音转文字', icon: Mic },
    { id: 'audio-tts', label: '语音合成', description: '文字转语音', icon: Mic },
    { id: 'embedding', label: '向量嵌入', description: '文本向量化', icon: FileText },
    { id: 'ocr', label: '图文识别', description: 'OCR、图片理解', icon: FileText },
  ]

// AI 服务商配置 - 包含预设模型（按模态分组）
const AI_PROVIDERS = [
  {
    id: 'SHENSUAN',
    name: '胜算云',
    description: '支持多模态模型：文本、图片、视频、音频等',
    placeholder: 'hUVll9...',
    defaultBaseUrl: 'https://router.shengsuanyun.com/api/v1',
    // 按模态分组的模型
    modelsByModality: {
      text: SHENSUAN_MODELS.text.map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      code: SHENSUAN_MODELS.code.map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      'image-gen': SHENSUAN_MODELS['image-gen'].map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      'video-gen': SHENSUAN_MODELS['video-gen'].map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      'audio-transcription': SHENSUAN_MODELS['audio-transcription'].map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      'audio-tts': SHENSUAN_MODELS['audio-tts'].map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      embedding: SHENSUAN_MODELS.embedding.map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
      ocr: SHENSUAN_MODELS.ocr.map(id => ({
        id,
        name: getModelDisplayName(id),
        description: getModelDescription(id),
      })),
    } as Record<ModelModality, { id: string; name: string; description: string }[]>,
    defaultModels: SHENSUAN_DEFAULT_MODELS,
  },
  {
    id: 'OPENROUTER',
    name: 'OpenRouter',
    description: '国际 AI 服务聚合平台，支持多种模型',
    placeholder: 'sk-or-v1-...',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    modelsByModality: {
      text: [
        { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', description: '最强大的 Claude 模型' },
        { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: '平衡性能与速度' },
        { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', description: '最快速的 Claude 模型' },
        { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', description: 'Google 最新模型' },
      ],
      code: [
        { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', description: '最强大的 Claude 模型' },
        { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: '平衡性能与速度' },
      ],
    } as Record<ModelModality, { id: string; name: string; description: string }[]>,
    defaultModels: {
      text: 'anthropic/claude-sonnet-4.5',
      code: 'anthropic/claude-opus-4.5',
    } as Record<ModelModality, string>,
  },
  {
    id: 'OPENAI',
    name: 'AIGO / OpenAI兼容',
    description: '适用于 AIGO / OneAPI / 自建网关（OpenAI Chat Completions 兼容）',
    placeholder: 'sk-...',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelsByModality: {
      text: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Claude 3.5（原生模型 ID）' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: '更快更便宜（原生模型 ID）' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '强推理（原生模型 ID）' },
        { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: '部分网关使用 OpenRouter 风格 ID' },
        { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', description: '部分网关使用 OpenRouter 风格 ID' },
      ],
      code: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: '代码与推理' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '更强代码能力' },
        { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', description: '部分网关使用 OpenRouter 风格 ID' },
      ],
    } as Record<ModelModality, { id: string; name: string; description: string }[]>,
    defaultModels: {
      text: 'claude-3-5-sonnet-20241022',
      code: 'claude-3-5-sonnet-20241022',
    } as Record<ModelModality, string>,
  },
] as const

// 获取模型显示名称
function getModelDisplayName(modelId: string): string {
  const names: Record<string, string> = {
    'anthropic/claude-opus-4.5': 'Claude Opus 4.5',
    'anthropic/claude-sonnet-4.5:thinking': 'Claude Sonnet 4.5 (思考)',
    'anthropic/claude-haiku-4.5:thinking': 'Claude Haiku 4.5 (思考)',
    'google/gemini-3-pro-preview': 'Gemini 3 Pro',
    'google/gemini-3-flash': 'Gemini 3 Flash',
    'openai/gpt-5.2': 'GPT-5.2',
    'openai/gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
    'deepseek/deepseek-v3.2-think': 'DeepSeek V3.2 Think',
    'google/gemini-3-pro-image-preview': 'Gemini 3 Pro Image',
    'bytedance/doubao-seedream-4.5': '豆包 Seedream 4.5',
    'ali/qwen-image': '通义千问图像',
    'ali/wan2.6-i2v': '万相 I2V',
    'openai/sora2': 'Sora 2',
    'google/veo3.1-fast-preview': 'Veo 3.1 Fast',
    'kling/kling-v2-5-turbo': '可灵 V2.5 Turbo',
    'openai/whisper': 'Whisper',
    'ali/paraformer-v2': 'Paraformer V2',
    'runway/eleven_text_to_sound_v2': 'Eleven Text to Sound V2',
    'runway/eleven_multilingual_v2': 'Eleven Multilingual V2',
    'openai/text-embedding-3-small': 'Text Embedding 3 Small',
    'openai/text-embedding-3-large': 'Text Embedding 3 Large',
    'openai/text-embedding-ada-002': 'Text Embedding Ada 002',
    'bytedance/doubao-embedding-large': '豆包 Embedding Large',
    'bytedance/doubao-embedding': '豆包 Embedding',
    'ali/qwen-vl-ocr': '通义千问 VL OCR',
    'deepseek/deepseek-ocr': 'DeepSeek OCR',
  }
  return names[modelId] || modelId
}

// 获取模型描述
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'anthropic/claude-opus-4.5': '最强大的 Claude 模型',
    'anthropic/claude-sonnet-4.5:thinking': '平衡性能与速度，带思考',
    'anthropic/claude-haiku-4.5:thinking': '最快速的 Claude 模型，带思考',
    'google/gemini-3-pro-preview': 'Google 最新大模型',
    'google/gemini-3-flash': 'Google 快速模型',
    'openai/gpt-5.2': 'OpenAI 最新模型',
    'openai/gpt-5.1-codex-max': '代码生成优化模型',
    'deepseek/deepseek-v3.2-think': '深度思考推理模型',
    'google/gemini-3-pro-image-preview': '强大的图像生成',
    'bytedance/doubao-seedream-4.5': '字节跳动图像模型',
    'ali/qwen-image': '阿里通义图像生成',
    'ali/wan2.6-i2v': '阿里万相图生视频',
    'openai/sora2': 'OpenAI 视频生成',
    'google/veo3.1-fast-preview': 'Google 快速视频生成',
    'kling/kling-v2-5-turbo': '快手可灵视频模型',
    'openai/whisper': 'OpenAI 语音转录',
    'ali/paraformer-v2': '阿里语音识别',
    'runway/eleven_text_to_sound_v2': '音效生成',
    'runway/eleven_multilingual_v2': '多语言语音合成',
    'openai/text-embedding-3-small': '小型向量模型',
    'openai/text-embedding-3-large': '大型向量模型',
    'openai/text-embedding-ada-002': 'Ada 向量模型',
    'bytedance/doubao-embedding-large': '豆包大型向量',
    'bytedance/doubao-embedding': '豆包向量模型',
    'ali/qwen-vl-ocr': '通义千问图文识别',
    'deepseek/deepseek-ocr': 'DeepSeek OCR 识别',
  }
  return descriptions[modelId] || ''
}

type AIProviderType = typeof AI_PROVIDERS[number]['id']

interface ProviderConfig {
  id: string
  provider: AIProviderType
  name: string
  baseUrl: string
  defaultModel: string
  defaultModels: Record<string, string>
  models: string[]
  keyMasked?: string
  isDefault: boolean
  isActive: boolean
}

interface NewProviderForm {
  provider: AIProviderType
  name: string
  baseUrl: string
  // 按模态选择的模型
  selectedModelsPerModality: Record<ModelModality, string[]>
  // 各模态默认模型
  defaultModels: Record<ModelModality, string>
  apiKey: string
}

// 获取所有模态的所有选中模型（展平为数组）
function getAllSelectedModels(selectedModelsPerModality: Record<ModelModality, string[]>): string[] {
  const allModels = new Set<string>()
  Object.values(selectedModelsPerModality).forEach(models => {
    models.forEach(model => allModels.add(model))
  })
  return Array.from(allModels)
}

// 初始化表单的辅助函数
function initFormForProvider(providerId: AIProviderType): Omit<NewProviderForm, 'name' | 'apiKey'> {
  const provider = AI_PROVIDERS.find(p => p.id === providerId)
  if (!provider) {
    return {
      provider: 'SHENSUAN',
      baseUrl: '',
      selectedModelsPerModality: {} as Record<ModelModality, string[]>,
      defaultModels: {} as Record<ModelModality, string>,
    }
  }

  // 初始化选中模型和默认模型
  const selectedModelsPerModality: Record<ModelModality, string[]> = {} as Record<ModelModality, string[]>
  const defaultModels: Record<ModelModality, string> = {} as Record<ModelModality, string>

  MODALITY_CONFIG.forEach(({ id: modality }) => {
    const models = provider.modelsByModality[modality] || []
    selectedModelsPerModality[modality] = models.map(m => m.id)
    defaultModels[modality] = provider.defaultModels[modality] || models[0]?.id || ''
  })

  return {
    provider: providerId,
    baseUrl: provider.defaultBaseUrl,
    selectedModelsPerModality,
    defaultModels,
  }
}

export default function AIConfigPage() {
  return <AIConfigSettingsView />
}

export function AIConfigSettingsView({ embedded = false }: { embedded?: boolean } = {}) {
  const [configs, setConfigs] = useState<ProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null)
  const [expandedModality, setExpandedModality] = useState<ModelModality | null>('text')

  // 编辑状态
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)

  const initialForm = initFormForProvider('SHENSUAN')
  const [newForm, setNewForm] = useState<NewProviderForm>({
    ...initialForm,
    name: '',
    apiKey: '',
  })

  // 编辑表单状态
  const [editForm, setEditForm] = useState<NewProviderForm & { id: string }>({
    ...initialForm,
    id: '',
    name: '',
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
        const result = await res.json()
        // API returns wrapped response: {success: true, data: {configs: [...]}}
        if (result.success && result.data) {
          const rawConfigs = (result.data.configs || []) as ProviderConfig[]
          setConfigs(
            rawConfigs.map((config) => ({
              ...config,
              models: normalizeModels((config as unknown as { models?: unknown }).models),
            }))
          )
        } else {
          setConfigs([])
        }
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
    const formDefaults = initFormForProvider(providerId)
    setNewForm(prev => ({
      ...prev,
      ...formDefaults,
    }))
  }

  // 切换模型选择（按模态）
  const toggleModelSelection = (modality: ModelModality, modelId: string) => {
    setNewForm(prev => {
      const currentModels = prev.selectedModelsPerModality[modality] || []
      const isSelected = currentModels.includes(modelId)
      const updatedModels = isSelected
        ? currentModels.filter(id => id !== modelId)
        : [...currentModels, modelId]

      // 如果取消选择了当前默认模型，更新默认模型
      const newDefaultModels = { ...prev.defaultModels }
      if (isSelected && prev.defaultModels[modality] === modelId) {
        newDefaultModels[modality] = updatedModels[0] || ''
      }

      return {
        ...prev,
        selectedModelsPerModality: {
          ...prev.selectedModelsPerModality,
          [modality]: updatedModels,
        },
        defaultModels: newDefaultModels,
      }
    })
  }

  // 设置某个模态的默认模型
  const setModalityDefaultModel = (modality: ModelModality, modelId: string) => {
    setNewForm(prev => ({
      ...prev,
      defaultModels: {
        ...prev.defaultModels,
        [modality]: modelId,
      },
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

    // 检查是否至少选择了一个模型
    const allSelectedModels = getAllSelectedModels(newForm.selectedModelsPerModality)
    if (allSelectedModels.length === 0) {
      toast.error('请至少选择一个模型')
      return
    }

    // 获取首个有效的默认模型（兼容旧版本）
    const primaryDefaultModel = newForm.defaultModels.text || newForm.defaultModels.code || allSelectedModels[0]

    setSaving('new')
    try {
      const res = await fetch('/api/settings/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newForm.provider,
          name: newForm.name,
          baseUrl: newForm.baseUrl,
          defaultModel: primaryDefaultModel, // 兼容旧版
          defaultModels: newForm.defaultModels, // 各模态默认模型
          models: allSelectedModels,
          apiKey: newForm.apiKey,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '添加失败'
        throw new Error(errorMessage)
      }

      toast.success('配置已添加')
      setShowAddForm(false)
      // 重置表单
      const formDefaults = initFormForProvider('SHENSUAN')
      setNewForm({
        ...formDefaults,
        name: '',
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

  // 开始编辑配置
  const handleStartEdit = (config: ProviderConfig) => {
    const providerInfo = getProviderInfo(config.provider)
    const normalizedModels = normalizeModels((config as unknown as { models?: unknown }).models)

    // 将现有模型转换为按模态分组的格式
    const selectedModelsPerModality: Record<ModelModality, string[]> = {} as Record<ModelModality, string[]>
    MODALITY_CONFIG.forEach(({ id: modality }) => {
      const availableModels = providerInfo?.modelsByModality[modality] || []
      selectedModelsPerModality[modality] = normalizedModels.filter(m =>
        availableModels.some(am => am.id === m)
      )
    })

    // 获取默认模型
    const defaultModelsObj = config.defaultModels as Record<string, string> || {}
    const defaultModels: Record<ModelModality, string> = {} as Record<ModelModality, string>
    MODALITY_CONFIG.forEach(({ id: modality }) => {
      defaultModels[modality] = defaultModelsObj[modality] || config.defaultModel || ''
    })

    setEditForm({
      id: config.id,
      provider: config.provider,
      name: config.name,
      baseUrl: config.baseUrl,
      selectedModelsPerModality,
      defaultModels,
      apiKey: '', // 不显示现有的 API Key
    })
    setEditingConfigId(config.id)
    setExpandedModality('text')
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingConfigId(null)
    setEditForm({
      ...initialForm,
      id: '',
      name: '',
      apiKey: '',
    })
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error('请输入配置名称')
      return
    }

    const allSelectedModels = getAllSelectedModels(editForm.selectedModelsPerModality)
    if (allSelectedModels.length === 0) {
      toast.error('请至少选择一个模型')
      return
    }

    const primaryDefaultModel = editForm.defaultModels.text || editForm.defaultModels.code || allSelectedModels[0]

    setSaving(editForm.id)
    try {
      const res = await fetch(`/api/settings/ai-config/${editForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          baseUrl: editForm.baseUrl,
          defaultModel: primaryDefaultModel,
          defaultModels: editForm.defaultModels,
          models: allSelectedModels,
          apiKey: editForm.apiKey || undefined, // 只有填写了才更新
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        const errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : errorData.error?.message || '更新失败'
        throw new Error(errorMessage)
      }

      toast.success('配置已更新')
      setEditingConfigId(null)
      loadConfigs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败')
    } finally {
      setSaving(null)
    }
  }

  // 编辑表单中切换模型选择
  const toggleEditModelSelection = (modality: ModelModality, modelId: string) => {
    setEditForm(prev => {
      const currentModels = prev.selectedModelsPerModality[modality] || []
      const isSelected = currentModels.includes(modelId)
      const updatedModels = isSelected
        ? currentModels.filter(id => id !== modelId)
        : [...currentModels, modelId]

      const newDefaultModels = { ...prev.defaultModels }
      if (isSelected && prev.defaultModels[modality] === modelId) {
        newDefaultModels[modality] = updatedModels[0] || ''
      }

      return {
        ...prev,
        selectedModelsPerModality: {
          ...prev.selectedModelsPerModality,
          [modality]: updatedModels,
        },
        defaultModels: newDefaultModels,
      }
    })
  }

  // 编辑表单中设置默认模型
  const setEditModalityDefaultModel = (modality: ModelModality, modelId: string) => {
    setEditForm(prev => ({
      ...prev,
      defaultModels: {
        ...prev.defaultModels,
        [modality]: modelId,
      },
    }))
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
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : data.error?.message || '连接测试失败'
        throw new Error(errorMessage)
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
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">AI 配置</h1>
          <p className="text-muted-foreground">
            配置企业级 AI 服务商，工作流节点可以选择使用这些配置
          </p>
        </div>
      )}

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
          const isEditing = editingConfigId === config.id

          // 编辑模式
          if (isEditing) {
            const editProviderInfo = getProviderInfo(editForm.provider)
            return (
              <Card key={config.id}>
                <CardHeader>
                  <CardTitle>编辑 AI 配置</CardTitle>
                  <CardDescription>
                    修改配置信息，如不需要更新 API Key 可留空
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>服务商</Label>
                      <Input value={editProviderInfo?.name || config.provider} disabled />
                    </div>

                    <div className="space-y-2">
                      <Label>配置名称</Label>
                      <Input
                        placeholder="例如：生产环境、测试环境"
                        value={editForm.name}
                        onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>API Base URL</Label>
                    <Input
                      placeholder={editProviderInfo?.defaultBaseUrl}
                      value={editForm.baseUrl}
                      onChange={e => setEditForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>API Key（留空则不修改）</Label>
                    <Input
                      type="password"
                      placeholder="输入新的 API Key，留空则保持不变"
                      value={editForm.apiKey}
                      onChange={e => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      当前：{config.keyMasked}
                    </p>
                  </div>

                  {/* 按模态分组的模型选择 */}
                  <div className="space-y-3">
                    <Label>可用模型与默认设置</Label>
                    <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                      {MODALITY_CONFIG.map(({ id: modality, label, description, icon: Icon }) => {
                        const models = editProviderInfo?.modelsByModality?.[modality] || []
                        const selectedModels = editForm.selectedModelsPerModality[modality] || []
                        const defaultModel = editForm.defaultModels[modality] || ''
                        const isModalityExpanded = expandedModality === modality
                        const hasModels = models.length > 0

                        if (!hasModels) return null

                        return (
                          <div key={modality} className="bg-background">
                            <button
                              type="button"
                              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                              onClick={() => setExpandedModality(isModalityExpanded ? null : modality)}
                            >
                              <div className="flex items-center gap-3">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <div className="text-left">
                                  <span className="font-medium">{label}</span>
                                  <span className="text-xs text-muted-foreground ml-2">{description}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {selectedModels.length}/{models.length}
                                </Badge>
                                {isModalityExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </button>

                            {isModalityExpanded && (
                              <div className="px-3 pb-3 space-y-3">
                                <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                  <Star className="h-4 w-4 text-amber-500" />
                                  <Label className="text-xs font-normal">默认模型:</Label>
                                  <Select
                                    value={defaultModel}
                                    onValueChange={(value) => setEditModalityDefaultModel(modality, value)}
                                  >
                                    <SelectTrigger className="h-8 flex-1">
                                      <SelectValue placeholder="选择默认模型" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {selectedModels.map(modelId => {
                                        const model = models.find(m => m.id === modelId)
                                        return (
                                          <SelectItem key={modelId} value={modelId}>
                                            {model?.name || modelId}
                                          </SelectItem>
                                        )
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  {models.map((model) => (
                                    <label
                                      key={model.id}
                                      className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={selectedModels.includes(model.id)}
                                        onCheckedChange={() => toggleEditModelSelection(modality, model.id)}
                                        className="mt-0.5"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-medium">{model.name}</p>
                                          {model.id === defaultModel && (
                                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                                              默认
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{model.description}</p>
                                        <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">{model.id}</p>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button onClick={handleSaveEdit} disabled={saving === editForm.id}>
                      {saving === editForm.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      保存修改
                    </Button>
                    <Button variant="outline" onClick={handleCancelEdit}>
                      <X className="mr-2 h-4 w-4" />
                      取消
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          }

          // 查看模式
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
                      onClick={() => handleStartEdit(config)}
                      disabled={saving === config.id}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      编辑
                    </Button>
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
                <div className="text-sm">
                  <span className="text-muted-foreground">API Key：</span>
                  <span className="ml-2 font-mono">{config.keyMasked}</span>
                </div>

                {config.baseUrl && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Base URL：</span>
                    <span className="ml-2 font-mono text-xs">{config.baseUrl}</span>
                  </div>
                )}

                {/* 各模态默认模型 */}
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">各模态默认模型：</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {MODALITY_CONFIG.map(({ id: modality, label, icon: Icon }) => {
                      const defaultModelsObj = config.defaultModels as Record<string, string> || {}
                      const defaultModelForModality = defaultModelsObj[modality] || config.defaultModel
                      if (!defaultModelForModality) return null
                      return (
                        <div key={modality} className="flex items-center gap-1.5 p-1.5 rounded bg-muted/50 text-xs">
                          <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{label}:</span>
                          <span className="font-mono text-muted-foreground truncate" title={defaultModelForModality}>
                            {getModelDisplayName(defaultModelForModality)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

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

            {/* 按模态分组的模型选择 */}
            <div className="space-y-3">
              <Label>可用模型与默认设置</Label>
              <p className="text-xs text-muted-foreground">
                按模态选择可用模型，并为每个模态指定默认模型
              </p>

              <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {MODALITY_CONFIG.map(({ id: modality, label, description, icon: Icon }) => {
                  const models = currentProviderInfo?.modelsByModality?.[modality] || []
                  const selectedModels = newForm.selectedModelsPerModality[modality] || []
                  const defaultModel = newForm.defaultModels[modality] || ''
                  const isExpanded = expandedModality === modality
                  const hasModels = models.length > 0

                  if (!hasModels) return null

                  return (
                    <div key={modality} className="bg-background">
                      {/* 模态标题栏 */}
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedModality(isExpanded ? null : modality)}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div className="text-left">
                            <span className="font-medium">{label}</span>
                            <span className="text-xs text-muted-foreground ml-2">{description}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {selectedModels.length}/{models.length}
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* 展开的模型列表 */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3">
                          {/* 默认模型选择 */}
                          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                            <Star className="h-4 w-4 text-amber-500" />
                            <Label className="text-xs font-normal">默认模型:</Label>
                            <Select
                              value={defaultModel}
                              onValueChange={(value) => setModalityDefaultModel(modality, value)}
                            >
                              <SelectTrigger className="h-8 flex-1">
                                <SelectValue placeholder="选择默认模型" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedModels.map(modelId => {
                                  const model = models.find(m => m.id === modelId)
                                  return (
                                    <SelectItem key={modelId} value={modelId}>
                                      {model?.name || modelId}
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 模型列表 */}
                          <div className="space-y-1">
                            {models.map((model) => (
                              <label
                                key={model.id}
                                className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                              >
                                <Checkbox
                                  checked={selectedModels.includes(model.id)}
                                  onCheckedChange={() => toggleModelSelection(modality, model.id)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">{model.name}</p>
                                    {model.id === defaultModel && (
                                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                                        默认
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{model.description}</p>
                                  <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">{model.id}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
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
