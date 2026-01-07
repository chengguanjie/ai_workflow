'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Sparkles, BookOpen, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'

interface WorkflowManualDialogProps {
  isOpen: boolean
  onClose: () => void
  workflowId: string
}

// 圆形进度条组件 - 使用 CSS 动画避免状态更新
function CircularProgress({ size = 16 }: { size?: number }) {
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI

  return (
    <svg
      width={size}
      height={size}
      className="animate-spin"
      style={{ animationDuration: '1.5s' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        className="text-muted-foreground/30"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.75}
        strokeLinecap="round"
        className="text-primary"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
    </svg>
  )
}

export function WorkflowManualDialog({
  isOpen,
  onClose,
  workflowId,
}: WorkflowManualDialogProps) {
  const { manual, setManual, nodes, edges, name } = useWorkflowStore()
  const [content, setContent] = useState(manual || '')
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    setContent(manual || '')
  }, [manual, isOpen])

  const handleSave = () => {
    setManual(content)
    toast.success('说明手册已保存')
    onClose()
  }

  // 构建工作流上下文信息
  const buildWorkflowContext = () => ({
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data?.type,
      name: n.data?.name,
      comment: n.data?.comment,
      config: n.data?.config,
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
    })),
  })

  const handleAIGenerate = async () => {
    setIsGenerating(true)
    try {
      const workflowContext = buildWorkflowContext()

      const response = await fetch('/api/ai/generate-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          workflowContext,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error?.message || result.error || '生成说明手册失败')
      }

      // 修复: API 返回格式是 { success: true, data: { manual: "..." } }
      const manualContent = result.data?.manual || result.manual
      if (!manualContent) {
        throw new Error('生成结果为空')
      }

      setContent(manualContent)
      toast.success('AI 说明手册已生成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成说明手册失败')
    } finally {
      setIsGenerating(false)
    }
  }

  // 后台执行功能
  const handleBackgroundGenerate = () => {
    const workflowContext = buildWorkflowContext()

    toast.info('说明手册正在后台生成中...')
    onClose()

    // 使用 setTimeout 确保对话框关闭后再开始请求
    setTimeout(async () => {
      try {
        const response = await fetch('/api/ai/generate-manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId,
            workflowContext,
          }),
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error?.message || result.error || '生成说明手册失败')
        }

        const manualContent = result.data?.manual || result.manual
        if (!manualContent) {
          throw new Error('生成结果为空')
        }

        setManual(manualContent)
        toast.success('说明手册已在后台生成完成')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '后台生成说明手册失败')
      }
    }, 100)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            工作流说明手册
          </DialogTitle>
          <DialogDescription>
            为此工作流编写操作指南和使用说明，帮助用户理解和使用此工作流
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              工作流：{name} | 节点数：{nodes.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAIGenerate}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <CircularProgress size={16} />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? '生成中...' : 'AI 生成'}
            </Button>
          </div>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在此编写工作流的使用说明...

例如：
## 工作流概述
这个工作流用于...

## 使用步骤
1. 首先...
2. 然后...
3. 最后...

## 注意事项
- 请确保...
- 注意..."
            className="min-h-[350px] resize-none font-mono text-sm"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={handleBackgroundGenerate}
            disabled={isGenerating}
            className="gap-2"
          >
            <PlayCircle className="h-4 w-4" />
            后台执行
          </Button>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
