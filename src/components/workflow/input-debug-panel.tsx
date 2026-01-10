"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  X,
  Plus,
  GripVertical,
  Type,
  FileText,
  FileSpreadsheet,
  Music,
  Video,
  Upload,
  Loader2,
  Trash2,
  List,
  CheckSquare,
  Image as ImageIcon,
  PlayCircle,
  Webhook,
  Clock,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Settings,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/stores/workflow-store";
import { CronExpressionEditor } from "@/components/triggers/cron-expression-editor";
import type {
  InputField,
  InputFieldType,
  SelectOption,
} from "@/types/workflow";

type TriggerType = "MANUAL" | "WEBHOOK" | "SCHEDULE";

interface TriggerNodeConfigData {
  triggerType?: TriggerType;
  enabled?: boolean;
  webhookPath?: string;
  hasWebhookSecret?: boolean;
  cronExpression?: string;
  timezone?: string;
  retryOnFail?: boolean;
  maxRetries?: number;
}

// ============================================
// Types
// ============================================

interface InputNodeDebugPanelProps {
  nodeId: string;
  nodeName: string;
  config?: Record<string, unknown>;
  triggerConfig?: TriggerNodeConfigData;
  onConfigUpdate: (config: Record<string, unknown>) => void;
  onTriggerConfigUpdate: (config: Partial<TriggerNodeConfigData>) => void;
  onClose: () => void;
}

// ============================================
// Constants
// ============================================

const FIELD_TYPE_OPTIONS: Array<{
  value: InputFieldType;
  label: string;
  icon: React.ReactNode;
  accept: string;
}> = [
    {
      value: "text",
      label: "文本",
      icon: <Type className="h-4 w-4" />,
      accept: "",
    },
    {
      value: "select",
      label: "单选",
      icon: <List className="h-4 w-4" />,
      accept: "",
    },
    {
      value: "multiselect",
      label: "多选",
      icon: <CheckSquare className="h-4 w-4" />,
      accept: "",
    },
    {
      value: "image",
      label: "图片",
      icon: <ImageIcon className="h-4 w-4" />,
      accept: "image/*",
    },
    {
      value: "pdf",
      label: "PDF",
      icon: <FileText className="h-4 w-4" />,
      accept: ".pdf,application/pdf",
    },
    {
      value: "word",
      label: "Word",
      icon: <FileText className="h-4 w-4" />,
      accept: ".doc,.docx",
    },
    {
      value: "excel",
      label: "Excel",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      accept: ".xlsx,.csv",
    },
    {
      value: "audio",
      label: "音频",
      icon: <Music className="h-4 w-4" />,
      accept: "audio/*",
    },
    {
      value: "video",
      label: "视频",
      icon: <Video className="h-4 w-4" />,
      accept: "video/*",
    },
  ];

const TRIGGER_TYPES: {
  value: TriggerType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
    {
      value: "MANUAL",
      label: "手动触发",
      icon: PlayCircle,
      description: "通过界面手动执行工作流",
    },
    {
      value: "WEBHOOK",
      label: "Webhook",
      icon: Webhook,
      description: "通过 HTTP 请求触发工作流",
    },
    {
      value: "SCHEDULE",
      label: "定时调度",
      icon: Clock,
      description: "按照 Cron 表达式定时执行",
    },
  ];

const TIMEZONES = [
  { value: "Asia/Shanghai", label: "中国标准时间 (UTC+8)" },
  { value: "Asia/Tokyo", label: "日本标准时间 (UTC+9)" },
  { value: "Asia/Singapore", label: "新加坡时间 (UTC+8)" },
  { value: "UTC", label: "UTC 协调世界时" },
  { value: "America/New_York", label: "美国东部时间" },
  { value: "Europe/London", label: "伦敦时间" },
];

// ============================================
// Helper Functions
// ============================================

const isSelectType = (fieldType?: InputFieldType): boolean => {
  return fieldType === "select" || fieldType === "multiselect";
};

const isFileType = (fieldType?: InputFieldType): boolean => {
  return (
    fieldType === "image" ||
    fieldType === "pdf" ||
    fieldType === "word" ||
    fieldType === "excel" ||
    fieldType === "audio" ||
    fieldType === "video"
  );
};

const getFieldTypeInfo = (type: InputFieldType = "text") => {
  return (
    FIELD_TYPE_OPTIONS.find((opt) => opt.value === type) ||
    FIELD_TYPE_OPTIONS[0]
  );
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ============================================
// Section Component
// ============================================

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  badge?: string;
}

