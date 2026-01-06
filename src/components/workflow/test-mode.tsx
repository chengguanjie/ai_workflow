"use client";

/**
 * TestMode Component
 * 
 * 测试模式组件，用于工作流测试执行
 * 支持 AI 生成测试数据、逐节点执行、节点反馈收集
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.5
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import type { InputFieldType } from "@/types/workflow";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NodeFeedback, TestCompleteSummary, type NodeFeedbackData } from "./node-feedback";

// 节点执行状态
type NodeExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

// 输入字段定义
export interface InputField {
  nodeId: string;
  nodeName: string;
  fieldId: string;
  fieldName: string;
  fieldType: InputFieldType;
  defaultValue: string;
  options?: Array<{ label: string; value: string }>;
  description?: string;
  placeholder?: string;
  required?: boolean;
}

// 节点执行信息
export interface NodeExecutionInfo {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
}

// 组件属性
export interface TestModeProps {
  workflowId: string;
  inputFields: InputField[];
  inputValues: Record<string, string>;
  onInputChange: (values: Record<string, string>) => void;
  nodeStates: Map<string, NodeExecutionInfo>;
  testModeStatus: "idle" | "running" | "completed" | "failed";
  currentNodeId: string | null;
  isExecuting: boolean;
  onExecute: (isAIGenerated: boolean) => void;
  executionId?: string | null;
  onFeedbackSubmit?: (feedback: NodeFeedbackData) => void;
}

export function TestMode({
  workflowId,
  inputFields,
  inputValues,
  onInputChange,
  nodeStates,
  testModeStatus,
  currentNodeId,
  isExecuting,
  onExecute,
  executionId,
  onFeedbackSubmit,
}: TestModeProps) {
  // AI 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAIGenerated, setIsAIGenerated] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  
  // 展开/折叠状态
  const [showInputs, setShowInputs] = useState(true);
  const [showNodeDetails, setShowNodeDetails] = useState<string | null>(null);
  
  // 节点反馈状态
  const [nodeFeedbacks, setNodeFeedbacks] = useState<Map<string, NodeFeedbackData>>(new Map());
  const [showSummary, setShowSummary] = useState(false);

  // 处理反馈提交
  const handleFeedbackSubmit = useCallback((feedback: NodeFeedbackData) => {
    setNodeFeedbacks((prev) => {
      const newMap = new Map(prev);
      newMap.set(feedback.nodeId, feedback);
      return newMap;
    });
    onFeedbackSubmit?.(feedback);
  }, [onFeedbackSubmit]);

  // 检查是否所有已完成/失败的节点都已提交反馈
  const completedOrFailedNodes = Array.from(nodeStates.values()).filter(
    (node) => node.status === "completed" || node.status === "failed"
  );
  const allFeedbacksSubmitted = completedOrFailedNodes.length > 0 &&
    completedOrFailedNodes.every((node) => nodeFeedbacks.has(node.nodeId));

  // AI 生成测试数据
  const handleGenerateTestData = useCallback(async () => {
    if (inputFields.length === 0) {
      toast.error("没有可生成的输入字段");
      return;
    }

    setIsGenerating(true);
    setAiWarnings([]);

    try {
      const response = await fetch(`/api/workflows/${workflowId}/generate-test-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: inputFields.map((field) => ({
            name: field.fieldName,
            type: field.fieldType,
            description: field.description,
            options: field.options,
            placeholder: field.placeholder,
            required: field.required,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "生成失败");
      }

      const { data, isAIGenerated: aiGenerated, warnings } = result.data || result;

      // 更新输入值
      onInputChange({ ...inputValues, ...data });
      setIsAIGenerated(aiGenerated);

      if (warnings && warnings.length > 0) {
        setAiWarnings(warnings);
        toast.warning("测试数据已生成，但有一些警告");
      } else if (aiGenerated) {
        toast.success("AI 测试数据生成成功");
      } else {
        toast.info("已生成占位测试数据");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "生成失败";
      toast.error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [workflowId, inputFields, inputValues, onInputChange]);

  // 处理执行
  const handleExecute = useCallback(() => {
    onExecute(isAIGenerated);
  }, [onExecute, isAIGenerated]);

  // 格式化时间
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  // 获取状态图标
  const getStatusIcon = (status: NodeExecutionStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "skipped":
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-300" />;
    }
  };

  // 排序节点
  const sortedNodes = Array.from(nodeStates.values()).sort((a, b) => {
    const order = {
      running: 0,
      completed: 1,
      failed: 1,
      pending: 2,
      skipped: 3,
    };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="space-y-6">
      {/* 测试数据输入区域 - 仅在 idle 状态显示 */}
      {testModeStatus === "idle" && (
        <>
          {/* AI 生成按钮 */}
          {inputFields.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">测试数据</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateTestData}
                disabled={isGenerating || isExecuting}
                className="gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI 生成测试数据
                  </>
                )}
              </Button>
            </div>
          )}

          {/* AI 警告信息 */}
          {aiWarnings.length > 0 && (
            <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  {aiWarnings.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 输入字段表单 */}
          {inputFields.length > 0 && (
            <div>
              <button
                className="flex w-full items-center justify-between text-sm font-medium"
                onClick={() => setShowInputs(!showInputs)}
              >
                <span>输入参数</span>
                {showInputs ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showInputs && (
                <div className="mt-3 space-y-3">
                  {inputFields.map((field) => (
                    <div
                      key={`${field.nodeId}-${field.fieldId}`}
                      className="space-y-1.5"
                    >
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        {field.nodeName} / {field.fieldName}
                        {field.fieldType !== "text" && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-muted rounded">
                            {field.fieldType}
                          </span>
                        )}
                        {field.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </Label>
                      
                      {field.fieldType === "text" ? (
                        <Input
                          value={inputValues[field.fieldName] || ""}
                          onChange={(e) =>
                            onInputChange({
                              ...inputValues,
                              [field.fieldName]: e.target.value,
                            })
                          }
                          placeholder={field.placeholder || `输入 ${field.fieldName}`}
                          disabled={isExecuting}
                        />
                      ) : field.fieldType === "select" ? (
                        <Select
                          value={inputValues[field.fieldName] || ""}
                          onValueChange={(value) =>
                            onInputChange({
                              ...inputValues,
                              [field.fieldName]: value,
                            })
                          }
                          disabled={isExecuting}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={`选择 ${field.fieldName}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options || []).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.fieldType === "multiselect" ? (
                        <div className="space-y-2 p-2 border rounded-md">
                          {(field.options || []).map((option) => {
                            const selectedValues = (inputValues[field.fieldName] || "")
                              .split(",")
                              .filter(Boolean);
                            const isChecked = selectedValues.includes(option.value);
                            return (
                              <div key={option.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${field.fieldId}-${option.value}`}
                                  checked={isChecked}
                                  disabled={isExecuting}
                                  onCheckedChange={(checked) => {
                                    const current = (inputValues[field.fieldName] || "")
                                      .split(",")
                                      .filter(Boolean);
                                    let newValues: string[];
                                    if (checked) {
                                      newValues = [...current, option.value];
                                    } else {
                                      newValues = current.filter((v) => v !== option.value);
                                    }
                                    onInputChange({
                                      ...inputValues,
                                      [field.fieldName]: newValues.join(","),
                                    });
                                  }}
                                />
                                <label
                                  htmlFor={`${field.fieldId}-${option.value}`}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {option.label}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        // 文件类型显示 URL 输入
                        <Input
                          value={inputValues[field.fieldName] || ""}
                          onChange={(e) =>
                            onInputChange({
                              ...inputValues,
                              [field.fieldName]: e.target.value,
                            })
                          }
                          placeholder={`输入 ${field.fieldType} URL`}
                          disabled={isExecuting}
                        />
                      )}
                      
                      {field.description && (
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 执行按钮 */}
          <Button
            onClick={handleExecute}
            disabled={isExecuting}
            className="w-full"
          >
            开始测试执行
          </Button>
        </>
      )}

      {/* 节点执行进度 - 执行中或完成后显示 */}
      {testModeStatus !== "idle" && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            节点执行进度
          </h3>
          {sortedNodes.map((nodeInfo) => (
            <div
              key={nodeInfo.nodeId}
              className={cn(
                "rounded-lg border transition-colors",
                nodeInfo.status === "running" && "border-blue-300 bg-blue-50",
                nodeInfo.status === "completed" && "border-green-200 bg-green-50/50",
                nodeInfo.status === "failed" && "border-red-200 bg-red-50/50",
                currentNodeId === nodeInfo.nodeId && "ring-2 ring-blue-500"
              )}
            >
              <button
                className="flex w-full items-center justify-between p-3 text-left"
                onClick={() =>
                  setShowNodeDetails(
                    showNodeDetails === nodeInfo.nodeId ? null : nodeInfo.nodeId
                  )
                }
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(nodeInfo.status)}
                  <div>
                    <span className="font-medium">{nodeInfo.nodeName}</span>
                    <span className="ml-2 text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                      {nodeInfo.nodeType}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {nodeInfo.duration && (
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(nodeInfo.duration)}
                    </span>
                  )}
                  {(nodeInfo.promptTokens || nodeInfo.completionTokens) && (
                    <span className="text-sm text-muted-foreground">
                      {(nodeInfo.promptTokens || 0) + (nodeInfo.completionTokens || 0)} tokens
                    </span>
                  )}
                  {showNodeDetails === nodeInfo.nodeId ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>

              {/* 节点详情 */}
              {showNodeDetails === nodeInfo.nodeId && (
                <div className="border-t px-3 py-2 space-y-3">
                  {nodeInfo.error && (
                    <div className="mb-2 text-sm text-red-600">
                      <span className="font-medium">错误: </span>
                      {nodeInfo.error}
                    </div>
                  )}
                  {nodeInfo.output && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">
                        输出:
                      </span>
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                        {JSON.stringify(nodeInfo.output, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!nodeInfo.error && !nodeInfo.output && nodeInfo.status === "pending" && (
                    <span className="text-sm text-muted-foreground">
                      等待执行...
                    </span>
                  )}
                  
                  {/* 节点反馈组件 - 仅在节点完成或失败且有 executionId 时显示 */}
                  {executionId && (nodeInfo.status === "completed" || nodeInfo.status === "failed") && (
                    <NodeFeedback
                      nodeId={nodeInfo.nodeId}
                      nodeName={nodeInfo.nodeName}
                      nodeType={nodeInfo.nodeType}
                      nodeOutput={nodeInfo.output}
                      executionId={executionId}
                      onSubmit={handleFeedbackSubmit}
                      disabled={isExecuting}
                      initialFeedback={
                        nodeFeedbacks.has(nodeInfo.nodeId)
                          ? {
                              isCorrect: nodeFeedbacks.get(nodeInfo.nodeId)!.isCorrect,
                              errorReason: nodeFeedbacks.get(nodeInfo.nodeId)!.errorReason,
                              errorCategory: nodeFeedbacks.get(nodeInfo.nodeId)!.errorCategory,
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 测试完成摘要 - 当测试完成且所有反馈已提交时显示 */}
      {(testModeStatus === "completed" || testModeStatus === "failed") && 
        allFeedbacksSubmitted && 
        !showSummary && (
        <Button
          variant="outline"
          onClick={() => setShowSummary(true)}
          className="w-full"
        >
          查看测试摘要
        </Button>
      )}

      {showSummary && (
        <TestCompleteSummary
          feedbacks={nodeFeedbacks}
          totalNodes={nodeStates.size}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
