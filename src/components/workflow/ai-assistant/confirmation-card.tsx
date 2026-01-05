"use client"

import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { RequirementConfirmation } from "@/stores/ai-assistant-store"

interface ConfirmationCardProps {
  confirmation: RequirementConfirmation
  onConfirm: (confirmed: RequirementConfirmation) => void
  onCancel: () => void
  className?: string
}

export function ConfirmationCard({ confirmation, onConfirm, onCancel, className }: ConfirmationCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [edited, setEdited] = useState<RequirementConfirmation>(confirmation)

  const handleConfirm = () => {
    onConfirm(isEditing ? edited : confirmation)
  }

  const handleFieldChange = (index: number, key: string, value: string | boolean) => {
    const newFields = [...edited.inputFields]
    newFields[index] = { ...newFields[index], [key]: value }
    setEdited({ ...edited, inputFields: newFields })
  }

  const handleStepChange = (index: number, key: string, value: string) => {
    const newSteps = [...edited.processSteps]
    newSteps[index] = { ...newSteps[index], [key]: value }
    setEdited({ ...edited, processSteps: newSteps })
  }

  const data = isEditing ? edited : confirmation

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <div className="p-4 border-b flex items-center justify-between">
        <h4 className="font-medium">需求确认</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <X className="h-4 w-4 mr-1" />
              取消编辑
            </>
          ) : (
            <>
              <Pencil className="h-4 w-4 mr-1" />
              编辑
            </>
          )}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">工作流名称</label>
          {isEditing ? (
            <Input 
              value={edited.workflowName}
              onChange={(e) => setEdited({ ...edited, workflowName: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm font-medium mt-1">{data.workflowName}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">目标</label>
          {isEditing ? (
            <Input 
              value={edited.goal}
              onChange={(e) => setEdited({ ...edited, goal: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm mt-1">{data.goal}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">输入字段</label>
          <div className="space-y-2">
            {data.inputFields.map((field, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                {isEditing ? (
                  <>
                    <Input 
                      value={field.name}
                      onChange={(e) => handleFieldChange(index, 'name', e.target.value)}
                      className="flex-1 h-8"
                      placeholder="字段名"
                    />
                    <Badge variant="outline" className="shrink-0">{field.type}</Badge>
                    <Badge variant={field.required ? "default" : "secondary"} className="shrink-0">
                      {field.required ? "必填" : "选填"}
                    </Badge>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{field.name}</span>
                    <Badge variant="outline">{field.type}</Badge>
                    {field.required && <Badge>必填</Badge>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block">处理步骤</label>
          <div className="space-y-2">
            {data.processSteps.map((step, index) => (
              <div key={index} className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                <span className="text-xs text-muted-foreground mt-1">{index + 1}.</span>
                {isEditing ? (
                  <div className="flex-1 space-y-1">
                    <Input 
                      value={step.name}
                      onChange={(e) => handleStepChange(index, 'name', e.target.value)}
                      className="h-8"
                      placeholder="步骤名称"
                    />
                    <Input 
                      value={step.description}
                      onChange={(e) => handleStepChange(index, 'description', e.target.value)}
                      className="h-8"
                      placeholder="步骤描述"
                    />
                  </div>
                ) : (
                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.name}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={handleConfirm}>
          <Check className="h-4 w-4 mr-1" />
          确认创建
        </Button>
      </div>
    </div>
  )
}
