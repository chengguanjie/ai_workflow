'use client'

import { useState, useCallback } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { X, Plus, GripVertical, Loader2 } from 'lucide-react'
import type { InputField, KnowledgeItem, OutputFormat } from '@/types/workflow'

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

            <div className="space-y-2">
              <Label>节点类型</Label>
              <Input value={getTypeLabel(nodeData.type)} disabled className="bg-muted" />
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
function ProcessNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  const processConfig = config as {
    provider?: string
    model?: string
    knowledgeItems?: KnowledgeItem[]
    systemPrompt?: string
    userPrompt?: string
    temperature?: number
    maxTokens?: number
  } || {}

  const knowledgeItems = processConfig.knowledgeItems || []

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...processConfig, [key]: value })
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

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">AI 配置</h4>

      <div className="space-y-2">
        <Label>服务商</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={processConfig.provider || 'OPENROUTER'}
          onChange={(e) => handleChange('provider', e.target.value)}
        >
          <option value="SHENSUAN">胜算云</option>
          <option value="OPENROUTER">OpenRouter</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label>模型</Label>
        <Input
          value={processConfig.model || ''}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder="deepseek/deepseek-chat"
        />
      </div>

      <Separator />

      {/* 知识库 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>参考知识库</Label>
          <Button variant="outline" size="sm" onClick={addKnowledgeItem}>
            <Plus className="mr-1 h-3 w-3" />
            添加
          </Button>
        </div>

        {knowledgeItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            可添加多个知识库作为 AI 参考
          </p>
        ) : (
          <div className="space-y-2">
            {knowledgeItems.map((item, index) => (
              <div key={item.id} className="border rounded-lg p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <Input
                    value={item.name}
                    onChange={(e) => updateKnowledgeItem(index, { name: e.target.value })}
                    className="h-7 text-sm flex-1 mr-2"
                    placeholder="知识库名称"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeKnowledgeItem(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <textarea
                  className="min-h-[60px] w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  placeholder="输入知识库内容..."
                  value={item.content}
                  onChange={(e) => updateKnowledgeItem(index, { content: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>System Prompt</Label>
        <textarea
          className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="系统提示词（可选）..."
          value={processConfig.systemPrompt || ''}
          onChange={(e) => handleChange('systemPrompt', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>User Prompt</Label>
        <textarea
          className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="用户提示词，支持引用：&#10;{{输入.字段名}} - 引用输入节点&#10;{{知识库名}} - 引用知识库&#10;{{上一节点}} - 引用上一节点输出"
          value={processConfig.userPrompt || ''}
          onChange={(e) => handleChange('userPrompt', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          使用 {'{{节点名.字段名}}'} 引用其他节点内容
        </p>
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

  const codeConfig = config as {
    provider?: string
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
          <div className="space-y-2">
            <Label>服务商</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={codeConfig.provider || 'OPENROUTER'}
              onChange={(e) => handleChange('provider', e.target.value)}
            >
              <option value="SHENSUAN">胜算云</option>
              <option value="OPENROUTER">OpenRouter</option>
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

// ============== 输出节点配置 ==============
function OutputNodeConfigPanel({
  config,
  onUpdate,
}: {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}) {
  const outputConfig = config as {
    provider?: string
    model?: string
    prompt?: string
    format?: OutputFormat
    templateName?: string
  } || {}

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...outputConfig, [key]: value })
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">输出配置</h4>

      <div className="space-y-2">
        <Label>服务商</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={outputConfig.provider || 'OPENROUTER'}
          onChange={(e) => handleChange('provider', e.target.value)}
        >
          <option value="SHENSUAN">胜算云</option>
          <option value="OPENROUTER">OpenRouter</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label>模型</Label>
        <Input
          value={outputConfig.model || ''}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder="deepseek/deepseek-chat"
        />
      </div>

      <div className="space-y-2">
        <Label>输出格式</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={outputConfig.format || 'text'}
          onChange={(e) => handleChange('format', e.target.value)}
        >
          <option value="text">纯文本</option>
          <option value="json">JSON</option>
          <option value="word">Word 文档</option>
          <option value="excel">Excel 表格</option>
          <option value="image">图片</option>
        </select>
      </div>

      {(outputConfig.format === 'word' || outputConfig.format === 'excel') && (
        <div className="space-y-2">
          <Label>模板名称（可选）</Label>
          <Input
            value={outputConfig.templateName || ''}
            onChange={(e) => handleChange('templateName', e.target.value)}
            placeholder="使用的模板文件名"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>输出提示词</Label>
        <textarea
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="描述输出的内容和格式，AI 会按要求整理输出...&#10;&#10;可以引用前面节点：&#10;{{处理.结果}} - 引用处理节点&#10;{{代码.output}} - 引用代码节点&#10;{{输入.标题}} - 引用输入"
          value={outputConfig.prompt || ''}
          onChange={(e) => handleChange('prompt', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          使用 {'{{节点名.字段名}}'} 引用前面节点的输出内容
        </p>
      </div>
    </div>
  )
}
