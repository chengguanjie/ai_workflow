'use client'

import React from 'react'
import { Download, Image as ImageIcon, Music, Video, FileType } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { OutputType } from '@/lib/workflow/debug-panel/types'

// ============================================
// Types
// ============================================

interface PreviewModalProps {
  isOpen: boolean
  onClose: () => void
  outputType: OutputType
  content: string | Blob | null
  fileName: string
  onDownload: () => void
}

// ============================================
// PreviewModal Component
// ============================================

/**
 * PreviewModal - A modal component for previewing output content
 * 
 * Supports previewing:
 * - Images: displays the image
 * - Audio: displays audio player
 * - Video: displays video player
 * - Documents (Word/PDF/Excel/PPT): displays file info with download option
 * - Text/JSON/HTML/CSV: displays formatted text content
 */
export function PreviewModal({
  isOpen,
  onClose,
  outputType,
  content,
  fileName,
  onDownload
}: PreviewModalProps) {
  // Get content URL for media types
  const getContentUrl = (): string | null => {
    if (!content) return null

    if (content instanceof Blob) {
      return URL.createObjectURL(content)
    }

    // For string content that might be a data URL or regular URL
    if (typeof content === 'string') {
      if (content.startsWith('data:') || content.startsWith('http://') || content.startsWith('https://')) {
        return content
      }
    }

    return null
  }

  // Render content based on output type
  const renderContent = () => {
    const contentUrl = getContentUrl()

    switch (outputType) {
      case 'image':
        return contentUrl ? (
          <div className="flex items-center justify-center p-4 bg-muted/20 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contentUrl}
              alt={fileName}
              className="max-w-full max-h-[60vh] object-contain rounded"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mb-4 opacity-50" />
            <p>无法预览图片</p>
          </div>
        )

      case 'audio':
        return contentUrl ? (
          <div className="flex flex-col items-center justify-center p-8 bg-muted/20 rounded-lg">
            <Music className="h-16 w-16 mb-4 text-primary/50" />
            <audio controls className="w-full max-w-md">
              <source src={contentUrl} />
              您的浏览器不支持音频播放
            </audio>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Music className="h-12 w-12 mb-4 opacity-50" />
            <p>无法预览音频</p>
          </div>
        )

      case 'video':
        return contentUrl ? (
          <div className="flex items-center justify-center p-4 bg-black rounded-lg">
            <video controls className="max-w-full max-h-[60vh] rounded">
              <source src={contentUrl} />
              您的浏览器不支持视频播放
            </video>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Video className="h-12 w-12 mb-4 opacity-50" />
            <p>无法预览视频</p>
          </div>
        )

      case 'word':
      case 'pdf':
      case 'excel':
      case 'ppt':
        return (
          <div className="flex flex-col items-center justify-center py-12 bg-muted/20 rounded-lg">
            <FileType className="h-16 w-16 mb-4 text-primary/50" />
            <p className="text-lg font-medium mb-2">{fileName}</p>
            <p className="text-sm text-muted-foreground mb-6">
              {outputType === 'word' && 'Word 文档'}
              {outputType === 'pdf' && 'PDF 文档'}
              {outputType === 'excel' && 'Excel 表格'}
              {outputType === 'ppt' && 'PPT 演示文稿'}
            </p>
            <Button onClick={onDownload} className="gap-2">
              <Download className="h-4 w-4" />
              下载文件
            </Button>
          </div>
        )

      case 'text':
      case 'json':
      case 'html':
      case 'csv':
      default:
        return (
          <div className="relative">
            <pre className={cn(
              "rounded-lg border bg-white p-4 text-xs overflow-auto max-h-[60vh] font-mono leading-relaxed",
              "scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
            )}>
              {typeof content === 'string' ? content : '无法显示内容'}
            </pre>
          </div>
        )
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold truncate pr-4">
              {fileName}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                下载
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PreviewModal
