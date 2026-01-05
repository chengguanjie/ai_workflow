'use client'

import { useRef, useCallback } from 'react'
import { HighlightedTextarea, type HighlightedTextareaHandle } from './highlighted-textarea'
import { CompactReferenceSelector } from './compact-reference-selector'
import { cn } from '@/lib/utils'

interface VariableTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  showReference?: boolean
  disabled?: boolean
}

/**
 * 带变量引用支持的多行文本组件
 * 用于工具配置面板中需要支持变量引用的多行字段（如请求体、代码等）
 */
export function VariableTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '80px',
  showReference = true,
  disabled = false,
}: VariableTextareaProps) {
  const textareaRef = useRef<HighlightedTextareaHandle>(null)

  // 处理引用插入
  const handleInsertReference = useCallback((reference: string) => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.insertText(reference)
    } else {
      // 没有引用时直接追加
      onChange(value + reference)
    }
  }, [value, onChange])

  return (
    <div className={cn('relative', className)}>
      {/* 引用选择器 - 放在右上角 */}
      {showReference && !disabled && (
        <div className="absolute right-1 top-1 z-10">
          <CompactReferenceSelector onInsert={handleInsertReference} />
        </div>
      )}

      {/* 高亮文本框 */}
      <HighlightedTextarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        className={cn(
          'text-xs',
          showReference && 'pr-8' // 为引用按钮留出空间
        )}
      />
    </div>
  )
}
