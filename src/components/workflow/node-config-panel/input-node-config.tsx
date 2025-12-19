'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus, GripVertical } from 'lucide-react'
import type { InputField } from '@/types/workflow'

interface InputNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function InputNodeConfigPanel({
  config,
  onUpdate,
}: InputNodeConfigPanelProps) {
  const fields = (config?.fields as InputField[]) || []

  const addField = () => {
    const newField: InputField = {
      id: `field_${Date.now()}`,
      name: `字段${fields.length + 1}`,
      value: '',
      height: 80,
    }
    onUpdate({ ...config, fields: [...fields, newField] })
  }

  const updateField = (index: number, updates: Partial<InputField>) => {
    const newFields = [...fields]
    newFields[index] = { ...newFields[index], ...updates }
    onUpdate({ ...config, fields: newFields })
  }

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index)
    onUpdate({ ...config, fields: newFields })
  }

  // 处理文本框高度拖拽
  const handleResizeStart = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = fields[index].height || 80

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.max(40, Math.min(300, startHeight + deltaY))
      updateField(index, { height: newHeight })
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">输入字段</h4>
        <Button variant="outline" size="sm" onClick={addField}>
          <Plus className="mr-1 h-3 w-3" />
          添加字段
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          暂无输入字段，点击上方按钮添加
        </p>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="border rounded-lg p-3 space-y-2">
              {/* 字段名称行 */}
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-move" />
                <Input
                  value={field.name}
                  onChange={(e) => updateField(index, { name: e.target.value })}
                  placeholder="字段名称"
                  className="h-7 text-sm font-medium flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => removeField(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {/* 文本内容输入框 */}
              <div className="relative">
                <textarea
                  value={field.value || ''}
                  onChange={(e) => updateField(index, { value: e.target.value })}
                  placeholder={`输入 {{输入.${field.name}}} 的内容...`}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  style={{ height: field.height || 80 }}
                />
                {/* 底部拖拽调整高度的手柄 */}
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-border hover:bg-primary cursor-ns-resize rounded-full"
                  onMouseDown={(e) => handleResizeStart(index, e)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                引用方式: {'{{'}输入.{field.name}{'}}'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
