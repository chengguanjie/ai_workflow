'use client'

import { forwardRef, useRef, useEffect, useImperativeHandle, useCallback } from 'react'
import { cn } from '@/lib/utils'

// 扩展的 textarea 类型，包含 insertText 方法
export interface HighlightedTextareaHandle {
  insertText: (text: string) => void
  insertTextAt: (text: string, start: number, end?: number) => void
  focus: () => void
  getSelectionOffsets: () => { start: number; end: number }
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
    const lastSelectionRef = useRef<{ start: number; end: number }>({ start: value.length, end: value.length })
    const undoStackRef = useRef<Array<{ value: string; cursor: number }>>([])
    const redoStackRef = useRef<Array<{ value: string; cursor: number }>>([])
    const isApplyingHistoryRef = useRef(false)

    // 获取选区在纯文本中的偏移量
    const getSelectionOffsets = useCallback((element: HTMLElement): { start: number; end: number } => {
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
    }, [])

    // 设置光标位置
    const setCursorPosition = useCallback((element: HTMLElement, position: number) => {
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
    }, [])

    const getSafeSelectionOffsets = useCallback((): { start: number; end: number } => {
      const editor = editorRef.current
      if (!editor) {
        return { start: value.length, end: value.length }
      }

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        return lastSelectionRef.current || { start: value.length, end: value.length }
      }

      const range = selection.getRangeAt(0)
      if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
        return lastSelectionRef.current || { start: value.length, end: value.length }
      }

