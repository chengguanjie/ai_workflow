"use client";

/**
 * 工作流执行面板
 * 用于执行工作流并展示结果
 * 支持两种模式：执行模式 / 测试模式
 */

import { useState, useCallback, useEffect, useRef } from "react";
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
  Play,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Clock,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FlaskConical,
  Radio,
  StopCircle,
  Upload,
  Image as ImageIcon,
  FileSpreadsheet,
  Music,
  Video,
  Trash2,
  List,
  ListChecks,
  Minimize2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import type { InputFieldType } from "@/types/workflow";
import { toast } from "sonner";
import { useWorkflowStore } from "@/stores/workflow-store";
import { ExecutionFeedbackDialog } from "./execution-feedback-dialog";
import {
  useExecutionStream,
  type ExecutionProgressEvent,
} from "@/hooks/use-execution-stream";
import { cn } from "@/lib/utils";

// 执行模式类型
type ExecutionMode = "execute" | "test";

// 节点执行状态
type NodeExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

// 单个节点的执行信息
interface NodeExecutionInfo {
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

interface ExecutionResult {
  status: "COMPLETED" | "FAILED" | "RUNNING";
  output?: Record<string, unknown>;
  error?: string;
  duration?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  executionId?: string;
  outputFiles?: Array<{
    id: string;
    fileName: string;
    format: string;
    url: string;
    size: number;
  }>;
}

interface ExecutionPanelProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
  initialMode?: ExecutionMode;
  onNodeStatusChange?: (nodeId: string, status: NodeExecutionStatus) => void;
  onMinimize?: () => void;
}

