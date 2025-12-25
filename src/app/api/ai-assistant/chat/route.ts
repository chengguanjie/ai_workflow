import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeDecryptApiKey } from "@/lib/crypto";
import { aiService } from "@/lib/ai";
import { ApiResponse } from "@/lib/api/api-response";
import {
  ENHANCED_SYSTEM_PROMPT,
  validateWorkflowActions,
} from "@/lib/workflow/generator";
import { AIAssistantError } from "@/lib/errors/ai-assistant-errors";

const OPTIMIZATION_PROMPT = `你是一个工作流优化专家。你的任务是分析工作流的执行结果，找出问题并提出优化建议。

## 分析要点

1. **执行结果分析**
   - 哪些节点执行成功？
   - 哪些节点执行失败？失败原因是什么？
   - 输出结果是否符合预期？

2. **问题诊断**
   - 提示词是否有问题？需要如何优化？
   - 变量引用是否正确？
   - 节点配置是否合理？
   - 数据流是否顺畅？

3. **优化建议**
   - 提出具体的修改建议
   - 给出优化后的配置
   - 解释为什么这样优化

## 响应格式

分析完成后，如果需要修改节点配置，请使用以下格式：

\`\`\`json:actions
{
  "phase": "optimization",
  "analysis": {
    "issues": [
      {
        "nodeId": "节点ID",
        "nodeName": "节点名称",
        "issue": "问题描述",
        "suggestion": "建议的解决方案",
        "priority": "high"
      }
    ],
    "summary": "总体分析总结"
  },
  "nodeActions": [
    {
      "action": "update",
      "nodeId": "process_xxx",
      "nodeName": "AI处理",
      "config": {
        "systemPrompt": "优化后的系统提示词...",
        "userPrompt": "优化后的用户提示词..."
      }
    }
  ]
}
\`\`\`


请用中文回答。`;

const REFINEMENT_PROMPT = `你是一个工作流架构师。用户正在审查一个AI生成的工作流方案，并希望对其中的某个节点进行修改。
你的任务是根据用户的要求，修改现有的工作流生成方案（JSON Actions），并输出完整的、更新后的方案。

## 分析要点
1. **理解修改意图**：用户希望修改特定节点的配置、类型，还是其连接关系？
2. **维护图的一致性**：修改一个节点可能会影响其前驱或后继节点（例如输入输出字段的变化），请确保一并调整。

## 输入上下文
你将收到：
1. **当前方案**：一个包含所有节点的 JSON Action 列表。
2. **目标节点**：用户希望修改的节点名称。
3. **修改要求**：用户具体的修改意见。

## 输出要求
1. **必须输出完整的 JSON Action 列表**：请不要只输出修改的部分，而是输出包含所有节点（包括未修改节点）的完整列表，以便前端可以直接替换。
2. **响应格式**：

\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    ... // 完整的、更新后的 Action 列表
  ]
}
\`\`\`

请只输出 JSON 和简短的修改说明，不要啰嗦。`;

interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  allowInput?: boolean;
}

interface Question {
  id: string;
  question: string;
  options: QuestionOption[];
}

interface ParsedResponse {
  cleanContent: string;
  nodeActions: unknown[] | null;
  phase?: string;
  analysis?: unknown;
  questionOptions?: {
    phase: string;
    questions: Question[];
  };
}

