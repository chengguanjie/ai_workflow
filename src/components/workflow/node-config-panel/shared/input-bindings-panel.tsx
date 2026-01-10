'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ReferenceSelector } from './reference-selector'
import { X } from 'lucide-react'
import { getInputBindingSlots } from './input-binding-utils'

export interface InputBindingsPanelProps {
  userPrompt: string
  bindings?: Record<string, string>
  onBindingsChange: (next: Record<string, string>) => void
  onInsertIntoPrompt: (text: string) => void
}

export function InputBindingsPanel({
  userPrompt,
  bindings,
  onBindingsChange,
  onInsertIntoPrompt,
}: InputBindingsPanelProps) {
  const currentBindings = bindings || {}
  const slots = useMemo(
    () => getInputBindingSlots(userPrompt, bindings),
    [userPrompt, bindings]
  )

  const setBinding = (slot: string, reference: string) => {
    onBindingsChange({
      ...currentBindings,
      [slot]: reference,
    })
  }

  const clearBinding = (slot: string) => {
    const next = { ...currentBindings }
    delete next[slot]
    onBindingsChange(next)
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">运行时映射（高级）</div>
      </div>

      {slots.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          未检测到槽位：在提示词里用 <span className="font-mono">【文章内容】</span> 这种标题包裹即可自动生成映射项。
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            为槽位选择上游来源后，运行时会注入为 <span className="font-mono">{'{{inputs.槽位名}}'}</span>；提示词里仍可直接写 <span className="font-mono">{'{{上游节点.字段}}'}</span>（更直观）。
          </div>

          {slots.map((slot) => {
            const runtimeAlias = `{{inputs.${slot}}}`
            const source = currentBindings[slot]
            const displayReference = source || runtimeAlias

            return (
              <div key={slot} className="rounded-md border bg-background p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{slot}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {displayReference}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onInsertIntoPrompt(displayReference)}
                      title={source ? '插入上游引用' : '未选择来源：插入运行时别名'}
                    >
                      插入
                    </Button>

                    <ReferenceSelector
                      knowledgeItems={[]}
                      onInsert={(ref) => setBinding(slot, ref)}
                      buttonLabel="选择来源"
                    />

                    {source && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => clearBinding(slot)}
                        title="清除绑定"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-2 text-xs">
                  <span className="text-muted-foreground">来源：</span>
                  <span className="font-mono text-muted-foreground break-all">
                    {source || '未选择'}
                  </span>
                </div>
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">运行时别名：</span>
                  <span className="font-mono text-muted-foreground break-all">
                    {runtimeAlias}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