export function ExecutionPanel({
  workflowId,
  isOpen,
  onClose,
  initialMode = "execute",
  onNodeStatusChange,
  onMinimize,
}: ExecutionPanelProps) {
  // 执行模式
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>(initialMode);

  // 通用状态
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showInputs, setShowInputs] = useState(true);
  // 文件上传状态: { fieldName: { uploading: boolean, file?: { name, url, size, mimeType } } }
  const [fileUploads, setFileUploads] = useState<
    Record<
      string,
      {
        uploading: boolean;
        file?: {
          name: string;
          url: string;
          size: number;
          mimeType: string;
        };
      }
    >
  >({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [showOutput, setShowOutput] = useState(true);
  const [asyncMode, setAsyncMode] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollInFlightRef = useRef(false);

  // AI 测试数据生成状态
  const [isGeneratingTestData, setIsGeneratingTestData] = useState(false);
  const [isAIGeneratedInput, setIsAIGeneratedInput] = useState(false);
  const [aiGenerationWarnings, setAiGenerationWarnings] = useState<string[]>([]);

  // 实时监控模式状态
  const [testModeStatus, setTestModeStatus] = useState<
    "idle" | "running" | "completed" | "failed"
  >("idle");
  const [nodeStates, setNodeStates] = useState<Map<string, NodeExecutionInfo>>(
    new Map(),
  );
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [showNodeDetails, setShowNodeDetails] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const executionIdRef = useRef<string | null>(null);
  const pollTaskStatusMonitorRef = useRef<() => Promise<void>>(() =>
    Promise.resolve(),
  );

  const {
    nodes,
    edges,
    setActiveExecution,
    clearNodeExecutionStatus,
    updateNodeExecutionStatusSafe,
  } = useWorkflowStore();

  // 使用 ref 存储回调函数，避免回调变化导致依赖链重新创建
  // 这是解决 "Maximum update depth exceeded" 错误的关键
  const onNodeStatusChangeRef = useRef(onNodeStatusChange);
  useEffect(() => {
    onNodeStatusChangeRef.current = onNodeStatusChange;
  }, [onNodeStatusChange]);

  // emitNodeStatus 使用 ref 访问回调，保持稳定的函数引用
  const emitNodeStatus = useCallback(
    (nodeId: string, status: NodeExecutionStatus) => {
      updateNodeExecutionStatusSafe(nodeId, status);
      onNodeStatusChangeRef.current?.(nodeId, status);
    },
    [updateNodeExecutionStatusSafe],
  );

  // 字段类型对应的 accept 属性
  const FIELD_TYPE_ACCEPT: Record<string, string> = {
    image: "image/*",
    pdf: ".pdf,application/pdf",
    word: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    excel:
      ".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv",
    audio: "audio/*",
    video: "video/*",
  };

  // 字段类型对应的图标
  const getFieldTypeIcon = (fieldType: InputFieldType) => {
    switch (fieldType) {
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      case "pdf":
        return <FileText className="h-4 w-4" />;
      case "word":
        return <FileText className="h-4 w-4" />;
      case "excel":
        return <FileSpreadsheet className="h-4 w-4" />;
      case "audio":
        return <Music className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "select":
        return <List className="h-4 w-4" />;
      case "multiselect":
        return <ListChecks className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // 字段类型对应的标签
  const getFieldTypeLabel = (fieldType: InputFieldType) => {
    const labels: Record<InputFieldType, string> = {
      text: "文本",
      image: "图片",
      pdf: "PDF",
      word: "Word",
      excel: "Excel",
      audio: "音频",
      video: "视频",
      select: "单选",
      multiselect: "多选",
    };
    return labels[fieldType] || "文件";
  };

  // 获取输入节点的字段
  const inputFields: Array<{
    nodeId: string;
    nodeName: string;
    fieldId: string;
    fieldName: string;
    fieldType: InputFieldType;
    defaultValue: string;
    options?: Array<{ label: string; value: string }>;
  }> = nodes
    .filter((node) => node.data?.type === "INPUT")
    .flatMap((node) => {
      const fields =
        (
          node.data?.config as {
            fields?: Array<{
              id: string;
              name: string;
              value: string;
              fieldType?: InputFieldType;
              options?: Array<{ label: string; value: string }>;
            }>;
          }
        )?.fields || [];
      return fields.map((field) => ({
        nodeId: node.id,
        nodeName: String(node.data?.name || "输入"),
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.fieldType || "text",
        defaultValue: field.value || "",
        options: field.options,
      }));
    });

  // 文件上传处理函数
  const handleFileUpload = useCallback(
    async (fieldName: string, fieldType: InputFieldType, file: File) => {
      setFileUploads((prev) => ({
        ...prev,
        [fieldName]: { uploading: true },
      }));

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fieldType", fieldType);

        const response = await fetch("/api/files/temp", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "上传失败");
        }

        setFileUploads((prev) => ({
          ...prev,
          [fieldName]: {
            uploading: false,
            file: {
              name: data.data.fileName,
              url: data.data.url,
              size: data.data.size,
              mimeType: data.data.mimeType,
            },
          },
        }));

        // 将文件 URL 存入 inputValues
        setInputValues((prev) => ({
          ...prev,
          [fieldName]: data.data.url,
        }));

        toast.success("文件上传成功");
      } catch (error) {
        setFileUploads((prev) => ({
          ...prev,
          [fieldName]: { uploading: false },
        }));
        toast.error(error instanceof Error ? error.message : "上传失败");
      }
    },
    [],
  );

  // 删除已上传的文件
  const handleRemoveFile = useCallback((fieldName: string) => {
    setFileUploads((prev) => {
      const newState = { ...prev };
      delete newState[fieldName];
      return newState;
    });
    setInputValues((prev) => ({
      ...prev,
      [fieldName]: "",
    }));
  }, []);

  // 格式化文件大小
  const formatUploadSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 初始化输入值
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      inputFields.forEach((field) => {
        initial[field.fieldName] = field.defaultValue;
      });
      setInputValues(initial);
      setFileUploads({}); // 重置文件上传状态
      setResult(null);
      setTaskId(null);
      setExecutionError(null);
      setExecutionMode(initialMode);
      
      // 重置 AI 生成状态
      setIsGeneratingTestData(false);
      setIsAIGeneratedInput(false);
      setAiGenerationWarnings([]);

      // 监控模式：初始化节点状态
      const nodeMap = new Map<string, NodeExecutionInfo>();
      nodes.forEach((node) => {
        nodeMap.set(node.id, {
          nodeId: node.id,
          nodeName: String(node.data?.name || node.id),
          nodeType: String(node.data?.type || "UNKNOWN"),
          status: "pending",
        });
      });
      setNodeStates(nodeMap);
      setTestModeStatus("idle");
      setCurrentNodeId(null);
    }
  }, [isOpen, initialMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 使用 ref 存储 emitNodeStatus，避免 updateNodeStatus 的依赖变化
  const emitNodeStatusRef = useRef(emitNodeStatus);
  useEffect(() => {
    emitNodeStatusRef.current = emitNodeStatus;
  }, [emitNodeStatus]);

  // 更新节点状态（监控模式）- 使用 ref 访问 emitNodeStatus，保持稳定引用
  const updateNodeStatus = useCallback(
    (nodeId: string, update: Partial<NodeExecutionInfo>) => {
      setNodeStates((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(nodeId);
        if (existing) {
          newMap.set(nodeId, { ...existing, ...update });
        }
        return newMap;
      });
      if (update.status) {
        emitNodeStatusRef.current(nodeId, update.status);
      }
    },
    [], // 不依赖 emitNodeStatus，通过 ref 访问
  );

  // 使用 ref 存储 updateNodeStatus，避免 handleSSEEvent 的依赖变化
  const updateNodeStatusRef = useRef(updateNodeStatus);
  useEffect(() => {
    updateNodeStatusRef.current = updateNodeStatus;
  }, [updateNodeStatus]);

  // 处理 SSE 事件 - 使用 ref 访问 updateNodeStatus，保持稳定引用
  const handleSSEEvent = useCallback(
    (event: ExecutionProgressEvent) => {
      if (event.nodeId) {
        setCurrentNodeId(event.nodeId);
        if (event.type === "node_start") {
          updateNodeStatusRef.current(event.nodeId, {
            status: "running",
            startedAt: event.timestamp,
          });
        } else if (event.type === "node_complete") {
          updateNodeStatusRef.current(event.nodeId, {
            status: "completed",
            completedAt: event.timestamp,
            output: event.output,
          });
        } else if (event.type === "node_error") {
          updateNodeStatusRef.current(event.nodeId, {
            status: "failed",
            completedAt: event.timestamp,
            error: event.error,
          });
        }
      }
    },
    [], // 不依赖 updateNodeStatus，通过 ref 访问
  );

  // 处理 SSE 完成
  const handleSSEComplete = useCallback((_event: ExecutionProgressEvent) => {
    setIsExecuting(false);
    setTestModeStatus("completed");
    setCurrentNodeId(null);
    setSseConnected(false);
    toast.success("工作流执行完成");
  }, []);

  // 处理 SSE 错误（回退到轮询执行详情）
  const handleSSEError = useCallback((error: string) => {
    console.warn(
      "SSE error, falling back to polling execution details:",
      error,
    );
    setSseConnected(false);
    // SSE 不可用时，通过轮询执行详情来获取节点进度
    // 轮询逻辑在 pollTaskStatusMonitor 中处理
  }, []);

  // SSE Hook
  const {
    connect: connectSSE,
    disconnect: disconnectSSE,
    isConnected,
  } = useExecutionStream({
    onEvent: handleSSEEvent,
    onComplete: handleSSEComplete,
    onError: handleSSEError,
    enabled: executionMode === "test",
  });

  // 更新 SSE 连接状态
  useEffect(() => {
    setSseConnected(isConnected);
  }, [isConnected]);

  // 轮询任务状态（测试模式专用）- 使用 ref 访问 updateNodeStatus，保持稳定引用
  const pollTaskStatusMonitor = useCallback(async () => {
    const tid = taskIdRef.current;
    if (!tid) return;
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;

    try {
      const response = await fetch(`/api/tasks/${tid}`);

      if (response.status === 404) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsExecuting(false);
        setTestModeStatus("failed");
        toast.error("任务不存在或已过期");
        return;
      }

      if (!response.ok) {
        // 避免因限流/偶发错误刷屏
        return;
      }

      const responseData = await response.json();
      // API 返回格式: { success: true, data: { ... } }
      const data = responseData.data || responseData;

      // 如果获取到 executionId，尝试连接 SSE 或轮询执行详情
      if (data.execution?.id) {
        const execId = data.execution.id;

        // 如果是新的 executionId，尝试连接 SSE
        if (!executionIdRef.current) {
          executionIdRef.current = execId;
          // 尝试连接 SSE（如果失败会回退到轮询）
          connectSSE(execId);
        }

        // 如果 SSE 未连接，通过轮询执行详情获取节点进度
        if (!isConnected) {
          const execResponse = await fetch(`/api/executions/${execId}`);
          if (execResponse.ok) {
            const execData = await execResponse.json();
            const execution = execData.execution;

            // 用执行日志更新节点状态
            if (execution?.logs && Array.isArray(execution.logs)) {
              execution.logs.forEach(
                (log: {
                  nodeId: string;
                  nodeName: string;
                  nodeType: string;
                  status: string;
                  output?: Record<string, unknown>;
                  error?: string;
                  duration?: number;
                  promptTokens?: number;
                  completionTokens?: number;
                  startedAt?: string;
                  completedAt?: string;
                }) => {
                  updateNodeStatusRef.current(log.nodeId, {
                    nodeName: log.nodeName,
                    nodeType: log.nodeType,
                    status:
                      log.status === "COMPLETED"
                        ? "completed"
                        : log.status === "FAILED"
                          ? "failed"
                          : "running",
                    output: log.output,
                    error: log.error || undefined,
                    duration: log.duration || undefined,
                    promptTokens: log.promptTokens || undefined,
                    completionTokens: log.completionTokens || undefined,
                    startedAt: log.startedAt,
                    completedAt: log.completedAt,
                  });
                },
              );
            }

            // 检查执行状态
            if (
              execution?.status === "COMPLETED" ||
              execution?.status === "FAILED"
            ) {
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
              disconnectSSE();
              setIsExecuting(false);
              setTestModeStatus(
                execution.status === "COMPLETED" ? "completed" : "failed",
              );
              setCurrentNodeId(null);

              if (execution.status === "COMPLETED") {
                toast.success("工作流执行完成");
              } else {
                toast.error(execution.error || "工作流执行失败");
              }
              return;
            }
          }
        }
      }

      // 更新节点状态（轮询模式下使用）
      if (data.result?.nodeResults) {
        data.result.nodeResults.forEach(
          (nodeResult: {
            nodeId: string;
            status: string;
            output?: Record<string, unknown>;
            error?: string;
            duration?: number;
            tokenUsage?: { promptTokens: number; completionTokens: number };
            startedAt?: string;
            completedAt?: string;
          }) => {
            updateNodeStatusRef.current(nodeResult.nodeId, {
              status: nodeResult.status === "success" ? "completed" : "failed",
              output: nodeResult.output,
              error: nodeResult.error,
              duration: nodeResult.duration,
              promptTokens: nodeResult.tokenUsage?.promptTokens,
              completionTokens: nodeResult.tokenUsage?.completionTokens,
              startedAt: nodeResult.startedAt,
              completedAt: nodeResult.completedAt,
            });
          },
        );
      }

      if (data.currentNodeId) {
        setCurrentNodeId(data.currentNodeId);
        updateNodeStatusRef.current(data.currentNodeId, { status: "running" });
      }

      if (data.status === "completed" || data.status === "failed") {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        disconnectSSE();
        setIsExecuting(false);
        setTestModeStatus(data.status === "completed" ? "completed" : "failed");
        setCurrentNodeId(null);

        if (data.status === "completed") {
          toast.success("工作流执行完成");
        } else {
          toast.error(data.error || "工作流执行失败");
        }
      }
    } catch (error) {
      // 静默处理轮询错误，避免打断用户操作
      if (error instanceof Error && error.message !== "Failed to fetch") {
        console.warn("Poll task status warning:", error.message);
      }
    } finally {
      pollInFlightRef.current = false;
    }
  }, [connectSSE, disconnectSSE, isConnected]); // 移除 updateNodeStatus 依赖，通过 ref 访问

  // 更新 pollTaskStatusMonitor ref
  useEffect(() => {
    pollTaskStatusMonitorRef.current = pollTaskStatusMonitor;
  }, [pollTaskStatusMonitor]);

  // 轮询任务状态（普通模式）
  const pollTaskStatus = useCallback(async (id: string) => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const response = await fetch(`/api/tasks/${id}`);

      if (response.status === 404) {
        // 任务不存在或已过期，停止轮询
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        const errorMsg = "任务不存在或已过期，请重新执行";
        setResult({
          status: "FAILED",
          error: errorMsg,
        });
        setExecutionError(errorMsg);
        setIsExecuting(false);
        toast.error("任务不存在或已过期");
        return;
      }

      if (!response.ok) {
        // 429 等非致命错误不刷屏，保持轮询即可
        return;
      }

      const responseData = await response.json();
      // API 返回格式: { success: true, data: { ... } }
      const data = responseData.data || responseData;

      if (data.status === "completed" || data.status === "failed") {
        // 任务完成，停止轮询
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        // 从 execution 对象获取错误信息（API 返回 execution 而非 result）
        const executionData = data.execution || data.result;
        // 优先级：execution.error > data.error > 默认错误信息
        const errorMsg =
          executionData?.error ||
          data.error ||
          (data.status === "failed"
            ? "执行失败，请查看执行历史获取详细信息"
            : undefined);

        // 使用执行结果的状态，而不是任务状态（因为 BullMQ 的 completed 可能包含 FAILED）
        const executionStatus =
          executionData?.status ||
          (data.status === "completed" ? "COMPLETED" : "FAILED");
        const isFailed =
          executionStatus === "FAILED" || data.status === "failed";

        setResult({
          status: isFailed ? "FAILED" : "COMPLETED",
          output: executionData?.output,
          error: errorMsg,
          duration: executionData?.duration,
          totalTokens: executionData?.totalTokens,
          promptTokens: executionData?.promptTokens,
          completionTokens: executionData?.completionTokens,
          executionId: executionData?.id || data.executionId,
          outputFiles: executionData?.outputFiles,
        });

        if (isFailed && errorMsg) {
          setExecutionError(errorMsg);
        }
        setIsExecuting(false);

        if (!isFailed) {
          toast.success("工作流执行完成");
        } else {
          toast.error(errorMsg || "工作流执行失败");
        }
      }
    } catch (_error) {
      // 静默处理轮询错误，避免刷屏
    } finally {
      pollInFlightRef.current = false;
    }
  }, []);

  // AI 生成测试数据
  const handleGenerateTestData = useCallback(async () => {
    if (inputFields.length === 0) {
      toast.error("没有可生成的输入字段");
      return;
    }

    setIsGeneratingTestData(true);
    setAiGenerationWarnings([]);

    try {
      const response = await fetch(`/api/workflows/${workflowId}/generate-test-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: inputFields.map((field) => ({
            name: field.fieldName,
            type: field.fieldType,
            description: undefined,
            options: field.options,
            placeholder: undefined,
            required: undefined,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "生成失败");
      }

      const { data, isAIGenerated, warnings } = result.data || result;

      // 更新输入值
      setInputValues((prev) => ({ ...prev, ...data }));
      setIsAIGeneratedInput(isAIGenerated);

      if (warnings && warnings.length > 0) {
        setAiGenerationWarnings(warnings);
        toast.warning("测试数据已生成，但有一些警告");
      } else if (isAIGenerated) {
        toast.success("AI 测试数据生成成功");
      } else {
        toast.info("已生成占位测试数据");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "生成失败";
      toast.error(errorMsg);
    } finally {
      setIsGeneratingTestData(false);
    }
  }, [workflowId, inputFields]);

  // 执行工作流
  const handleExecute = useCallback(async () => {
    // 防止重复启动轮询导致请求叠加
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsExecuting(true);
    setResult(null);
    setTaskId(null);
    setExecutionError(null);

    // 重置画布节点状态，并给用户即时反馈
    clearNodeExecutionStatus();
    nodes.forEach((node) => {
      emitNodeStatus(node.id, "pending");
    });
    const incomingCount = new Map<string, number>();
    edges.forEach((edge) => {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    });
    const optimisticFirstNode =
      nodes.find((n) => n.data?.type === "INPUT") ||
      nodes.find(
        (n) => (incomingCount.get(n.id) || 0) === 0 && n.data?.type !== "GROUP",
      ) ||
      nodes[0];
    if (optimisticFirstNode) {
      emitNodeStatus(optimisticFirstNode.id, "running");
    }

    // 测试模式：重置节点状态
    if (executionMode === "test") {
      const nodeMap = new Map<string, NodeExecutionInfo>();
      nodes.forEach((node) => {
        nodeMap.set(node.id, {
          nodeId: node.id,
          nodeName: String(node.data?.name || node.id),
          nodeType: String(node.data?.type || "UNKNOWN"),
          status: "pending",
        });
      });
      setNodeStates(nodeMap);
      setTestModeStatus("running");
      setCurrentNodeId(null);
      executionIdRef.current = null;
      abortControllerRef.current = new AbortController();
      disconnectSSE();
    }

    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: inputValues,
          async: executionMode === "test" ? true : asyncMode, // 测试模式强制异步
          // 在编辑器内执行应优先使用草稿配置，保证与当前画布/节点配置一致
          mode: "draft",
          executionType: executionMode === "test" ? "TEST" : "NORMAL",
          isAIGeneratedInput: executionMode === "test" ? isAIGeneratedInput : false,
        }),
        signal:
          executionMode === "test"
            ? abortControllerRef.current?.signal
            : undefined,
      });

      const responseData = await response.json();
      // API 响应格式: { success: true, data: {...} } 或 { success: false, error: {...} }
      const data = responseData.data || responseData;

      if (!response.ok) {
        const errorMsg =
          responseData.error?.message ||
          data.error ||
          data.message ||
          "执行失败";
        setExecutionError(errorMsg);
        setIsExecuting(false);
        clearNodeExecutionStatus();
        if (executionMode === "test") {
          setTestModeStatus("failed");
        }
        toast.error(errorMsg);
        return;
      }

      if (executionMode === "test" && data.taskId) {
        // 测试模式：开始轮询（SSE 会在获取到 executionId 后接管）
        taskIdRef.current = data.taskId;
        setTaskId(data.taskId);
        setActiveExecution("", data.taskId);
        toast.info("任务已提交，正在执行中...");
        pollingRef.current = setInterval(pollTaskStatusMonitor, 2000);
      } else if (asyncMode && data.taskId) {
        // 普通模式异步：开始轮询
        setTaskId(data.taskId);
        setActiveExecution("", data.taskId);
        toast.info("任务已提交，正在执行中...");
        pollingRef.current = setInterval(() => {
          pollTaskStatus(data.taskId);
        }, 2000);
      } else {
        // 普通模式同步：直接返回结果
        setResult(data);
        setIsExecuting(false);

        if (data.status === "COMPLETED") {
          toast.success("工作流执行完成");
        } else {
          const errorMsg = data.error || "工作流执行失败";
          setExecutionError(errorMsg);
          toast.error(errorMsg);
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      const errorMsg = error instanceof Error ? error.message : "执行失败";
      setExecutionError(errorMsg);
      setIsExecuting(false);
      clearNodeExecutionStatus();
      if (executionMode === "test") {
        setTestModeStatus("failed");
      }
      toast.error(errorMsg);
    }
  }, [
    workflowId,
    inputValues,
    asyncMode,
    executionMode,
    pollTaskStatus,
    pollTaskStatusMonitor,
    disconnectSSE,
    nodes,
    edges,
    setActiveExecution,
    clearNodeExecutionStatus,
    emitNodeStatus,
  ]);

  // 停止执行（监控模式）
  const handleStop = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    disconnectSSE();
    setIsExecuting(false);
    setTestModeStatus("failed");
    setCurrentNodeId(null);
    toast.info("执行已取消");
  }, [disconnectSSE]);

  // 关闭面板时停止轮询/断开 SSE（不影响后台任务继续执行）
  useEffect(() => {
    if (isOpen) return;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    disconnectSSE();
  }, [isOpen, disconnectSSE]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 格式化时间
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  // 获取状态图标（监控模式）
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

  // 计算进度（监控模式）
  const getProgress = () => {
    const total = nodeStates.size;
    if (total === 0) return 0;
    const completed = Array.from(nodeStates.values()).filter(
      (n) =>
        n.status === "completed" ||
        n.status === "failed" ||
        n.status === "skipped",
    ).length;
    return Math.round((completed / total) * 100);
  };

  // 排序节点（监控模式）
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            {executionMode === "test" ? (
              <FlaskConical className="h-5 w-5 text-blue-500" />
            ) : (
              <Play className="h-5 w-5 text-primary" />
            )}
            <h2 className="text-lg font-semibold">执行工作流</h2>
            {/* 测试模式进度 */}
            {executionMode === "test" && testModeStatus === "running" && (
              <>
                <span className="ml-2 text-sm text-muted-foreground">
                  {getProgress()}% 完成
                </span>
                {sseConnected && (
                  <span className="flex items-center gap-1 ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <Radio className="h-3 w-3 animate-pulse" />
                    实时
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 最小化按钮 - 执行中时显示 */}
            {isExecuting && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (onMinimize) {
                    onMinimize();
                  } else {
                    // 默认行为：设置后台执行状态并关闭面板
                    setActiveExecution(executionIdRef.current || '', taskId || '');
                    toast.info("任务将在后台继续执行，您可以在执行历史中查看进度");
                    onClose();
                  }
                }}
                title="最小化到后台"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 测试模式进度条 */}
        {executionMode === "test" && testModeStatus !== "idle" && (
          <div className="h-1.5 bg-muted">
            <div
              className={cn(
                "h-full transition-all duration-300",
                testModeStatus === "completed"
                  ? "bg-green-500"
                  : testModeStatus === "failed"
                    ? "bg-red-500"
                    : "bg-blue-500",
              )}
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        )}

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 执行模式切换 */}
          <div className="mb-6 flex gap-2 p-1 bg-muted rounded-lg">
            <button
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                executionMode === "execute"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setExecutionMode("execute")}
              disabled={isExecuting}
            >
              <Play className="h-4 w-4" />
              执行模式
            </button>
            <button
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                executionMode === "test"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setExecutionMode("test")}
              disabled={isExecuting}
            >
              <FlaskConical className="h-4 w-4" />
              测试模式
            </button>
          </div>

          {/* AI 生成测试数据按钮 - 仅在测试模式 idle 状态显示 */}
          {executionMode === "test" && testModeStatus === "idle" && inputFields.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">测试数据</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateTestData}
                  disabled={isGeneratingTestData || isExecuting}
                  className="gap-2"
                >
                  {isGeneratingTestData ? (
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
              
              {/* AI 生成警告信息 */}
              {aiGenerationWarnings.length > 0 && (
                <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 mb-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      {aiGenerationWarnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 输入参数 - 执行前显示 */}
          {inputFields.length > 0 &&
            (executionMode === "execute" || testModeStatus === "idle") && (
              <div className="mb-6">
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
                              {getFieldTypeLabel(field.fieldType)}
                            </span>
                          )}
                        </Label>
                        {field.fieldType === "text" ? (
                          // 文本类型：使用文本输入框
                          <Input
                            value={inputValues[field.fieldName] || ""}
                            onChange={(e) =>
                              setInputValues((prev) => ({
                                ...prev,
                                [field.fieldName]: e.target.value,
                              }))
                            }
                            placeholder={`输入 ${field.fieldName}`}
                            disabled={isExecuting}
                          />
                        ) : field.fieldType === "select" ? (
                          // 单选类型：使用下拉选择
                          <Select
                            value={inputValues[field.fieldName] || ""}
                            onValueChange={(value) =>
                              setInputValues((prev) => ({
                                ...prev,
                                [field.fieldName]: value,
                              }))
                            }
                            disabled={isExecuting}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={`选择 ${field.fieldName}`}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options || []).map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.fieldType === "multiselect" ? (
                          // 多选类型：使用复选框
                          <div className="space-y-2 p-2 border rounded-md">
                            {(field.options || []).map((option) => {
                              const selectedValues = (
                                inputValues[field.fieldName] || ""
                              )
                                .split(",")
                                .filter(Boolean);
                              const isChecked = selectedValues.includes(
                                option.value,
                              );
                              return (
                                <div
                                  key={option.value}
                                  className="flex items-center space-x-2"
                                >
                                  <Checkbox
                                    id={`${field.fieldId}-${option.value}`}
                                    checked={isChecked}
                                    disabled={isExecuting}
                                    onCheckedChange={(checked) => {
                                      setInputValues((prev) => {
                                        const current = (
                                          prev[field.fieldName] || ""
                                        )
                                          .split(",")
                                          .filter(Boolean);
                                        let newValues: string[];
                                        if (checked) {
                                          newValues = [
                                            ...current,
                                            option.value,
                                          ];
                                        } else {
                                          newValues = current.filter(
                                            (v) => v !== option.value,
                                          );
                                        }
                                        return {
                                          ...prev,
                                          [field.fieldName]:
                                            newValues.join(","),
                                        };
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
                          // 文件类型：使用文件上传
                          <div className="space-y-2">
                            {fileUploads[field.fieldName]?.file ? (
                              // 已上传文件显示
                              <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                                {getFieldTypeIcon(field.fieldType)}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {fileUploads[field.fieldName].file!.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatUploadSize(
                                      fileUploads[field.fieldName].file!.size,
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() =>
                                    handleRemoveFile(field.fieldName)
                                  }
                                  disabled={isExecuting}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </div>
                            ) : (
                              // 上传按钮
                              <div
                                className={cn(
                                  "flex items-center justify-center gap-2 p-4 border border-dashed rounded-md cursor-pointer transition-colors",
                                  "hover:border-primary hover:bg-primary/5",
                                  fileUploads[field.fieldName]?.uploading &&
                                    "pointer-events-none opacity-50",
                                )}
                                onClick={() => {
                                  if (
                                    !isExecuting &&
                                    !fileUploads[field.fieldName]?.uploading
                                  ) {
                                    fileInputRefs.current[
                                      field.fieldName
                                    ]?.click();
                                  }
                                }}
                              >
                                {fileUploads[field.fieldName]?.uploading ? (
                                  <>
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                      上传中...
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                      点击上传
                                      {getFieldTypeLabel(field.fieldType)}文件
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            {/* 隐藏的文件输入 */}
                            <input
                              type="file"
                              ref={(el) => {
                                fileInputRefs.current[field.fieldName] = el;
                              }}
                              className="hidden"
                              accept={FIELD_TYPE_ACCEPT[field.fieldType]}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleFileUpload(
                                    field.fieldName,
                                    field.fieldType,
                                    file,
                                  );
                                }
                                e.target.value = ""; // 重置以允许重复选择同一文件
                              }}
                              disabled={isExecuting}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          {/* 执行模式内容 */}
          {executionMode === "execute" && (
            <>
              {/* 执行选项 */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={asyncMode}
                    onChange={(e) => setAsyncMode(e.target.checked)}
                    disabled={isExecuting}
                    className="rounded border-gray-300"
                  />
                  <span>异步执行（后台运行，适合长时间任务）</span>
                </label>
              </div>

              {/* 执行状态 */}
              {isExecuting && (
                <div className="mb-6 flex items-center gap-3 rounded-lg bg-blue-50 p-4 text-blue-700">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <div>
                    <p className="font-medium">正在执行中...</p>
                    {taskId && (
                      <p className="text-sm opacity-75">任务 ID: {taskId}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 执行错误 */}
              {executionError && !result && !isExecuting && (
                <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-700">
                  <XCircle className="h-5 w-5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">执行失败</p>
                    <p className="text-sm opacity-90 break-words">
                      {executionError}
                    </p>
                  </div>
                </div>
              )}

              {/* 执行结果 */}
              {result && (
                <div className="space-y-4">
                  <div
                    className={`flex items-center gap-3 rounded-lg p-4 ${
                      result.status === "COMPLETED"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {result.status === "COMPLETED" ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">
                        {result.status === "COMPLETED"
                          ? "执行成功"
                          : "执行失败"}
                      </p>
                      {result.status !== "COMPLETED" && (
                        <p className="text-sm opacity-75">
                          {result.error ||
                            "未知错误，请查看执行历史获取详细信息"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 统计信息 */}
                  {result.status === "COMPLETED" && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                        <p className="text-lg font-semibold">
                          {formatDuration(result.duration || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          执行时间
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <Zap className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                        <p className="text-lg font-semibold">
                          {result.totalTokens || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          总 Tokens
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <FileText className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                        <p className="text-lg font-semibold">
                          {result.outputFiles?.length || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          输出文件
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 输出内容 */}
                  {result.output && (
                    <div>
                      <button
                        className="flex w-full items-center justify-between text-sm font-medium"
                        onClick={() => setShowOutput(!showOutput)}
                      >
                        <span>输出内容</span>
                        {showOutput ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>

                      {showOutput && (
                        <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-muted p-4 text-sm">
                          {JSON.stringify(result.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* 输出文件 */}
                  {result.outputFiles && result.outputFiles.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-medium">输出文件</h4>
                      <div className="space-y-2">
                        {result.outputFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between rounded-lg border p-3"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-8 w-8 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{file.fileName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {file.format.toUpperCase()} ·{" "}
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                let downloadUrl = file.url;
                                try {
                                  const url = new URL(
                                    file.url,
                                    window.location.origin,
                                  );
                                  downloadUrl = url.pathname + url.search;
                                } catch {
                                  // 已经是相对路径
                                }
                                window.open(downloadUrl, "_blank");
                              }}
                            >
                              <Download className="mr-1 h-4 w-4" />
                              下载
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 测试模式内容 */}
          {executionMode === "test" && testModeStatus !== "idle" && (
            <>
              {/* 执行总览 */}
              <div className="mb-6">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg p-4",
                    testModeStatus === "completed"
                      ? "bg-green-50 text-green-700"
                      : testModeStatus === "failed"
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700",
                  )}
                >
                  {testModeStatus === "completed" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : testModeStatus === "failed" ? (
                    <XCircle className="h-5 w-5" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {testModeStatus === "completed"
                        ? "执行成功"
                        : testModeStatus === "failed"
                          ? "执行失败"
                          : "正在执行..."}
                    </p>
                  </div>
                </div>
              </div>

              {/* 节点执行列表 */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  节点执行进度
                </h3>
                {sortedNodes.map((nodeInfo) => (
                  <div
                    key={nodeInfo.nodeId}
                    className={cn(
                      "rounded-lg border transition-colors",
                      nodeInfo.status === "running" &&
                        "border-blue-300 bg-blue-50",
                      nodeInfo.status === "completed" &&
                        "border-green-200 bg-green-50/50",
                      nodeInfo.status === "failed" &&
                        "border-red-200 bg-red-50/50",
                      currentNodeId === nodeInfo.nodeId &&
                        "ring-2 ring-blue-500",
                    )}
                  >
                    <button
                      className="flex w-full items-center justify-between p-3 text-left"
                      onClick={() =>
                        setShowNodeDetails(
                          showNodeDetails === nodeInfo.nodeId
                            ? null
                            : nodeInfo.nodeId,
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(nodeInfo.status)}
                        <div>
                          <span className="font-medium">
                            {nodeInfo.nodeName}
                          </span>
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
                        {(nodeInfo.promptTokens ||
                          nodeInfo.completionTokens) && (
                          <span className="text-sm text-muted-foreground">
                            {(nodeInfo.promptTokens || 0) +
                              (nodeInfo.completionTokens || 0)}{" "}
                            tokens
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
                      <div className="border-t px-3 py-2">
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
                        {!nodeInfo.error &&
                          !nodeInfo.output &&
                          nodeInfo.status === "pending" && (
                            <span className="text-sm text-muted-foreground">
                              等待执行...
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-between border-t px-6 py-4">
          <div>
            {/* 反馈按钮 - 执行模式或测试模式执行完成/失败后显示 */}
            {((executionMode === "execute" && result && result.executionId) ||
              (executionMode === "test" &&
                (testModeStatus === "completed" || testModeStatus === "failed") &&
                executionIdRef.current)) && (
              <Button
                variant="outline"
                onClick={() => setShowFeedbackDialog(true)}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                提交反馈
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isExecuting && !asyncMode}>
              {(executionMode === "execute" && result) ||
              (executionMode === "test" &&
                testModeStatus !== "idle" &&
                testModeStatus !== "running")
                ? "关闭"
                : "取消"}
            </Button>
            {executionMode === "test" && isExecuting ? (
              <Button variant="destructive" onClick={handleStop}>
                <StopCircle className="mr-2 h-4 w-4" />
                停止执行
              </Button>
            ) : (
              <Button onClick={handleExecute} disabled={isExecuting}>
                {isExecuting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {(executionMode === "execute" && result) ||
                    (executionMode === "test" && testModeStatus !== "idle")
                      ? "重新执行"
                      : "执行"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 执行反馈对话框 */}
      {(result?.executionId || executionIdRef.current) && (
        <ExecutionFeedbackDialog
          executionId={(result?.executionId || executionIdRef.current)!}
          actualOutput={
            result?.output ? JSON.stringify(result.output, null, 2) : undefined
          }
          open={showFeedbackDialog}
          onOpenChange={setShowFeedbackDialog}
          onSubmit={() => {
            // 反馈提交后的回调
          }}
        />
      )}
    </div>
  );
}
