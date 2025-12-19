'use client'

import { forwardRef, useRef, useEffect, useImperativeHandle } from 'react'
import { cn } from '@/lib/utils'

interface HighlightedTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

/**
 * 带语法高亮的 Textarea 组件
 * 将 {{变量名}} 格式的引用高亮为蓝色
 */
export const HighlightedTextarea = forwardRef<HTMLTextAreaElement, HighlightedTextareaProps>(
  function HighlightedTextarea({ value, onChange, placeholder, className, minHeight = '150px' }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const highlightRef = useRef<HTMLDivElement>(null)

    // 暴露 ref 给父组件
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement)

    // 同步滚动
    const syncScroll = () => {
      if (textareaRef.current && highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
      }
    }

    // 监听滚动事件
    useEffect(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.addEventListener('scroll', syncScroll)
        return () => textarea.removeEventListener('scroll', syncScroll)
      }
    }, [])

    // 将文本转换为带高亮的 HTML
    const getHighlightedContent = (text: string) => {
      if (!text) return ''

      // 匹配 {{xxx}} 或 {{xxx.yyy}} 格式
      const parts = text.split(/(\{\{[^}]+\}\})/g)

      return parts.map((part) => {
        if (part.match(/^\{\{[^}]+\}\}$/)) {
          // 这是一个变量引用，高亮显示
          return `<span class="text-blue-600 dark:text-blue-400 font-medium">${escapeHtml(part)}</span>`
        }
        return escapeHtml(part)
      }).join('')
    }

    // 转义 HTML 特殊字符
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br/>')
        .replace(/ /g, '&nbsp;')
    }

    // 为高亮层和 textarea 生成占位符 HTML
    const placeholderHtml = placeholder ? `<span class="text-muted-foreground">${escapeHtml(placeholder)}</span>` : ''

    return (
      <div className={cn("relative", className)} style={{ minHeight }}>
        {/* 高亮显示层 - 在下方 */}
        <div
          ref={highlightRef}
          className="absolute inset-0 w-full rounded-md border border-transparent bg-background px-3 py-2 text-sm overflow-auto whitespace-pre-wrap break-words pointer-events-none text-foreground"
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: getHighlightedContent(value) || placeholderHtml }}
        />

        {/* 实际输入层 - 在上方，完全透明 */}
        <textarea
          ref={textareaRef}
          className="relative w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y overflow-auto text-transparent caret-foreground selection:bg-blue-200/50 dark:selection:bg-blue-800/50"
          style={{ minHeight }}
          placeholder=""
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
        />
      </div>
    )
  }
)
