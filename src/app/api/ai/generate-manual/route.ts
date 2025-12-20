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
const SYSTEM_PROMPT = `你是一个专业的工作流文档编写助手。你的任务是根据工作流的结构和节点配置，生成一份完整的操作指南说明手册。

说明手册应该包含以下部分（使用 Markdown 格式）：

## 工作流概述
- 简要描述这个工作流的用途和目标
- 说明适用场景

## 节点说明
- 逐个介绍每个节点的作用
- 说明节点之间的数据流向

## 使用步骤
- 详细的操作步骤
- 每一步需要做什么

## 输入说明
- 需要提供哪些输入
- 每个输入字段的说明和格式要求

## 输出说明
- 工作流会产生什么结果
- 输出的格式和内容

## 注意事项
- 使用时需要注意的问题
- 常见错误和解决方法

要求：
- 使用中文
- 语言通俗易懂，面向普通用户
- 结构清晰，层次分明
- 尽量详细但不啰嗦`

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const { workflowContext } = body

    if (!workflowContext) {
      return NextResponse.json({ error: '工作流信息不完整' }, { status: 400 })
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

    // 构建工作流描述
    let workflowDescription = `工作流名称：${workflowContext.name || '未命名工作流'}\n\n`
    workflowDescription += '节点列表：\n'

    // 添加节点信息
    if (workflowContext.nodes && Array.isArray(workflowContext.nodes)) {
      for (const node of workflowContext.nodes) {
        const nodeTypeName = NODE_TYPE_NAMES[node.type] || node.type
        workflowDescription += `\n### ${node.name || '未命名节点'} (${nodeTypeName})\n`

        // 添加节点注释（如果有）
        if (node.comment) {
          workflowDescription += `注释：${node.comment}\n`
        }

        // 添加关键配置信息
        if (node.config) {
          const config = node.config
          switch (node.type) {
            case 'INPUT':
              if (config.fields?.length > 0) {
                workflowDescription += `输入字段：\n`
                for (const field of config.fields) {
                  workflowDescription += `  - ${field.name}\n`
                }
              }
              break
            case 'PROCESS':
              if (config.systemPrompt) {
                workflowDescription += `系统提示词：${config.systemPrompt.substring(0, 300)}${config.systemPrompt.length > 300 ? '...' : ''}\n`
              }
              if (config.userPrompt) {
                workflowDescription += `用户提示词模板：${config.userPrompt.substring(0, 300)}${config.userPrompt.length > 300 ? '...' : ''}\n`
              }
              break
            case 'OUTPUT':
              if (config.format) {
                workflowDescription += `输出格式：${config.format}\n`
              }
              break
            case 'CONDITION':
              workflowDescription += `条件分支节点，根据条件执行不同分支\n`
              break
            case 'LOOP':
              workflowDescription += `循环节点，${config.loopType === 'FOR' ? '遍历数组数据' : '条件循环'}\n`
              break
            case 'HTTP':
              if (config.method && config.url) {
                workflowDescription += `HTTP请求：${config.method} ${config.url}\n`
              }
              break
            case 'TRIGGER':
              workflowDescription += `触发方式：${config.triggerType === 'MANUAL' ? '手动触发' : config.triggerType === 'WEBHOOK' ? 'Webhook触发' : '定时触发'}\n`
              break
            case 'GROUP':
              if (config.childNodeIds?.length > 0) {
                workflowDescription += `节点组，包含 ${config.childNodeIds.length} 个子节点\n`
              }
              break
          }
        }
      }
    }

    // 添加连接关系
    if (workflowContext.edges && Array.isArray(workflowContext.edges) && workflowContext.edges.length > 0) {
      workflowDescription += '\n数据流向：\n'

      // 创建节点ID到名称的映射
      const nodeNameMap: Record<string, string> = {}
      if (workflowContext.nodes) {
        for (const node of workflowContext.nodes) {
          nodeNameMap[node.id] = node.name || '未命名节点'
        }
      }

      for (const edge of workflowContext.edges) {
        const sourceName = nodeNameMap[edge.source] || edge.source
        const targetName = nodeNameMap[edge.target] || edge.target
        workflowDescription += `  ${sourceName} → ${targetName}\n`
      }
    }

    // 调用AI生成说明手册
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请为以下工作流生成详细的操作说明手册：\n\n${workflowDescription}` },
    ]

    const selectedModel = apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.7,
        maxTokens: 4000,
      },
      decryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    return NextResponse.json({
      manual: response.content.trim(),
    })
  } catch (error) {
    console.error('Generate manual error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成说明手册失败' },
      { status: 500 }
    )
  }
}
