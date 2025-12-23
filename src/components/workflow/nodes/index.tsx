"use client";

import React, { memo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Code2,
  Play,
  Loader2,
  Copy,
  Trash2,
  Database,
  Image,
  Video,
  Music,
  Settings,
  MessageSquare,
  GitBranch,
  Repeat,
  Globe,
  GitMerge,
  Sparkles,
  Bell,
  Zap,
  Route,
  Group,
  Ungroup,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useNodeDebug } from "@/hooks/use-node-debug";
import type { InputField, KnowledgeItem } from "@/types/workflow";

export const nodeStyles: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    headerColor: string;
    borderColor: string;
  }
> = {
  trigger: {
    icon: Zap,
    color: "text-amber-700",
    headerColor: "bg-amber-100",
    borderColor: "border-amber-200",
  },
  input: {
    icon: ArrowDownToLine,
    color: "text-yellow-700",
    headerColor: "bg-yellow-100",
    borderColor: "border-yellow-200",
  },
  process: {
    icon: Bot,
    color: "text-sky-700",
    headerColor: "bg-sky-100",
    borderColor: "border-sky-200",
  },
  code: {
    icon: Code2,
    color: "text-violet-700",
    headerColor: "bg-violet-100",
    borderColor: "border-violet-200",
  },
  output: {
    icon: ArrowUpFromLine,
    color: "text-orange-700",
    headerColor: "bg-orange-100",
    borderColor: "border-orange-200",
  },
  data: {
    icon: Database,
    color: "text-cyan-700",
    headerColor: "bg-cyan-100",
    borderColor: "border-cyan-200",
  },
  image: {
    icon: Image,
    color: "text-pink-700",
    headerColor: "bg-pink-100",
    borderColor: "border-pink-200",
  },
  video: {
    icon: Video,
    color: "text-red-700",
    headerColor: "bg-red-100",
    borderColor: "border-red-200",
  },
  audio: {
    icon: Music,
    color: "text-amber-700",
    headerColor: "bg-amber-100",
    borderColor: "border-amber-200",
  },
  // Advanced nodes
  condition: {
    icon: GitBranch,
    color: "text-gray-700",
    headerColor: "bg-gray-100",
    borderColor: "border-gray-200",
  },
  loop: {
    icon: Repeat,
    color: "text-indigo-700",
    headerColor: "bg-indigo-100",
    borderColor: "border-indigo-200",
  },
  switch: {
    icon: Route,
    color: "text-emerald-700",
    headerColor: "bg-emerald-100",
    borderColor: "border-emerald-200",
  },
  http: {
    icon: Globe,
    color: "text-teal-700",
    headerColor: "bg-teal-100",
    borderColor: "border-teal-200",
  },
  merge: {
    icon: GitMerge,
    color: "text-slate-700",
    headerColor: "bg-slate-100",
    borderColor: "border-slate-200",
  },
  image_gen: {
    icon: Sparkles,
    color: "text-fuchsia-700",
    headerColor: "bg-fuchsia-100",
    borderColor: "border-fuchsia-200",
  },
  notification: {
    icon: Bell,
    color: "text-rose-700",
    headerColor: "bg-rose-100",
    borderColor: "border-rose-200",
  },
  // Group node
  group: {
    icon: Group,
    color: "text-slate-700",
    headerColor: "bg-slate-50",
    borderColor: "border-slate-300",
  },
};

interface NodeData {
  name: string;
  type: string;
  config?: {
    fields?: InputField[];
    knowledgeItems?: KnowledgeItem[];
    prompt?: string;
    userPrompt?: string;
    format?: string;
    mode?: "input" | "output";
    stopAutoOptimization?: boolean;
    addOptimizationIteration?: (iteration: number) => void;
    isAutoMode?: boolean;
    setAutoMode?: (mode: boolean) => void;
  };
  [key: string]: unknown; // Index signature for compatibility
}

