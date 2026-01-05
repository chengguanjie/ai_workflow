"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkflowStore } from "@/stores/workflow-store";
import { Save, Play, ArrowLeft, Loader2, Cloud, CloudOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NodePanel } from "@/components/workflow/node-panel";
import { NodeConfigPanel } from "@/components/workflow/node-config-panel";
import { nodeTypes } from "@/components/workflow/nodes";
import { toast } from "sonner";
import dynamic from "next/dynamic";

// Lazy load NodeDebugPanel
const NodeDebugPanel = dynamic(
  () =>
    import("@/components/workflow/node-debug-panel").then(
      (mod) => mod.NodeDebugPanel,
    ),
  { ssr: false },
);

function WorkflowEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved",
  );
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    id: workflowId,
    nodes,
    edges,
    viewport,
    name,
    description,
    isDirty,
    setName,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectedNodeId,
    getWorkflowConfig,
    markSaved,
    setViewport,
    reset,
    openDebugPanel,
  } = useWorkflowStore();

  // 新建工作流页面：重置 store 以创建全新的工作流
  useEffect(() => {
    reset();
  }, [reset]);

  // 自动保存到数据库（仅当已有 workflowId 时）
  const autoSaveToDb = useCallback(
    async (silent = true) => {
      if (!workflowId || !name.trim() || nodes.length === 0) return;

      setSaveStatus("saving");
      try {
        const config = getWorkflowConfig();
        const response = await fetch(`/api/workflows/${workflowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, config }),
        });

        if (!response.ok) {
          throw new Error("保存失败");
        }

        markSaved();
        setSaveStatus("saved");
        if (!silent) {
          toast.success("工作流已保存");
        }
      } catch (error) {
        setSaveStatus("unsaved");
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "保存失败");
        }
      }
    },
    [workflowId, name, description, nodes, getWorkflowConfig, markSaved],
  );

  // 监听数据变化，触发自动保存
  useEffect(() => {
    if (!isDirty) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("unsaved");

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 如果已有 workflowId，3秒后自动保存到数据库
    if (workflowId) {
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveToDb(true);
      }, 3000);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, workflowId, autoSaveToDb]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error("请输入工作流名称");
      return;
    }

    if (nodes.length === 0) {
      toast.error("工作流至少需要一个节点");
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");
    try {
      const config = getWorkflowConfig();

      if (workflowId) {
        // 更新现有工作流
        const response = await fetch(`/api/workflows/${workflowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, config }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "保存失败");
        }

        markSaved();
        setSaveStatus("saved");
        toast.success("工作流已保存");
      } else {
        // 创建新工作流
        const response = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, config }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "创建失败");
        }

        const result = await response.json();
        const workflow = result.data;
        markSaved();
        setSaveStatus("saved");
        toast.success("工作流已创建");
        router.push(`/workflows/${workflow.id}`);
      }
    } catch (error) {
      setSaveStatus("unsaved");
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [
    workflowId,
    name,
    description,
    nodes,
    getWorkflowConfig,
    router,
    markSaved,
  ]);

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
        type: type.toUpperCase() as "INPUT" | "PROCESS" | "CODE" | "OUTPUT",
        name: getNodeName(type),
        position,
        config: getDefaultConfig(type),
      } as never);
    },
    [screenToFlowPosition, addNode],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string; data?: { type?: string } }) => {
      // 选中节点，触发高亮效果
      selectNode(node.id);

      const nodeType = node.data?.type?.toLowerCase();
      // input / process / logic 节点：打开调试面板
      if (nodeType === "input" || nodeType === "process" || nodeType === "logic") {
        openDebugPanel(node.id);
      }
      // code / output 等其他节点：通过 selectedNodeId 让右侧配置面板自动展开
    },
    [selectNode, openDebugPanel],
  );

  const onPaneClick = useCallback(() => {
    // 点击画布空白处：清空选中节点，配置面板自动收起
    selectNode(null);
  }, [selectNode]);

  // 判断选中节点类型，决定是否显示配置面板
  const shouldShowConfigPanel = useCallback(() => {
    if (!selectedNodeId) return false;
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const nodeType = (
      selectedNode?.data as { type?: string }
    )?.type?.toLowerCase();
    // input、process 和 logic 节点不显示配置面板，只用调试面板
    return nodeType !== "input" && nodeType !== "process" && nodeType !== "logic";
  }, [selectedNodeId, nodes]);

  return (
    <div className="flex h-screen">
      {/* 左侧工具栏 */}
      <div className="flex w-14 flex-col items-center border-r bg-background py-4">
        <Link href="/workflows">
          <Button variant="ghost" size="icon" className="mb-4">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSave}
          disabled={isSaving}
          className="mb-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon">
          <Play className="h-4 w-4" />
        </Button>
      </div>

      {/* 编辑器主体 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部名称输入 */}
        <div className="flex items-center justify-between border-b bg-background px-4 py-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64 border-none bg-transparent text-lg font-semibold focus-visible:ring-0"
            placeholder="工作流名称"
          />
          {/* 保存状态指示器 */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>保存中...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Cloud className="h-4 w-4 text-green-500" />
                <span>已保存</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <CloudOff className="h-4 w-4 text-orange-500" />
                <span>未保存</span>
              </>
            )}
          </div>
        </div>

        {/* 中间区域：画布和右侧配置面板 */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 中间画布 */}
          <div ref={reactFlowWrapper} className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
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
              snapToGrid
              snapGrid={[15, 15]}
            >
              <Background gap={15} />
              <Controls />
              <MiniMap />
              <Panel
                position="top-left"
                className="text-xs text-muted-foreground"
              >
                节点: {nodes.length} | 连接: {edges.length}
              </Panel>
            </ReactFlow>
          </div>

          {/* 右侧配置面板 - input 和 process 节点不显示 */}
          {shouldShowConfigPanel() && <NodeConfigPanel />}
        </div>

        {/* 底部节点面板 */}
        <NodePanel />
      </div>

      {/* 节点调试面板 */}
      <NodeDebugPanel />
    </div>
  );
}

function getNodeName(type: string): string {
  const names: Record<string, string> = {
    input: "用户输入",
    process: "AI处理",
    code: "代码",
    output: "输出",
  };
  return names[type] || "节点";
}

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
        maxTokens: 2048,
      };
    case "code":
      return {
        provider: "OPENROUTER",
        model: "deepseek/deepseek-coder",
        prompt: "",
        language: "javascript",
        generatedCode: "",
      };
    case "output":
      return {
        provider: "OPENROUTER",
        model: "deepseek/deepseek-chat",
        prompt: "",
        format: "text",
        templateName: "",
      };
    default:
      return {};
  }
}

export default function NewWorkflowPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
