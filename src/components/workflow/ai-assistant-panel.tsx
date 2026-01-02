"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  X,
  Send,
  Loader2,
  Bot,
  User,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  AlertCircle,
  Settings,
  History,
  MessageSquarePlus,
  ChevronLeft,
  Clock,
  Copy,
  Play,
  RefreshCw,
  Zap,
  Target,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Square,
  Shield,
  Activity,
  Lightbulb,
  Eye,
  Minus,
  Maximize2,
  GripHorizontal,
  MessageCircle,
  PlusCircle,
  Stethoscope,
  Crosshair,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { WorkflowPreview } from "@/components/workflow/workflow-preview";
import { CreateWorkflowSection } from "@/components/workflow/ai-assistant/create-workflow-section";
import { DiagnoseSection } from "@/components/workflow/ai-assistant/diagnose-section";
import { OptimizeSection } from "@/components/workflow/ai-assistant/optimize-section";
import { RefineSection } from "@/components/workflow/ai-assistant/refine-section";
import { TestSection } from "@/components/workflow/ai-assistant/test-section";
import {
  useAIAssistantStore,
  type AIMessage,
  type NodeAction,
  type ConversationPhase,
  type TestResult,
  type AESReport,
  type PanelMode,
} from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import type { NodeConfig } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

interface AIAssistantPanelProps {
  workflowId: string;
}

function generateWorkflowContext(
  nodes: ReturnType<typeof useWorkflowStore.getState>["nodes"],
  edges: ReturnType<typeof useWorkflowStore.getState>["edges"],
): string {
  if (nodes.length === 0) {
    return "当前画布为空，没有任何节点。";
  }

  const nodeDescriptions = nodes
    .map((node) => {
      const data = node.data as NodeConfig & { comment?: string };
      const config = data.config || {};

      let configSummary = "";
      switch (data.type) {
        case "INPUT":
          const fields =
            (config as { fields?: { name: string; value: string }[] }).fields ||
            [];
          configSummary = `输入字段: ${fields.map((f) => f.name).join(", ") || "无"}`;
          break;
        case "PROCESS":
          const proc = config as {
            systemPrompt?: string;
            userPrompt?: string;
            model?: string;
          };
          configSummary = `模型: ${proc.model || "未设置"}, 系统提示词: ${proc.systemPrompt ? "已设置" : "未设置"}, 用户提示词: ${proc.userPrompt ? "已设置" : "未设置"}`;
          break;
        default:
          configSummary = JSON.stringify(config).slice(0, 100);
      }

      // 构建节点描述，包含批注信息
      let nodeDesc = `- 节点 "${data.name}" (ID: ${node.id}, 类型: ${data.type})\n  位置: (${Math.round(node.position.x)}, ${Math.round(node.position.y)})\n  配置: ${configSummary}`;

      // 如果有批注，添加到描述中
      if (data.comment) {
        nodeDesc += `\n  批注: ${data.comment}`;
      }

      return nodeDesc;
    })
    .join("\n");

  const edgeDescriptions =
    edges.length > 0
      ? edges
          .map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);
            return `- ${sourceNode?.data?.name || edge.source} → ${targetNode?.data?.name || edge.target}`;
          })
          .join("\n")
      : "无连接";

  return `当前工作流状态：
节点数量: ${nodes.length}
连接数量: ${edges.length}

节点详情:
${nodeDescriptions}

连接关系:
${edgeDescriptions}`;
}

const nodeTypeNames: Record<string, string> = {
  INPUT: "输入节点",
  PROCESS: "AI处理节点",
};

const phaseNames: Record<ConversationPhase, string> = {
  requirement_gathering: "需求收集",
  requirement_clarification: "需求确认",
  workflow_design: "方案设计",
  workflow_generation: "生成工作流",
  testing: "测试验证",
  optimization: "智能优化",
  completed: "已完成",
};

const phaseColors: Record<ConversationPhase, string> = {
  requirement_gathering: "bg-blue-500",
  requirement_clarification: "bg-indigo-500",
  workflow_design: "bg-purple-500",
  workflow_generation: "bg-violet-500",
  testing: "bg-amber-500",
  optimization: "bg-orange-500",
  completed: "bg-green-500",
};

interface AIProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultModel: string | null;
  models: string[];
  isDefault: boolean;
  displayName: string;
}