function parseAIResponse(content: string): ParsedResponse {
  let cleanContent = content;
  let nodeActions: unknown[] | null = null;
  let phase: string | undefined;
  let analysis: unknown;
  let questionOptions: ParsedResponse["questionOptions"];

  const actionMatch = content.match(/```json:actions\s*([\s\S]*?)```/);
  if (actionMatch) {
    try {
      const actionsJson = JSON.parse(actionMatch[1]);
      cleanContent = cleanContent
        .replace(/```json:actions\s*[\s\S]*?```/, "")
        .trim();
      nodeActions = actionsJson.nodeActions || null;
      phase = actionsJson.phase;
      analysis = actionsJson.analysis;
    } catch {}
  }

  const optionsMatch = content.match(/```json:options\s*([\s\S]*?)```/);
  if (optionsMatch) {
    try {
      const optionsJson = JSON.parse(optionsMatch[1]);
      cleanContent = cleanContent
        .replace(/```json:options\s*[\s\S]*?```/, "")
        .trim();
      questionOptions = {
        phase: optionsJson.phase || "requirement_gathering",
        questions: optionsJson.questions || [],
      };
      if (!phase) {
        phase = optionsJson.phase;
      }
    } catch {}
  }

  return {
    cleanContent,
    nodeActions,
    phase,
    analysis,
    questionOptions,
  };
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  console.log(`[AI Chat][${requestId}] 收到请求`);

  try {
    const session = await auth();

    if (!session?.user?.organizationId) {
      console.log(`[AI Chat][${requestId}] 未授权访问`);
      return ApiResponse.error("未授权", 401);
    }

    console.log(
      `[AI Chat][${requestId}] 用户: ${session.user.id}, 组织: ${session.user.organizationId}`,
    );

    const body = await request.json();
    const {
      message,
      model,
      workflowContext,
      history,
      mode = "normal",
      testResult,
      targetCriteria,
      currentActions,
      targetNode,
    } = body;

    console.log(`[AI Chat][${requestId}] 请求参数:`, {
      mode,
      model,
      messageLength: message?.length,
      hasWorkflowContext: !!workflowContext,
      historyLength: history?.length,
    });

    if (!message && mode !== "optimization" && mode !== "refinement") {
      console.log(`[AI Chat][${requestId}] 消息为空`);
      return ApiResponse.error("消息不能为空", 400);
    }

    let configId: string | null = null;
    let modelName: string | null = null;

    if (model && model.includes(":")) {
      const parts = model.split(":");
      configId = parts[0];
      modelName = parts.slice(1).join(":");
    } else {
      modelName = model || null;
    }

    console.log(
      `[AI Chat][${requestId}] 解析模型: configId=${configId}, modelName=${modelName}`,
    );

    let apiKey;
    if (configId) {
      apiKey = await prisma.apiKey.findFirst({
        where: {
          id: configId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      });
    }

    if (!apiKey) {
      apiKey = await prisma.apiKey.findFirst({
        where: {
          organizationId: session.user.organizationId,
          isDefault: true,
          isActive: true,
        },
      });
    }

    if (!apiKey) {
      console.log(`[AI Chat][${requestId}] 未找到 API Key 配置`);
      return ApiResponse.error("未配置AI服务，请先在设置中配置AI服务商", 400);
    }

    console.log(`[AI Chat][${requestId}] 使用 API Key:`, {
      id: apiKey.id,
      provider: apiKey.provider,
      name: apiKey.name,
      hasBaseUrl: !!apiKey.baseUrl,
    });

    // FETCH LEARNING PATTERNS
    let learningContext = "";
    if (
      session?.user?.organizationId &&
      (mode === "normal" || mode === "refinement")
    ) {
      try {
        const { workflowLearningService } = await import(
          "@/lib/workflow/learning"
        );
        learningContext =
          await workflowLearningService.getGenericSuccessPatterns(
            session.user.organizationId,
          );
      } catch (e) {
        console.warn("Failed to load learning context", e);
      }
    }

    let systemPrompt = ENHANCED_SYSTEM_PROMPT;

    if (mode === "optimization") {
      systemPrompt = OPTIMIZATION_PROMPT;
    } else if (mode === "refinement") {
      systemPrompt = REFINEMENT_PROMPT;
    }

    let systemContent = systemPrompt;

    if (learningContext) {
      systemContent += `\n\n${learningContext}`;
    }

    if (workflowContext) {
      systemContent += `\n\n---\n\n## 当前工作流画布状态\n${workflowContext}`;
    }

    if (mode === "optimization" && testResult) {
      systemContent += `\n\n## 测试执行结果\n\`\`\`json\n${JSON.stringify(testResult, null, 2)}\n\`\`\``;
      if (targetCriteria) {
        systemContent += `\n\n## 用户期望的目标\n${targetCriteria}`;
      }
    } else if (mode === "refinement" && currentActions) {
      systemContent += `\n\n## 当前待审查的方案 (JSON Actions)\n\`\`\`json\n${JSON.stringify(currentActions, null, 2)}\n\`\`\``;
      systemContent += `\n\n## 目标修改节点\n${targetNode}`;
    }

    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: systemContent }];

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    if (mode === "optimization") {
      messages.push({
        role: "user",
        content: `请分析上面的测试执行结果，找出问题并提出具体的优化建议。如果有需要修改的节点配置，请直接给出修改方案。${targetCriteria ? `\n\n用户期望达到的目标：${targetCriteria}` : ""}`,
      });
    } else if (mode === "refinement") {
      messages.push({
        role: "user",
        content: `请根据以下要求修改节点 "${targetNode}"：\n${message}\n\n请输出完整的更新后的 JSON Action 列表。`,
      });
    } else {
      messages.push({ role: "user", content: message });
    }

    const { withAIErrorHandling } = await import(
      "@/lib/errors/ai-assistant-errors"
    );

    const selectedModel =
      modelName || apiKey.defaultModel || "deepseek/deepseek-chat";
    console.log(`[AI Chat][${requestId}] 调用 AI 服务:`, {
      provider: apiKey.provider,
      model: selectedModel,
      messagesCount: messages.length,
      baseUrl: apiKey.baseUrl || "默认",
    });

    const aiStartTime = Date.now();
    const response = await withAIErrorHandling(
      () =>
        aiService.chat(
          apiKey.provider,
          {
            model: selectedModel,
            messages,
            temperature: 0.7,
            maxTokens: 8192,
          },
          safeDecryptApiKey(apiKey.keyEncrypted),
          apiKey.baseUrl || undefined,
        ),
      "AI Chat Generation",
    );

    const aiDuration = Date.now() - aiStartTime;
    console.log(`[AI Chat][${requestId}] AI 响应成功:`, {
      duration: `${aiDuration}ms`,
      contentLength: response.content?.length,
      model: response.model,
      usage: response.usage,
    });

    const {
      cleanContent: parsedContent,
      nodeActions,
      phase,
      analysis,
      questionOptions,
    } = parseAIResponse(response.content);

    let finalContent = parsedContent;
    if (nodeActions && Array.isArray(nodeActions)) {
      const validation = validateWorkflowActions(nodeActions);
      if (!validation.valid && validation.errors.length > 0) {
        finalContent += `\n\n> ⚠️ **系统检测到生成的工作流可能存在隐患**：\n${validation.errors.map((e) => `> - ${e}`).join("\n")}`;
      }
    }

    return ApiResponse.success({
      content: finalContent,
      nodeActions,
      phase,
      analysis,
      questionOptions,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(
      `[AI Chat][${requestId}] 请求失败 (耗时 ${totalDuration}ms):`,
      error,
    );
    if (error instanceof AIAssistantError) {
      return ApiResponse.error(error.userMessage, 500);
    }
    return ApiResponse.error(
      error instanceof Error ? error.message : "AI请求失败",
      500,
    );
  }
}
