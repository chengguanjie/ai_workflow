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
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface NodeCommentDialogProps {
  isOpen: boolean
  onClose: () => void
  nodeId: string
  nodeName: string
  nodeType: string
  currentComment?: string
}

export function NodeCommentDialog({
  isOpen,
  onClose,
  nodeId,
  nodeName,
  nodeType,
  currentComment,
}: NodeCommentDialogProps) {
  const [comment, setComment] = useState(currentComment || '')
  const [isGenerating, setIsGenerating] = useState(false)
  const { updateNodeComment, nodes } = useWorkflowStore()

  useEffect(() => {
    setComment(currentComment || '')
  }, [currentComment, isOpen])

  const handleSave = () => {
    updateNodeComment(nodeId, comment)
    toast.success('注释已保存')
    onClose()
  }

  const handleAIGenerate = async () => {
    setIsGenerating(true)
    try {
      // 获取节点配置信息
      const node = nodes.find((n) => n.id === nodeId)
      const nodeConfig = node?.data

      const response = await fetch('/api/ai/generate-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          nodeName,
          nodeType,
          nodeConfig,
        }),
      })

      if (!response.ok) {
        throw new Error('生成注释失败')
      }

      const result = await response.json()
      setComment(result.comment)
      toast.success('AI 注释已生成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成注释失败')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>节点注释</DialogTitle>
          <DialogDescription>
            为节点「{nodeName}」添加说明注释，帮助理解此节点的作用
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              类型: {nodeType}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAIGenerate}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI 生成
            </Button>
          </div>

          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="描述这个节点的功能和作用..."
            className="min-h-[150px] resize-none"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
