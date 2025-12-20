'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Download, Upload, Copy, Check, FileJson, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkflowStore } from '@/stores/workflow-store'
import type { WorkflowConfig } from '@/types/workflow'

interface WorkflowImportExportDialogProps {
  isOpen: boolean
  onClose: () => void
  workflowName: string
}

export function WorkflowImportExportDialog({
  isOpen,
  onClose,
  workflowName,
}: WorkflowImportExportDialogProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { getWorkflowConfig, setWorkflow, nodes, edges, name, description, id } = useWorkflowStore()

  // 生成导出的 JSON
  const getExportJson = () => {
    const config = getWorkflowConfig()
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workflow: {
        name: workflowName || name,
        description: description,
        config: config,
      },
    }
    return JSON.stringify(exportData, null, 2)
  }

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getExportJson())
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败')
    }
  }

  // 下载为文件
  const handleDownload = () => {
    const json = getExportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName || name || 'workflow'}_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('工作流已导出')
  }

  // 验证导入的 JSON
  const validateImportJson = (jsonStr: string): { valid: boolean; data?: WorkflowConfig; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr)

      // 检查是否有 workflow 字段
      if (!parsed.workflow) {
        return { valid: false, error: '无效的工作流格式：缺少 workflow 字段' }
      }

      const workflow = parsed.workflow

      // 检查是否有 config 字段
      if (!workflow.config) {
        return { valid: false, error: '无效的工作流格式：缺少 config 字段' }
      }

      const config = workflow.config as WorkflowConfig

      // 检查是否有 nodes 数组
      if (!Array.isArray(config.nodes)) {
        return { valid: false, error: '无效的工作流格式：缺少 nodes 数组' }
      }

      // 检查是否有 edges 数组
      if (!Array.isArray(config.edges)) {
        return { valid: false, error: '无效的工作流格式：缺少 edges 数组' }
      }

      return { valid: true, data: config }
    } catch {
      return { valid: false, error: 'JSON 格式错误，请检查语法' }
    }
  }

  // 处理导入
  const handleImport = () => {
    const validation = validateImportJson(importJson)

    if (!validation.valid) {
      setImportError(validation.error || '导入失败')
      return
    }

    const config = validation.data!

    // 为导入的节点生成新的 ID，避免 ID 冲突
    const idMapping: Record<string, string> = {}
    const timestamp = Date.now()

    const newNodes = config.nodes.map((node, index) => {
      const newId = `${node.type.toLowerCase()}_${timestamp}_${index}`
      idMapping[node.id] = newId
      return {
        ...node,
        id: newId,
      }
    })

    // 更新 edges 中的 source 和 target
    const newEdges = config.edges.map((edge, index) => ({
      ...edge,
      id: `edge_${timestamp}_${index}`,
      source: idMapping[edge.source] || edge.source,
      target: idMapping[edge.target] || edge.target,
    }))

    // 更新工作流
    setWorkflow({
      id: id || '',
      name: name,
      description: description,
      nodes: newNodes,
      edges: newEdges,
      version: config.version || 1,
      settings: config.settings,
      globalVariables: config.globalVariables,
    })

    toast.success('工作流已导入')
    setImportJson('')
    setImportError(null)
    onClose()
  }

  // 处理文件上传
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportJson(content)
      setImportError(null)

      // 自动验证
      const validation = validateImportJson(content)
      if (!validation.valid) {
        setImportError(validation.error || '文件格式错误')
      }
    }
    reader.onerror = () => {
      toast.error('文件读取失败')
    }
    reader.readAsText(file)

    // 重置 input
    event.target.value = ''
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            导入/导出工作流
          </DialogTitle>
          <DialogDescription>
            将工作流配置导出为 JSON 格式，或从 JSON 文件导入工作流配置
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'export' | 'import')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              导出
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              导入
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>工作流配置预览</Label>
              <div className="relative">
                <Textarea
                  value={getExportJson()}
                  readOnly
                  className="h-[300px] font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>节点数量: {nodes.length} | 连接数量: {edges.length}</span>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleDownload} className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                下载 JSON 文件
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                复制
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>粘贴 JSON 配置或上传文件</Label>
              <Textarea
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value)
                  setImportError(null)
                }}
                placeholder='粘贴工作流 JSON 配置...'
                className="h-[250px] font-mono text-xs"
              />
            </div>

            {importError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {importError}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Upload className="mr-2 h-4 w-4" />
                选择文件
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importJson.trim()}
                className="flex-1"
              >
                导入工作流
              </Button>
            </div>

            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium mb-1">注意事项：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>导入将替换当前工作流的所有节点和连接</li>
                <li>节点 ID 会自动重新生成以避免冲突</li>
                <li>导入后请检查节点配置是否完整</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
