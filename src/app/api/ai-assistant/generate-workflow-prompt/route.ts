import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeDecryptApiKey } from "@/lib/crypto";
import { aiService } from "@/lib/ai";
import { ApiResponse } from "@/lib/api/api-response";
import { AIAssistantError } from "@/lib/errors/ai-assistant-errors";

// 用于生成详细工作流提示词的 System Prompt
const GENERATE_PROMPT_SYSTEM = `你是一个工作流设计专家。用户会给你一个简要的需求描述，你需要帮助他扩展成一个详细的、结构化的工作流规格说明。

## 你的任务
根据用户的简要描述，生成一个详细的工作流规格说明，包括：
1. **工作流名称**：简洁明了的名称
2. **工作流目标**：明确描述这个工作流要实现什么
3. **输入字段**：用户需要提供什么信息（字段名、类型、是否必填、说明）
4. **处理步骤**：每个AI处理节点要做什么，包括：
   - 节点名称
   - 节点目标/任务
   - 所需输入（引用哪些上游数据）
   - 期望输出
   - 推荐工具（如果需要调用外部服务）
5. **输出结果**：最终输出什么内容

## 可用的工具类型
- **HTTP请求** (http-request): 调用外部API、获取网页内容、发送数据到第三方服务
- **飞书多维表格** (feishu-bitable): 读写飞书多维表格数据
- **飞书通知** (notification-feishu): 发送消息到飞书群机器人
- **钉钉通知** (notification-dingtalk): 发送消息到钉钉群机器人
- **企业微信通知** (notification-wecom): 发送消息到企业微信群机器人

## 工具使用场景判断
- 需要从外部获取数据（天气、新闻、API数据等）→ 使用 HTTP请求
- 需要将数据保存到飞书表格 → 使用 飞书多维表格
- 需要发送通知到即时通讯工具 → 使用对应平台的通知工具
- 纯文本处理、内容生成、翻译等 → 不需要工具

## 输出格式要求
使用中文，以清晰易读的文本格式输出，让用户可以理解和修改。格式如下：

---
**工作流名称**：[名称]

**目标**：[详细描述工作流要实现什么]

**输入字段**：
- [字段1名称] (类型: 文本/图片/文件等, 必填/选填): [说明]
- [字段2名称] (类型: ..., ...): [说明]
...

**处理步骤**：

1. **[步骤1名称]**
   - 目标：[这个步骤要做什么]
   - 输入：[使用哪些数据]
   - 输出：[产出什么]
   - AI指令要点：[AI需要遵循的关键指令]
   - 推荐工具：[如需调用外部服务，列出工具类型和用途；如不需要，写"无"]

2. **[步骤2名称]**
   ...

**最终输出**：[描述最终结果]
---

## 重要规则
1. 尽可能详细和具体，让用户能清楚理解每个步骤
2. 输入字段类型可选：文本、图片、PDF、Word、Excel、音频、视频、单选、多选
3. 处理步骤应该逻辑清晰，每个步骤只做一件事
4. 如果用户的描述不够清晰，做出合理的假设并在规格说明中体现
5. 根据任务需求判断是否需要使用工具，如需要则明确指出工具类型
6. 使用中文输出`;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.organizationId) {
      return ApiResponse.error("未授权", 401);
    }

    const { prompt } = await request.json();
    if (!prompt || !prompt.trim()) {
      return ApiResponse.error("需求描述不能为空", 400);
    }

    console.log(
      "[GenerateWorkflowPrompt] Starting, prompt:",
      prompt.slice(0, 100)
    );

    // 获取 AI 配置
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
      "[GenerateWorkflowPrompt] Using AI provider:",
      safeKey.provider,
      "model:",
      safeKey.defaultModel,
      "baseUrl:",
      safeKey.baseUrl ? "configured" : "default"
    );

    // 检查密钥是否有效
    const decryptedKey = safeDecryptApiKey(safeKey.keyEncrypted);
    if (!decryptedKey) {
      console.error("[GenerateWorkflowPrompt] Failed to decrypt API key");
      return ApiResponse.error("AI 服务配置错误，API 密钥无效", 400);
    }

    // 调用 AI 生成详细提示词
    const userMessage = `用户的简要需求描述：
${prompt}

请根据上述简要描述，生成一个详细的、结构化的工作流规格说明。`;

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
              { role: "system", content: GENERATE_PROMPT_SYSTEM },
              { role: "user", content: userMessage },
            ],
            temperature: 0.7,
            maxTokens: 2048,
          },
          decryptedKey,
          safeKey.baseUrl || undefined
        ),
      "Generate Workflow Prompt"
    );

    console.log(
      "[GenerateWorkflowPrompt] AI response length:",
      response.content?.length
    );

    if (!response.content) {
      console.error("[GenerateWorkflowPrompt] Empty AI response");
      return ApiResponse.error("AI 返回了空的响应，请重试", 500);
    }

    return ApiResponse.success({
      detailedPrompt: response.content,
      originalPrompt: prompt,
    });
  } catch (error: any) {
    console.error("[GenerateWorkflowPrompt] Error:", error);
    console.error("[GenerateWorkflowPrompt] Error stack:", error?.stack);
    console.error("[GenerateWorkflowPrompt] Error message:", error?.message);

    if (error instanceof AIAssistantError) {
      return ApiResponse.error(error.userMessage, 500, {
        code: error.code,
        retryable: error.retryable,
        ...(process.env.NODE_ENV !== "production" ? { debugMessage: error.message } : {}),
      });
    }

    // Provide more specific error messages
    const errorMessage = error?.message || "生成失败";
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      return ApiResponse.error("AI 服务授权失败，请检查 API Key 配置", 401);
    }
    if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      return ApiResponse.error("AI 服务请求过于频繁，请稍后再试", 429);
    }
    if (errorMessage.includes("timeout")) {
      return ApiResponse.error("AI 服务响应超时，请重试", 504);
    }

    return ApiResponse.error(
      errorMessage.length > 100 ? "AI 服务调用失败，请稍后重试" : errorMessage,
      500
    );
  }
}
