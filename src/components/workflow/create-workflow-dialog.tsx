"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Wand2, ArrowLeft, ArrowRight, Check, Edit3 } from "lucide-react";
import { toast } from "sonner";

type Step = "input" | "confirm";

export function CreateWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [prompt, setPrompt] = useState("");
  const [detailedPrompt, setDetailedPrompt] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const router = useRouter();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("input");
      setPrompt("");
      setDetailedPrompt("");
      setRecommendations([]);
      setSelectedTemplateId(null);
    }
  }, [open]);

  const fetchRecs = async (text: string) => {
    if (!text || text.length < 5) return;
    setIsLoadingRecs(true);
    try {
      const res = await fetch("/api/templates/recommend", {
        method: "POST",
        body: JSON.stringify({ requirement: text, limit: 3 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  // Debounced fetch
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);
    setSelectedTemplateId(null);

    if (timer) clearTimeout(timer);
    if (val.length > 5) {
      setTimer(setTimeout(() => fetchRecs(val), 1000));
    } else {
      setRecommendations([]);
    }
  };

  // Step 1: Generate detailed prompt
  const handleGeneratePrompt = async () => {
    if (!prompt.trim()) return;

    setIsGeneratingPrompt(true);
    try {
      const response = await fetch("/api/ai-assistant/generate-workflow-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || error.message || "生成失败");
      }

      const result = await response.json();
      setDetailedPrompt(result.data?.detailedPrompt || result.detailedPrompt || "");
      setStep("confirm");
      toast.success("已生成详细提示词，请确认或修改");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Step 2: Create workflow with detailed prompt
  const handleCreate = async () => {
    if (!detailedPrompt.trim() && !selectedTemplateId) return;

    setIsCreating(true);
    try {
      const payload = selectedTemplateId
        ? { templateId: selectedTemplateId }
        : { prompt: detailedPrompt };

      const response = await fetch("/api/ai-assistant/create-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error?.message || result.message || "创建失败";
        throw new Error(errorMessage);
      }

      const workflowId = result.data?.id || result.id;

      if (!workflowId) {
        throw new Error("创建成功但未返回工作流 ID，请刷新页面查看");
      }

      toast.success(
        selectedTemplateId
          ? "已基于模板创建工作流"
          : "工作流创建成功，正在跳转..."
      );
      setOpen(false);
      router.push(`/workflows/${workflowId}`);
    } catch (error) {
      console.error("[CreateWorkflow] Error:", error);
      toast.error(error instanceof Error ? error.message : "创建失败，请重试");
    } finally {
      setIsCreating(false);
    }
  };

  // Direct create from template (skip step 2)
  const handleTemplateCreate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsCreating(true);
    try {
      const response = await fetch("/api/ai-assistant/create-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error?.message || result.message || "创建失败";
        throw new Error(errorMessage);
      }

      const workflowId = result.data?.id || result.id;

      if (!workflowId) {
        throw new Error("创建成功但未返回工作流 ID，请刷新页面查看");
      }

      toast.success("已基于模板创建工作流");
      setOpen(false);
      router.push(`/workflows/${workflowId}`);
    } catch (error) {
      console.error("[CreateWorkflow] Template error:", error);
      toast.error(error instanceof Error ? error.message : "创建失败，请重试");
    } finally {
      setIsCreating(false);
      setSelectedTemplateId(null);
    }
  };

  // Long loading warning
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCreating) {
      timer = setTimeout(() => {
        toast.info(
          "AI 正在深度思考，构建复杂工作流可能需要 15-30 秒，请耐心等待..."
        );
      }, 8000);
    }
    return () => clearTimeout(timer);
  }, [isCreating]);

  const handleBack = () => {
    setStep("input");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className="gap-2 bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600 border-0"
        >
          <Sparkles className="h-4 w-4" />
          AI 帮我建
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-violet-500" />
            AI 智能创建工作流
          </DialogTitle>
          <DialogDescription>
            {step === "input"
              ? "描述您的需求，AI 将为您生成详细的工作流提示词供您确认。"
              : "请确认或修改以下工作流描述，确认后将创建工作流。"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            step === "input"
              ? "bg-violet-100 text-violet-700"
              : "bg-gray-100 text-gray-500"
          }`}>
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center">1</span>
            描述需求
          </div>
          <ArrowRight className="h-4 w-4 text-gray-300" />
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            step === "confirm"
              ? "bg-violet-100 text-violet-700"
              : "bg-gray-100 text-gray-500"
          }`}>
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center">2</span>
            确认创建
          </div>
        </div>

        {step === "input" ? (
          // Step 1: Input brief description
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">描述您的需求</Label>
              <Textarea
                id="prompt"
                placeholder="例如：我想要一个能自动抓取网页内容，总结摘要，并发送到飞书的工作流..."
                className="h-[100px] resize-none"
                value={prompt}
                onChange={handlePromptChange}
                disabled={isGeneratingPrompt || isCreating}
              />
            </div>

            {/* Recommendations Section - Fixed height to prevent jumping */}
            <div className="space-y-2 min-h-[120px]">
              {isLoadingRecs ? (
                <>
                  <Label className="text-xs text-muted-foreground">
                    正在匹配模板...
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-24 bg-muted animate-pulse rounded-md"
                      />
                    ))}
                  </div>
                </>
              ) : recommendations.length > 0 ? (
                <>
                  <Label className="text-xs text-muted-foreground">
                    为您推荐的模板 (点击可直接使用):
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    {recommendations.map((rec) => (
                      <div
                        key={rec.id}
                        onClick={() => !isCreating && handleTemplateCreate(rec.id)}
                        className={`border rounded-md p-3 cursor-pointer transition-all hover:bg-violet-50 relative ${
                          selectedTemplateId === rec.id
                            ? "ring-2 ring-violet-500 bg-violet-50"
                            : "bg-white"
                        } ${isCreating ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <div
                          className="font-medium text-sm truncate"
                          title={rec.name}
                        >
                          {rec.name}
                        </div>
                        <div
                          className="text-xs text-muted-foreground line-clamp-2 mt-1"
                          title={rec.description}
                        >
                          {rec.reason || rec.description}
                        </div>
                        {rec.score > 0 && (
                          <div className="absolute top-1 right-1 px-1 rounded bg-green-100 text-green-700 text-[10px]">
                            {(rec.score * 100).toFixed(0)}% 匹配
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  输入需求描述后，将为您推荐相似的模板
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <p className="text-xs text-muted-foreground w-full">
                或者试试这些示例：
              </p>
              <ExampleButton
                text="客服自动回复"
                prompt="创建一个客服自动回复工作流，根据用户问题分类，如果是售后问题转人工，否则自动回答"
                setPrompt={(t) => {
                  setPrompt(t);
                  handlePromptChange({ target: { value: t } } as any);
                }}
              />
              <ExampleButton
                text="新闻简报助手"
                prompt="每天早上9点抓取科技新闻，生成简报并发送邮件"
                setPrompt={(t) => {
                  setPrompt(t);
                  handlePromptChange({ target: { value: t } } as any);
                }}
              />
              <ExampleButton
                text="图片营销助手"
                prompt="图片处理工作流：上传图片，去除背景，然后生成营销文案"
                setPrompt={(t) => {
                  setPrompt(t);
                  handlePromptChange({ target: { value: t } } as any);
                }}
              />
            </div>
          </div>
        ) : (
          // Step 2: Confirm detailed prompt
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="detailedPrompt" className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4" />
                  工作流详细描述
                </Label>
                <span className="text-xs text-muted-foreground">
                  您可以修改以下内容来调整工作流
                </span>
              </div>
              <Textarea
                id="detailedPrompt"
                className="h-[300px] resize-none font-mono text-sm"
                value={detailedPrompt}
                onChange={(e) => setDetailedPrompt(e.target.value)}
                disabled={isCreating}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "input" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isGeneratingPrompt || isCreating}
              >
                取消
              </Button>
              <Button
                onClick={handleGeneratePrompt}
                disabled={!prompt.trim() || isGeneratingPrompt || isCreating}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {isGeneratingPrompt ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    生成提示词
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isCreating}
                className="mr-auto"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回修改
              </Button>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isCreating}
              >
                取消
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!detailedPrompt.trim() || isCreating}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在创建工作流...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    确认创建
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExampleButton({
  text,
  prompt,
  setPrompt,
}: {
  text: string;
  prompt: string;
  setPrompt: (s: string) => void;
}) {
  return (
    <button
      className="text-xs border rounded-full px-3 py-1 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
      onClick={() => setPrompt(prompt)}
    >
      {text}
    </button>
  );
}
