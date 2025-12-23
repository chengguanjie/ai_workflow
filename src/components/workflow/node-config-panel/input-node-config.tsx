"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { toast } from "sonner";
import type {
  InputField,
  InputFieldType,
  SelectOption,
} from "@/types/workflow";
import { useWorkflowStore } from "@/stores/workflow-store";

// 字段类型配置
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
    accept:
      ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    value: "excel",
    label: "Excel",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    accept:
      ".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv",
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

// 判断是否是选择类型
const isSelectType = (fieldType?: InputFieldType): boolean => {
  return fieldType === "select" || fieldType === "multiselect";
};

// 判断是否是文件类型
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

// 获取字段类型的图标和标签
const getFieldTypeInfo = (type: InputFieldType = "text") => {
  return (
    FIELD_TYPE_OPTIONS.find((opt) => opt.value === type) ||
    FIELD_TYPE_OPTIONS[0]
  );
};

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface InputNodeConfigPanelProps {
  nodeName: string;
  config?: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

export function InputNodeConfigPanel({
  nodeName,
  config,
  onUpdate,
}: InputNodeConfigPanelProps) {
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
  // 用于追踪字段名称修改前的值
  const fieldNameBeforeEdit = useRef<string>("");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 文件上传处理
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

        // 更新字段的文件信息
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
        onUpdate({ ...config, fields: newFields });

        toast.success("文件上传成功");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "上传失败");
      } finally {
        setUploadingFields((prev) => ({ ...prev, [fieldId]: false }));
      }
    },
    [fields, config, onUpdate],
  );

  // 删除已上传的文件
  const handleRemoveFile = useCallback(
    (index: number) => {
      const newFields = [...fields];
      newFields[index] = {
        ...newFields[index],
        value: "",
        file: undefined,
      };
      onUpdate({ ...config, fields: newFields });
    },
    [fields, config, onUpdate],
  );

  const addField = () => {
    const newField: InputField = {
      id: `field_${Date.now()}`,
      name: `字段${fields.length + 1}`,
      value: "",
      height: 80,
    };
    onUpdate({ ...config, fields: [...fields, newField] });
  };

  const updateField = (index: number, updates: Partial<InputField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    onUpdate({ ...config, fields: newFields });
  };

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    onUpdate({ ...config, fields: newFields });
  };

  // 拖拽排序相关处理
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
      onUpdate({ ...config, fields: newFields });

      // 触发立即保存事件
      window.dispatchEvent(new CustomEvent("workflow-request-save"));
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 处理文本框高度拖拽
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">输入字段</span>
        <Button variant="outline" size="sm" onClick={addField}>
          <Plus className="mr-2 h-4 w-4" />
          添加字段
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          暂无输入字段，点击上方按钮添加
        </p>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div
              key={field.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`border rounded-lg p-3 space-y-2 transition-all ${
                draggedIndex === index ? "opacity-50 scale-[0.98]" : ""
              } ${
                dragOverIndex === index
                  ? "border-primary border-2 bg-primary/5"
                  : ""
              }`}
            >
              {/* 字段名称行 - 浅蓝色底纹 */}
              <div className="flex items-center gap-2 bg-blue-50 rounded-md px-2 py-1.5 -mx-1">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing" />
                <Input
                  value={field.name}
                  onFocus={() => {
                    // 记录编辑前的字段名称
                    fieldNameBeforeEdit.current = field.name;
                  }}
                  onChange={(e) => updateField(index, { name: e.target.value })}
                  onBlur={(e) => {
                    // 当输入框失去焦点时，检查字段名是否有变化，如果有则更新引用
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
                  className="h-6 w-6 flex-shrink-0 hover:bg-blue-100"
                  onClick={() => removeField(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {/* 字段类型选择 */}
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
              {/* 根据字段类型显示不同的输入区域 */}
              {!field.fieldType || field.fieldType === "text" ? (
                <>
                  {/* 文本内容输入框 */}
                  <div className="relative">
                    <textarea
                      value={field.value || ""}
                      onChange={(e) =>
                        updateField(index, { value: e.target.value })
                      }
                      placeholder={`输入 {{输入.${field.name}}} 的内容...`}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                      style={{ height: field.height || 80 }}
                    />
                    {/* 底部拖拽调整高度的手柄 */}
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-border hover:bg-primary cursor-ns-resize rounded-full"
                      onMouseDown={(e) => handleResizeStart(index, e)}
                    />
                  </div>
                </>
              ) : isSelectType(field.fieldType) ? (
                <>
                  {/* 单选/多选选项编辑区域 */}
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
                        暂无选项，点击上方按钮添加
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
                                const newOptions = [...(field.options || [])];
                                newOptions[optionIndex] = {
                                  ...option,
                                  label: e.target.value,
                                  value: e.target.value, // 使用 label 作为 value
                                };
                                updateField(index, { options: newOptions });
                              }}
                              placeholder="选项文本"
                              className="h-7 text-sm flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => {
                                const newOptions = (field.options || []).filter(
                                  (_, i) => i !== optionIndex,
                                );
                                updateField(index, { options: newOptions });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* 默认值选择 */}
                    {field.options && field.options.length > 0 && (
                      <div className="pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          默认值:
                        </span>
                        <Select
                          value={field.value || ""}
                          onValueChange={(value) =>
                            updateField(index, {
                              value: value === "__none__" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs mt-1">
                            <SelectValue placeholder="选择默认值（可选）" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">无默认值</SelectItem>
                            {field.options.map((opt, idx) => (
                              <SelectItem
                                key={idx}
                                value={opt.value || `__option_${idx}__`}
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </>
              ) : isFileType(field.fieldType) ? (
                <>
                  {/* 文件上传区域 */}
                  {field.file ? (
                    // 已上传文件显示
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
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleRemoveFile(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    // 上传按钮
                    <div
                      className={`flex items-center justify-center gap-2 p-3 rounded-md border border-dashed cursor-pointer transition-colors hover:border-primary hover:bg-primary/5 ${
                        uploadingFields[field.id]
                          ? "pointer-events-none opacity-50"
                          : ""
                      }`}
                      onClick={() => fileInputRefs.current[field.id]?.click()}
                    >
                      {uploadingFields[field.id] ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            上传中...
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            点击上传{getFieldTypeInfo(field.fieldType).label}
                            文件（可选）
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  {/* 隐藏的文件输入 */}
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
                  <p className="text-xs text-muted-foreground">
                    可预设默认文件，或留空在运行时上传
                  </p>
                </>
              ) : null}
              <p className="text-xs text-muted-foreground">
                引用方式: {"{{"}输入.{field.name}
                {"}}"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
