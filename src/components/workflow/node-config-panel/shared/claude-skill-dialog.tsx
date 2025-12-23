"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileJson,
  Sparkles,
  PenTool,
  Download,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  BookOpen,
  Code,
  Image,
  FileText,
  MessageSquare,
  Zap,
  Search,
  Plus,
  X,
  ChevronRight,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

/**
 * Claude Skill 文件结构定义
 */
export interface ClaudeSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  icon?: string;
  // 核心配置
  systemPrompt: string;
  userPromptTemplate?: string;
  // 工具定义
  tools?: SkillTool[];
  // 示例
  examples?: SkillExample[];
  // 输出格式
  outputFormat?: "text" | "json" | "markdown";
  outputSchema?: Record<string, unknown>;
  // 元数据
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, SkillToolParameter>;
    required?: string[];
  };
}

export interface SkillToolParameter {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface SkillExample {
  input: string;
  output: string;
  description?: string;
}

// ============================================
// Skill Templates
// ============================================

const SKILL_TEMPLATES: ClaudeSkill[] = [
  {
    id: "content-writer",
    name: "内容创作大师",
    version: "1.0.0",
    description: "专业的多平台内容创作助手，支持小红书、公众号、抖音等多种风格",
    author: "AI Workflow",
    tags: ["写作", "营销", "内容"],
    icon: "PenTool",
    systemPrompt: `你是一位专业的内容创作大师，精通各种平台的内容风格：

## 能力
- 小红书：种草文案、生活分享、美妆护肤
- 公众号：深度文章、知识科普、情感故事
- 抖音：短视频脚本、热点话题、带货文案
- 微博：热搜话题、互动内容、品牌传播

## 写作原则
1. 了解目标受众，使用他们的语言
2. 标题要有吸引力，善用数字和疑问
3. 内容结构清晰，善用emoji和分段
4. 结尾有互动引导，促进用户参与

## 输出格式
请根据用户指定的平台，输出对应风格的内容。`,
    tools: [
      {
        name: "analyze_trending",
        description: "分析当前热门话题和趋势",
        parameters: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              description: "目标平台",
              enum: ["xiaohongshu", "wechat", "douyin", "weibo"],
            },
            category: {
              type: "string",
              description: "内容分类",
            },
          },
          required: ["platform"],
        },
      },
    ],
    examples: [
      {
        input: "帮我写一篇小红书护肤分享",
        output:
          "🌟 姐妹们！这个平价护肤组合真的绝了！\n\n用了一个月，皮肤状态好到同事都在问我用了什么...",
        description: "小红书风格示例",
      },
    ],
    outputFormat: "markdown",
  },
  {
    id: "code-reviewer",
    name: "代码审查专家",
    version: "1.0.0",
    description: "专业的代码审查助手，提供详细的代码质量分析和改进建议",
    author: "AI Workflow",
    tags: ["开发", "代码", "审查"],
    icon: "Code",
    systemPrompt: `你是一位资深的代码审查专家，具有以下能力：

## 审查维度
1. **代码质量**：可读性、可维护性、复杂度
2. **最佳实践**：设计模式、SOLID原则、DRY原则
3. **性能优化**：时间复杂度、空间复杂度、资源使用
4. **安全性**：常见漏洞、输入验证、权限控制
5. **测试覆盖**：单元测试、边界条件、异常处理

## 输出格式
对于每个发现的问题，请提供：
- 问题级别：🔴 严重 / 🟡 警告 / 🔵 建议
- 问题描述
- 代码位置
- 修复建议
- 修复后的代码示例`,
    tools: [
      {
        name: "check_complexity",
        description: "检查代码复杂度",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "要检查的代码" },
            language: { type: "string", description: "编程语言" },
          },
          required: ["code"],
        },
      },
    ],
    outputFormat: "markdown",
  },
  {
    id: "data-analyst",
    name: "数据分析师",
    version: "1.0.0",
    description: "智能数据分析助手，帮助解读数据、生成洞察和可视化建议",
    author: "AI Workflow",
    tags: ["数据", "分析", "报告"],
    icon: "FileText",
    systemPrompt: `你是一位专业的数据分析师，擅长：

## 分析能力
1. **描述性分析**：数据概览、趋势识别、异常检测
2. **诊断性分析**：原因分析、相关性分析、归因分析
3. **预测性分析**：趋势预测、风险评估、机会识别
4. **建议性分析**：策略建议、优化方案、行动计划

## 输出结构
1. 数据概览（关键指标一览）
2. 核心洞察（3-5个关键发现）
3. 详细分析（支持性数据和图表建议）
4. 行动建议（可执行的下一步）

## 可视化建议
根据数据特点，建议合适的图表类型：
- 趋势数据 → 折线图
- 对比数据 → 柱状图
- 占比数据 → 饼图/环形图
- 分布数据 → 直方图/箱线图`,
    outputFormat: "json",
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        insights: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
        visualizations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              title: { type: "string" },
              data: { type: "object" },
            },
          },
        },
      },
    },
  },
  {
    id: "meeting-assistant",
    name: "会议纪要助手",
    version: "1.0.0",
    description: "智能会议记录和纪要生成，自动提取要点和待办事项",
    author: "AI Workflow",
    tags: ["会议", "效率", "协作"],
    icon: "MessageSquare",
    systemPrompt: `你是一位专业的会议纪要助手，负责：

## 核心功能
1. **内容整理**：将会议内容结构化
2. **要点提取**：识别关键讨论点和决策
3. **待办生成**：提取行动项并明确责任人
4. **时间追踪**：标注重要时间节点和截止日期

## 输出格式
📋 **会议纪要**

**会议信息**
- 主题：
- 时间：
- 参会人：

**议程回顾**
1. ...
2. ...

**关键决策**
✅ 决策1
✅ 决策2

**待办事项**
| 事项 | 负责人 | 截止日期 |
|-----|-------|---------|
| ... | ...   | ...     |

**下次会议**
- 时间：
- 议题：`,
    outputFormat: "markdown",
  },
  {
    id: "image-prompt-master",
    name: "图像提示词大师",
    version: "1.0.0",
    description: "专业的AI绘画提示词生成器，支持Midjourney、Stable Diffusion等",
    author: "AI Workflow",
    tags: ["AI绘画", "提示词", "创意"],
    icon: "Image",
    systemPrompt: `你是一位专业的AI绘画提示词工程师，精通：

## 支持平台
- Midjourney (MJ)
- Stable Diffusion (SD)
- DALL-E
- Flux

## 提示词结构
1. **主体描述**：核心对象、人物、场景
2. **风格定义**：艺术风格、画家参考、时代特征
3. **细节增强**：光影、材质、氛围、色调
4. **技术参数**：比例、质量、负面提示词

## 输出格式
根据用户需求，输出对应平台的优化提示词：

**Midjourney格式**
[主体], [风格], [细节], [光影], [参数] --ar 16:9 --v 6 --q 2

**Stable Diffusion格式**
Positive: [正向提示词]
Negative: [负向提示词]
Steps: 30, CFG: 7, Sampler: DPM++ 2M Karras`,
    tools: [
      {
        name: "enhance_prompt",
        description: "增强和优化提示词",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "原始提示词" },
            platform: {
              type: "string",
              description: "目标平台",
              enum: ["midjourney", "stable-diffusion", "dall-e", "flux"],
            },
            style: { type: "string", description: "期望风格" },
          },
          required: ["prompt", "platform"],
        },
      },
    ],
    outputFormat: "text",
  },
  {
    id: "translator-pro",
    name: "专业翻译官",
    version: "1.0.0",
    description: "多语言专业翻译，支持术语表和风格定制",
    author: "AI Workflow",
    tags: ["翻译", "多语言", "本地化"],
    icon: "BookOpen",
    systemPrompt: `你是一位专业的多语言翻译专家，具备：

## 翻译原则
1. **信**：准确传达原文含义
2. **达**：表达通顺流畅
3. **雅**：符合目标语言习惯

## 专业能力
- 技术文档翻译
- 商务合同翻译
- 文学作品翻译
- 本地化适配

## 输出格式
**原文**
[原始文本]

**译文**
[翻译结果]

**翻译说明**
- 关键术语处理
- 文化适配说明
- 可选的替代表达`,
    tools: [
      {
        name: "lookup_terminology",
        description: "查询专业术语库",
        parameters: {
          type: "object",
          properties: {
            term: { type: "string", description: "要查询的术语" },
            domain: {
              type: "string",
              description: "专业领域",
              enum: ["tech", "legal", "medical", "finance"],
            },
          },
          required: ["term"],
        },
      },
    ],
    outputFormat: "markdown",
  },
];

