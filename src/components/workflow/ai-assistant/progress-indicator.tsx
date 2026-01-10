"use client"

import { CheckCircle2, Circle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskStep } from "@/stores/ai-assistant-store"

interface ProgressIndicatorProps {
  steps: TaskStep[]
  progress: number
  className?: string
}

export function ProgressIndicator({ steps, progress, className }: ProgressIndicatorProps) {
  if (steps.length === 0) return null

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>进度</span>
        <span>{Math.round(progress)}%</span>
      </div>
      
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step, _index) => (
          <div key={step.id} className="flex items-start gap-2">
            <div className="mt-0.5">
              {step.status === 'completed' && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {step.status === 'in_progress' && (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              )}
              {(step.status === 'pending' || step.status === 'error') && (
                <Circle className={cn(
                  "h-4 w-4",
                  step.status === 'error' ? "text-destructive" : "text-muted-foreground"
                )} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm leading-tight",
                step.status === 'completed' && "text-muted-foreground",
                step.status === 'in_progress' && "text-foreground font-medium",
                step.status === 'pending' && "text-muted-foreground",
                step.status === 'error' && "text-destructive"
              )}>
                {step.name}
              </p>
              {step.description && step.status === 'in_progress' && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
