"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  FileText,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  useAIAssistantStore,
  type CreateWorkflowDraft,
} from "@/stores/ai-assistant-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

interface CreateWorkflowSectionProps {
  workflowId: string;
  selectedModel: string;
}

const EXAMPLES = [
  {
    label: "客服问答系统",
    prompt: "我想做一个客服问答系统，可以自动回复用户的问题",
  },
  {
    label: "文档生成器",
    prompt: "帮我创建一个文档自动生成的工作流",
  },
  {
    label: "数据分析报告",
    prompt: "我需要一个数据分析报告生成器",
  },
  {
    label: "内容审核",
    prompt: "创建一个AI内容审核工作流，检测文本是否合规",
  },
  {
    label: "多模态内容生产",
    prompt:
      "帮我设计一个多模态内容生产工作流，要求：1）用图片生成工具生成公众号/小红书配图；2）用视频生成工具生成 15 秒竖版短视频脚本对应的视频；3）用音频生成（TTS）工具把最终文案转成播客口播音频。",
  },
];

export function CreateWorkflowSection({
  workflowId,
  selectedModel,
}: CreateWorkflowSectionProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [recommendTimer, setRecommendTimer] = useState<NodeJS.Timeout | null>(
    null
  );

  const {
    createWorkflowDraft,
    setCreateWorkflowDraft,
    resetCreateWorkflowDraft,
  } = useAIAssistantStore();

  const { nodes, addNode, onConnect } = useWorkflowStore();

  // 防抖获取模板推荐
  const fetchRecommendations = useCallback(
    async (prompt: string) => {
      if (prompt.length < 5) {
        setCreateWorkflowDraft({ recommendations: [] });
        return;
      }

      setIsLoadingRecs(true);
      try {
        const response = await fetchWithTimeout("/api/templates/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement: prompt, limit: 3 }),
          timeoutMs: 30000,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.recommendations) {
            setCreateWorkflowDraft({ recommendations: data.recommendations });
          }
        }
      } catch (error) {
        console.error("获取模板推荐失败:", error);
      } finally {
        setIsLoadingRecs(false);
      }
    },
    [setCreateWorkflowDraft]
  );

  // 输入变化时触发防抖推荐
  const handlePromptChange = useCallback(
    (value: string) => {
      setCreateWorkflowDraft({ prompt: value });

      if (recommendTimer) {
        clearTimeout(recommendTimer);
      }

      if (value.length >= 5) {
        const timer = setTimeout(() => {
          fetchRecommendations(value);
        }, 1000);
        setRecommendTimer(timer);
      } else {
        setCreateWorkflowDraft({ recommendations: [] });
      }
    },
    [recommendTimer, fetchRecommendations, setCreateWorkflowDraft]
  );

  // 清理定时器
  useEffect(() => {
    return () => {
      if (recommendTimer) {
        clearTimeout(recommendTimer);
      }
    };
  }, [recommendTimer]);

  // 生成详细提示词
  const handleGeneratePrompt = async () => {
    if (!createWorkflowDraft.prompt.trim()) {
      toast.error("请输入需求描述");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetchWithTimeout(
        "/api/ai-assistant/generate-workflow-prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: createWorkflowDraft.prompt,
            model: selectedModel,
          }),
          timeoutMs: 60000,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "生成失败");
      }

      const data = await response.json();
      if (data.success && data.detailedPrompt) {
        setCreateWorkflowDraft({
          detailedPrompt: data.detailedPrompt,
          step: "confirm",
        });
        toast.success("已生成详细规格说明");
      } else {
        throw new Error("未获取到详细提示词");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "生成失败";
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // 从模板创建
  const handleTemplateCreate = async (templateId: string) => {
    setIsCreating(true);
    try {
      const response = await fetchWithTimeout(
        "/api/ai-assistant/create-workflow",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId }),
          timeoutMs: 60000,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "创建失败");
      }

      const data = await response.json();
      if (data.success && data.id) {
        toast.success("工作流创建成功");
        resetCreateWorkflowDraft();
        router.push(`/workflows/${data.id}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "创建失败";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  // 确认创建工作流
  const handleConfirmCreate = async () => {
    if (!createWorkflowDraft.detailedPrompt.trim()) {
      toast.error("请先生成详细规格说明");
      return;
    }

    setIsCreating(true);
    try {
      // 如果当前工作流已有节点，则直接在当前工作流添加
      // 否则创建新工作流
      if (nodes.length > 0) {
        // 调用 chat API 来生成节点并添加到当前工作流
        const response = await fetchWithTimeout("/api/ai-assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `请根据以下规格说明生成工作流节点：\n\n${createWorkflowDraft.detailedPrompt}`,
            model: selectedModel,
            workflowId,
            workflowContext: "当前画布已有节点，请在现有基础上添加新节点",
            history: [],
          }),
          timeoutMs: 120000,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "生成失败");
        }

        const data = await response.json();
        if (data.nodeActions && data.nodeActions.length > 0) {
          // 应用节点操作
          applyNodeActionsToCanvas(data.nodeActions);
          toast.success("已将新节点添加到画布");
          resetCreateWorkflowDraft();
        } else {
          throw new Error("未生成有效的节点操作");
        }
      } else {
        // 创建新工作流
        const response = await fetchWithTimeout(
          "/api/ai-assistant/create-workflow",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: createWorkflowDraft.detailedPrompt,
            }),
            timeoutMs: 120000,
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "创建失败");
        }

        const data = await response.json();
        if (data.success && data.id) {
          toast.success("工作流创建成功");
          resetCreateWorkflowDraft();
          // 如果是新创建的工作流，跳转到新工作流
          if (data.id !== workflowId) {
            router.push(`/workflows/${data.id}`);
          } else {
            // 刷新当前页面以加载新配置
            router.refresh();
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "创建失败";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  // 应用节点操作到画布
  const applyNodeActionsToCanvas = (actions: any[]) => {
    const addedNodes: string[] = [];

    actions.forEach((action: any) => {
      if (action.action === "add" && action.nodeType && action.nodeName) {
        const nodeId = `${action.nodeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
        const position = action.position || {
          x: 100 + Math.random() * 200,
          y: 100 + addedNodes.length * 150,
        };

        addNode({
          id: nodeId,
          type: action.nodeType,
          name: action.nodeName,
          position,
          config: action.config || {},
        } as any);

        addedNodes.push(nodeId);
      } else if (
        action.action === "connect" &&
        action.source &&
        action.target
      ) {
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
  };

  // 返回输入步骤
  const handleBack = () => {
    setCreateWorkflowDraft({ step: "input" });
  };

  return (
    <div className="flex flex-col h-full">
      {createWorkflowDraft.step === "input" ? (
        // 步骤 1：输入需求
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100 mb-3">
              <Wand2 className="h-6 w-6 text-violet-600" />
            </div>
            <h4 className="font-medium text-gray-800">创建新工作流</h4>
            <p className="text-xs text-gray-500 mt-1">
              描述你的需求，AI 将帮你生成工作流
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">
              需求描述
            </Label>
            <Textarea
              value={createWorkflowDraft.prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="描述你想要实现的功能，例如：我需要一个客服问答系统..."
              className="min-h-[100px] resize-none text-sm"
            />
          </div>

          {/* 快速示例 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-500">
              快速选择
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  onClick={() => handlePromptChange(example.prompt)}
                  className="text-left rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs hover:bg-gray-100 hover:border-gray-300 transition-colors"
                >
                  <Lightbulb className="h-3 w-3 text-amber-500 inline mr-1" />
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          {/* 模板推荐 */}
          {(createWorkflowDraft.recommendations.length > 0 || isLoadingRecs) && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-500">
                推荐模板
              </Label>
              {isLoadingRecs ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  正在匹配模板...
                </div>
              ) : (
                <div className="space-y-2">
                  {createWorkflowDraft.recommendations.map((rec) => (
                    <button
                      key={rec.id}
                      onClick={() => handleTemplateCreate(rec.id)}
                      disabled={isCreating}
                      className={cn(
                        "w-full text-left rounded-lg border p-3 transition-all hover:border-violet-400 hover:bg-violet-50",
                        isCreating && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-violet-500" />
                            <span className="font-medium text-sm truncate">
                              {rec.name}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {rec.reason || rec.description}
                          </p>
                        </div>
                        {rec.score > 0 && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px]">
                            {(rec.score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 生成按钮 */}
          <Button
            onClick={handleGeneratePrompt}
            disabled={!createWorkflowDraft.prompt.trim() || isGenerating}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                生成详细规格
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      ) : (
        // 步骤 2：确认创建
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <span className="text-sm font-medium text-gray-700">
              确认规格说明
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-700">
              详细规格说明
              <span className="text-gray-400 font-normal ml-2">
                (可编辑)
              </span>
            </Label>
            <Textarea
              value={createWorkflowDraft.detailedPrompt}
              onChange={(e) =>
                setCreateWorkflowDraft({ detailedPrompt: e.target.value })
              }
              className="min-h-[300px] resize-none text-xs font-mono"
            />
          </div>

          <Button
            onClick={handleConfirmCreate}
            disabled={
              !createWorkflowDraft.detailedPrompt.trim() || isCreating
            }
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {nodes.length > 0 ? "添加到当前工作流" : "创建工作流"}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
