'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ReferenceSelector } from './reference-selector'
import { HighlightedTextarea, type HighlightedTextareaHandle } from './highlighted-textarea'
import { AIGenerateButton } from './ai-generate-button'
import type { KnowledgeItem } from '@/types/workflow'
import { cn } from '@/lib/utils'

interface ResizablePromptDialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  value: string
  onChange: (value: string) => void
  knowledgeItems: KnowledgeItem[]
  placeholder?: string
  /** AI 生成的字段类型 */
  fieldType?: string
}

export function ResizablePromptDialog({
  isOpen,
  onClose,
  title = 'User Prompt',
  value,
  onChange,
  knowledgeItems,
  placeholder = '输入提示词...',
  fieldType = 'userPrompt',
}: ResizablePromptDialogProps) {
  const textareaRef = useRef<HighlightedTextareaHandle>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [size, setSize] = useState({ width: 700, height: 500 })
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // 初始化位置到屏幕中央
  useEffect(() => {
    if (isOpen && !isMaximized) {
      const x = Math.max(0, (window.innerWidth - size.width) / 2)
      const y = Math.max(0, (window.innerHeight - size.height) / 2)
      setPosition({ x, y })
    }
  }, [isOpen, isMaximized, size.width, size.height])

  // 插入引用
  const handleInsertReference = (reference: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      onChange(value + reference)
      return
    }
    textarea.insertText(reference)
  }

  // 处理拖拽移动
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX - position.x
    const startY = e.clientY - position.y

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - size.width, moveEvent.clientX - startX))
      const newY = Math.max(0, Math.min(window.innerHeight - size.height, moveEvent.clientY - startY))
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [isMaximized, position, size])

  // 处理缩放
  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    if (isMaximized) return
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)

    const startX = e.clientX
    const startY = e.clientY
    const startWidth = size.width
    const startHeight = size.height
    const startPosX = position.x
    const startPosY = position.y

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let newWidth = startWidth
      let newHeight = startHeight
      let newX = startPosX
      let newY = startPosY

      // 根据方向计算新尺寸
      if (direction.includes('e')) {
        newWidth = Math.max(400, startWidth + deltaX)
      }
      if (direction.includes('w')) {
        newWidth = Math.max(400, startWidth - deltaX)
        newX = startPosX + (startWidth - newWidth)
      }
      if (direction.includes('s')) {
        newHeight = Math.max(300, startHeight + deltaY)
      }
      if (direction.includes('n')) {
        newHeight = Math.max(300, startHeight - deltaY)
        newY = startPosY + (startHeight - newHeight)
      }

      setSize({ width: newWidth, height: newHeight })
      setPosition({ x: newX, y: newY })
    }

	    const handleMouseUp = () => {
	      setIsResizing(false)
	      document.removeEventListener('mousemove', handleMouseMove)
	      document.removeEventListener('mouseup', handleMouseUp)
	    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [isMaximized, size, position])

  // 切换最大化
  const toggleMaximize = () => {
    setIsMaximized(!isMaximized)
  }

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const dialogStyle = isMaximized
    ? { top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' }
    : { top: position.y, left: position.x, width: size.width, height: size.height }

  return (
    <div className="fixed inset-0 z-50">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <div
        ref={dialogRef}
        className={cn(
          "absolute bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden",
          isMaximized && "rounded-none",
          (isResizing || isDragging) && "select-none"
        )}
        style={dialogStyle}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b bg-muted/50 cursor-move shrink-0"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <Label className="font-medium">{title}</Label>
          </div>
          <div className="flex items-center gap-1">
            <AIGenerateButton
              fieldType={fieldType}
              currentContent={value}
              onConfirm={onChange}
              fieldLabel={title}
            />
            <ReferenceSelector
              knowledgeItems={knowledgeItems}
              onInsert={handleInsertReference}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleMaximize}
            >
              {isMaximized ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 编辑区域 */}
        <div className="flex-1 p-4 overflow-hidden">
          <HighlightedTextarea
            ref={textareaRef}
            className="bg-background h-full"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            minHeight="100%"
          />
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground shrink-0">
          点击「插入引用」按钮选择节点和字段，或直接输入 {'{{节点名.字段名}}'} | 按 ESC 关闭
        </div>

        {/* 缩放手柄 - 仅非最大化时显示 */}
        {!isMaximized && (
          <>
            {/* 四角 */}
            <div
              className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
              onMouseDown={(e) => handleResizeStart(e, 'nw')}
            />
            <div
              className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
              onMouseDown={(e) => handleResizeStart(e, 'ne')}
            />
            <div
              className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
              onMouseDown={(e) => handleResizeStart(e, 'sw')}
            />
            <div
              className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
              onMouseDown={(e) => handleResizeStart(e, 'se')}
            />
            {/* 四边 */}
            <div
              className="absolute top-0 left-3 right-3 h-1 cursor-n-resize"
              onMouseDown={(e) => handleResizeStart(e, 'n')}
            />
            <div
              className="absolute bottom-0 left-3 right-3 h-1 cursor-s-resize"
              onMouseDown={(e) => handleResizeStart(e, 's')}
            />
            <div
              className="absolute left-0 top-3 bottom-3 w-1 cursor-w-resize"
              onMouseDown={(e) => handleResizeStart(e, 'w')}
            />
            <div
              className="absolute right-0 top-3 bottom-3 w-1 cursor-e-resize"
              onMouseDown={(e) => handleResizeStart(e, 'e')}
            />
          </>
        )}
      </div>
    </div>
  )
}
