import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'
import { ApiResponse } from '@/lib/api/api-response'

const AES_EVALUATION_PROMPT = `你是一个专业的 AI 工作流审计师。请基于 AES 评估体系对用户的工作流进行深度评估。

## 🛡️ AES 评估体系定义

| 维度 | 权重 | 核心指标 | 审查重点 |
|---|---|---|---|
| **L - Logic (逻辑闭环)** | 30% | 异常处理、分支覆盖、死循环规避 | 是否考虑了API失败？审核不通过是否回流？ |
| **A - Agentic (智能深度)** | 25% | 工具使用率、多步推理、反思机制 | 是否滥用 LLM 做非擅长的事（如计算）？是否有 Critic 节点？ |
| **C - Context (落地语境)** | 20% | 知识库依赖、API 真实性、参数配置 | knowledgeBaseId 是否存在？API URL 是否可用？Input 引导是否清晰？ |
| **P - Prompt (指令质量)** | 15% | 角色沉浸度、CoT 思维链、输出规范 | System Prompt 是否够深？是否强制了 JSON/Markdown 格式？ |
| **R - Robustness (鲁棒性)** | 10% | 代码健壮性、数据类型安全 | Code 节点是否有 try-catch？JSON 解析是否容错？ |

## 动态评估增强

**如果提供了【最近一次执行结果 (testResult)】：**
1. **L - Logic**: 如果执行失败（success=false），该维度最高不能超过 60 分。请分析失败原因是否为设计逻辑缺陷。
2. **R - Robustness**: 如果出现脚本错误或未捕获异常，该维度应大幅扣分。
3. **P - Prompt**: 检查输出结果（output）是否符合预期的格式（如 Process 节点的输出）。
4. 请填写 "executionAnalysis" 字段。

**如果提供了【用户期望目标 (targetCriteria)】：**
1. 请新增 "targetMatching" (目标达成度) 评分 (0-100)。
2. 分析实际输出与期望目标的差距。

## 任务

分析输入的工作流 JSON 数据（包含节点配置和连接关系），并结合（如果有）执行结果和用户目标，输出一份评估报告。

## 输出格式

请严格遵守以下 JSON 格式输出，不要包含 Markdown 代码块标记（如 \`\`\`json）：

{
  "scores": {
    "L": 25,
    "A": 20,
    "C": 18,
    "P": 12,
    "R": 8,
    "total": 83
  },
  "targetMatching": 85, // 可选：仅在提供 targetCriteria 时返回 (0-100)
  "report": "评估报告的 Markdown 内容...",
  "diagnosis": [
    {
      "dimension": "L",
      "issue": "缺少错误处理分支",
      "severity": "high",
      "suggestion": "在 HTTP 请求节点后添加条件判断，处理 status != 200 的情况"
    }
  ],
  "executionAnalysis": { // 可选：仅在提供 testResult 时返回
    "status": "success", // or "failed"
    "durationAnalysis": "耗时 2s，符合预期",
    "errorAnalysis": "无错误",
    "outputQuality": "输出内容完整，不仅包含了..."
  },
  "needOptimization": true
}

## 报告内容要求 (Markdown)

在 report 字段中，请生成一份易读的 Markdown 报告：
1.  **总览**：总分及等级（S: >=90, A: >=80, B: >=70, C: >=60, D: <60）。
2.  **动态分析**（如果有）：简述执行结果和目标达成情况。
3.  **维度得分**：列出五个维度的具体得分。
4.  **详细审计**：针对扣分点进行解释，引用具体的节点名称。

请用中文回答。`

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const {
      workflowContext,
      model,
      testResult, // 新增：最近一次执行结果
      targetCriteria, // 新增：用户期望目标
    } = body

    if (!workflowContext) {
      return ApiResponse.error('工作流上下文不能为空', 400)
    }

    // 获取 API Key
    let configId: string | null = null
    let modelName: string | null = null

    if (model && model.includes('code:')) {
      // Handle cases where model might be in format provider:model or similar
      // But existing code logic for split seems specific. Keeping original logic structure but clean.
      // The original code handled configId:modelName
    }

    if (model && model.includes(':')) {
      const parts = model.split(':')
      configId = parts[0]
      modelName = parts.slice(1).join(':')
    } else {
      modelName = model || null
    }

    let apiKey
    if (configId) {
      // First try to find by ID
      apiKey = await prisma.apiKey.findFirst({
        where: {
          id: configId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      // Fallback to default
      apiKey = await prisma.apiKey.findFirst({
        where: {
          organizationId: session.user.organizationId,
          isDefault: true,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      return ApiResponse.error('未配置AI服务，请先在设置中配置AI服务商', 400)
    }

    const selectedModel = modelName || apiKey.defaultModel || 'deepseek/deepseek-chat'

    // 构建上下文
    let promptContext = `请评估以下工作流：\n\n${workflowContext}`

    if (targetCriteria) {
      promptContext += `\n\n【用户期望目标】：\n${targetCriteria}`
    }

    if (testResult) {
      promptContext += `\n\n【最近一次执行结果】：\n${JSON.stringify({
        success: testResult.success,
        duration: testResult.duration,
        error: testResult.error,
        outputs: testResult.outputs ? Object.keys(testResult.outputs).length + ' outputs' : 'none',
        // 截取部分输出以防过长
        outputSample: testResult.outputs ? JSON.stringify(testResult.outputs).slice(0, 1000) : 'none'
      }, null, 2)}`
    }

    // 调用 AI
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages: [
          { role: 'system', content: AES_EVALUATION_PROMPT },
          { role: 'user', content: promptContext }
        ],
        temperature: 0.3, // 评估需要客观，降低温度
        maxTokens: 4000,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    let result
    try {
      // 尝试解析 JSON，处理可能存在的 Markdown 标记
      const cleanContent = response.content.replace(/```json\s*|\s*```/g, '').trim()
      result = JSON.parse(cleanContent)
    } catch (e) {
      console.error('Failed to parse AES evaluation result:', e)
      // 如果解析失败，尝试返回原始内容作为报告
      result = {
        scores: { L: 0, A: 0, C: 0, P: 0, R: 0, total: 0 },
        report: response.content,
        diagnosis: [],
        needOptimization: false
      }
    }

    return ApiResponse.success({
      success: true,
      evaluation: result,
      model: response.model,
      usage: response.usage,
    })

  } catch (error) {
    console.error('AES Evaluation error:', error)
    return ApiResponse.error(error instanceof Error ? error.message : '评估请求失败', 500)
  }
}
