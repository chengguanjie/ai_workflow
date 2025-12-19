'use client'

import { useRef } from 'react'
import { Label } from '@/components/ui/label'
import { ReferenceSelector } from './reference-selector'
import type { KnowledgeItem } from '@/types/workflow'

interface PromptTabContentProps {
  processConfig: {
    systemPrompt?: string
    userPrompt?: string
  }
  knowledgeItems: KnowledgeItem[]
  onSystemPromptChange: (value: string) => void
  onUserPromptChange: (value: string) => void
}

export function PromptTabContent({
  processConfig,
  knowledgeItems,
  onSystemPromptChange,
  onUserPromptChange,
}: PromptTabContentProps) {
  const userPromptRef = useRef<HTMLTextAreaElement>(null)

  // 插入引用到光标位置
  const handleInsertReference = (reference: string) => {
    const textarea = userPromptRef.current
    if (!textarea) {
      // 如果无法获取光标位置，直接追加
      onUserPromptChange((processConfig.userPrompt || '') + reference)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = processConfig.userPrompt || ''

    // 在光标位置插入引用
    const newValue = currentValue.substring(0, start) + reference + currentValue.substring(end)
    onUserPromptChange(newValue)

    // 重新设置光标位置
    requestAnimationFrame(() => {
      textarea.focus()
      const newCursorPos = start + reference.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          placeholder="系统提示词（可选）...&#10;&#10;用于设定 AI 的角色和行为方式"
          value={processConfig.systemPrompt || ''}
          onChange={(e) => onSystemPromptChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>User Prompt</Label>
          <ReferenceSelector
            knowledgeItems={knowledgeItems}
            onInsert={handleInsertReference}
          />
        </div>
        <textarea
          ref={userPromptRef}
          className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          placeholder="用户提示词，点击「插入引用」选择变量..."
          value={processConfig.userPrompt || ''}
          onChange={(e) => onUserPromptChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          点击「插入引用」按钮选择节点和字段，或直接输入 {'{{节点名.字段名}}'}
        </p>
      </div>
    </div>
  )
}
