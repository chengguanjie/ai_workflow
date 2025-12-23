import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'
import { ApiResponse } from '@/lib/api/api-response'

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

// 字段类型描述映射
const FIELD_TYPE_DESCRIPTIONS: Record<string, string> = {
  systemPrompt: '系统提示词 - 用于设定AI的角色 and 行为方式',
  userPrompt: '用户提示词 - AI处理的具体指令，可引用其他节点的输出',
  prompt: '提示词 - 指导AI生成内容的指令',
  imagePrompt: '图像描述提示词 - 用于AI图像生成的详细描述',
  negativePrompt: '负面提示词 - 描述不希望出现在图像中的元素',
  mediaPrompt: '媒体处理提示词 - 描述如何处理视频、音频或数据文件',
  videoPrompt: '视频生成提示词 - 用于AI视频生成的详细描述',
  audioPrompt: '音频处理提示词 - 用于音频转换或语音合成的指令',
  content: '内容 - 知识库或数据内容',
  code: '代码 - 可执行的代码逻辑',
  url: 'URL - 请求地址',
  httpBody: 'HTTP请求体 - JSON或文本格式的请求数据',
  body: '请求体 - HTTP请求的数据内容',
  notificationContent: '通知消息内容 - 发送到飞书/钉钉/企业微信的消息',
  condition: '条件表达式 - 用于分支判断的条件',
  template: '模板 - 用于格式化输出的模板',
  default: '文本内容',
}

// 构建工作流上下文描述
function buildWorkflowContext(workflowContext: {
  workflowName?: string
  workflowDescription?: string
  nodes?: Array<{
    id: string
    name: string
    type: string
    config?: Record<string, unknown>
  }>
  currentNodeId?: string
  currentNodeName?: string
  currentNodeType?: string
}): string {
  const {
    workflowName,
    workflowDescription,
    nodes = [],
    currentNodeId,
    currentNodeName,
    currentNodeType,
  } = workflowContext

  let context = '## 工作流信息\n'
  if (workflowName) context += `- 名称：${workflowName}\n`
  if (workflowDescription) context += `- 描述：${workflowDescription}\n`

  // 找到当前节点在工作流中的位置
  const currentNodeIndex = nodes.findIndex(n => n.id === currentNodeId)

  // 获取前置节点信息（当前节点之前的节点）
  const predecessorNodes = nodes.slice(0, Math.max(0, currentNodeIndex))

  if (predecessorNodes.length > 0) {
    context += '\n## 前置节点\n'
    predecessorNodes.forEach((node, index) => {
      const nodeTypeName = NODE_TYPE_NAMES[node.type] || node.type
      context += `${index + 1}. **${node.name}** (${nodeTypeName})\n`

      // 添加关键配置信息
      if (node.config) {
        if (node.type === 'INPUT' && node.config.fields) {
          const fields = node.config.fields as Array<{ name: string; fieldType?: string }>
          context += `   - 输入字段：${fields.map(f => f.name).join('、')}\n`
        }
        if (node.type === 'PROCESS') {
          if (node.config.systemPrompt) {
            const sp = String(node.config.systemPrompt)
            context += `   - 系统提示词：${sp.substring(0, 100)}${sp.length > 100 ? '...' : ''}\n`
          }
          if (node.config.userPrompt) {
            const up = String(node.config.userPrompt)
            context += `   - 用户提示词：${up.substring(0, 100)}${up.length > 100 ? '...' : ''}\n`
          }
        }
      }
    })
  }

  // 当前节点信息
  if (currentNodeName && currentNodeType) {
    const nodeTypeName = NODE_TYPE_NAMES[currentNodeType] || currentNodeType
    context += `\n## 当前节点\n- 名称：${currentNodeName}\n- 类型：${nodeTypeName}\n`
  }

  return context
}

// 根据字段类型构建提示词
function buildPromptForFieldType(
  fieldType: string,
  currentContent: string,
  workflowContext: string,
  availableReferences: string[]
): { systemPrompt: string; userPrompt: string } {
  const fieldDescription = FIELD_TYPE_DESCRIPTIONS[fieldType] || FIELD_TYPE_DESCRIPTIONS.default

  const systemPrompt = `你是一个专业的AI工作流配置助手。你的任务是帮助用户生成或优化工作流节点中的文本内容。

## 你的能力
1. 根据工作流上下文，理解用户的需求
2. 生成符合字段类型要求的内容
3. 优化用户已填写的内容，使其更加完善和专业

## 输出要求
- 直接输出内容，不要添加任何前缀、解释或格式标记
- 如果是提示词类型，确保清晰、具体、可执行
- 如果需要引用其他节点的输出，使用 {{节点名.字段名}} 或 {{节点名}} 格式
- 保持内容简洁明了，避免冗余

## 可用的节点引用
${availableReferences.length > 0 ? availableReferences.join('\n') : '暂无可用引用'}
`

  let userPrompt = ''

  if (currentContent && currentContent.trim()) {
    // 优化模式
    userPrompt = `${workflowContext}

## 任务
请优化以下「${fieldDescription}」的内容，使其更加完善和专业：

---
${currentContent}
---

优化方向：
1. 保持原有意图不变
2. 让表述更加清晰准确
3. 如果适合，可以添加必要的细节
4. 确保引用格式正确（如有使用）

请直接输出优化后的内容：`
  } else {
    // 生成模式
    userPrompt = `${workflowContext}

## 任务
请根据上述工作流上下文，为当前节点生成合适的「${fieldDescription}」内容。

要求：
1. 内容要与工作流的整体目标一致
2. 合理利用前置节点的输出（使用 {{节点名.字段名}} 格式引用）
3. 内容要清晰、具体、可执行

请直接输出生成的内容：`
  }

  return { systemPrompt, userPrompt }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const {
      fieldType,          // 字段类型：systemPrompt, userPrompt, prompt, content, etc.
      currentContent,     // 当前内容（如果有）
      workflowContext,    // 工作流上下文
      availableReferences // 可用的节点引用列表
    } = body

    if (!fieldType) {
      return ApiResponse.error('缺少字段类型', 400)
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
      return ApiResponse.error('未配置AI服务，请先在设置中配置AI服务商', 400)
    }

    // 构建工作流上下文描述
    const contextDescription = buildWorkflowContext(workflowContext || {})

    // 构建提示词
    const { systemPrompt, userPrompt } = buildPromptForFieldType(
      fieldType,
      currentContent || '',
      contextDescription,
      availableReferences || []
    )

    // 调用AI生成内容
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const selectedModel = apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.7,
        maxTokens: 2000,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    return ApiResponse.success({
      content: response.content.trim(),
      isOptimization: Boolean(currentContent && currentContent.trim()),
    })
  } catch (error) {
    console.error('Generate field content error:', error)
    return ApiResponse.error(error instanceof Error ? error.message : '生成内容失败', 500)
  }
}
