"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Stethoscope,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Wrench,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAIAssistantStore,
  type DiagnosisIssue,
  type DiagnosisResult,
} from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

interface DiagnoseSectionProps {
  workflowId: string;
}

// 分类标签
const CATEGORY_LABELS: Record<string, string> = {
  connection: "连接问题",
  config: "配置问题",
  variable: "变量引用",
  tool: "工具配置",
  knowledge: "知识库",
  performance: "性能隐患",
};

// 严重程度图标
const SeverityIcon = ({ severity }: { severity: string }) => {
  switch (severity) {
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "info":
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return null;
  }
};

// 分数颜色
const getScoreColor = (score: number) => {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-amber-600";
  if (score >= 50) return "text-orange-600";
  return "text-red-600";
};

// 分数背景色
const getScoreBgColor = (score: number) => {
  if (score >= 90) return "bg-green-100";
  if (score >= 70) return "bg-amber-100";
  if (score >= 50) return "bg-orange-100";
  return "bg-red-100";
};

export function DiagnoseSection({ workflowId }: DiagnoseSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const {
    diagnosisResult,
    isDiagnosing,
    setDiagnosisResult,
    setIsDiagnosing,
    clearDiagnosis,
  } = useAIAssistantStore();

  const { nodes, edges, updateNode } = useWorkflowStore();

  // 执行诊断
  const handleDiagnose = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    setIsDiagnosing(true);
    try {
      const response = await fetchWithTimeout("/api/ai-assistant/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        }),
        timeoutMs: 30000,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "诊断失败");
      }

      const data = await response.json();
      if (data.success) {
        setDiagnosisResult({
          issues: data.issues,
          summary: data.summary,
          score: data.score,
        });
        toast.success("诊断完成");
      } else {
        throw new Error("诊断失败");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "诊断失败";
      toast.error(msg);
    } finally {
      setIsDiagnosing(false);
    }
  }, [workflowId, nodes, edges, setDiagnosisResult, setIsDiagnosing]);

  // 自动修复问题
  const handleAutoFix = useCallback(
    async (issue: DiagnosisIssue) => {
      if (!issue.autoFixable || !issue.fixAction) {
        toast.error("此问题无法自动修复");
        return;
      }

      try {
        const { action, nodeId, config } = issue.fixAction;

        if (action === "update" && nodeId && config) {
          const targetNode = nodes.find((n) => n.id === nodeId);
          if (targetNode) {
            updateNode(nodeId, {
              data: { ...targetNode.data, ...config },
            });
            toast.success(`已自动修复: ${issue.issue}`);

            // 重新诊断
            setTimeout(() => handleDiagnose(), 500);
          }
        }
      } catch (error) {
        toast.error("自动修复失败");
      }
    },
    [nodes, updateNode, handleDiagnose]
  );

  // 切换分类展开状态
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // 按分类分组问题
  const groupedIssues = diagnosisResult?.issues.reduce(
    (acc, issue) => {
      if (!acc[issue.category]) {
        acc[issue.category] = [];
      }
      acc[issue.category].push(issue);
      return acc;
    },
    {} as Record<string, DiagnosisIssue[]>
  );

  return (
    <div className="flex flex-col h-full">
      {/* 顶部区域 */}
      <div className="p-4 border-b">
        <div className="text-center mb-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 mb-3">
            <Stethoscope className="h-6 w-6 text-teal-600" />
          </div>
          <h4 className="font-medium text-gray-800">工作流诊断</h4>
          <p className="text-xs text-gray-500 mt-1">
            检查工作流配置问题和潜在隐患
          </p>
        </div>

        <Button
          onClick={handleDiagnose}
          disabled={isDiagnosing || nodes.length === 0}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700"
        >
          {isDiagnosing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              诊断中...
            </>
          ) : (
            <>
              <Stethoscope className="mr-2 h-4 w-4" />
              开始诊断
            </>
          )}
        </Button>
      </div>

      {/* 诊断结果区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {!diagnosisResult ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Stethoscope className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm">点击上方按钮开始诊断</p>
            <p className="text-xs mt-1">
              诊断将检查连接、配置、变量引用等问题
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 分数和总结 */}
            <div
              className={cn(
                "rounded-lg p-4",
                getScoreBgColor(diagnosisResult.score)
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  健康分数
                </span>
                <span
                  className={cn(
                    "text-2xl font-bold",
                    getScoreColor(diagnosisResult.score)
                  )}
                >
                  {diagnosisResult.score}
                </span>
              </div>
              <p className="text-xs text-gray-600">{diagnosisResult.summary}</p>
            </div>

            {/* 问题列表 */}
            {diagnosisResult.issues.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                <p className="text-sm font-medium text-green-700">
                  工作流配置良好
                </p>
                <p className="text-xs text-gray-500 mt-1">未发现任何问题</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    发现 {diagnosisResult.issues.length} 个问题
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearDiagnosis();
                    }}
                    className="h-6 px-2 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    清除
                  </Button>
                </div>

                {/* 按分类分组显示 */}
                {groupedIssues &&
                  Object.entries(groupedIssues).map(([category, issues]) => (
                    <div
                      key={category}
                      className="border rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {expandedCategories.has(category) ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium text-gray-700">
                            {CATEGORY_LABELS[category] || category}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {issues.length} 项
                        </span>
                      </button>

                      {expandedCategories.has(category) && (
                        <div className="divide-y">
                          {issues.map((issue, idx) => (
                            <div
                              key={`${issue.nodeId}-${idx}`}
                              className="px-3 py-3 bg-white"
                            >
                              <div className="flex items-start gap-2">
                                <SeverityIcon severity={issue.severity} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {issue.nodeName && (
                                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 truncate max-w-[120px]">
                                        {issue.nodeName}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-800">
                                    {issue.issue}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    💡 {issue.suggestion}
                                  </p>

                                  {issue.autoFixable && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleAutoFix(issue)}
                                      className="mt-2 h-7 text-xs"
                                    >
                                      <Wrench className="h-3 w-3 mr-1" />
                                      自动修复
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* 重新诊断按钮 */}
            {diagnosisResult.issues.length > 0 && (
              <Button
                variant="outline"
                onClick={handleDiagnose}
                disabled={isDiagnosing}
                className="w-full"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4 mr-2",
                    isDiagnosing && "animate-spin"
                  )}
                />
                重新诊断
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
