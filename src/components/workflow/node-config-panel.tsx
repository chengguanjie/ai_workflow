'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { X, Plus, GripVertical, Loader2, AlertCircle, ChevronRight, AtSign, Upload, FileSpreadsheet, ImageIcon, VideoIcon, MusicIcon, Trash2 } from 'lucide-react'
import type { InputField, KnowledgeItem, OutputFormat, ImportedFile } from '@/types/workflow'

// AI 服务商配置类型
interface AIProviderConfig {
  id: string
  name: string
  provider: string
  baseUrl: string
  defaultModel: string
  models: string[]
  isDefault: boolean
  displayName: string
}

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, selectNode, updateNode } = useWorkflowStore()
  const [panelWidth, setPanelWidth] = useState(320)

  // 处理配置面板宽度拖拽
  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX // 向左拖变宽
      const newWidth = Math.max(280, Math.min(600, startWidth + deltaX))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  if (!selectedNode) return null

  const nodeData = selectedNode.data as {
    name: string
    type: string
    config?: Record<string, unknown>
  }

  const handleNameChange = (name: string) => {
    updateNode(selectedNodeId!, { name })
  }

  const handleConfigChange = (config: Record<string, unknown>) => {
    updateNode(selectedNodeId!, { config })
  }

  const renderConfigPanel = () => {
    const nodeType = nodeData.type.toLowerCase()

    switch (nodeType) {
      case 'input':
        return (
          <InputNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'process':
        return (
          <ProcessNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'code':
        return (
          <CodeNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'output':
        return (
          <OutputNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'data':
        return (
          <DataNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'image':
        return (
          <ImageNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'video':
        return (
          <VideoNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'audio':
        return (
          <AudioNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex border-l bg-background overflow-y-auto" style={{ width: panelWidth }}>
      {/* 左侧拖拽手柄 */}
      <div
        className="w-1 hover:w-1.5 bg-border hover:bg-primary cursor-ew-resize flex-shrink-0 transition-all"
        onMouseDown={handlePanelResizeStart}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between border-b p-4 sticky top-0 bg-background z-10">
          <h3 className="font-medium">节点配置</h3>
          <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>节点名称</Label>
              <Input
                value={nodeData.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* 节点特定配置 */}
          {renderConfigPanel()}
        </div>
      </div>
    </div>
  )
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    INPUT: '输入节点',
    PROCESS: '处理节点',
    CODE: '代码节点',
    OUTPUT: '输出节点',
    DATA: '数据节点',
    IMAGE: '图片节点',
    VIDEO: '视频节点',
    AUDIO: '音频节点',
  }
  return labels[type.toUpperCase()] || type
}

// ============== 输入节点配置 ==============
function InputNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  const fields = (config?.fields as InputField[]) || []

  const addField = () => {
    const newField: InputField = {
      id: `field_${Date.now()}`,
      name: `字段${fields.length + 1}`,
      value: '',
      height: 80,
    }
    onUpdate({ ...config, fields: [...fields, newField] })
  }

  const updateField = (index: number, updates: Partial<InputField>) => {
    const newFields = [...fields]
    newFields[index] = { ...newFields[index], ...updates }
    onUpdate({ ...config, fields: newFields })
  }

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index)
    onUpdate({ ...config, fields: newFields })
  }

  // 处理文本框高度拖拽
  const handleResizeStart = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = fields[index].height || 80

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.max(40, Math.min(300, startHeight + deltaY))
      updateField(index, { height: newHeight })
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">输入字段</h4>
        <Button variant="outline" size="sm" onClick={addField}>
          <Plus className="mr-1 h-3 w-3" />
          添加字段
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          暂无输入字段，点击上方按钮添加
        </p>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="border rounded-lg p-3 space-y-2">
              {/* 字段名称行 */}
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-move" />
                <Input
                  value={field.name}
                  onChange={(e) => updateField(index, { name: e.target.value })}
                  placeholder="字段名称"
                  className="h-7 text-sm font-medium flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => removeField(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {/* 文本内容输入框 */}
              <div className="relative">
                <textarea
                  value={field.value || ''}
                  onChange={(e) => updateField(index, { value: e.target.value })}
                  placeholder={`输入 {{输入.${field.name}}} 的内容...`}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  style={{ height: field.height || 80 }}
                />
                {/* 底部拖拽调整高度的手柄 */}
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-border hover:bg-primary cursor-ns-resize rounded-full"
                  onMouseDown={(e) => handleResizeStart(index, e)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                引用方式: {'{{'}输入.{field.name}{'}}'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============== 处理节点配置 ==============
type ProcessTabType = 'ai' | 'knowledge' | 'prompt'

function ProcessNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
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

// ============== 代码节点配置 ==============
function CodeNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'code' | 'generate'>('code')
  const [providers, setProviders] = useState<AIProviderConfig[]>([])

  const codeConfig = config as {
    aiConfigId?: string
    model?: string
    prompt?: string
    language?: string
    code?: string
    executionResult?: {
      success: boolean
      output?: string
      error?: string
      executionTime?: number
    }
  } || {}

  // 加载可用的服务商列表
  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch('/api/ai/providers')
        if (res.ok) {
          const data = await res.json()
          setProviders(data.providers || [])
          if (!codeConfig.aiConfigId && data.defaultProvider) {
            onUpdate({
              ...codeConfig,
              aiConfigId: data.defaultProvider.id,
            })
          }
        }
      } catch (error) {
        console.error('Failed to load providers:', error)
      }
    }
    loadProviders()
  }, [])

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...codeConfig, [key]: value })
  }

  // 执行代码
  const handleExecute = async () => {
    const code = codeConfig.code
    if (!code?.trim()) {
      handleChange('executionResult', { success: false, error: '请先输入代码' })
      return
    }

    setIsExecuting(true)
    try {
      const response = await fetch('/api/code/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          language: codeConfig.language || 'javascript',
          inputs: {}, // TODO: 从前面节点获取输入
        }),
      })

      const result = await response.json()
      handleChange('executionResult', result)
    } catch (error) {
      handleChange('executionResult', {
        success: false,
        error: error instanceof Error ? error.message : '执行失败',
      })
    } finally {
      setIsExecuting(false)
    }
  }

  // AI 生成代码
  const handleGenerate = async () => {
    const prompt = codeConfig.prompt
    if (!prompt?.trim()) {
      return
    }

    setIsGenerating(true)
    try {
      // TODO: 实现 AI 代码生成 API
      // 这里暂时用模拟数据
      await new Promise(resolve => setTimeout(resolve, 1000))
      const generatedCode = `// AI 生成的代码示例
// 需求: ${prompt}

function processData(inputs) {
  console.log('处理输入数据:', inputs);

  // 在这里实现你的逻辑
  const result = {
    processed: true,
    timestamp: new Date().toISOString(),
  };

  return result;
}

// 执行
const result = processData(inputs);
console.log('结果:', result);
`
      handleChange('code', generatedCode)
      setActiveTab('code')
    } catch (error) {
      console.error('生成失败:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const executionResult = codeConfig.executionResult

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">代码节点</h4>

      {/* Tab 切换 */}
      <div className="flex border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'code'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('code')}
        >
          代码编辑
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'generate'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('generate')}
        >
          AI 生成
        </button>
      </div>

      {activeTab === 'code' ? (
        <>
          {/* 编程语言选择 */}
          <div className="space-y-2">
            <Label>编程语言</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={codeConfig.language || 'javascript'}
              onChange={(e) => handleChange('language', e.target.value)}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python (暂不支持执行)</option>
              <option value="sql">SQL (暂不支持执行)</option>
            </select>
          </div>

          {/* 代码编辑器 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>代码</Label>
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={isExecuting || !codeConfig.code?.trim()}
                className="h-7"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>
                    <PlayIcon className="mr-1 h-3 w-3" />
                    运行
                  </>
                )}
              </Button>
            </div>
            <textarea
              className="min-h-[200px] w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-mono"
              placeholder={`// 在这里编写 JavaScript 代码
// 可以通过 inputs 对象访问输入数据
// 例如: inputs.字段名

console.log('Hello World');

// 使用 return 返回结果
return { success: true };`}
              value={codeConfig.code || ''}
              onChange={(e) => handleChange('code', e.target.value)}
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              使用 <code className="bg-muted px-1 rounded">inputs</code> 访问输入数据，
              使用 <code className="bg-muted px-1 rounded">console.log()</code> 打印日志
            </p>
          </div>

          {/* 执行结果 */}
          {executionResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>执行结果</Label>
                {executionResult.executionTime !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    耗时: {executionResult.executionTime}ms
                  </span>
                )}
              </div>
              <div
                className={`p-3 rounded-md text-sm font-mono whitespace-pre-wrap max-h-[200px] overflow-auto ${
                  executionResult.success
                    ? 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200'
                    : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
                }`}
              >
                {executionResult.success
                  ? executionResult.output || '执行成功（无输出）'
                  : executionResult.error || '执行失败'}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* AI 生成配置 */}
          {providers.length === 0 ? (
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
                  value={codeConfig.aiConfigId || ''}
                  onChange={(e) => handleChange('aiConfigId', e.target.value)}
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
                <Input
                  value={codeConfig.model || ''}
                  onChange={(e) => handleChange('model', e.target.value)}
                  placeholder="deepseek/deepseek-coder"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>代码需求描述</Label>
            <textarea
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="描述你需要什么代码，AI 会帮你生成...&#10;&#10;例如：&#10;- 写一个函数处理输入的数据&#10;- 解析 JSON 并提取特定字段&#10;- 数据格式转换"
              value={codeConfig.prompt || ''}
              onChange={(e) => handleChange('prompt', e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={isGenerating || !codeConfig.prompt?.trim()}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <SparklesIcon className="mr-2 h-4 w-4" />
                生成代码
              </>
            )}
          </Button>

          {codeConfig.code && (
            <p className="text-xs text-muted-foreground text-center">
              代码已生成，切换到「代码编辑」标签查看和运行
            </p>
          )}
        </>
      )}
    </div>
  )
}

// 图标组件
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}

