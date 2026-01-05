"use client"

import { AlertCircle, AlertTriangle, Info, Lightbulb, Stethoscope } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { DiagnosisResult, DiagnosisSuggestion } from "@/stores/ai-assistant-store"

interface DiagnosisDisplayProps {
  diagnosis: DiagnosisResult
  suggestions?: DiagnosisSuggestion[]
  className?: string
}

const SEVERITY_CONFIG = {
  high: {
    icon: AlertCircle,
    label: "高",
    color: "bg-red-500/10 text-red-600 border-red-200",
    iconColor: "text-red-500",
  },
  medium: {
    icon: AlertTriangle,
    label: "中",
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
    iconColor: "text-amber-500",
  },
  low: {
    icon: Info,
    label: "低",
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
    iconColor: "text-blue-500",
  },
}

const PROBLEM_TYPE_LABELS: Record<string, string> = {
  prompt: "提示词问题",
  config: "配置问题",
  connection: "连接问题",
  tool: "工具问题",
  other: "其他问题",
}

const PRIORITY_CONFIG = {
  high: {
    label: "高优先级",
    color: "bg-red-500/10 text-red-600 border-red-200",
  },
  medium: {
    label: "中优先级",
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
  },
  low: {
    label: "低优先级",
    color: "bg-gray-500/10 text-gray-600 border-gray-200",
  },
}

export function DiagnosisDisplay({ 
  diagnosis, 
  suggestions,
  className 
}: DiagnosisDisplayProps) {
  return (
    <div className={cn("border rounded-lg bg-card overflow-hidden", className)}>
      <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium text-gray-800">节点诊断结果</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {diagnosis.nodeName}
          </Badge>
          <span className="text-xs text-muted-foreground">
            ID: {diagnosis.nodeId}
          </span>
        </div>
      </div>

      {diagnosis.summary && (
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm text-gray-700">{diagnosis.summary}</p>
        </div>
      )}

      {diagnosis.problems && diagnosis.problems.length > 0 && (
        <div className="p-4 border-b">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3" />
            发现问题 ({diagnosis.problems.length})
          </h4>
          <div className="space-y-2">
            {diagnosis.problems.map((problem, index) => {
              const severityConfig = SEVERITY_CONFIG[problem.severity]
              const SeverityIcon = severityConfig.icon
              
              return (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50"
                >
                  <SeverityIcon className={cn("h-4 w-4 mt-0.5 shrink-0", severityConfig.iconColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn("text-[10px]", severityConfig.color)}>
                        {severityConfig.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {PROBLEM_TYPE_LABELS[problem.type] || problem.type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{problem.issue}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3" />
            修复建议 ({suggestions.length})
          </h4>
          <div className="space-y-2">
            {suggestions.map((suggestion, index) => {
              const priorityConfig = PRIORITY_CONFIG[suggestion.priority]
              
              return (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-green-50/50 border border-green-100"
                >
                  <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-green-700">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn("text-[10px]", priorityConfig.color)}>
                        {priorityConfig.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700">{suggestion.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
