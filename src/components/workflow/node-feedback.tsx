"use client";

/**
 * NodeFeedback Component
 * 
 * 节点反馈组件，用于收集用户对节点执行结果的反馈
 * 支持正确/错误选项、错误原因输入、错误分类选择
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.5
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// 错误分类枚举 - 与 Prisma schema 保持一致
export type ErrorCategory =
  | "OUTPUT_FORMAT"
  | "OUTPUT_CONTENT"
  | "MISSING_DATA"
  | "LOGIC_ERROR"
  | "PERFORMANCE"
  | "OTHER";

// 错误分类标签映射
const ERROR_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  OUTPUT_FORMAT: "输出格式错误",
  OUTPUT_CONTENT: "输出内容错误",
  MISSING_DATA: "数据缺失",
  LOGIC_ERROR: "逻辑错误",
  PERFORMANCE: "性能问题",
  OTHER: "其他",
};

// 节点反馈数据
export interface NodeFeedbackData {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  isCorrect: boolean;
  errorReason?: string;
  errorCategory?: ErrorCategory;
  nodeOutput?: Record<string, unknown>;
}

// 组件属性
export interface NodeFeedbackProps {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  nodeOutput?: Record<string, unknown>;
  executionId: string;
  onSubmit?: (feedback: NodeFeedbackData) => void;
  onSubmitSuccess?: () => void;
  disabled?: boolean;
  initialFeedback?: {
    isCorrect: boolean;
    errorReason?: string;
    errorCategory?: ErrorCategory;
  };
}

export function NodeFeedback({
  nodeId,
  nodeName,
  nodeType,
  nodeOutput,
  executionId,
  onSubmit,
  onSubmitSuccess,
  disabled = false,
  initialFeedback,
}: NodeFeedbackProps) {
  // 反馈状态
  const [isCorrect, setIsCorrect] = useState<boolean | null>(
    initialFeedback?.isCorrect ?? null
  );
  const [errorReason, setErrorReason] = useState(
    initialFeedback?.errorReason || ""
  );
  const [errorCategory, setErrorCategory] = useState<ErrorCategory | "">(
    initialFeedback?.errorCategory || ""
  );
  
  // 提交状态
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(!!initialFeedback);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 处理正确/错误选择
  const handleCorrectSelect = useCallback((correct: boolean) => {
    setIsCorrect(correct);
    setSubmitError(null);
    // 如果选择正确，清空错误相关字段
    if (correct) {
      setErrorReason("");
      setErrorCategory("");
    }
  }, []);

  // 提交反馈
  const handleSubmit = useCallback(async () => {
    if (isCorrect === null) {
      setSubmitError("请选择节点输出是否正确");
      return;
    }

    // 如果标记为错误，需要提供错误原因或分类
    if (!isCorrect && !errorReason.trim() && !errorCategory) {
      setSubmitError("请提供错误原因或选择错误分类");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const feedbackData: NodeFeedbackData = {
      nodeId,
      nodeName,
      nodeType,
      isCorrect,
      errorReason: errorReason.trim() || undefined,
      errorCategory: errorCategory || undefined,
      nodeOutput,
    };

    try {
      const response = await fetch(`/api/executions/${executionId}/node-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "提交失败");
      }

      setIsSubmitted(true);
      toast.success("反馈已保存");
      
      onSubmit?.(feedbackData);
      onSubmitSuccess?.();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "提交失败";
      setSubmitError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    nodeId,
    nodeName,
    nodeType,
    nodeOutput,
    executionId,
    isCorrect,
    errorReason,
    errorCategory,
    onSubmit,
    onSubmitSuccess,
  ]);

  // 重置反馈（允许重新提交）
  const handleReset = useCallback(() => {
    setIsCorrect(null);
    setErrorReason("");
    setErrorCategory("");
    setIsSubmitted(false);
    setSubmitError(null);
  }, []);

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      {/* 已提交状态 */}
      {isSubmitted ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-700">已标记为正确</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-700">
                  已标记为错误
                  {errorCategory && ` - ${ERROR_CATEGORY_LABELS[errorCategory]}`}
                </span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={disabled}
          >
            修改
          </Button>
        </div>
      ) : (
        <>
          {/* 正确/错误选项 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              节点输出是否正确？
            </Label>
            <div className="flex gap-2">
              <Button
                variant={isCorrect === true ? "default" : "outline"}
                size="sm"
                onClick={() => handleCorrectSelect(true)}
                disabled={disabled || isSubmitting}
                className={cn(
                  "flex-1 gap-2",
                  isCorrect === true && "bg-green-600 hover:bg-green-700"
                )}
              >
                <ThumbsUp className="h-4 w-4" />
                正确
              </Button>
              <Button
                variant={isCorrect === false ? "default" : "outline"}
                size="sm"
                onClick={() => handleCorrectSelect(false)}
                disabled={disabled || isSubmitting}
                className={cn(
                  "flex-1 gap-2",
                  isCorrect === false && "bg-red-600 hover:bg-red-700"
                )}
              >
                <ThumbsDown className="h-4 w-4" />
                错误
              </Button>
            </div>
          </div>

          {/* 错误详情 - 仅在选择错误时显示 */}
          {isCorrect === false && (
            <div className="space-y-3 pt-2 border-t">
              {/* 错误分类 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  错误分类
                </Label>
                <Select
                  value={errorCategory}
                  onValueChange={(value) => setErrorCategory(value as ErrorCategory)}
                  disabled={disabled || isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择错误分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ERROR_CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 错误原因 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  错误原因（可选）
                </Label>
                <Textarea
                  value={errorReason}
                  onChange={(e) => setErrorReason(e.target.value)}
                  placeholder="请描述错误原因..."
                  disabled={disabled || isSubmitting}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {submitError}
            </div>
          )}

          {/* 提交按钮 */}
          {isCorrect !== null && (
            <Button
              onClick={handleSubmit}
              disabled={disabled || isSubmitting}
              size="sm"
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                "提交反馈"
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// 反馈摘要数据
export interface FeedbackSummaryData {
  totalNodes: number;
  feedbackCount: number;
  correctCount: number;
  incorrectCount: number;
  pendingCount: number;
  errorCategories: Record<ErrorCategory, number>;
}

// 测试完成摘要组件属性
export interface TestCompleteSummaryProps {
  feedbacks: Map<string, NodeFeedbackData>;
  totalNodes: number;
  onClose?: () => void;
}

/**
 * TestCompleteSummary Component
 * 
 * 测试完成摘要组件，显示测试反馈统计信息
 * 
 * Requirements: 3.5
 */
export function TestCompleteSummary({
  feedbacks,
  totalNodes,
  onClose,
}: TestCompleteSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // 计算统计数据
  const summary: FeedbackSummaryData = {
    totalNodes,
    feedbackCount: feedbacks.size,
    correctCount: 0,
    incorrectCount: 0,
    pendingCount: totalNodes - feedbacks.size,
    errorCategories: {
      OUTPUT_FORMAT: 0,
      OUTPUT_CONTENT: 0,
      MISSING_DATA: 0,
      LOGIC_ERROR: 0,
      PERFORMANCE: 0,
      OTHER: 0,
    },
  };

  feedbacks.forEach((feedback) => {
    if (feedback.isCorrect) {
      summary.correctCount++;
    } else {
      summary.incorrectCount++;
      if (feedback.errorCategory) {
        summary.errorCategories[feedback.errorCategory]++;
      }
    }
  });

  // 计算正确率
  const correctRate = summary.feedbackCount > 0
    ? Math.round((summary.correctCount / summary.feedbackCount) * 100)
    : 0;

  // 获取有错误的分类
  const errorCategoriesWithCount = Object.entries(summary.errorCategories)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border bg-background shadow-sm">
      {/* 头部 */}
      <button
        className="flex w-full items-center justify-between p-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <span className="font-medium">测试完成摘要</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            正确率: {correctRate}%
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* 详细内容 */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold">{summary.totalNodes}</p>
              <p className="text-xs text-muted-foreground">总节点数</p>
            </div>
            <div className="rounded-lg bg-green-50 p-3 text-center">
              <p className="text-2xl font-semibold text-green-700">
                {summary.correctCount}
              </p>
              <p className="text-xs text-green-600">正确</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <p className="text-2xl font-semibold text-red-700">
                {summary.incorrectCount}
              </p>
              <p className="text-xs text-red-600">错误</p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-3 text-center">
              <p className="text-2xl font-semibold text-yellow-700">
                {summary.pendingCount}
              </p>
              <p className="text-xs text-yellow-600">未反馈</p>
            </div>
          </div>

          {/* 错误分类统计 */}
          {errorCategoriesWithCount.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">错误分类统计</h4>
              <div className="space-y-1.5">
                {errorCategoriesWithCount.map(([category, count]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {ERROR_CATEGORY_LABELS[category as ErrorCategory]}
                    </span>
                    <span className="font-medium text-red-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 关闭按钮 */}
          {onClose && (
            <Button variant="outline" onClick={onClose} className="w-full">
              关闭
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
