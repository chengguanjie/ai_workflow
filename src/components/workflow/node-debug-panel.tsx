"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileJson,
  Workflow,
  ArrowRightFromLine,
  Clock,
  Cpu,
  BookOpen,
  Database,
  Plus,
  MessageSquare,
  Settings,
  Download,
  Eye,
  Image as ImageIcon,
  Music,
  Video,
  GripVertical,
  Expand,
  Sparkles,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/stores/workflow-store";
import { PromptTabContent } from "./node-config-panel/shared/prompt-tab-content";
import { InputTabs, type WorkflowNode } from "./debug-panel/input-tabs";
import {
  ModalitySelector,
  DEFAULT_MODALITY,
} from "./debug-panel/modality-selector";
import { InputNodeDebugPanel } from "./input-debug-panel";
import { PreviewModal } from "./debug-panel/preview-modal";
import { ModalityOutputPreview } from "./debug-panel/modality-output-preview";
import { OutputTypeSelector } from "./debug-panel/output-type-selector";
import type { KnowledgeItem, RAGConfig } from "@/types/workflow";
import type { AIProviderConfig } from "./node-config-panel/shared/types";
import {
  MODALITY_TO_OUTPUT_TYPE,
  type InputTabType,
  type ImportedFile,
  type OutputType,
} from "@/lib/workflow/debug-panel/types";
import type { ModelModality } from "@/lib/ai/types";
import {
  generateDownloadFileName,
  inferOutputType,
  guessOutputTypeFromPromptAndTools,
} from "@/lib/workflow/debug-panel/utils";
import { getModelModality } from "@/lib/ai/types";

type TriggerType = "MANUAL" | "WEBHOOK" | "SCHEDULE";

interface TriggerNodeConfigData {
  triggerType?: TriggerType;
  enabled?: boolean;
  webhookPath?: string;
  hasWebhookSecret?: boolean;
  cronExpression?: string;
  timezone?: string;
  retryOnFail?: boolean;
  maxRetries?: number;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  chunkCount: number;
  isActive: boolean;
}

interface DebugResult {
  status: "success" | "error" | "skipped";
  output: Record<string, unknown>;
  error?: string;
  duration: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  logs?: string[];
}