export function AIAssistantPanel({ workflowId }: AIAssistantPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState<AIProviderConfig[]>(
    [],
  );
  const [showTestInput, setShowTestInput] = useState(false);
  const [testInputFields, setTestInputFields] = useState<
    Record<string, string>
  >({});
  const [isTesting, setIsTesting] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [targetCriteria, setTargetCriteria] = useState("");
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);
  const [lastAESReport, setLastAESReport] = useState<AESReport | null>(null);

  const [previewActions, setPreviewActions] = useState<NodeAction[] | null>(
    null,
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 拖拽相关的本地状态
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // 可调整宽度的状态
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(420);

  // 用于解决循环依赖，存储最新的 handleTest 函数
  const handleTestRef = useRef<() => Promise<void>>(async () => {});

  const {
    isOpen,
    closePanel,
    messages,
    isLoading,
    selectedModel,
    availableModels,
    addMessage,
    clearMessages,
    setLoading,
    setSelectedModel,
    setAvailableModels,
    showHistory,
    toggleHistory,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    currentPhase,
    setPhase,
    autoOptimization,
    startAutoOptimization,
    stopAutoOptimization,
    addOptimizationIteration: _addOptimizationIteration,
    isAutoMode,
    setAutoMode,
    autoApply,
    setAutoApply,
    // 新增的面板控制状态和方法
    panelPosition,
    panelSize,
    isMinimized,
    mode,
    setPanelPosition,
    setPanelSize,
    toggleMinimize,
    setMode,
  } = useAIAssistantStore();

  const { nodes, edges, addNode, updateNode, deleteNode, onConnect } = useWorkflowStore();

  const fetchProviderConfigs = useCallback(
    async (retryCount = 0) => {
      const MAX_RETRIES = 2;
      const TIMEOUT_MS = 30_000; // 增加到 30 秒

      setIsLoadingModels(true);
      try {
        // AI 助手使用文本模态
        const response = await fetchWithTimeout(
          "/api/ai/providers?modality=text",
          {
            timeoutMs: TIMEOUT_MS,
          },
        );
        const resData = await response.json();
        if (!response.ok) {
          // 获取服务器返回的详细错误信息
          const errorMsg = resData?.error?.message || resData?.message || `HTTP ${response.status}`;
          throw new Error(errorMsg);
        }
        const data = resData.success ? resData.data : {};
        const providers: AIProviderConfig[] = data.providers || [];
        setProviderConfigs(providers);

        if (providers.length > 0) {
          const models: {
            id: string;
            name: string;
            provider: string;
            configId: string;
          }[] = [];
          providers.forEach((config) => {
            config.models.forEach((model) => {
              models.push({
                id: `${config.id}:${model}`,
                name: model,
                provider: config.displayName,
                configId: config.id,
              });
            });
          });

          setAvailableModels(models);

          const defaultProvider =
            data.defaultProvider as AIProviderConfig | null;
          if (defaultProvider && defaultProvider.models.length > 0) {
            const defaultModel =
              defaultProvider.defaultModel || defaultProvider.models[0];
            setSelectedModel(`${defaultProvider.id}:${defaultModel}`);
          } else if (providers[0]?.models?.length > 0) {
            const firstModel = providers[0].models[0];
            setSelectedModel(`${providers[0].id}:${firstModel}`);
          }
        } else {
          setAvailableModels([]);
        }
      } catch (error) {
        console.error("Failed to fetch AI providers:", error);
        const errorMsg = error instanceof Error ? error.message : "未知错误";

        // 超时或网络错误时尝试重试
        if (
          retryCount < MAX_RETRIES &&
          (errorMsg.includes("请求超时") ||
            errorMsg.includes("Failed to fetch") ||
            errorMsg.includes("NetworkError"))
        ) {
          console.log(
            `重试获取AI服务商配置 (${retryCount + 1}/${MAX_RETRIES})...`,
          );
          setIsLoadingModels(false);
          // 延迟 1 秒后重试
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return fetchProviderConfigs(retryCount + 1);
        }

        if (errorMsg.includes("请求超时")) {
          toast.error(
            "加载模型配置超时，请检查后端服务/数据库连接，或刷新页面重试",
          );
        } else if (
          errorMsg.includes("Failed to fetch") ||
          errorMsg.includes("NetworkError")
        ) {
          toast.error("网络请求失败，请检查网络连接");
        } else {
          toast.error(`获取AI服务商配置失败: ${errorMsg}`);
        }
      } finally {
        setIsLoadingModels(false);
      }
    },
    [setAvailableModels, setSelectedModel],
  );

  useEffect(() => {
    if (isOpen) {
      fetchProviderConfigs();
    }
  }, [isOpen, fetchProviderConfigs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 拖拽开始
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // 只在标题栏区域才能拖拽
      if ((e.target as HTMLElement).closest('[data-drag-handle]')) {
        e.preventDefault();
        const rect = panelRef.current?.getBoundingClientRect();
        if (rect) {
          dragOffsetRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
          setIsDragging(true);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;

      const maxX = window.innerWidth - panelSize.width;
      const maxY = window.innerHeight - 100; // 至少保留100px可见

      setPanelPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, panelSize.width, setPanelPosition]);

  // 处理宽度调整
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStartXRef.current = e.clientX;
      resizeStartWidthRef.current = panelSize.width;
      setIsResizing(true);
    },
    [panelSize.width],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(
        360,
        Math.min(800, resizeStartWidthRef.current + deltaX),
      );
      setPanelSize({ ...panelSize, width: newWidth });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, panelSize, setPanelSize]);

  // 计算面板位置样式
  const panelStyle = useMemo(() => {
    if (panelPosition) {
      return {
        left: panelPosition.x,
        top: panelPosition.y,
        width: panelSize.width,
      };
    }
    // 默认位置：左侧
    return {
      left: 0,
      top: 0,
      width: panelSize.width,
    };
  }, [panelPosition, panelSize.width]);

  // 模式名称映射
  const modeNames: Record<PanelMode, string> = {
    chat: "对话",
    create: "创建",
    diagnose: "诊断",
    optimize: "建议",
    refine: "精修",
    test: "测试",
  };

  // 模式图标映射
  const modeIcons: Record<PanelMode, React.ReactNode> = {
    chat: <MessageCircle className="h-3.5 w-3.5" />,
    create: <PlusCircle className="h-3.5 w-3.5" />,
    diagnose: <Stethoscope className="h-3.5 w-3.5" />,
    optimize: <Lightbulb className="h-3.5 w-3.5" />,
    refine: <Crosshair className="h-3.5 w-3.5" />,
    test: <Play className="h-3.5 w-3.5" />,
  };

  const workflowContext = generateWorkflowContext(nodes, edges);

  const inputNodeFields = useMemo(() => {
    const fields: Array<{
      nodeName: string;
      fieldName: string;
      required?: boolean;
    }> = [];
    nodes.forEach((node) => {
      const data = node.data as NodeConfig;
      if (data.type === "INPUT") {
        const nodeFields =
          (
            data.config as {
              fields?: Array<{ name: string; required?: boolean }>;
            }
          )?.fields || [];
        nodeFields.forEach((f) => {
          fields.push({
            nodeName: data.name,
            fieldName: f.name,
            required: f.required,
          });
        });
      }
    });
    return fields;
  }, [nodes]);

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
            type: action.nodeType as NodeConfig["type"],
            name: action.nodeName,
            position,
            config: action.config || getDefaultConfig(action.nodeType),
          } as NodeConfig);

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
            const currentConfig = (targetNode.data as NodeConfig).config || {};
            const mergedConfig = { ...currentConfig, ...action.config };
            updateNode(action.nodeId, {
              config: mergedConfig,
            } as Partial<NodeConfig>);
            const nodeName =
              action.nodeName ||
              (targetNode.data as NodeConfig).name ||
              action.nodeId;
            toast.success(`已更新节点: ${nodeName}`);
          } else {
            toast.error(`未找到节点: ${action.nodeId}`);
          }
        } else if (action.action === "delete" && action.nodeId) {
          // 删除节点操作
          const targetNode = nodes.find((n) => n.id === action.nodeId);
          if (targetNode) {
            const nodeName =
              action.nodeName ||
              (targetNode.data as NodeConfig).name ||
              action.nodeId;
            deleteNode(action.nodeId);
            toast.success(`已删除节点: ${nodeName}`);
          } else {
            toast.error(`未找到节点: ${action.nodeId}`);
          }
        }
      });

      const hasChanges = addedNodes.length > 0 ||
        actions.some((a) => a.action === "update" || a.action === "delete");
      if (hasChanges) {
        setPhase("testing");
      }
    },
    [nodes, addNode, updateNode, deleteNode, onConnect, setPhase],
  );

  const handleOptimize = useCallback(
    async (type: "test" | "aes" = "test") => {
      if (type === "test" && !lastTestResult) {
        toast.error("请先执行测试");
        return;
      }
      if (type === "aes" && !lastAESReport) {
        toast.error("请先执行 AES 评估");
        return;
      }

      setIsOptimizing(true);
      setPhase("optimization");

      addMessage({
        role: "system",
        content:
          type === "aes"
            ? "正在根据 AES 评估报告生成优化方案..."
            : "正在分析执行结果并生成优化建议...",
        messageType: "optimization",
      });

      try {
        const body: Record<string, unknown> = {
          workflowId,
          targetCriteria,
          model: selectedModel,
          previousOptimizations:
            autoOptimization?.history.map((h) => h.optimization) || [],
        };

        if (type === "aes") {
          body.aesDiagnosis = lastAESReport;
        } else {
          body.testResult = lastTestResult;
        }

        const response = await fetchWithTimeout("/api/ai-assistant/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          timeoutMs: 120_000,
        });

        const data = await response.json();

        if (data.success && data.optimization) {
          const opt = data.optimization;

          let optimizationMessage = `## 优化方案 (${type === "aes" ? "基于AES评估" : "基于测试结果"})\n\n${opt.summary || "分析完成"}\n`;

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
                index: number,
              ) => {
                const priorityIcon =
                  issue.priority === "high"
                    ? "🔴"
                    : issue.priority === "medium"
                      ? "🟡"
                      : "🟢";
                optimizationMessage += `${index + 1}. ${priorityIcon} **${issue.nodeName}**: ${issue.issue}\n   建议: ${issue.suggestion}\n`;
              },
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

          // 自动模式仅在基于测试的循环中生效
          if (type === "test" && isAutoMode) {
            if (opt.isGoalMet) {
              // 目标已达成，停止循环
              stopAutoOptimization();
              toast.success("🎉 目标已达成，自动优化完成！");
              addMessage({
                role: "assistant",
                content:
                  "🎯 **目标已达成！**\nAI 判断当前工作流输出已满足设定的目标要求，自动优化流程结束。",
              });
            } else if (opt.nodeActions && opt.nodeActions.length > 0) {
              // 应用更变并继续下一轮测试
              applyNodeActions(opt.nodeActions);

              // 记录这一轮的优化结果
              if (lastTestResult) {
                _addOptimizationIteration(lastTestResult, opt, true);
              }

              // 延迟执行下一次测试，确保状态更新
              toast.info("已应用优化，正在准备下一轮测试...");
              setTimeout(() => {
                handleTestRef.current();
              }, 2000);
            } else {
              // 没有生成优化动作，可能无法继续
              stopAutoOptimization();
              toast.warning("AI 未能生成有效的优化建议，自动优化停止");
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
        const errorMessage =
          error instanceof Error ? error.message : "优化分析失败";
        toast.error(errorMessage);
        addMessage({
          role: "assistant",
          content: `优化分析出错: ${errorMessage}`,
          messageType: "optimization",
        });
        if (isAutoMode) {
          stopAutoOptimization();
        }
      } finally {
        setIsOptimizing(false);
      }
    },
    [
      lastTestResult,
      lastAESReport,
      workflowId,
      targetCriteria,
      selectedModel,
      addMessage,
      setPhase,
      isAutoMode,
      autoOptimization,
      applyNodeActions,
      stopAutoOptimization,
      _addOptimizationIteration,
      // handleTest needs to be added to dependencies, but it causes circular dependency if not careful
      // We will solve this by using a ref or ensuring handleTest is stable.
      // handleTest depends on many things. Using a ref for handleTest involves more changes.
      // Alternatively, we can assume handleTest is stable enough or suppress the linter if we are careful.
      // Better approach: move the "next step" logic out or make handleTest available.
    ],
  );

  const handleAutoOptimize = useCallback(
    async (testResult: TestResult) => {
      if (!autoOptimization?.isRunning) {
        startAutoOptimization(targetCriteria, 5);
      }

      if (
        autoOptimization &&
        autoOptimization.currentIteration >= autoOptimization.maxIterations
      ) {
        stopAutoOptimization();
        addMessage({
          role: "assistant",
          content: `已达到最大优化次数 (${autoOptimization.maxIterations} 次)。请检查工作流配置或调整优化目标。`,
        });
        return;
      }

      setLastTestResult(testResult);
      setTimeout(() => handleOptimize(), 1000);
    },
    [
      autoOptimization,
      targetCriteria,
      startAutoOptimization,
      stopAutoOptimization,
      addMessage,
      handleOptimize,
    ],
  );

  const handleTest = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    setIsTesting(true);
    setPhase("testing");

    const testInput: Record<string, unknown> = {};
    inputNodeFields.forEach((field) => {
      const key = field.fieldName;
      if (testInputFields[key]) {
        testInput[key] = testInputFields[key];
      }
    });

    addMessage({
      role: "system",
      content: `正在执行工作流测试...\n测试输入: ${JSON.stringify(testInput, null, 2)}`,
      messageType: "test_result",
    });

    try {
      const response = await fetchWithTimeout("/api/ai-assistant/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          testInput,
          timeout: 120,
        }),
        timeoutMs: 180_000,
      });

      const result = await response.json();
      setLastTestResult(result);

      const statusIcon = result.success ? "✅" : "❌";
      let resultMessage = `${statusIcon} 测试${result.success ? "成功" : "失败"}\n\n`;

      if (result.duration) {
        resultMessage += `执行时间: ${(result.duration / 1000).toFixed(2)}秒\n`;
      }

      if (result.totalTokens) {
        resultMessage += `Token消耗: ${result.totalTokens}\n`;
      }

      if (result.error) {
        resultMessage += `\n错误信息: ${result.error}\n`;
      }

      if (result.analysis) {
        resultMessage += `\n分析:\n${result.analysis}`;
      }

      if (result.output && Object.keys(result.output).length > 0) {
        resultMessage += `\n\n输出结果:\n\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\``;
      }

      addMessage({
        role: "assistant",
        content: resultMessage,
        testResult: result,
        messageType: "test_result",
      });

      if (result.success) {
        toast.success("测试执行成功");
        if (isAutoMode && targetCriteria) {
          handleAutoOptimize(result);
        }
      } else {
        toast.error("测试执行失败");
        if (isAutoMode) {
          handleAutoOptimize(result);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "测试失败";
      toast.error(errorMessage);
      addMessage({
        role: "assistant",
        content: `测试执行出错: ${errorMessage}`,
        messageType: "test_result",
      });
    } finally {
      setIsTesting(false);
    }
  }, [
    nodes,
    workflowId,
    testInputFields,
    inputNodeFields,
    addMessage,
    setPhase,
    isAutoMode,
    targetCriteria,
    handleAutoOptimize,
  ]);

  useEffect(() => {
    handleTestRef.current = handleTest;
  }, [handleTest]);

  const handleAbort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(
        new DOMException("用户取消请求", "AbortError"),
      );
      abortControllerRef.current = null;
      setLoading(false);
      toast.info("已停止生成");
    }
  }, [setLoading]);

  const handleSend = useCallback(
    async (messageContent?: string) => {
      const trimmedInput = (messageContent || inputValue).trim();
      if (!trimmedInput || isLoading) return;

      console.log("[AI Assistant] 开始发送消息:", {
        message: trimmedInput.slice(0, 50),
        model: selectedModel,
        hasWorkflowContext: !!workflowContext,
        historyLength: messages.length,
      });

      addMessage({ role: "user", content: trimmedInput });
      if (!messageContent) {
        setInputValue("");
      }
      setLoading(true);

      // 创建新的 AbortController
      abortControllerRef.current = new AbortController();

      const startTime = Date.now();

      try {
        console.log("[AI Assistant] 发送请求到 /api/ai-assistant/chat");
        const response = await fetchWithTimeout("/api/ai-assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmedInput,
            model: selectedModel,
            workflowContext,
            workflowId,
            history: messages.slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: abortControllerRef.current.signal,
          timeoutMs: 120_000,
        });

        const duration = Date.now() - startTime;
        console.log("[AI Assistant] 收到响应:", {
          status: response.status,
          ok: response.ok,
          duration: `${duration}ms`,
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[AI Assistant] 请求失败:", error);
          throw new Error(error.error || "请求失败");
        }

        const data = await response.json();
        console.log("[AI Assistant] 解析响应成功:", {
          hasContent: !!data.content,
          contentLength: data.content?.length,
          hasNodeActions: !!data.nodeActions,
          phase: data.phase,
        });

        addMessage({
          role: "assistant",
          content: data.content,
          nodeActions: data.nodeActions,
          questionOptions: data.questionOptions,
          messageType:
            data.phase === "workflow_generation"
              ? "workflow_generated"
              : "normal",
        });

        if (data.phase === "workflow_generation") {
          setPhase("workflow_generation");

          // 自动应用生成的节点
          if (autoApply && data.nodeActions && data.nodeActions.length > 0) {
            setTimeout(() => {
              applyNodeActions(data.nodeActions);
              toast.success("已自动应用到画布");
            }, 500);
          }
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error("[AI Assistant] 请求异常:", {
          error,
          duration: `${duration}ms`,
          errorName: error instanceof Error ? error.name : "Unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
        });

        // 如果是用户主动取消，不显示错误消息
        if (error instanceof Error && error.name === "AbortError") {
          console.log("[AI Assistant] 用户取消请求");
          return;
        }
        let errorMessage =
          error instanceof Error ? error.message : "AI请求失败";
        if (errorMessage.includes("请求超时")) {
          errorMessage = "请求超时，请检查 AI Base URL / 网络连接 / 代理设置";
        }
        toast.error(errorMessage);
        addMessage({
          role: "assistant",
          content: `抱歉，请求出错了：${errorMessage}\n\n请检查：\n1. AI服务商配置是否正确\n2. 模型名称是否有效\n3. API Key是否有效`,
        });
      } finally {
        abortControllerRef.current = null;
        setLoading(false);
      }
    },
    [
      inputValue,
      isLoading,
      selectedModel,
      workflowContext,
      workflowId,
      messages,
      addMessage,
      setLoading,
      setPhase,
      autoApply,
      applyNodeActions,
    ],
  );

  const handleAESEvaluate = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("工作流为空，请先添加节点");
      return;
    }

    setIsEvaluating(true);
    // 评估是一个分析过程，不一定要切换 phase，但为了 UI 一致性，可以设为 optimization
    setPhase("optimization");

    addMessage({
      role: "system",
      content:
        "正在进行 AES 全维评估 (Logic, Agentic, Context, Prompt, Robustness)...",
      messageType: "aes_evaluation",
    });

    try {
      const response = await fetchWithTimeout("/api/ai-assistant/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowContext,
          model: selectedModel,
          testResult: lastTestResult,
          targetCriteria,
        }),
        timeoutMs: 120_000,
      });

      const data = await response.json();

      if (data.success && data.evaluation) {
        const report = data.evaluation as AESReport;
        setLastAESReport(report);

        let reportContent = `## 🛡️ AES 评估报告\n\n`;
        reportContent += `**总分**: ${report.scores.total}/100`;

        if (report.targetMatching !== undefined) {
          reportContent += `  |  **目标达成**: ${report.targetMatching}/100`;
        }
        reportContent += `\n\n`;

        if (report.executionAnalysis) {
          const ea = report.executionAnalysis;
          const icon = ea.status === "success" ? "✅" : "❌";
          reportContent += `### ⚡ 动态执行分析\n`;
          reportContent += `- **状态**: ${icon} ${ea.status}\n`;
          if (ea.errorAnalysis)
            reportContent += `- **错误分析**: ${ea.errorAnalysis}\n`;
          if (ea.durationAnalysis)
            reportContent += `- **耗时**: ${ea.durationAnalysis}\n`;
          if (ea.outputQuality)
            reportContent += `- **输出质量**: ${ea.outputQuality}\n`;
          reportContent += `\n`;
        }

        reportContent += `### 维度得分\n`;
        reportContent += `- **L (Logic)**: ${report.scores.L}/30\n`;
        reportContent += `- **A (Agentic)**: ${report.scores.A}/25\n`;
        reportContent += `- **C (Context)**: ${report.scores.C}/20\n`;
        reportContent += `- **P (Prompt)**: ${report.scores.P}/15\n`;
        reportContent += `- **R (Robustness)**: ${report.scores.R}/10\n\n`;

        reportContent += `### 诊断详情\n${report.report}\n`;

        if (report.needOptimization) {
          reportContent += `\n> ⚠️ 检测到潜在风险，建议进行优化。`;
        }

        addMessage({
          role: "assistant",
          content: reportContent,
          aesReport: report,
          messageType: "aes_evaluation",
        });

        if (report.needOptimization) {
          toast.warning("检测到工作流存在优化空间");
        } else {
          toast.success("AES 评估完成，工作流状态良好");
        }
      } else {
        addMessage({
          role: "assistant",
          content: `AES 评估失败: ${data.error || "未知错误"}`,
          messageType: "aes_evaluation",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "评估请求失败";
      toast.error(errorMessage);
      addMessage({
        role: "assistant",
        content: `AES 评估出错: ${errorMessage}`,
        messageType: "aes_evaluation",
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [nodes, workflowContext, selectedModel, addMessage, setPhase]);

  const handleStartAutoLoop = useCallback(() => {
    if (!targetCriteria.trim()) {
      toast.error("请先输入优化目标");
      return;
    }
    setAutoMode(true);
    startAutoOptimization(targetCriteria, 5);
    handleTest();
  }, [targetCriteria, setAutoMode, startAutoOptimization, handleTest]);

  const handleStopAutoLoop = useCallback(() => {
    setAutoMode(false);
    stopAutoOptimization();
    toast.info("已停止自动优化");
  }, [setAutoMode, stopAutoOptimization]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleNewConversation = useCallback(() => {
    createConversation(workflowId);
    setLastTestResult(null);
  }, [createConversation, workflowId]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "昨天";
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return date.toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const workflowConversations = conversations.filter(
    (c) => c.workflowId === workflowId,
  );

  if (!isOpen) return null;

  // 最小化状态显示
  if (isMinimized) {
    return (
      <div
        ref={panelRef}
        className={cn(
          "fixed z-50 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-lg hover:shadow-xl transition-shadow",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{
          left: panelPosition?.x ?? 16,
          top: panelPosition?.y ?? 16,
        }}
        onMouseDown={(e) => {
          // 点击展开按钮时不触发拖拽
          if ((e.target as HTMLElement).closest('[data-expand-button]')) {
            return;
          }
          e.preventDefault();
          const rect = panelRef.current?.getBoundingClientRect();
          if (rect) {
            dragOffsetRef.current = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            };
            setIsDragging(true);
          }
        }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">AI 规划助手</span>
        <button
          data-expand-button
          onClick={toggleMinimize}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <Maximize2 className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 flex flex-col rounded-2xl border bg-slate-50 shadow-xl overflow-hidden",
        isDragging && "cursor-grabbing select-none",
        !panelPosition && "h-full rounded-none" // 默认位置时占满高度
      )}
      style={{
        ...panelStyle,
        height: panelPosition ? panelSize.height : "100%",
        maxHeight: panelPosition ? "calc(100vh - 32px)" : "100%",
      }}
      onMouseDown={handleDragStart}
    >
      {/* 右侧拖拽调整宽度的手柄 */}
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-transparent hover:bg-blue-400/50 transition-colors z-50"
        onMouseDown={handleResizeStart}
      />

      {/* 头部 - 可拖拽区域 */}
      <div
        data-drag-handle
        className={cn(
          "flex items-center justify-between border-b bg-white px-4 py-3",
          panelPosition && "cursor-grab",
          isDragging && "cursor-grabbing"
        )}
      >
        <div className="flex items-center gap-3">
          {/* 拖拽手柄图标 */}
          {panelPosition && (
            <GripHorizontal className="h-4 w-4 text-gray-300 mr-1" />
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">AI 规划助手</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewConversation}
            title="新建对话"
            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="icon"
            onClick={toggleHistory}
            title="历史记录"
            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearMessages}
            title="清空对话"
            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMinimize}
            title="最小化"
            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={closePanel}
            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 模式切换 Tab */}
      <div className="flex border-b bg-white px-2 py-1.5 gap-1">
        {(["chat", "create", "diagnose", "test", "optimize", "refine"] as PanelMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              mode === m
                ? "bg-blue-50 text-blue-600"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            )}
          >
            {modeIcons[m]}
            {modeNames[m]}
          </button>
        ))}
      </div>

      {/* 模型选择 - 带背景色 */}
      <div className="border-b bg-white px-4 py-2 space-y-2">
        {isLoadingModels ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>加载模型配置...</span>
          </div>
        ) : availableModels.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertCircle className="h-3 w-3" />
            <span>未配置AI服务商</span>
            <Link
              href="/settings/ai-config"
              className="ml-auto flex items-center gap-1 text-blue-500 hover:underline"
            >
              <Settings className="h-3 w-3" />
              前往设置
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">模型:</span>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-7 flex-1 text-xs border-gray-200 bg-gray-50">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {providerConfigs.map((config) => (
                    <div key={config.id}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                        {config.displayName}
                        {config.isDefault && (
                          <span className="ml-1 text-blue-500">(默认)</span>
                        )}
                      </div>
                      {config.models.map((model) => (
                        <SelectItem
                          key={`${config.id}:${model}`}
                          value={`${config.id}:${model}`}
                          className="text-xs pl-4"
                        >
                          {model}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="auto-apply"
                checked={autoApply}
                onCheckedChange={setAutoApply}
              />
              <Label
                htmlFor="auto-apply"
                className="text-xs cursor-pointer text-gray-600"
              >
                自动应用到画布
              </Label>
            </div>
          </>
        )}
      </div>

      {/* 内容区域容器 - 用于确保子组件可以正确滚动 */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {showHistory ? (
        <div className="flex flex-1 flex-col overflow-hidden bg-white min-h-0">
          <div className="flex items-center justify-between border-b px-4 py-2 bg-gray-50">
            <button
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              onClick={toggleHistory}
            >
              <ChevronLeft className="h-3 w-3" />
              返回对话
            </button>
            <span className="text-xs text-gray-500">
              {workflowConversations.length} 条对话
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {workflowConversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                <History className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">暂无历史对话</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {workflowConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50",
                      currentConversationId === conv.id && "bg-blue-50",
                    )}
                    onClick={() => selectConversation(conv.id)}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-200">
                      <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-sm font-medium text-gray-800">
                          {conv.title}
                        </h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(conv.updatedAt)}</span>
                        <span>·</span>
                        <Badge
                          variant="outline"
                          className="h-4 text-[10px] border-gray-200"
                        >
                          {phaseNames[conv.phase]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : mode === "create" ? (
        // 创建工作流模式
        <CreateWorkflowSection
          workflowId={workflowId}
          selectedModel={selectedModel}
        />
      ) : mode === "diagnose" ? (
        // 诊断模式
        <DiagnoseSection workflowId={workflowId} />
      ) : mode === "optimize" ? (
        // 建议模式（原优化）
        <OptimizeSection
          workflowId={workflowId}
          selectedModel={selectedModel}
          onPreview={(actions) => {
            setPreviewActions(actions);
            setIsPreviewOpen(true);
          }}
        />
      ) : mode === "refine" ? (
        // 精修模式
        <RefineSection
          workflowId={workflowId}
          selectedModel={selectedModel}
          onPreview={(actions) => {
            setPreviewActions(actions);
            setIsPreviewOpen(true);
          }}
        />
      ) : mode === "test" ? (
        // 测试模式
        <TestSection
          workflowId={workflowId}
          selectedModel={selectedModel}
        />
      ) : (
        // 对话模式 (chat)
        <>
          <div className="border-b bg-white">
            <button
              className="flex w-full items-center justify-between px-4 py-2 text-xs text-gray-500 hover:bg-gray-50"
              onClick={() => setShowContext(!showContext)}
            >
              <span>画布上下文信息</span>
              {showContext ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showContext && (
              <div className="max-h-32 overflow-auto border-t bg-gray-50 px-4 py-2">
                <pre className="whitespace-pre-wrap text-xs text-gray-500">
                  {workflowContext}
                </pre>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-white">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200">
                  <Bot className="h-8 w-8 text-blue-600" />
                </div>
                <h4 className="mb-2 font-medium text-gray-800">
                  你好！我是AI规划助手
                </h4>
                <p className="mb-4 text-sm text-gray-500">
                  告诉我你想要实现什么，我会引导你
                  <br />
                  完成需求分析并自动生成工作流
                </p>
                <div className="space-y-3 text-xs text-gray-500 w-full px-4">
                  <p>试试描述你的需求：</p>
                  <div className="space-y-1">
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() =>
                        setInputValue(
                          "我想做一个客服问答系统，可以自动回复用户的问题",
                        )
                      }
                    >
                      我想做一个客服问答系统
                    </button>
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() =>
                        setInputValue("帮我创建一个文档自动生成的工作流")
                      }
                    >
                      帮我创建一个文档自动生成的工作流
                    </button>
                    <button
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100 text-gray-600"
                      onClick={() =>
                        setInputValue("我需要一个数据分析报告生成器")
                      }
                    >
                      我需要一个数据分析报告生成器
                    </button>
                  </div>

                  {/* 推荐工作流程 */}
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-gray-600 font-medium mb-2">推荐工作流程</p>
                    <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
                      <span className="px-2 py-1 rounded bg-violet-50 text-violet-600">创建</span>
                      <span>→</span>
                      <span className="px-2 py-1 rounded bg-teal-50 text-teal-600">诊断</span>
                      <span>→</span>
                      <span className="px-2 py-1 rounded bg-amber-50 text-amber-600">测试</span>
                      <span>→</span>
                      <span className="px-2 py-1 rounded bg-orange-50 text-orange-600">建议</span>
                      <span>→</span>
                      <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-600">精修</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      点击上方标签切换不同模式
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onApplyActions={applyNodeActions}
                    onSelectOption={handleSend}
                    onOptimize={handleOptimize}
                    onPreview={(actions) => {
                      setPreviewActions(actions);
                      setIsPreviewOpen(true);
                    }}
                    onNavigate={setMode}
                    isLoading={isLoading}
                  />
                ))}
                {isLoading && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-600">思考中...</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-6 px-2 text-xs text-gray-500 hover:text-red-500"
                        onClick={handleAbort}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        停止
                      </Button>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t bg-white p-4">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  availableModels.length === 0
                    ? "请先配置AI服务商..."
                    : "描述你的需求或提问..."
                }
                className="min-h-[60px] resize-none border-gray-200 bg-gray-50 focus:bg-white"
                disabled={isLoading || availableModels.length === 0}
              />
              <Button
                onClick={isLoading ? handleAbort : () => handleSend()}
                disabled={!isLoading && (!inputValue.trim() || !selectedModel)}
                variant={isLoading ? "destructive" : "default"}
                className={cn(
                  "h-auto px-4",
                  !isLoading && "bg-blue-500 hover:bg-blue-600",
                )}
              >
                {isLoading ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              按 Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </>
      )}
      </div>

      {/* WorkflowPreview Dialog */}
      {previewActions && (
        <WorkflowPreview
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          currentNodes={nodes}
          currentEdges={edges}
          actions={previewActions}
          isRefining={isRefining}
          onConfirm={() => {
            if (previewActions) {
              applyNodeActions(previewActions);
              setIsPreviewOpen(false);
              setPreviewActions(null);
            }
          }}
          onCancel={() => setIsPreviewOpen(false)}
          onRefine={async (nodeName, requirement) => {
            // Refinement Logic
            setIsRefining(true);
            try {
              toast.info(`正在根据您的意见优化节点"${nodeName}"...`);

              const response = await fetchWithTimeout(
                "/api/ai-assistant/chat",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    mode: "refinement",
                    currentActions: previewActions,
                    targetNode: nodeName,
                    message: requirement,
                    model: selectedModel,
                    workflowContext,
                    workflowId,
                  }),
                  timeoutMs: 60_000,
                },
              );

              if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "请求失败");
              }

              const data = await response.json();

              if (data.nodeActions) {
                setPreviewActions(data.nodeActions);
                toast.success("已更新预览方案");

                // Add a small system message to chat to record this interaction
                addMessage({
                  role: "system",
                  content: `用户针对节点 "${nodeName}" 提出了修改意见: "${requirement}"。\nAI 已更新生成方案。`,
                  messageType: "normal",
                });
              } else {
                toast.warning("AI未返回有效的修改方案");
              }
            } catch (error) {
              console.error(error);
              toast.error("优化请求失败");
            } finally {
              setIsRefining(false);
            }
          }}
          // We can manage an isRefining state here if we want to block multiple requests
          // For now, let's rely on the internal await.
          // Actually, WorkflowPreview expects an isRefining prop.
          // We need a local state for it.
        />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onApplyActions,
  onSelectOption,
  onOptimize,
  onPreview,
  onNavigate,
  isLoading,
}: {
  message: AIMessage;
  onApplyActions: (actions: NodeAction[]) => void;
  onSelectOption: (answer: string) => void;
  onOptimize?: (type: "test" | "aes") => void;
  onPreview?: (actions: NodeAction[]) => void;
  onNavigate?: (mode: PanelMode) => void;
  isLoading: boolean;
}) {
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const handleApply = () => {
    if (message.nodeActions) {
      onApplyActions(message.nodeActions);
      setApplied(true);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const handleOptionClick = (
    questionId: string,
    optionId: string,
    optionLabel: string,
    allowInput?: boolean,
  ) => {
    // 处理功能导航选项
    if (optionId.startsWith("navigate_")) {
      const modeMap: Record<string, PanelMode> = {
        navigate_diagnose: "diagnose",
        navigate_optimize: "optimize",
        navigate_refine: "refine",
        navigate_test: "test",
      };
      const targetMode = modeMap[optionId];
      if (targetMode && onNavigate) {
        onNavigate(targetMode);
        toast.success(`已切换到${optionLabel}`);
        return;
      }
    }

    if (allowInput) {
      setSelectedOptions((prev) => ({ ...prev, [questionId]: optionId }));
    } else {
      setSelectedOptions((prev) => ({ ...prev, [questionId]: optionId }));
    }
  };

  const handleSubmitAnswers = () => {
    if (!message.questionOptions) return;

    const answers: string[] = [];
    message.questionOptions.questions.forEach((q) => {
      const selectedId = selectedOptions[q.id];
      if (selectedId) {
        const option = q.options.find((o) => o.id === selectedId);
        if (option) {
          if (option.allowInput && customInputs[q.id]) {
            answers.push(`${q.question}: ${customInputs[q.id]}`);
          } else {
            answers.push(`${q.question}: ${option.label}`);
          }
        }
      }
    });

    if (answers.length > 0) {
      onSelectOption(answers.join("\n"));
    }
  };

  const allQuestionsAnswered = message.questionOptions?.questions.every((q) => {
    const selectedId = selectedOptions[q.id];
    if (!selectedId) return false;
    const option = q.options.find((o) => o.id === selectedId);
    if (option?.allowInput) {
      return !!customInputs[q.id]?.trim();
    }
    return true;
  });

  const getMessageIcon = () => {
    if (isUser) return <User className="h-4 w-4" />;
    if (isSystem) {
      switch (message.messageType) {
        case "test_result":
          return <Play className="h-4 w-4" />;
        case "optimization":
          return <RefreshCw className="h-4 w-4" />;
        case "aes_evaluation":
          return <Shield className="h-4 w-4" />;
        default:
          return <AlertCircle className="h-4 w-4" />;
      }
    }
    return <Bot className="h-4 w-4 text-white" />;
  };

  const getIconBackground = () => {
    if (isUser) return "bg-primary text-primary-foreground";
    if (isSystem) {
      switch (message.messageType) {
        case "test_result":
          return "bg-amber-500";
        case "optimization":
          return "bg-orange-500";
        case "aes_evaluation":
          return "bg-blue-600";
        default:
          return "bg-slate-500";
      }
    }
    return "bg-gradient-to-br from-violet-500 to-purple-600";
  };

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
          getIconBackground(),
        )}
      >
        {getMessageIcon()}
      </div>
      <div
        className={cn(
          "group relative max-w-[85%] rounded-lg px-4 py-3",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>

        {message.aesReport && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">
                评估得分: {message.aesReport.scores.total} 分
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 text-[10px] text-center mb-2">
              <div className="bg-muted p-1 rounded">
                L: {message.aesReport.scores.L}
              </div>
              <div className="bg-muted p-1 rounded">
                A: {message.aesReport.scores.A}
              </div>
              <div className="bg-muted p-1 rounded">
                C: {message.aesReport.scores.C}
              </div>
              <div className="bg-muted p-1 rounded">
                P: {message.aesReport.scores.P}
              </div>
              <div className="bg-muted p-1 rounded">
                R: {message.aesReport.scores.R}
              </div>
            </div>
          </div>
        )}

        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-1 -bottom-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 bg-background border shadow-sm"
            onClick={handleCopy}
            title="复制内容"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}

        {!isUser &&
          message.questionOptions &&
          message.questionOptions.questions.length > 0 && (
            <div className="mt-4 space-y-4">
              {message.questionOptions.questions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <div className="text-xs font-medium text-foreground">
                    {question.question}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option) => {
                      const isSelected =
                        selectedOptions[question.id] === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() =>
                            handleOptionClick(
                              question.id,
                              option.id,
                              option.label,
                              option.allowInput,
                            )
                          }
                          disabled={isLoading}
                          className={cn(
                            "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950",
                            isSelected
                              ? "border-violet-500 bg-violet-50 dark:bg-violet-950 ring-1 ring-violet-500"
                              : "border-border bg-background",
                            isLoading && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <span className="text-xs font-medium">
                            {option.label}
                          </span>
                          {option.description && (
                            <span className="text-[10px] text-muted-foreground">
                              {option.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedOptions[question.id] &&
                    question.options.find(
                      (o) => o.id === selectedOptions[question.id],
                    )?.allowInput && (
                      <Input
                        className="mt-2 h-8 text-xs"
                        placeholder="请输入你的描述..."
                        value={customInputs[question.id] || ""}
                        onChange={(e) =>
                          setCustomInputs((prev) => ({
                            ...prev,
                            [question.id]: e.target.value,
                          }))
                        }
                        disabled={isLoading}
                      />
                    )}
                </div>
              ))}
              <Button
                size="sm"
                className="w-full h-8 text-xs bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                onClick={handleSubmitAnswers}
                disabled={!allQuestionsAnswered || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Send className="mr-1 h-3 w-3" />
                    提交回答
                  </>
                )}
              </Button>
            </div>
          )}

        {!isUser && message.nodeActions && message.nodeActions.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <div className="mb-2 text-xs font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-violet-500" />
              生成的工作流操作：
            </div>
            <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
              {message.nodeActions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  {action.action === "add" && (
                    <Plus className="h-3 w-3 text-green-500" />
                  )}
                  {action.action === "update" && (
                    <RefreshCw className="h-3 w-3 text-blue-500" />
                  )}
                  {action.action === "delete" && (
                    <Trash2 className="h-3 w-3 text-red-500" />
                  )}
                  {action.action === "connect" && (
                    <ArrowRight className="h-3 w-3 text-purple-500" />
                  )}
                  <span>
                    {action.action === "add" &&
                      `添加 ${nodeTypeNames[action.nodeType || ""] || action.nodeType}: "${action.nodeName}"`}
                    {action.action === "update" && `更新 "${action.nodeName}"`}
                    {action.action === "delete" && `删除 "${action.nodeName || action.nodeId}"`}
                    {action.action === "connect" &&
                      `连接 ${action.source} → ${action.target}`}
                  </span>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant={applied ? "outline" : "default"}
              className="mt-2 h-7 text-xs w-full"
              onClick={handleApply}
              disabled={applied}
            >
              {applied ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  已应用到画布
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  一键应用到画布
                </>
              )}
            </Button>

            {!applied && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs w-full"
                onClick={() => onPreview?.(message.nodeActions || [])}
                disabled={isLoading}
              >
                <Eye className="mr-1 h-3 w-3" />
                预览修改 (Diff)
              </Button>
            )}
          </div>
        )}

        {message.testResult && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center gap-2 text-xs">
              {message.testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium">
                测试{message.testResult.success ? "成功" : "失败"}
              </span>
              {message.testResult.duration && (
                <span className="text-muted-foreground">
                  {(message.testResult.duration / 1000).toFixed(2)}s
                </span>
              )}
            </div>
          </div>
        )}

        {message.aesReport && message.aesReport.needOptimization && (
          <div className="mt-3 border-t pt-3">
            <Button
              size="sm"
              className="h-7 text-xs w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              onClick={() => onOptimize?.("aes")}
            >
              <Lightbulb className="mr-1 h-3 w-3" />
              生成优化方案
            </Button>

            {!applied && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs w-full"
                onClick={() => onPreview?.(message.nodeActions || [])}
                disabled={isLoading}
              >
                <Eye className="mr-1 h-3 w-3" />
                预览修改 (Diff)
              </Button>
            )}
          </div>
        )}

        {message.optimizationSuggestion &&
          message.nodeActions &&
          message.nodeActions.length > 0 &&
          !applied && (
            <div className="mt-3 border-t pt-3">
              <Button
                size="sm"
                className="h-7 text-xs w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                onClick={handleApply}
              >
                <Zap className="mr-1 h-3 w-3" />
                应用优化建议
              </Button>
            </div>
          )}
      </div>
    </div>
  );
}

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type.toUpperCase()) {
    case "TRIGGER":
      return { triggerType: "MANUAL", enabled: true };
    case "INPUT":
      return { fields: [] };
    case "PROCESS":
      return {
        systemPrompt: "",
        userPrompt: "",
        temperature: 0.7,
        maxTokens: 2048,
      };
    case "CODE":
      return {
        prompt: "",
        language: "javascript",
        code: "",
      };
    case "OUTPUT":
      return {
        prompt: "",
        format: "text",
        templateName: "",
      };
    case "CONDITION":
      return { conditions: [], evaluationMode: "all" };
    case "LOOP":
      return { loopType: "FOR", maxIterations: 100 };
    case "HTTP":
      return { method: "GET", url: "", headers: {}, timeout: 30000 };
    case "MERGE":
      return { mergeStrategy: "all", errorStrategy: "fail_fast" };
    case "NOTIFICATION":
      return {
        platform: "feishu",
        webhookUrl: "",
        messageType: "text",
        content: "",
      };
    case "IMAGE_GEN":
      return { prompt: "", size: "1024x1024", quality: "standard", n: 1 };
    case "SWITCH":
      return { switchVariable: "", cases: [], matchType: "exact" };
    default:
      return {};
  }
}
