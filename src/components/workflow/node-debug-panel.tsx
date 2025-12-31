"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
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
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/stores/workflow-store";
import { PromptTabContent } from "./node-config-panel/shared/prompt-tab-content";
import { InputTabs, type WorkflowNode } from "./debug-panel/input-tabs";
import {
  ModalitySelector,
  DEFAULT_MODALITY,
} from "./debug-panel/modality-selector";
import { InputNodeDebugPanel } from "./input-debug-panel";
import { OutputTypeSelector } from "./debug-panel/output-type-selector";
import { PreviewModal } from "./debug-panel/preview-modal";
import type { KnowledgeItem, RAGConfig } from "@/types/workflow";
import type { AIProviderConfig } from "./node-config-panel/shared/types";
import type {
  InputTabType,
  ImportedFile,
  OutputType,
} from "@/lib/workflow/debug-panel/types";
import type { ModelModality } from "@/lib/ai/types";
import { generateDownloadFileName } from "@/lib/workflow/debug-panel/utils";
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
    useState<InputTabType>("upstream-data");
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);

  // Model modality state (新增)
  const [selectedModality, setSelectedModality] =
    useState<ModelModality>(DEFAULT_MODALITY);

  // Output type and preview state (新增)
  const [selectedOutputType, setSelectedOutputType] =
    useState<OutputType>("json");
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

  // 处理拖动
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStartRef.current.x;
        const newY = e.clientY - dragStartRef.current.y;
        setPanelPosition({ x: newX, y: newY });
      }
      if (isResizing) {
        const newWidth = Math.max(
          400,
          Math.min(800, window.innerWidth - e.clientX - panelPosition.x),
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
  }, [isDragging, isResizing, panelPosition.x]);

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

  // Reset state when node changes
  useEffect(() => {
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
    // 注意：不再清除执行结果，保持结果持久化
    // 只重置 UI 状态
    setIsInputOpen(false);
    setIsProcessOpen(false);
    // 如果当前节点有执行结果，自动展开输出区域
    const currentNodeResult = debugNodeId ? nodeExecutionResults?.[debugNodeId] : null;
    setIsOutputOpen(!!currentNodeResult);
    // Reset new state variables
    setInputActiveTab("upstream-data");
    setImportedFiles([]);

    // 从节点配置中读取 modality（优先从模型推断）
    const currentNode = nodes.find((n) => n.id === debugNodeId);
    const nodeConfig = currentNode?.data?.config as { modality?: ModelModality; model?: string } | undefined;
    const configModel = nodeConfig?.model;
    const configModality = nodeConfig?.modality;

    let targetModality: ModelModality = DEFAULT_MODALITY;
    if (configModel) {
      const inferredModality = getModelModality(configModel);
      if (inferredModality) {
        targetModality = inferredModality;
      }
    } else if (configModality) {
      targetModality = configModality;
    }
    setSelectedModality(targetModality);

    // 根据 modality 设置默认输出类型
    const modalityToOutputType: Record<ModelModality, OutputType> = {
      'text': 'json',
      'code': 'json',
      'image-gen': 'image',
      'video-gen': 'video',
      'audio-transcription': 'text',
      'audio-tts': 'audio',
      'embedding': 'json',
      'ocr': 'text',
    };
    setSelectedOutputType(modalityToOutputType[targetModality] || 'json');

    setIsPreviewOpen(false);
    setPreviewContent(null);
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
            importedFiles: importedFiles.map(f => ({
              name: f.name,
              content: typeof f.content === 'string' ? f.content : '[Binary Content]',
              type: f.type
            })),
            // 传递当前节点配置，让后端使用最新的配置
            nodeConfig: currentNodeConfig,
          }),
        },
      );

      const data = await response.json();

      if (data.success) {
        // 存储结果到 store
        updateNodeExecutionResult(debugNodeId, data.data);
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

  // 当节点变化时，同步 modality 状态（优先从模型推断，其次使用配置值）
  useEffect(() => {
    if (debugNode) {
      const config = debugNode.data?.config as { modality?: ModelModality; model?: string } | undefined;
      const configModel = config?.model;
      const configModality = config?.modality;

      // 优先根据已选模型推断 modality
      let targetModality = DEFAULT_MODALITY;
      if (configModel) {
        const inferredModality = getModelModality(configModel);
        if (inferredModality) {
          targetModality = inferredModality;
        }
      } else if (configModality) {
        targetModality = configModality;
      }

      if (targetModality !== selectedModality) {
        setSelectedModality(targetModality);
        // 如果推断出的 modality 与配置不一致，更新配置
        if (configModality !== targetModality) {
          handleConfigUpdate({ modality: targetModality });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugNode?.id]);

  // Init Config Data
  useEffect(() => {
    if (isDebugPanelOpen && isProcessNode) {
      // 使用当前选中的 modality 加载模型
      const config = debugNode?.data?.config as { modality?: ModelModality; model?: string } | undefined;
      const currentModality = config?.modality || selectedModality;
      const currentModel = config?.model;

      // Load Providers
      fetch(`/api/ai/providers?modality=${currentModality}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success) {
            const newProviders = data.data.providers || [];
            setProviders(newProviders);

            // 检查当前选中的模型是否属于该类别
            // 如果不属于，自动切换到默认模型
            if (currentModel) {
              const allModelsInProviders = newProviders.flatMap((p: { models: string[] }) => p.models);
              if (!allModelsInProviders.includes(currentModel)) {
                // 当前模型不在该类别中，需要更新为默认模型
                const defaultProvider = newProviders[0];
                if (defaultProvider?.defaultModel) {
                  handleConfigUpdate({
                    model: defaultProvider.defaultModel,
                    aiConfigId: defaultProvider.id,
                  });
                  console.log(`[NodeDebugPanel] 模型 "${currentModel}" 不属于类别 "${currentModality}"，已自动切换到 "${defaultProvider.defaultModel}"`);
                }
              }
            }
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setLoadingProviders(false));

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
  const handleConfigUpdate = useCallback((updates: Record<string, unknown>) => {
    if (!debugNode) return;
    const currentConfig = debugNode.data.config || {};
    updateNode(debugNode.id, { config: { ...currentConfig, ...updates } });
  }, [debugNode, updateNode]);

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

  if (!isDebugPanelOpen || !debugNode) {
    return null;
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
        className="fixed top-0 h-full border-l bg-background shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
        style={{
          width: `${panelWidth}px`,
          right: -panelPosition.x,
          top: panelPosition.y,
        }}
      >
        {/* Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 transition-colors"
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
      className="fixed top-0 h-full border-l bg-background shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
      style={{
        width: `${panelWidth}px`,
        right: -panelPosition.x,
        top: panelPosition.y,
      }}
    >
      {/* Resize Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/20 transition-colors"
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
        >
          <X className="h-4 w-4" />
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
                : "点击导入文件"
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
              />
            </div>
          </Section>

          {isProcessNode && (
            <>
              {/* 2. Reference Materials (参照材料) */}
              <Section
                title="参照材料"
                icon={BookOpen}
                isOpen={isReferenceOpen}
                onOpenChange={setIsReferenceOpen}
                description={`${knowledgeItems.length + (processConfig.knowledgeBaseId ? 1 : 0)} 个引用源`}
              >
                <div className="space-y-6 pt-2">
                  {/* RAG Knowledge Base */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-medium">RAG 知识库</Label>
                    </div>

                    {loadingKBs ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加载知识库...
                      </div>
                    ) : (
                      <>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={(processConfig.knowledgeBaseId as string) || ""}
                          onChange={(e) =>
                            handleConfigUpdate({
                              knowledgeBaseId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">不使用知识库</option>
                          {knowledgeBases
                            .filter((kb) => kb.isActive)
                            .map((kb) => (
                              <option key={kb.id} value={kb.id}>
                                {kb.name} ({kb.documentCount} 文档)
                              </option>
                            ))}
                        </select>

                        {/* Config Area for Selected KB */}
                        {processConfig.knowledgeBaseId && (
                          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs">
                                  检索数量 (Top K)
                                </Label>
                                <span className="text-xs text-muted-foreground">
                                  {ragConfig.topK}
                                </span>
                              </div>
                              <Slider
                                value={[ragConfig.topK || 5]}
                                onValueChange={([v]) =>
                                  handleRAGConfigChange("topK", v)
                                }
                                min={1}
                                max={20}
                                step={1}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs">相似度阈值</Label>
                                <span className="text-xs text-muted-foreground">
                                  {(ragConfig.threshold || 0.7).toFixed(2)}
                                </span>
                              </div>
                              <Slider
                                value={[ragConfig.threshold || 0.7]}
                                onValueChange={([v]) =>
                                  handleRAGConfigChange("threshold", v)
                                }
                                min={0}
                                max={1}
                                step={0.05}
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="border-t pt-4" />

                  {/* 参考规则 (原静态知识) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium">参考规则</Label>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addKnowledgeItem}
                        className="h-7 text-xs"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        添加
                      </Button>
                    </div>

                    {knowledgeItems.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground border-2 border-dashed rounded-lg text-xs">
                        暂无参考规则
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {knowledgeItems.map(
                          (item: KnowledgeItem, index: number) => (
                            <div
                              key={item.id}
                              className="border rounded-lg p-3 space-y-2 bg-white/50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Input
                                  value={item.name}
                                  onChange={(e) =>
                                    updateKnowledgeItem(index, {
                                      name: e.target.value,
                                    })
                                  }
                                  className="h-7 text-xs font-medium flex-1"
                                  placeholder="规则名称"
                                />
                                <div className="flex items-center gap-1">
                                  {/* AI优化按钮 */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                                    onClick={() => {
                                      setExpandedRuleIndex(index);
                                      setIsRuleExpandOpen(true);
                                      if (item.content) {
                                        handleOptimizeRule(index, item.content);
                                      }
                                    }}
                                    title="AI优化"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                  </Button>
                                  {/* 展开按钮 */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                                    onClick={() => {
                                      setExpandedRuleIndex(index);
                                      setIsRuleExpandOpen(true);
                                    }}
                                    title="展开查看"
                                  >
                                    <Expand className="h-3.5 w-3.5" />
                                  </Button>
                                  {/* 删除按钮 */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-red-500"
                                    onClick={() => removeKnowledgeItem(index)}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="relative">
                                <Textarea
                                  className="text-xs overflow-y-auto resize-y"
                                  placeholder="输入规则内容..."
                                  value={item.content}
                                  onChange={(e) =>
                                    updateKnowledgeItem(index, {
                                      content: e.target.value,
                                    })
                                  }
                                  style={{
                                    scrollbarWidth: "thin",
                                    height: "120px",
                                    minHeight: "80px",
                                    maxHeight: "400px",
                                  }}
                                />
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              {/* 3. AI Prompt + Model (AI提示词) */}
              <Section
                title="AI 提示词"
                icon={MessageSquare}
                isOpen={isPromptOpen}
                onOpenChange={setIsPromptOpen}
              >
                <div className="space-y-4 pt-2">
                  {/* Model Modality Selection (新增) */}
                  <ModalitySelector
                    selectedModality={selectedModality}
                    onModalityChange={(modality) => {
                      setSelectedModality(modality);
                      // 更新配置中的模型类别
                      handleConfigUpdate({ modality });

                      // 根据 modality 自动设置适当的输出类型
                      const modalityToOutputType: Record<ModelModality, OutputType> = {
                        'text': 'json',
                        'code': 'json',
                        'image-gen': 'image',
                        'video-gen': 'video',
                        'audio-transcription': 'text',
                        'audio-tts': 'audio',
                        'embedding': 'json',
                        'ocr': 'text',
                      };
                      const defaultOutputType = modalityToOutputType[modality] || 'json';
                      setSelectedOutputType(defaultOutputType);

                      // 重新加载该类别的模型列表
                      setLoadingProviders(true);
                      fetch(`/api/ai/providers?modality=${modality}`)
                        .then((res) => (res.ok ? res.json() : null))
                        .then((data) => {
                          if (data?.success) {
                            const newProviders = data.data.providers || [];
                            setProviders(newProviders);
                            // 自动选择该类别的默认模型
                            if (newProviders.length > 0) {
                              const defaultProvider = newProviders[0];
                              if (defaultProvider.defaultModel) {
                                handleConfigUpdate({
                                  model: defaultProvider.defaultModel,
                                  aiConfigId: defaultProvider.id,
                                });
                              }
                            }
                          }
                        })
                        .catch((err) => console.error(err))
                        .finally(() => setLoadingProviders(false));
                    }}
                    className="mb-2"
                  />

                  {/* Model Selection (Hidden Provider) */}
                  <div className="bg-muted/30 p-3 rounded-lg border space-y-3">
                    <div className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5 text-primary" />
                      <Label className="text-xs font-medium">模型配置</Label>
                    </div>

                    {loadingProviders ? (
                      <div className="text-xs text-muted-foreground">
                        加载模型...
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs h-8"
                          value={(processConfig.model as string) || ""}
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
                          <option value="">选择模型...</option>
                          {/* 显示当前模型类别下的所有可用模型 */}
                          {providers.length > 0 ? (
                            providers.flatMap((provider) =>
                              provider.models.map((m) => (
                                <option key={`${provider.id}-${m}`} value={m}>
                                  {m}{" "}
                                  {m === provider.defaultModel ? "(默认)" : ""}
                                </option>
                              )),
                            )
                          ) : (
                            <option value="" disabled>
                              当前类别暂无可用模型
                            </option>
                          )}
                        </select>
                        <p className="text-[10px] text-muted-foreground">
                          * 当前类别:{" "}
                          {selectedModality === "text"
                            ? "文本类"
                            : selectedModality === "code"
                              ? "代码类"
                              : selectedModality === "image-gen"
                                ? "图片生成"
                                : selectedModality === "video-gen"
                                  ? "视频生成"
                                  : selectedModality === "audio-transcription"
                                    ? "音频转录"
                                    : selectedModality === "audio-tts"
                                      ? "文字转语音"
                                      : selectedModality === "embedding"
                                        ? "向量嵌入"
                                        : selectedModality === "ocr"
                                          ? "图文识别"
                                          : selectedModality}
                        </p>
                        {/* 非文本类模型的警告提示 */}
                        {(selectedModality === "image-gen" ||
                          selectedModality === "video-gen" ||
                          selectedModality === "audio-tts") && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                            <p className="text-[10px] text-amber-700">
                              ⚠️ {selectedModality === "image-gen" ? "图片生成" : selectedModality === "video-gen" ? "视频生成" : "语音合成"}模型暂不支持标准处理流程，请确保您的提示词格式正确。
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Prompt Editor */}
                  <PromptTabContent
                    processConfig={{
                      systemPrompt: processConfig.systemPrompt as string | undefined,
                      userPrompt: processConfig.userPrompt as string | undefined,
                      tools: (processConfig.tools as any[]) || [],
                    }}
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
                  />
                </div>
              </Section>
            </>
          )}

          {/* 4. Processing Section (Formerly 2) */}
          <Section
            title="处理过程"
            icon={Terminal}
            isOpen={isProcessOpen}
            onOpenChange={setIsProcessOpen}
            status={isNodeRunning ? "running" : result ? "completed" : "idle"}
          >
            <div className="space-y-4 pt-2">
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

              {/* Logs / Terminal View */}
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
            </div>
          </Section>

          {/* 5. Output Section (Formerly 3) - 增强版 */}
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
              {/* Output Type Selector - 始终显示 */}
              <OutputTypeSelector
                selectedType={selectedOutputType}
                onTypeChange={(type) => {
                  setSelectedOutputType(type);
                  // 根据输出类型准备预览内容
                  if (result?.output) {
                    const outputStr = JSON.stringify(result.output, null, 2);
                    setPreviewContent(outputStr);
                  }
                }}
              />

              {result ? (
                <>
                  {/* Metrics */}
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

                  {/* Error Message */}
                  {result.error && (
                    <div className="rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-600 flex items-start gap-3">
                      <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold">执行出错</p>
                        <p className="opacity-90">{result.error}</p>
                      </div>
                    </div>
                  )}

                  {/* Output Content Display */}
                  <div className="relative">
                    {/* 文字类输出展示 */}
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
                                          i === 0 ? "bg-muted/50 font-medium" : ""
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

                    {/* 非文字类输出展示 */}
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

                  {/* Download Button for text types */}
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