export function NodeDebugPanel() {
  const {
    debugNodeId,
    isDebugPanelOpen,
    closeDebugPanel,
    nodes,
    edges,
    id: workflowId,
    updateNode,
    nodeExecutionResults,
    updateNodeExecutionResult,
    nodeExecutionStatus,
    updateNodeExecutionStatus,
  } = useWorkflowStore();

  // 使用 ref 来存储最新的 nodes，避免在异步回调中出现 stale closure
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const [mockInputs, setMockInputs] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [isRunning, setIsRunning] = useState(false);

  // 从 store 读取当前节点的执行结果（添加空值保护）
  const result =
    debugNodeId && nodeExecutionResults
      ? nodeExecutionResults[debugNodeId] || null
      : null;

  // Config State (for Process Nodes)
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [providersModality, setProvidersModality] = useState<ModelModality | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingKBs, setLoadingKBs] = useState(true);

  // Section visibility states - 默认折叠
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isProcessOpen, setIsProcessOpen] = useState(false);
  const [isOutputOpen, setIsOutputOpen] = useState(false);

  // Input Tab state (新增)
  const [inputActiveTab, setInputActiveTab] =
    useState<InputTabType>("input");
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);

  // PROCESS 调试面板中的 AI 提示词固定使用文本模型；
  // 这里保留 selectedModality 仅用于输出类型等内部逻辑，默认视为文本。
  const [selectedModality, setSelectedModality] =
    useState<ModelModality>(DEFAULT_MODALITY);

  // Output type and preview state (新增)
  const [selectedOutputType, setSelectedOutputType] =
    useState<OutputType>("text");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | Blob | null>(
    null,
  );

  // Panel position and size state (可拖动和调整大小)
  const [panelWidth, setPanelWidth] = useState(500);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // 参考规则展开弹窗状态
  const [isRuleExpandOpen, setIsRuleExpandOpen] = useState(false);
  const [expandedRuleIndex, setExpandedRuleIndex] = useState<number | null>(
    null,
  );
  const [isOptimizingRule, setIsOptimizingRule] = useState(false);
  const [optimizedContent, setOptimizedContent] = useState<string | null>(null);

  const debugNode = nodes.find((n) => n.id === debugNodeId);
  const isProcessNode =
    debugNode?.type === "process" || debugNode?.type === "PROCESS";

  // 计算节点是否正在运行（结合本地状态和 store 状态）
  const currentNodeStatus = debugNodeId ? nodeExecutionStatus[debugNodeId] : undefined;
  const isNodeRunning = isRunning || currentNodeStatus === "running";

  // 初始化编辑标题
  useEffect(() => {
    if (debugNode) {
      setEditedTitle((debugNode.data.name as string) || "");
    }
  }, [debugNode]);

  // 处理标题保存
  const handleTitleSave = useCallback(() => {
    if (
      debugNode &&
      editedTitle.trim() &&
      editedTitle !== debugNode.data.name
    ) {
      updateNode(debugNode.id, { name: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  }, [debugNode, editedTitle, updateNode]);

  // 处理拖动开始
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".drag-handle")) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.clientX - panelPosition.x,
          y: e.clientY - panelPosition.y,
        };
      }
    },
    [panelPosition],
  );

  // 处理拖动和调整大小
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStartRef.current.x;
        const newY = e.clientY - dragStartRef.current.y;
        setPanelPosition({ x: newX, y: newY });
      }
      if (isResizing && panelRef.current) {
        // 计算面板右边缘的位置
        const panelRect = panelRef.current.getBoundingClientRect();
        const rightEdge = panelRect.right;
        // 新宽度 = 右边缘 - 鼠标位置
        const newWidth = Math.max(
          400,
          Math.min(800, rightEdge - e.clientX),
        );
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing]);

  // AI优化参考规则
  const handleOptimizeRule = useCallback(
    async (index: number, currentContent: string) => {
      setIsOptimizingRule(true);
      setOptimizedContent(null);
      try {
        const response = await fetch("/api/ai/optimize-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: currentContent,
            type: "reference_rule",
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setOptimizedContent(
            data.optimizedContent || data.data?.optimizedContent,
          );
        }
      } catch (error) {
        console.error("优化失败:", error);
      } finally {
        setIsOptimizingRule(false);
      }
    },
    [],
  );


  // 应用优化后的内容 - 将在 updateKnowledgeItem 定义后实现

  const predecessorNodes = useMemo(
    () =>
      edges
        .filter((e) => e.target === debugNodeId)
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter(Boolean),
    [edges, nodes, debugNodeId],
  );

  // 用于跟踪上一个打开的节点 ID（非空值），避免在关闭/打开同一节点时重复初始化
  const prevOpenedNodeIdRef = useRef<string | null>(null);
  // 用于跟踪上一个 debugNodeId，只有在节点真正切换时才重置 UI 状态
  const prevDebugNodeIdRef = useRef<string | null>(null);

  // Reset state when node changes
  useEffect(() => {
    // 只有在节点真正切换时才重置 UI 状态，避免在同一节点执行时折叠面板
    const isNodeChanged = prevDebugNodeIdRef.current !== debugNodeId;

    if (debugNodeId && predecessorNodes.length > 0) {
      const defaultInputs: Record<string, Record<string, unknown>> = {};
      for (const predNode of predecessorNodes) {
        if (predNode) {
          const predNodeName = predNode.data.name as string;
          // 检查上游节点是否有已保存的执行结果
          const predNodeResult = nodeExecutionResults?.[predNode.id];
          if (predNodeResult?.status === "success" && predNodeResult.output) {
            // 使用已保存的执行结果
            defaultInputs[predNodeName] = predNodeResult.output;
          } else {
            // 使用占位符
            defaultInputs[predNodeName] = {
              result: `[数据来自: ${predNodeName}]`,
            };
          }
        }
      }
      setMockInputs(defaultInputs);
    } else {
      setMockInputs({});
    }

    // 只有在节点切换时才重置 UI 状态，不在同一节点执行时重置
    if (isNodeChanged) {
      // 注意：不再清除执行结果，保持结果持久化
      // 只重置 UI 状态
      setIsInputOpen(false);
      setIsProcessOpen(false);
      // 如果当前节点有执行结果，自动展开输出区域
      const currentNodeResult = debugNodeId ? nodeExecutionResults?.[debugNodeId] : null;
      setIsOutputOpen(!!currentNodeResult);
      // Reset new state variables（默认展示「输入与资料」tab）
      setInputActiveTab("input");
      setImportedFiles([]);

      // 更新 ref
      prevDebugNodeIdRef.current = debugNodeId;
    }

    // 每次 debugNodeId 改变时（包括从 null 到非空），将调试面板视为文本任务，
    // 其他模态通过专用节点或工具实现。
    if (debugNodeId) {
      prevOpenedNodeIdRef.current = debugNodeId;
      setSelectedModality(DEFAULT_MODALITY);

      // 优先使用节点配置中已保存的 expectedOutputType，否则使用默认值
      const currentNode = nodes.find((n) => n.id === debugNodeId);
      const nodeConfig = currentNode?.data?.config as Record<string, unknown> | undefined;
      const savedExpectedOutputType = nodeConfig?.expectedOutputType as OutputType | undefined;
      
      if (savedExpectedOutputType) {
        setSelectedOutputType(savedExpectedOutputType);
      } else {
        // 只有在没有保存值时才使用默认值
        setSelectedOutputType(MODALITY_TO_OUTPUT_TYPE[DEFAULT_MODALITY] || "json");
      }

      // 只在节点切换时重置预览状态
      if (isNodeChanged) {
        setIsPreviewOpen(false);
        setPreviewContent(null);
      }
    }
  }, [debugNodeId, predecessorNodes, nodeExecutionResults, nodes]);

  const handleRunDebug = async () => {
    if (!workflowId || !debugNodeId) return;

    setIsRunning(true);
    // 更新 store 中的执行状态，让节点图标也能同步显示
    updateNodeExecutionStatus(debugNodeId, "running");
    // 清除之前的结果
    updateNodeExecutionResult(debugNodeId, null);
    setIsProcessOpen(true);
    setIsOutputOpen(false);

    try {
      // Inputs are already an object, no need to parse
      const parsedInputs = mockInputs;

      // 获取当前节点的最新配置（可能包含未保存的更改）
      const currentNode = nodes.find((n) => n.id === debugNodeId);
      const currentNodeConfig = currentNode?.data?.config as Record<string, unknown> | undefined;

      const response = await fetch(
        `/api/workflows/${workflowId}/nodes/${debugNodeId}/debug`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mockInputs: parsedInputs,
            importedFiles: importedFiles.map((f) => ({
              name: f.name,
              content:
                typeof f.content === "string"
                  ? f.content
                  : "[Binary Content]",
              type: f.type,
            })),
            // 传递当前节点配置，让后端使用最新的配置
            nodeConfig: currentNodeConfig,
          }),
        },
      );

      const data = await response.json();

      if (data.success) {
        // 1) 根据提示词 + 工具配置推断“期望输出类型”（用于 UI 展示）
        const guessedFromIntent = guessOutputTypeFromPromptAndTools({
          userPrompt: processConfig.userPrompt as string | undefined,
          tools: (processConfig.tools as any[]) || [],
        });

        // 2) 再根据实际输出内容做兜底推断
        const output =
          (data.data?.output ||
            data.data?.output?.output ||
            data.data?.output?.result ||
            data.data) ?? {};
        const contentForInfer =
          typeof output === "string"
            ? output
            : JSON.stringify(output, null, 2);
        const inferredFromContent = inferOutputType(contentForInfer);

        const finalOutputType = guessedFromIntent || inferredFromContent;
        setSelectedOutputType(finalOutputType);

        // 将期望输出类型同步回节点配置，方便画布节点使用
        if (currentNodeConfig && finalOutputType) {
          updateNode(debugNodeId, {
            config: {
              ...currentNodeConfig,
              expectedOutputType: finalOutputType,
            },
          });
        }

        // 存储结果到 store（增强结果结构，带上 outputType）
        updateNodeExecutionResult(debugNodeId, {
          ...(data.data as any),
          output,
          outputType: finalOutputType,
        });
        updateNodeExecutionStatus(debugNodeId, "completed");
        setIsOutputOpen(true);
      } else {
        const errorResult: DebugResult = {
          status: "error",
          output: {},
          error: data.error?.message || "调试失败",
          duration: 0,
          logs: ["[ERROR] 请求失败"],
        };
        updateNodeExecutionResult(debugNodeId, errorResult);
        updateNodeExecutionStatus(debugNodeId, "failed");
        setIsOutputOpen(true);
      }
    } catch (error) {
      const errorResult: DebugResult = {
        status: "error",
        output: {},
        error: error instanceof Error ? error.message : "调试请求失败",
        duration: 0,
        logs: [
          `[ERROR] ${error instanceof Error ? error.message : "未知错误"}`,
        ],
      };
      updateNodeExecutionResult(debugNodeId, errorResult);
      updateNodeExecutionStatus(debugNodeId, "failed");
      setIsOutputOpen(true);
    } finally {
      setIsRunning(false);
    }
  };

  const updateMockInput = (nodeName: string, field: string, value: string) => {
    setMockInputs((prev) => ({
      ...prev,
      [nodeName]: {
        ...prev[nodeName],
        [field]: value,
      },
    }));
  };

  // 注意：modality 状态的初始化已经在上面的 useEffect 中处理了（通过 prevDebugNodeIdRef 控制）
  // 这里不再需要额外的 useEffect 来同步 modality，避免多次重置导致用户选择丢失

  // Init Config Data
  // 使用 ref 来追踪是否正在进行 modality 切换，避免重复请求
  const isLoadingProvidersRef = useRef(false);

  useEffect(() => {
    if (isDebugPanelOpen && isProcessNode) {
      const config = debugNode?.data?.config as { modality?: ModelModality; model?: string; aiConfigId?: string } | undefined;
      const currentModel = config?.model;
      // PROCESS 调试面板固定使用文本模型进行提示词与工具编排，
      // 其他模态能力通过工具或专用节点实现，这里强制使用 text 模态加载模型。
      const currentModality: ModelModality = "text";

      // 避免重复请求
      if (isLoadingProvidersRef.current) return;
      isLoadingProvidersRef.current = true;

      // 节点切换时立即重置 providersModality，防止旧值干扰渲染
      setProvidersModality(null);
      setLoadingProviders(true);

      // Load Providers
      fetch(`/api/ai/providers?modality=${currentModality}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success) {
            const newProviders = data.data.providers || [];
            setProviders(newProviders);
            // providersModality 与当前使用的模态保持一致（固定为 text）
            setProvidersModality(currentModality);

            // 计算一个合适的默认模型：优先沿用当前模型（如果在列表中），否则使用默认文本模型
            const allModels = newProviders.flatMap((p: AIProviderConfig) => p.models);
            const defaultProvider = data.data.defaultProvider || newProviders[0];
            const defaultModel =
              defaultProvider?.defaultModel || (allModels.length > 0 ? allModels[0] : "");

            const nextModel =
              currentModel && allModels.includes(currentModel)
                ? currentModel
                : defaultModel;

            const updates: Record<string, unknown> = {};
            // 强制将节点的 modality 统一为 text
            if (config?.modality !== currentModality) {
              updates.modality = currentModality;
            }
            if (nextModel && nextModel !== currentModel) {
              updates.model = nextModel;
            }
            if (!config?.aiConfigId && defaultProvider?.id) {
              updates.aiConfigId = defaultProvider.id;
            }

            if (Object.keys(updates).length > 0) {
              handleConfigUpdate(updates);
            }
          }
        })
        .catch((err) => console.error(err))
        .finally(() => {
          setLoadingProviders(false);
          isLoadingProvidersRef.current = false;
        });

      // Load Knowledge Bases
      fetch("/api/knowledge-bases")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success) {
            setKnowledgeBases(data.data.knowledgeBases || []);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setLoadingKBs(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDebugPanelOpen, isProcessNode, debugNode?.id, selectedModality]);

  // Helper Config Handlers
  // 使用 nodesRef 而不是 nodes，确保在异步回调中能访问最新的节点数据
  const handleConfigUpdate = useCallback((updates: Record<string, unknown>) => {
    if (!debugNodeId) return;
    // 从 ref 中获取最新的节点数据，避免 stale closure 问题
    const currentNode = nodesRef.current.find((n) => n.id === debugNodeId);
    if (!currentNode) return;
    const currentConfig = currentNode.data.config || {};
    const newConfig = { ...currentConfig, ...updates };
    updateNode(debugNodeId, { config: newConfig });
  }, [debugNodeId, updateNode]);

  const processConfig = (debugNode?.data.config as Record<string, unknown>) || {};
  const knowledgeItems = useMemo(
    () => (processConfig.knowledgeItems as KnowledgeItem[]) || [],
    [processConfig.knowledgeItems],
  );
  const ragConfig = (processConfig.ragConfig as RAGConfig) || { topK: 5, threshold: 0.7 };

  const handleRAGConfigChange = (key: keyof RAGConfig, value: number) => {
    handleConfigUpdate({ ragConfig: { ...ragConfig, [key]: value } });
  };

  const addKnowledgeItem = () => {
    const newItem: KnowledgeItem = {
      id: `kb_${Date.now()}`,
      name: `知识库 ${knowledgeItems.length + 1}`,
      content: "",
    };
    handleConfigUpdate({ knowledgeItems: [...knowledgeItems, newItem] });
  };

  const updateKnowledgeItem = useCallback((
    index: number,
    updates: Partial<KnowledgeItem>,
  ) => {
    const newItems = [...knowledgeItems];
    newItems[index] = { ...newItems[index], ...updates };
    handleConfigUpdate({ knowledgeItems: newItems });
  }, [knowledgeItems, handleConfigUpdate]);

  const removeKnowledgeItem = (index: number) => {
    const newItems = knowledgeItems.filter((_: unknown, i: number) => i !== index);
    handleConfigUpdate({ knowledgeItems: newItems });
  };

  // 应用优化后的内容
  const handleApplyOptimizedContent = useCallback(
    (index: number) => {
      if (optimizedContent) {
        updateKnowledgeItem(index, { content: optimizedContent });
        setOptimizedContent(null);
        setIsRuleExpandOpen(false);
      }
    },
    [optimizedContent, updateKnowledgeItem],
  );

  // Handle download output (新增)
  const handleDownload = useCallback(() => {
    if (!result || !debugNode) return;

    const nodeName = (debugNode.data.name as string) || "output";
    const fileName = generateDownloadFileName(nodeName, selectedOutputType);

    let content: string;
    let mimeType: string;

    // Prepare content based on output type
    switch (selectedOutputType) {
      case "json":
        content = JSON.stringify(result.output, null, 2);
        mimeType = "application/json";
        break;
      case "html":
        content =
          typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output);
        mimeType = "text/html";
        break;
      case "csv":
        content =
          typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output);
        mimeType = "text/csv";
        break;
      default:
        content =
          typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output, null, 2);
        mimeType = "text/plain";
    }

    // Create and trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, debugNode, selectedOutputType]);

  // 面板关闭时渲染一个空的占位元素，用于 CSS transition
  if (!isDebugPanelOpen || !debugNode) {
    return (
      <div
        className="w-0 h-full border-l-0 transition-all duration-300 ease-in-out overflow-hidden"
        style={{ flexShrink: 0 }}
      />
    );
  }

  // 获取节点类型
  const nodeType = (debugNode.data.type as string)?.toUpperCase();

  // 获取当前配置
  const currentConfig =
    (debugNode.data.config as Record<string, unknown>) || {};

  // 处理输入节点配置更新
  const handleInputConfigUpdate = (config: Record<string, unknown>) => {
    updateNode(debugNodeId!, {
      config: { ...currentConfig, ...config },
    });
  };

  // 处理触发器配置更新
  const handleTriggerConfigUpdate = (
    triggerConfig: Partial<TriggerNodeConfigData>,
  ) => {
    const existingTriggerConfig =
      (currentConfig.triggerConfig as TriggerNodeConfigData) || {};
    updateNode(debugNodeId!, {
      config: {
        ...currentConfig,
        triggerConfig: {
          ...existingTriggerConfig,
          ...triggerConfig,
        },
      } as Record<string, unknown>,
    });
  };

  // 如果是输入节点，显示专用的调试面板
  if (nodeType === "INPUT") {
    return (
      <div
        ref={panelRef}
        className="h-full border-l bg-background shadow-lg flex flex-col overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          width: `${panelWidth}px`,
          flexShrink: 0,
        }}
      >
        {/* Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 transition-colors z-10"
          onMouseDown={() => setIsResizing(true)}
        />
        <InputNodeDebugPanel
          nodeId={debugNodeId!}
          nodeName={(debugNode.data.name as string) || "输入"}
          config={currentConfig}
          triggerConfig={currentConfig.triggerConfig as TriggerNodeConfigData}
          onConfigUpdate={handleInputConfigUpdate}
          onTriggerConfigUpdate={handleTriggerConfigUpdate}
          onClose={closeDebugPanel}
        />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="relative h-full border-l bg-background shadow-lg flex flex-col overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        width: `${panelWidth}px`,
        flexShrink: 0,
      }}
    >
      {/* Resize Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 transition-colors z-10"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3 bg-muted/10"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-3">
          {/* Drag Handle */}
          <div className="drag-handle cursor-move p-1 hover:bg-muted rounded">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="flex-1">
            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setEditedTitle((debugNode.data.name as string) || "");
                    setIsEditingTitle(false);
                  }
                }}
                className="font-semibold text-sm bg-transparent border-b border-primary outline-none w-full"
                autoFocus
              />
            ) : (
              <h2
                className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors"
                onClick={() => setIsEditingTitle(true)}
                title="点击编辑节点名称"
              >
                {debugNode.data.name as string}
              </h2>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={closeDebugPanel}
          className="h-8 w-8 rounded-full hover:bg-muted"
          title="收起面板"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div
        className="flex-1 bg-slate-50/50 overflow-y-auto"
        style={{
          height: "calc(100% - 73px)",
          scrollbarWidth: "thin",
          scrollbarColor: "#cbd5e1 transparent",
        }}
      >
        <div className="p-6 space-y-6 pb-12">
          {/* 1. Input Section - 文件导入 */}
          <Section
            title="输入数据"
            icon={ArrowRightFromLine}
            isOpen={isInputOpen}
            onOpenChange={setIsInputOpen}
            description={
              importedFiles.length > 0
                ? `已导入 ${importedFiles.length} 个文件`
                : undefined
            }
          >
            <div className="pt-2">
              <InputTabs
                activeTab={inputActiveTab}
                onTabChange={setInputActiveTab}
                importedFiles={importedFiles}
                onFilesChange={setImportedFiles}
                predecessorNodes={predecessorNodes as WorkflowNode[]}
                mockInputs={mockInputs}
                onMockInputChange={updateMockInput}
                nodeExecutionResults={nodeExecutionResults}
                processConfig={processConfig as any}
                onProcessConfigChange={(partial) =>
                  handleConfigUpdate(partial as Record<string, unknown>)
                }
                knowledgeBases={knowledgeBases}
                loadingKnowledgeBases={loadingKBs}
                ragConfig={ragConfig}
                onRAGConfigChange={handleRAGConfigChange}
                knowledgeItems={knowledgeItems}
                onAddKnowledgeItem={addKnowledgeItem}
                onUpdateKnowledgeItem={updateKnowledgeItem}
                onRemoveKnowledgeItem={removeKnowledgeItem}
              />
            </div>
          </Section>

          {isProcessNode && (
            <>
              {/* 2. AI Prompt + Model (AI提示词) */}
              <Section
                title="AI 处理器"
                icon={MessageSquare}
                isOpen={isPromptOpen}
                onOpenChange={setIsPromptOpen}
              >
                <div className="space-y-4 pt-2">
                  {/* Prompt Editor */}
                  <PromptTabContent
                    processConfig={{
                      systemPrompt: processConfig.systemPrompt as string | undefined,
                      userPrompt: processConfig.userPrompt as string | undefined,
                      tools: (processConfig.tools as any[]) || [],
                      expectedOutputType: processConfig.expectedOutputType as OutputType | undefined,
                    }}
                    modelSelection={
                      <div className="bg-muted/30 p-3 rounded-lg border space-y-3">
                        <div className="flex items-center gap-2">
                          <Settings className="h-3.5 w-3.5 text-primary" />
                          <Label className="text-xs font-medium">模型选择</Label>
                        </div>

                        {loadingProviders ? (
                          <div className="text-xs text-muted-foreground">
                            加载模型...
                          </div>
                        ) : providers.length === 0 ? (
                          <div className="text-xs text-muted-foreground py-2">
                            当前类别暂无可用模型
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(() => {
                              // 计算当前应该显示的模型值
                              const currentModel = processConfig.model as string;
                              const allModels = providers.flatMap(p => p.models);
                              // 找到第一个可用的默认模型
                              const defaultProvider = providers.find(p => p.defaultModel) || providers[0];
                              const defaultProviderModel = defaultProvider?.defaultModel || allModels[0];

                              // 计算当前节点应该使用的 modality
                              const nodeConfigModality = processConfig.modality as ModelModality | undefined;
                              const nodeModelModality = currentModel ? getModelModality(currentModel) : null;
                              const expectedModality = nodeConfigModality || nodeModelModality || DEFAULT_MODALITY;

                              // 关键检查：providers 是否与当前节点的 modality 匹配
                              // 如果不匹配（正在加载或节点刚切换），不要执行自动模型更新
                              const isModalityMatched = providersModality === expectedModality;

                              // 如果当前模型在列表中，使用当前模型；否则使用默认模型
                              const selectedValue = currentModel && allModels.includes(currentModel)
                                ? currentModel
                                : defaultProviderModel || allModels[0] || "";

                              // 只有当 modality 匹配时才自动更新模型
                              // 这防止了节点切换时用旧 providers 的默认模型覆盖当前模型
                              if (isModalityMatched && selectedValue && selectedValue !== currentModel) {
                                setTimeout(() => {
                                  handleConfigUpdate({ model: selectedValue });
                                }, 0);
                              }

                              return (
                                <select
                                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs h-8"
                                  value={selectedValue}
                                  onChange={(e) => {
                                    const newModel = e.target.value;
                                    // 自动检测模型的 modality 并同步更新
                                    const inferredModality = newModel ? getModelModality(newModel) : null;
                                    if (inferredModality && inferredModality !== selectedModality) {
                                      // 如果检测到的 modality 与当前不同，同步更新
                                      setSelectedModality(inferredModality);
                                      handleConfigUpdate({ model: newModel, modality: inferredModality });
                                    } else {
                                      handleConfigUpdate({ model: newModel });
                                    }
                                  }}
                                >
                                  {/* 显示当前模型类别下的所有可用模型 */}
                                  {providers.flatMap((provider) =>
                                    provider.models.map((m) => (
                                      <option key={`${provider.id}-${m}`} value={m}>
                                        {m}{" "}
                                        {m === provider.defaultModel ? "(默认)" : ""}
                                      </option>
                                    )),
                                  )}
                                </select>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    }
                    knowledgeItems={knowledgeItems}
                    onSystemPromptChange={(v) =>
                      handleConfigUpdate({ systemPrompt: v })
                    }
                    onUserPromptChange={(v) =>
                      handleConfigUpdate({ userPrompt: v })
                    }
                    onToolsChange={(tools) => {
                      // 检查是否有启用的工具
                      const hasEnabledTools = tools.some((tool: { enabled?: boolean }) => tool.enabled)
                      handleConfigUpdate({
                        tools,
                        enableToolCalling: hasEnabledTools
                      })
                    }}
                    onExpectedOutputTypeChange={(type) => {
                      handleConfigUpdate({ expectedOutputType: type })
                    }}
                  />
                </div>
              </Section>
            </>
          )}

          {/* 4. Output Section （合并处理过程，作为第二个 Tab） */}
          <Section
            title="输出结果"
            icon={FileJson}
            isOpen={isOutputOpen}
            onOpenChange={setIsOutputOpen}
            status={
              result?.status === "success"
                ? "success"
                : result?.status === "error"
                  ? "error"
                  : undefined
            }
          >
            <div className="space-y-4 pt-2">
              <Tabs defaultValue="run" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger
                    value="run"
                    className="flex items-center justify-center gap-2 text-xs"
                  >
                    <Play className="h-4 w-4" />
                    调试过程
                  </TabsTrigger>
                  <TabsTrigger
                    value="result"
                    className="flex items-center justify-center gap-2 text-xs"
                  >
                    <FileJson className="h-4 w-4" />
                    输出结果
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="run" className="mt-0 space-y-3">
                  <Button
                    onClick={handleRunDebug}
                    disabled={isNodeRunning}
                    className={cn(
                      "w-full transition-all duration-300",
                      isNodeRunning ? "bg-primary/80" : "hover:scale-[1.02]",
                    )}
                    size="lg"
                  >
                    {isNodeRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        正在执行...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        开始调试
                      </>
                    )}
                  </Button>

                  <div className="rounded-lg border bg-zinc-950 p-4 font-mono text-xs text-zinc-300 min-h-[120px] max-h-[300px] overflow-y-auto shadow-inner scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    {result?.logs && result.logs.length > 0 ? (
                      <div className="space-y-1.5">
                        {result.logs.map((log, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-zinc-600 select-none">{">"}</span>
                            <span className="break-all whitespace-pre-wrap">
                              {log}
                            </span>
                          </div>
                        ))}
                        {result?.status === "success" && (
                          <div className="flex gap-2 text-green-400 mt-2">
                            <span className="text-zinc-600 select-none">{">"}</span>
                            <span>Execution completed successfully.</span>
                          </div>
                        )}
                        {result?.status === "error" && (
                          <div className="flex gap-2 text-red-400 mt-2">
                            <span className="text-zinc-600 select-none">{">"}</span>
                            <span>Execution failed.</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic gap-2 min-h-[80px]">
                        <Terminal className="h-8 w-8 opacity-20" />
                        <span>等待执行...</span>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="result" className="mt-0 space-y-4">
                  {result ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-lg border p-3 flex items-center gap-3 shadow-sm">
                          <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <Clock className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                              耗时
                            </p>
                            <p className="text-sm font-semibold text-foreground">
                              {result.duration}ms
                            </p>
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border p-3 flex items-center gap-3 shadow-sm">
                          <div className="h-8 w-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                            <Cpu className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                              Tokens
                            </p>
                            <p className="text-sm font-semibold text-foreground">
                              {result.tokenUsage?.totalTokens || 0}
                            </p>
                          </div>
                        </div>
                      </div>

                      {result.error && (
                        <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-600 flex items-start gap-3">
                          <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-semibold">执行出错</p>
                            <p className="opacity-90">{result.error}</p>
                          </div>
                        </div>
                      )}

                      <div className="relative">
                        <ModalityOutputPreview
                          output={result.output}
                          className="mb-4"
                        />

                        {["text", "json", "html", "csv"].includes(
                          selectedOutputType,
                        ) && (
                          <>
                            {selectedOutputType === "html" ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>HTML 渲染预览</span>
                                </div>
                                <div
                                  className="rounded-lg border bg-white p-4 min-h-[100px] max-h-[300px] overflow-auto"
                                  dangerouslySetInnerHTML={{
                                    __html:
                                      typeof result.output === "string"
                                        ? result.output
                                        : JSON.stringify(result.output),
                                  }}
                                />
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>HTML 源码</span>
                                </div>
                                <pre className="rounded-lg border bg-white p-4 text-xs overflow-auto max-h-[200px] shadow-sm font-mono leading-relaxed scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                                  {typeof result.output === "string"
                                    ? result.output
                                    : JSON.stringify(result.output, null, 2)}
                                </pre>
                              </div>
                            ) : selectedOutputType === "csv" ? (
                              <div className="rounded-lg border bg-white overflow-auto max-h-[400px]">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {(() => {
                                      const csvContent =
                                        typeof result.output === "string"
                                          ? result.output
                                          : JSON.stringify(result.output);
                                      const rows = csvContent
                                        .split("\n")
                                        .filter((row) => row.trim());
                                      return rows.map((row, i) => (
                                        <tr
                                          key={i}
                                          className={
                                            i === 0
                                              ? "bg-muted/50 font-medium"
                                              : ""
                                          }
                                        >
                                          {row.split(",").map((cell, j) => (
                                            <td
                                              key={j}
                                              className="border px-2 py-1.5"
                                            >
                                              {cell.trim()}
                                            </td>
                                          ))}
                                        </tr>
                                      ));
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <pre className="rounded-lg border bg-white p-4 text-xs overflow-auto max-h-[400px] shadow-sm font-mono leading-relaxed scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                                {selectedOutputType === "json"
                                  ? JSON.stringify(result.output, null, 2)
                                  : typeof result.output === "string"
                                    ? result.output
                                    : JSON.stringify(result.output, null, 2)}
                              </pre>
                            )}
                            <div className="absolute top-3 right-3">
                              <Badge
                                variant="secondary"
                                className="text-[10px] opacity-70"
                              >
                                {selectedOutputType.toUpperCase()}
                              </Badge>
                            </div>
                          </>
                        )}

                        {[
                          "image",
                          "audio",
                          "video",
                          "word",
                          "pdf",
                          "excel",
                          "ppt",
                        ].includes(selectedOutputType) && (
                          <div className="rounded-lg border bg-muted/20 p-6 flex flex-col items-center justify-center">
                            {selectedOutputType === "image" && (
                              <>
                                <ImageIcon className="h-12 w-12 mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground mb-3">
                                  图片输出
                                </p>
                              </>
                            )}
                            {selectedOutputType === "audio" && (
                              <>
                                <Music className="h-12 w-12 mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground mb-3">
                                  音频输出
                                </p>
                              </>
                            )}
                            {selectedOutputType === "video" && (
                              <>
                                <Video className="h-12 w-12 mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground mb-3">
                                  视频输出
                                </p>
                              </>
                            )}
                            {["word", "pdf", "excel", "ppt"].includes(
                              selectedOutputType,
                            ) && (
                              <>
                                <FileJson className="h-12 w-12 mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground mb-3">
                                  {selectedOutputType === "word" && "Word 文档"}
                                  {selectedOutputType === "pdf" && "PDF 文档"}
                                  {selectedOutputType === "excel" && "Excel 表格"}
                                  {selectedOutputType === "ppt" && "PPT 演示文稿"}
                                </p>
                              </>
                            )}
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPreviewContent(
                                    JSON.stringify(result.output, null, 2),
                                  );
                                  setIsPreviewOpen(true);
                                }}
                                className="gap-1.5"
                              >
                                <Eye className="h-4 w-4" />
                                预览
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload()}
                                className="gap-1.5"
                              >
                                <Download className="h-4 w-4" />
                                下载
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {["text", "json", "html", "csv"].includes(
                        selectedOutputType,
                      ) && (
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload()}
                            className="gap-1.5"
                          >
                            <Download className="h-4 w-4" />
                            下载
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground bg-white/50 rounded-lg border border-dashed border-slate-200">
                      暂无输出结果
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </Section>

          {/* Preview Modal (新增) */}
          <PreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            outputType={selectedOutputType}
            content={previewContent}
            fileName={generateDownloadFileName(
              (debugNode?.data.name as string) || "output",
              selectedOutputType,
            )}
            onDownload={() => handleDownload()}
          />
        </div>
      </div>

      {/* 参考规则展开弹窗 */}
      {isRuleExpandOpen &&
        expandedRuleIndex !== null &&
        knowledgeItems[expandedRuleIndex] && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-8">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
              {/* 弹窗头部 */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold">编辑参考规则</h3>
                    <p className="text-xs text-muted-foreground">
                      {knowledgeItems[expandedRuleIndex].name || "未命名规则"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsRuleExpandOpen(false);
                    setExpandedRuleIndex(null);
                    setOptimizedContent(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* 弹窗内容 */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {/* 规则名称 */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">规则名称</Label>
                  <Input
                    value={knowledgeItems[expandedRuleIndex].name}
                    onChange={(e) =>
                      updateKnowledgeItem(expandedRuleIndex, {
                        name: e.target.value,
                      })
                    }
                    placeholder="输入规则名称..."
                  />
                </div>

                {/* 规则内容 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">规则内容</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleOptimizeRule(
                          expandedRuleIndex,
                          knowledgeItems[expandedRuleIndex].content,
                        )
                      }
                      disabled={
                        isOptimizingRule ||
                        !knowledgeItems[expandedRuleIndex].content
                      }
                      className="h-7 text-xs"
                    >
                      {isOptimizingRule ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          优化中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1 h-3 w-3" />
                          AI优化
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    className="min-h-[200px] text-sm resize-y"
                    placeholder="输入规则内容..."
                    value={knowledgeItems[expandedRuleIndex].content}
                    onChange={(e) =>
                      updateKnowledgeItem(expandedRuleIndex, {
                        content: e.target.value,
                      })
                    }
                  />
                </div>

                {/* AI优化结果 */}
                {optimizedContent && (
                  <div className="space-y-2 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium text-primary">
                          AI优化建议
                        </Label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOptimizedContent(null)}
                          className="h-7 text-xs"
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleApplyOptimizedContent(expandedRuleIndex)
                          }
                          className="h-7 text-xs"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          采用此版本
                        </Button>
                      </div>
                    </div>
                    <div className="bg-white rounded-md p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto border">
                      {optimizedContent}
                    </div>
                  </div>
                )}
              </div>

              {/* 弹窗底部 */}
              <div className="border-t px-6 py-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsRuleExpandOpen(false);
                    setExpandedRuleIndex(null);
                    setOptimizedContent(null);
                  }}
                >
                  关闭
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

// Reusable Section Component
function Section({
  title,
  icon: Icon,
  children,
  isOpen,
  onOpenChange,
  description,
  status,
  disabled = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
  status?: "idle" | "running" | "success" | "completed" | "error";
  disabled?: boolean;
}) {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className={cn(
        "bg-white rounded-xl border transition-all duration-200 shadow-sm",
        isOpen
          ? "ring-1 ring-primary/5 border-primary/20"
          : "hover:border-primary/20",
        disabled && "opacity-50 pointer-events-none grayscale",
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 cursor-pointer group select-none">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
              isOpen
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-left">
            <h3
              className={cn(
                "font-medium text-sm transition-colors",
                isOpen ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {title}
            </h3>
            {description && !isOpen && (
              <p className="text-xs text-muted-foreground/60 truncate max-w-[200px] animate-in fade-in slide-in-from-left-2">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === "running" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === "success" && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              !isOpen && "-rotate-90",
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="pt-2 border-t border-slate-100">{children}</div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
