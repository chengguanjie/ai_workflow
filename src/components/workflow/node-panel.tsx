"use client";

import { DragEvent, memo, useCallback } from "react";
import { ArrowDownToLine, Bot, GitBranch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAIAssistantStore } from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";

export interface NodeType {
  type: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

// 主要节点（直接显示）：用户输入、AI处理
export const primaryNodes: NodeType[] = [
  {
    type: "input",
    name: "用户输入",
    description: "定义工作流输入字段",
    icon: ArrowDownToLine,
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
  {
    type: "process",
    name: "AI处理",
    description: "AI 文本处理，支持知识库",
    icon: Bot,
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
  {
    type: "logic",
    name: "逻辑判断",
    description: "条件/分支/合并/分支选择控制流",
    icon: GitBranch,
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
];

// 保留空数组以保持向后兼容
export const mediaNodes: NodeType[] = [];
export const logicNodes: NodeType[] = [];
export const connectionNodes: NodeType[] = [];

// 兼容旧的导出名称
export const moreNodes: NodeType[] = [];
export const advancedNodes: NodeType[] = [];
export const mediaDataNodes: NodeType[] = [];

// 合并所有更多节点（用于测试和外部引用）
export const allMoreNodes: NodeType[] = [];

// 所有节点类型（用于测试完整性验证）
export const allNodeTypes: NodeType[] = [...primaryNodes];

// 获取节点默认配置
function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type) {
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
    case "logic":
      return {
        mode: "condition",
        conditions: [],
      };
    default:
      return {};
  }
}

// 获取节点名称
function getNodeName(type: string): string {
  const names: Record<string, string> = {
    input: "用户输入",
    process: "AI处理",
    logic: "逻辑判断",
  };
  return names[type] || "节点";
}

export const NodePanel = memo(function NodePanel() {
  const openAIPanel = useAIAssistantStore((state) => state.openPanel);
  const { addNode, nodes } = useWorkflowStore();

  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  // 点击直接添加节点
  const handleAddNode = useCallback(
    (nodeType: string) => {
      const nodeId = `${nodeType}_${Date.now()}`;
      // 计算新节点位置，在画布中心偏移
      const position = {
        x: 300 + (nodes.length % 3) * 300,
        y: 200 + Math.floor(nodes.length / 3) * 200,
      };

      addNode({
        id: nodeId,
        type: nodeType.toUpperCase() as "INPUT" | "PROCESS" | "LOGIC",
        name: getNodeName(nodeType),
        position,
        config: getDefaultConfig(nodeType),
      } as never);
    },
    [addNode, nodes.length],
  );

  const renderNode = (node: NodeType) => (
    <div
      key={node.type}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 transition-colors hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100"
      draggable
      onDragStart={(e) => onDragStart(e, node.type)}
      onClick={() => handleAddNode(node.type)}
      title={node.description}
    >
      <node.icon className="h-4 w-4 text-gray-600" />
      <span className="text-sm font-medium text-gray-700">{node.name}</span>
    </div>
  );

  return (
    <div className="flex shrink-0 items-center justify-center border-t bg-gray-50/80 px-6 py-3">
      {/* 居中显示的节点按钮组 */}
      <div className="flex items-center gap-3">
        {/* AI规划按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={openAIPanel}
          className="flex items-center gap-2 border-gray-200 bg-white hover:bg-gray-50"
        >
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium text-gray-700">AI规划</span>
        </Button>

        {/* 分隔线 */}
        <div className="h-6 w-px bg-gray-200" />

        {/* 主要节点：用户输入、AI处理 */}
        {primaryNodes.map(renderNode)}
      </div>
    </div>
  );
});
