import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'

const AES_EVALUATION_PROMPT = `你是一个专业的 AI 工作流审计师。请基于 AES 评估体系对用户的工作流进行深度评估。

## 🛡️ AES 评估体系定义

| 维度 | 权重 | 核心指标 | 审查重点 |
|---|---|---|---|
| **L - Logic (逻辑闭环)** | 30% | 异常处理、分支覆盖、死循环规避 | 是否考虑了API失败？审核不通过是否回流？ |
| **A - Agentic (智能深度)** | 25% | 工具使用率、多步推理、反思机制 | 是否滥用 LLM 做非擅长的事（如计算）？是否有 Critic 节点？ |
| **C - Context (落地语境)** | 20% | 知识库依赖、API 真实性、参数配置 | knowledgeBaseId 是否存在？API URL 是否可用？Input 引导是否清晰？ |
| **P - Prompt (指令质量)** | 15% | 角色沉浸度、CoT 思维链、输出规范 | System Prompt 是否够深？是否强制了 JSON/Markdown 格式？ |
| **R - Robustness (鲁棒性)** | 10% | 代码健壮性、数据类型安全 | Code 节点是否有 try-catch？JSON 解析是否容错？ |

## 任务

分析输入的工作流 JSON 数据（包含节点配置和连接关系），输出一份评估报告。

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
  "report": "评估报告的 Markdown 内容...",
  "diagnosis": [
    {
      "dimension": "L",
      "issue": "缺少错误处理分支",
      "severity": "high",
      "suggestion": "在 HTTP 请求节点后添加条件判断，处理 status != 200 的情况"
    }
  ],
  "needOptimization": true
}

## 报告内容要求 (Markdown)

在 report 字段中，请生成一份易读的 Markdown 报告：
1.  **总览**：总分及等级（S: >=90, A: >=80, B: >=70, C: >=60, D: <60）。
2.  **维度得分**：列出五个维度的具体得分。
3.  **核心发现**：简要列出 1-3 个优点和 1-3 个主要缺陷。
4.  **详细审计**：针对扣分点进行解释，引用具体的节点名称。

请用中文回答。`

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      workflowContext, 
      model,
    } = body

    if (!workflowContext) {
      return NextResponse.json({ error: '工作流上下文不能为空' }, { status: 400 })
    }

    // 获取 API Key
    let configId: string | null = null
    let modelName: string | null = null

    if (model && model.includes(':')) {
      const parts = model.split(':')
      configId = parts[0]
      modelName = parts.slice(1).join(':')
    } else {
      modelName = model || null
    }

    let apiKey
    if (configId) {
      apiKey = await prisma.apiKey.findFirst({
        where: {
          id: configId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      apiKey = await prisma.apiKey.findFirst({
        where: {
          organizationId: session.user.organizationId,
          isDefault: true,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      return NextResponse.json({ error: '未配置AI服务，请先在设置中配置AI服务商' }, { status: 400 })
    }

    const selectedModel = modelName || apiKey.defaultModel || 'deepseek/deepseek-chat'
    
    // 调用 AI
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages: [
          { role: 'system', content: AES_EVALUATION_PROMPT },
          { role: 'user', content: `请评估以下工作流：\n\n${workflowContext}` }
        ],
        temperature: 0.3, // 评估需要客观，降低温度
        maxTokens: 4000,
      },
      decryptApiKey(apiKey.keyEncrypted),
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

    return NextResponse.json({
      success: true,
      evaluation: result,
      model: response.model,
      usage: response.usage,
    })

  } catch (error) {
    console.error('AES Evaluation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '评估请求失败' },
      { status: 500 }
    )
  }
}
