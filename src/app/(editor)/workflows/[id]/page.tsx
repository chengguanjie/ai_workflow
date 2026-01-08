"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkflowStore } from "@/stores/workflow-store";
import {
  Save,
  Play,
  ArrowLeft,
  Loader2,
  Link2,
  Group,
  Trash2,
  LayoutGrid,
  BarChart3,
  FileJson,
  MessageSquare,
  BookOpen,
  Share2,
  Menu,
  MonitorPlay,
  Undo2,
  Redo2,
} from "lucide-react";
import Link from "next/link";
import { useSafeParams } from "@/hooks/use-safe-params";
import { NodePanel } from "@/components/workflow/node-panel";
import { NodeConfigPanel } from "@/components/workflow/node-config-panel";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Lazy load heavy components
const ExecutionPanel = dynamic(
  () =>
    import("@/components/workflow/execution-panel").then(
      (mod) => mod.ExecutionPanel,
    ),
  { ssr: false },
);

const NodeDebugPanel = dynamic(
  () =>
    import("@/components/workflow/node-debug-panel").then(
      (mod) => mod.NodeDebugPanel,
    ),
  { ssr: false },
);
const AIAssistantPanel = dynamic(
  () =>
    import("@/components/workflow/ai-assistant-panel").then(
      (mod) => mod.AIAssistantPanel,
    ),
  { ssr: false },
);
const WorkflowImportExportDialog = dynamic(
  () =>
    import("@/components/workflow/workflow-import-export-dialog").then(
      (mod) => mod.WorkflowImportExportDialog,
    ),
  { ssr: false },
);
const NodeCommentDialog = dynamic(
  () =>
    import("@/components/workflow/node-comment-dialog").then(
      (mod) => mod.NodeCommentDialog,
    ),
  { ssr: false },
);
const WorkflowManualDialog = dynamic(
  () =>
    import("@/components/workflow/workflow-manual-dialog").then(
      (mod) => mod.WorkflowManualDialog,
    ),
  { ssr: false },
);
const ShareFormDialog = dynamic(
  () =>
    import("@/components/workflow/share-form-dialog").then(
      (mod) => mod.ShareFormDialog,
    ),
  { ssr: false },
);

import { UnifiedVersionControl } from "@/components/workflow/unified-version-control";
import { SaveStatusIndicator } from "@/components/workflow/save-status-indicator";
import { nodeTypes } from "@/components/workflow/nodes";
import AnimatedEdge from "@/components/workflow/animated-edge";
import { useWorkflowSave } from "@/hooks/use-workflow-save";
import { useExecutionStream, type ExecutionProgressEvent } from "@/hooks/use-execution-stream";

const edgeTypes = {
  default: AnimatedEdge,
};

function WorkflowEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setViewport: setReactFlowViewport } =
    useReactFlow();

  // 使用 ref 稳定 setReactFlowViewport 引用，避免 HMR 时 useEffect 依赖数组大小变化
  const setReactFlowViewportRef = useRef(setReactFlowViewport);
  setReactFlowViewportRef.current = setReactFlowViewport;

  const params = useSafeParams<{ id: string }>();
  const workflowId = params.id;

  const [isLoading, setIsLoading] = useState(true);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const [showImportExportDialog, setShowImportExportDialog] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false); // Presentation Mode State
  const [presentationStep, setPresentationStep] = useState(0);
  const [presentationLevels, setPresentationLevels] = useState<string[][]>([]);

  // 使用新的保存 Hook（集成乐观更新、防抖保存、离线支持、冲突检测）
  const {
    status: saveStatus,
    lastSavedAt,
    isSaving,
    conflict: _conflict,
    save: saveWorkflow,
    resolveConflict,
    retry: retrySave,
    setServerVersion,
  } = useWorkflowSave({
    workflowId,
    debounceMs: 1500,
    autoSave: !isLoading,
  });

  // 选区右键菜单状态
  const [selectionContextMenu, setSelectionContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);

  // Edge 右键菜单状态
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
  } | null>(null);
  const edgeMenuRef = useRef<HTMLDivElement>(null);

  // 节点右键菜单状态
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodeName: string;
    nodeType: string;
    comment?: string;
  } | null>(null);
  const nodeMenuRef = useRef<HTMLDivElement>(null);

  // 节点注释弹窗状态
  const [commentDialogNode, setCommentDialogNode] = useState<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    comment?: string;
  } | null>(null);

  // 说明手册弹窗状态
  const [showManualDialog, setShowManualDialog] = useState(false);

  // 分享表单弹窗状态
  const [showShareFormDialog, setShowShareFormDialog] = useState(false);

  const {
    nodes,
    edges,
    viewport,
    name,
    setWorkflow,
    setName,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectedNodeId,
    setViewport,
    groupNodes,
    getSelectedNodeIds,
    autoLayout,
    updateNodeExecutionStatus,
    updateNodeExecutionStatusSafe,
    updateNodeExecutionResult,
    updateNodeExecutionDetails,
    clearNodeExecutionStatus,
    clearNodeExecutionDetails,
    openDebugPanel,
    undo,
    redo,
    canUndo,
    canRedo,
    activeExecutionId,
    activeTaskId,
    clearActiveExecution,
    setActiveExecution,
    setLatestExecutionId,
    executionManagerActive,
  } = useWorkflowStore();

  // 加载工作流数据
  useEffect(() => {
    const loadWorkflow = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const message = errorData.message || errorData.error || `HTTP ${response.status}: 加载工作流失败`;
          throw new Error(message);
        }
        
        const result = await response.json();
        const workflow = result.data;

        // 使用 setWorkflow 初始化 store
        setWorkflow({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description || "",
          ...workflow.config,
        });

        // 同步服务器版本号到本地，避免版本冲突
        if (workflow.version !== undefined) {
          await setServerVersion(workflow.version);
        }

        // 恢复 viewport
        setTimeout(() => {
          const savedViewport = useWorkflowStore.getState().viewport;
          if (
            savedViewport &&
            (savedViewport.x !== 0 ||
              savedViewport.y !== 0 ||
              savedViewport.zoom !== 1)
          ) {
            setReactFlowViewportRef.current(savedViewport);
          }
        }, 50);

        // 恢复最近一次执行的节点状态
        if (workflow.latestExecution?.nodeStatuses) {
          setLatestExecutionId(workflow.latestExecution.id || null);
          clearNodeExecutionStatus();
          clearNodeExecutionDetails();
          const nodeStatuses = workflow.latestExecution.nodeStatuses as Record<string, { status: string; error?: string; hasOutput: boolean; output?: unknown }>;
          for (const [nodeId, statusInfo] of Object.entries(nodeStatuses)) {
            // 映射数据库状态到前端状态
            const statusMap: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'> = {
              'PENDING': 'pending',
              'RUNNING': 'running',
              'COMPLETED': 'completed',
              'FAILED': 'failed',
              'CANCELLED': 'skipped',
            };
            const mappedStatus = statusMap[statusInfo.status] || 'pending';
            updateNodeExecutionStatus(nodeId, mappedStatus);
            updateNodeExecutionDetails(nodeId, {
              triggered: true,
              inputStatus: 'valid',
              outputStatus: statusInfo.status === 'FAILED' ? 'error' : statusInfo.hasOutput ? 'valid' : 'empty',
              outputError: statusInfo.error,
            });
            // 恢复节点执行结果（输出数据）
            if (statusInfo.output !== undefined) {
              updateNodeExecutionResult(nodeId, {
                status: statusInfo.status === 'COMPLETED' ? 'success' : 'error',
                output: statusInfo.output as Record<string, unknown>,
                error: statusInfo.error,
                duration: 0,
              });
            }
          }
        } else {
          setLatestExecutionId(null);
        }
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
          toast.error("网络连接失败，请检查网络后重试");
        } else {
          toast.error(error instanceof Error ? error.message : "加载工作流失败");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, setWorkflow, setServerVersion, clearNodeExecutionStatus, clearNodeExecutionDetails, updateNodeExecutionStatus, updateNodeExecutionDetails, updateNodeExecutionResult]);

  // 后台执行事件订阅 - 实时更新节点执行状态
  // 注意：回调函数不需要 useCallback 包装，因为 useExecutionStream 内部使用 ref 存储回调
  // 当 executionManagerActive 为 true 时，由执行可视化组件统一管理状态更新，禁用此处的 SSE 订阅
  const { connect: connectExecution, disconnect: disconnectExecution } = useExecutionStream({
    onEvent: (event: ExecutionProgressEvent) => {
      // 当执行管理器激活时，跳过状态更新（由执行可视化组件统一管理）
      if (executionManagerActive) return;
      
      if (event.nodeId) {
        if (event.type === 'node_start') {
          updateNodeExecutionStatusSafe(event.nodeId, 'running');
        } else if (event.type === 'node_complete') {
          updateNodeExecutionStatusSafe(event.nodeId, 'completed');
        } else if (event.type === 'node_error') {
          updateNodeExecutionStatusSafe(event.nodeId, 'failed');
        }
      }
    },
    onComplete: () => {
      clearActiveExecution();
      if (!showExecutionPanel) toast.success('工作流执行完成');
    },
    onError: (error: string) => {
      clearActiveExecution();
      if (!showExecutionPanel) toast.error(error || '工作流执行失败');
    },
    // 当执行管理器激活时禁用 SSE 订阅
    enabled: !executionManagerActive,
  });

  // 当有后台执行任务时，自动订阅执行事件
  useEffect(() => {
    if (activeExecutionId) {
      connectExecution(activeExecutionId);
    }
    return () => {
      disconnectExecution();
    };
  }, [activeExecutionId, connectExecution, disconnectExecution]);

  // 基于 taskId 轮询任务状态，实时更新节点执行进度
  useEffect(() => {
    // 执行面板打开时由面板负责监控，避免重复轮询触发 429
    // 当执行管理器激活时，由执行可视化组件统一管理状态更新，跳过轮询
    if (!activeTaskId || showExecutionPanel || executionManagerActive) return;

    let isCancelled = false;
    const pollInterval = setInterval(async () => {
      if (isCancelled) return;

      try {
        const response = await fetch(`/api/tasks/${activeTaskId}`);
        if (!response.ok) {
          if (response.status === 429) return;
          if (response.status === 404) {
            clearActiveExecution();
          }
          return;
        }

        const responseData = await response.json();
        // API 返回格式: { success: true, data: { taskId, status, execution, ... } }
        const data = responseData.data || responseData;
        
        // 如果获取到 executionId，更新 store 以便 SSE 订阅
        if (data.execution?.id && !activeExecutionId) {
          setActiveExecution(data.execution.id, activeTaskId);
        }

        // 从执行日志中提取节点状态
        if (data.execution?.logs && Array.isArray(data.execution.logs)) {
          for (const log of data.execution.logs) {
            if (!log.nodeId) continue;
            
            const statusMap: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'> = {
              'PENDING': 'pending',
              'RUNNING': 'running',
              'COMPLETED': 'completed',
              'FAILED': 'failed',
              'CANCELLED': 'skipped',
            };
            const mappedStatus = statusMap[log.status] || 'running';
            // 使用安全的状态更新方法，避免竞态条件
            updateNodeExecutionStatusSafe(log.nodeId, mappedStatus);
          }
        }

        // 检查执行是否完成
        if (data.status === 'completed' || data.status === 'failed') {
          clearActiveExecution();
          if (!showExecutionPanel) {
            if (data.status === 'completed') {
              toast.success('工作流执行完成');
            } else if (data.execution?.error) {
              toast.error(data.execution.error);
            }
          }
        }
      } catch (error) {
        console.warn('[TaskPolling] Error:', error);
      }
    }, 2000);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
    };
  }, [activeTaskId, activeExecutionId, updateNodeExecutionStatusSafe, clearActiveExecution, setActiveExecution, showExecutionPanel, executionManagerActive]);

  // 手动保存处理
  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error("请输入工作流名称");
      return;
    }

    if (nodes.length === 0) {
      toast.error("工作流至少需要一个节点");
      return;
    }

    await saveWorkflow({ silent: false });
  }, [name, nodes, saveWorkflow]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = `${type}_${Date.now()}`;

      addNode({
        id: nodeId,
        type: type.toUpperCase() as "INPUT" | "PROCESS" | "CODE" | "OUTPUT" | "LOGIC",
        name: getNodeName(type),
        position,
        config: getDefaultConfig(type),
      } as never);
    },
    [screenToFlowPosition, addNode],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string; data?: { type?: string } }) => {
      // 选中节点，触发高亮效果和右侧配置/调试面板逻辑
      selectNode(node.id);

      const nodeType = node.data?.type?.toLowerCase();
      // 对于 input、process 和 logic 节点，额外打开调试面板（配置面板保持隐藏）
      if (nodeType === "input" || nodeType === "process" || nodeType === "logic") {
        openDebugPanel(node.id);
      }
      // 其他类型（code / output 等）：仅依赖 selectedNodeId 来控制 NodeConfigPanel 展开
    },
    [selectNode, openDebugPanel],
  );

  const onPaneClick = useCallback(() => {
    // 点击画布空白：清空选中节点，配置面板自动收起
    selectNode(null);
    setSelectionContextMenu(null);
    setEdgeContextMenu(null);
    setNodeContextMenu(null);
  }, [selectNode]);

  // 键盘快捷键：撤销/重做
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z 或 Cmd+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
          toast.success("已撤销");
        }
      }
      // Ctrl+Shift+Z 或 Cmd+Shift+Z 重做
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        if (canRedo()) {
          redo();
          toast.success("已重做");
        }
      }
      // Ctrl+Y 重做 (Windows 风格)
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        if (canRedo()) {
          redo();
          toast.success("已重做");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  // 点击外部关闭选区右键菜单
  useEffect(() => {
    if (!selectionContextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        selectionMenuRef.current &&
        !selectionMenuRef.current.contains(e.target as globalThis.Node)
      ) {
        setSelectionContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [selectionContextMenu]);

  // 处理选区右键菜单
  const onSelectionContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const selectedIds = getSelectedNodeIds();
      // 只有选中多个节点时才显示组合菜单
      if (selectedIds.length >= 2) {
        setSelectionContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [getSelectedNodeIds],
  );

  // 处理组合节点
  const handleGroupNodes = useCallback(() => {
    const selectedIds = getSelectedNodeIds();
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds);
      toast.success("节点已组合");
    }
    setSelectionContextMenu(null);
  }, [getSelectedNodeIds, groupNodes]);

  // 点击外部关闭 Edge 右键菜单
  useEffect(() => {
    if (!edgeContextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        edgeMenuRef.current &&
        !edgeMenuRef.current.contains(e.target as globalThis.Node)
      ) {
        setEdgeContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [edgeContextMenu]);

  // 处理 Edge 右键菜单
  const onEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: { id: string }) => {
      e.preventDefault();
      setEdgeContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id });
    },
    [],
  );

  // 删除 Edge
  const handleDeleteEdge = useCallback(() => {
    if (edgeContextMenu) {
      onEdgesChange([{ type: "remove", id: edgeContextMenu.edgeId }]);
      toast.success("连线已删除");
      setEdgeContextMenu(null);
    }
  }, [edgeContextMenu, onEdgesChange]);

  // 点击外部关闭节点右键菜单
  useEffect(() => {
    if (!nodeContextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        nodeMenuRef.current &&
        !nodeMenuRef.current.contains(e.target as globalThis.Node)
      ) {
        setNodeContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [nodeContextMenu]);

  // 处理节点右键菜单
  const onNodeContextMenu = useCallback(
    (
      e: React.MouseEvent,
      node: {
        id: string;
        data?: { name?: string; type?: string; comment?: string };
      },
    ) => {
      e.preventDefault();
      setNodeContextMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id,
        nodeName: node.data?.name || "未命名节点",
        nodeType: node.data?.type || "UNKNOWN",
        comment: node.data?.comment,
      });
    },
    [],
  );

  // 打开节点注释弹窗
  const handleOpenCommentDialog = useCallback(() => {
    if (nodeContextMenu) {
      setCommentDialogNode({
        nodeId: nodeContextMenu.nodeId,
        nodeName: nodeContextMenu.nodeName,
        nodeType: nodeContextMenu.nodeType,
        comment: nodeContextMenu.comment,
      });
      setNodeContextMenu(null);
    }
  }, [nodeContextMenu]);

  // 监听从节点右键菜单触发的批注事件
  useEffect(() => {
    const handleOpenNodeComment = (e: CustomEvent) => {
      const { nodeId, nodeName, nodeType, comment } = e.detail;
      setCommentDialogNode({
        nodeId,
        nodeName,
        nodeType,
        comment,
      });
    };

    window.addEventListener(
      "openNodeComment",
      handleOpenNodeComment as EventListener,
    );
    return () => {
      window.removeEventListener(
        "openNodeComment",
        handleOpenNodeComment as EventListener,
      );
    };
  }, []);

  // 复制 API 调用链接
  const copyApiUrl = useCallback(async () => {
    const apiUrl = `${window.location.origin}/api/v1/workflows/${workflowId}/execute`;
    await navigator.clipboard.writeText(apiUrl);
    toast.success("已复制 API 调用链接");
  }, [workflowId]);

  // 计算节点层级
  const computeLevels = useCallback(() => {
    // 1. 初始化入度和邻接表
    const inDegree: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    const nodeIds = new Set(nodes.map((n) => n.id));

    nodes.forEach((n) => {
      inDegree[n.id] = 0;
      adj[n.id] = [];
    });

    edges.forEach((e) => {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
        adj[e.source].push(e.target);
        inDegree[e.target] = (inDegree[e.target] || 0) + 1;
      }
    });

    // 2. 使用BFS计算层级
    const levels: Record<string, number> = {};
    const queue: string[] = [];

    // 找到所有入度为0的节点（根节点）
    nodes.forEach((n) => {
      if ((inDegree[n.id] || 0) === 0) {
        queue.push(n.id);
        levels[n.id] = 0;
      }
    });

    // 如果没有根节点（全是环），则全部视为第0层
    if (queue.length === 0 && nodes.length > 0) {
      nodes.forEach((n) => {
        queue.push(n.id);
        levels[n.id] = 0;
      });
    }

    const maxLevels: Record<string, number> = { ...levels };

    while (queue.length > 0) {
      const u = queue.shift()!;
      if (adj[u]) {
        adj[u].forEach((v) => {
          // 下一层级 = 当前层级 + 1
          const newLevel = (maxLevels[u] || 0) + 1;
          // 取最大值（即最长路径，也就是直到所有依赖都就绪才显示）
          if (newLevel > (maxLevels[v] || 0)) {
            maxLevels[v] = newLevel;
          }

          inDegree[v]--;
          if (inDegree[v] === 0) {
            queue.push(v);
          }
        });
      }
    }

    // 3. 处理环路中的剩余节点 (inDegree > 0)
    // 将它们放到最后发现的最大层级 + 1
    let maxFoundLevel = 0;
    Object.values(maxLevels).forEach(
      (l) => (maxFoundLevel = Math.max(maxFoundLevel, l)),
    );

    nodes.forEach((n) => {
      if (maxLevels[n.id] === undefined) {
        maxLevels[n.id] = maxFoundLevel + 1;
      }
    });

    // 4. 分组
    const result: string[][] = [];
    Object.entries(maxLevels).forEach(([id, level]) => {
      if (!result[level]) result[level] = [];
      result[level].push(id);
    });

    return result.filter((group) => group && group.length > 0);
  }, [nodes, edges]);

  const startPresentation = useCallback(async () => {
    const levels = computeLevels();
    if (levels.length === 0) {
      toast.error("工作流为空，无法播放");
      return;
    }
    setPresentationLevels(levels);
    setPresentationStep(0);
    setIsPresentationMode(true);

    // 聚焦到第一步的节点
    await new Promise((resolve) => setTimeout(resolve, 100)); // 等待状态更新
    const firstStepNodes = levels[0];
    if (firstStepNodes.length > 0) {
      // 简单 fitView 可能会有问题，这里先不做复杂聚焦
      // 理想情况是 fitView({ nodes: [{id: ...}] })
    }
  }, [computeLevels]);

  const stopPresentation = useCallback(() => {
    setIsPresentationMode(false);
    setPresentationStep(0);
    setPresentationLevels([]);
  }, []);

  const nextStep = useCallback(() => {
    setPresentationStep((prev) =>
      Math.min(prev + 1, presentationLevels.length - 1),
    );
  }, [presentationLevels]);

  const prevStep = useCallback(() => {
    setPresentationStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // 计算当前应该显示的节点和边
  const visibleNodes = isPresentationMode
    ? nodes.filter((n) => {
        // 找到当前节点所在的层级
        let nodeLevel = -1;
        presentationLevels.forEach((level, index) => {
          if (level.includes(n.id)) nodeLevel = index;
        });
        return nodeLevel !== -1 && nodeLevel <= presentationStep;
      })
    : nodes;

  const visibleEdges = isPresentationMode
    ? edges.filter((e) => {
        const sourceVisible = visibleNodes.some((n) => n.id === e.source);
        const targetVisible = visibleNodes.some((n) => n.id === e.target);
        return sourceVisible && targetVisible;
      })
    : edges;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* 左侧工具栏 */}
      <div
        className="flex w-14 flex-col items-center border-r bg-background py-4 transition-all duration-300 gap-2"
      >
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/workflows">
                <Button variant="ghost" size="icon" className="mb-2">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">返回工作流列表</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">保存工作流</TooltipContent>
          </Tooltip>

          {/* 撤销/重做按钮 */}
          <div className="flex flex-col gap-1 border-t pt-2 mt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={undo}
                  disabled={!canUndo()}
                  className="h-8 w-8"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">撤销 (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={redo}
                  disabled={!canRedo()}
                  className="h-8 w-8"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">重做 (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPresentationMode ? "secondary" : "ghost"}
                size="icon"
                onClick={
                  isPresentationMode ? stopPresentation : startPresentation
                }
                className={
                  isPresentationMode ? "bg-blue-100 text-blue-600" : ""
                }
              >
                <MonitorPlay className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isPresentationMode ? "退出播放模式" : "播放模式 (类似PPT演示)"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowExecutionPanel(true)}
                disabled={nodes.length === 0}
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">执行工作流</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {/* 更多菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuLabel>工作流工具</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={copyApiUrl}>
                <Link2 className="mr-2 h-4 w-4" />
                复制 API 链接
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowImportExportDialog(true)}>
                <FileJson className="mr-2 h-4 w-4" />
                导入/导出
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowManualDialog(true)}>
                <BookOpen className="mr-2 h-4 w-4" />
                说明手册
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowShareFormDialog(true)}>
                <Share2 className="mr-2 h-4 w-4" />
                分享表单
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      </div>

      {/* 编辑器主体 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部名称输入 */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-2 transition-all duration-300">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64 border-none bg-transparent text-lg font-semibold focus-visible:ring-0"
            placeholder="工作流名称"
          />
          {/* 右侧工具区 */}
          <div className="flex items-center gap-4">
            {/* 保存状态指示器（集成乐观更新、离线支持、冲突检测） */}
            <SaveStatusIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              onRetry={retrySave}
              onResolveConflict={resolveConflict}
            />

            {/* 统一版本管理 */}
            <UnifiedVersionControl
              workflowId={workflowId}
              onVersionChange={() => {
                // 版本变更后可以刷新页面或重新加载数据
                window.location.reload();
              }}
              onTestExecute={() => {
                // 测试执行使用草稿配置
                setShowExecutionPanel(true);
              }}
            />

            {/* 统计分析按钮 */}
            <Link href={`/workflows/${workflowId}/analytics`}>
              <Button variant="outline" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                统计分析
              </Button>
            </Link>
          </div>
        </div>

        {/* 中间区域：画布和右侧配置面板 */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 中间画布 - 当调试面板打开时自动缩小 */}
          <div
            ref={reactFlowWrapper}
            className="flex-1 min-w-0 transition-all duration-300"
          >
            <ReactFlow
              nodes={visibleNodes}
              edges={visibleEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onViewportChange={setViewport}
              defaultViewport={viewport}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              snapToGrid
              snapGrid={[15, 15]}
              selectionOnDrag={false}
              selectionMode={SelectionMode.Partial}
              selectionKeyCode="Shift"
              multiSelectionKeyCode="Shift"
              panOnScroll
              onSelectionContextMenu={onSelectionContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onNodeContextMenu={onNodeContextMenu}
              className="bg-white"
            >
              <Background
                gap={24}
                size={1.5}
                color="#E2E8F0"
                variant={BackgroundVariant.Dots}
              />
              <Controls
                className="bg-white border-none shadow-lg rounded-xl overflow-hidden"
                showInteractive={false}
              >
                <ControlButton
                  onClick={async () => {
                    autoLayout("LR");
                    // 布局完成后自动保存
                    await saveWorkflow({ silent: true });
                    toast.success("布局已优化并保存", {
                      description: "节点已自动整理，避免重叠并保持清晰层次",
                    });
                  }}
                  title="整理布局 - 自动优化节点排列，避免重叠"
                  className="border-none hover:bg-slate-100"
                >
                  <LayoutGrid className="h-4 w-4 text-slate-600" />
                </ControlButton>
              </Controls>
              <MiniMap
                className="!bg-white !border-none !shadow-lg !rounded-xl overflow-hidden"
                maskColor="rgba(241, 245, 249, 0.7)"
                nodeColor={() => "#cbd5e1"}
                pannable
                zoomable
              />
              <Panel
                position="top-left"
                className="text-xs text-muted-foreground bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-100 shadow-sm"
              >
                Nodes: {nodes.length} · Connections: {edges.length}
              </Panel>
            </ReactFlow>
          </div>

          {/* 右侧配置面板/调试面板 */}
          {selectedNodeId && (
            <div className="relative flex">
              {/* 配置面板与调试面板互斥：非 input/process/logic 节点显示配置面板，否则显示调试面板 */}
              {(() => {
                const selectedNode = nodes.find((n) => n.id === selectedNodeId);
                const nodeType = (
                  selectedNode?.data as { type?: string }
                )?.type?.toLowerCase();
                // input、process 和 logic 节点使用调试面板，其他节点使用配置面板
                if (nodeType === "input" || nodeType === "process" || nodeType === "logic") {
                  return <NodeDebugPanel />;
                }
                return (
                  <div className="relative">
                    <NodeConfigPanel />
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* 底部节点面板 */}
        {!isPresentationMode && (
          <div className="border-t bg-white z-10 transition-all duration-300">
            <NodePanel />
          </div>
        )}

        {/* 演示模式控制条 */}
        {isPresentationMode && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-full border bg-white/90 px-6 py-3 shadow-xl backdrop-blur-sm animate-in slide-in-from-bottom-5">
            <div className="text-sm font-medium text-muted-foreground mr-2">
              播放模式: 第 {presentationStep + 1} / {presentationLevels.length}{" "}
              步
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={prevStep}
              disabled={presentationStep === 0}
              className="rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="default"
              size="icon"
              onClick={nextStep}
              disabled={presentationStep === presentationLevels.length - 1}
              className="rounded-full bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-4 w-4 fill-current" />
            </Button>

            <div className="w-px h-6 bg-border mx-2" />

            <Button
              variant="ghost"
              size="sm"
              onClick={stopPresentation}
              className="text-muted-foreground hover:text-foreground"
            >
              退出播放
            </Button>
          </div>
        )}
      </div>

      {/* Execution Panels & Dialogs (unchanged) */}
      <ExecutionPanel
        workflowId={workflowId}
        isOpen={showExecutionPanel}
        onClose={() => {
          setShowExecutionPanel(false);
        }}
      />

      <WorkflowImportExportDialog
        isOpen={showImportExportDialog}
        onClose={() => setShowImportExportDialog(false)}
        workflowName={name}
      />

      {/* AI助手面板 - 通过底部栏的AI规划按钮触发 */}
      <AIAssistantPanel workflowId={workflowId} />

      {/* 选区右键菜单 - 使用 Portal 渲染到 body */}
      {selectionContextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={selectionMenuRef}
            className="min-w-[120px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: "fixed",
              left: selectionContextMenu.x,
              top: selectionContextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleGroupNodes}
            >
              <Group className="h-4 w-4" />
              组合节点
            </button>
          </div>,
          document.body,
        )}

      {/* Edge 右键菜单 - 使用 Portal 渲染到 body */}
      {edgeContextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={edgeMenuRef}
            className="min-w-[100px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: "fixed",
              left: edgeContextMenu.x,
              top: edgeContextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={handleDeleteEdge}
            >
              <Trash2 className="h-4 w-4" />
              删除连线
            </button>
          </div>,
          document.body,
        )}

      {/* 节点右键菜单 - 使用 Portal 渲染到 body */}
      {nodeContextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={nodeMenuRef}
            className="min-w-[120px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: "fixed",
              left: nodeContextMenu.x,
              top: nodeContextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleOpenCommentDialog}
            >
              <MessageSquare className="h-4 w-4" />
              {nodeContextMenu.comment ? "编辑注释" : "添加注释"}
            </button>
          </div>,
          document.body,
        )}

      {/* 节点注释弹窗 */}
      {commentDialogNode && (
        <NodeCommentDialog
          isOpen={!!commentDialogNode}
          onClose={() => setCommentDialogNode(null)}
          nodeId={commentDialogNode.nodeId}
          nodeName={commentDialogNode.nodeName}
          nodeType={commentDialogNode.nodeType}
          currentComment={commentDialogNode.comment}
        />
      )}

      {/* 工作流说明手册弹窗 */}
      <WorkflowManualDialog
        isOpen={showManualDialog}
        onClose={() => setShowManualDialog(false)}
        workflowId={workflowId}
      />

      {/* 分享表单弹窗 */}
      <ShareFormDialog
        workflowId={workflowId}
        isOpen={showShareFormDialog}
        onClose={() => setShowShareFormDialog(false)}
      />
    </div>
  );
}

