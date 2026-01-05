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
  Globe,
  Table2,
  BookOpen,
  Video,
  Bell,
  Sparkles,
  Image,
  Music,
  FileText,
  FileJson,
  Wrench,
  Code,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  type LucideIcon,
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
import type {
  InputField,
  KnowledgeItem,
  UIToolConfig,
  ProcessNodeConfigData,
} from "@/types/workflow";
import { getModelModality, type ModelModality } from "@/lib/ai/types";
import type { OutputType } from "@/lib/workflow/debug-panel/types";

// 工具类型到图标和颜色的映射
const TOOL_ICONS: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  "http-request": { icon: Globe, color: "text-blue-500", label: "HTTP请求" },
  "feishu-bitable": { icon: Table2, color: "text-indigo-500", label: "飞书表格" },
  "xiaohongshu": { icon: BookOpen, color: "text-red-500", label: "小红书" },
  "douyin-video": { icon: Video, color: "text-pink-500", label: "抖音" },
  "wechat-mp": { icon: MessageSquare, color: "text-green-500", label: "公众号" },
  "claude-skill": { icon: Sparkles, color: "text-orange-500", label: "Skill" },
  "notification-feishu": { icon: Bell, color: "text-blue-600", label: "飞书通知" },
  "notification-dingtalk": { icon: Bell, color: "text-sky-500", label: "钉钉通知" },
  "notification-wecom": { icon: Bell, color: "text-green-600", label: "企微通知" },
  "custom": { icon: Wrench, color: "text-gray-500", label: "自定义" },
};

// 模型模态类型到图标和颜色的映射
const MODEL_TYPE_ICONS: Record<ModelModality, { icon: LucideIcon; color: string; bgColor: string; label: string }> = {
  "text": { icon: FileText, color: "text-sky-600", bgColor: "bg-sky-100", label: "文本" },
  "code": { icon: Code, color: "text-emerald-600", bgColor: "bg-emerald-100", label: "代码" },
  "image-gen": { icon: Image, color: "text-purple-600", bgColor: "bg-purple-100", label: "图片生成" },
  "video-gen": { icon: Video, color: "text-pink-600", bgColor: "bg-pink-100", label: "视频生成" },
  "audio-transcription": { icon: Music, color: "text-amber-600", bgColor: "bg-amber-100", label: "语音识别" },
  "audio-tts": { icon: Music, color: "text-amber-600", bgColor: "bg-amber-100", label: "语音合成" },
  "embedding": { icon: FileText, color: "text-cyan-600", bgColor: "bg-cyan-100", label: "向量" },
  "ocr": { icon: Image, color: "text-teal-600", bgColor: "bg-teal-100", label: "图文识别" },
};

interface NodeStyle {
  icon: React.ElementType;
  color: string;
  headerColor: string;
  borderColor: string;
  className?: string;
}

