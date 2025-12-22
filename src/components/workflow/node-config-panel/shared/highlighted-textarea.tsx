'use client'

import { forwardRef, useRef, useEffect, useImperativeHandle, useCallback } from 'react'
import { cn } from '@/lib/utils'

// 扩展的 textarea 类型，包含 insertText 方法
export interface HighlightedTextareaHandle {
  insertText: (text: string) => void
  focus: () => void
}

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
 * 使用 contenteditable div 实现，避免叠加层同步问题
 */
export const HighlightedTextarea = forwardRef<HighlightedTextareaHandle, HighlightedTextareaProps>(
  function HighlightedTextarea({ value, onChange, placeholder, className, minHeight = '150px' }, ref) {
    const editorRef = useRef<HTMLDivElement>(null)
    const isComposingRef = useRef(false)
    const lastValueRef = useRef(value)

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      insertText: (text: string) => {
        const editor = editorRef.current
        if (!editor) return

        editor.focus()

        // 获取当前选区
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          // 没有选区，追加到末尾
          const newValue = value + text
          onChange(newValue)
          return
        }

        // 获取纯文本和光标位置
        const textContent = editor.innerText || ''
        const { start, end } = getSelectionOffsets(editor)

        // 在光标位置插入文本
        const newValue = textContent.substring(0, start) + text + textContent.substring(end)
        onChange(newValue)

        // 延迟设置光标位置
        requestAnimationFrame(() => {
          setCursorPosition(editor, start + text.length)
        })
      },
      focus: () => {
        editorRef.current?.focus()
      }
    }), [value, onChange])

    // 获取选区在纯文本中的偏移量
    const getSelectionOffsets = (element: HTMLElement): { start: number; end: number } => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        return { start: 0, end: 0 }
      }

      const range = selection.getRangeAt(0)
      const preRange = range.cloneRange()
      preRange.selectNodeContents(element)
      preRange.setEnd(range.startContainer, range.startOffset)
      const start = preRange.toString().length

      preRange.setEnd(range.endContainer, range.endOffset)
      const end = preRange.toString().length

      return { start, end }
    }

    // 设置光标位置
    const setCursorPosition = (element: HTMLElement, position: number) => {
      const selection = window.getSelection()
      if (!selection) return

      const range = document.createRange()
      let currentPos = 0
      let found = false

      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
      let node: Text | null

      while ((node = walker.nextNode() as Text | null)) {
        const nodeLength = node.textContent?.length || 0
        if (currentPos + nodeLength >= position) {
          range.setStart(node, position - currentPos)
          range.collapse(true)
          found = true
          break
        }
        currentPos += nodeLength
      }

      if (!found) {
        // 位置超出范围，放到末尾
        range.selectNodeContents(element)
        range.collapse(false)
      }

      selection.removeAllRanges()
      selection.addRange(range)
    }

    // 将文本转换为带高亮的 HTML
    const getHighlightedHTML = useCallback((text: string): string => {
      if (!text) return ''

      // 转义 HTML 特殊字符
      const escapeHtml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      }

      // 匹配 {{xxx}} 或 {{xxx.yyy}} 格式
      // 使用非贪婪匹配 .*?，确保匹配最近的 }}，避免全角/半角大括号混用导致的问题
      const parts = text.split(/(\{\{.*?\}\})/g)

      return parts.map((part) => {
        if (part.match(/^\{\{.*?\}\}$/)) {
          // 这是一个变量引用，高亮显示
          return `<span class="text-blue-600 dark:text-blue-400 font-medium">${escapeHtml(part)}</span>`
        }
        // 将换行符转换为 <br>，保留空格
        return escapeHtml(part).replace(/\n/g, '<br>')
      }).join('')
    }, [])

    // 处理输入
    const handleInput = useCallback(() => {
      if (isComposingRef.current) return

      const editor = editorRef.current
      if (!editor) return

      // 获取纯文本内容
      // 使用 innerText 会自动处理 <br> 为换行
      const text = editor.innerText || ''

      // 只有值真正改变时才触发 onChange
      if (text !== lastValueRef.current) {
        lastValueRef.current = text
        onChange(text)
      }
    }, [onChange])

    // 处理中文输入法
    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true
    }, [])

    const handleCompositionEnd = useCallback(() => {
      isComposingRef.current = false
      handleInput()
    }, [handleInput])

    // 当外部 value 改变时，更新编辑器内容
    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return

      // 如果正在输入中文，不更新
      if (isComposingRef.current) return

      // 获取当前纯文本
      const currentText = editor.innerText || ''

      // 只有当外部值与当前值不同时才更新
      if (value !== currentText) {
        // 保存光标位置
        const { start } = getSelectionOffsets(editor)
        const hadFocus = document.activeElement === editor

        // 更新内容
        editor.innerHTML = getHighlightedHTML(value) || `<span class="text-muted-foreground">${placeholder || ''}</span>`
        lastValueRef.current = value

        // 恢复光标位置
        if (hadFocus && value) {
          requestAnimationFrame(() => {
            setCursorPosition(editor, Math.min(start, value.length))
          })
        }
      }
    }, [value, placeholder, getHighlightedHTML])

    // 初始化内容
    useEffect(() => {
      const editor = editorRef.current
      if (editor && !editor.innerHTML) {
        editor.innerHTML = getHighlightedHTML(value) || `<span class="text-muted-foreground">${placeholder || ''}</span>`
        lastValueRef.current = value
      }
    }, [])

    // 处理 focus 时清除 placeholder
    const handleFocus = useCallback(() => {
      const editor = editorRef.current
      if (!editor) return

      if (!value && placeholder) {
        editor.innerHTML = ''
      }
    }, [value, placeholder])

    // 处理 blur 时显示 placeholder
    const handleBlur = useCallback(() => {
      const editor = editorRef.current
      if (!editor) return

      if (!value && placeholder) {
        editor.innerHTML = `<span class="text-muted-foreground">${placeholder}</span>`
      }
    }, [value, placeholder])

    // 处理粘贴 - 只粘贴纯文本
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
    }, [])

    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "overflow-auto resize-y",
          className
        )}
        style={{
          minHeight,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: '1.5',
        }}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        spellCheck={false}
      />
    )
  }
)