function getNodeName(type: string): string {
  const names: Record<string, string> = {
    input: "输入",
    process: "文本",
    code: "代码",
    output: "输出",
    data: "数据",
    image: "图片",
    video: "视频",
    audio: "音频",
    logic: "逻辑判断",
  };
  return names[type] || "节点";
}

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    // === 基础节点 ===
    case "input":
      return { fields: [] };
    case "process":
      return {
        provider: "OPENROUTER",
        model: "deepseek/deepseek-chat",
        knowledgeItems: [],
        systemPrompt: "",
        userPrompt: "",
        temperature: 0.7,
        maxTokens: 10000,
      };
    case "code":
      return {
        provider: "OPENROUTER",
        model: "deepseek/deepseek-coder",
        prompt: "",
        language: "javascript",
        code: "",
        timeout: 30000,
      };
    case "output":
      return {
        provider: "OPENROUTER",
        model: "deepseek/deepseek-chat",
        prompt: "",
        format: "text",
        templateName: "",
      };

    // === 多媒体/数据节点 ===
    case "data":
      return {
        files: [],
        parseOptions: {
          headerRow: 1,
          skipEmptyRows: true,
        },
      };
    case "image":
      return {
        files: [],
        processingOptions: {
          outputFormat: "png",
          quality: 80,
        },
      };
    case "video":
      return {
        files: [],
        processingOptions: {
          extractFrames: false,
          generateThumbnail: true,
        },
      };
    case "audio":
      return {
        files: [],
        processingOptions: {
          transcribe: true,
        },
      };

    // === 逻辑节点 ===
    case "logic":
      return {
        mode: "condition",
        conditions: [],
      };
    case "condition":
      return {
        conditions: [],
        evaluationMode: "all",
      };
    case "loop":
      return {
        loopType: "FOR",
        maxIterations: 10,
        continueOnError: true,
        forConfig: {
          arrayVariable: "",
          itemName: "item",
          indexName: "index",
        },
      };
    case "switch":
      return {
        switchVariable: "",
        cases: [],
        matchType: "exact",
        includeDefault: true,
      };
    case "merge":
      return {
        mergeStrategy: "all",
        errorStrategy: "fail_fast",
        timeout: 30000,
      };

    // === 连接/其他节点 ===
    case "http":
      return {
        method: "GET",
        url: "",
        headers: {},
        timeout: 10000,
        retry: {
          maxRetries: 3,
          retryDelay: 1000,
        },
      };
    case "image_gen":
      return {
        provider: "OPENAI",
        model: "dall-e-3",
        prompt: "",
        size: "1024x1024",
        n: 1,
      };
    case "notification":
      return {
        platform: "feishu",
        webhookUrl: "",
        messageType: "text",
        content: "",
      };
    case "trigger":
      return {
        triggerType: "MANUAL",
        enabled: true,
      };
    case "approval":
      return {
        title: "审批节点",
        approvers: [],
        timeout: 24,
        timeoutAction: "ESCALATE",
        notificationChannels: ["IN_APP"],
        requiredApprovals: 1,
        allowComments: true,
        customFields: [],
      };

    default:
      return {};
  }
}

export default function WorkflowDetailPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
