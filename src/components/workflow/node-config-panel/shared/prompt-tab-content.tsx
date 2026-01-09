"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Expand, Wrench } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReferenceSelector } from "./reference-selector";
import { InputBindingsPanel, extractSlotsFromPrompt } from "./input-bindings-panel";
import {
  HighlightedTextarea,
  type HighlightedTextareaHandle,
} from "./highlighted-textarea";
import { ResizablePromptDialog } from "./resizable-prompt-dialog";
import { AIGenerateButton } from "./ai-generate-button";
import { ToolsSection, type ToolConfig } from "./tools-section";
import { OutputTypeSelector } from "../../debug-panel/output-type-selector";
import { type OutputType } from "@/lib/workflow/debug-panel/types";
import type { KnowledgeItem } from "@/types/workflow";

interface PromptTabContentProps {
  processConfig: {
    systemPrompt?: string;
    userPrompt?: string;
    tools?: ToolConfig[];
    expectedOutputType?: OutputType;
    modality?: "text" | "code" | "image-gen" | "video-gen" | "audio-transcription" | "audio-tts" | "embedding" | "ocr";
    inputBindings?: Record<string, string>;
  };
  /**
   * 可选的模型选择区域，仅在「AI 提示词」子 Tab 中显示。
   * 例如调试面板里的模型选择卡片。
   */
  modelSelection?: ReactNode;
  knowledgeItems: KnowledgeItem[];
  onSystemPromptChange: (value: string) => void;
  onUserPromptChange: (value: string) => void;
  onToolsChange?: (tools: ToolConfig[]) => void;
  onExpectedOutputTypeChange?: (type: OutputType) => void;
  onInputBindingsChange?: (bindings: Record<string, string>) => void;
}

export function PromptTabContent({
  processConfig,
  modelSelection,
  knowledgeItems,
  onSystemPromptChange,
  onUserPromptChange,
  onToolsChange,
  onExpectedOutputTypeChange,
  onInputBindingsChange,
}: PromptTabContentProps) {
  const userPromptRef = useRef<HighlightedTextareaHandle>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const bindingsAnchorRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(() => extractSlotsFromPrompt(processConfig.userPrompt || ""), [processConfig.userPrompt]);

  // 插入引用到光标位置
  const handleInsertReference = (reference: string) => {
    const textarea = userPromptRef.current;
    if (!textarea) {
      // 如果无法获取 ref，直接追加
      onUserPromptChange((processConfig.userPrompt || "") + reference);
      return;
    }

    // 使用 insertText 方法插入文本，会自动处理光标位置
    textarea.insertText(reference);
  };

  // 处理工具变更
  const handleToolsChange = (tools: ToolConfig[]) => {
    if (onToolsChange) {
      onToolsChange(tools);
    }
  };

  // 计算当前输出类型：优先使用配置中的 expectedOutputType，否则默认为纯文本
  const currentOutputType: OutputType = processConfig.expectedOutputType || "text";

  return (
    <div className="space-y-4">
      {/* 内部 Tab：AI 提示词 / 调用工具，采用与输入数据一致的 Tabs UI */}
      <Tabs defaultValue="prompt" className="w-full">
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="prompt" className="flex items-center justify-center gap-2 text-xs">
            AI 提示词
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center justify-center gap-2 text-xs">
            调用工具
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="mt-0 space-y-4">
          {/* 可选：模型选择（仅在调试面板等场景使用） */}
          {modelSelection}

          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>System Prompt</Label>
              <AIGenerateButton
                fieldType="systemPrompt"
                currentContent={processConfig.systemPrompt || ""}
                onConfirm={onSystemPromptChange}
                fieldLabel="System Prompt"
              />
            </div>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              placeholder="系统提示词（可选）...&#10;&#10;用于设定 AI 的角色和行为方式"
              value={processConfig.systemPrompt || ""}
              onChange={(e) => onSystemPromptChange(e.target.value)}
            />
          </div>

          {/* User Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>User Prompt</Label>
              <div className="flex items-center gap-1">
                <AIGenerateButton
                  fieldType="userPrompt"
                  currentContent={processConfig.userPrompt || ""}
                  onConfirm={onUserPromptChange}
                  fieldLabel="User Prompt"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Expand className="h-3.5 w-3.5 mr-1" />
                  展开
                </Button>
                <ReferenceSelector
                  knowledgeItems={knowledgeItems}
                  onInsert={handleInsertReference}
                />
                {onInputBindingsChange && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      requestAnimationFrame(() => {
                        bindingsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }}
                  >
                    输入绑定{slots.length > 0 ? `(${slots.length})` : ""}
                  </Button>
                )}
              </div>
            </div>
            <HighlightedTextarea
              ref={userPromptRef}
              className="bg-background max-h-[260px]"
              placeholder="用户提示词，点击「插入引用」选择变量..."
              value={processConfig.userPrompt || ""}
              onChange={onUserPromptChange}
              minHeight="150px"
            />
            <p className="text-xs text-muted-foreground">
              点击「插入引用」按钮选择节点和字段，或直接输入{" "}
              {"{{节点名.字段名}}"}
            </p>
            {/* 输入绑定（从【标题】自动提取槽位） */}
            {onInputBindingsChange && (
              <div ref={bindingsAnchorRef} className="rounded-lg border bg-muted/10 p-2">
                <details>
                  <summary className="cursor-pointer select-none text-xs text-muted-foreground px-1 py-1">
                    输入绑定{slots.length > 0 ? `（${slots.length}）` : ""}
                  </summary>
                  <div className="pt-2">
                    <InputBindingsPanel
                      userPrompt={processConfig.userPrompt || ""}
                      bindings={processConfig.inputBindings}
                      onBindingsChange={onInputBindingsChange}
                      onInsertIntoPrompt={(text) => {
                        const textarea = userPromptRef.current;
                        if (!textarea) {
                          onUserPromptChange((processConfig.userPrompt || "") + text);
                          return;
                        }
                        textarea.insertText(text);
                      }}
                    />
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* 输出类型设置：用户可自主选择 */}
          <div className="space-y-2">
            <OutputTypeSelector
              selectedType={currentOutputType}
              onTypeChange={(type) => {
                onExpectedOutputTypeChange?.(type);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="tools" className="mt-0 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Wrench className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">调用工具</Label>
            </div>
            <ToolsSection
              tools={processConfig.tools || []}
              onToolsChange={handleToolsChange}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* 可调整大小的弹窗 */}
      <ResizablePromptDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="User Prompt"
        value={processConfig.userPrompt || ""}
        onChange={onUserPromptChange}
        knowledgeItems={knowledgeItems}
        placeholder="用户提示词，点击「插入引用」选择变量..."
      />
    </div>
  );
}
