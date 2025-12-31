"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import { toast } from "sonner";
import { useAIAssistantStore, type NodeAction } from "@/stores/ai-assistant-store";
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
  const [targetCriteria, setTargetCriteria] = useState("");
  const [multipleSchemes, setMultipleSchemes] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [selectedScheme, setSelectedScheme] = useState<number>(0);
  const [expandedSchemes, setExpandedSchemes] = useState<Set<number>>(
    new Set([0])
  );

  const { nodes, edges, addNode, updateNode, deleteNode, onConnect } =
    useWorkflowStore();
  const { addMessage, setPhase } = useAIAssistantStore();

  // 执行优化分析
  const handleOptimize = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    setIsOptimizing(true);
    setResult(null);

    try {
      // 先执行测试获取结果
      const testResponse = await fetchWithTimeout("/api/ai-assistant/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          testInput: {},
          timeout: 120,
        }),
        timeoutMs: 180000,
      });

      const testResult = await testResponse.json();

      // 调用优化API
      const response = await fetchWithTimeout("/api/ai-assistant/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          testResult,
          targetCriteria,
          model: selectedModel,
          optimizationDirection: direction,
          multipleSchemes,
        }),
        timeoutMs: 120000,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "优化分析失败");
      }

      const data = await response.json();
      if (data.success && data.optimization) {
        setResult(data.optimization);

        // 添加消息到对话
        addMessage({
          role: "assistant",
          content: `优化分析完成：${data.optimization.summary}`,
          optimizationSuggestion: data.optimization,
          messageType: "optimization",
        });

        if (data.optimization.isGoalMet) {
          toast.success("目标已达成！");
        } else {
          toast.success("优化分析完成");
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "优化分析失败";
      toast.error(msg);
    } finally {
      setIsOptimizing(false);
    }
  }, [
    workflowId,
    nodes,
    direction,
    targetCriteria,
    multipleSchemes,
    selectedModel,
    addMessage,
  ]);

  // 应用优化方案
  const applyScheme = useCallback(
    (scheme: OptimizationScheme | OptimizationResult) => {
      const actions = scheme.nodeActions || [];
      if (actions.length === 0) {
        toast.warning("该方案没有具体的操作");
        return;
      }

      actions.forEach((action) => {
        if (action.action === "add" && action.nodeType && action.nodeName) {
          const nodeId = `${action.nodeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
          addNode({
            id: nodeId,
            type: action.nodeType,
            name: action.nodeName,
            position: action.position || { x: 100, y: 100 },
            config: action.config || {},
          } as any);
        } else if (action.action === "update" && action.nodeId && action.config) {
          updateNode(action.nodeId, { config: action.config } as any);
        } else if (action.action === "delete" && action.nodeId) {
          deleteNode(action.nodeId);
        } else if (action.action === "connect" && action.source && action.target) {
          onConnect({
            source: action.source,
            target: action.target,
            sourceHandle: action.sourceHandle || null,
            targetHandle: action.targetHandle || null,
          });
        }
      });

      toast.success("优化方案已应用");
      setPhase("testing");
    },
    [addNode, updateNode, deleteNode, onConnect, setPhase]
  );

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

  // 获取当前选中的方案
  const currentScheme = result?.schemes?.[selectedScheme] || result;

  return (
    <div className="flex flex-col h-full">
      {/* 顶部配置区域 */}
      <div className="p-4 border-b space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-amber-100 mb-3">
            <Zap className="h-6 w-6 text-orange-600" />
          </div>
          <h4 className="font-medium text-gray-800">智能优化</h4>
          <p className="text-xs text-gray-500 mt-1">
            分析工作流并提供优化建议
          </p>
        </div>

        {/* 优化方向选择 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">优化方向</Label>
          <div className="grid grid-cols-2 gap-2">
            {OPTIMIZATION_DIRECTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => setDirection(opt.id)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border p-3 text-left transition-all",
                    direction === opt.id
                      ? "border-orange-400 bg-orange-50 ring-1 ring-orange-400"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={cn(
                        "h-6 w-6 rounded flex items-center justify-center",
                        opt.bgColor
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", opt.color)} />
                    </div>
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-500">
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
            className="min-h-[60px] resize-none text-xs"
          />
        </div>

        {/* 多方案开关 */}
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
            生成多个备选方案
          </Label>
        </div>

        {/* 开始优化按钮 */}
        <Button
          onClick={handleOptimize}
          disabled={isOptimizing || nodes.length === 0}
          className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700"
        >
          {isOptimizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              开始优化分析
            </>
          )}
        </Button>
      </div>

      {/* 结果区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {!result ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Zap className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm">选择优化方向并开始分析</p>
            <p className="text-xs mt-1">AI将分析工作流并提供优化建议</p>
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
                      result.recommendation === index && "ring-2 ring-orange-400"
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
                            onClick={() => applyScheme(scheme)}
                          >
                            <Play className="mr-1 h-3 w-3" />
                            应用
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
                    <span className="text-green-600 font-medium">预期效果：</span>
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
                        预览修改
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-orange-500 hover:bg-orange-600"
                      onClick={() => applyScheme(result)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      应用优化
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