      const offsets = getSelectionOffsets(editor)
      lastSelectionRef.current = offsets
      return offsets
    }, [getSelectionOffsets, value.length])

    const pushUndoState = useCallback((prevValue: string, cursor: number) => {
      if (isApplyingHistoryRef.current) return
      undoStackRef.current.push({ value: prevValue, cursor })
      // Any new edit invalidates redo history
      redoStackRef.current = []
      // Keep memory bounded
      if (undoStackRef.current.length > 200) {
        undoStackRef.current.shift()
      }
    }, [])

    const applyValueWithCursor = useCallback((nextValue: string, cursor: number) => {
      const editor = editorRef.current
      isApplyingHistoryRef.current = true
      onChange(nextValue)
      lastValueRef.current = nextValue
      lastSelectionRef.current = { start: cursor, end: cursor }

      if (!editor) {
        isApplyingHistoryRef.current = false
        return
      }

      requestAnimationFrame(() => {
        editor.focus()
        setCursorPosition(editor, Math.min(Math.max(0, cursor), nextValue.length))
        isApplyingHistoryRef.current = false
      })
    }, [onChange, setCursorPosition])

    const handleUndo = useCallback(() => {
      const current = value
      const currentCursor = getSafeSelectionOffsets().start
      const prev = undoStackRef.current.pop()
      if (!prev) return
      redoStackRef.current.push({ value: current, cursor: currentCursor })
      applyValueWithCursor(prev.value, prev.cursor)
    }, [applyValueWithCursor, getSafeSelectionOffsets, value])

    const handleRedo = useCallback(() => {
      const current = value
      const currentCursor = getSafeSelectionOffsets().start
      const next = redoStackRef.current.pop()
      if (!next) return
      undoStackRef.current.push({ value: current, cursor: currentCursor })
      applyValueWithCursor(next.value, next.cursor)
    }, [applyValueWithCursor, getSafeSelectionOffsets, value])

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
        const { start, end } = getSafeSelectionOffsets()

        // 在光标位置插入文本
        pushUndoState(value, start)
        const newValue = textContent.substring(0, start) + text + textContent.substring(end)
        onChange(newValue)

        // 延迟设置光标位置
        requestAnimationFrame(() => {
          setCursorPosition(editor, start + text.length)
        })
      },
      insertTextAt: (text: string, start: number, end?: number) => {
        const editor = editorRef.current
        const safeStart = Math.max(0, Math.min(value.length, start))
        const safeEnd = Math.max(safeStart, Math.min(value.length, end ?? start))
        pushUndoState(value, safeStart)
        const newValue = value.substring(0, safeStart) + text + value.substring(safeEnd)
        onChange(newValue)

        if (!editor) return
        requestAnimationFrame(() => {
          editor.focus()
          setCursorPosition(editor, safeStart + text.length)
        })
      },
      focus: () => {
        editorRef.current?.focus()
      },
      getSelectionOffsets: () => {
        return getSafeSelectionOffsets()
      },
    }), [value, onChange, getSafeSelectionOffsets, pushUndoState, setCursorPosition])

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
        const cursor = getSafeSelectionOffsets().start
        pushUndoState(lastValueRef.current, cursor)
        lastValueRef.current = text
        onChange(text)
      }
    }, [getSafeSelectionOffsets, onChange, pushUndoState])

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
        const { start } = getSafeSelectionOffsets()
        const hadFocus = document.activeElement === editor

        // 更新内容
        editor.innerHTML = getHighlightedHTML(value) || `<span class="text-muted-foreground">${placeholder || ''}</span>`
        lastValueRef.current = value
        lastSelectionRef.current = { start: Math.min(start, value.length), end: Math.min(start, value.length) }

        // 恢复光标位置
        if (hadFocus && value) {
          requestAnimationFrame(() => {
            setCursorPosition(editor, Math.min(start, value.length))
          })
        }
      }
    }, [value, placeholder, getHighlightedHTML, getSafeSelectionOffsets, setCursorPosition])

    // 初始化内容
    useEffect(() => {
      const editor = editorRef.current
      if (editor && !editor.innerHTML) {
        editor.innerHTML = getHighlightedHTML(value) || `<span class="text-muted-foreground">${placeholder || ''}</span>`
        lastValueRef.current = value
      }
    }, [value, placeholder, getHighlightedHTML])

    // 处理 focus 时清除 placeholder
    const handleFocus = useCallback(() => {
      const editor = editorRef.current
      if (!editor) return

      if (!value && placeholder) {
        editor.innerHTML = ''
      }

      // Cache caret on focus (best-effort).
      lastSelectionRef.current = getSafeSelectionOffsets()
    }, [getSafeSelectionOffsets, placeholder, value])

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

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (!e.metaKey) return

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }, [handleRedo, handleUndo])

    const updateSelectionCache = useCallback(() => {
      lastSelectionRef.current = getSafeSelectionOffsets()
    }, [getSafeSelectionOffsets])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      const editor = editorRef.current
      if (!editor) return

      if (e.shiftKey) {
        // Let browser extend selection when shift is pressed.
        updateSelectionCache()
        return
      }

      // Some browsers keep the previous selection when clicking "blank" areas
      // inside a contenteditable (e.g., below the last line). We normalize the
      // caret to the click position (or end) so insertion is predictable.
      const targetNode = e.target as Node
      if (targetNode && editor.contains(targetNode)) {
        const doc = document as unknown as {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
          caretRangeFromPoint?: (x: number, y: number) => Range | null
        }

        const selection = window.getSelection()
        if (selection) {
          const x = e.clientX
          const y = e.clientY

          const getEndCaretRect = (): DOMRect => {
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null)
            let lastText: Text | null = null
            let n: Text | null
            while ((n = walker.nextNode() as Text | null)) lastText = n

            const r = document.createRange()
            if (lastText && (lastText.textContent || '').length > 0) {
              r.setStart(lastText, (lastText.textContent || '').length)
              r.collapse(true)
            } else {
              r.selectNodeContents(editor)
              r.collapse(false)
            }

            return r.getBoundingClientRect()
          }

          const pos = doc.caretPositionFromPoint?.(x, y)
          const rangeFromPoint =
            (pos && (() => {
              const r = document.createRange()
              r.setStart(pos.offsetNode, pos.offset)
              r.collapse(true)
              return r
            })()) ||
            doc.caretRangeFromPoint?.(x, y) ||
            null

          const range = (() => {
            const endRange = document.createRange()
            endRange.selectNodeContents(editor)
            endRange.collapse(false)

            if (!rangeFromPoint || !editor.contains(rangeFromPoint.startContainer)) return endRange

            // If the click is below the actual end-of-content caret position, treat it as "append to end".
            // This is more reliable than relying on the browser's caret mapping for blank areas.
            const endRect = getEndCaretRect()
            if (endRect.bottom > 0 && y > endRect.bottom + 6) return endRange

            // Some browsers map clicks in blank areas to the nearest wrapped line; if the mapped caret is
            // visually above the click, also treat it as "append to end".
            const mappedRect = rangeFromPoint.getBoundingClientRect()
            const editorRect = editor.getBoundingClientRect()
            const clickedNearBottom = y > editorRect.bottom - 8
            if ((mappedRect.bottom > 0 && y > mappedRect.bottom + 4) || (mappedRect.bottom === 0 && clickedNearBottom)) {
              return endRange
            }

            return rangeFromPoint
          })()

          selection.removeAllRanges()
          selection.addRange(range)

          if (!rangeFromPoint || range !== rangeFromPoint) {
            const editorText = editor.innerText || ''
            lastSelectionRef.current = { start: editorText.length, end: editorText.length }
          }
        }
      }

      updateSelectionCache()
    }, [updateSelectionCache])

    useEffect(() => {
      const handleSelectionChange = () => {
        const editor = editorRef.current
        if (!editor) return
        if (document.activeElement !== editor) return

        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return

        lastSelectionRef.current = getSelectionOffsets(editor)
      }

      document.addEventListener('selectionchange', handleSelectionChange)
      return () => document.removeEventListener('selectionchange', handleSelectionChange)
    }, [getSelectionOffsets])

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
        onKeyDown={handleKeyDown}
        onKeyUp={updateSelectionCache}
        onMouseDown={handleMouseDown}
        onMouseUp={updateSelectionCache}
        spellCheck={false}
      />
    )
  }
)
