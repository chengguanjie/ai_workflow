"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Zap,
  Target,
  Gauge,
  Sparkles,
  GitBranch,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Play,
  FlaskConical,
  Square,
  XCircle,
  Shield,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAIAssistantStore,
  type NodeAction,
  type TestResult,
  type OptimizationSuggestion,
} from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

interface OptimizeSectionProps {
  workflowId: string;
  selectedModel: string;
  onPreview?: (actions: NodeAction[]) => void;
}

// 优化方向选项
const OPTIMIZATION_DIRECTIONS = [
  {
    id: "auto",
    label: "智能优化",
    description: "AI自动分析并选择最佳优化方向",
    icon: Sparkles,
    color: "text-violet-500",
    bgColor: "bg-violet-50",
  },
  {
    id: "performance",
    label: "性能优化",
    description: "减少token消耗，缩短响应时间",
    icon: Gauge,
    color: "text-amber-500",
    bgColor: "bg-amber-50",
  },
  {
    id: "quality",
    label: "质量优化",
    description: "提升输出准确性和完整性",
    icon: Target,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    id: "structure",
    label: "结构优化",
    description: "简化流程，合并/拆分节点",
    icon: GitBranch,
    color: "text-green-500",
    bgColor: "bg-green-50",
  },
];

// 优化数据来源选项
const DATA_SOURCE_OPTIONS = [
  {
    id: "test",
    label: "基于测试结果",
    description: "分析测试执行结果进行优化",
    icon: FlaskConical,
    color: "text-amber-500",
  },
  {
    id: "aes",
    label: "基于AES评估",
    description: "根据AES评估报告进行优化",
    icon: Shield,
    color: "text-blue-500",
  },
];

interface OptimizationScheme {
  name: string;
  description: string;
  focus: string;
  issues: Array<{
    nodeId: string;
    nodeName: string;
    issue: string;
    suggestion: string;
    priority: "high" | "medium" | "low";
  }>;
  nodeActions: NodeAction[];
  expectedImprovement: string;
}

interface OptimizationResult {
  schemes?: OptimizationScheme[];
  recommendation?: number;
  summary: string;
  issues?: Array<{
    nodeId: string;
    nodeName: string;
    issue: string;
    suggestion: string;
    priority: "high" | "medium" | "low";
  }>;
  nodeActions?: NodeAction[];
  expectedImprovement?: string;
  isGoalMet?: boolean;
}