// ============================================
// Icon Mapping
// ============================================

const SKILL_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  PenTool: PenTool,
  Code: Code,
  FileText: FileText,
  MessageSquare: MessageSquare,
  Image: Image,
  BookOpen: BookOpen,
  Zap: Zap,
  Sparkles: Sparkles,
};

// ============================================
// Props
// ============================================

interface ClaudeSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkillSelect: (skill: ClaudeSkill) => void;
}

// ============================================
// Component
// ============================================

export function ClaudeSkillDialog({
  open,
  onOpenChange,
  onSkillSelect,
}: ClaudeSkillDialogProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "templates" | "create">(
    "templates",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<ClaudeSkill | null>(
    null,
  );
  const [previewSkill, setPreviewSkill] = useState<ClaudeSkill | null>(null);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedSkill, setParsedSkill] = useState<ClaudeSkill | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create state
  const [newSkill, setNewSkill] = useState<Partial<ClaudeSkill>>({
    name: "",
    description: "",
    systemPrompt: "",
    tags: [],
    outputFormat: "text",
  });
  const [newTag, setNewTag] = useState("");

  // Filter templates by search
  const filteredTemplates = SKILL_TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags?.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadedFile(file);
      setUploadError(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content) as ClaudeSkill;

          // Validate required fields
          if (!parsed.name || !parsed.systemPrompt) {
            throw new Error("Skill 文件缺少必要字段 (name, systemPrompt)");
          }

          // Add id if missing
          if (!parsed.id) {
            parsed.id = `custom_${Date.now()}`;
          }

          setParsedSkill(parsed);
        } catch (err) {
          setUploadError(
            err instanceof Error ? err.message : "文件解析失败，请检查格式",
          );
          setParsedSkill(null);
        }
      };
      reader.onerror = () => {
        setUploadError("文件读取失败");
        setParsedSkill(null);
      };
      reader.readAsText(file);
    },
    [],
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (
        file &&
        (file.name.endsWith(".json") || file.name.endsWith(".skill"))
      ) {
        const fakeEvent = {
          target: { files: [file] },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleFileUpload(fakeEvent);
      } else {
        setUploadError("请上传 .json 或 .skill 格式的文件");
      }
    },
    [handleFileUpload],
  );

  // Handle create skill
  const handleCreateSkill = () => {
    if (!newSkill.name || !newSkill.systemPrompt) {
      return;
    }

    const skill: ClaudeSkill = {
      id: `custom_${Date.now()}`,
      name: newSkill.name,
      version: "1.0.0",
      description: newSkill.description || "",
      systemPrompt: newSkill.systemPrompt,
      tags: newSkill.tags,
      outputFormat: newSkill.outputFormat as "text" | "json" | "markdown",
      tools: newSkill.tools,
      createdAt: new Date().toISOString(),
    };

    onSkillSelect(skill);
    onOpenChange(false);
  };

  // Add tag
  const handleAddTag = () => {
    if (newTag && !newSkill.tags?.includes(newTag)) {
      setNewSkill({
        ...newSkill,
        tags: [...(newSkill.tags || []), newTag],
      });
      setNewTag("");
    }
  };

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    setNewSkill({
      ...newSkill,
      tags: newSkill.tags?.filter((t) => t !== tag),
    });
  };

  // Get icon component
  const getSkillIcon = (iconName?: string) => {
    const IconComponent = iconName
      ? SKILL_ICONS[iconName]
      : SKILL_ICONS.Sparkles;
    return IconComponent || Sparkles;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Claude Skill 技能包
          </DialogTitle>
          <DialogDescription>
            选择或创建 Claude Skill 技能包，自动配置 Claude Opus 4.5
            模型执行专业任务
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              上传技能包
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileJson className="h-4 w-4" />
              技能模板
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <PenTool className="h-4 w-4" />
              自建技能包
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="flex-1 mt-4">
            <div className="space-y-4">
              {/* Upload Area */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  "hover:border-primary/50 hover:bg-muted/30",
                  uploadError && "border-red-500/50 bg-red-50/30",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.skill"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <div className="flex flex-col items-center gap-3">
                  {uploadError ? (
                    <AlertCircle className="h-12 w-12 text-red-500" />
                  ) : parsedSkill ? (
                    <Check className="h-12 w-12 text-green-500" />
                  ) : (
                    <Upload className="h-12 w-12 text-muted-foreground" />
                  )}
                  <div>
                    {uploadError ? (
                      <p className="text-red-500 text-sm">{uploadError}</p>
                    ) : parsedSkill ? (
                      <div>
                        <p className="font-medium text-green-600">
                          文件解析成功！
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {uploadedFile?.name}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">
                          拖拽文件到此处，或点击上传
                        </p>
                        <p className="text-sm text-muted-foreground">
                          支持 .json 或 .skill 格式
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </Button>
                </div>
              </div>

              {/* Parsed Skill Preview */}
              {parsedSkill && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const Icon = getSkillIcon(parsedSkill.icon);
                        return (
                          <div className="p-2 rounded-lg bg-orange-100">
                            <Icon className="h-6 w-6 text-orange-600" />
                          </div>
                        );
                      })()}
                      <div>
                        <h3 className="font-semibold">{parsedSkill.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          v{parsedSkill.version}
                          {parsedSkill.author && ` · ${parsedSkill.author}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">已解析</Badge>
                  </div>
                  <p className="text-sm">{parsedSkill.description}</p>
                  {parsedSkill.tags && parsedSkill.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {parsedSkill.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">
                      系统提示词预览：
                    </p>
                    <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-32 overflow-auto">
                      {parsedSkill.systemPrompt.slice(0, 300)}
                      {parsedSkill.systemPrompt.length > 300 && "..."}
                    </div>
                  </div>
                </div>
              )}

              {/* File Format Guide */}
              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  Skill 文件格式说明
                </h4>
                <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-48">
                  {JSON.stringify(
                    {
                      name: "技能名称",
                      version: "1.0.0",
                      description: "技能描述",
                      systemPrompt: "系统提示词...",
                      tools: [
                        {
                          name: "tool_name",
                          description: "工具描述",
                          parameters: {},
                        },
                      ],
                      outputFormat: "text | json | markdown",
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </div>

            {/* Upload Actions */}
            {parsedSkill && (
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadedFile(null);
                    setParsedSkill(null);
                    setUploadError(null);
                  }}
                >
                  重新选择
                </Button>
                <Button
                  onClick={() => {
                    onSkillSelect(parsedSkill);
                    onOpenChange(false);
                  }}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Check className="h-4 w-4 mr-2" />
                  使用此技能包
                </Button>
              </DialogFooter>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent
            value="templates"
            className="flex-1 mt-4 flex flex-col min-h-0"
          >
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索技能模板..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Templates Grid */}
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-3 pr-4">
                {filteredTemplates.map((template) => {
                  const Icon = getSkillIcon(template.icon);
                  const isSelected = selectedTemplate?.id === template.id;

                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "border rounded-lg p-4 cursor-pointer transition-all",
                        "hover:border-orange-300 hover:shadow-sm",
                        isSelected && "border-orange-500 bg-orange-50/50",
                      )}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "p-2 rounded-lg",
                            isSelected ? "bg-orange-200" : "bg-muted",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-5 w-5",
                              isSelected
                                ? "text-orange-600"
                                : "text-muted-foreground",
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-sm truncate">
                              {template.name}
                            </h3>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewSkill(template);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {template.description}
                          </p>
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {template.tags?.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Template Actions */}
            {selectedTemplate && (
              <DialogFooter className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mr-auto text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-orange-500" />
                  已选择: {selectedTemplate.name}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setSelectedTemplate(null)}
                >
                  取消选择
                </Button>
                <Button
                  onClick={() => {
                    onSkillSelect(selectedTemplate);
                    onOpenChange(false);
                  }}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Check className="h-4 w-4 mr-2" />
                  使用此模板
                </Button>
              </DialogFooter>
            )}
          </TabsContent>

          {/* Create Tab */}
          <TabsContent value="create" className="flex-1 mt-4 overflow-auto">
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">技能名称 *</Label>
                  <Input
                    value={newSkill.name || ""}
                    onChange={(e) =>
                      setNewSkill({ ...newSkill, name: e.target.value })
                    }
                    placeholder="例如：内容创作助手"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">输出格式</Label>
                  <Select
                    value={newSkill.outputFormat || "text"}
                    onValueChange={(v) =>
                      setNewSkill({
                        ...newSkill,
                        outputFormat: v as "text" | "json" | "markdown",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">纯文本</SelectItem>
                      <SelectItem value="markdown">Markdown</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">技能描述</Label>
                <Input
                  value={newSkill.description || ""}
                  onChange={(e) =>
                    setNewSkill({ ...newSkill, description: e.target.value })
                  }
                  placeholder="简要描述这个技能的用途..."
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="text-sm">标签</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="添加标签..."
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleAddTag}
                    disabled={!newTag}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {newSkill.tags && newSkill.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {newSkill.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <Label className="text-sm">系统提示词 *</Label>
                <Textarea
                  value={newSkill.systemPrompt || ""}
                  onChange={(e) =>
                    setNewSkill({ ...newSkill, systemPrompt: e.target.value })
                  }
                  placeholder={`定义这个技能的角色、能力和行为规范...

例如：
你是一位专业的内容创作助手，擅长：
- 小红书种草文案
- 公众号深度文章
- 抖音短视频脚本

请根据用户的需求，输出高质量的内容。`}
                  className="min-h-[200px] font-mono text-sm"
                  style={{
                    height: "200px",
                    minHeight: "150px",
                    maxHeight: "400px",
                  }}
                />
              </div>

              {/* User Prompt Template */}
              <div className="space-y-2">
                <Label className="text-sm">用户提示词模板（可选）</Label>
                <Textarea
                  value={newSkill.userPromptTemplate || ""}
                  onChange={(e) =>
                    setNewSkill({
                      ...newSkill,
                      userPromptTemplate: e.target.value,
                    })
                  }
                  placeholder="支持 {{变量}} 占位符，例如：请帮我写一篇关于 {{topic}} 的 {{platform}} 文章"
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              {/* Tips */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-medium text-sm text-orange-800 mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  技能包提示
                </h4>
                <ul className="text-xs text-orange-700 space-y-1">
                  <li>• 系统提示词应该清晰定义角色、能力边界和输出格式</li>
                  <li>• 使用 Markdown 格式组织提示词，提高可读性</li>
                  <li>• 可以包含示例来指导模型的输出风格</li>
                  <li>• 创建后，此技能包将自动绑定 Claude Opus 4.5 模型</li>
                </ul>
              </div>
            </div>

            {/* Create Actions */}
            <DialogFooter className="mt-4 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() =>
                  setNewSkill({
                    name: "",
                    description: "",
                    systemPrompt: "",
                    tags: [],
                    outputFormat: "text",
                  })
                }
              >
                重置
              </Button>
              <Button
                onClick={handleCreateSkill}
                disabled={!newSkill.name || !newSkill.systemPrompt}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Plus className="h-4 w-4 mr-2" />
                创建技能包
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>

        {/* Preview Modal */}
        {previewSkill && (
          <Dialog
            open={!!previewSkill}
            onOpenChange={() => setPreviewSkill(null)}
          >
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = getSkillIcon(previewSkill.icon);
                    return <Icon className="h-5 w-5 text-orange-500" />;
                  })()}
                  {previewSkill.name}
                </DialogTitle>
                <DialogDescription>
                  {previewSkill.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">基本信息</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">版本</div>
                    <div>{previewSkill.version}</div>
                    <div className="text-muted-foreground">作者</div>
                    <div>{previewSkill.author || "未知"}</div>
                    <div className="text-muted-foreground">输出格式</div>
                    <div>{previewSkill.outputFormat || "text"}</div>
                  </div>
                </div>

                {previewSkill.tags && previewSkill.tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">标签</h4>
                    <div className="flex gap-1 flex-wrap">
                      {previewSkill.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium mb-2">系统提示词</h4>
                  <div className="bg-muted rounded-lg p-3 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-auto">
                    {previewSkill.systemPrompt}
                  </div>
                </div>

                {previewSkill.tools && previewSkill.tools.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      内置工具 ({previewSkill.tools.length})
                    </h4>
                    <div className="space-y-2">
                      {previewSkill.tools.map((tool, idx) => (
                        <div key={idx} className="border rounded p-2 text-sm">
                          <div className="font-medium">{tool.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {tool.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {previewSkill.examples && previewSkill.examples.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">示例</h4>
                    <div className="space-y-2">
                      {previewSkill.examples.map((example, idx) => (
                        <div key={idx} className="border rounded p-3 space-y-2">
                          {example.description && (
                            <div className="text-xs text-muted-foreground">
                              {example.description}
                            </div>
                          )}
                          <div>
                            <span className="text-xs font-medium text-blue-600">
                              输入:
                            </span>
                            <div className="text-sm mt-1">{example.input}</div>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-green-600">
                              输出:
                            </span>
                            <div className="text-sm mt-1 whitespace-pre-wrap">
                              {example.output.slice(0, 200)}
                              {example.output.length > 200 && "..."}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewSkill(null)}>
                  关闭
                </Button>
                <Button
                  onClick={() => {
                    setSelectedTemplate(previewSkill);
                    setPreviewSkill(null);
                  }}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  选择此模板
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ClaudeSkillDialog;
