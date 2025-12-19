'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertCircle } from 'lucide-react'
import type { AIProviderConfig } from './shared/types'
import { OutputTabContent } from './shared/output-tab-content'

type CodeTabType = 'code' | 'generate' | 'output'

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

interface CodeNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function CodeNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: CodeNodeConfigPanelProps) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<CodeTabType>('code')
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
          const providerList = data.providers || []
          setProviders(providerList)

          // 如果节点没有选择配置，或者当前配置已不存在，使用默认配置
          const currentConfigExists = codeConfig.aiConfigId &&
            providerList.some((p: AIProviderConfig) => p.id === codeConfig.aiConfigId)

          if (!currentConfigExists && data.defaultProvider) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'code'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('code')}
        >
          代码编辑
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'generate'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('generate')}
        >
          AI 生成
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'output'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('output')}
        >
          输出
        </button>
      </div>

      {activeTab === 'code' && (
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
      )}

      {activeTab === 'generate' && (
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

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}
    </div>
  )
}
