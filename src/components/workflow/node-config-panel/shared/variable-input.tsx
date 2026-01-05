'use client'

import { useRef, useCallback, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { CompactReferenceSelector } from './compact-reference-selector'
import { cn } from '@/lib/utils'

interface VariableInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: 'text' | 'url'
  showReference?: boolean
  disabled?: boolean
}

/**
 * 变量引用正则 - 用于检测是否包含变量
 */
const VARIABLE_PATTERN = /\{\{[^{}]+\}\}/g

/**
 * 带变量引用支持的单行输入组件
 * 用于工具配置面板中需要支持变量引用的字段
 */
export function VariableInput({
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
  showReference = true,
  disabled = false,
}: VariableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // 检查是否包含变量
  const hasVariables = useMemo(() => {
    return VARIABLE_PATTERN.test(value)
  }, [value])

  // 处理引用插入
  const handleInsertReference = useCallback((reference: string) => {
    const input = inputRef.current
    if (!input) {
      // 没有输入框引用时，直接追加
      onChange(value + reference)
      return
    }

    // 获取当前光标位置
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length

    // 在光标位置插入引用
    const newValue = value.slice(0, start) + reference + value.slice(end)
    onChange(newValue)

    // 延迟设置光标位置到引用之后
    requestAnimationFrame(() => {
      const newCursorPos = start + reference.length
      input.setSelectionRange(newCursorPos, newCursorPos)
      input.focus()
    })
  }, [value, onChange])

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'h-8 text-xs pr-2',
            hasVariables && 'text-blue-600 dark:text-blue-400'
          )}
        />
        {/* 变量指示器 */}
        {hasVariables && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 bg-blue-50 dark:bg-blue-950 px-1 rounded pointer-events-none">
            变量
          </div>
        )}
      </div>
      {showReference && !disabled && (
        <CompactReferenceSelector onInsert={handleInsertReference} />
      )}
    </div>
  )
}
