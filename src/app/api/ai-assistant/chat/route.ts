import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'

// 节点类型描述
const NODE_TYPE_DESCRIPTIONS = `
可用的节点类型：
1. INPUT - 输入节点：定义工作流的输入字段，用户可以通过这些字段提供数据
2. PROCESS - 文本处理节点：使用AI处理文本，可以设置系统提示词和用户提示词
3. CODE - 代码节点：使用AI生成或执行代码
4. OUTPUT - 输出节点：格式化并输出工作流结果，支持text/json/markdown/word/excel/pdf等格式
5. DATA - 数据节点：导入Excel/CSV数据文件进行处理
6. IMAGE - 图片节点：导入和处理图片
7. VIDEO - 视频节点：导入和处理视频
8. AUDIO - 音频节点：导入和处理音频
9. CONDITION - 条件节点：根据条件进行分支判断
10. LOOP - 循环节点：对数组数据进行循环处理
11. SWITCH - 分支节点：多路分支选择
12. HTTP - HTTP请求节点：调用外部API
13. MERGE - 合并节点：合并多个并行分支的结果
14. IMAGE_GEN - 图片生成节点：使用AI生成图片
15. NOTIFICATION - 通知节点：发送飞书/钉钉/企业微信通知
16. TRIGGER - 触发器节点：定义工作流的触发方式（手动/Webhook/定时）
`

// 系统提示词
const SYSTEM_PROMPT = `你是一个专业的工作流配置助手。你的任务是帮助用户：
1. 理解和配置工作流节点
2. 设计工作流架构
3. 根据用户需求自动生成节点配置

${NODE_TYPE_DESCRIPTIONS}

当用户描述需求时，你应该：
1. 分析需求，确定需要哪些节点类型
2. 设计节点之间的连接关系
3. 生成具体的节点配置

## 响应格式

当用户需要创建或修改工作流时，在你的回答末尾，使用以下JSON格式描述需要执行的操作：

\`\`\`json:actions
{
  "nodeActions": [
    {
      "action": "add",
      "nodeType": "INPUT",
      "nodeName": "用户输入",
      "position": {"x": 100, "y": 100},
      "config": {
        "fields": [
          {"id": "field_1", "name": "问题", "value": ""}
        ]
      }
    },
    {
      "action": "add",
      "nodeType": "PROCESS",
      "nodeName": "AI处理",
      "position": {"x": 300, "y": 100},
      "config": {
        "systemPrompt": "你是一个有帮助的助手",
        "userPrompt": "{{用户输入.问题}}",
        "model": "deepseek/deepseek-chat",
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

注意：
- 使用 "new_1", "new_2" 等表示新添加的节点（按添加顺序）
- position 中 x 建议间隔200，y 建议间隔150
- 确保节点之间的连接关系正确

如果用户只是询问如何配置，不需要自动生成，则不要包含 json:actions 代码块。

请用中文回答用户的问题。`

// 解析AI响应中的节点操作
function parseNodeActions(content: string): { cleanContent: string; nodeActions: unknown[] | null } {
  const actionMatch = content.match(/```json:actions\s*([\s\S]*?)```/)

  if (!actionMatch) {
    return { cleanContent: content, nodeActions: null }
  }

  try {
    const actionsJson = JSON.parse(actionMatch[1])
    const cleanContent = content.replace(/```json:actions\s*[\s\S]*?```/, '').trim()

    return {
      cleanContent,
      nodeActions: actionsJson.nodeActions || null,
    }
  } catch {
    return { cleanContent: content, nodeActions: null }
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const { message, model, workflowContext, history } = body

    if (!message) {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 })
    }

    // 解析模型ID：支持新格式 "configId:modelName" 和旧格式 "modelName"
    let configId: string | null = null
    let modelName: string | null = null

    if (model && model.includes(':')) {
      const parts = model.split(':')
      configId = parts[0]
      modelName = parts.slice(1).join(':') // 处理模型名可能包含冒号的情况
    } else {
      modelName = model || null
    }

    // 获取AI配置
    let apiKey
    if (configId) {
      // 使用指定的配置
      apiKey = await prisma.apiKey.findFirst({
        where: {
          id: configId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      // 回退到默认配置
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

    // 构建消息 - 合并所有 system 内容为一个消息（兼容更多 API）
    let systemContent = SYSTEM_PROMPT
    if (workflowContext) {
      systemContent += `\n\n---\n\n当前工作流画布状态：\n${workflowContext}`
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent },
    ]

    // 添加历史消息
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: message })

    // 调用AI：优先使用指定的模型，否则使用配置的默认模型
    const selectedModel = modelName || apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.7,
        maxTokens: 4096,
      },
      decryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    // 解析节点操作
    const { cleanContent, nodeActions } = parseNodeActions(response.content)

    return NextResponse.json({
      content: cleanContent,
      nodeActions,
      model: response.model,
      usage: response.usage,
    })
  } catch (error) {
    console.error('AI Assistant error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI请求失败' },
      { status: 500 }
    )
  }
}
