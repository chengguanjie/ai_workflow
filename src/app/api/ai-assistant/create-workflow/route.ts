import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeDecryptApiKey } from "@/lib/crypto";
import { aiService } from "@/lib/ai";
import { ApiResponse } from "@/lib/api/api-response";
import { validateWorkflowActions } from "@/lib/workflow/generator";
import { AIAssistantError } from "@/lib/errors/ai-assistant-errors";

// 专门用于直接创建工作流的 System Prompt（更简洁、更直接）
const CREATE_WORKFLOW_SYSTEM_PROMPT = `你是一个AI工作流生成专家。根据用户需求，直接生成完整的工作流配置。

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
  - userPrompt: 用户提示词（使用 {{节点名.字段名}} 引用上游数据）
  - temperature: 0.1-1.0（严谨任务用0.3，创意任务用0.7）

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
        "temperature": 0.7
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
4. PROCESS 节点的 userPrompt 必须正确引用上游节点的字段，格式：{{节点名.字段名}}
5. 使用 "new_1", "new_2" 等引用新添加的节点进行连接
6. 所有文本内容使用中文

请直接输出 json:actions，不要有多余的解释。`;

function cleanAIResponse(content: string) {
  let cleanContent = content.trim();
  let nodeActions: any[] = [];

  // 1. 尝试提取 json:actions
  const jsonActionsMatch = cleanContent.match(
    /```json:actions\s*([\s\S]*?)```/,
  );
  if (jsonActionsMatch) {
    try {
      const parsed = JSON.parse(jsonActionsMatch[1]);
      nodeActions = parsed.nodeActions || parsed;
      cleanContent = cleanContent.replace(jsonActionsMatch[0], "").trim();
      console.log(
        "[CreateWorkflow] Parsed json:actions successfully, nodeActions count:",
        nodeActions.length,
      );
    } catch (e) {
      console.error("[CreateWorkflow] Failed to parse json:actions:", e);
    }
  }

  // 2. 尝试普通 json block
  if (nodeActions.length === 0) {
    const simpleJsonMatch = cleanContent.match(/```json\s*([\s\S]*?)```/);
    if (simpleJsonMatch) {
      try {
        const parsed = JSON.parse(simpleJsonMatch[1]);
        if (parsed.nodeActions) {
          nodeActions = parsed.nodeActions;
          cleanContent = cleanContent.replace(simpleJsonMatch[0], "").trim();
          console.log(
            "[CreateWorkflow] Parsed json block successfully, nodeActions count:",
            nodeActions.length,
          );
        }
      } catch (e) {
        console.error("[CreateWorkflow] Failed to parse json block:", e);
      }
    }
  }

  // 3. 尝试直接解析整个内容为 JSON
  if (nodeActions.length === 0) {
    try {
      const parsed = JSON.parse(cleanContent);
      if (parsed.nodeActions) {
        nodeActions = parsed.nodeActions;
        console.log(
          "[CreateWorkflow] Parsed raw content as JSON, nodeActions count:",
          nodeActions.length,
        );
      }
    } catch (e) {
      // 不是 JSON，忽略
    }
  }

  return { cleanContent, nodeActions };
}

// 为节点配置添加默认值
function enrichNodeConfig(
  nodeType: string,
  config: any,
  nodeName: string,
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
  }

  console.log(
    `[CreateWorkflow] Enriched config for ${nodeType} node "${nodeName}":`,
    JSON.stringify(enrichedConfig, null, 2),
  );

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
      // 1. 获取 AI 配置
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          organizationId: session.user.organizationId,
          isDefault: true,
          isActive: true,
        },
      });

      const safeKey =
        apiKey ||
        (await prisma.apiKey.findFirst({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
        }));

      if (!safeKey) {
        return ApiResponse.error("未配置AI服务，请先在设置中配置API密钥", 400);
      }

      console.log(
        "[CreateWorkflow] Using AI provider:",
        safeKey.provider,
        "model:",
        safeKey.defaultModel,
      );

      // 2. 调用 AI 生成工作流
      const userMessage = `用户需求：${prompt}

请根据上述需求生成工作流。要求：
1. 必须包含完整的 INPUT 节点配置（fields 数组要有 id、name、fieldType、required、placeholder、description）
2. PROCESS 节点必须有详细的 systemPrompt（描述AI角色和任务）和 userPrompt（引用上游变量）
3. 直接输出 json:actions 格式，不要多余解释`;

      const { withAIErrorHandling } = await import(
        "@/lib/errors/ai-assistant-errors"
      );

      const response = await withAIErrorHandling(
        () =>
          aiService.chat(
            safeKey.provider,
            {
              model: safeKey.defaultModel || "deepseek/deepseek-chat",
              messages: [
                { role: "system", content: CREATE_WORKFLOW_SYSTEM_PROMPT },
                { role: "user", content: userMessage },
              ],
              temperature: 0.5, // 降低温度以获得更稳定的输出
              maxTokens: 4096,
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

      // 生成工作流名称
      workflowName = prompt.length > 20 ? prompt.slice(0, 20) + "..." : prompt;
    }

    // 5. 创建数据库记录
    const workflow = await prisma.workflow.create({
      data: {
        name: workflowName,
        description: templateId
          ? "从模板创建"
          : `由 AI 根据需求自动生成: ${prompt}`,
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
