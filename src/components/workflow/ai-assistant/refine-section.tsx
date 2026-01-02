"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Crosshair,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  ArrowRight,
  Eye,
  Sparkles,
  Settings2,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { useAIAssistantStore, type NodeAction } from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import type { NodeConfig } from "@/types/workflow";

interface RefineSectionProps {
  workflowId: string;
  selectedModel: string;
  onPreview?: (actions: NodeAction[]) => void;
}

// 精修操作类型
const REFINE_OPERATIONS = [
  {
    id: "modify",
    label: "修改配置",
    description: "修改指定节点的配置参数",
    icon: Settings2,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    id: "add",
    label: "添加节点",
    description: "在工作流中添加新节点",
    icon: Plus,
    color: "text-green-500",
    bgColor: "bg-green-50",
  },
  {
    id: "delete",
    label: "删除节点",
    description: "从工作流中删除指定节点",
    icon: Trash2,
    color: "text-red-500",
    bgColor: "bg-red-50",
  },
  {
    id: "reconnect",
    label: "调整连接",
    description: "修改节点之间的连接关系",
    icon: ArrowRight,
    color: "text-purple-500",
    bgColor: "bg-purple-50",
  },
];

interface RefineResult {
  success: boolean;
  summary: string;
  nodeActions: NodeAction[];
  explanation?: string;
}

