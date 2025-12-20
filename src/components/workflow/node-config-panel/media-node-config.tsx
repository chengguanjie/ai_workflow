'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { OutputTabContent } from './shared/output-tab-content'
import type { ImportedFile } from '@/types/workflow'
import type { AIProviderConfig } from './shared/types'

type MediaTabType = 'import' | 'prompt' | 'ai' | 'output'

interface MediaNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
  nodeType: 'data' | 'image' | 'video' | 'audio'
  title: string
  acceptFormats: string
  formatDescription: string
  icon: React.ReactNode
}

export function MediaNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
  title,
  acceptFormats,
  formatDescription,
  icon,
}: MediaNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<MediaTabType>('prompt')
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaConfig = config as {
    files?: ImportedFile[]
    prompt?: string
    aiConfigId?: string
    model?: string
  } || {}

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          const providerList = data.providers || []
          setProviders(providerList)

          // 如果节点没有选择配置，或者当前配置已不存在，使用默认配置
          const currentConfigExists = mediaConfig.aiConfigId &&
            providerList.some((p: AIProviderConfig) => p.id === mediaConfig.aiConfigId)

          if (!currentConfigExists && data.defaultProvider) {
            onUpdate({
              ...mediaConfig,
              aiConfigId: data.defaultProvider.id,
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

  const files = mediaConfig.files || []

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...mediaConfig, [key]: value })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    const newFiles: ImportedFile[] = []
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      // 创建临时 URL（实际应用中需要上传到服务器）
      const url = URL.createObjectURL(file)
      newFiles.push({
        id: `file_${Date.now()}_${i}`,
        name: file.name,
        url: url,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
      })
    }

    handleChange('files', [...files, ...newFiles])
    // 清空 input 以便可以再次选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (fileId: string) => {
    const newFiles = files.filter(f => f.id !== fileId)
    handleChange('files', newFiles)
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const tabs: { key: MediaTabType; label: string; badge?: number }[] = [
    { key: 'import', label: '导入', badge: files.length || undefined },
    { key: 'prompt', label: '提示词' },
    { key: 'ai', label: 'AI 配置' },
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

      {/* 导入 Tab */}
      {activeTab === 'import' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{title}</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDescription}
              </p>
            </div>
          </div>

          {/* 文件上传区域 */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptFormats}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center gap-2">
              {icon}
              <p className="text-sm text-muted-foreground">
                点击或拖拽文件到此处上传
              </p>
              <p className="text-xs text-muted-foreground">
                支持格式: {formatDescription}
              </p>
            </div>
          </div>

          {/* 已上传文件列表 */}
          {files.length > 0 && (
            <div className="space-y-2">
              <Label>已导入文件 ({files.length})</Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 border rounded-md bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => removeFile(file.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 提示词 Tab */}
      {activeTab === 'prompt' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>处理提示词</Label>
            <textarea
              className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder={`描述如何处理导入的${title}...\n\n例如：\n- 提取数据中的关键信息\n- 对内容进行分析或转换`}
              value={mediaConfig.prompt || ''}
              onChange={(e) => handleChange('prompt', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              使用 {'{{节点名.字段名}}'} 引用其他节点的内容
            </p>
          </div>
        </div>
      )}

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
              <span>请先在 <a href="/settings/ai-config" className="underline font-medium">设置 → AI 配置</a> 添加服务商</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>服务商配置</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={mediaConfig.aiConfigId || ''}
                  onChange={(e) => handleChange('aiConfigId', e.target.value)}
                >
                  <option value="">选择服务商配置...</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName}{provider.isDefault ? ' (默认)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  选择用于处理提示词的 AI 服务商
                </p>
              </div>

              <div className="space-y-2">
                <Label>模型（可选）</Label>
                <Input
                  value={mediaConfig.model || ''}
                  onChange={(e) => handleChange('model', e.target.value)}
                  placeholder="留空使用服务商默认模型"
                />
                <p className="text-xs text-muted-foreground">
                  自定义模型名称，留空则使用服务商的默认模型
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