// ============== 提示词 Tab 内容组件 ==============
function PromptTabContent({
  processConfig,
  knowledgeItems,
  onSystemPromptChange,
  onUserPromptChange,
}: {
  processConfig: {
    systemPrompt?: string
    userPrompt?: string
  }
  knowledgeItems: KnowledgeItem[]
  onSystemPromptChange: (value: string) => void
  onUserPromptChange: (value: string) => void
}) {
  const userPromptRef = useRef<HTMLTextAreaElement>(null)

  // 插入引用到光标位置
  const handleInsertReference = (reference: string) => {
    const textarea = userPromptRef.current
    if (!textarea) {
      // 如果无法获取光标位置，直接追加
      onUserPromptChange((processConfig.userPrompt || '') + reference)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = processConfig.userPrompt || ''

    // 在光标位置插入引用
    const newValue = currentValue.substring(0, start) + reference + currentValue.substring(end)
    onUserPromptChange(newValue)

    // 重新设置光标位置
    requestAnimationFrame(() => {
      textarea.focus()
      const newCursorPos = start + reference.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          placeholder="系统提示词（可选）...&#10;&#10;用于设定 AI 的角色和行为方式"
          value={processConfig.systemPrompt || ''}
          onChange={(e) => onSystemPromptChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>User Prompt</Label>
          <ReferenceSelector
            knowledgeItems={knowledgeItems}
            onInsert={handleInsertReference}
          />
        </div>
        <textarea
          ref={userPromptRef}
          className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          placeholder="用户提示词，点击「插入引用」选择变量..."
          value={processConfig.userPrompt || ''}
          onChange={(e) => onUserPromptChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          点击「插入引用」按钮选择节点和字段，或直接输入 {'{{节点名.字段名}}'}
        </p>
      </div>
    </div>
  )
}

// ============== 引用选择器组件 ==============
interface NodeReferenceOption {
  nodeId: string
  nodeName: string
  nodeType: string
  // 可引用的字段列表
  fields: {
    id: string
    name: string
    type: 'field' | 'knowledge' | 'output'  // 字段类型：输入字段、知识库、节点输出
    reference: string  // 完整的引用语法
  }[]
}

function ReferenceSelector({
  knowledgeItems,
  onInsert,
}: {
  knowledgeItems: KnowledgeItem[]
  onInsert: (reference: string) => void
}) {
  const { nodes, selectedNodeId, edges } = useWorkflowStore()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<NodeReferenceOption | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSelectedNode(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 获取所有可引用的节点及其字段
  const getNodeOptions = (): NodeReferenceOption[] => {
    const options: NodeReferenceOption[] = []

    // 获取当前节点
    const currentNode = nodes.find(n => n.id === selectedNodeId)
    if (!currentNode) return options

    // 递归获取所有前置节点
    const predecessorIds = new Set<string>()
    const findPredecessors = (nodeId: string) => {
      const incoming = edges.filter(e => e.target === nodeId)
      for (const edge of incoming) {
        if (!predecessorIds.has(edge.source)) {
          predecessorIds.add(edge.source)
          findPredecessors(edge.source)
        }
      }
    }
    findPredecessors(selectedNodeId!)

    // 处理每个前置节点
    for (const node of nodes) {
      if (!predecessorIds.has(node.id)) continue

      const nodeData = node.data as Record<string, unknown>
      const nodeType = (nodeData.type as string)?.toLowerCase()
      const nodeName = nodeData.name as string
      const nodeConfig = nodeData.config as Record<string, unknown> | undefined
      const fields: NodeReferenceOption['fields'] = []

      // 调试：打印完整的节点数据
      console.log('Node data:', nodeName, nodeType, nodeData)

      // 根据节点类型添加可引用字段
      if (nodeType === 'input') {
        // 输入节点：添加所有输入字段
        const inputFields = (nodeConfig?.fields as InputField[]) || []
        for (const field of inputFields) {
          fields.push({
            id: field.id,
            name: field.name,
            type: 'field',
            reference: `{{${nodeName}.${field.name}}}`,
          })
        }
      } else if (nodeType === 'process') {
        // 处理节点：添加知识库 + 输出
        const processKnowledge = (nodeConfig?.knowledgeItems as KnowledgeItem[]) || []
        for (const kb of processKnowledge) {
          fields.push({
            id: kb.id,
            name: `知识库: ${kb.name}`,
            type: 'knowledge',
            reference: `{{${nodeName}.知识库.${kb.name}}}`,
          })
        }
        // 添加节点输出选项
        fields.push({
          id: `${node.id}_output`,
          name: '节点输出',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      } else if (nodeType === 'code') {
        // 代码节点：添加输出
        fields.push({
          id: `${node.id}_output`,
          name: '节点输出',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      } else {
        // 其他节点：添加输出
        fields.push({
          id: `${node.id}_output`,
          name: '节点输出',
          type: 'output',
          reference: `{{${nodeName}}}`,
        })
      }

      if (fields.length > 0) {
        const option = {
          nodeId: node.id,
          nodeName,
          nodeType: nodeType || 'unknown',
          fields,
        }
        console.log('Pushing option:', option.nodeName, 'fields count:', option.fields.length)
        options.push(option)
      }
    }

    // 添加当前节点的知识库（如果有）
    if (knowledgeItems.length > 0) {
      const currentNodeData = currentNode.data as { name: string }
      const currentNodeName = currentNodeData.name
      const kbFields: NodeReferenceOption['fields'] = knowledgeItems.map(kb => ({
        id: kb.id,
        name: kb.name,
        type: 'knowledge' as const,
        reference: `{{${currentNodeName}.知识库.${kb.name}}}`,
      }))

      options.push({
        nodeId: 'current_knowledge',
        nodeName: `${currentNodeName} 知识库`,
        nodeType: 'knowledge',
        fields: kbFields,
      })
    }

    return options
  }

  const nodeOptions = getNodeOptions()

  // 调试：渲染时打印每个选项的 fields.length
  console.log('=== ReferenceSelector Render ===')
  nodeOptions.forEach((opt, idx) => {
    console.log(`Option[${idx}]: ${opt.nodeName}, type: ${opt.nodeType}, fields.length: ${opt.fields.length}`)
    opt.fields.forEach((f, fi) => {
      console.log(`  Field[${fi}]: ${f.name}, ref: ${f.reference}`)
    })
  })

  const handleSelectNode = (option: NodeReferenceOption) => {
    console.log('handleSelectNode called:', option.nodeName, 'fields:', option.fields.length)
    // 始终显示字段选择，让用户明确选择要引用的内容
    setSelectedNode(option)
  }

  const handleSelectField = (field: NodeReferenceOption['fields'][0]) => {
    onInsert(field.reference)
    setIsOpen(false)
    setSelectedNode(null)
  }

  if (nodeOptions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        暂无可引用的节点（请先连接前置节点）
      </div>
    )
  }

  // 调试信息
  console.log('All node options:', nodeOptions)

  // 获取节点类型图标
  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'input': return '📥'
      case 'process': return '⚙️'
      case 'code': return '💻'
      case 'output': return '📤'
      case 'knowledge': return '📚'
      default: return '📦'
    }
  }

  // 获取字段类型图标
  const getFieldIcon = (fieldType: string) => {
    switch (fieldType) {
      case 'field': return '📝'
      case 'knowledge': return '📖'
      case 'output': return '➡️'
      default: return ''
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => {
          setIsOpen(!isOpen)
          setSelectedNode(null)
        }}
      >
        <AtSign className="mr-1 h-3 w-3" />
        插入引用
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-[300px] min-w-[200px]">
          {/* 未选择节点时：显示节点列表 */}
          {!selectedNode ? (
            <div className="overflow-y-auto">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b sticky top-0 bg-popover">
                选择节点 (共{nodeOptions.length}个)
              </div>
              <div className="py-1">
                {nodeOptions.map((option) => {
                  const hasFields = option.fields.length > 0
                  return (
                    <button
                      key={option.nodeId}
                      className="w-full px-3 py-1.5 text-sm text-left flex items-center justify-between hover:bg-accent transition-colors"
                      onClick={() => handleSelectNode(option)}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{getNodeIcon(option.nodeType)}</span>
                        <span className="truncate max-w-[120px]">{option.nodeName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">({option.fields.length})</span>
                        {hasFields && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* 已选择节点时：显示字段列表 */
            <div className="overflow-y-auto">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b sticky top-0 bg-popover flex items-center gap-2">
                <button
                  className="hover:bg-accent rounded p-0.5 transition-colors"
                  onClick={() => setSelectedNode(null)}
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                </button>
                <span>{selectedNode.nodeName}</span>
              </div>
              <div className="py-1">
                {selectedNode.fields.map((field) => (
                  <button
                    key={field.id}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-1.5"
                    onClick={() => handleSelectField(field)}
                  >
                    <span>{getFieldIcon(field.type)}</span>
                    <span className="truncate">{field.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============== 输出节点配置 ==============
type OutputTabType = 'ai' | 'output' | 'prompt'

function OutputNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
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

// ============== 媒体节点通用配置面板 ==============
type MediaTabType = 'import' | 'prompt'

interface MediaNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
  nodeType: 'data' | 'image' | 'video' | 'audio'
  title: string
  acceptFormats: string
  formatDescription: string
  icon: React.ReactNode
}

function MediaNodeConfigPanel({
  config,
  onUpdate,
  nodeType,
  title,
  acceptFormats,
  formatDescription,
  icon,
}: MediaNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<MediaTabType>('import')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaConfig = config as {
    files?: ImportedFile[]
    prompt?: string
  } || {}

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
                      {icon}
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
    </div>
  )
}

// ============== 数据节点配置 ==============
function DataNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="data"
      title="数据文件"
      acceptFormats=".xlsx,.xls,.csv"
      formatDescription="Excel (.xlsx, .xls), CSV (.csv)"
      icon={<FileSpreadsheet className="h-8 w-8 text-cyan-500" />}
    />
  )
}

// ============== 图片节点配置 ==============
function ImageNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="image"
      title="图片"
      acceptFormats=".jpg,.jpeg,.png,.gif,.webp,.svg,.bmp"
      formatDescription="JPG, PNG, GIF, WebP, SVG, BMP"
      icon={<ImageIcon className="h-8 w-8 text-pink-500" />}
    />
  )
}

// ============== 视频节点配置 ==============
function VideoNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="video"
      title="视频/图片"
      acceptFormats=".mp4,.mov,.avi,.webm,.mkv,.jpg,.jpeg,.png,.gif"
      formatDescription="MP4, MOV, AVI, WebM, MKV, 或图片格式"
      icon={<VideoIcon className="h-8 w-8 text-red-500" />}
    />
  )
}

// ============== 音频节点配置 ==============
function AudioNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="audio"
      title="音频"
      acceptFormats=".mp3,.wav,.ogg,.flac,.aac,.m4a"
      formatDescription="MP3, WAV, OGG, FLAC, AAC, M4A"
      icon={<MusicIcon className="h-8 w-8 text-amber-500" />}
    />
  )
}
