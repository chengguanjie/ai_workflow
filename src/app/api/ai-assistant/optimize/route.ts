import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'
import type { WorkflowConfig, NodeConfig } from '@/types/workflow'
import { ApiResponse } from '@/lib/api/api-response'

const OPTIMIZATION_SYSTEM_PROMPT = `你是一个专业的工作流优化专家。你的任务是分析工作流的执行结果，诊断问题，并提出精确的优化方案。

## 分析框架

### 1. 执行状态诊断
- 识别成功执行的节点
- 识别失败的节点及失败原因
- 分析执行时间是否合理

### 2. 问题根因分析
对于每个失败或输出不符合预期的节点：

#### PROCESS节点常见问题：
- 系统提示词不够清晰或缺少关键指令
- 用户提示词变量引用错误（格式应为 {{节点名.字段名}}）
- temperature设置不当（太高导致输出不稳定，太低导致创意不足）
- maxTokens不足导致输出被截断

#### OUTPUT节点常见问题：
- 输出格式配置错误
- prompt中变量引用错误

#### CONDITION节点常见问题：
- 条件变量引用错误
- 操作符选择不当
- 比较值类型不匹配

#### HTTP节点常见问题：
- URL格式错误
- 认证配置缺失
- 请求体格式不正确

### 3. 输出质量评估
- 输出内容是否符合用户期望
- 输出格式是否正确
- 是否有遗漏或多余的内容

## 响应格式

你必须返回一个JSON格式的优化方案：

\`\`\`json
{
  "success": true/false,
  "summary": "总体分析概述",
  "issues": [
    {
      "nodeId": "节点ID",
      "nodeName": "节点名称",
      "issue": "具体问题描述",
      "suggestion": "建议的解决方案",
      "priority": "high/medium/low"
    }
  ],
  "nodeActions": [
    {
      "action": "update",
      "nodeId": "节点ID",
      "nodeName": "节点名称",
      "config": {
        "修改的配置项": "新的值"
      }
    }
  ],
  "requiresRetest": true/false,
  "expectedImprovement": "预期改进效果描述"
}
\`\`\`

## 优化原则

1. **精准定位** - 只修改有问题的配置，不要改动正常工作的部分
2. **最小改动** - 优先尝试小的调整，避免大规模重构
3. **渐进优化** - 每次只修复最关键的问题
4. **可解释性** - 清晰说明为什么这样修改

请用中文输出分析结果。`

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
      case 'OUTPUT':
        const out = nodeConfig as { format?: string; prompt?: string }
        configSummary = `格式: ${out.format || 'text'}, 提示词: ${out.prompt ? `"${out.prompt.slice(0, 100)}..."` : '未设置'}`
        break
      case 'CONDITION':
        const cond = nodeConfig as { conditions?: unknown[] }
        configSummary = `条件数量: ${cond.conditions?.length || 0}`
        break
      case 'HTTP':
        const http = nodeConfig as { method?: string; url?: string }
        configSummary = `方法: ${http.method || 'GET'}, URL: ${http.url || '未设置'}`
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

const AES_OPTIMIZATION_PROMPT = `你是一个专业的工作流优化专家。你的任务是根据 AES 评估报告，对工作流进行优化。

AES 评估包含五个维度：
- L - Logic (逻辑闭环)
- A - Agentic (智能深度)
- C - Context (落地语境)
- P - Prompt (指令质量)
- R - Robustness (鲁棒性)

你需要根据报告中指出的问题，生成具体的优化方案。

## 响应格式

你必须返回一个JSON格式的优化方案：

\`\`\`json
{
  "success": true,
  "summary": "根据 AES 评估结果生成的优化方案",
  "issues": [
    {
      "nodeId": "节点ID（如果报告未提供，请根据上下文推断或填null）",
      "nodeName": "节点名称",
      "issue": "问题描述",
      "suggestion": "解决方案",
      "priority": "high/medium/low"
    }
  ],
  "nodeActions": [
    {
      "action": "update",
      "nodeId": "节点ID",
      "nodeName": "节点名称",
      "config": {
        "修改的配置项": "新的值"
      }
    }
    // 可以包含 add, update, connect 操作
  ],
  "requiresRetest": true,
  "expectedImprovement": "预计改进效果描述"
}
\`\`\`

## 优化原则

1. **精准修复** - 重点解决 AES 报告中提到的 high/medium 级别问题。
2. **Robustness 优先** - 确保增加错误处理（如 Condition 节点检查状态）。
3. **Prompt 优化** - 改进 System Prompt 以符合 P 维度要求。

请用中文输出。`

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
      userContent += `\n\n## 用户期望目标\n${targetCriteria}`
    }

    if (previousOptimizations.length > 0) {
      userContent += `\n\n## 之前的优化历史\n以下是之前已尝试的优化，请避免重复相同的修改：\n${JSON.stringify(previousOptimizations, null, 2)}`
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
        temperature: 0.3,
        maxTokens: 4096,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    let optimization
    try {
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/)
      if (jsonMatch) {
        optimization = JSON.parse(jsonMatch[1])
      } else {
        optimization = JSON.parse(response.content)
      }
    } catch {
      optimization = {
        success: false,
        summary: response.content,
        issues: [],
        nodeActions: [],
        requiresRetest: false,
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
