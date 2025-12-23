"use client";

import { useRef, useState } from "react";
import { Expand, Wrench } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ReferenceSelector } from "./reference-selector";
import {
  HighlightedTextarea,
  type HighlightedTextareaHandle,
} from "./highlighted-textarea";
import { ResizablePromptDialog } from "./resizable-prompt-dialog";
import { AIGenerateButton } from "./ai-generate-button";
import { ToolsSection, type ToolConfig } from "./tools-section";
import type { KnowledgeItem } from "@/types/workflow";

interface PromptTabContentProps {
  processConfig: {
    systemPrompt?: string;
    userPrompt?: string;
    tools?: ToolConfig[];
  };
  knowledgeItems: KnowledgeItem[];
  onSystemPromptChange: (value: string) => void;
  onUserPromptChange: (value: string) => void;
  onToolsChange?: (tools: ToolConfig[]) => void;
}

export function PromptTabContent({
  processConfig,
  knowledgeItems,
  onSystemPromptChange,
  onUserPromptChange,
  onToolsChange,
}: PromptTabContentProps) {
  const userPromptRef = useRef<HighlightedTextareaHandle>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  return (
    <div className="space-y-4">
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
          </div>
        </div>
        <HighlightedTextarea
          ref={userPromptRef}
          className="bg-background"
          placeholder="用户提示词，点击「插入引用」选择变量..."
          value={processConfig.userPrompt || ""}
          onChange={onUserPromptChange}
          minHeight="150px"
        />
        <p className="text-xs text-muted-foreground">
          点击「插入引用」按钮选择节点和字段，或直接输入 {"{{节点名.字段名}}"}
        </p>
      </div>

      {/* 调用工具 */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">调用工具</Label>
        </div>
        <ToolsSection
          tools={processConfig.tools || []}
          onToolsChange={handleToolsChange}
        />
      </div>

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
