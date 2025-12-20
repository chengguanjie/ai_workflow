'use client'

import { useState } from 'react'
import { Check, X, RefreshCw, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AIGeneratePreviewDialogProps {
  isOpen: boolean
  onClose: () => void
  originalContent: string
  generatedContent: string
  isOptimization: boolean
  isLoading: boolean
  onConfirm: (content: string) => void
  onRegenerate: () => void
  fieldLabel?: string
}

export function AIGeneratePreviewDialog({
  isOpen,
  onClose,
  originalContent,
  generatedContent,
  isOptimization,
  isLoading,
  onConfirm,
  onRegenerate,
  fieldLabel = '内容',
}: AIGeneratePreviewDialogProps) {
  const [editedContent, setEditedContent] = useState(generatedContent)

  // 当 generatedContent 变化时更新编辑内容
  if (generatedContent !== editedContent && !isLoading) {
    setEditedContent(generatedContent)
  }

  const handleConfirm = () => {
    onConfirm(editedContent)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在{isOptimization ? '优化' : '生成'}{fieldLabel}...
              </>
            ) : (
              <>
                AI {isOptimization ? '优化' : '生成'}结果
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isOptimization
              ? '以下是 AI 优化后的内容，您可以编辑后确认替换'
              : '以下是 AI 生成的内容，您可以编辑后确认使用'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {/* 原内容（优化模式下显示） */}
          {isOptimization && originalContent && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">原内容</div>
              <div className="p-3 rounded-md bg-muted/50 border text-sm whitespace-pre-wrap max-h-[150px] overflow-auto">
                {originalContent}
              </div>
            </div>
          )}

          {/* AI生成/优化的内容 */}
          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className={cn(
                "px-2 py-0.5 rounded text-xs",
                isOptimization ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              )}>
                {isOptimization ? '优化后' : 'AI 生成'}
              </span>
              <span className="text-muted-foreground text-xs">（可编辑）</span>
            </div>
            <textarea
              className={cn(
                "w-full min-h-[200px] p-3 rounded-md border text-sm resize-y",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              value={isLoading ? '生成中...' : editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              disabled={isLoading}
              placeholder="AI 生成的内容将显示在这里..."
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isLoading}
            className="gap-1"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            重新生成
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
              <X className="h-3.5 w-3.5 mr-1" />
              取消
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={isLoading || !editedContent}>
              <Check className="h-3.5 w-3.5 mr-1" />
              确认{isOptimization ? '替换' : '使用'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
