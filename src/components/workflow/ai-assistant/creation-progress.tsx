"use client"

import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface CreationStep {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
}

interface CreationProgressProps {
  steps?: CreationStep[]
  progress: number
  className?: string
}

const DEFAULT_STEPS: CreationStep[] = [
  { id: 'confirm', name: '需求确认', status: 'pending' },
  { id: 'generate', name: '生成节点', status: 'pending' },
  { id: 'connect', name: '配置连接', status: 'pending' },
  { id: 'validate', name: '验证完成', status: 'pending' },
]

export function CreationProgress({ 
  steps = DEFAULT_STEPS, 
  progress, 
  className 
}: CreationProgressProps) {
  return (
    <div className={cn("border rounded-lg bg-card p-4", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">正在创建工作流</span>
      </div>

      <div className="relative">
        <div className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-muted" />
        
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="relative flex items-start gap-3 pl-1">
              <div className="relative z-10 bg-card">
                {step.status === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {step.status === 'in_progress' && (
                  <div className="relative">
                    <div className="absolute inset-0 animate-ping">
                      <Circle className="h-5 w-5 text-primary/50" />
                    </div>
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  </div>
                )}
                {step.status === 'pending' && (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                {step.status === 'error' && (
                  <Circle className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <p className={cn(
                  "text-sm",
                  step.status === 'completed' && "text-muted-foreground",
                  step.status === 'in_progress' && "text-foreground font-medium",
                  step.status === 'pending' && "text-muted-foreground",
                  step.status === 'error' && "text-destructive"
                )}>
                  {step.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>总进度</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
