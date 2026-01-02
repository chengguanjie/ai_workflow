import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeDecryptApiKey } from "@/lib/crypto";
import { aiService } from "@/lib/ai";
import { ApiResponse } from "@/lib/api/api-response";
import { validateWorkflowActions } from "@/lib/workflow/generator";
import { AIAssistantError } from "@/lib/errors/ai-assistant-errors";

// 构建完整的系统提示词（包含动态的服务商和工具信息）
function buildCreateWorkflowSystemPrompt(
  availableProviders: Array<{
    id: string;
    name: string;
    provider: string;
    defaultModel: string | null;
    models: string[];
    displayName: string;
  }>,
  defaultProviderId: string | null
): string {
  // 构建可用服务商说明
  const providerList = availableProviders.map(p =>
    `  - ID: "${p.id}", 名称: "${p.displayName}", 默认模型: "${p.defaultModel || '无'}"${p.id === defaultProviderId ? ' [推荐]' : ''}`
  ).join('\n');

  return `你是一个AI工作流生成专家。根据用户需求，直接生成完整的工作流配置，包括节点的模型选择和工具配置。

## 可用节点类型（只有这2种）

### 1. INPUT - 用户输入节点
- 作用：工作流的起点，定义用户需要输入的字段
- 必须配置 fields 数组，每个字段包含：
  - id: 唯一ID（如 "field_1"）
  - name: 字段名称（中文，如 "问题"、"客户咨询"）
  - fieldType: 'text' | 'image' | 'pdf' | 'word' | 'excel' | 'audio' | 'video' | 'select' | 'multiselect'
  - required: true/false
  - placeholder: 占位提示文本
  - description: 字段说明

### 2. PROCESS - AI处理节点
- 作用：使用AI模型处理数据
- 必须配置：
  - systemPrompt: 系统提示词（详细定义AI的角色、任务、输出格式要求）
  - userPrompt: 用户提示词（推荐使用 {{nodeId.字段名}} 引用上游数据；兼容 {{节点名.字段名}}）
  - temperature: 0.1-1.0（严谨任务用0.3，创意任务用0.7）
  - aiConfigId: AI服务商配置ID（从下面可用列表选择）
  - model: 具体模型名称（可选，不填则使用服务商默认模型）
  - enableToolCalling: 是否启用工具调用（布尔值）
  - tools: 工具配置数组（如果需要使用工具）

## 可用的AI服务商配置
${providerList}

## 可用的工具类型

### http-request - HTTP请求工具
用于调用外部API、获取网页内容等。配置示例：
\`\`\`json
{
  "id": "tool_1",
  "type": "http-request",
  "name": "获取天气",
  "enabled": true,
  "config": {
    "method": "GET",
    "url": "https://api.example.com/weather",
    "headers": [{"key": "Content-Type", "value": "application/json"}],
    "timeout": 30000
  }
}
\`\`\`

### notification-feishu - 飞书通知
发送消息到飞书群机器人。配置示例：
\`\`\`json
{
  "id": "tool_2",
  "type": "notification-feishu",
  "name": "通知飞书群",
  "enabled": true,
  "config": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
    "messageType": "text"
  }
}
\`\`\`

### notification-dingtalk - 钉钉通知
发送消息到钉钉群机器人。配置示例：
\`\`\`json
{
  "id": "tool_3",
  "type": "notification-dingtalk",
  "name": "通知钉钉群",
  "enabled": true,
  "config": {
    "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "messageType": "text"
  }
}
\`\`\`

### notification-wecom - 企业微信通知
发送消息到企业微信群机器人。配置示例：
\`\`\`json
{
  "id": "tool_4",
  "type": "notification-wecom",
  "name": "通知企微群",
  "enabled": true,
  "config": {
    "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
    "messageType": "text"
  }
}
\`\`\`

### feishu-bitable - 飞书多维表格
读写飞书多维表格数据（需要用户自行配置appToken和tableId）。

## 模型选择建议
- **简单问答、客服回复**：使用默认配置即可
- **复杂分析、推理任务**：优先选择高级模型
- **代码生成、技术任务**：选择代码能力强的模型
- **创意写作**：选择创意能力强的模型

## 工具使用场景
- **需要调用外部API**：添加 http-request 工具
- **需要发送通知**：添加对应平台的 notification-xxx 工具
- **需要读写数据**：添加 feishu-bitable 工具
- **不需要外部交互**：不添加工具，enableToolCalling 设为 false

## 输出格式要求

必须输出以下JSON格式（用 \`\`\`json:actions 包裹）：

\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    {
      "action": "add",
      "nodeType": "INPUT",
      "nodeName": "用户输入",
      "config": {
        "fields": [
          {
            "id": "field_1",
            "name": "问题",
            "fieldType": "text",
            "required": true,
            "placeholder": "请输入您的问题",
            "description": "用户需要解答的问题"
          }
        ]
      }
    },
    {
      "action": "add",
      "nodeType": "PROCESS",
      "nodeName": "AI回答",
      "config": {
        "systemPrompt": "你是一个专业的客服助手。请根据用户的问题提供准确、友好的回答。\\n\\n回答要求：\\n1. 语气友好专业\\n2. 内容准确有帮助\\n3. 必要时提供具体步骤",
        "userPrompt": "用户问题：{{用户输入.问题}}\\n\\n请回答上述问题。",
        "temperature": 0.7,
        "aiConfigId": "${defaultProviderId || '使用可用配置ID'}",
        "enableToolCalling": false,
        "tools": []
      }
    },
    {
      "action": "connect",
      "source": "new_1",
      "target": "new_2"
    }
  ]
}
\`\`\`

## 重要规则
1. 每个工作流必须以 INPUT 节点开始
2. INPUT 节点的 fields 必须有完整配置（id、name、fieldType、required、placeholder、description）
3. PROCESS 节点的 systemPrompt 必须详细（至少50字），说明AI的角色和任务
4. PROCESS 节点的 userPrompt 必须正确引用上游节点的字段，推荐格式：{{nodeId.字段名}}（兼容 {{节点名.字段名}}）
5. PROCESS 节点必须配置 aiConfigId（从可用服务商配置中选择合适的）
6. 如果任务需要调用外部服务，必须配置相应的 tools 并设置 enableToolCalling: true
7. 使用 "new_1", "new_2" 等引用新添加的节点进行连接
8. 所有文本内容使用中文
9. 工具的 webhookUrl 等敏感配置可以用占位符如 "{{请配置}}" 表示需要用户填写

请直接输出 json:actions，不要有多余的解释。`;
}

