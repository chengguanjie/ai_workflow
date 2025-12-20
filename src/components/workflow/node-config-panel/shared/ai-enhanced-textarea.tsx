'use client'

import { forwardRef, useRef, useImperativeHandle, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AIGenerateButton } from './ai-generate-button'
import { HighlightedTextarea, type HighlightedTextareaHandle } from './highlighted-textarea'

// ============================================
// AI 增强普通 Textarea
// ============================================

interface AIEnhancedTextareaProps {
  /** 文本框的值 */
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 占位符 */
  placeholder?: string
  /** 额外类名 */
  className?: string
  /** 最小高度 */
  minHeight?: string
  /** AI 字段类型标识 */
  fieldType: string
  /** AI 字段显示名称 */
  fieldLabel?: string
  /** 是否显示 AI 按钮 */
  showAIButton?: boolean
  /** 额外的右上角内容（在 AI 按钮之前） */
  extraActions?: ReactNode
}

/**
 * 带 AI 生成功能的增强 Textarea
 * 在右上角显示 AI 生成浮标按钮
 */
export function AIEnhancedTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '80px',
  fieldType,
  fieldLabel,
  showAIButton = true,
  extraActions,
}: AIEnhancedTextareaProps) {
  return (
    <div className="relative">
      {/* AI 按钮浮标 */}
      {showAIButton && (
        <div className="absolute -top-6 right-0 z-10 flex items-center gap-1">
          {extraActions}
          <AIGenerateButton
            fieldType={fieldType}
            currentContent={value}
            onConfirm={onChange}
            fieldLabel={fieldLabel}
          />
        </div>
      )}
      <textarea
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          className
        )}
        style={{ minHeight }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

// ============================================
// AI 增强 HighlightedTextarea
// ============================================

export interface AIEnhancedHighlightedTextareaHandle {
  insertText: (text: string) => void
  focus: () => void
}

interface AIEnhancedHighlightedTextareaProps {
  /** 文本框的值 */
  value: string
  /** 值变化回调 */
  onChange: (value: string) => void
  /** 占位符 */
  placeholder?: string
  /** 额外类名 */
  className?: string
  /** 最小高度 */
  minHeight?: string
  /** AI 字段类型标识 */
  fieldType: string
  /** AI 字段显示名称 */
  fieldLabel?: string
  /** 是否显示 AI 按钮 */
  showAIButton?: boolean
  /** 额外的右上角内容（在 AI 按钮之前） */
  extraActions?: ReactNode
}

/**
 * 带 AI 生成功能的增强 HighlightedTextarea
 * 支持 {{变量}} 高亮，并在右上角显示 AI 生成浮标按钮
 */
export const AIEnhancedHighlightedTextarea = forwardRef<
  AIEnhancedHighlightedTextareaHandle,
  AIEnhancedHighlightedTextareaProps
>(function AIEnhancedHighlightedTextarea(
  {
    value,
    onChange,
    placeholder,
    className,
    minHeight = '150px',
    fieldType,
    fieldLabel,
    showAIButton = true,
    extraActions,
  },
  ref
) {
  const highlightedTextareaRef = useRef<HighlightedTextareaHandle>(null)

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      highlightedTextareaRef.current?.insertText(text)
    },
    focus: () => {
      highlightedTextareaRef.current?.focus()
    },
  }), [])

  return (
    <div className="relative">
      {/* AI 按钮浮标 */}
      {showAIButton && (
        <div className="absolute -top-6 right-0 z-10 flex items-center gap-1">
          {extraActions}
          <AIGenerateButton
            fieldType={fieldType}
            currentContent={value}
            onConfirm={onChange}
            fieldLabel={fieldLabel}
          />
        </div>
      )}
      <HighlightedTextarea
        ref={highlightedTextareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
        minHeight={minHeight}
      />
    </div>
  )
})
