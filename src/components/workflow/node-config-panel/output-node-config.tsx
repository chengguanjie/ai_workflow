'use client'

import { useState, useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, AlertCircle } from 'lucide-react'
import { ReferenceSelector } from './shared/reference-selector'
import type { AIProviderConfig } from './shared/types'

type OutputTabType = 'ai' | 'output' | 'prompt'

interface OutputNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function OutputNodeConfigPanel({
  config,
  onUpdate,
}: OutputNodeConfigPanelProps) {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [activeTab, setActiveTab] = useState<OutputTabType>('ai')
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const outputConfig = config as {
    aiConfigId?: string
    model?: string
    prompt?: string
    format?: string // text | json | markdown | html | word | excel | pdf | image | audio | video
    templateName?: string
    temperature?: number
    maxTokens?: number
    downloadUrl?: string // 文件下载基础地址
    fileName?: string // 输出文件名
  } || {}

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          setProviders(data.providers || [])
          if (!outputConfig.aiConfigId && data.defaultProvider) {
            onUpdate({
              ...outputConfig,
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
    onUpdate({ ...outputConfig, [key]: value })
  }

  const handleProviderChange = (configId: string) => {
    const selected = providers.find(p => p.id === configId)
    handleChange('aiConfigId', configId)
    if (selected && !outputConfig.model) {
      handleChange('model', selected.defaultModel)
    }
  }

  // 插入引用到光标位置
  const handleInsertReference = (reference: string) => {
    const textarea = promptRef.current
    if (!textarea) {
      // 如果无法获取光标位置，直接追加
      handleChange('prompt', (outputConfig.prompt || '') + reference)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = outputConfig.prompt || ''

    // 在光标位置插入引用
    const newValue = currentValue.substring(0, start) + reference + currentValue.substring(end)
    handleChange('prompt', newValue)

    // 重新设置光标位置
    requestAnimationFrame(() => {
      textarea.focus()
      const newCursorPos = start + reference.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  const selectedProvider = providers.find(p => p.id === outputConfig.aiConfigId)

  // Tab 配置
  const tabs: { key: OutputTabType; label: string }[] = [
    { key: 'ai', label: 'AI 设置' },
    { key: 'output', label: '输出设置' },
    { key: 'prompt', label: '输出提示词' },
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

      {/* AI 设置 Tab */}
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
                  value={outputConfig.aiConfigId || ''}
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
                    value={outputConfig.model || selectedProvider.defaultModel || ''}
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
                    value={outputConfig.model || ''}
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
                    value={outputConfig.temperature ?? 0.7}
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    控制输出的随机性
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    min="1"
                    max="128000"
                    value={outputConfig.maxTokens ?? 4096}
                    onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    最大输出长度
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 输出设置 Tab */}
      {activeTab === 'output' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>输出格式</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={outputConfig.format || 'text'}
              onChange={(e) => handleChange('format', e.target.value)}
            >
              <optgroup label="文本类">
                <option value="text">纯文本</option>
                <option value="json">JSON</option>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </optgroup>
              <optgroup label="文档类">
                <option value="word">Word 文档 (.docx)</option>
                <option value="excel">Excel 表格 (.xlsx)</option>
                <option value="pdf">PDF 文档</option>
              </optgroup>
              <optgroup label="媒体类">
                <option value="image">图片</option>
                <option value="audio">音频</option>
                <option value="video">视频</option>
              </optgroup>
            </select>
            <p className="text-xs text-muted-foreground">
              选择工作流最终输出的格式
            </p>
          </div>

          {/* 文件名配置 - 文件类输出时显示 */}
          {['word', 'excel', 'pdf', 'image', 'audio', 'video', 'html'].includes(outputConfig.format || '') && (
            <div className="space-y-2">
              <Label>输出文件名</Label>
              <Input
                value={outputConfig.fileName || ''}
                onChange={(e) => handleChange('fileName', e.target.value)}
                placeholder="例如：report_{{日期}}"
              />
              <p className="text-xs text-muted-foreground">
                支持使用变量，如 {'{{日期}}'} 会替换为当前日期
              </p>
            </div>
          )}

          {/* 模板配置 - Word/Excel 时显示 */}
          {(outputConfig.format === 'word' || outputConfig.format === 'excel') && (
            <div className="space-y-2">
              <Label>模板文件（可选）</Label>
              <Input
                value={outputConfig.templateName || ''}
                onChange={(e) => handleChange('templateName', e.target.value)}
                placeholder="使用的模板文件名"
              />
              <p className="text-xs text-muted-foreground">
                指定要使用的模板文件，留空则使用默认格式
              </p>
            </div>
          )}

          {/* 下载地址配置 - 文件类输出时显示 */}
          {['word', 'excel', 'pdf', 'image', 'audio', 'video', 'html'].includes(outputConfig.format || '') && (
            <div className="space-y-2">
              <Label>下载地址前缀（可选）</Label>
              <Input
                value={outputConfig.downloadUrl || ''}
                onChange={(e) => handleChange('downloadUrl', e.target.value)}
                placeholder="https://your-domain.com/downloads/"
              />
              <p className="text-xs text-muted-foreground">
                生成的文件将存储到此地址，留空使用系统默认存储
              </p>
            </div>
          )}

          {/* 格式说明提示 */}
          {outputConfig.format === 'json' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>JSON 格式会将 AI 输出解析为结构化数据，适合后续程序处理</p>
            </div>
          )}

          {outputConfig.format === 'markdown' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>Markdown 格式支持富文本标记，可转换为其他格式</p>
            </div>
          )}

          {outputConfig.format === 'html' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>HTML 格式可直接在浏览器中预览，支持样式和交互</p>
            </div>
          )}

          {outputConfig.format === 'pdf' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>PDF 格式适合正式文档输出，保持排版一致性</p>
            </div>
          )}

          {outputConfig.format === 'image' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>图片格式会调用图像生成模型，根据提示词生成图片</p>
            </div>
          )}

          {outputConfig.format === 'audio' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>音频格式会调用语音合成模型，将文本转换为语音</p>
            </div>
          )}

          {outputConfig.format === 'video' && (
            <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <p>视频格式会调用视频生成模型，根据提示词生成视频</p>
            </div>
          )}
        </div>
      )}

      {/* 输出提示词 Tab */}
      {activeTab === 'prompt' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>输出提示词</Label>
              <ReferenceSelector
                knowledgeItems={[]}
                onInsert={handleInsertReference}
              />
            </div>
            <textarea
              ref={promptRef}
              className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="描述输出的内容和格式，点击「插入引用」选择变量..."
              value={outputConfig.prompt || ''}
              onChange={(e) => handleChange('prompt', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              点击「插入引用」按钮选择节点和字段，或直接输入 {'{{节点名.字段名}}'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
