import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'

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

// 构建字段描述
function buildFieldsDescription(inputFields: Array<{
  fieldId: string
  fieldName: string
  fieldType: string
  placeholder?: string
  required?: boolean
  description?: string
  options?: Array<{ label: string; value: string }>
}>): string {
  if (!inputFields || inputFields.length === 0) {
    return '暂无输入字段'
  }

  return inputFields.map((field, index) => {
    const typeLabel = FIELD_TYPE_LABELS[field.fieldType] || field.fieldType
    let desc = `${index + 1}. **${field.fieldName}** (${typeLabel})`
    if (field.required) desc += ' [必填]'
    if (field.description) desc += `\n   描述：${field.description}`
    if (field.placeholder) desc += `\n   占位符：${field.placeholder}`
    if (field.options && field.options.length > 0) {
      desc += `\n   选项：${field.options.map(o => o.label).join('、')}`
    }
    return desc
  }).join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const {
      formName,           // 表单名称
      formDescription,    // 表单描述
      workflowName,       // 工作流名称
      workflowDescription,// 工作流描述
      inputFields,        // 输入字段列表
      stylePrompt,        // 用户的风格描述
      organizationName,   // 组织名称
      organizationLogo,   // 组织 Logo URL
    } = body

    if (!inputFields || inputFields.length === 0) {
      return NextResponse.json({ error: '没有可用的输入字段' }, { status: 400 })
    }

    if (!stylePrompt || !stylePrompt.trim()) {
      return NextResponse.json({ error: '请输入风格描述' }, { status: 400 })
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

    // 构建字段描述
    const fieldsDescription = buildFieldsDescription(inputFields)

    // 构建系统提示词
    const systemPrompt = `你是一个专业的前端开发和UI设计专家。你的任务是根据用户提供的表单字段和风格要求，生成一个美观、现代的HTML表单页面。

## 你的能力
1. 精通HTML5、CSS3、响应式设计
2. 擅长创建美观的用户界面
3. 理解无障碍设计原则
4. 能够根据用户描述创建独特的视觉风格

## 输出格式（重要！）
请分别用HTML和CSS代码块输出，格式如下：

\`\`\`html
<!-- HTML内容放这里 -->
\`\`\`

\`\`\`css
/* CSS样式放这里 */
\`\`\`

## HTML结构要求
1. 只需要表单内容部分，不要包含<html>、<head>、<body>标签
2. 使用语义化HTML标签
3. 每个字段使用 data-field-id="字段ID" 属性标识
4. 文本输入使用 <input type="text" name="字段名">
5. 单选下拉使用 <select name="字段名">...</select>
6. 多选使用多个 <input type="checkbox" name="字段名" value="选项值">
7. 文件上传使用 <input type="file" name="字段名" data-field-type="字段类型">
8. 提交按钮使用 <button type="submit">...</button>
9. 必填字段添加 required 属性

## CSS要求
1. 使用CSS变量便于主题定制
2. 实现响应式设计
3. 添加优雅的过渡动画
4. 保持良好的可读性和对比度
5. 不要使用外部资源（图片、字体等都需要使用内联或标准系统字体）

## 重要提示
- 必须同时输出HTML和CSS两个代码块
- 不要输出JSON格式
- 不要添加其他解释性文字`

    // 构建用户提示词
    const userPrompt = `## 表单信息
- 表单名称：${formName || '未命名表单'}
- 表单描述：${formDescription || '无'}
- 工作流名称：${workflowName || '未命名工作流'}
- 工作流描述：${workflowDescription || '无'}
- 组织名称：${organizationName || ''}
${organizationLogo ? `- 组织Logo：${organizationLogo}` : ''}

## 表单字段
${fieldsDescription}

## 用户的风格要求
${stylePrompt}

请根据以上信息，生成一个美观的HTML表单页面。请分别用 \`\`\`html 和 \`\`\`css 代码块输出。`

    // 调用AI生成内容
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const selectedModel = apiKey.defaultModel || 'deepseek/deepseek-chat'
    console.log('Calling AI with provider:', apiKey.provider, 'model:', selectedModel)

    let response
    try {
      response = await aiService.chat(
        apiKey.provider,
        {
          model: selectedModel,
          messages,
          temperature: 0.8,
          maxTokens: 4000,
        },
        decryptApiKey(apiKey.keyEncrypted),
        apiKey.baseUrl || undefined
      )
    } catch (aiError) {
      console.error('AI service call failed:', aiError)
      return NextResponse.json(
        { error: `AI服务调用失败: ${aiError instanceof Error ? aiError.message : '未知错误'}` },
        { status: 500 }
      )
    }

    // 解析AI返回的内容
    let result: { html: string; css: string }
    try {
      const content = response.content.trim()
      console.log('AI response length:', content.length)
      console.log('AI response first 500 chars:', content.substring(0, 500))

      // 方法1: 尝试直接从代码块中提取HTML和CSS
      // 支持多种格式：```html、``` html、```HTML 等
      const htmlMatch = content.match(/```\s*html\s*\n([\s\S]*?)\n```/i) ||
                        content.match(/```\s*html\s*\r?\n([\s\S]*?)\r?\n```/i)
      const cssMatch = content.match(/```\s*css\s*\n([\s\S]*?)\n```/i) ||
                       content.match(/```\s*css\s*\r?\n([\s\S]*?)\r?\n```/i)

      console.log('HTML match found:', !!htmlMatch)
      console.log('CSS match found:', !!cssMatch)

      if (htmlMatch && cssMatch) {
        result = {
          html: htmlMatch[1].trim(),
          css: cssMatch[1].trim()
        }
        console.log('Extracted HTML length:', result.html.length)
        console.log('Extracted CSS length:', result.css.length)
      } else if (htmlMatch) {
        // 只找到 HTML，尝试提取内联 style
        console.log('Only HTML found, extracting inline styles...')
        const htmlContent = htmlMatch[1].trim()

        // 尝试从 HTML 中提取 <style> 标签内容
        const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        result = {
          html: styleMatch ? htmlContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim() : htmlContent,
          css: styleMatch ? styleMatch[1].trim() : '/* No CSS provided */'
        }
      } else {
        // 方法2: 尝试解析JSON格式
        console.log('Trying JSON parsing...')
        let jsonStr = content

        // 提取JSON代码块
        const jsonCodeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (jsonCodeBlockMatch) {
          jsonStr = jsonCodeBlockMatch[1].trim()
          console.log('Found JSON code block')
        } else {
          // 提取 { ... } JSON对象
          const jsonObjectMatch = content.match(/\{[\s\S]*\}/)
          if (jsonObjectMatch) {
            jsonStr = jsonObjectMatch[0]
            console.log('Found JSON object')
          }
        }

        result = JSON.parse(jsonStr)
      }

      if (!result.html) {
        throw new Error('响应缺少html字段')
      }

      // 如果没有 CSS，提供一个默认的
      if (!result.css) {
        result.css = '/* No CSS provided by AI */'
      }
    } catch (parseError) {
      console.error('Parse AI response error:', parseError)
      console.error('AI response preview:', response.content.substring(0, 1000))
      console.error('AI response end:', response.content.substring(Math.max(0, response.content.length - 500)))
      return NextResponse.json(
        { error: 'AI返回格式错误，请重试。如果问题持续，请尝试简化风格描述。' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      html: result.html,
      css: result.css,
    })
  } catch (error) {
    console.error('Generate form HTML error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    )
  }
}
