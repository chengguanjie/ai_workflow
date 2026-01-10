import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'
import { ApiResponse } from '@/lib/api/api-response'

// 字段类型中文映射
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: '文本输入',
  select: '单选下拉',
  multiselect: '多选复选框',
  image: '图片上传',
  pdf: 'PDF上传',
  word: 'Word文档上传',
  excel: 'Excel表格上传',
  audio: '音频上传',
  video: '视频上传',
}

function buildFieldsDescription(
  inputFields: Array<{
    fieldId: string
    fieldName: string
    fieldType: string
    placeholder?: string
    required?: boolean
    description?: string
    options?: Array<{ label: string; value: string }>
  }>
): string {
  if (!inputFields || inputFields.length === 0) {
    return '暂无输入字段'
  }

  return inputFields
    .map((field, index) => {
      const typeLabel = FIELD_TYPE_LABELS[field.fieldType] || field.fieldType
      let desc = `${index + 1}. **${field.fieldName}** (${typeLabel})`
      if (field.required) desc += ' [必填]'
      if (field.description) desc += `\n   描述：${field.description}`
      if (field.placeholder) desc += `\n   占位符：${field.placeholder}`
      if (field.options && field.options.length > 0) {
        desc += `\n   选项：${field.options.map(o => o.label).join('、')}`
      }
      return desc
    })
    .join('\n')
}

function extractCodeBlock(content: string, lang: 'html' | 'css'): string | null {
  const match = content.match(new RegExp(String.raw`\\\`\\\`\\\`\\s*${lang}\\s*\\r?\\n([\\s\\S]*?)\\r?\\n\\\`\\\`\\\``, 'i'))
  return match?.[1]?.trim() || null
}

function stripCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, '').trim()
}

/**
 * POST /api/ai/refine-form-html
 * 基于现有 HTML/CSS + 用户指令，迭代生成 AI 网页模板
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.organizationId) {
      return ApiResponse.error('未授权', 401)
    }

    const body = await request.json()
    const {
      formName,
      formDescription,
      workflowName,
      workflowDescription,
      inputFields,
      stylePrompt,
      sampleOutput,
      currentHtml,
      currentCss,
      userRequest,
      organizationName,
      organizationLogo,
    } = body as {
      formName?: string
      formDescription?: string
      workflowName?: string
      workflowDescription?: string
      inputFields?: Array<{
        fieldId: string
        fieldName: string
        fieldType: string
        placeholder?: string
        required?: boolean
        description?: string
        options?: Array<{ label: string; value: string }>
      }>
      stylePrompt?: string
      sampleOutput?: string
      currentHtml?: string
      currentCss?: string
      userRequest?: string
      organizationName?: string
      organizationLogo?: string
    }

    if (!inputFields || inputFields.length === 0) {
      return ApiResponse.error('没有可用的输入字段', 400)
    }
    if (!currentHtml || typeof currentHtml !== 'string' || !currentHtml.trim()) {
      return ApiResponse.error('缺少 currentHtml', 400)
    }
    if (!userRequest || typeof userRequest !== 'string' || !userRequest.trim()) {
      return ApiResponse.error('请输入调整要求', 400)
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

    const fieldsDescription = buildFieldsDescription(inputFields)

    const systemPrompt = `你是一个专业的前端开发与UI设计专家。你的任务是：在不破坏功能的前提下，根据用户的调整要求，修改“现有 HTML 表单模板”和“现有 CSS”，输出更新后的 HTML 与 CSS。

## 重要约束（必须遵守）
1. 不要引入 <script>、事件属性（onclick 等）或外部资源（外链字体、外链图片、CDN JS/CSS）
2. 不要输出 <html>/<head>/<body> 标签，只输出表单内容片段
3. 每个输入字段必须保留 data-field-id="字段ID" 标识（或保持 name 属性对应字段名），以便系统采集提交数据
4. 必须包含一个 <form>，并包含 <button type="submit"> 提交按钮
5. 如果用户希望展示结果，请在页面中包含一个输出容器：<div data-output-container></div>
   - 可选：为特定输出字段预留占位元素，如 <div data-output-key="某个输出键"></div>
   - 系统会在提交后将执行结果注入这些占位区域（以纯文本/链接形式）

## 输出格式（重要！）
先给出一段很短的修改说明（1-6行），然后分别用 HTML 和 CSS 代码块输出：

\`\`\`html
<!-- HTML内容放这里 -->
\`\`\`

\`\`\`css
/* CSS样式放这里 */
\`\`\`

不要输出 JSON。不要输出除“修改说明 + 两个代码块”之外的内容。`

    const userPrompt = `## 表单信息
- 表单名称：${formName || '未命名表单'}
- 表单描述：${formDescription || '无'}
- 工作流名称：${workflowName || '未命名工作流'}
- 工作流描述：${workflowDescription || '无'}
- 组织名称：${organizationName || ''}
${organizationLogo ? `- 组织Logo：${organizationLogo}` : ''}

## 表单字段
${fieldsDescription}

${stylePrompt ? `## 原始风格要求\n${stylePrompt}\n` : ''}

${sampleOutput ? `## 示例输出（用于设计结果展示区域）\n${sampleOutput}\n` : ''}

## 现有 HTML
\`\`\`html
${currentHtml}
\`\`\`

## 现有 CSS
\`\`\`css
${currentCss || '/* (empty) */'}
\`\`\`

## 用户的调整要求
${userRequest}

请根据以上要求，输出更新后的 HTML 与 CSS。`

    const selectedModel = apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 4000,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    const content = (response.content || '').trim()
    const html = extractCodeBlock(content, 'html')
    const css = extractCodeBlock(content, 'css')
    if (!html) {
      return ApiResponse.error('AI返回格式错误（缺少 HTML 代码块），请重试', 500)
    }

    const explanation = stripCodeBlocks(content)

    return ApiResponse.success({
      html,
      css: css || '/* No CSS provided by AI */',
      explanation,
    })
  } catch (error) {
    console.error('Refine form HTML error:', error)
    return ApiResponse.error(error instanceof Error ? error.message : '调整失败', 500)
  }
}