function BaseNode({ data, selected, id }: NodeProps & { data: NodeData }) {
  const style = nodeStyles[data.type.toLowerCase()] || nodeStyles.input;
  const Icon = style.icon;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    deleteNode,
    duplicateNode,
    openDebugPanel,
    groupNodes,
    nodes,
    nodeExecutionStatus,
    connectedNodeIds,
    selectedNodeId,
  } = useWorkflowStore();
  const { runNode, getDefaultInputs } = useNodeDebug();

  // Get execution status from store
  const executionStatus = nodeExecutionStatus[id] || "idle";

  // Determine dimming and highlighting
  const isConnected = connectedNodeIds.includes(id);
  const isSelected = id === selectedNodeId;
  const hasSelection = !!selectedNodeId;
  const shouldDim = hasSelection && !isSelected && !isConnected;

  // 获取当前选中的节点数量
  const selectedNodes = nodes.filter((n) => n.selected);
  const hasMultipleSelected = selectedNodes.length >= 2;

  // ... (context menu useEffects remain the same, simplified in replacement for brevity if needed but I must keep them if I don't touch them. I will just replace the top part and the render part)

  // Actually I need to split this because the render is far down.
  // Chunk 1: Hook and logic variables.
  // Chunk 2: Render className.

  // Wait, I can't put comments in the ReplacementContent that are not in valid syntax if I am replacing logic.
  // I will just replace the hook destructuring line.

  // 点击外部关闭菜单
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    // 使用 setTimeout 确保监听器在下一个事件循环中添加，避免被当前事件立即触发
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDuplicate = () => {
    duplicateNode(id);
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteNode(id);
    setContextMenu(null);
  };

  const handleDebug = () => {
    openDebugPanel(id);
    setContextMenu(null);
  };

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id);
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds);
    }
    setContextMenu(null);
  };

  // 点击运行按钮时直接执行节点
  const handleExecute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const inputs = getDefaultInputs(id);
    runNode(id, inputs);
  };

  const getStatusTooltip = () => {
    switch (executionStatus) {
      case "running":
        return "执行中...";
      case "completed":
        return "执行成功";
      case "failed":
        return "执行失败";
      case "pending":
        return "等待执行";
      case "skipped":
        return "已跳过";
      case "paused":
        return "已暂停";
      default:
        return "执行此节点";
    }
  };

  // 获取节点摘要信息
  const getSummary = () => {
    const config = data.config;
    if (!config) return null;

    switch (data.type.toLowerCase()) {
      case "trigger": {
        const triggerType = (config as { triggerType?: string }).triggerType;
        const triggerLabels: Record<string, string> = {
          MANUAL: "手动触发",
          WEBHOOK: "Webhook",
          SCHEDULE: "定时任务",
        };
        return triggerLabels[triggerType || "MANUAL"] || "手动触发";
      }
      case "input":
        if (config.fields && config.fields.length > 0) {
          return `${config.fields.length} 个输入字段`;
        }
        return null;
      case "process":
        if (config.knowledgeItems && config.knowledgeItems.length > 0) {
          return `${config.knowledgeItems.length} 个知识库`;
        }
        return null;
      case "code":
        if (config.prompt) {
          return (
            config.prompt.slice(0, 20) +
            (config.prompt.length > 20 ? "..." : "")
          );
        }
        return null;
      case "output":
        if (config.format) {
          const formatLabels: Record<string, string> = {
            text: "文本",
            json: "JSON",
            word: "Word",
            excel: "Excel",
            image: "图片",
          };
          return `输出: ${formatLabels[config.format] || config.format}`;
        }
        return null;
      default:
        return null;
    }
  };

  const summary = getSummary();

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "group relative min-w-[240px] rounded-xl border-2 bg-white transition-all duration-300",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          style.borderColor, // Use specific border color
          // 被选中的节点：明显的高亮边框和发光效果
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          // 与选中节点相连的节点：次级高亮
          !selected && connectedNodeIds.includes(id)
            ? "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20"
            : "",
          // Execution status overrides
          executionStatus === "running" &&
            "animate-pulse border-blue-400 shadow-blue-500/20",
          executionStatus === "completed" && "border-green-400",
          executionStatus === "failed" && "border-red-400",
          executionStatus === "pending" && "opacity-70",
          // 非选中且非相连的节点：淡化处理
          !!selectedNodeId &&
            id !== selectedNodeId &&
            !connectedNodeIds.includes(id) &&
            "opacity-30 grayscale-[0.6] blur-[0.5px] scale-[0.98]",
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 输入连接点 */}
        {data.type.toLowerCase() !== "input" &&
          data.type.toLowerCase() !== "trigger" && (
            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
              <Handle
                type="target"
                position={Position.Left}
                className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
              />
            </div>
          )}

        {/* 节点头部 - 彩色区域 */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-t-[10px] border-b",
            style.headerColor,
            style.borderColor,
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 shadow-sm",
                style.color,
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span
              className={cn(
                "font-bold",
                style.color,
                data.type.toLowerCase() === "input" ||
                  data.type.toLowerCase() === "process"
                  ? "text-base"
                  : "text-sm",
              )}
            >
              {data.name}
            </span>
          </div>

          {/* 执行按钮 - 头部右侧 */}
          {data.type.toLowerCase() !== "input" &&
            data.type.toLowerCase() !== "trigger" && (
              <div
                className={`transition-opacity duration-200 ${executionStatus === "running" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 shrink-0 rounded-full hover:bg-white/50",
                        style.color,
                      )}
                      onClick={handleExecute}
                      disabled={executionStatus === "running"}
                    >
                      {executionStatus === "running" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{getStatusTooltip()}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
        </div>

        {/* 节点主体 - 白色区域 */}
        <div className="p-4 space-y-3">
          {/* 类型标签 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
              {getTypeLabel(data.type)}
            </span>
          </div>

          {/* 摘要信息 - 如果有的话 */}
          {summary && (
            <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded-md border border-slate-100 leading-relaxed">
              {summary}
            </div>
          )}
        </div>

        {/* 输出连接点 */}
        {data.type.toLowerCase() !== "output" && (
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
            <Handle
              type="source"
              position={Position.Right}
              className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
            />
          </div>
        )}

        {/* 右键菜单 - Portal */}
        {contextMenu &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              className="min-w-[140px] rounded-lg border bg-popover/95 backdrop-blur-sm p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 9999,
              }}
            >
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDebug}
              >
                <Settings className="h-4 w-4" />
                配置
              </button>
              {(data.type.toLowerCase() === "input" ||
                data.type.toLowerCase() === "process") && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => {
                    // 触发添加批注事件，通过自定义事件传递给父组件
                    const event = new CustomEvent("openNodeComment", {
                      detail: {
                        nodeId: id,
                        nodeName: data.name,
                        nodeType: data.type,
                        comment: data.comment,
                      },
                    });
                    window.dispatchEvent(event);
                    setContextMenu(null);
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                  {data.comment ? "编辑批注" : "添加批注"}
                </button>
              )}
              {hasMultipleSelected && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={handleGroup}
                >
                  <Group className="h-4 w-4" />
                  组合
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDuplicate}
              >
                <Copy className="h-4 w-4" />
                复制
              </button>
              <div className="my-1 border-b border-border/50" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
}

export function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    TRIGGER: "触发器",
    INPUT: "用户输入",
    PROCESS: "AI处理",
    CODE: "代码节点",
    OUTPUT: "输出节点",
    DATA: "数据节点",
    IMAGE: "图片节点",
    VIDEO: "视频节点",
    AUDIO: "音频节点",
    // Advanced nodes
    CONDITION: "条件节点",
    LOOP: "循环节点",
    SWITCH: "分支节点",
    HTTP: "HTTP 节点",
    MERGE: "合并节点",
    IMAGE_GEN: "图像生成",
    NOTIFICATION: "通知节点",
    // Group node
    GROUP: "节点组",
  };
  return labels[type.toUpperCase()] || type;
}

// 导出自定义节点类型
export const TriggerNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
TriggerNode.displayName = "TriggerNode";

export const InputNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
InputNode.displayName = "InputNode";

export const ProcessNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
ProcessNode.displayName = "ProcessNode";

export const CodeNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
CodeNode.displayName = "CodeNode";

export const OutputNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
OutputNode.displayName = "OutputNode";

export const DataNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
DataNode.displayName = "DataNode";

export const ImageNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
ImageNode.displayName = "ImageNode";

export const VideoNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
VideoNode.displayName = "VideoNode";

export const AudioNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
AudioNode.displayName = "AudioNode";

// Advanced node components
export const LoopNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
LoopNode.displayName = "LoopNode";

export const HttpNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
HttpNode.displayName = "HttpNode";

export const MergeNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
MergeNode.displayName = "MergeNode";

export const ImageGenNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
ImageGenNode.displayName = "ImageGenNode";

export const NotificationNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
NotificationNode.displayName = "NotificationNode";

// Condition node with dual output handles (true/false branches)
function ConditionNodeBase({
  data,
  selected,
  id,
}: NodeProps & { data: NodeData }) {
  const style = nodeStyles.condition;
  const Icon = style.icon;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    deleteNode,
    duplicateNode,
    openDebugPanel,
    groupNodes,
    nodes,
    connectedNodeIds,
    selectedNodeId,
  } = useWorkflowStore();

  const selectedNodes = nodes.filter((n) => n.selected);
  const hasMultipleSelected = selectedNodes.length >= 2;

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDuplicate = () => {
    duplicateNode(id);
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteNode(id);
    setContextMenu(null);
  };

  const handleDebug = () => {
    openDebugPanel(id);
    setContextMenu(null);
  };

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id);
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds);
    }
    setContextMenu(null);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "group relative min-w-[240px] rounded-xl border-2 bg-white transition-all duration-300",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          style.borderColor,
          // 被选中的节点：明显的高亮边框和发光效果
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          // 与选中节点相连的节点：次级高亮
          !selected && connectedNodeIds.includes(id)
            ? "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20"
            : "",
          // 非选中且非相连的节点：淡化处理
          !!selectedNodeId &&
            id !== selectedNodeId &&
            !connectedNodeIds.includes(id) &&
            "opacity-30 grayscale-[0.6] blur-[0.5px] scale-[0.98]",
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 输入连接点 */}
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 头部 */}
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-t-[10px] border-b",
            style.headerColor,
            style.borderColor,
          )}
        >
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 shadow-sm",
              style.color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span
            className={cn(
              "font-bold",
              style.color,
              data.type.toLowerCase() === "input" ||
                data.type.toLowerCase() === "process"
                ? "text-base"
                : "text-sm",
            )}
          >
            {data.name}
          </span>
        </div>

        {/* 主体 - 分支标识 */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
              Condition
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-md bg-green-50/50 border border-green-100">
              <span className="text-xs font-semibold text-green-700">
                ✓ True
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-red-50/50 border border-red-100">
              <span className="text-xs font-semibold text-red-700">
                ✗ False
              </span>
            </div>
          </div>
        </div>

        {/* 双输出连接点 */}
        <div className="absolute -right-1.5 top-[43%] -translate-y-1/2 px-2 py-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!h-3 !w-3 !border-2 !border-background !bg-green-500 hover:!bg-green-600 hover:!w-4 hover:!h-4 transition-all"
          />
        </div>
        <div className="absolute -right-1.5 top-[74%] -translate-y-1/2 px-2 py-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!h-3 !w-3 !border-2 !border-background !bg-red-500 hover:!bg-red-600 hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 右键菜单 */}
        {contextMenu &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              className="min-w-[140px] rounded-lg border bg-popover/95 backdrop-blur-sm p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 9999,
              }}
            >
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDebug}
              >
                <Settings className="h-4 w-4" />
                配置
              </button>
              {hasMultipleSelected && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={handleGroup}
                >
                  <Group className="h-4 w-4" />
                  组合节点
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDuplicate}
              >
                <Copy className="h-4 w-4" />
                复制节点
              </button>
              <div className="my-1 border-b border-border/50" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除节点
              </button>
            </div>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
}

export const ConditionNode = memo((props: NodeProps) => (
  <ConditionNodeBase {...props} data={props.data as NodeData} />
));
ConditionNode.displayName = "ConditionNode";

// Switch node with multiple output handles (one per case)
interface SwitchCase {
  id: string;
  label: string;
  value: string | number | boolean;
  isDefault?: boolean;
}

function SwitchNodeBase({
  data,
  selected,
  id,
}: NodeProps & { data: NodeData }) {
  const style = nodeStyles.switch;
  const Icon = style.icon;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    deleteNode,
    duplicateNode,
    openDebugPanel,
    groupNodes,
    nodes,
    connectedNodeIds,
    selectedNodeId,
  } = useWorkflowStore();

  const selectedNodes = nodes.filter((n) => n.selected);
  const hasMultipleSelected = selectedNodes.length >= 2;

  // Get cases from config, provide default cases if not configured
  const cases: SwitchCase[] = (data.config as { cases?: SwitchCase[] })
    ?.cases || [
    { id: "case-1", label: "Case 1", value: "value1" },
    { id: "default", label: "Default", value: "", isDefault: true },
  ];

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDuplicate = () => {
    duplicateNode(id);
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteNode(id);
    setContextMenu(null);
  };

  const handleDebug = () => {
    openDebugPanel(id);
    setContextMenu(null);
  };

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id);
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds);
    }
    setContextMenu(null);
  };

  // Calculate handle positions based on number of cases
  const getHandlePosition = (index: number, total: number): string => {
    const startPercent = 25;
    const endPercent = 75;
    const range = endPercent - startPercent;
    const step = total > 1 ? range / (total - 1) : 0;
    return `${startPercent + step * index}%`;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "group relative min-w-[240px] rounded-xl border-2 bg-white transition-all duration-300",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          style.borderColor,
          // 被选中的节点：明显的高亮边框和发光效果
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          // 与选中节点相连的节点：次级高亮
          !selected && connectedNodeIds.includes(id)
            ? "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20"
            : "",
          // 非选中且非相连的节点：淡化处理
          !!selectedNodeId &&
            id !== selectedNodeId &&
            !connectedNodeIds.includes(id) &&
            "opacity-30 grayscale-[0.6] blur-[0.5px] scale-[0.98]",
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 输入连接点 */}
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 头部 */}
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-t-[10px] border-b",
            style.headerColor,
            style.borderColor,
          )}
        >
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 shadow-sm",
              style.color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span
            className={cn(
              "font-bold",
              style.color,
              data.type.toLowerCase() === "input" ||
                data.type.toLowerCase() === "process"
                ? "text-base"
                : "text-sm",
            )}
          >
            {data.name}
          </span>
        </div>

        {/* 主体 - Case 列表 */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
              Switch
            </span>
          </div>

          <div className="space-y-2">
            {cases.slice(0, 4).map((c, idx) => (
              <div
                key={c.id || `case-${idx}`}
                className="flex items-center gap-2 text-sm p-1.5 rounded-md hover:bg-slate-50 transition-colors"
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    c.isDefault ? "bg-gray-400" : "bg-emerald-500",
                  )}
                />
                <span
                  className={cn(
                    "truncate",
                    c.isDefault
                      ? "text-muted-foreground italic"
                      : "font-medium text-foreground/80",
                  )}
                >
                  {c.label}
                </span>
              </div>
            ))}
            {cases.length > 4 && (
              <span className="text-[10px] text-muted-foreground pl-4">
                +{cases.length - 4} more...
              </span>
            )}
          </div>
        </div>

        {/* 多输出连接点 */}
        {cases.map((c, index) => (
          <div
            key={c.id || `switch-handle-container-${index}`}
            className="absolute -right-1.5 px-2 py-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50"
            style={{
              top: getHandlePosition(index, cases.length),
              transform: "translateY(-50%)",
            }}
          >
            <Handle
              type="source"
              position={Position.Right}
              id={c.id || `case-${index}`}
              className={cn(
                "!h-3 !w-3 !border-2 !border-background hover:!w-4 hover:!h-4 transition-all",
                c.isDefault
                  ? "!bg-gray-400 hover:!bg-gray-500"
                  : "!bg-emerald-500 hover:!bg-emerald-600",
              )}
            />
          </div>
        ))}

        {/* 右键菜单 */}
        {contextMenu &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              className="min-w-[140px] rounded-lg border bg-popover/95 backdrop-blur-sm p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 9999,
              }}
            >
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDebug}
              >
                <Settings className="h-4 w-4" />
                配置
              </button>
              {hasMultipleSelected && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={handleGroup}
                >
                  <Group className="h-4 w-4" />
                  组合节点
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDuplicate}
              >
                <Copy className="h-4 w-4" />
                复制节点
              </button>
              <div className="my-1 border-b border-border/50" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除节点
              </button>
            </div>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
}

export const SwitchNode = memo((props: NodeProps) => (
  <SwitchNodeBase {...props} data={props.data as NodeData} />
));
SwitchNode.displayName = "SwitchNode";

// Media/Data node with mode indicator (input/output)
function MediaDataNodeBase({
  data,
  selected,
  id,
}: NodeProps & { data: NodeData }) {
  const style = nodeStyles[data.type.toLowerCase()] || nodeStyles.data;
  const Icon = style.icon;
  const mode = data.config?.mode || "input";
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { deleteNode, duplicateNode, openDebugPanel, groupNodes, nodes } =
    useWorkflowStore();

  const selectedNodes = nodes.filter((n) => n.selected);
  const hasMultipleSelected = selectedNodes.length >= 2;

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDuplicate = () => {
    duplicateNode(id);
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteNode(id);
    setContextMenu(null);
  };

  const handleDebug = () => {
    openDebugPanel(id);
    setContextMenu(null);
  };

  const handleGroup = () => {
    const selectedIds = selectedNodes.map((n) => n.id);
    if (selectedIds.length >= 2) {
      groupNodes(selectedIds);
    }
    setContextMenu(null);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "group relative min-w-[240px] rounded-xl border-2 bg-white transition-all duration-300",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          style.borderColor,
          selected ? "ring-2 ring-primary ring-offset-2" : "",
        )}
        onContextMenu={handleContextMenu}
        data-testid={`media-data-node-${data.type.toLowerCase()}`}
      >
        {/* 输入连接点 */}
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 头部 */}
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-t-[10px] border-b",
            style.headerColor,
            style.borderColor,
          )}
        >
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 shadow-sm",
              style.color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span
            className={cn(
              "font-bold",
              style.color,
              data.type.toLowerCase() === "input" ||
                data.type.toLowerCase() === "process"
                ? "text-base"
                : "text-sm",
            )}
          >
            {data.name}
          </span>
        </div>

        {/* 主体 - 模式和类型 */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
              {getTypeLabel(data.type)}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                mode === "input"
                  ? "bg-blue-50 text-blue-600 border border-blue-100"
                  : "bg-green-50 text-green-600 border border-green-100",
              )}
              data-testid="mode-indicator"
            >
              {mode === "input" ? "输入" : "输出"}
            </span>
          </div>
        </div>

        {/* 输出连接点 */}
        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 右键菜单 */}
        {contextMenu &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              className="min-w-[140px] rounded-lg border bg-popover/95 backdrop-blur-sm p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 9999,
              }}
            >
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDebug}
              >
                <Settings className="h-4 w-4" />
                配置
              </button>
              {hasMultipleSelected && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={handleGroup}
                >
                  <Group className="h-4 w-4" />
                  组合节点
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleDuplicate}
              >
                <Copy className="h-4 w-4" />
                复制节点
              </button>
              <div className="my-1 border-b border-border/50" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除节点
              </button>
            </div>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
}

// Media/Data node exports with mode indicator
export const MediaDataImageNode = memo((props: NodeProps) => (
  <MediaDataNodeBase {...props} data={props.data as NodeData} />
));
MediaDataImageNode.displayName = "MediaDataImageNode";

export const MediaDataAudioNode = memo((props: NodeProps) => (
  <MediaDataNodeBase {...props} data={props.data as NodeData} />
));
MediaDataAudioNode.displayName = "MediaDataAudioNode";

export const MediaDataVideoNode = memo((props: NodeProps) => (
  <MediaDataNodeBase {...props} data={props.data as NodeData} />
));
MediaDataVideoNode.displayName = "MediaDataVideoNode";

export const MediaDataDataNode = memo((props: NodeProps) => (
  <MediaDataNodeBase {...props} data={props.data as NodeData} />
));
MediaDataDataNode.displayName = "MediaDataDataNode";

// Group node component - container for grouped nodes
interface GroupNodeData {
  name: string;
  type: string;
  config?: {
    childNodeIds?: string[];
    label?: string;
    collapsed?: boolean;
    color?: string;
  };
  [key: string]: unknown;
}

// 颜色映射
const groupColorStyles: Record<
  string,
  { bgClass: string; borderClass: string; headerBg: string }
> = {
  gray: {
    bgClass: "bg-gray-50",
    borderClass: "border-gray-300",
    headerBg: "bg-gray-100/80",
  },
  blue: {
    bgClass: "bg-blue-50",
    borderClass: "border-blue-300",
    headerBg: "bg-blue-100/80",
  },
  green: {
    bgClass: "bg-green-50",
    borderClass: "border-green-300",
    headerBg: "bg-green-100/80",
  },
  yellow: {
    bgClass: "bg-yellow-50",
    borderClass: "border-yellow-300",
    headerBg: "bg-yellow-100/80",
  },
  red: {
    bgClass: "bg-red-50",
    borderClass: "border-red-300",
    headerBg: "bg-red-100/80",
  },
  purple: {
    bgClass: "bg-purple-50",
    borderClass: "border-purple-300",
    headerBg: "bg-purple-100/80",
  },
  pink: {
    bgClass: "bg-pink-50",
    borderClass: "border-pink-300",
    headerBg: "bg-pink-100/80",
  },
  cyan: {
    bgClass: "bg-cyan-50",
    borderClass: "border-cyan-300",
    headerBg: "bg-cyan-100/80",
  },
};

function GroupNodeBase({
  data,
  selected,
  id,
}: NodeProps & { data: GroupNodeData }) {
  const Icon = Group;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    ungroupNodes,
    deleteNode,
    toggleGroupCollapse,
    connectedNodeIds,
    selectedNodeId,
  } = useWorkflowStore();

  const childCount = data.config?.childNodeIds?.length || 0;
  const label = data.name || "节点组";
  const colorKey = data.config?.color || "gray";
  const colorStyle = groupColorStyles[colorKey] || groupColorStyles.gray;
  const isCollapsed = data.config?.collapsed || false;

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleUngroup = () => {
    ungroupNodes(id);
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteNode(id);
    setContextMenu(null);
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleGroupCollapse(id);
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed shadow-sm transition-all duration-300",
        colorStyle.bgClass,
        colorStyle.borderClass,
        // 被选中的节点：明显的高亮边框和发光效果
        selected &&
          "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30",
        // 与选中节点相连的节点：次级高亮
        !selected &&
          connectedNodeIds.includes(id) &&
          "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20",
        // 非选中且非相连的节点：淡化处理
        !!selectedNodeId &&
          id !== selectedNodeId &&
          !connectedNodeIds.includes(id) &&
          "opacity-30 grayscale-[0.6] blur-[0.5px] scale-[0.98]",
      )}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        minWidth: isCollapsed ? 280 : 200,
        minHeight: isCollapsed ? 120 : 80,
      }}
    >
      {/* 连接点 - 始终显示 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-gray-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-gray-400"
      />

      {/* 组标题栏 */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          !isCollapsed && "border-b rounded-t-lg",
          isCollapsed && "rounded-lg",
          colorStyle.headerBg,
          !isCollapsed && colorStyle.borderClass,
        )}
      >
        {/* 折叠/展开按钮 */}
        <button
          onClick={handleToggleCollapse}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/50 transition-colors shrink-0"
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          )}
        </button>
        <div className="rounded-md bg-white/80 p-2 text-gray-600 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium text-gray-700 truncate">
            {label}
          </span>
          <span className="text-xs text-gray-500">{childCount} 个节点</span>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="min-w-[120px] rounded-md border bg-popover p-1 shadow-lg"
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={handleUngroup}
            >
              <Ungroup className="h-4 w-4" />
              拆散组合
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              删除组
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export const GroupNode = memo((props: NodeProps) => (
  <GroupNodeBase {...props} data={props.data as GroupNodeData} />
));
GroupNode.displayName = "GroupNode";

// 节点类型映射
export const nodeTypes = {
  trigger: TriggerNode,
  input: InputNode,
  process: ProcessNode,
  code: CodeNode,
  output: OutputNode,
  // Media/Data nodes with mode indicator
  data: MediaDataDataNode,
  image: MediaDataImageNode,
  video: MediaDataVideoNode,
  audio: MediaDataAudioNode,
  // Advanced nodes
  condition: ConditionNode,
  loop: LoopNode,
  switch: SwitchNode,
  http: HttpNode,
  merge: MergeNode,
  image_gen: ImageGenNode,
  notification: NotificationNode,
  // Group node
  group: GroupNode,
};
