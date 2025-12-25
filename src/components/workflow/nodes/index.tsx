"use client";

import React, { memo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  Bot,
  Play,
  Loader2,
  Copy,
  Trash2,
  Settings,
  MessageSquare,
  Group,
  ChevronDown,
  ChevronRight,
  Ungroup,
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
  group: {
    icon: Group,
    color: "text-green-700",
    headerColor: "bg-green-100",
    borderColor: "border-green-300",
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
  previewStatus?: "added" | "modified" | "removed" | "unchanged";
  comment?: string;
  [key: string]: unknown;
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
    nodes,
    nodeExecutionStatus,
    connectedNodeIds,
    selectedNodeId,
  } = useWorkflowStore();
  const { runNode, getDefaultInputs } = useNodeDebug();

  const executionStatus = nodeExecutionStatus[id] || "idle";

  const isConnected = connectedNodeIds.includes(id);
  const isSelected = id === selectedNodeId;
  const hasSelection = !!selectedNodeId;
  const shouldDim = hasSelection && !isSelected && !isConnected;

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

  const getSummary = () => {
    const config = data.config;
    if (!config) return null;

    switch (data.type.toLowerCase()) {
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
          style.borderColor,
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          !selected && connectedNodeIds.includes(id)
            ? "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20"
            : "",
          executionStatus === "running" &&
            "animate-pulse border-blue-400 shadow-blue-500/20",
          executionStatus === "completed" && "border-green-400",
          executionStatus === "failed" && "border-red-400",
          executionStatus === "pending" && "opacity-70",
          shouldDim && "opacity-30 grayscale-[0.6] blur-[0.5px] scale-[0.98]",
          data.previewStatus === "added" &&
            "ring-[3px] ring-green-500 border-green-500 shadow-lg shadow-green-500/20",
          data.previewStatus === "modified" &&
            "ring-[3px] ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/20",
          data.previewStatus === "removed" &&
            "ring-[3px] ring-red-500 border-red-500 opacity-60 grayscale bg-red-50",
        )}
        onContextMenu={handleContextMenu}
      >
        {data.type.toLowerCase() !== "input" && (
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
            <Handle
              type="target"
              position={Position.Left}
              className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
            />
          </div>
        )}

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
            <span className={cn("font-bold text-base", style.color)}>
              {data.name}
            </span>
          </div>

          {data.type.toLowerCase() !== "input" && (
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

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
              {getTypeLabel(data.type)}
            </span>
          </div>

          {summary && (
            <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded-md border border-slate-100 leading-relaxed">
              {summary}
            </div>
          )}
        </div>

        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

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
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => {
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
    INPUT: "用户输入",
    PROCESS: "AI处理",
  };
  return labels[type.toUpperCase()] || type;
}

export const InputNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
InputNode.displayName = "InputNode";

export const ProcessNode = memo((props: NodeProps) => (
  <BaseNode {...props} data={props.data as NodeData} />
));
ProcessNode.displayName = "ProcessNode";

// 组节点数据接口
interface GroupNodeData {
  name: string;
  type: string;
  config?: {
    childNodeIds?: string[];
    label?: string;
    collapsed?: boolean;
    childRelativePositions?: Record<string, { x: number; y: number }>;
  };
  [key: string]: unknown;
}

// 组节点组件
function GroupNodeComponent({
  data,
  selected,
  id,
}: NodeProps & { data: GroupNodeData }) {
  const style = nodeStyles.group;
  const Icon = style.icon;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggleGroupCollapse, ungroupNodes, deleteNode } = useWorkflowStore();

  const config = data.config || {};
  const isCollapsed = config.collapsed || false;
  const childCount = config.childNodeIds?.length || 0;

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

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleGroupCollapse(id);
  };

  const handleUngroup = () => {
    ungroupNodes(id);
    setContextMenu(null);
  };

  const handleDelete = () => {
    deleteNode(id);
    setContextMenu(null);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "rounded-xl border-2 bg-green-50/50 transition-all duration-300",
          "shadow-sm hover:shadow-md",
          style.borderColor,
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          isCollapsed ? "min-w-[280px]" : "",
        )}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        {/* 左侧入口 Handle */}
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 z-50">
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 标题栏 */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-t-[10px] border-b cursor-pointer",
            style.headerColor,
            style.borderColor,
          )}
          onClick={handleToggleCollapse}
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
            <span className={cn("font-bold text-base", style.color)}>
              {data.name || "节点组"}
            </span>
            <span className="text-xs text-muted-foreground bg-white/60 px-2 py-0.5 rounded-full">
              {childCount} 个节点
            </span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 shrink-0 rounded-full hover:bg-white/50",
                  style.color,
                )}
                onClick={handleToggleCollapse}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{isCollapsed ? "展开组" : "折叠组"}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 折叠状态下显示摘要 */}
        {isCollapsed && (
          <div className="p-3">
            <div className="text-xs text-muted-foreground">
              点击展开查看 {childCount} 个节点
            </div>
          </div>
        )}

        {/* 右侧出口 Handle */}
        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 z-50">
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
                onClick={handleToggleCollapse}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {isCollapsed ? "展开组" : "折叠组"}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={handleUngroup}
              >
                <Ungroup className="h-4 w-4" />
                取消组合
              </button>
              <div className="my-1 border-b border-border/50" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                删除组
              </button>
            </div>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
}

export const GroupNode = memo((props: NodeProps) => (
  <GroupNodeComponent {...props} data={props.data as GroupNodeData} />
));
GroupNode.displayName = "GroupNode";

export const nodeTypes = {
  input: InputNode,
  process: ProcessNode,
  group: GroupNode,
};