export function RefineSection({
  workflowId,
  selectedModel,
  onPreview,
}: RefineSectionProps) {
  const [operation, setOperation] = useState("modify");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [result, setResult] = useState<RefineResult | null>(null);
  const [applied, setApplied] = useState(false);

  const { nodes, edges, addNode, updateNode, deleteNode, onConnect } =
    useWorkflowStore();
  const { addMessage, setPhase, setMode } = useAIAssistantStore();

  // 获取节点列表用于选择
  const nodeOptions = useMemo(() => {
    return nodes.map((node) => {
      const data = node.data as NodeConfig;
      return {
        id: node.id,
        name: data.name,
        type: data.type,
      };
    });
  }, [nodes]);

  // 生成工作流上下文
  const generateWorkflowContext = useCallback(() => {
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
            configSummary = `模型: ${proc.model || "未设置"}, 系统提示词: ${proc.systemPrompt ? `"${proc.systemPrompt.slice(0, 50)}..."` : "未设置"}, 用户提示词: ${proc.userPrompt ? `"${proc.userPrompt.slice(0, 50)}..."` : "未设置"}`;
            break;
          default:
            configSummary = JSON.stringify(config).slice(0, 200);
        }

        let nodeDesc = `- 节点 "${data.name}" (ID: ${node.id}, 类型: ${data.type})\n  配置: ${configSummary}`;

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
  }, [nodes, edges]);

  // 执行精修
  const handleRefine = useCallback(async () => {
    if (!refinePrompt.trim()) {
      toast.error("请输入精修指令");
      return;
    }

    if (nodes.length === 0 && operation !== "add") {
      toast.error("工作流为空，请先添加节点或选择添加节点操作");
      return;
    }

    if ((operation === "modify" || operation === "delete") && !selectedNodeId) {
      toast.error("请选择要操作的节点");
      return;
    }

    setIsRefining(true);
    setResult(null);
    setApplied(false);

    try {
      const workflowContext = generateWorkflowContext();

      // 构建精修请求
      const response = await fetchWithTimeout("/api/ai-assistant/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          workflowContext,
          model: selectedModel,
          operation,
          targetNodeId: selectedNodeId || undefined,
          prompt: refinePrompt,
        }),
        timeoutMs: 60000,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "精修请求失败");
      }

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          summary: data.summary || "精修方案已生成",
          nodeActions: data.nodeActions || [],
          explanation: data.explanation,
        });

        addMessage({
          role: "assistant",
          content: `精修完成：${data.summary}\n\n${data.explanation || ""}`,
          nodeActions: data.nodeActions,
          messageType: "optimization",
        });

        toast.success("精修方案已生成");
      } else {
        throw new Error(data.error || "精修失败");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "精修请求失败";
      toast.error(msg);
      setResult({
        success: false,
        summary: msg,
        nodeActions: [],
      });
    } finally {
      setIsRefining(false);
    }
  }, [
    workflowId,
    nodes,
    operation,
    selectedNodeId,
    refinePrompt,
    selectedModel,
    generateWorkflowContext,
    addMessage,
  ]);

  // 应用精修结果
  const applyRefine = useCallback(() => {
    if (!result || !result.nodeActions || result.nodeActions.length === 0) {
      toast.warning("没有可应用的操作");
      return;
    }

    const addedNodes: string[] = [];

    result.nodeActions.forEach((action) => {
      if (action.action === "add" && action.nodeType && action.nodeName) {
        const nodeId = `${action.nodeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        addNode({
          id: nodeId,
          type: action.nodeType,
          name: action.nodeName,
          position: action.position || { x: 100, y: 100 + nodes.length * 150 },
          config: action.config || {},
        } as any);
        addedNodes.push(nodeId);
        toast.success(`已添加节点: ${action.nodeName}`);
      } else if (action.action === "update" && action.nodeId && action.config) {
        const targetNode = nodes.find((n) => n.id === action.nodeId);
        if (targetNode) {
          const currentConfig = (targetNode.data as NodeConfig).config || {};
          const mergedConfig = { ...currentConfig, ...action.config };
          updateNode(action.nodeId, { config: mergedConfig } as any);
          toast.success(`已更新节点: ${action.nodeName || action.nodeId}`);
        }
      } else if (action.action === "delete" && action.nodeId) {
        deleteNode(action.nodeId);
        toast.success(`已删除节点: ${action.nodeName || action.nodeId}`);
      } else if (action.action === "connect" && action.source && action.target) {
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
      }
    });

    setApplied(true);
    setPhase("testing");
  }, [result, nodes, addNode, updateNode, deleteNode, onConnect, setPhase]);

  // 获取选中节点信息
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    return {
      id: node.id,
      name: (node.data as NodeConfig).name,
      type: (node.data as NodeConfig).type,
      config: (node.data as NodeConfig).config,
    };
  }, [nodes, selectedNodeId]);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部配置区域 */}
      <div className="p-4 border-b space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 mb-3">
            <Crosshair className="h-6 w-6 text-indigo-600" />
          </div>
          <h4 className="font-medium text-gray-800">精准修改</h4>
          <p className="text-xs text-gray-500 mt-1">
            根据指令精确修改工作流配置
          </p>
        </div>

        {/* 操作类型选择 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">操作类型</Label>
          <div className="grid grid-cols-2 gap-2">
            {REFINE_OPERATIONS.map((op) => {
              const Icon = op.icon;
              return (
                <button
                  key={op.id}
                  onClick={() => {
                    setOperation(op.id);
                    if (op.id === "add") {
                      setSelectedNodeId("");
                    }
                  }}
                  className={cn(
                    "flex flex-col items-start rounded-lg border p-3 text-left transition-all",
                    operation === op.id
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={cn(
                        "h-6 w-6 rounded flex items-center justify-center",
                        op.bgColor
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", op.color)} />
                    </div>
                    <span className="text-sm font-medium">{op.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {op.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 节点选择（修改或删除时需要） */}
        {(operation === "modify" || operation === "delete" || operation === "reconnect") && nodeOptions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">
              目标节点
              {operation === "modify" && " (要修改的节点)"}
              {operation === "delete" && " (要删除的节点)"}
              {operation === "reconnect" && " (起始节点)"}
            </Label>
            <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择节点..." />
              </SelectTrigger>
              <SelectContent>
                {nodeOptions.map((node) => (
                  <SelectItem key={node.id} value={node.id} className="text-xs">
                    {node.name} ({node.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 选中节点信息预览 */}
        {selectedNode && operation === "modify" && (
          <div className="p-2 rounded bg-gray-50 text-xs">
            <div className="text-gray-500 mb-1">当前配置:</div>
            <pre className="whitespace-pre-wrap text-gray-700 max-h-20 overflow-y-auto">
              {JSON.stringify(selectedNode.config, null, 2)}
            </pre>
          </div>
        )}

        {/* 精修指令输入 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">
            精修指令
          </Label>
          <Textarea
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            placeholder={
              operation === "modify"
                ? "例如：将系统提示词改为更专业的口吻..."
                : operation === "add"
                  ? "例如：在AI处理节点之后添加一个输出节点..."
                  : operation === "delete"
                    ? "例如：删除这个节点并重新连接上下游..."
                    : "例如：将节点A连接到节点C..."
            }
            className="min-h-[80px] resize-none text-xs"
          />
        </div>

        {/* 执行精修按钮 */}
        <Button
          onClick={handleRefine}
          disabled={isRefining || !refinePrompt.trim()}
          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
        >
          {isRefining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Crosshair className="mr-2 h-4 w-4" />
              执行精修
            </>
          )}
        </Button>
      </div>

      {/* 结果区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {!result ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <Crosshair className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm">选择操作类型并输入指令</p>
            <p className="text-xs mt-1">AI将精准执行你的修改意图</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 结果摘要 */}
            <div className={cn(
              "p-3 rounded-lg",
              result.success ? "bg-green-50" : "bg-red-50"
            )}>
              <p className={cn(
                "text-sm",
                result.success ? "text-green-700" : "text-red-700"
              )}>
                {result.summary}
              </p>
            </div>

            {/* 解释说明 */}
            {result.explanation && (
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-600">{result.explanation}</p>
              </div>
            )}

            {/* 操作列表 */}
            {result.nodeActions && result.nodeActions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-500">
                  将执行的操作 ({result.nodeActions.length}项)
                </Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.nodeActions.map((action, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-xs p-2 rounded bg-white border"
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
                      <span className="text-gray-600">
                        {action.action === "add" &&
                          `添加节点: ${action.nodeName}`}
                        {action.action === "update" &&
                          `更新节点: ${action.nodeName || action.nodeId}`}
                        {action.action === "delete" &&
                          `删除节点: ${action.nodeName || action.nodeId}`}
                        {action.action === "connect" &&
                          `连接: ${action.source} → ${action.target}`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 mt-3">
                  {onPreview && !applied && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => onPreview(result.nodeActions)}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      预览
                    </Button>
                  )}
                  {!applied ? (
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-indigo-500 hover:bg-indigo-600"
                      onClick={applyRefine}
                    >
                      <Sparkles className="mr-1 h-3 w-3" />
                      应用修改
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-green-500 hover:bg-green-600"
                      disabled
                    >
                      <Check className="mr-1 h-3 w-3" />
                      已应用
                    </Button>
                  )}
                </div>

                {/* 应用后的操作提示 */}
                {applied && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-100 mt-3">
                    <p className="text-xs font-medium text-green-700 mb-2">
                      修改已应用，建议验证
                    </p>
                    <button
                      onClick={() => {
                        setMode("test");
                        toast.info("已切换到测试模式");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-green-200 hover:bg-green-50 transition-colors text-left"
                    >
                      <FlaskConical className="h-4 w-4 text-amber-500" />
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-700">
                          去测试
                        </span>
                        <p className="text-[10px] text-gray-500">
                          执行测试验证修改效果
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </button>
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
