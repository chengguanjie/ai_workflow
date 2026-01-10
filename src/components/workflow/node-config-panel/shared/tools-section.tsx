"use client";

import { useState, useMemo } from "react";
import {
  Globe,
  Table2,
  BookOpen,
  Video,
  MessageCircle,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Settings,
  Trash2,
  GripVertical,
  Sparkles,
  Bell,
  Wrench,
  Music,
  Server,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import { ClaudeSkillDialog, type ClaudeSkill } from "./claude-skill-dialog";
import { AIGenerateButton } from "./ai-generate-button";
import { VariableInput } from "./variable-input";
import { VariableTextarea } from "./variable-textarea";
import { MCPToolConfig } from "./mcp-tool-config";
import { useWorkflowStore } from "@/stores/workflow-store";
import { SHENSUAN_MODELS, SHENSUAN_DEFAULT_MODELS } from "@/lib/ai/types";
import { MODELSCOPE_MCP_PRESETS } from "@/lib/mcp/types";

// 工具类型定义
export interface ToolConfig {
  id: string;
  type: ToolType;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export type ToolType =
  | "http-request"
  | "code-execution"
  | "feishu-bitable"
  | "xiaohongshu"
  | "image-gen-ai"
  | "video-gen-ai"
  | "audio-tts-ai"
  | "douyin-video"
  | "wechat-mp"
  | "wechat-channels"
  | "claude-skill"
  | "notification-feishu"
  | "notification-dingtalk"
  | "notification-wecom"
  | "mcp-server"
  | "mcp-modelscope"
  | "custom";

// 工具元数据
const TOOL_METADATA: Record<
  ToolType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    color: string;
  }
> = {
  "http-request": {
    label: "HTTP 请求",
    icon: Globe,
    description: "发送 HTTP 请求到外部 API",
    color: "text-blue-500",
  },
  "code-execution": {
    label: "代码执行",
    icon: Wrench,
    description: "在受控沙箱中运行代码（JS/TS/Python）",
    color: "text-amber-500",
  },
  "feishu-bitable": {
    label: "飞书多维表格",
    icon: Table2,
    description: "读写飞书多维表格数据",
    color: "text-indigo-500",
  },
  xiaohongshu: {
    label: "小红书",
    icon: BookOpen,
    description: "发布内容到小红书",
    color: "text-red-500",
  },
  "image-gen-ai": {
    label: "图片生成",
    icon: Sparkles,
    description: "在当前节点内生成图片",
    color: "text-purple-500",
  },
  "video-gen-ai": {
    label: "视频生成",
    icon: Video,
    description: "在当前节点内生成视频",
    color: "text-fuchsia-500",
  },
  "audio-tts-ai": {
    label: "音频生成（TTS）",
    icon: Music,
    description: "在当前节点内将文本转语音",
    color: "text-emerald-500",
  },
  "douyin-video": {
    label: "抖音视频",
    icon: Video,
    description: "发布视频到抖音",
    color: "text-pink-500",
  },
  "wechat-mp": {
    label: "微信公众号",
    icon: MessageCircle,
    description: "发布文章到微信公众号",
    color: "text-green-500",
  },
  "wechat-channels": {
    label: "视频号",
    icon: Video,
    description: "发布内容到视频号",
    color: "text-teal-500",
  },
  "claude-skill": {
    label: "Claude Skill",
    icon: Sparkles,
    description: "使用 Claude Opus 4.5 执行专业技能包",
    color: "text-orange-500",
  },
  "notification-feishu": {
    label: "飞书通知",
    icon: Bell,
    description: "发送消息到飞书群机器人",
    color: "text-blue-600",
  },
  "notification-dingtalk": {
    label: "钉钉通知",
    icon: Bell,
    description: "发送消息到钉钉群机器人",
    color: "text-sky-500",
  },
  "notification-wecom": {
    label: "企业微信通知",
    icon: Bell,
    description: "发送消息到企业微信群机器人",
    color: "text-green-600",
  },
  "mcp-server": {
    label: "MCP 服务",
    icon: Server,
    description: "连接 MCP 服务器调用外部工具",
    color: "text-cyan-500",
  },
  "mcp-modelscope": {
    label: "魔搭 MCP",
    icon: Plug,
    description: "使用魔搭平台 MCP 服务（预设配置）",
    color: "text-violet-500",
  },
  custom: {
    label: "自定义工具",
    icon: Settings,
    description: "自定义工具配置",
    color: "text-gray-500",
  },
};

// 工具展示顺序（添加工具时的列表）
const TOOL_ORDER: ToolType[] = [
  "image-gen-ai",
  "video-gen-ai",
  "audio-tts-ai",
  "code-execution",
  "http-request",
  "claude-skill",
  "mcp-modelscope",
  "mcp-server",
  "feishu-bitable",
  "douyin-video",
  "wechat-channels",
  "xiaohongshu",
  "wechat-mp",
  "notification-feishu",
  "notification-dingtalk",
  "notification-wecom",
  "custom",
];

interface ToolsSectionProps {
  tools: ToolConfig[];
  onToolsChange: (tools: ToolConfig[]) => void;
}

export function ToolsSection({ tools, onToolsChange }: ToolsSectionProps) {
  const [isAddingTool, setIsAddingTool] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false);
  const [editingSkillToolId, setEditingSkillToolId] = useState<string | null>(
    null,
  );

  // 从当前选中节点中推断 userPrompt，用于多模态工具默认模板
  const { nodes, selectedNodeId } = useWorkflowStore();
  const currentUserPrompt = useMemo(() => {
    const node = nodes.find((n) => n.id === selectedNodeId);
    const data = node?.data as
      | { config?: { userPrompt?: string }; userPrompt?: string }
      | undefined;
    // 兼容不同存储方式
    return (
      data?.config?.userPrompt ||
      (node?.data as any)?.userPrompt ||
      ""
    );
  }, [nodes, selectedNodeId]);

  // 添加新工具
  const handleAddTool = (type: ToolType) => {
    // Claude Skill 需要打开弹窗选择
    if (type === "claude-skill") {
      setEditingSkillToolId(null);
      setIsSkillDialogOpen(true);
      setIsAddingTool(false);
      return;
    }

    let config: Record<string, unknown> = getDefaultConfig(type);

    // 对 MCP 工具类型，设置特定的默认配置
    if (type === "mcp-modelscope") {
      // 魔搭 MCP 预设：使用第一个预设作为默认
      const firstPresetKey = Object.keys(MODELSCOPE_MCP_PRESETS)[0];
      const firstPreset = MODELSCOPE_MCP_PRESETS[firstPresetKey];
      if (firstPreset) {
        config = {
          ...config,
          presetType: firstPresetKey,
          serverUrl: firstPreset.url,
          serverName: firstPreset.name,
          transport: 'http',
          authType: 'api-key',
        };
      }
    }

    // 对多模态相关工具，根据当前节点的 userPrompt 生成一个更贴合场景的默认提示词模板
    if (type === "image-gen-ai" || type === "video-gen-ai" || type === "audio-tts-ai") {
      const trimmed = currentUserPrompt?.trim() ?? "";
      const preview =
        trimmed.length > 200 ? trimmed.slice(0, 200) + "..." : trimmed;

      const commonHeader = [
        "你是一名多模态创意助手，请基于上游节点提供的内容和当前工具配置，生成适合目标模态的高质量英文提示词（prompt）。",
        "",
        preview
          ? "【上游节点的用户提示（摘要）】\n" + preview + "\n"
          : "",
        "【使用说明】",
      ];

      if (type === "image-gen-ai") {
        config = {
          ...config,
          promptTemplate: [
            ...commonHeader,
            "1. 图片生成：尽量具体描述画面主体、风格、光线、构图，结合 imageQuality / imageStyle；",
            "2. 如需引用工作流变量，请使用 {{节点名.字段名}} 或 {{用户输入.xxx}} 的格式；",
            "3. 只输出给模型使用的英文 prompt，不要附加任何解释或中英文混排。",
          ].join("\n"),
        };
      } else if (type === "video-gen-ai") {
        config = {
          ...config,
          promptTemplate: [
            ...commonHeader,
            "1. 视频生成：可分镜（镜头1/2/3...）描述画面变化，结合时长、宽高比和分辨率；如存在参考图片，请保持画面风格一致；",
            "2. 如需引用工作流变量，请使用 {{节点名.字段名}} 或 {{用户输入.xxx}} 的格式；",
            "3. 只输出给模型使用的英文 prompt，不要附加任何解释或中英文混排。",
          ].join("\n"),
        };
      } else if (type === "audio-tts-ai") {
        config = {
          ...config,
          promptTemplate: [
            ...commonHeader,
            "1. 文本转语音：请生成适合朗读的脚本，可根据 ttsSpeed / ttsEmotion 控制节奏与情绪；",
            "2. 语言风格应口语化、自然流畅，适合直接播放给用户；",
            "3. 如需引用工作流变量，请使用 {{节点名.字段名}} 或 {{用户输入.xxx}} 的格式；",
            "4. 只输出给模型使用的英文 prompt，不要附加任何解释或中英文混排。",
          ].join("\n"),
        };
      }
    }

    const newTool: ToolConfig = {
      id: `tool_${Date.now()}`,
      type,
      name: TOOL_METADATA[type].label,
      enabled: true,
      config,
    };
    onToolsChange([...tools, newTool]);
    setExpandedTools(new Set([...expandedTools, newTool.id]));
    setIsAddingTool(false);
  };

  // 处理 Skill 选择
  const handleSkillSelect = (skill: ClaudeSkill) => {
    if (editingSkillToolId) {
      // 更新现有工具
      handleUpdateToolConfig(editingSkillToolId, {
        skill,
        skillId: skill.id,
        skillName: skill.name,
      });
    } else {
      // 创建新工具
      const newTool: ToolConfig = {
        id: `tool_${Date.now()}`,
        type: "claude-skill",
        name: skill.name,
        enabled: true,
        config: {
          skill,
          skillId: skill.id,
          skillName: skill.name,
          model: "claude-opus-4-5-20250514",
        },
      };
      onToolsChange([...tools, newTool]);
      setExpandedTools(new Set([...expandedTools, newTool.id]));
    }
    setEditingSkillToolId(null);
  };

  // 更新工具配置
  const handleUpdateTool = (id: string, updates: Partial<ToolConfig>) => {
    onToolsChange(
      tools.map((tool) => (tool.id === id ? { ...tool, ...updates } : tool)),
    );
  };

  // 更新工具内部配置
  const handleUpdateToolConfig = (
    id: string,
    configUpdates: Record<string, unknown>,
  ) => {
    onToolsChange(
      tools.map((tool) =>
        tool.id === id
          ? { ...tool, config: { ...tool.config, ...configUpdates } }
          : tool,
      ),
    );
  };

  // 删除工具
  const handleRemoveTool = (id: string) => {
    onToolsChange(tools.filter((tool) => tool.id !== id));
    const newExpanded = new Set(expandedTools);
    newExpanded.delete(id);
    setExpandedTools(newExpanded);
  };

  // 切换展开/收起
  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTools(newExpanded);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">调用工具</Label>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setIsAddingTool(!isAddingTool)}
        >
          <Plus className="h-3 w-3 mr-1" />
          添加工具
        </Button>
      </div>

      {/* 添加工具选择器 */}
      {isAddingTool && (
        <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
          <p className="text-xs text-muted-foreground mb-2">
            选择要添加的工具：
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TOOL_ORDER.map((type) => {
              const meta = TOOL_METADATA[type];
              // 理论上 TOOL_ORDER 中的类型都会在 TOOL_METADATA 中注册，
              // 但这里仍然做一次空值保护，避免未来改动导致运行时报错。
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  className="flex items-center gap-2 p-2 rounded-md border bg-background hover:bg-muted/50 hover:border-primary/50 transition-colors text-left"
                  onClick={() => handleAddTool(type)}
                >
                  <Icon className={cn("h-4 w-4", meta.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{meta.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {meta.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs mt-2"
            onClick={() => setIsAddingTool(false)}
          >
            取消
          </Button>
        </div>
      )}

      {/* 已添加的工具列表 */}
      {tools.length === 0 && !isAddingTool ? (
        <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg text-xs">
          暂无调用工具，点击“添加工具”开始配置
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => {
            const meta =
              TOOL_METADATA[tool.type as ToolType] || {
                // 兜底处理未知工具类型，避免因后端/历史数据中的旧类型字符串导致运行时报错
                label: tool.name || "未知工具",
                icon: Settings,
                description:
                  "此工具类型未在当前版本中注册，请重新配置或删除该工具。",
                color: "text-gray-400",
              };
            const Icon = meta.icon;
            const isExpanded = expandedTools.has(tool.id);

            return (
              <Collapsible
                key={tool.id}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(tool.id)}
              >
                <div className="border rounded-lg bg-background overflow-hidden">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-move" />
                      <Icon className={cn("h-4 w-4", meta.color)} />
                      <span className="text-sm font-medium flex-1 text-left">
                        {tool.name}
                      </span>
                      <Badge
                        variant={tool.enabled ? "default" : "secondary"}
                        className="text-[10px] h-5"
                      >
                        {tool.enabled ? "启用" : "禁用"}
                      </Badge>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-1 border-t space-y-3">
                      {/* 基础配置 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={tool.enabled}
                            onCheckedChange={(enabled) =>
                              handleUpdateTool(tool.id, { enabled })
                            }
                          />
                          <Label className="text-xs">启用此工具</Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-500"
                          onClick={() => handleRemoveTool(tool.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* 工具特定配置 */}
                      <ToolConfigPanel
                        type={tool.type}
                        config={tool.config}
                        onConfigChange={(updates) =>
                          handleUpdateToolConfig(tool.id, updates)
                        }
                        onEditSkill={
                          tool.type === "claude-skill"
                            ? () => {
                              setEditingSkillToolId(tool.id);
                              setIsSkillDialogOpen(true);
                            }
                            : undefined
                        }
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}
      {/* Claude Skill Dialog */}
      <ClaudeSkillDialog
        open={isSkillDialogOpen}
        onOpenChange={setIsSkillDialogOpen}
        onSkillSelect={handleSkillSelect}
      />
    </div>
  );
}

// 获取默认配置
function getDefaultConfig(type: ToolType): Record<string, unknown> {
  switch (type) {
    case "http-request":
      return {
        method: "GET",
        url: "",
        headers: [],
        body: "",
        bodyType: "json",
        timeout: 30000,
      };
    case "feishu-bitable":
      return {
        appToken: "",
        tableId: "",
        operation: "read",
        fields: [],
      };
    case "xiaohongshu":
      return {
        action: "publish",
        title: "",
        content: "",
        images: [],
      };
    case "douyin-video":
      return {
        action: "publish",
        title: "",
        description: "",
        videoUrl: "",
        coverUrl: "",
        tags: [],
      };
    case "code-execution":
      return {
        language: "javascript",
        code: "",
        timeoutMs: 2000,
        maxOutputSize: 32000,
        model: SHENSUAN_DEFAULT_MODELS.code,
      };
    case "image-gen-ai":
      return {
        promptTemplate: "",
        imageSize: "1024x1024",
        imageCount: 1,
        imageQuality: "standard",
        imageStyle: "vivid",
        negativePrompt: "",
        model: SHENSUAN_DEFAULT_MODELS["image-gen"],
      };
    case "video-gen-ai":
      return {
        promptTemplate: "",
        videoDuration: 5,
        videoAspectRatio: "16:9",
        videoResolution: "1080p",
        videoReferenceImage: "",
        model: SHENSUAN_DEFAULT_MODELS["video-gen"],
      };
    case "audio-tts-ai":
      return {
        promptTemplate: "",
        ttsVoice: "",
        ttsFormat: "mp3",
        ttsSpeed: 1.0,
        ttsEmotion: "",
        model: SHENSUAN_DEFAULT_MODELS["audio-tts"],
      };
    case "wechat-mp":
      return {
        action: "publish",
        title: "",
        content: "",
        author: "",
        digest: "",
      };
    case "wechat-channels":
      return {
        action: "publish",
        title: "",
        description: "",
        videoUrl: "",
        coverUrl: "",
        tags: [],
      };
    case "claude-skill":
      return {
        skill: null,
        skillId: "",
        skillName: "",
        model: "claude-opus-4-5-20250514",
      };
    case "notification-feishu":
      return {
        webhookUrl: "",
        messageType: "text",
        title: "",
        content: "",
        atAll: false,
      };
    case "notification-dingtalk":
      return {
        webhookUrl: "",
        messageType: "text",
        title: "",
        content: "",
        atMobiles: [],
        atAll: false,
      };
    case "notification-wecom":
      return {
        webhookUrl: "",
        messageType: "text",
        content: "",
        mentionedList: [],
        mentionedMobileList: [],
      };
    case "mcp-server":
      return {
        serverUrl: "",
        serverName: "",
        transport: "http",
        authType: "none",
        apiKey: "",
        timeout: 30000,
        selectedTools: [],
        presetType: "",
      };
    case "mcp-modelscope":
      return {
        serverUrl: "",
        serverName: "",
        transport: "http",
        authType: "api-key",
        apiKey: "",
        timeout: 30000,
        selectedTools: [],
        presetType: "",
      };
    case "custom":
      return {
        script: "",
        parameters: [],
      };
    default:
      return {};
  }
}

// 工具配置面板
function ToolConfigPanel({
  type,
  config,
  onConfigChange,
  onEditSkill,
}: {
  type: ToolType;
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
  onEditSkill?: () => void;
}) {
  switch (type) {
    case "http-request":
      return (
        <HttpRequestConfig config={config} onConfigChange={onConfigChange} />
      );
    case "feishu-bitable":
      return (
        <FeishuBitableConfig config={config} onConfigChange={onConfigChange} />
      );
    case "code-execution":
      return (
        <CodeExecutionConfig config={config} onConfigChange={onConfigChange} />
      );
    case "image-gen-ai":
      return (
        <MultimodalAiConfig
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "video-gen-ai":
      return (
        <MultimodalAiConfig
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "audio-tts-ai":
      return (
        <MultimodalAiConfig
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "xiaohongshu":
      return (
        <XiaohongshuConfig config={config} onConfigChange={onConfigChange} />
      );
    case "douyin-video":
      return (
        <DouyinVideoConfig config={config} onConfigChange={onConfigChange} />
      );
    case "wechat-mp":
      return <WechatMPConfig config={config} onConfigChange={onConfigChange} />;
    case "wechat-channels":
      return (
        <WechatChannelsConfig config={config} onConfigChange={onConfigChange} />
      );
    case "claude-skill":
      return (
        <ClaudeSkillConfig
          config={config}
          onConfigChange={onConfigChange}
          onEditSkill={onEditSkill}
        />
      );
    case "notification-feishu":
      return (
        <NotificationConfig
          platform="feishu"
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "notification-dingtalk":
      return (
        <NotificationConfig
          platform="dingtalk"
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "notification-wecom":
      return (
        <NotificationConfig
          platform="wecom"
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "mcp-server":
      return (
        <MCPToolConfig config={config} onConfigChange={onConfigChange} />
      );
    case "mcp-modelscope":
      return (
        <MCPToolConfig config={config} onConfigChange={onConfigChange} />
      );
    case "custom":
      return (
        <CustomToolConfig config={config} onConfigChange={onConfigChange} />
      );
    default:
      return null;
  }
}

function CodeExecutionConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  const language = (config.language as string) || "javascript";
  const code = (config.code as string) || "";
  
  // AI 代码生成模型选项
  const codeModels = SHENSUAN_MODELS.code as readonly string[];
  const selectedCodeModel = (config.model as string) || SHENSUAN_DEFAULT_MODELS.code;

  return (
    <div className="space-y-3">
      {/* AI 代码生成模型选择器 */}
      <div className="space-y-1.5">
        <Label className="text-xs">请选择模型</Label>
        <Select
          value={selectedCodeModel}
          onValueChange={(value) => onConfigChange({ model: value })}
        >
          <SelectTrigger className="h-8 text-xs w-full">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {codeModels.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          选择 AI 模型来生成代码，生成后将在沙箱中执行
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">语言</Label>
          <Select
            value={language}
            onValueChange={(value) => onConfigChange({ language: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="python">Python</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">超时时间 (ms)</Label>
          <Input
            type="number"
            min={100}
            max={10000}
            value={(config.timeoutMs as number) || 2000}
            onChange={(e) =>
              onConfigChange({
                timeoutMs: Number(e.target.value) || 2000,
              })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">代码内容</Label>
          <AIGenerateButton
            fieldType="code"
            currentContent={code}
            onConfirm={(value) => onConfigChange({ code: value })}
            fieldLabel="代码片段"
            size="sm"
            className="h-6"
          />
        </div>
        <Textarea
          value={code}
          onChange={(e) => onConfigChange({ code: e.target.value })}
          className="min-h-[120px] text-xs font-mono"
          placeholder={
            language === "python"
              ? "# 例如：\nresult = input.get('x', 0) + 1"
              : "// 例如：\n// const { x } = input;\n// return x + 1;"
          }
        />
        <p className="text-[10px] text-muted-foreground">
          代码在隔离沙箱中执行，可通过 <code>input</code> 访问调用时传入的数据。
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">最大输出大小</Label>
        <Input
          type="number"
          min={1000}
          max={256000}
          value={(config.maxOutputSize as number) || 32000}
          onChange={(e) =>
            onConfigChange({
              maxOutputSize: Number(e.target.value) || 32000,
            })
          }
          className="h-8 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          限制 stdout/stderr 输出大小，防止异常日志撑爆上下文。
        </p>
      </div>
    </div>
  );
}

function MultimodalAiConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  // 通过是否存在视频 / 音频相关字段，推断当前工具的模态类型
  // image-gen-ai: 只配置图片参数
  // video-gen-ai: 主要配置视频参数
  // audio-tts-ai: 主要配置 TTS 参数
  let modality: "image" | "video" | "audio_tts" = "image";
  if (config.videoDuration || config.videoAspectRatio || config.videoResolution) {
    modality = "video";
  } else if (config.ttsVoice || config.ttsFormat || config.ttsSpeed) {
    modality = "audio_tts";
  }
  const promptTemplate = (config.promptTemplate as string) || "";
  const imageQuality = (config.imageQuality as string) || "standard";
  const imageStyle = (config.imageStyle as string) || "vivid";
  const videoResolution = (config.videoResolution as string) || "1080p";
  const videoReferenceImage = (config.videoReferenceImage as string) || "";
  const ttsSpeed =
    typeof config.ttsSpeed === "number" ? (config.ttsSpeed as number) : 1.0;
  const ttsEmotion = (config.ttsEmotion as string) || "";

  // 根据当前模态获取可选模型列表和默认模型
  const modelOptions: readonly string[] =
    modality === "image"
      ? SHENSUAN_MODELS["image-gen"]
      : modality === "video"
        ? SHENSUAN_MODELS["video-gen"]
        : modality === "audio_tts"
          ? SHENSUAN_MODELS["audio-tts"]
          : [];

  const defaultModel =
    modality === "image"
      ? SHENSUAN_DEFAULT_MODELS["image-gen"]
      : modality === "video"
        ? SHENSUAN_DEFAULT_MODELS["video-gen"]
        : modality === "audio_tts"
          ? SHENSUAN_DEFAULT_MODELS["audio-tts"]
          : "";

  const selectedModel =
    (config.model as string) || defaultModel || (modelOptions[0] ?? "");

  return (
    <div className="space-y-3">
      {/* 模型选择器 - 放在提示词之前 */}
      <div className="space-y-1.5">
        <Label className="text-xs">请选择模型</Label>
        <Select
          value={selectedModel}
          onValueChange={(value) => onConfigChange({ model: value })}
        >
          <SelectTrigger className="h-8 text-xs w-full">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {modality === "image" && "选择图片生成模型（Gemini/豆包/通义）"}
          {modality === "video" && "选择视频生成模型（Sora/Veo/Kling）"}
          {modality === "audio_tts" && "选择语音合成模型"}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">输入提示词</Label>
          {/* 复用通用 AI 按钮，对当前模板进行优化 */}
          <AIGenerateButton
            fieldType="imagePrompt"
            currentContent={promptTemplate}
            onConfirm={(value) => onConfigChange({ promptTemplate: value })}
            fieldLabel="多模态输入提示词"
            size="sm"
            className="h-6"
          />
        </div>
        <VariableTextarea
          value={promptTemplate}
          onChange={(value) => onConfigChange({ promptTemplate: value })}
          minHeight="72px"
          placeholder="请输入给多模态模型的完整提示词，支持使用 {{变量}} 引用节点输出或用户输入"
        />
      </div>

      {modality === "image" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">图片尺寸</Label>
              <Select
                value={(config.imageSize as string) || "1024x1024"}
                onValueChange={(value) => onConfigChange({ imageSize: value })}
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024x1024">1024x1024 (正方形)</SelectItem>
                  <SelectItem value="1792x1024">1792x1024 (横版 16:9)</SelectItem>
                  <SelectItem value="1024x1792">1024x1792 (竖版 9:16)</SelectItem>
                  <SelectItem value="1280x720">1280x720 (横版 HD)</SelectItem>
                  <SelectItem value="720x1280">720x1280 (竖版 HD)</SelectItem>
                  <SelectItem value="900x500">900x500 (公众号封面)</SelectItem>
                  <SelectItem value="512x512">512x512 (小尺寸)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">数量</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={
                  typeof config.imageCount === "number" ? config.imageCount : 1
                }
                onChange={(e) =>
                  onConfigChange({
                    imageCount: Number(e.target.value) || 1,
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">质量</Label>
              <Select
                value={imageQuality}
                onValueChange={(value) =>
                  onConfigChange({ imageQuality: value })
                }
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">标准</SelectItem>
                  <SelectItem value="hd">高清 (HD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">风格</Label>
              <Select
                value={imageStyle}
                onValueChange={(value) =>
                  onConfigChange({ imageStyle: value })
                }
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vivid">生动 (vivid)</SelectItem>
                  <SelectItem value="natural">自然 (natural)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {modality === "video" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">时长（秒）</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={
                  typeof config.videoDuration === "number"
                    ? config.videoDuration
                    : 5
                }
                onChange={(e) =>
                  onConfigChange({
                    videoDuration: Number(e.target.value) || 5,
                  })
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">宽高比</Label>
              <Input
                value={(config.videoAspectRatio as string) || "16:9"}
                onChange={(e) =>
                  onConfigChange({
                    videoAspectRatio: e.target.value,
                  })
                }
                className="h-8 text-xs"
                placeholder="例如 16:9 / 9:16"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">分辨率</Label>
              <Select
                value={videoResolution}
                onValueChange={(value) =>
                  onConfigChange({ videoResolution: value })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="4k">4K</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">参考图片 URL（可选）</Label>
              <VariableInput
                value={videoReferenceImage}
                onChange={(value) =>
                  onConfigChange({ videoReferenceImage: value })
                }
                placeholder="用于图生视频，支持 {{引用}} 上游图片"
                type="url"
              />
            </div>
          </div>
        </div>
      )}

      {modality === "audio_tts" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">语音名称</Label>
              <Input
                value={(config.ttsVoice as string) || ""}
                onChange={(e) => onConfigChange({ ttsVoice: e.target.value })}
                className="h-8 text-xs"
                placeholder="例如 zh_female_1 / alloy"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">音频格式</Label>
              <Input
                value={(config.ttsFormat as string) || "mp3"}
                onChange={(e) => onConfigChange({ ttsFormat: e.target.value })}
                className="h-8 text-xs"
                placeholder="mp3 / wav / opus 等"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">语速</Label>
            <Input
              type="number"
              step={0.25}
              min={0.25}
              max={4}
              value={ttsSpeed}
              onChange={(e) =>
                onConfigChange({
                  ttsSpeed: Number(e.target.value) || 1.0,
                })
              }
              className="h-8 text-xs"
              placeholder="0.25 - 4.0，默认 1.0"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">情绪 / 风格（可选）</Label>
            <Input
              value={ttsEmotion}
              onChange={(e) =>
                onConfigChange({ ttsEmotion: e.target.value })
              }
              className="h-8 text-xs"
              placeholder="例如 calm, excited, serious，用于提示模型情绪风格"
            />
          </div>
        </div>
      )}
    </div>
  );
}


// HTTP 请求配置
function HttpRequestConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  const headers =
    (config.headers as Array<{ key: string; value: string }>) || [];

  const addHeader = () => {
    onConfigChange({ headers: [...headers, { key: "", value: "" }] });
  };

  const updateHeader = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    onConfigChange({ headers: newHeaders });
  };

  const removeHeader = (index: number) => {
    onConfigChange({ headers: headers.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      {/* 请求方法和 URL */}
      <div className="flex gap-2">
        <div className="w-24">
          <Label className="text-xs mb-1.5 block">方法</Label>
          <Select
            value={(config.method as string) || "GET"}
            onValueChange={(value) => onConfigChange({ method: value })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label className="text-xs mb-1.5 block">请求 URL</Label>
          <VariableInput
            value={(config.url as string) || ""}
            onChange={(value) => onConfigChange({ url: value })}
            placeholder="https://api.example.com 或 {{节点名.字段名}}"
            type="url"
          />
        </div>
      </div>

      {/* 请求头 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">请求头</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={addHeader}
          >
            <Plus className="h-3 w-3 mr-1" />
            添加
          </Button>
        </div>
        {headers.length > 0 ? (
          <div className="space-y-1.5">
            {headers.map((header, index) => (
              <div key={index} className="flex gap-1.5 items-center">
                <Input
                  value={header.key}
                  onChange={(e) => updateHeader(index, "key", e.target.value)}
                  className="h-7 text-xs w-28"
                  placeholder="Header Key"
                />
                <div className="flex-1">
                  <VariableInput
                    value={header.value}
                    onChange={(value) => updateHeader(index, "value", value)}
                    placeholder="Header Value 或 {{引用}}"
                    className="[&_input]:h-7"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => removeHeader(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">暂无请求头</p>
        )}
      </div>

      {/* 请求体（仅 POST/PUT/PATCH） */}
      {["POST", "PUT", "PATCH"].includes(
        (config.method as string) || "GET",
      ) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">请求体</Label>
              <Select
                value={(config.bodyType as string) || "json"}
                onValueChange={(value) => onConfigChange({ bodyType: value })}
              >
                <SelectTrigger className="h-6 w-20 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="form">Form</SelectItem>
                  <SelectItem value="raw">Raw</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <VariableTextarea
              value={(config.body as string) || ""}
              onChange={(value) => onConfigChange({ body: value })}
              placeholder='{"key": "value"} 或使用 {{引用}} 插入变量'
              minHeight="80px"
              className="font-mono"
            />
          </div>
        )}

      {/* 超时设置 */}
      <div className="flex items-center gap-2">
        <Label className="text-xs">超时时间</Label>
        <Input
          type="number"
          value={(config.timeout as number) || 30000}
          onChange={(e) =>
            onConfigChange({ timeout: parseInt(e.target.value) || 30000 })
          }
          className="h-7 text-xs w-24"
        />
        <span className="text-xs text-muted-foreground">毫秒</span>
      </div>

      {/* 提取网页内容选项 */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">提取网页内容</Label>
            <p className="text-[10px] text-muted-foreground">
              自动清理HTML标签，提取标题和正文
            </p>
          </div>
          <Switch
            checked={(config.extractContent as boolean) || false}
            onCheckedChange={(checked) =>
              onConfigChange({ extractContent: checked })
            }
          />
        </div>

        {/* 最大内容长度（仅在启用提取时显示） */}
        {Boolean(config.extractContent) && (
          <div className="flex items-center gap-2 pl-2">
            <Label className="text-xs text-muted-foreground">最大字符数</Label>
            <Input
              type="number"
              value={(config.maxContentLength as number) || 8000}
              onChange={(e) =>
                onConfigChange({
                  maxContentLength: parseInt(e.target.value) || 8000,
                })
              }
              className="h-7 text-xs w-24"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// 飞书多维表格配置
function FeishuBitableConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">App Token</Label>
        <Input
          value={(config.appToken as string) || ""}
          onChange={(e) => onConfigChange({ appToken: e.target.value })}
          className="h-8 text-xs font-mono"
          placeholder="输入飞书多维表格 App Token"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Table ID</Label>
        <Input
          value={(config.tableId as string) || ""}
          onChange={(e) => onConfigChange({ tableId: e.target.value })}
          className="h-8 text-xs font-mono"
          placeholder="输入数据表 ID"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">操作类型</Label>
        <Select
          value={(config.operation as string) || "read"}
          onValueChange={(value) => onConfigChange({ operation: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="read">读取记录</SelectItem>
            <SelectItem value="create">创建记录</SelectItem>
            <SelectItem value="update">更新记录</SelectItem>
            <SelectItem value="delete">删除记录</SelectItem>
            <SelectItem value="search">搜索记录</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">字段映射（JSON）</Label>
        <VariableTextarea
          value={
            typeof config.fields === "string"
              ? config.fields
              : JSON.stringify(config.fields || [], null, 2)
          }
          onChange={(value) => {
            try {
              const parsed = JSON.parse(value);
              onConfigChange({ fields: parsed });
            } catch {
              onConfigChange({ fields: value });
            }
          }}
          minHeight="60px"
          placeholder='[{"name": "字段名", "value": "{{引用}}"}]'
          className="font-mono"
        />
      </div>
    </div>
  );
}

// 小红书配置
function XiaohongshuConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">操作类型</Label>
        <Select
          value={(config.action as string) || "publish"}
          onValueChange={(value) => onConfigChange({ action: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="publish">发布笔记</SelectItem>
            <SelectItem value="draft">保存草稿</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">笔记标题</Label>
        <Input
          value={(config.title as string) || ""}
          onChange={(e) => onConfigChange({ title: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入笔记标题，支持 {{变量}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">笔记内容</Label>
        <Textarea
          value={(config.content as string) || ""}
          onChange={(e) => onConfigChange({ content: e.target.value })}
          className="min-h-[100px] text-xs resize-y"
          placeholder="输入笔记内容，支持 {{变量}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">图片 URL（每行一个）</Label>
        <Textarea
          value={
            Array.isArray(config.images)
              ? (config.images as string[]).join("\n")
              : ""
          }
          onChange={(e) =>
            onConfigChange({
              images: e.target.value.split("\n").filter(Boolean),
            })
          }
          className="min-h-[60px] text-xs resize-y"
          placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
        />
      </div>
    </div>
  );
}

// 抖音视频配置
function DouyinVideoConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">操作类型</Label>
        <Select
          value={(config.action as string) || "publish"}
          onValueChange={(value) => onConfigChange({ action: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="选择操作" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="publish">发布视频</SelectItem>
            <SelectItem value="draft">保存草稿</SelectItem>
            <SelectItem value="schedule">定时发布</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">视频标题</Label>
        <Input
          value={(config.title as string) || ""}
          onChange={(e) => onConfigChange({ title: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入视频标题，支持 {{变量}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">视频描述</Label>
        <Textarea
          value={(config.description as string) || ""}
          onChange={(e) => onConfigChange({ description: e.target.value })}
          className="min-h-[80px] text-xs resize-y"
          placeholder="输入视频描述，支持 {{变量}} 和 #话题"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">视频 URL</Label>
        <Input
          value={(config.videoUrl as string) || ""}
          onChange={(e) => onConfigChange({ videoUrl: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入视频文件 URL，支持 {{变量}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">封面图 URL</Label>
        <Input
          value={(config.coverUrl as string) || ""}
          onChange={(e) => onConfigChange({ coverUrl: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入封面图 URL（可选），支持 {{变量}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">标签（每行一个）</Label>
        <Textarea
          value={
            Array.isArray(config.tags)
              ? (config.tags as string[]).join("\n")
              : ""
          }
          onChange={(e) =>
            onConfigChange({
              tags: e.target.value.split("\n").filter(Boolean),
            })
          }
          className="min-h-[60px] text-xs resize-y"
          placeholder="美食&#10;生活&#10;日常vlog"
        />
      </div>
    </div>
  );
}

// 微信公众号配置
function WechatMPConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">操作类型</Label>
        <Select
          value={(config.action as string) || "publish"}
          onValueChange={(value) => onConfigChange({ action: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="publish">发布文章</SelectItem>
            <SelectItem value="draft">保存草稿</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">文章标题</Label>
        <Input
          value={(config.title as string) || ""}
          onChange={(e) => onConfigChange({ title: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入文章标题，支持 {{变量}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">作者</Label>
        <Input
          value={(config.author as string) || ""}
          onChange={(e) => onConfigChange({ author: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入作者名称"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">摘要</Label>
        <Input
          value={(config.digest as string) || ""}
          onChange={(e) => onConfigChange({ digest: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入文章摘要"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">文章内容（HTML）</Label>
        <Textarea
          value={(config.content as string) || ""}
          onChange={(e) => onConfigChange({ content: e.target.value })}
          className="min-h-[100px] text-xs font-mono resize-y"
          placeholder="输入文章 HTML 内容，支持 {{变量}}"
        />
      </div>
    </div>
  );
}

// 视频号配置
function WechatChannelsConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">标题</Label>
        <Input
          value={(config.title as string) || ""}
          onChange={(e) => onConfigChange({ title: e.target.value })}
          className="h-8 text-xs"
          placeholder="输入标题"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">描述</Label>
        <Textarea
          value={(config.description as string) || ""}
          onChange={(e) => onConfigChange({ description: e.target.value })}
          className="min-h-[60px] text-xs resize-y"
          placeholder="输入描述（可选）"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">视频 URL</Label>
        <Input
          value={(config.videoUrl as string) || ""}
          onChange={(e) => onConfigChange({ videoUrl: e.target.value })}
          className="h-8 text-xs font-mono"
          placeholder="https://..."
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">封面 URL</Label>
        <Input
          value={(config.coverUrl as string) || ""}
          onChange={(e) => onConfigChange({ coverUrl: e.target.value })}
          className="h-8 text-xs font-mono"
          placeholder="https://..."
        />
      </div>
    </div>
  );
}

// 通知工具配置
function NotificationConfig({
  platform,
  config,
  onConfigChange,
}: {
  platform: "feishu" | "dingtalk" | "wecom";
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  const platformLabels = {
    feishu: "飞书",
    dingtalk: "钉钉",
    wecom: "企业微信",
  };

  const messageTypes = {
    feishu: [
      { value: "text", label: "纯文本" },
      { value: "markdown", label: "Markdown（富文本卡片）" },
      { value: "card", label: "交互卡片" },
    ],
    dingtalk: [
      { value: "text", label: "纯文本" },
      { value: "markdown", label: "Markdown" },
      { value: "actionCard", label: "ActionCard" },
    ],
    wecom: [
      { value: "text", label: "纯文本" },
      { value: "markdown", label: "Markdown" },
      { value: "news", label: "图文消息" },
    ],
  };

  return (
    <div className="space-y-3">
      {/* Webhook URL */}
      <div className="space-y-1.5">
        <Label className="text-xs">Webhook URL</Label>
        <VariableInput
          value={(config.webhookUrl as string) || ""}
          onChange={(value) => onConfigChange({ webhookUrl: value })}
          placeholder={`粘贴${platformLabels[platform]} Webhook 或 {{引用}}`}
          type="url"
          className="font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          在{platformLabels[platform]}群中添加机器人后获取
        </p>
      </div>

      {/* 消息类型 */}
      <div className="space-y-1.5">
        <Label className="text-xs">消息类型</Label>
        <Select
          value={(config.messageType as string) || "text"}
          onValueChange={(value) => onConfigChange({ messageType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {messageTypes[platform].map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 标题（markdown 和 card 类型需要） */}
      {((config.messageType as string) === "markdown" ||
        (config.messageType as string) === "card" ||
        (config.messageType as string) === "actionCard" ||
        (config.messageType as string) === "news") && (
          <div className="space-y-1.5">
            <Label className="text-xs">消息标题</Label>
            <VariableInput
              value={(config.title as string) || ""}
              onChange={(value) => onConfigChange({ title: value })}
              placeholder="输入消息标题，支持 {{引用}}"
            />
          </div>
        )}

      {/* 消息内容 */}
      <div className="space-y-1.5">
        <Label className="text-xs">消息内容</Label>
        <VariableTextarea
          value={(config.content as string) || ""}
          onChange={(value) => onConfigChange({ content: value })}
          minHeight="80px"
          placeholder="输入消息内容，使用 @ 按钮插入变量引用"
        />
        <p className="text-[10px] text-muted-foreground">
          使用 {"{{节点名.字段名}}"} 引用其他节点的输出数据
        </p>
      </div>

      {/* @ 功能 */}
      {platform === "dingtalk" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">@ 指定成员（手机号，每行一个）</Label>
            <Textarea
              value={
                Array.isArray(config.atMobiles)
                  ? (config.atMobiles as string[]).join("\n")
                  : ""
              }
              onChange={(e) =>
                onConfigChange({
                  atMobiles: e.target.value.split("\n").filter(Boolean),
                })
              }
              className="min-h-[60px] text-xs resize-y font-mono"
              placeholder="13800138000&#10;13900139000"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={(config.atAll as boolean) || false}
              onCheckedChange={(checked) => onConfigChange({ atAll: checked })}
            />
            <Label className="text-xs">@ 所有人</Label>
          </div>
        </div>
      )}

      {platform === "feishu" && (
        <div className="flex items-center gap-2">
          <Switch
            checked={(config.atAll as boolean) || false}
            onCheckedChange={(checked) => onConfigChange({ atAll: checked })}
          />
          <Label className="text-xs">@ 所有人</Label>
        </div>
      )}

      {platform === "wecom" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">@ 指定成员（userid，每行一个）</Label>
            <Textarea
              value={
                Array.isArray(config.mentionedList)
                  ? (config.mentionedList as string[]).join("\n")
                  : ""
              }
              onChange={(e) =>
                onConfigChange({
                  mentionedList: e.target.value.split("\n").filter(Boolean),
                })
              }
              className="min-h-[60px] text-xs resize-y font-mono"
              placeholder="zhangsan&#10;lisi&#10;@all（@ 所有人）"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">@ 指定手机号（每行一个）</Label>
            <Textarea
              value={
                Array.isArray(config.mentionedMobileList)
                  ? (config.mentionedMobileList as string[]).join("\n")
                  : ""
              }
              onChange={(e) =>
                onConfigChange({
                  mentionedMobileList: e.target.value
                    .split("\n")
                    .filter(Boolean),
                })
              }
              className="min-h-[60px] text-xs resize-y font-mono"
              placeholder="13800138000&#10;13900139000"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// 自定义工具配置
function CustomToolConfig({
  config,
  onConfigChange,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
}) {
  const parameters =
    (config.parameters as Array<{
      name: string;
      type: string;
      description: string;
    }>) || [];

  const addParameter = () => {
    onConfigChange({
      parameters: [
        ...parameters,
        { name: "", type: "string", description: "" },
      ],
    });
  };

  const updateParameter = (index: number, field: string, value: string) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], [field]: value };
    onConfigChange({ parameters: newParams });
  };

  const removeParameter = (index: number) => {
    onConfigChange({ parameters: parameters.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">工具描述</Label>
        <Input
          value={(config.description as string) || ""}
          onChange={(e) => onConfigChange({ description: e.target.value })}
          className="h-8 text-xs"
          placeholder="描述这个工具的功能..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">参数定义</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={addParameter}
          >
            <Plus className="h-3 w-3 mr-1" />
            添加参数
          </Button>
        </div>
        {parameters.length > 0 ? (
          <div className="space-y-2">
            {parameters.map((param, index) => (
              <div
                key={index}
                className="p-2 border rounded bg-muted/30 space-y-1.5"
              >
                <div className="flex gap-1.5">
                  <Input
                    value={param.name}
                    onChange={(e) =>
                      updateParameter(index, "name", e.target.value)
                    }
                    className="h-7 text-xs flex-1"
                    placeholder="参数名"
                  />
                  <Select
                    value={param.type || "string"}
                    onValueChange={(value) =>
                      updateParameter(index, "type", value)
                    }
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">string</SelectItem>
                      <SelectItem value="number">number</SelectItem>
                      <SelectItem value="boolean">boolean</SelectItem>
                      <SelectItem value="array">array</SelectItem>
                      <SelectItem value="object">object</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeParameter(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={param.description}
                  onChange={(e) =>
                    updateParameter(index, "description", e.target.value)
                  }
                  className="h-7 text-xs"
                  placeholder="参数描述"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">暂无参数定义</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">执行脚本（JavaScript）</Label>
        <Textarea
          value={(config.script as string) || ""}
          onChange={(e) => onConfigChange({ script: e.target.value })}
          className="min-h-[100px] text-xs font-mono resize-y"
          placeholder={`// 可用变量: params (参数对象), context (上下文)
// 返回结果将作为工具输出
async function execute(params, context) {
  // 在此编写逻辑
  return { result: "success" }
}`}
        />
      </div>
    </div>
  );
}

// Claude Skill 配置
function ClaudeSkillConfig({
  config,
  onConfigChange: _onConfigChange,
  onEditSkill,
}: {
  config: Record<string, unknown>;
  onConfigChange: (updates: Record<string, unknown>) => void;
  onEditSkill?: () => void;
}) {
  const skill = config.skill as ClaudeSkill | null;

  return (
    <div className="space-y-3">
      {skill ? (
        <>
          {/* Skill Info */}
          <div className="border rounded-lg p-3 bg-orange-50/50">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-500" />
                <span className="font-medium text-sm">{skill.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  v{skill.version}
                </Badge>
              </div>
              {onEditSkill && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={onEditSkill}
                >
                  更换技能包
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{skill.description}</p>
            {skill.tags && skill.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {skill.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Model Info */}
          <div className="space-y-1.5">
            <Label className="text-xs">执行模型</Label>
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
              <Sparkles className="h-4 w-4 text-orange-500" />
              <span>Claude Opus 4.5</span>
              <Badge className="text-[10px] bg-orange-100 text-orange-700">
                自动绑定
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Claude Skill 技能包自动使用 Claude Opus 4.5 模型以获得最佳效果
            </p>
          </div>

          {/* System Prompt Preview */}
          <div className="space-y-1.5">
            <Label className="text-xs">系统提示词</Label>
            <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-32 overflow-auto">
              {skill.systemPrompt.slice(0, 500)}
              {skill.systemPrompt.length > 500 && "..."}
            </div>
          </div>

          {/* Tools */}
          {skill.tools && skill.tools.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">内置工具 ({skill.tools.length})</Label>
              <div className="space-y-1">
                {skill.tools.map((tool, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-1.5 bg-muted/30 rounded text-xs"
                  >
                    <Settings className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{tool.name}</span>
                    <span className="text-muted-foreground truncate">
                      - {tool.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output Format */}
          <div className="space-y-1.5">
            <Label className="text-xs">输出格式</Label>
            <Badge variant="outline">{skill.outputFormat || "text"}</Badge>
          </div>
        </>
      ) : (
        <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-orange-300" />
          <p className="text-sm">未选择技能包</p>
          <p className="text-xs mt-1 mb-3">点击下方按钮选择或创建技能包</p>
          {onEditSkill && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEditSkill}
              className="text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              选择技能包
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolsSection;