/**
 * 修复常见的 AI 生成 JSON 格式错误
 * 处理：多余逗号、单引号、注释、未转义字符、未闭合括号等
 */
function repairJSON(jsonStr: string): string {
  let result = jsonStr.trim();
  
  // 1. 移除 JSON 前后的非 JSON 文本（如 AI 的解释文字）
  const jsonStart = result.search(/[\[{]/);
  if (jsonStart > 0) {
    result = result.slice(jsonStart);
  }
  // 找到最后一个有效的 ] 或 }
  const lastBracket = Math.max(result.lastIndexOf(']'), result.lastIndexOf('}'));
  if (lastBracket > 0 && lastBracket < result.length - 1) {
    result = result.slice(0, lastBracket + 1);
  }
  
  // 2. 移除 JavaScript 风格的注释
  // 单行注释
  result = result.replace(/\/\/[^\n\r]*/g, '');
  // 多行注释
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // 3. 将单引号替换为双引号（仅在键值位置）
  // 先保护已存在的转义单引号
  result = result.replace(/\\'/g, '<<<ESCAPED_SINGLE_QUOTE>>>');
  // 替换未转义的单引号为双引号
  result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  // 恢复转义的单引号
  result = result.replace(/<<<ESCAPED_SINGLE_QUOTE>>>/g, "\\'");
  
  // 4. 为没有引号的键名添加引号
  // 匹配：{ key: 或 , key: 形式的未加引号的键
  result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  
  // 5. 修复多余的逗号
  // 移除对象或数组结尾的逗号 },] 或 ],]
  result = result.replace(/,(\s*[}\]])/g, '$1');
  // 移除连续的逗号
  result = result.replace(/,(\s*),/g, ',');
  
  // 6. 修复字符串内的未转义换行符
  // 在 JSON 字符串中，实际的换行符应该被转义为 \n
  result = result.replace(/"([^"]*?)[\r\n]+([^"]*?)"/g, (match, p1, p2) => {
    return `"${p1}\\n${p2}"`;
  });
  
  // 7. 修复未转义的制表符
  result = result.replace(/"([^"]*?)\t([^"]*?)"/g, (match, p1, p2) => {
    return `"${p1}\\t${p2}"`;
  });
  
  // 8. 修复布尔值和 null 的大小写问题
  result = result.replace(/:\s*True\b/g, ': true');
  result = result.replace(/:\s*False\b/g, ': false');
  result = result.replace(/:\s*None\b/g, ': null');
  result = result.replace(/:\s*NULL\b/g, ': null');
  
  // 9. 移除 BOM 和其他不可见字符
  result = result.replace(/^\uFEFF/, '');
  result = result.replace(/[\x00-\x1F\x7F]/g, (char) => {
    // 保留换行和空格相关字符（它们应该已经被处理了）
    if (char === '\n' || char === '\r' || char === '\t') {
      return char;
    }
    return '';
  });
  
  return result.trim();
}

/**
 * 尝试修复未闭合的括号
 */
function repairBrackets(jsonStr: string): string {
  let result = jsonStr;
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < result.length; i++) {
    const char = result[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
  }
  
  // 添加缺少的闭合括号
  while (openBraces > 0) {
    result += '}';
    openBraces--;
  }
  while (openBrackets > 0) {
    result += ']';
    openBrackets--;
  }
  
  return result;
}

/**
 * 安全的 JSON 解析，带有自动修复功能
 */
function safeJSONParse(jsonStr: string): { success: boolean; data: unknown; error?: string } {
  // 第一次尝试：直接解析
  try {
    const data = JSON.parse(jsonStr);
    return { success: true, data };
  } catch (_e1) {
    console.log("[CreateWorkflow] Initial JSON parse failed, attempting repair...");
  }
  
  // 第二次尝试：修复后解析
  try {
    const repaired = repairJSON(jsonStr);
    const data = JSON.parse(repaired);
    console.log("[CreateWorkflow] JSON repair successful (basic)");
    return { success: true, data };
  } catch (_e2) {
    console.log("[CreateWorkflow] Basic repair failed, trying bracket repair...");
  }
  
  // 第三次尝试：修复括号后解析
  try {
    const repaired = repairBrackets(repairJSON(jsonStr));
    const data = JSON.parse(repaired);
    console.log("[CreateWorkflow] JSON repair successful (with bracket fix)");
    return { success: true, data };
  } catch (e3) {
    const error = e3 instanceof Error ? e3.message : String(e3);
    console.error("[CreateWorkflow] All JSON repair attempts failed:", error);
    return { success: false, data: null, error };
  }
}

function cleanAIResponse(content: string) {
  let cleanContent = content.trim();
  let nodeActions: any[] = [];

  // 1. 尝试提取 json:actions
  const jsonActionsMatch = cleanContent.match(
    /```json:actions\s*([\s\S]*?)```/,
  );
  if (jsonActionsMatch) {
    const parseResult = safeJSONParse(jsonActionsMatch[1]);
    if (parseResult.success) {
      const parsed = parseResult.data as Record<string, unknown>;
      nodeActions = (parsed.nodeActions as any[]) || (Array.isArray(parsed) ? (parsed as any[]) : []);
      cleanContent = cleanContent.replace(jsonActionsMatch[0], "").trim();
      console.log(
        "[CreateWorkflow] Parsed json:actions successfully, nodeActions count:",
        nodeActions.length,
      );
    } else {
      console.error("[CreateWorkflow] Failed to parse json:actions:", parseResult.error);
      console.error("[CreateWorkflow] json:actions content:", jsonActionsMatch[1]?.slice(0, 500));
    }
  }

  // 2. 尝试普通 json block
  if (nodeActions.length === 0) {
    const simpleJsonMatch = cleanContent.match(/```json\s*([\s\S]*?)```/);
    if (simpleJsonMatch) {
      const parseResult = safeJSONParse(simpleJsonMatch[1]);
      if (parseResult.success) {
        const parsed = parseResult.data as Record<string, unknown>;
        if (parsed.nodeActions) {
          nodeActions = parsed.nodeActions as any[];
          cleanContent = cleanContent.replace(simpleJsonMatch[0], "").trim();
          console.log(
            "[CreateWorkflow] Parsed json block successfully, nodeActions count:",
            nodeActions.length,
          );
        } else if (Array.isArray(parsed)) {
          nodeActions = parsed as any[];
          cleanContent = cleanContent.replace(simpleJsonMatch[0], "").trim();
          console.log(
            "[CreateWorkflow] Parsed json block as array, nodeActions count:",
            nodeActions.length,
          );
        }
      } else {
        console.error("[CreateWorkflow] Failed to parse json block:", parseResult.error);
        console.error("[CreateWorkflow] json block content:", simpleJsonMatch[1]?.slice(0, 500));
      }
    }
  }

  // 3. 尝试提取任何 ``` 代码块中的 JSON
  if (nodeActions.length === 0) {
    const anyCodeBlockMatch = cleanContent.match(/```(?:\w*)\s*([\s\S]*?)```/);
    if (anyCodeBlockMatch) {
      const parseResult = safeJSONParse(anyCodeBlockMatch[1]);
      if (parseResult.success) {
        const parsed = parseResult.data as Record<string, unknown>;
        if (parsed.nodeActions) {
          nodeActions = parsed.nodeActions as any[];
          console.log(
            "[CreateWorkflow] Parsed code block as JSON, nodeActions count:",
            nodeActions.length,
          );
        } else if (Array.isArray(parsed)) {
          nodeActions = parsed as any[];
          console.log(
            "[CreateWorkflow] Parsed code block as array, nodeActions count:",
            nodeActions.length,
          );
        }
      }
    }
  }

  // 4. 尝试直接解析整个内容为 JSON
  if (nodeActions.length === 0) {
    const parseResult = safeJSONParse(cleanContent);
    if (parseResult.success) {
      const parsed = parseResult.data as Record<string, unknown>;
      if (parsed.nodeActions) {
        nodeActions = parsed.nodeActions as unknown[];
        console.log(
          "[CreateWorkflow] Parsed raw content as JSON, nodeActions count:",
          nodeActions.length,
        );
      } else if (Array.isArray(parsed)) {
        nodeActions = parsed;
        console.log(
          "[CreateWorkflow] Parsed raw content as array, nodeActions count:",
          nodeActions.length,
        );
      }
    } else {
      console.log("[CreateWorkflow] Content is not valid JSON after all repair attempts");
    }
  }

  return { cleanContent, nodeActions };
}

// 为节点配置添加默认值
function enrichNodeConfig(
  nodeType: string,
  config: any,
  nodeName: string,
  defaultProviderId: string | null,
): any {
  const enrichedConfig = { ...config };

  if (nodeType === "INPUT") {
    // 确保 fields 数组存在且每个字段有完整配置
    if (
      !enrichedConfig.fields ||
      !Array.isArray(enrichedConfig.fields) ||
      enrichedConfig.fields.length === 0
    ) {
      enrichedConfig.fields = [
        {
          id: "field_1",
          name: "输入内容",
          fieldType: "text",
          required: true,
          placeholder: "请输入内容",
          description: "用户输入",
        },
      ];
    } else {
      enrichedConfig.fields = enrichedConfig.fields.map(
        (field: any, index: number) => ({
          id: field.id || `field_${index + 1}`,
          name: field.name || `字段${index + 1}`,
          fieldType: field.fieldType || "text",
          required: field.required !== undefined ? field.required : true,
          placeholder: field.placeholder || `请输入${field.name || "内容"}`,
          description: field.description || field.name || "用户输入",
          value: field.value || "",
          options: field.options || [],
        }),
      );
    }
  } else if (nodeType === "PROCESS") {
    // 确保 PROCESS 节点有必要的配置
    if (!enrichedConfig.systemPrompt) {
      enrichedConfig.systemPrompt =
        "你是一个专业的AI助手。请根据用户的输入提供准确、有帮助的回答。";
    }
    if (!enrichedConfig.userPrompt) {
      enrichedConfig.userPrompt = "请处理以下内容：";
    }
    if (enrichedConfig.temperature === undefined) {
      enrichedConfig.temperature = 0.7;
    }
    if (enrichedConfig.maxTokens === undefined) {
      enrichedConfig.maxTokens = 2048;
    }

    // 确保 AI 配置存在
    if (!enrichedConfig.aiConfigId && defaultProviderId) {
      enrichedConfig.aiConfigId = defaultProviderId;
    }

    // 确保工具配置存在
    if (enrichedConfig.enableToolCalling === undefined) {
      // 如果有工具配置且有启用的工具，则启用工具调用
      const hasEnabledTools = Array.isArray(enrichedConfig.tools) &&
        enrichedConfig.tools.some((t: any) => t.enabled);
      enrichedConfig.enableToolCalling = hasEnabledTools;
    }

    // 确保 tools 数组存在
    if (!Array.isArray(enrichedConfig.tools)) {
      enrichedConfig.tools = [];
    } else {
      // 为每个工具确保有完整配置
      enrichedConfig.tools = enrichedConfig.tools.map((tool: any, index: number) => {
        const toolId = tool.id || `tool_${Date.now()}_${index}`;
        return {
          id: toolId,
          type: tool.type || "custom",
          name: tool.name || `工具${index + 1}`,
          enabled: tool.enabled !== undefined ? tool.enabled : true,
          config: enrichToolConfig(tool.type, tool.config || {}),
        };
      });
    }
  }

  console.log(
    `[CreateWorkflow] Enriched config for ${nodeType} node "${nodeName}":`,
    JSON.stringify(enrichedConfig, null, 2),
  );

  return enrichedConfig;
}

// 检测字符串是否包含占位符
function containsPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // 匹配 {{xxx}} 格式的占位符，如 {{请配置}}、{{待填写}} 等
  return /\{\{[^}]+\}\}/.test(value);
}

