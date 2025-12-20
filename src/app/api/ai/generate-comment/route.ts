import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'

// 节点类型中文名称映射
const NODE_TYPE_NAMES: Record<string, string> = {
  INPUT: '输入节点',
  PROCESS: '文本处理节点',
  CODE: '代码节点',
  OUTPUT: '输出节点',
  DATA: '数据节点',
  IMAGE: '图片节点',
  VIDEO: '视频节点',
  AUDIO: '音频节点',
  CONDITION: '条件分支节点',
  LOOP: '循环节点',
  SWITCH: '多路分支节点',
  HTTP: 'HTTP请求节点',
  MERGE: '合并节点',
  IMAGE_GEN: '图片生成节点',
  NOTIFICATION: '通知节点',
  TRIGGER: '触发器节点',
  GROUP: '节点组',
}

// 系统提示词
const SYSTEM_PROMPT = `你是一个专业的工作流文档助手。你的任务是根据节点的配置信息，生成清晰、简洁的节点注释说明。

注释应该包含：
1. 节点的主要功能和作用
2. 关键配置的说明（如有）
3. 输入/输出的简要说明（如有）

注释要求：
- 使用中文
- 简洁明了，通常 2-4 句话
- 不要使用技术术语，用通俗易懂的语言
- 突出这个节点在工作流中的作用

只输出注释内容，不要添加任何前缀或格式。`

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const { nodeId, nodeName, nodeType, nodeConfig } = body

    if (!nodeId || !nodeType) {
      return NextResponse.json({ error: '节点信息不完整' }, { status: 400 })
    }

    // 获取AI配置
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        organizationId: session.user.organizationId,
        isDefault: true,
        isActive: true,
      },
    })

    if (!apiKey) {
      return NextResponse.json({ error: '未配置AI服务，请先在设置中配置AI服务商' }, { status: 400 })
    }

    // 构建节点描述
    const nodeTypeName = NODE_TYPE_NAMES[nodeType] || nodeType
    let nodeDescription = `节点名称：${nodeName}\n节点类型：${nodeTypeName}\n`

    // 根据节点类型添加关键配置信息
    if (nodeConfig?.config) {
      const config = nodeConfig.config
      switch (nodeType) {
        case 'INPUT':
          if (config.fields?.length > 0) {
            const fieldNames = config.fields.map((f: { name: string }) => f.name).join('、')
            nodeDescription += `输入字段：${fieldNames}\n`
          }
          break
        case 'PROCESS':
          if (config.systemPrompt) {
            nodeDescription += `系统提示词：${config.systemPrompt.substring(0, 200)}${config.systemPrompt.length > 200 ? '...' : ''}\n`
          }
          if (config.userPrompt) {
            nodeDescription += `用户提示词：${config.userPrompt.substring(0, 200)}${config.userPrompt.length > 200 ? '...' : ''}\n`
          }
          if (config.knowledgeItems?.length > 0) {
            nodeDescription += `关联知识库：${config.knowledgeItems.length} 个\n`
          }
          break
        case 'OUTPUT':
          if (config.format) {
            nodeDescription += `输出格式：${config.format}\n`
          }
          if (config.prompt) {
            nodeDescription += `输出提示词：${config.prompt.substring(0, 200)}${config.prompt.length > 200 ? '...' : ''}\n`
          }
          break
        case 'CONDITION':
          if (config.conditions?.length > 0) {
            nodeDescription += `条件数量：${config.conditions.length} 个\n`
          }
          break
        case 'LOOP':
          nodeDescription += `循环类型：${config.loopType === 'FOR' ? '数组遍历' : '条件循环'}\n`
          break
        case 'HTTP':
          if (config.method && config.url) {
            nodeDescription += `请求方式：${config.method}\n`
            nodeDescription += `请求URL：${config.url}\n`
          }
          break
        case 'SWITCH':
          if (config.cases?.length > 0) {
            nodeDescription += `分支数量：${config.cases.length} 个\n`
          }
          break
        case 'GROUP':
          if (config.childNodeIds?.length > 0) {
            nodeDescription += `包含节点：${config.childNodeIds.length} 个\n`
          }
          break
        case 'TRIGGER':
          nodeDescription += `触发方式：${config.triggerType === 'MANUAL' ? '手动触发' : config.triggerType === 'WEBHOOK' ? 'Webhook触发' : '定时触发'}\n`
          break
      }
    }

    // 调用AI生成注释
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请为以下工作流节点生成注释说明：\n\n${nodeDescription}` },
    ]

    const selectedModel = apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.7,
        maxTokens: 500,
      },
      decryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    return NextResponse.json({
      comment: response.content.trim(),
    })
  } catch (error) {
    console.error('Generate comment error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成注释失败' },
      { status: 500 }
    )
  }
}
