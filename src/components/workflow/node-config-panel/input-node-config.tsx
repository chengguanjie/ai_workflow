'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus, GripVertical } from 'lucide-react'
import type { InputField } from '@/types/workflow'
import { useWorkflowStore } from '@/stores/workflow-store'

interface InputNodeConfigPanelProps {
  nodeName: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function InputNodeConfigPanel({
  nodeName,
  config,
  onUpdate,
}: InputNodeConfigPanelProps) {
  const fields = (config?.fields as InputField[]) || []
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const renameInputField = useWorkflowStore((state) => state.renameInputField)
  // 用于追踪字段名称修改前的值
  const fieldNameBeforeEdit = useRef<string>('')

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

  // 拖拽排序相关处理
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      const newFields = [...fields]
      const [draggedField] = newFields.splice(draggedIndex, 1)
      newFields.splice(dropIndex, 0, draggedField)
      onUpdate({ ...config, fields: newFields })

      // 触发立即保存事件
      window.dispatchEvent(new CustomEvent('workflow-request-save'))
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
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
            <div
              key={field.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`border rounded-lg p-3 space-y-2 transition-all ${
                draggedIndex === index ? 'opacity-50 scale-[0.98]' : ''
              } ${
                dragOverIndex === index
                  ? 'border-primary border-2 bg-primary/5'
                  : ''
              }`}
            >
              {/* 字段名称行 */}
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing" />
                <Input
                  value={field.name}
                  onFocus={() => {
                    // 记录编辑前的字段名称
                    fieldNameBeforeEdit.current = field.name
                  }}
                  onChange={(e) => updateField(index, { name: e.target.value })}
                  onBlur={(e) => {
                    // 当输入框失去焦点时，检查字段名是否有变化，如果有则更新引用
                    const oldName = fieldNameBeforeEdit.current
                    const newName = e.target.value.trim()
                    if (oldName && newName && oldName !== newName) {
                      renameInputField(nodeName, oldName, newName)
                    }
                    fieldNameBeforeEdit.current = ''
                  }}
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