// 检测配置中是否有需要用户配置的占位符
function hasUnfilledPlaceholder(config: Record<string, unknown>): string[] {
  const unfilledFields: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (containsPlaceholder(value)) {
      unfilledFields.push(key);
    }
  }
  return unfilledFields;
}

// 为工具配置添加默认值并标记占位符
function enrichToolConfig(toolType: string, config: any): any {
  const enrichedConfig = { ...config };

  switch (toolType) {
    case "http-request":
      if (!enrichedConfig.method) enrichedConfig.method = "GET";
      if (!enrichedConfig.url) enrichedConfig.url = "";
      if (!enrichedConfig.headers) enrichedConfig.headers = [];
      if (!enrichedConfig.timeout) enrichedConfig.timeout = 30000;
      if (enrichedConfig.extractContent === undefined) enrichedConfig.extractContent = false;
      break;

    case "notification-feishu":
    case "notification-dingtalk":
    case "notification-wecom":
      if (!enrichedConfig.webhookUrl) enrichedConfig.webhookUrl = "";
      if (!enrichedConfig.messageType) enrichedConfig.messageType = "text";
      if (!enrichedConfig.content) enrichedConfig.content = "";
      break;

    case "feishu-bitable":
      if (!enrichedConfig.appToken) enrichedConfig.appToken = "";
      if (!enrichedConfig.tableId) enrichedConfig.tableId = "";
      break;
  }

  // 检测并标记包含占位符的字段
  const unfilledFields = hasUnfilledPlaceholder(enrichedConfig);
  if (unfilledFields.length > 0) {
    enrichedConfig._hasPlaceholders = true;
    enrichedConfig._placeholderFields = unfilledFields;
  }

  return enrichedConfig;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error("未授权", 401);
    }

    const { prompt, templateId } = await request.json();
    if (!prompt && !templateId) {
      return ApiResponse.error("需求描述或模板ID不能为空", 400);
    }

    console.log(
      "[CreateWorkflow] Starting workflow creation, prompt:",
      prompt?.slice(0, 100),
      "templateId:",
      templateId,
    );

    let nodes: any[] = [];
    let edges: any[] = [];
    let workflowName = "AI 生成工作流";
    let isDetailedSpec = false;

    if (templateId) {
      // --- Template Cloning Path ---
      const template = await prisma.workflowTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        return ApiResponse.error("指定的模板不存在", 404);
      }

      const config = (template.config as any) || {};
      nodes = config.nodes || [];
      edges = config.edges || [];
      workflowName = `${template.name} (副本)`;

      console.log("[CreateWorkflow] Cloned from template:", template.name);
    } else {
      // --- AI Generation Path ---
      // 1. 获取所有可用的 AI 服务商配置（用于传递给 AI 选择）
      const allConfigs = await prisma.apiKey.findMany({
        where: {
          organizationId: session.user.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          provider: true,
          baseUrl: true,
          defaultModel: true,
          models: true,
          isDefault: true,
          keyEncrypted: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      if (allConfigs.length === 0) {
        return ApiResponse.error("未配置AI服务，请先在设置中配置API密钥", 400);
      }

      // 找到默认配置或第一个配置
      const safeKey = allConfigs.find(c => c.isDefault) || allConfigs[0];
      const defaultProviderId = safeKey.id;

      // 构建可用服务商列表（供 AI 选择）
      const getProviderDisplayName = (provider: string): string => {
        const names: Record<string, string> = {
          OPENROUTER: "OpenRouter",
          SHENSUAN: "胜算云",
          OPENAI: "OpenAI兼容",
          ANTHROPIC: "Anthropic",
        };
        return names[provider] || provider;
      };

      const availableProviders = allConfigs.map(config => ({
        id: config.id,
        name: config.name,
        provider: config.provider,
        defaultModel: config.defaultModel,
        models: (config.models as string[]) || [],
        displayName: `${config.name} (${getProviderDisplayName(config.provider)})`,
      }));

      console.log(
        "[CreateWorkflow] Using AI provider:",
        safeKey.provider,
        "model:",
        safeKey.defaultModel,
        "Available providers:",
        availableProviders.length,
      );

      // 2. 构建动态系统提示词（包含可用服务商信息）
      const systemPrompt = buildCreateWorkflowSystemPrompt(
        availableProviders,
        defaultProviderId
      );

      // 3. 调用 AI 生成工作流
      // 检测是否是详细规格说明（包含特定关键词）
      isDetailedSpec = prompt.includes("**工作流名称**") ||
                       prompt.includes("**目标**") ||
                       prompt.includes("**输入字段**") ||
                       prompt.includes("**处理步骤**");

      const userMessage = isDetailedSpec
        ? `以下是用户确认的工作流规格说明，请严格按照此规格生成工作流配置：

${prompt}

请根据上述规格说明生成工作流。要求：
1. 严格按照"输入字段"部分创建 INPUT 节点的 fields 配置
2. 严格按照"处理步骤"部分创建 PROCESS 节点，每个步骤对应一个 PROCESS 节点
3. 每个 PROCESS 节点的 systemPrompt 要根据"AI指令要点"详细展开
4. userPrompt 要正确引用上游节点的数据，推荐格式：{{nodeId.字段名}}（兼容 {{节点名.字段名}}）
5. 每个 PROCESS 节点必须配置 aiConfigId（选择合适的服务商配置）
6. 如果任务需要调用外部API或发送通知，配置相应的 tools
7. 直接输出 json:actions 格式，不要多余解释`
        : `用户需求：${prompt}

请根据上述需求生成工作流。要求：
1. 必须包含完整的 INPUT 节点配置（fields 数组要有 id、name、fieldType、required、placeholder、description）
2. PROCESS 节点必须有详细的 systemPrompt（描述AI角色和任务）和 userPrompt（引用上游变量）
3. 每个 PROCESS 节点必须配置 aiConfigId（选择合适的服务商配置）
4. 如果任务需要调用外部API或发送通知，配置相应的 tools 并设置 enableToolCalling: true
5. 直接输出 json:actions 格式，不要多余解释`;

      const { withAIErrorHandling } = await import(
        "@/lib/errors/ai-assistant-errors"
      );

      console.log(
        "[CreateWorkflow] isDetailedSpec:",
        isDetailedSpec,
        "prompt length:",
        prompt.length
      );

      const response = await withAIErrorHandling(
        () =>
          aiService.chat(
            safeKey.provider,
            {
              model: safeKey.defaultModel || "deepseek/deepseek-chat",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
              ],
              temperature: 0.3, // 降低温度以获得更稳定的 JSON 输出
              maxTokens: 8192, // 增加 token 限制以处理复杂工作流
            },
            safeDecryptApiKey(safeKey.keyEncrypted),
            safeKey.baseUrl || undefined,
          ),
        "Create Workflow",
      );

      console.log(
        "[CreateWorkflow] AI response length:",
        response.content?.length,
      );
      console.log(
        "[CreateWorkflow] AI response preview:",
        response.content?.slice(0, 500),
      );

      const { cleanContent, nodeActions } = cleanAIResponse(response.content);

      if (nodeActions.length === 0) {
        console.error("[CreateWorkflow] No nodeActions found in AI response");
        console.error("[CreateWorkflow] Full AI response:", response.content);
        return ApiResponse.error(
          "AI 未能生成有效的工作流配置，请重试或使用更详细的描述",
          400,
        );
      }

      // 3. 验证生成的 Actions
      const validation = validateWorkflowActions(nodeActions);
      if (!validation.valid) {
        console.warn(
          "[CreateWorkflow] Validation warnings:",
          validation.errors,
        );
        // 继续处理，不因为验证警告而失败
      }

      // 4. 构建节点和边
      const spacingX = 300;
      const startX = 100;
      const startY = 150;
      const addedNodeIds: string[] = [];
      const timestamp = Date.now();

      nodeActions.forEach((action, index) => {
        if (action.action === "add" && action.nodeType) {
          const realId = `node_${timestamp}_${index}`;
          const nodeType = action.nodeType.toUpperCase();
          const nodeName = action.nodeName || nodeType;

          // 使用 enrichNodeConfig 确保配置完整
          const enrichedConfig = enrichNodeConfig(
            nodeType,
            action.config || {},
            nodeName,
            defaultProviderId,
          );

          // 节点结构直接是 { id, type, name, position, config }
          // 不要嵌套在 data 中，因为 setWorkflow 会把整个节点作为 data
          nodes.push({
            id: realId,
            type: nodeType,
            name: nodeName,
            position: {
              x: startX + addedNodeIds.length * spacingX,
              y: startY,
            },
            config: enrichedConfig,
          });
          addedNodeIds.push(realId);

          console.log(
            `[CreateWorkflow] Added node: ${nodeName} (${nodeType}) with id ${realId}`,
          );
        }
      });

      // 处理连接
      nodeActions.forEach((action) => {
        if (action.action === "connect") {
          const parseId = (ref: string) => {
            if (!ref) return null;
            const match = ref.match(/new_(\d+)/);
            if (match) {
              const idx = parseInt(match[1]) - 1;
              return addedNodeIds[idx] || null;
            }
            return ref;
          };

          const sourceId = parseId(action.source);
          const targetId = parseId(action.target);

          if (sourceId && targetId) {
            edges.push({
              id: `edge_${sourceId}_${targetId}`,
              source: sourceId,
              target: targetId,
              sourceHandle: action.sourceHandle || null,
              targetHandle: action.targetHandle || null,
            });
            console.log(
              `[CreateWorkflow] Added edge: ${sourceId} -> ${targetId}`,
            );
          }
        }
      });

      // 生成工作流名称 - 从详细规格中提取名称或使用简短版本
      if (isDetailedSpec) {
        // 尝试从详细规格中提取工作流名称
        // 匹配 "**工作流名称**：xxx" 或 "**工作流名称**: xxx" 格式
        const nameMatch = prompt.match(/\*\*工作流名称\*\*[：:]\s*([^\n*]+)/);
        if (nameMatch) {
          // 清理名称：去除多余空格，限制长度
          workflowName = nameMatch[1].trim().slice(0, 50);
        } else {
          // 尝试提取目标作为备选名称
          const targetMatch = prompt.match(/\*\*目标\*\*[：:]\s*([^\n]{10,50})/);
          if (targetMatch) {
            workflowName = targetMatch[1].trim().slice(0, 30) + "...";
          } else {
            workflowName = "AI 生成工作流";
          }
        }
      } else {
        workflowName = prompt.length > 20 ? prompt.slice(0, 20) + "..." : prompt;
      }
    }

    // 5. 创建数据库记录
    // 生成简短的描述
    const shortDescription = templateId
      ? "从模板创建"
      : "由 AI 自动生成";

    const workflow = await prisma.workflow.create({
      data: {
        name: workflowName,
        description: shortDescription,
        organizationId: session.user.organizationId,
        creatorId: session.user.id,
        config: {
          nodes,
          edges,
          viewport: { x: 0, y: 0, zoom: 1 },
        } as any,
        tags: [],
        isActive: true,
        version: 1,
      },
    });

    console.log(
      "[CreateWorkflow] Workflow created successfully, id:",
      workflow.id,
      "nodes:",
      nodes.length,
      "edges:",
      edges.length,
    );

    return ApiResponse.success({
      id: workflow.id,
      message: "工作流创建成功",
      nodesCount: nodes.length,
      edgesCount: edges.length,
    });
  } catch (error) {
    console.error("[CreateWorkflow] Error:", error);
    if (error instanceof AIAssistantError) {
      return ApiResponse.error(error.userMessage, 500);
    }
    return ApiResponse.error(
      error instanceof Error ? error.message : "创建失败",
      500,
    );
  }
}
