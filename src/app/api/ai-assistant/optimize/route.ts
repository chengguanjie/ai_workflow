import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'
import type { WorkflowConfig, NodeConfig } from '@/types/workflow'
import { ApiResponse } from '@/lib/api/api-response'
import {
  OPTIMIZATION_SYSTEM_PROMPT,
  AES_OPTIMIZATION_PROMPT,
  OptimizationResult
} from '@/lib/workflow/auto-optimizer'
import { validateWorkflowActions } from '@/lib/workflow/generator'

function generateWorkflowContext(config: WorkflowConfig): string {
  if (!config.nodes || config.nodes.length === 0) {
    return '当前工作流为空，没有任何节点。'
  }

  const nodeDescriptions = config.nodes.map((node: NodeConfig) => {
    const nodeConfig = node.config || {}
    let configSummary = ''

    switch (node.type) {
      case 'INPUT':
        const fields = (nodeConfig as { fields?: Array<{ name: string }> }).fields || []
        configSummary = `输入字段: ${fields.map(f => f.name).join(', ') || '无'}`
        break
      case 'PROCESS':
        const proc = nodeConfig as { systemPrompt?: string; userPrompt?: string; model?: string; temperature?: number }
        configSummary = `模型: ${proc.model || '默认'}, temperature: ${proc.temperature || 0.7}, 系统提示词: ${proc.systemPrompt ? `"${proc.systemPrompt.slice(0, 100)}..."` : '未设置'}, 用户提示词: ${proc.userPrompt ? `"${proc.userPrompt.slice(0, 100)}..."` : '未设置'}`
        break
      default:
        configSummary = JSON.stringify(nodeConfig).slice(0, 200)
    }

    return `节点 "${node.name}" (ID: ${node.id}, 类型: ${node.type}):\n  配置: ${configSummary}`
  }).join('\n\n')

  const edgeDescriptions = config.edges.map(edge => {
    const sourceNode = config.nodes.find(n => n.id === edge.source)
    const targetNode = config.nodes.find(n => n.id === edge.target)
    return `${sourceNode?.name || edge.source} → ${targetNode?.name || edge.target}`
  }).join('\n')

  return `## 工作流配置

### 节点 (${config.nodes.length}个):
${nodeDescriptions}

### 连接关系:
${edgeDescriptions || '无连接'}`
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const {
      workflowId,
      testResult,
      aesDiagnosis,
      targetCriteria,
      model,
      previousOptimizations = [],
      optimizationDirection, // 'performance' | 'quality' | 'structure' | 'auto'
      multipleSchemes = false, // 是否返回多个方案
    } = body

    if (!workflowId) {
      return ApiResponse.error('工作流ID不能为空', 400)
    }

    if (!testResult && !aesDiagnosis) {
      return ApiResponse.error('测试结果或AES评估报告不能为空', 400)
    }

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
      return ApiResponse.error('未配置AI服务', 400)
    }

    const workflowContext = generateWorkflowContext(config)

    let userContent = ''
    let systemPrompt = OPTIMIZATION_SYSTEM_PROMPT

    if (aesDiagnosis) {
      systemPrompt = AES_OPTIMIZATION_PROMPT
      userContent = `请根据以下 AES 评估报告对工作流进行优化。

${workflowContext}

## AES 评估报告
\`\`\`json
${JSON.stringify(aesDiagnosis, null, 2)}
\`\`\``
    } else {
      userContent = `请分析以下工作流的测试执行结果，并提出优化方案。

${workflowContext}

## 测试执行结果
\`\`\`json
${JSON.stringify(testResult, null, 2)}
\`\`\``
    }

    if (targetCriteria) {
      userContent += `\n\n## 用户期望目标 Requirement Criteria \n${targetCriteria}\n\n重要：请仔细对比"测试结果"是否满足"用户期望目标"。如果完全满足，请在 return JSON 中将 "isGoalMet" 设为 true。如果不满足，请分析差距并提供优化 action。`
    }

    // 根据优化方向添加额外提示
    if (optimizationDirection && optimizationDirection !== 'auto') {
      const directionPrompts: Record<string, string> = {
        performance: `
## 优化方向：性能优化
重点关注以下方面：
- 减少不必要的API调用和token消耗
- 合并可以并行执行的节点
- 优化提示词长度，移除冗余内容
- 减少数据在节点间的传递开销`,
        quality: `
## 优化方向：质量优化
重点关注以下方面：
- 改进提示词以获得更准确的输出
- 添加必要的验证和错误处理节点
- 完善输出格式和结构
- 增强上下文传递以保证输出连贯性`,
        structure: `
## 优化方向：结构优化
重点关注以下方面：
- 简化工作流结构，移除不必要的节点
- 合并功能相似的节点
- 拆分过于复杂的节点
- 优化节点连接逻辑，减少分支复杂度`,
      }
      userContent += directionPrompts[optimizationDirection] || ''
    }

    // 如果需要多方案，添加相应提示
    if (multipleSchemes) {
      userContent += `

## 多方案要求
请提供2-3个不同的优化方案，每个方案侧重不同的优化目标。返回格式应为：
\`\`\`json
{
  "schemes": [
    {
      "name": "方案名称",
      "description": "方案描述",
      "focus": "优化侧重点",
      "issues": [...],
      "nodeActions": [...],
      "expectedImprovement": "预期改进效果"
    }
  ],
  "recommendation": 0, // 推荐方案索引
  "summary": "方案对比总结"
}
\`\`\``
    }

    if (previousOptimizations.length > 0) {
      userContent += `\n\n## 之前的优化历史 (Previous Attempts)\n以下是之前已尝试的优化（以及它们未能完全解决问题），请避免重复完全相同的无效修改，尝试新的策略：\n${JSON.stringify(previousOptimizations, null, 2)}`
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]

    const selectedModel = modelName || apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.5, // 稍微降低温度以保证逻辑性
        maxTokens: 4096,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    let optimization: OptimizationResult
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/)
      const contentToParse = jsonMatch ? jsonMatch[1] : response.content
      optimization = JSON.parse(contentToParse)

      // 验证生成的 nodeActions
      if (optimization.nodeActions && Array.isArray(optimization.nodeActions)) {
        const validation = validateWorkflowActions(optimization.nodeActions)
        if (!validation.valid) {
          optimization.summary += `\n\n[系统警告] 生成的优化操作存在隐患: ${validation.errors.join('; ')}`
          // 可以选择过滤掉危险操作，或者只是标记
        }
      }

    } catch (e) {
      console.error('Failed to parse optimization response:', e)
      optimization = {
        success: false,
        summary: "无法解析AI返回的优化方案，请重试。",
        issues: [],
        nodeActions: []
      }
    }

    return ApiResponse.success({
      success: true,
      optimization,
      model: response.model,
      usage: response.usage,
    })
  } catch (error) {
    console.error('Optimization error:', error)
    return ApiResponse.error(error instanceof Error ? error.message : '优化分析失败', 500)
  }
}
