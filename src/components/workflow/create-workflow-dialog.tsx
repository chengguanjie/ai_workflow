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
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export function CreateWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const router = useRouter();

  // Debounce logic for recommendations could be added, but for now we'll fetch on a button or blur
  // Or simple effect when prompt length > 5
  // Let's add a manual "Get Inspiration" button or just useEffect with debounce.
  // Actually, to keep it simple and controllable, let's fetch when user stops typing for 1s.

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
    setSelectedTemplateId(null); // Clear selection if typing

    if (timer) clearTimeout(timer);
    if (val.length > 5) {
      setTimer(setTimeout(() => fetchRecs(val), 1000));
    } else {
      setRecommendations([]);
    }
  };

  const handleCreate = async () => {
    if (!prompt.trim() && !selectedTemplateId) return;

    setIsCreating(true);
    try {
      const payload = selectedTemplateId
        ? { templateId: selectedTemplateId }
        : { prompt };

      const response = await fetch("/api/ai-assistant/create-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || error.message || "创建失败");
      }

      const result = await response.json();
      const workflowId = result.data?.id || result.id;

      toast.success(
        selectedTemplateId
          ? "已基于模板创建工作流"
          : "工作流创建成功，正在跳转...",
      );
      setOpen(false);

      if (workflowId) {
        router.push(`/workflows/${workflowId}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  // Long loading warning
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCreating) {
      timer = setTimeout(() => {
        toast.info(
          "AI 正在深度思考，构建复杂工作流可能需要 15-30 秒，请耐心等待...",
        );
      }, 8000);
    }
    return () => clearTimeout(timer);
  }, [isCreating]);

  const handleTemplateClick = (template: any) => {
    setSelectedTemplateId(template.id);
    // Optional: fill prompt with template description or keep user prompt?
    // Maybe keep prompt as is but visual highlight the card.
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
            描述您的需求，AI 将为您生成工作流，或为您推荐相似的现有模板。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">描述您的需求</Label>
            <Textarea
              id="prompt"
              placeholder="例如：我想要一个能自动抓取网页内容，总结摘要，并发送到飞书的工作流..."
              className="h-[100px] resize-none"
              value={prompt}
              onChange={handlePromptChange}
              disabled={isCreating}
            />
          </div>

          {/* Recommendations Section */}
          {(isLoadingRecs || recommendations.length > 0) && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {isLoadingRecs
                  ? "正在匹配模板..."
                  : "为您推荐的模板 (点击可直接使用):"}
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {isLoadingRecs && recommendations.length === 0
                  ? [1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-24 bg-muted animate-pulse rounded-md"
                      />
                    ))
                  : recommendations.map((rec) => (
                      <div
                        key={rec.id}
                        onClick={() => handleTemplateClick(rec)}
                        className={`border rounded-md p-3 cursor-pointer transition-all hover:bg-violet-50 relative ${selectedTemplateId === rec.id ? "ring-2 ring-violet-500 bg-violet-50" : "bg-white"}`}
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
            </div>
          )}

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
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isCreating}
          >
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={(!prompt.trim() && !selectedTemplateId) || isCreating}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {selectedTemplateId ? "正在克隆模板..." : "正在生成工作流..."}
                {isCreating && (
                  <span className="ml-2 text-xs opacity-80 animate-pulse">
                    (AI 思考中，请稍候...)
                  </span>
                )}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {selectedTemplateId ? "使用此模板" : "开始生成"}
              </>
            )}
          </Button>
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