function Section({
  title,
  icon: Icon,
  isOpen,
  onOpenChange,
  children,
  badge,
}: SectionProps) {
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-900 text-white">
                <Icon className="h-4 w-4" />
              </div>
              <span className="font-medium">{title}</span>
              {badge && (
                <Badge variant="secondary" className="text-xs">
                  {badge}
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 border-t">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function InputNodeDebugPanel({
  nodeId,
  nodeName,
  config,
  triggerConfig,
  onConfigUpdate,
  onTriggerConfigUpdate,
  onClose,
}: InputNodeDebugPanelProps) {
  // Section states
  const [isInputFieldsOpen, setIsInputFieldsOpen] = useState(true);
  const [isTriggerOpen, setIsTriggerOpen] = useState(false);
  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(nodeName);
  const updateNode = useWorkflowStore((state) => state.updateNode);

  // Handle title save
  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== nodeName) {
      updateNode(nodeId, { name: editedTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  // Input fields state
  const fields = useMemo(
    () => (config?.fields as InputField[]) || [],
    [config?.fields],
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [uploadingFields, setUploadingFields] = useState<
    Record<string, boolean>
  >({});
  const renameInputField = useWorkflowStore((state) => state.renameInputField);
  const fieldNameBeforeEdit = useRef<string>("");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Trigger state
  const [copied, setCopied] = useState(false);
  const triggerType = triggerConfig?.triggerType || "MANUAL";
  const enabled = triggerConfig?.enabled ?? true;
  const webhookPath = triggerConfig?.webhookPath || "";
  const hasWebhookSecret = triggerConfig?.hasWebhookSecret ?? false;
  const cronExpression = triggerConfig?.cronExpression || "0 9 * * *";
  const timezone = triggerConfig?.timezone || "Asia/Shanghai";
  const retryOnFail = triggerConfig?.retryOnFail ?? false;
  const maxRetries = triggerConfig?.maxRetries ?? 3;

  // Generate webhook path if not exists
  useEffect(() => {
    if (triggerType === "WEBHOOK" && !webhookPath) {
      const randomPath = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      onTriggerConfigUpdate({ webhookPath: randomPath });
    }
  }, [triggerType, webhookPath, onTriggerConfigUpdate]);

  // ============================================
  // Input Fields Handlers
  // ============================================

  const handleFileUpload = useCallback(
    async (
      fieldId: string,
      fieldType: InputFieldType,
      file: File,
      index: number,
    ) => {
      setUploadingFields((prev) => ({ ...prev, [fieldId]: true }));

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fieldType", fieldType);

        const response = await fetch("/api/files/temp", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "上传失败");
        }

        const newFields = [...fields];
        newFields[index] = {
          ...newFields[index],
          value: data.data.url,
          file: {
            name: data.data.fileName,
            url: data.data.url,
            size: data.data.size,
            mimeType: data.data.mimeType,
          },
        };
        onConfigUpdate({ ...config, fields: newFields });

        toast.success("文件上传成功");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "上传失败");
      } finally {
        setUploadingFields((prev) => ({ ...prev, [fieldId]: false }));
      }
    },
    [fields, config, onConfigUpdate],
  );

  const handleRemoveFile = useCallback(
    (index: number) => {
      const newFields = [...fields];
      newFields[index] = {
        ...newFields[index],
        value: "",
        file: undefined,
      };
      onConfigUpdate({ ...config, fields: newFields });
    },
    [fields, config, onConfigUpdate],
  );

  const addField = () => {
    const newField: InputField = {
      id: `field_${Date.now()}`,
      name: `字段${fields.length + 1}`,
      value: "",
      height: 80,
    };
    onConfigUpdate({ ...config, fields: [...fields, newField] });
  };

  const updateField = (index: number, updates: Partial<InputField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    onConfigUpdate({ ...config, fields: newFields });
  };

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    onConfigUpdate({ ...config, fields: newFields });
  };

  // Drag handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      const newFields = [...fields];
      const [draggedField] = newFields.splice(draggedIndex, 1);
      newFields.splice(dropIndex, 0, draggedField);
      onConfigUpdate({ ...config, fields: newFields });
      window.dispatchEvent(new CustomEvent("workflow-request-save"));
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleResizeStart = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = fields[index].height || 80;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(40, Math.min(300, startHeight + deltaY));
      updateField(index, { height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // ============================================
  // Trigger Handlers
  // ============================================

  const handleTriggerTypeChange = (value: TriggerType) => {
    onTriggerConfigUpdate({ triggerType: value });
  };

  const handleCopyWebhook = async () => {
    const fullUrl = `${window.location.origin}/api/webhooks/${webhookPath}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateWebhook = () => {
    const randomPath = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    onTriggerConfigUpdate({ webhookPath: randomPath });
  };

  // ============================================
  // Notification Handlers
  // ============================================
  // ============================================
  // Render
  // ============================================

  return (
    <div className="h-full flex flex-col bg-slate-100/50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-900">
            <Settings className="h-4 w-4 text-white" />
          </div>
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") {
                  setEditedTitle(nodeName);
                  setIsEditingTitle(false);
                }
              }}
              className="font-semibold text-sm bg-transparent border-b border-primary outline-none"
              autoFocus
            />
          ) : (
            <h2
              className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors"
              onClick={() => {
                setEditedTitle(nodeName);
                setIsEditingTitle(true);
              }}
              title="点击编辑节点名称"
            >
              {nodeName}
            </h2>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          title="收起面板"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {/* Input Fields Section */}
        <Section
          title="输入字段"
          icon={Type}
          isOpen={isInputFieldsOpen}
          onOpenChange={setIsInputFieldsOpen}
          badge={fields.length > 0 ? `${fields.length} 个字段` : undefined}
        >
          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                定义工作流的输入参数
              </span>
              <Button variant="outline" size="sm" onClick={addField}>
                <Plus className="mr-2 h-4 w-4" />
                添加字段
              </Button>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <Type className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无输入字段</p>
                <p className="text-xs mt-1">点击上方按钮添加字段</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "border rounded-lg p-3 space-y-2 bg-white transition-all",
                      draggedIndex === index && "opacity-50 scale-[0.98]",
                      dragOverIndex === index &&
                      "border-primary border-2 bg-primary/5",
                    )}
                  >
                    {/* Field Name Row - 浅蓝色底纹 */}
                    <div className="flex items-center gap-2 bg-blue-50 rounded-md px-2 py-1.5 -mx-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      <Input
                        value={field.name}
                        onFocus={() => {
                          fieldNameBeforeEdit.current = field.name;
                        }}
                        onChange={(e) =>
                          updateField(index, { name: e.target.value })
                        }
                        onBlur={(e) => {
                          const oldName = fieldNameBeforeEdit.current;
                          const newName = e.target.value.trim();
                          if (oldName && newName && oldName !== newName) {
                            renameInputField(nodeName, oldName, newName);
                          }
                          fieldNameBeforeEdit.current = "";
                        }}
                        placeholder="字段名称"
                        className="h-7 text-sm font-medium flex-1 bg-white"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-blue-100"
                        onClick={() => removeField(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Field Type */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">
                        类型:
                      </span>
                      <Select
                        value={field.fieldType || "text"}
                        onValueChange={(value: InputFieldType) =>
                          updateField(index, { fieldType: value })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                {option.icon}
                                <span>{option.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Field Content based on type */}
                    {(!field.fieldType || field.fieldType === "text") && (
                      <div className="relative">
                        <textarea
                          value={field.value || ""}
                          onChange={(e) =>
                            updateField(index, { value: e.target.value })
                          }
                          placeholder={`输入 {{输入.${field.name}}} 的默认值...`}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                          style={{ height: field.height || 80 }}
                        />
                        <div
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-border hover:bg-primary cursor-ns-resize rounded-full"
                          onMouseDown={(e) => handleResizeStart(index, e)}
                        />
                      </div>
                    )}

                    {isSelectType(field.fieldType) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            选项列表
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              const currentOptions = field.options || [];
                              const newOption: SelectOption = {
                                label: `选项${currentOptions.length + 1}`,
                                value: `option_${currentOptions.length + 1}`,
                              };
                              updateField(index, {
                                options: [...currentOptions, newOption],
                              });
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            添加选项
                          </Button>
                        </div>
                        {!field.options || field.options.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2 border border-dashed rounded">
                            暂无选项
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {field.options.map((option, optionIndex) => (
                              <div
                                key={optionIndex}
                                className="flex items-center gap-2"
                              >
                                <Input
                                  value={option.label}
                                  onChange={(e) => {
                                    const newOptions = [
                                      ...(field.options || []),
                                    ];
                                    newOptions[optionIndex] = {
                                      ...option,
                                      label: e.target.value,
                                      value: e.target.value,
                                    };
                                    updateField(index, { options: newOptions });
                                  }}
                                  placeholder="选项文本"
                                  className="h-7 text-sm flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const newOptions = (
                                      field.options || []
                                    ).filter((_, i) => i !== optionIndex);
                                    updateField(index, { options: newOptions });
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isFileType(field.fieldType) && (
                      <>
                        {field.file ? (
                          <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                            {getFieldTypeInfo(field.fieldType).icon}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {field.file.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(field.file.size)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRemoveFile(index)}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "flex items-center justify-center gap-2 p-3 rounded-md border border-dashed cursor-pointer transition-colors hover:border-primary hover:bg-primary/5",
                              uploadingFields[field.id] &&
                              "pointer-events-none opacity-50",
                            )}
                            onClick={() =>
                              fileInputRefs.current[field.id]?.click()
                            }
                          >
                            {uploadingFields[field.id] ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm text-muted-foreground">
                                  上传中...
                                </span>
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                  点击上传
                                  {getFieldTypeInfo(field.fieldType).label}
                                  （可选）
                                </span>
                              </>
                            )}
                          </div>
                        )}
                        <input
                          type="file"
                          ref={(el) => {
                            fileInputRefs.current[field.id] = el;
                          }}
                          className="hidden"
                          accept={getFieldTypeInfo(field.fieldType).accept}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && field.fieldType) {
                              handleFileUpload(
                                field.id,
                                field.fieldType,
                                file,
                                index,
                              );
                            }
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}

                    <p className="text-xs text-muted-foreground">
                      引用方式: {"{{"}输入.{field.name}
                      {"}}"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Trigger Section */}
        <Section
          title="触发器配置"
          icon={Zap}
          isOpen={isTriggerOpen}
          onOpenChange={setIsTriggerOpen}
          badge={TRIGGER_TYPES.find((t) => t.value === triggerType)?.label}
        >
          <div className="pt-4 space-y-4">
            {/* Trigger Type Selection */}
            <div className="space-y-3">
              <Label className="text-sm">触发类型</Label>
              <div className="grid grid-cols-1 gap-2">
                {TRIGGER_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = triggerType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleTriggerTypeChange(type.value)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/50",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 mt-0.5",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{type.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {type.description}
                        </div>
                      </div>
                      {isSelected && (
                        <Badge variant="secondary" className="text-xs">
                          已选择
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">启用触发器</Label>
                <p className="text-xs text-muted-foreground">
                  关闭后触发器将不会执行
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(value) =>
                  onTriggerConfigUpdate({ enabled: value })
                }
              />
            </div>

            {/* Webhook Config */}
            {triggerType === "WEBHOOK" && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Webhook 配置</Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Webhook URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/${webhookPath}`}
                      readOnly
                      className="font-mono text-xs flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyWebhook}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleRegenerateWebhook}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">启用密钥验证</Label>
                    <p className="text-xs text-muted-foreground">
                      通过 X-Webhook-Secret 头验证请求
                    </p>
                  </div>
                  <Switch
                    checked={hasWebhookSecret}
                    onCheckedChange={(value) =>
                      onTriggerConfigUpdate({ hasWebhookSecret: value })
                    }
                  />
                </div>

                {hasWebhookSecret && (
                  <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    <p>保存工作流后，密钥将自动生成并显示在触发器管理页面。</p>
                  </div>
                )}
              </div>
            )}

            {/* Schedule Config */}
            {triggerType === "SCHEDULE" && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">定时调度配置</Label>
                </div>

                <CronExpressionEditor
                  value={cronExpression}
                  onChange={(value) =>
                    onTriggerConfigUpdate({ cronExpression: value })
                  }
                />

                <div className="space-y-2">
                  <Label className="text-sm">时区</Label>
                  <Select
                    value={timezone}
                    onValueChange={(value) =>
                      onTriggerConfigUpdate({ timezone: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择时区" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Retry Config */}
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">失败重试</Label>
                  <p className="text-xs text-muted-foreground">
                    触发失败时自动重试
                  </p>
                </div>
                <Switch
                  checked={retryOnFail}
                  onCheckedChange={(value) =>
                    onTriggerConfigUpdate({ retryOnFail: value })
                  }
                />
              </div>

              {retryOnFail && (
                <div className="space-y-2">
                  <Label className="text-sm">最大重试次数</Label>
                  <Select
                    value={String(maxRetries)}
                    onValueChange={(value) =>
                      onTriggerConfigUpdate({ maxRetries: Number(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 5, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} 次
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Manual Trigger Hint */}
            {triggerType === "MANUAL" && (
              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <PlayCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">手动触发模式</p>
                    <p className="mt-1">
                      工作流需要在界面上手动点击执行，适合测试或一次性任务。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Section>

      </div>
    </div>
  );
}

export default InputNodeDebugPanel;