export function OptimizeSection({
  workflowId,
  selectedModel,
  onPreview,
}: OptimizeSectionProps) {
  const [direction, setDirection] = useState("auto");
  const [dataSource, setDataSource] = useState<"test" | "aes">("test");
  const [targetCriteria, setTargetCriteria] = useState("");
  const [multipleSchemes, setMultipleSchemes] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [expandedSchemes, setExpandedSchemes] = useState<Set<number>>(
    new Set([0])
  );

  // 自动优化循环相关状态
  const handleOptimizeRef = useRef<() => Promise<void>>(async () => {});

  const { nodes, edges, addNode, updateNode, deleteNode, onConnect } =
    useWorkflowStore();

  const {
    addMessage,
    setPhase,
    setMode,
    sharedTestResult,
    sharedAESReport,
    setSharedTestResult,
    autoOptimization,
    startAutoOptimization,
    stopAutoOptimization,
    addOptimizationIteration,
    isAutoMode,
    setAutoMode,
  } = useAIAssistantStore();

  // 检查是否有可用的数据源
  const hasTestResult = !!sharedTestResult;
  const hasAESReport = !!sharedAESReport;
  const hasDataSource = hasTestResult || hasAESReport;

  // 自动选择数据源
  useEffect(() => {
    if (hasAESReport && !hasTestResult) {
      setDataSource("aes");
    } else if (hasTestResult && !hasAESReport) {
      setDataSource("test");
    }
  }, [hasTestResult, hasAESReport]);

  // 应用节点操作
  const applyNodeActions = useCallback(
    (actions: NodeAction[]) => {
      const addedNodes: string[] = [];

      actions.forEach((action) => {
        if (action.action === "add" && action.nodeType && action.nodeName) {
          const nodeId = `${action.nodeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
          const position = action.position || {
            x: 100 + Math.random() * 200,
            y: 100 + nodes.length * 150,
          };

          addNode({
            id: nodeId,
            type: action.nodeType,
            name: action.nodeName,
            position,
            config: action.config || {},
          } as any);

          addedNodes.push(nodeId);
          toast.success(`已添加节点: ${action.nodeName}`);
        } else if (
          action.action === "connect" &&
          action.source &&
          action.target
        ) {
          const sourceId = action.source.startsWith("new_")
            ? addedNodes[parseInt(action.source.replace("new_", "")) - 1]
            : action.source;
          const targetId = action.target.startsWith("new_")
            ? addedNodes[parseInt(action.target.replace("new_", "")) - 1]
            : action.target;

          if (sourceId && targetId) {
            onConnect({
              source: sourceId,
              target: targetId,
              sourceHandle: action.sourceHandle || null,
              targetHandle: action.targetHandle || null,
            });
          }
        } else if (
          action.action === "update" &&
          action.nodeId &&
          action.config
        ) {
          const targetNode = nodes.find((n) => n.id === action.nodeId);
          if (targetNode) {
            const currentConfig = (targetNode.data as any).config || {};
            const mergedConfig = { ...currentConfig, ...action.config };
            updateNode(action.nodeId, {
              config: mergedConfig,
            } as any);
            toast.success(`已更新节点: ${action.nodeName || action.nodeId}`);
          }
        } else if (action.action === "delete" && action.nodeId) {
          deleteNode(action.nodeId);
          toast.success(`已删除节点: ${action.nodeName || action.nodeId}`);
        }
      });

      return addedNodes.length > 0 ||
        actions.some((a) => a.action === "update" || a.action === "delete");
    },
    [nodes, addNode, updateNode, deleteNode, onConnect]
  );

  // 执行优化分析
  const handleOptimize = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    if (!hasDataSource) {
      toast.error("请先在测试页面执行测试或AES评估");
      return;
    }

    setIsOptimizing(true);
    setResult(null);
    setPhase("optimization");

    addMessage({
      role: "system",
      content:
        dataSource === "aes"
          ? "正在根据 AES 评估报告生成优化方案；如涉及图片、视频或音频生成，请优先使用「图片生成」「视频生成」「音频生成（TTS）」这三个专用工具，而不是泛化的多模态工具。"
          : "正在分析测试结果并生成优化建议；如需要多模态生成，请优先选用「图片生成」「视频生成」「音频生成（TTS）」三个工具分别处理对应模态。",
      messageType: "optimization",
    });

    try {
      const body: Record<string, unknown> = {
        workflowId,
        targetCriteria,
        model: selectedModel,
        optimizationDirection: direction,
        multipleSchemes,
        previousOptimizations:
          autoOptimization?.history.map((h) => h.optimization) || [],
      };

      if (dataSource === "aes" && sharedAESReport) {
        body.aesDiagnosis = sharedAESReport;
      } else if (sharedTestResult) {
        body.testResult = sharedTestResult;
      }

      const response = await fetchWithTimeout("/api/ai-assistant/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 120_000,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "优化分析失败");
      }

      const data = await response.json();

      if (data.success && data.optimization) {
        const opt = data.optimization;
        setResult(opt);

        let optimizationMessage = `## 优化方案 (${dataSource === "aes" ? "基于AES评估" : "基于测试结果"})\n\n${opt.summary || "分析完成"}\n`;

        if (opt.issues && opt.issues.length > 0) {
          optimizationMessage += "\n### 解决的问题\n";
          opt.issues.forEach(
            (
              issue: {
                nodeName: string;
                issue: string;
                suggestion: string;
                priority: string;
              },
              index: number
            ) => {
              const priorityIcon =
                issue.priority === "high"
                  ? "🔴"
                  : issue.priority === "medium"
                    ? "🟡"
                    : "🟢";
              optimizationMessage += `${index + 1}. ${priorityIcon} **${issue.nodeName}**: ${issue.issue}\n   建议: ${issue.suggestion}\n`;
            }
          );
        }

        if (opt.expectedImprovement) {
          optimizationMessage += `\n### 预期效果\n${opt.expectedImprovement}\n`;
        }

        addMessage({
          role: "assistant",
          content: optimizationMessage,
          nodeActions: opt.nodeActions,
          optimizationSuggestion: opt,
          messageType: "optimization",
        });

        // 自动优化模式处理
        if (isAutoMode && dataSource === "test") {
          if (opt.isGoalMet) {
            stopAutoOptimization();
            toast.success("🎉 目标已达成，自动优化完成！");
            addMessage({
              role: "assistant",
              content:
                "🎯 **目标已达成！**\nAI 判断当前工作流输出已满足设定的目标要求，自动优化流程结束。",
            });
          } else if (opt.nodeActions && opt.nodeActions.length > 0) {
            applyNodeActions(opt.nodeActions);

            if (sharedTestResult) {
              addOptimizationIteration(sharedTestResult, opt, true);
            }

            toast.info("已应用优化，正在准备下一轮测试...");
            // 触发新一轮测试
            setTimeout(async () => {
              // 执行测试
              try {
                const testResponse = await fetchWithTimeout(
                  "/api/ai-assistant/test",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      workflowId,
                      testInput: sharedTestResult?.testInput || {},
                      timeout: 120,
                    }),
                    timeoutMs: 180_000,
                  }
                );

                const testResult = await testResponse.json();
                setSharedTestResult({
                  ...testResult,
                  testInput: sharedTestResult?.testInput || {},
                  timestamp: Date.now(),
                });

                // 继续优化
                setTimeout(() => {
                  handleOptimizeRef.current();
                }, 1000);
              } catch (error) {
                stopAutoOptimization();
                toast.error("自动测试失败，停止优化循环");
              }
            }, 2000);
          } else {
            stopAutoOptimization();
            toast.warning("AI 未能生成有效的优化建议，自动优化停止");
          }
        } else {
          if (opt.isGoalMet) {
            toast.success("目标已达成！");
          } else {
            toast.success("优化分析完成");
          }
        }
      } else {
        addMessage({
          role: "assistant",
          content: `优化分析失败: ${data.error || "未知错误"}`,
          messageType: "optimization",
        });
        if (isAutoMode) {
          stopAutoOptimization();
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "优化分析失败";
      toast.error(msg);
      addMessage({
        role: "assistant",
        content: `优化分析出错: ${msg}`,
        messageType: "optimization",
      });
      if (isAutoMode) {
        stopAutoOptimization();
      }
    } finally {
      setIsOptimizing(false);
    }
  }, [
    workflowId,
    nodes,
    direction,
    dataSource,
    targetCriteria,
    multipleSchemes,
    selectedModel,
    hasDataSource,
    sharedTestResult,
    sharedAESReport,
    addMessage,
    setPhase,
    isAutoMode,
    autoOptimization,
    applyNodeActions,
    stopAutoOptimization,
    addOptimizationIteration,
    setSharedTestResult,
  ]);

  useEffect(() => {
    handleOptimizeRef.current = handleOptimize;
  }, [handleOptimize]);

  // 应用优化方案
  const applyScheme = useCallback(
    (scheme: OptimizationScheme | OptimizationResult) => {
      const actions = scheme.nodeActions || [];
      if (actions.length === 0) {
        toast.warning("该方案没有具体的操作");
        return;
      }

      applyNodeActions(actions);
      toast.success("优化方案已应用，建议执行测试验证");
      setPhase("testing");
    },
    [applyNodeActions, setPhase]
  );

  // 应用方案后跳转到测试
  const applyAndGoToTest = useCallback(
    (scheme: OptimizationScheme | OptimizationResult) => {
      applyScheme(scheme);
      setMode("test");
    },
    [applyScheme, setMode]
  );

  // 启动自动优化循环
  const handleStartAutoLoop = useCallback(() => {
    if (!targetCriteria.trim()) {
      toast.error("请先输入优化目标");
      return;
    }
    if (!hasTestResult) {
      toast.error("请先在测试页面执行测试");
      return;
    }
    setDataSource("test");
    setAutoMode(true);
    startAutoOptimization(targetCriteria, 5);
    handleOptimize();
  }, [
    targetCriteria,
    hasTestResult,
    setAutoMode,
    startAutoOptimization,
    handleOptimize,
  ]);

  // 停止自动优化循环
  const handleStopAutoLoop = useCallback(() => {
    setAutoMode(false);
    stopAutoOptimization();
    toast.info("已停止自动优化");
  }, [setAutoMode, stopAutoOptimization]);

  // 切换方案展开
  const toggleScheme = (index: number) => {
    const newExpanded = new Set(expandedSchemes);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSchemes(newExpanded);
  };

  // 跳转到测试页面
  const handleGoToTest = () => {
    setMode("test");
    toast.info("已切换到测试模式");
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部配置区域 */}
      <div className="shrink-0 p-4 border-b space-y-4 bg-white">
        <div className="text-center mb-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-amber-100 mb-2">
            <Zap className="h-5 w-5 text-orange-600" />
          </div>
          <h4 className="font-medium text-gray-800 text-sm">智能建议</h4>
          <p className="text-xs text-gray-500">
            基于测试结果或AES评估生成优化方案
          </p>
        </div>

        {/* 数据来源提示 */}
        {!hasDataSource ? (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700 mb-2">
              需要先执行测试或AES评估才能获取优化建议
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={handleGoToTest}
            >
              <FlaskConical className="mr-1 h-3 w-3" />
              前往测试
            </Button>
          </div>
        ) : (
          <>
            {/* 数据来源选择 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">
                数据来源
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {DATA_SOURCE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isDisabled =
                    (opt.id === "test" && !hasTestResult) ||
                    (opt.id === "aes" && !hasAESReport);
                  return (
                    <button
                      key={opt.id}
                      onClick={() =>
                        !isDisabled && setDataSource(opt.id as "test" | "aes")
                      }
                      disabled={isDisabled}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2 text-left transition-all",
                        dataSource === opt.id
                          ? "border-orange-400 bg-orange-50 ring-1 ring-orange-400"
                          : isDisabled
                            ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", opt.color)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium block">
                          {opt.label}
                        </span>
                        {isDisabled && (
                          <span className="text-[10px] text-gray-400">
                            暂无数据
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 当前数据摘要 */}
            {dataSource === "test" && sharedTestResult && (
              <div
                className={cn(
                  "p-2 rounded-lg text-xs",
                  sharedTestResult.success ? "bg-green-50" : "bg-red-50"
                )}
              >
                <div className="flex items-center gap-2">
                  {sharedTestResult.success ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span
                    className={
                      sharedTestResult.success
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    测试{sharedTestResult.success ? "成功" : "失败"}
                  </span>
                  {sharedTestResult.duration && (
                    <span className="text-gray-500 ml-auto">
                      {(sharedTestResult.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            )}

            {dataSource === "aes" && sharedAESReport && (
              <div className="p-2 rounded-lg bg-blue-50 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3 w-3 text-blue-500" />
                    <span className="text-blue-700">AES评估</span>
                  </div>
                  <span className="font-bold text-blue-700">
                    {sharedAESReport.scores.total}分
                  </span>
                </div>
              </div>
            )}

            {/* 优化方向选择 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">
                优化方向
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {OPTIMIZATION_DIRECTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setDirection(opt.id)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-2 text-left transition-all",
                        direction === opt.id
                          ? "border-orange-400 bg-orange-50 ring-1 ring-orange-400"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div
                          className={cn(
                            "h-5 w-5 rounded flex items-center justify-center",
                            opt.bgColor
                          )}
                        >
                          <Icon className={cn("h-3 w-3", opt.color)} />
                        </div>
                        <span className="text-xs font-medium">{opt.label}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 line-clamp-1">
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 优化目标 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-700">
                优化目标（可选）
              </Label>
              <Textarea
                value={targetCriteria}
                onChange={(e) => setTargetCriteria(e.target.value)}
                placeholder="描述期望的输出效果，例如：输出应该更加专业..."
                className="min-h-[50px] resize-none text-xs"
              />
            </div>

            {/* 选项开关 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="multiple-schemes"
                  checked={multipleSchemes}
                  onCheckedChange={setMultipleSchemes}
                />
                <Label
                  htmlFor="multiple-schemes"
                  className="text-xs cursor-pointer text-gray-600"
                >
                  生成多个方案
                </Label>
              </div>
              {autoOptimization?.isRunning && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                  <span className="text-xs text-gray-500">
                    第 {autoOptimization.currentIteration}/
                    {autoOptimization.maxIterations} 轮
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 结果区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {!result ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Zap className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm">选择数据来源并开始分析</p>
            <p className="text-xs mt-1">AI将分析并提供优化建议</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 目标达成提示 */}
            {result.isGoalMet && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">目标已达成！</span>
              </div>
            )}

            {/* 总结 */}
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-sm text-gray-700">{result.summary}</p>
            </div>

            {/* 优化历史 */}
            {autoOptimization && autoOptimization.history.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-500">
                  优化历史
                </Label>
                <div className="max-h-20 overflow-y-auto space-y-1 p-2 bg-gray-50 rounded-lg">
                  {autoOptimization.history.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-xs"
                    >
                      {item.testResult.success ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-gray-600">
                        第 {item.iteration} 轮
                      </span>
                      {item.applied && (
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          已应用
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 多方案展示 */}
            {result.schemes && result.schemes.length > 0 ? (
              <div className="space-y-3">
                <Label className="text-xs font-medium text-gray-500">
                  优化方案 ({result.schemes.length}个)
                </Label>

                {result.schemes.map((scheme, index) => (
                  <div
                    key={index}
                    className={cn(
                      "border rounded-lg overflow-hidden",
                      result.recommendation === index &&
                        "ring-2 ring-orange-400"
                    )}
                  >
                    <button
                      onClick={() => toggleScheme(index)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSchemes.has(index) ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="text-sm font-medium text-gray-700">
                          {scheme.name}
                        </span>
                        {result.recommendation === index && (
                          <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px]">
                            推荐
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {scheme.nodeActions?.length || 0} 项操作
                      </span>
                    </button>

                    {expandedSchemes.has(index) && (
                      <div className="px-3 py-3 space-y-3 bg-white">
                        <p className="text-xs text-gray-600">
                          {scheme.description}
                        </p>

                        <div className="text-xs">
                          <span className="text-gray-500">优化重点：</span>
                          <span className="text-gray-700">{scheme.focus}</span>
                        </div>

                        {scheme.expectedImprovement && (
                          <div className="text-xs">
                            <span className="text-gray-500">预期效果：</span>
                            <span className="text-gray-700">
                              {scheme.expectedImprovement}
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          {onPreview && scheme.nodeActions && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => onPreview(scheme.nodeActions)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              预览
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs bg-orange-500 hover:bg-orange-600"
                            onClick={() => applyAndGoToTest(scheme)}
                          >
                            <Play className="mr-1 h-3 w-3" />
                            应用并测试
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // 单方案展示
              <div className="space-y-3">
                {result.issues && result.issues.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-500">
                      发现的问题
                    </Label>
                    {result.issues.map((issue, index) => (
                      <div
                        key={index}
                        className="p-2 rounded border bg-white text-xs"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px]",
                              issue.priority === "high"
                                ? "bg-red-100 text-red-700"
                                : issue.priority === "medium"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-100 text-gray-700"
                            )}
                          >
                            {issue.nodeName}
                          </span>
                        </div>
                        <p className="text-gray-700">{issue.issue}</p>
                        <p className="text-gray-500 mt-1">
                          💡 {issue.suggestion}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {result.expectedImprovement && (
                  <div className="p-2 rounded bg-green-50 text-xs">
                    <span className="text-green-600 font-medium">
                      预期效果：
                    </span>
                    <span className="text-green-700">
                      {result.expectedImprovement}
                    </span>
                  </div>
                )}

                {result.nodeActions && result.nodeActions.length > 0 && (
                  <div className="flex gap-2">
                    {onPreview && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => onPreview(result.nodeActions!)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        预览
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-orange-500 hover:bg-orange-600"
                      onClick={() => applyAndGoToTest(result)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      应用并测试
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作区域 */}
      {hasDataSource && (
        <div className="shrink-0 p-4 border-t bg-white space-y-2">
          {/* 开始优化按钮 */}
          {!autoOptimization?.isRunning && (
            <Button
              onClick={handleOptimize}
              disabled={isOptimizing || nodes.length === 0}
              className="w-full h-9 text-xs bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700"
            >
              {isOptimizing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  生成优化方案
                </>
              )}
            </Button>
          )}

          {/* 自动优化循环按钮 */}
          {dataSource === "test" && hasTestResult && (
            <>
              {!autoOptimization?.isRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleStartAutoLoop}
                  disabled={isOptimizing || !targetCriteria.trim()}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  启动自动优化循环
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleStopAutoLoop}
                >
                  <Square className="mr-1 h-3 w-3" />
                  停止自动优化
                </Button>
              )}
            </>
          )}

          {/* 提示 */}
          <p className="text-[10px] text-gray-400 text-center">
            {dataSource === "test"
              ? "启动自动优化需要先填写优化目标"
              : "基于AES评估的优化不支持自动循环"}
          </p>
        </div>
      )}
    </div>
  );
}
