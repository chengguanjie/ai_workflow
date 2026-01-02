import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'
import type { WorkflowConfig, NodeConfig } from '@/types/workflow'
import { ApiResponse } from '@/lib/api/api-response'
import { validateWorkflowActions } from '@/lib/workflow/generator'

// 精修系统提示词
const REFINE_SYSTEM_PROMPT = `你是一个工作流精修专家。用户会给你一个工作流的配置信息，以及一个精确的修改指令。
你的任务是根据用户的指令，生成精准的工作流修改操作。

你必须返回一个JSON对象，格式如下：
\`\`\`json
{
  "success": true,
  "summary": "简要描述做了什么修改",
  "explanation": "详细解释修改的原因和预期效果",
  "nodeActions": [
    // 修改节点配置
    {
      "action": "update",
      "nodeId": "节点ID",
      "nodeName": "节点名称",
      "config": { /* 要更新的配置字段 */ }
    },
    // 或添加新节点
    {
      "action": "add",
      "nodeType": "PROCESS" | "INPUT" | "OUTPUT" | "CONDITION" | "LOOP" | "HTTP" | "CODE" | "MERGE" | "NOTIFICATION" | "IMAGE_GEN" | "SWITCH",
      "nodeName": "新节点名称",
      "position": { "x": 100, "y": 100 },
      "config": { /* 节点配置 */ }
    },
    // 或删除节点
    {
      "action": "delete",
      "nodeId": "节点ID",
      "nodeName": "节点名称"
    },
    // 或添加连接
    {
      "action": "connect",
      "source": "源节点ID",
      "target": "目标节点ID",
      "sourceHandle": null,
      "targetHandle": null
    }
  ]
}
\`\`\`

重要规则：
1. 只执行用户明确要求的修改，不要添加额外的"优化"
2. update 操作只需要包含要修改的字段，不需要包含未修改的字段
3. 确保 nodeId 与工作流中实际存在的节点ID匹配
4. 如果用户的指令不明确或无法执行，在 summary 中说明原因
5. 始终保持工作流的逻辑完整性`

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const {
      workflowId,
      workflowContext, // 前端传来的工作流上下文
      model,
      operation, // 'modify' | 'add' | 'delete' | 'reconnect'
      targetNodeId, // 目标节点ID（用于modify和delete）
      prompt, // 用户的精修指令
    } = body

    if (!workflowId) {
      return ApiResponse.error('工作流ID不能为空', 400)
    }

    if (!prompt || !prompt.trim()) {
      return ApiResponse.error('精修指令不能为空', 400)
    }

    // 获取工作流配置
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
        deletedAt: null,
      },
    })

    if (!workflow) {
      return ApiResponse.error('工作流不存在', 404)
    }

    const config = workflow.config as unknown as WorkflowConfig

    // 解析模型配置
    let configId: string | null = null
    let modelName: string | null = null

    if (model && model.includes(':')) {
      const parts = model.split(':')
      configId = parts[0]
      modelName = parts.slice(1).join(':')
    } else {
      modelName = model || null
    }

    // 获取API密钥
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
      return ApiResponse.error('未配置AI服务', 400)
    }

    // 生成详细的工作流配置上下文（如果前端没传）
    const detailedContext = workflowContext || generateDetailedContext(config)

    // 构建用户消息
    let userContent = `请根据以下精修指令修改工作流。

## 当前工作流配置
${detailedContext}

## 操作类型
${getOperationDescription(operation)}

`

    // 如果有目标节点，添加节点详情
    if (targetNodeId) {
      const targetNode = config.nodes.find(n => n.id === targetNodeId)
      if (targetNode) {
        userContent += `## 目标节点详情
- 节点ID: ${targetNode.id}
- 节点名称: ${targetNode.name}
- 节点类型: ${targetNode.type}
- 当前配置:
\`\`\`json
${JSON.stringify(targetNode.config, null, 2)}
\`\`\`

`
      }
    }

    userContent += `## 用户精修指令
${prompt}

请根据上述指令生成精确的修改操作。只执行用户明确要求的修改，不要添加额外的改动。`

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: REFINE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ]

    const selectedModel = modelName || apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.3, // 低温度以确保精确性
        maxTokens: 2048,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    // 解析响应
    let result
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/)
      const contentToParse = jsonMatch ? jsonMatch[1] : response.content
      result = JSON.parse(contentToParse)

      // 验证生成的 nodeActions
      if (result.nodeActions && Array.isArray(result.nodeActions)) {
        const validation = validateWorkflowActions(result.nodeActions)
        if (!validation.valid) {
          result.summary += ` [警告: ${validation.errors.join('; ')}]`
        }
      }
    } catch (e) {
      console.error('Failed to parse refine response:', e)
      return ApiResponse.success({
        success: false,
        summary: '无法解析AI返回的精修方案，请重试或调整指令。',
        nodeActions: [],
        rawResponse: response.content,
      })
    }

    return ApiResponse.success({
      success: true,
      summary: result.summary || '精修完成',
      explanation: result.explanation,
      nodeActions: result.nodeActions || [],
      model: response.model,
      usage: response.usage,
    })
  } catch (error) {
    console.error('Refine error:', error)
    return ApiResponse.error(error instanceof Error ? error.message : '精修请求失败', 500)
  }
}

// 生成详细的工作流配置上下文
function generateDetailedContext(config: WorkflowConfig): string {
  if (!config.nodes || config.nodes.length === 0) {
    return '当前工作流为空，没有任何节点。'
  }

  const nodeDescriptions = config.nodes.map((node: NodeConfig) => {
    const nodeConfig = node.config || {}
    let configSummary = ''

    if (node.type === 'INPUT') {
      const fields = (nodeConfig as { fields?: Array<{ name: string; type?: string; required?: boolean }> }).fields || []
      configSummary = `输入字段: ${fields.map(f => `${f.name}(${f.type || 'text'}${f.required ? ',必填' : ''})`).join(', ') || '无'}`
    } else if (node.type === 'PROCESS') {
      const proc = nodeConfig as { systemPrompt?: string; userPrompt?: string; model?: string; temperature?: number }
      configSummary = `模型: ${proc.model || '默认'}, temperature: ${proc.temperature || 0.7}
    系统提示词: ${proc.systemPrompt ? `"${proc.systemPrompt}"` : '未设置'}
    用户提示词: ${proc.userPrompt ? `"${proc.userPrompt}"` : '未设置'}`
    } else {
      configSummary = JSON.stringify(nodeConfig, null, 2)
    }

    return `节点 "${node.name}" (ID: ${node.id}, 类型: ${node.type}):
  配置:
${configSummary.split('\n').map(line => '    ' + line).join('\n')}`
  }).join('\n\n')

  const edgeDescriptions = config.edges.map(edge => {
    const sourceNode = config.nodes.find(n => n.id === edge.source)
    const targetNode = config.nodes.find(n => n.id === edge.target)
    return `${sourceNode?.name || edge.source} → ${targetNode?.name || edge.target}`
  }).join('\n')

  return `## 节点列表 (共${config.nodes.length}个):
${nodeDescriptions}

## 连接关系:
${edgeDescriptions || '无连接'}`
}

// 获取操作类型描述
function getOperationDescription(operation: string): string {
  const descriptions: Record<string, string> = {
    modify: '修改配置 - 用户想要修改指定节点的配置参数',
    add: '添加节点 - 用户想要在工作流中添加新节点',
    delete: '删除节点 - 用户想要从工作流中删除指定节点',
    reconnect: '调整连接 - 用户想要修改节点之间的连接关系',
  }
  return descriptions[operation] || operation
}