export const nodeStyles: Record<string, NodeStyle> = {
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
  logic: {
    icon: GitBranch,
    color: "text-indigo-700",
    headerColor: "bg-indigo-100",
    borderColor: "border-indigo-200",
    className: "rounded-[2rem]", // 更大的圆角，区分于普通节点
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
  // 直接复用类型层定义的配置结构，避免重复维护字段
  config?: ProcessNodeConfigData & {
    fields?: InputField[];
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
  const nodeKind = data.type.toLowerCase();
  const baseStyle = nodeStyles[nodeKind] || nodeStyles.input;

  // 根据模型类型获取动态样式（仅针对 process 节点）
  const getDynamicStyle = (): NodeStyle => {
    if (nodeKind !== "process") {
      return baseStyle;
    }

    // 获取 modality：对于 text/code 共用模型，优先使用用户配置的 modality
    const inferredModality = data.config?.model ? getModelModality(data.config.model) : null;
    const configModality = data.config?.modality;
    // 如果推断的是 text/code 且用户配置了 text/code，优先使用用户配置
    const modality = (inferredModality === 'text' || inferredModality === 'code') &&
                     (configModality === 'text' || configModality === 'code')
                     ? configModality
                     : (inferredModality || configModality);
    if (!modality) return baseStyle;

    switch (modality) {
      case "code":
        return {
          icon: Code,
          color: "text-emerald-700",
          headerColor: "bg-emerald-100",
          borderColor: "border-emerald-200",
        };
      case "image-gen":
        return {
          icon: Image,
          color: "text-purple-700",
          headerColor: "bg-purple-100",
          borderColor: "border-purple-200",
        };
      case "video-gen":
        return {
          icon: Video,
          color: "text-pink-700",
          headerColor: "bg-pink-100",
          borderColor: "border-pink-200",
        };
      case "audio-transcription":
      case "audio-tts":
        return {
          icon: Music,
          color: "text-amber-700",
          headerColor: "bg-amber-100",
          borderColor: "border-amber-200",
        };
      case "embedding":
        return {
          icon: Bot,
          color: "text-cyan-700",
          headerColor: "bg-cyan-100",
          borderColor: "border-cyan-200",
        };
      case "ocr":
        return {
          icon: Image,
          color: "text-teal-700",
          headerColor: "bg-teal-100",
          borderColor: "border-teal-200",
        };
      default:
        return baseStyle;
    }
  };

  const style = getDynamicStyle();
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
    nodeExecutionDetails,
    connectedNodeIds,
    selectedNodeId,
  } = useWorkflowStore();
  const { runNode, getDefaultInputs } = useNodeDebug();

  const executionStatus = nodeExecutionStatus[id];
  const hasExecutionStatus = executionStatus !== undefined;
  const executionDetails = nodeExecutionDetails[id];

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
        return "开始执行";
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

  // 统一获取输出类型的样式信息，方便顶部背景色和徽标复用
  const getOutputTypeMeta = () => {
    const config = data.config;
    let outputType = config?.expectedOutputType as OutputType | undefined;

    // 如果还没有显式设置 expectedOutputType，则基于模态做一个温和的默认推断
    if (!outputType && data.type.toLowerCase() === "process") {
      const modality = config?.modality as ModelModality | undefined;
      if (modality) {
        const modalityMap: Partial<Record<ModelModality, OutputType>> = {
          text: "text",
          code: "json",
          "image-gen": "image",
          "video-gen": "video",
          "audio-transcription": "text",
          "audio-tts": "audio",
          embedding: "json",
          ocr: "text",
        };
        outputType = modalityMap[modality];
      }
    }

    if (!outputType) return null;

    const map: Record<
      OutputType,
      { icon: LucideIcon; bg: string; fg: string; label: string }
    > = {
      text: {
        icon: FileText,
        bg: "bg-slate-100",
        fg: "text-slate-700",
        label: "文本输出",
      },
      json: {
        icon: FileJson,
        bg: "bg-emerald-100",
        fg: "text-emerald-700",
        label: "JSON 输出",
      },
      html: {
        icon: Code,
        bg: "bg-indigo-100",
        fg: "text-indigo-700",
        label: "HTML 输出",
      },
      csv: {
        icon: Table2,
        bg: "bg-amber-100",
        fg: "text-amber-800",
        label: "CSV 输出",
      },
      word: {
        icon: FileText,
        bg: "bg-blue-100",
        fg: "text-blue-700",
        label: "Word 文档",
      },
      pdf: {
        icon: FileText,
        bg: "bg-red-100",
        fg: "text-red-700",
        label: "PDF 文档",
      },
      excel: {
        icon: Table2,
        bg: "bg-green-100",
        fg: "text-green-700",
        label: "Excel 表格",
      },
      ppt: {
        icon: FileText,
        bg: "bg-orange-100",
        fg: "text-orange-700",
        label: "PPT 演示",
      },
      image: {
        icon: Image,
        bg: "bg-purple-100",
        fg: "text-purple-700",
        label: "图片输出",
      },
      audio: {
        icon: Music,
        bg: "bg-pink-100",
        fg: "text-pink-700",
        label: "音频输出",
      },
      video: {
        icon: Video,
        bg: "bg-teal-100",
        fg: "text-teal-700",
        label: "视频输出",
      },
    };

    const meta = map[outputType];
    if (!meta) return null;

    return { outputType, meta };
  };

  // 根据输出类型返回图标和颜色
  const getOutputTypeBadge = () => {
    const result = getOutputTypeMeta();
    if (!result) return null;

    const { outputType, meta } = result;
    const BadgeIcon = meta.icon;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shadow-sm",
              meta.bg,
              meta.fg,
            )}
          >
            <BadgeIcon className="h-3 w-3" />
            <span>
              {outputType.toUpperCase()}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{meta.label}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "group relative min-w-[240px] border-2 bg-white transition-all duration-300",
          baseStyle.className || "rounded-xl",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          style.borderColor,
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          !selected && connectedNodeIds.includes(id)
            ? "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20"
            : "",
          executionStatus === "failed" && "node-failed border-red-500",
          executionStatus === "completed" && "node-completed border-green-500",
          executionStatus === "running" && "node-executing border-blue-500",
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
        {nodeKind !== "input" && (
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
            <Handle
              type="target"
              position={Position.Left}
              className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
            />
          </div>
        )}

        {/*
          顶部标题栏背景色：
          - 对于 process 节点，如果有输出类型，就使用输出类型的 bg 颜色
          - 逻辑节点使用统一的逻辑样式
          - 其他情况保持原有基于节点类型 / 模态的 headerColor
        */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-t-[10px] border-b",
            (() => {
              const outputMeta = getOutputTypeMeta();
              if (nodeKind === "process" && outputMeta) {
                return outputMeta.meta.bg;
              }
              return style.headerColor;
            })(),
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
          {nodeKind !== "input" && (
            <div
              className={cn(
                "transition-opacity duration-200",
                executionStatus === "running"
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
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

        <div className="p-4 space-y-2">
          {/* 输入 / 输出格式 + 工具（同一行） */}
          <div className="flex flex-col gap-1">
            {nodeKind === "process" ? (
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                {(() => {
                  // 获取 modality：对于 text/code 共用模型，优先使用用户配置的 modality
                  const inferredModality = data.config?.model
                    ? getModelModality(data.config.model)
                    : null;
                  const configModality = data.config?.modality;
                  // 如果推断的是 text/code 且用户配置了 text/code，优先使用用户配置
                  const modality =
                    (inferredModality === "text" || inferredModality === "code") &&
                    (configModality === "text" || configModality === "code")
                      ? configModality
                      : (inferredModality || configModality);

                  if (modality && MODEL_TYPE_ICONS[modality]) {
                    const {
                      icon: ModalityIcon,
                      color,
                      bgColor,
                      label,
                    } = MODEL_TYPE_ICONS[modality];
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "flex items-center gap-1 font-bold tracking-wider px-2 py-0.5 rounded-full",
                              "text-[10px]",
                              bgColor,
                              color,
                            )}
                          >
                            <ModalityIcon className="h-3 w-3" />
                            {label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {data.config?.model || "未选择模型"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
                      {getTypeLabel(data.type)}
                    </span>
                  );
                })()}
                {getOutputTypeBadge()}

                {/* 工具图标并到同一行，去掉“工具”文字 */}
                {data.config?.tools &&
                  data.config.tools.filter((t) => t.enabled).length > 0 && (
                    <>
                      {data.config.tools
                        .filter((t) => t.enabled)
                        .slice(0, 4)
                        .map((tool) => {
                          const toolMeta =
                            TOOL_ICONS[tool.type] || TOOL_ICONS["custom"];
                          const ToolIcon = toolMeta.icon;
                          return (
                            <Tooltip key={tool.id}>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    "flex items-center justify-center h-5 w-5 rounded bg-slate-100 hover:bg-slate-200 transition-colors cursor-default",
                                    toolMeta.color,
                                  )}
                                >
                                  <ToolIcon className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">
                                  {tool.name || toolMeta.label}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      {data.config.tools.filter((t) => t.enabled).length > 4 && (
                        <span className="text-[10px] text-muted-foreground/60 ml-0.5">
                          +{data.config.tools.filter((t) => t.enabled).length - 4}
                        </span>
                      )}
                    </>
                  )}
              </div>
            ) : (
              // 非 Process 节点：展示节点类型标签
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
                  {getTypeLabel(data.type)}
                </span>
              </div>
            )}
          </div>

          {/* 摘要信息 */}
          {summary && (
            <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded-md border border-slate-100 leading-relaxed">
              {summary}
            </div>
          )}
        </div>

        {/* 执行状态指示条 - 仅在有执行状态时显示 */}
        {(hasExecutionStatus || executionDetails) && (
          <div
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2 text-[10px] border-t rounded-b-[10px]",
              executionStatus === "completed" && "bg-green-50 border-green-200",
              executionStatus === "failed" && "bg-red-50 border-red-200",
              executionStatus === "running" && "bg-blue-50 border-blue-200",
              executionStatus === "pending" && "bg-slate-50 border-slate-200",
              executionStatus === "skipped" && "bg-gray-50 border-gray-200",
              !hasExecutionStatus && executionDetails && "bg-slate-50 border-slate-200",
            )}
          >
            <div className="flex items-center gap-3">
              {/* 输入状态 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {executionDetails?.inputStatus === 'valid' ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : executionDetails?.inputStatus === 'invalid' ? (
                      <XCircle className="h-3 w-3 text-red-500" />
                    ) : executionDetails?.inputStatus === 'missing' ? (
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    ) : (
                      <Clock className="h-3 w-3 text-gray-400" />
                    )}
                    <span className={cn(
                      "font-medium",
                      executionDetails?.inputStatus === 'valid' && "text-green-600",
                      executionDetails?.inputStatus === 'invalid' && "text-red-600",
                      executionDetails?.inputStatus === 'missing' && "text-amber-600",
                      (!executionDetails || executionDetails.inputStatus === 'pending') && "text-gray-500",
                    )}>
                      输入
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {executionDetails?.inputStatus === 'valid' && "输入数据正常"}
                    {executionDetails?.inputStatus === 'invalid' && (executionDetails?.inputError || "输入数据异常")}
                    {executionDetails?.inputStatus === 'missing' && "缺少必要的输入数据"}
                    {(!executionDetails || executionDetails.inputStatus === 'pending') && "等待输入"}
                  </p>
                </TooltipContent>
              </Tooltip>

              {/* 输出状态 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {executionDetails?.outputStatus === 'valid' ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : executionDetails?.outputStatus === 'error' ? (
                      <XCircle className="h-3 w-3 text-red-500" />
                    ) : executionDetails?.outputStatus === 'empty' ? (
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    ) : (
                      <Clock className="h-3 w-3 text-gray-400" />
                    )}
                    <span className={cn(
                      "font-medium",
                      executionDetails?.outputStatus === 'valid' && "text-green-600",
                      executionDetails?.outputStatus === 'error' && "text-red-600",
                      executionDetails?.outputStatus === 'empty' && "text-amber-600",
                      (!executionDetails || executionDetails.outputStatus === 'pending') && "text-gray-500",
                    )}>
                      输出
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {executionDetails?.outputStatus === 'valid' && "输出数据正常"}
                    {executionDetails?.outputStatus === 'error' && (executionDetails?.outputError || "输出异常")}
                    {executionDetails?.outputStatus === 'empty' && "输出为空"}
                    {(!executionDetails || executionDetails.outputStatus === 'pending') && "等待输出"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* 执行状态 */}
            <div className="flex items-center gap-1">
              {executionStatus === "running" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  <span className="text-blue-600 font-medium">执行中</span>
                </>
              )}
              {executionStatus === "completed" && (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-green-600 font-medium">完成</span>
                </>
              )}
              {executionStatus === "failed" && (
                <>
                  <XCircle className="h-3 w-3 text-red-500" />
                  <span className="text-red-600 font-medium">失败</span>
                </>
              )}
              {executionStatus === "pending" && (
                <>
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-500 font-medium">等待触发</span>
                </>
              )}
              {executionStatus === "skipped" && (
                <>
                  <AlertCircle className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-500 font-medium">已跳过</span>
                </>
              )}
              {!hasExecutionStatus && executionDetails && !executionDetails.triggered && (
                <>
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-500 font-medium">未触发</span>
                </>
              )}
            </div>
          </div>
        )}

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

// 逻辑节点数据接口
interface LogicNodeData {
  name: string;
  type: string;
  config?: {
    mode?: string;
  };
  previewStatus?: "added" | "modified" | "removed" | "unchanged";
  comment?: string;
  [key: string]: unknown;
}

// 逻辑节点组件 - 圆形样式
function LogicNodeComponent({
  data,
  selected,
  id,
}: NodeProps & { data: LogicNodeData }) {
  const style = nodeStyles.logic;
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

  const config = data.config || {};
  const mode = config.mode || "condition";

  const getModeLabel = (m: string) => {
    const labels: Record<string, string> = {
      condition: "条件判断",
      split: "并行拆分",
      merge: "结果合并",
      switch: "分支选择",
    };
    return labels[m] || m;
  };

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
        return "开始执行";
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "group relative flex flex-col items-center justify-center",
          "w-[120px] h-[120px] rounded-full",
          "border-2 transition-all duration-300",
          "shadow-sm hover:shadow-md",
          "hover:-translate-y-0.5",
          style.headerColor,
          style.borderColor,
          selected
            ? "ring-[3px] ring-primary ring-offset-2 shadow-lg shadow-primary/30"
            : "",
          !selected && connectedNodeIds.includes(id)
            ? "ring-2 ring-primary/60 ring-offset-2 scale-[1.02] shadow-md shadow-primary/20"
            : "",
          executionStatus === "running" && "node-executing border-blue-500",
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
        {/* 左侧入口 Handle */}
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 px-2 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-50">
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground hover:!bg-primary hover:!w-4 hover:!h-4 transition-all"
          />
        </div>

        {/* 圆形内容区 */}
        <div
          className={cn(
            "flex flex-col items-center justify-center text-center p-3",
            "rounded-full w-full h-full",
          )}
        >
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full bg-white/80 shadow-sm mb-1",
              style.color,
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">
            {getModeLabel(mode)}
          </span>
        </div>

        {/* 执行按钮 */}
        <div
          className={cn(
            "absolute -bottom-1 left-1/2 -translate-x-1/2 transition-opacity duration-200",
            executionStatus === "running"
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 shrink-0 rounded-full bg-white shadow-sm border",
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
            <TooltipContent side="bottom">
              <p>{getStatusTooltip()}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 右侧出口 Handle */}
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

export const LogicNode = memo((props: NodeProps) => (
  <LogicNodeComponent {...props} data={props.data as LogicNodeData} />
));
LogicNode.displayName = "LogicNode";

export const nodeTypes = {
  input: InputNode,
  process: ProcessNode,
  logic: LogicNode,
  group: GroupNode,
};
