"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  ArrowRightFromLine,
  X,
  Image,
  Music,
  Video,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Database,
  Plus,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

import { cn } from "@/lib/utils";
import {
  type InputTabType,
  type ImportedFile,
  type EnhancedProcessConfig,
  ALL_SUPPORTED_EXTENSIONS,
} from "@/lib/workflow/debug-panel/types";
import {
  isFileTypeSupported,
  getFileCategory,
} from "@/lib/workflow/debug-panel/utils";
import type { KnowledgeItem, RAGConfig } from "@/types/workflow";

// ============================================
// Types
// ============================================

export interface WorkflowNode {
  id: string;
  type?: string;
  data: {
    name?: string;
    config?: {
      outputFields?: Array<{ id: string; name: string; type?: string }>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

// 获取节点的输出字段列表
function getNodeOutputFields(
  node: WorkflowNode,
): Array<{ id: string; name: string; type?: string }> {
  const config = node.data.config as {
    outputFields?: Array<{ id: string; name: string; type?: string }>;
  };
  if (config?.outputFields && Array.isArray(config.outputFields)) {
    return config.outputFields;
  }
  // 默认输出字段
  return [{ id: "result", name: "result", type: "text" }];
}

interface NodeExecutionResult {
  status: "success" | "error" | "skipped";
  output: Record<string, unknown>;
  error?: string;
  duration: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  logs?: string[];
}

interface InputTabsProps {
  activeTab: InputTabType;
  onTabChange: (tab: InputTabType) => void;
  importedFiles: ImportedFile[];
  onFilesChange: (files: ImportedFile[]) => void;
  predecessorNodes: WorkflowNode[];
  mockInputs: Record<string, Record<string, unknown>>;
  onMockInputChange: (nodeName: string, field: string, value: string) => void;
  /** 节点执行结果映射（用于显示哪些上游节点有已保存的结果） */
  nodeExecutionResults?: Record<string, NodeExecutionResult | null>;
  /** PROCESS 节点配置，用于在「参考材料」Tab 中编辑 */
  processConfig?: EnhancedProcessConfig;
  onProcessConfigChange?: (config: Partial<EnhancedProcessConfig>) => void;
  /** RAG 知识库配置（用于引用知识库 Tab） */
  knowledgeBases?: KnowledgeBase[];
  loadingKnowledgeBases?: boolean;
  ragConfig?: RAGConfig;
  onRAGConfigChange?: (key: keyof RAGConfig, value: number) => void;
  /** 静态参考规则（知识项） */
  knowledgeItems?: KnowledgeItem[];
  onAddKnowledgeItem?: () => void;
  onUpdateKnowledgeItem?: (index: number, updates: Partial<KnowledgeItem>) => void;
  onRemoveKnowledgeItem?: (index: number) => void;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  chunkCount: number;
  isActive: boolean;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format file size to human readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get icon component for file category
 */
function getFileIcon(category: string | null) {
  switch (category) {
    case "image":
      return Image;
    case "audio":
      return Music;
    case "video":
      return Video;
    case "document":
    default:
      return FileText;
  }
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

// ============================================
// InputTabs Component
// ============================================

export function InputTabs({
  activeTab,
  onTabChange,
  importedFiles,
  onFilesChange,
  predecessorNodes,
  mockInputs,
  onMockInputChange,
  nodeExecutionResults,
  processConfig,
  onProcessConfigChange,
  knowledgeBases,
  loadingKnowledgeBases,
  ragConfig,
  onRAGConfigChange,
  knowledgeItems = [],
  onAddKnowledgeItem,
  onUpdateKnowledgeItem,
  onRemoveKnowledgeItem,
}: InputTabsProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploadError(null);
      const newFiles: ImportedFile[] = [];
      const errors: string[] = [];

      Array.from(files).forEach((file) => {
        const extension = getFileExtension(file.name);

        if (!isFileTypeSupported(extension)) {
          errors.push(`不支持的文件类型: ${file.name}`);
          return;
        }

        const importedFile: ImportedFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          file: file,
        };

        // Create preview URL for images
        const category = getFileCategory(extension);
        if (category === "image") {
          importedFile.previewUrl = URL.createObjectURL(file);
        }

        newFiles.push(importedFile);
      });

      if (errors.length > 0) {
        setUploadError(errors.join("\n"));
      }

      if (newFiles.length > 0) {
        onFilesChange([...importedFiles, ...newFiles]);
      }
    },
    [importedFiles, onFilesChange],
  );

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

  // Handle file input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files);
      // Reset input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFileSelect],
  );

  // Handle file removal
  const handleRemoveFile = useCallback(
    (fileId: string) => {
      const fileToRemove = importedFiles.find((f) => f.id === fileId);
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      onFilesChange(importedFiles.filter((f) => f.id !== fileId));
    },
    [importedFiles, onFilesChange],
  );

  // Generate accept string for file input
  const acceptString = ALL_SUPPORTED_EXTENSIONS.join(",");

  return (
    <div className="w-full">
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as InputTabType)}
        className="w-full"
      >
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="input" className="flex items-center gap-2">
            <ArrowRightFromLine className="h-4 w-4" />
            输入与资料
          </TabsTrigger>
          <TabsTrigger value="reference" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            引用知识库
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 输入与资料（合并原输入文本 + 上传资料） */}
        <TabsContent value="input" className="mt-0 space-y-6">
          {/* 上游节点输入 */}
          {predecessorNodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg text-sm bg-muted/20">
              暂无上游节点输入
            </div>
          ) : (
            <div className="space-y-4">
              {predecessorNodes.map((node) => {
                const outputFields = getNodeOutputFields(node);
                const nodeName = node.data.name || node.id;
                const nodeResult = nodeExecutionResults?.[node.id];
                const hasResult = nodeResult?.status === "success" && nodeResult.output;

                return (
                  <div key={node.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          hasResult ? "bg-green-500" : "bg-primary/50"
                        )} />
                        来自: {nodeName}
                      </div>
                      {hasResult ? (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-green-50 text-green-600 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          已调试
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-50 text-amber-600 border-amber-200">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          待调试
                        </Badge>
                      )}
                    </div>

                    {outputFields.map((field) => {
                      const value = mockInputs[nodeName]?.[field.id] as string || '';

                      return (
                        <div key={`${node.id}-${field.id}`} className="space-y-1.5 pl-3.5 border-l-2 border-muted">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{field.name}</span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{field.type || 'string'}</Badge>
                          </div>
                          <Textarea
                            value={value}
                            onChange={(e) => onMockInputChange(nodeName, field.id, e.target.value)}
                            className="text-xs min-h-[60px] resize-y font-mono"
                            placeholder={`输入 ${field.name} 的模拟值...`}
                          />
                        </div>
                      )
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {/* 上传资料（原 Tab2 内容移动到这里） */}
          <div className="space-y-4">
            {/* Upload Area */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptString}
                onChange={handleInputChange}
                className="hidden"
              />
              <Upload
                className={cn(
                  "h-8 w-8 mx-auto mb-3 transition-colors",
                  isDragging ? "text-primary" : "text-muted-foreground",
                )}
              />
              <p className="text-sm font-medium mb-1">
                {isDragging ? "释放文件以上传" : "点击或拖拽文件到此处"}
              </p>
              <p className="text-xs text-muted-foreground">
                支持 Word、PDF、Excel、PPT、CSV、HTML、JSON、图片、音频、视频
              </p>
            </div>

            {/* Error Message */}
            {uploadError && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-600">
                {uploadError}
              </div>
            )}

            {/* Imported Files List */}
            {importedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    已导入文件 ({importedFiles.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-red-500"
                    onClick={() => {
                      importedFiles.forEach((f) => {
                        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      });
                      onFilesChange([]);
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    清空
                  </Button>
                </div>
                <div className="space-y-2">
                  {importedFiles.map((file) => {
                    const extension = getFileExtension(file.name);
                    const category = getFileCategory(extension);
                    const FileIcon = getFileIcon(category);

                    return (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-white/50 group"
                      >
                        {/* File Icon or Preview */}
                        {file.previewUrl ? (
                          <div className="h-10 w-10 rounded overflow-hidden bg-muted flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={file.previewUrl}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted/50 flex items-center justify-center flex-shrink-0">
                            <FileIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatFileSize(file.size)} •{" "}
                            {extension.toUpperCase().replace(".", "")}
                          </p>
                        </div>

                        {/* Remove Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          onClick={() => handleRemoveFile(file.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: 引用知识库 */}
        <TabsContent value="reference" className="mt-0 space-y-4">
          {processConfig ? (
            <>
              {/* RAG 知识库选择 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">RAG 知识库</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  选择知识库，AI 将自动检索相关内容作为上下文。
                </p>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  value={processConfig.knowledgeBaseId || ""}
                  onChange={(e) =>
                    onProcessConfigChange?.({
                      knowledgeBaseId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">不使用知识库</option>
                  {knowledgeBases
                    ?.filter((kb) => kb.isActive)
                    .map((kb) => (
                      <option key={kb.id} value={kb.id}>
                        {kb.name} ({kb.documentCount} 文档
                        {typeof kb.chunkCount === "number"
                          ? `, ${kb.chunkCount} 分块`
                          : ""}
                        )
                      </option>
                    ))}
                </select>

                {/* RAG 详细配置：TopK + 阈值 */}
                {processConfig.knowledgeBaseId && ragConfig && onRAGConfigChange && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3 mt-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">检索数量 (Top K)</span>
                        <span className="text-xs text-muted-foreground">
                          {ragConfig.topK}
                        </span>
                      </div>
                      <Slider
                        value={[ragConfig.topK || 5]}
                        onValueChange={([v]) => onRAGConfigChange("topK", v)}
                        min={1}
                        max={20}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">相似度阈值</span>
                        <span className="text-xs text-muted-foreground">
                          {(ragConfig.threshold || 0.7).toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        value={[ragConfig.threshold || 0.7]}
                        onValueChange={([v]) => onRAGConfigChange("threshold", v)}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 静态参考规则（与调试面板逻辑对齐） */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium">参考规则</span>
                  </div>
                  {onAddKnowledgeItem && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={onAddKnowledgeItem}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      添加
                    </Button>
                  )}
                </div>

                {knowledgeItems.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground border-2 border-dashed rounded-lg text-[11px]">
                    暂无参考规则
                  </div>
                ) : (
                  <div className="space-y-3">
                    {knowledgeItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="border rounded-lg p-3 space-y-2 bg-white/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            value={item.name}
                            onChange={(e) =>
                              onUpdateKnowledgeItem?.(index, {
                                name: e.target.value,
                              })
                            }
                            className="h-7 text-xs font-medium flex-1"
                            placeholder="规则名称"
                          />
                          {onRemoveKnowledgeItem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500"
                              onClick={() => onRemoveKnowledgeItem(index)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <Textarea
                          className="text-xs overflow-y-auto resize-y"
                          placeholder="输入规则内容..."
                          value={item.content}
                          onChange={(e) =>
                            onUpdateKnowledgeItem?.(index, {
                              content: e.target.value,
                            })
                          }
                          style={{
                            scrollbarWidth: "thin",
                            height: "120px",
                            minHeight: "80px",
                            maxHeight: "300px",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground border border-dashed rounded-lg py-6 text-center">
              仅处理节点支持参考材料配置。
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InputTabs;
