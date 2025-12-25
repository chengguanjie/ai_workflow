"use client";

import { useState } from "react";
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
  | "feishu-bitable"
  | "xiaohongshu"
  | "douyin-video"
  | "wechat-mp"
  | "claude-skill"
  | "notification-feishu"
  | "notification-dingtalk"
  | "notification-wecom"
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
  custom: {
    label: "自定义工具",
    icon: Settings,
    description: "自定义工具配置",
    color: "text-gray-500",
  },
};

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

  // 添加新工具
  const handleAddTool = (type: ToolType) => {
    // Claude Skill 需要打开弹窗选择
    if (type === "claude-skill") {
      setEditingSkillToolId(null);
      setIsSkillDialogOpen(true);
      setIsAddingTool(false);
      return;
    }

    const newTool: ToolConfig = {
      id: `tool_${Date.now()}`,
      type,
      name: TOOL_METADATA[type].label,
      enabled: true,
      config: getDefaultConfig(type),
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
            {(Object.keys(TOOL_METADATA) as ToolType[]).map((type) => {
              const meta = TOOL_METADATA[type];
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
            const meta = TOOL_METADATA[tool.type];
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

                      {/* 工具名称 */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">工具名称</Label>
                        <Input
                          value={tool.name}
                          onChange={(e) =>
                            handleUpdateTool(tool.id, { name: e.target.value })
                          }
                          className="h-8 text-xs"
                          placeholder="输入工具名称..."
                        />
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
    case "wechat-mp":
      return {
        action: "publish",
        title: "",
        content: "",
        author: "",
        digest: "",
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
    case "custom":
      return (
        <CustomToolConfig config={config} onConfigChange={onConfigChange} />
      );
    default:
      return null;
  }
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
          <Input
            value={(config.url as string) || ""}
            onChange={(e) => onConfigChange({ url: e.target.value })}
            className="h-8 text-xs"
            placeholder="https://api.example.com/endpoint"
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
              <div key={index} className="flex gap-1.5">
                <Input
                  value={header.key}
                  onChange={(e) => updateHeader(index, "key", e.target.value)}
                  className="h-7 text-xs flex-1"
                  placeholder="Header Key"
                />
                <Input
                  value={header.value}
                  onChange={(e) => updateHeader(index, "value", e.target.value)}
                  className="h-7 text-xs flex-1"
                  placeholder="Header Value"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
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
            <Textarea
              value={(config.body as string) || ""}
              onChange={(e) => onConfigChange({ body: e.target.value })}
              className="min-h-[80px] text-xs font-mono resize-y"
              placeholder='{"key": "value"}'
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
        <Textarea
          value={
            typeof config.fields === "string"
              ? config.fields
              : JSON.stringify(config.fields || [], null, 2)
          }
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onConfigChange({ fields: parsed });
            } catch {
              onConfigChange({ fields: e.target.value });
            }
          }}
          className="min-h-[60px] text-xs font-mono resize-y"
          placeholder='[{"name": "字段名", "value": "{{变量}}"}]'
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
        <Input
          value={(config.webhookUrl as string) || ""}
          onChange={(e) => onConfigChange({ webhookUrl: e.target.value })}
          className="h-8 text-xs font-mono"
          placeholder={`粘贴${platformLabels[platform]}群机器人 Webhook 地址`}
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
            <Input
              value={(config.title as string) || ""}
              onChange={(e) => onConfigChange({ title: e.target.value })}
              className="h-8 text-xs"
              placeholder="输入消息标题，支持 {{变量}} 引用"
            />
          </div>
        )}

      {/* 消息内容 */}
      <div className="space-y-1.5">
        <Label className="text-xs">消息内容</Label>
        <Textarea
          value={(config.content as string) || ""}
          onChange={(e) => onConfigChange({ content: e.target.value })}
          className="min-h-[80px] text-xs resize-y"
          placeholder={`输入消息内容，支持 {{变量}} 引用上游节点数据\n\n示例：\n任务已完成！\n处理结果：{{AI处理.result}}`}
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
