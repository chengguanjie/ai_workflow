"use client"

import { useState } from "react"
import { Check, ChevronRight, Edit3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { InteractiveQuestion } from "@/stores/ai-assistant-store"

const OTHER_OPTION_ID = "_custom_other_"

interface InteractiveOptionsProps {
  questions: InteractiveQuestion[]
  onSubmit: (answers: Record<string, string | string[]>) => void
  className?: string
}

export function InteractiveOptions({ questions, onSubmit, className }: InteractiveOptionsProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentQuestion = questions[currentIndex]

  const handleSingleSelect = (questionId: string, value: string) => {
    setAnswers({ ...answers, [questionId]: value })
  }

  const handleMultiSelect = (questionId: string, value: string) => {
    const current = (answers[questionId] as string[]) || []
    const newValue = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    setAnswers({ ...answers, [questionId]: newValue })
  }

  const handleTextInput = (questionId: string, value: string) => {
    setAnswers({ ...answers, [questionId]: value })
  }

  const handleCustomInput = (questionId: string, value: string) => {
    setCustomInputs({ ...customInputs, [questionId]: value })
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      const finalAnswers: Record<string, string | string[]> = {}
      
      for (const [qId, answer] of Object.entries(answers)) {
        if (Array.isArray(answer)) {
          const processed = answer.map(a => 
            a === OTHER_OPTION_ID ? (customInputs[qId] || '其他') : a
          )
          finalAnswers[qId] = processed
        } else if (answer === OTHER_OPTION_ID) {
          finalAnswers[qId] = customInputs[qId] || '其他'
        } else {
          finalAnswers[qId] = answer
        }
      }
      
      onSubmit(finalAnswers)
    }
  }

  const isCurrentAnswered = () => {
    if (!currentQuestion) return false
    const answer = answers[currentQuestion.id]
    if (!answer) return !currentQuestion.required
    
    if (Array.isArray(answer)) {
      if (answer.length === 0) return false
      if (answer.includes(OTHER_OPTION_ID)) {
        const customValue = customInputs[currentQuestion.id]
        if (!customValue || customValue.trim().length === 0) return false
      }
      return true
    }
    
    if (answer === OTHER_OPTION_ID) {
      const customValue = customInputs[currentQuestion.id]
      return customValue ? customValue.trim().length > 0 : false
    }
    
    return answer.trim().length > 0
  }

  const isOtherSelected = (questionId: string) => {
    const answer = answers[questionId]
    if (Array.isArray(answer)) {
      return answer.includes(OTHER_OPTION_ID)
    }
    return answer === OTHER_OPTION_ID
  }

  if (!currentQuestion) return null

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>问题 {currentIndex + 1} / {questions.length}</span>
          {currentQuestion.required && <span className="text-destructive">* 必答</span>}
        </div>
        <h4 className="font-medium">{currentQuestion.question}</h4>
      </div>

      <div className="p-4">
        {currentQuestion.type === 'single' && currentQuestion.options && (
          <div className="space-y-2">
            {currentQuestion.options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSingleSelect(currentQuestion.id, option.id)}
                className={cn(
                  "w-full p-3 rounded-lg border text-left transition-colors",
                  answers[currentQuestion.id] === option.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                    answers[currentQuestion.id] === option.id
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  )}>
                    {answers[currentQuestion.id] === option.id && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{option.label}</p>
                    {option.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
            
            <button
              onClick={() => handleSingleSelect(currentQuestion.id, OTHER_OPTION_ID)}
              className={cn(
                "w-full p-3 rounded-lg border text-left transition-colors",
                answers[currentQuestion.id] === OTHER_OPTION_ID
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50 border-dashed"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                  answers[currentQuestion.id] === OTHER_OPTION_ID
                    ? "border-primary bg-primary"
                    : "border-muted-foreground"
                )}>
                  {answers[currentQuestion.id] === OTHER_OPTION_ID && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">其他（自定义输入）</p>
                </div>
              </div>
            </button>
            
            {isOtherSelected(currentQuestion.id) && (
              <div className="mt-2 ml-8">
                <Input
                  placeholder="请输入您的选项..."
                  value={customInputs[currentQuestion.id] || ''}
                  onChange={(e) => handleCustomInput(currentQuestion.id, e.target.value)}
                  className="text-sm"
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {currentQuestion.type === 'multiple' && currentQuestion.options && (
          <div className="space-y-2">
            {currentQuestion.options.map((option) => {
              const selected = ((answers[currentQuestion.id] as string[]) || []).includes(option.id)
              return (
                <button
                  key={option.id}
                  onClick={() => handleMultiSelect(currentQuestion.id, option.id)}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                      selected ? "border-primary bg-primary" : "border-muted-foreground"
                    )}>
                      {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{option.label}</p>
                      {option.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
            
            {(() => {
              const selected = ((answers[currentQuestion.id] as string[]) || []).includes(OTHER_OPTION_ID)
              return (
                <button
                  onClick={() => handleMultiSelect(currentQuestion.id, OTHER_OPTION_ID)}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "hover:bg-muted/50 border-dashed"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                      selected ? "border-primary bg-primary" : "border-muted-foreground"
                    )}>
                      {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <Edit3 className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">其他（自定义输入）</p>
                    </div>
                  </div>
                </button>
              )
            })()}
            
            {isOtherSelected(currentQuestion.id) && (
              <div className="mt-2 ml-8">
                <Input
                  placeholder="请输入您的选项..."
                  value={customInputs[currentQuestion.id] || ''}
                  onChange={(e) => handleCustomInput(currentQuestion.id, e.target.value)}
                  className="text-sm"
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {currentQuestion.type === 'text' && (
          <Textarea
            value={(answers[currentQuestion.id] as string) || ''}
            onChange={(e) => handleTextInput(currentQuestion.id, e.target.value)}
            placeholder="请输入您的回答..."
            className="min-h-[100px]"
          />
        )}
      </div>

      <div className="p-4 border-t flex justify-between">
        <Button
          variant="ghost"
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
        >
          上一步
        </Button>
        <Button onClick={handleNext} disabled={!isCurrentAnswered()}>
          {currentIndex === questions.length - 1 ? '完成' : '下一步'}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
