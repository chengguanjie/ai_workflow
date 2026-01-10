/**
 * AI Test Data Generation API
 *
 * POST /api/workflows/[id]/generate-test-data - Generate test data using AI
 *
 * This API generates test data for workflow input fields using AI.
 * It analyzes field definitions (name, type, description, options) and
 * generates appropriate test values.
 *
 * Requirements: 5.1, 5.2, 5.4
 *
 * Error Handling (Requirement 5.4):
 * - Returns user-friendly error messages when AI generation fails
 * - Provides fallback data generation when AI is unavailable
 * - Includes error codes for frontend to handle different failure scenarios
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { aiService } from '@/lib/ai'
import { safeDecryptApiKey } from '@/lib/crypto'
import { z } from 'zod'
import type { InputFieldType } from '@/types/workflow'

/**
 * Input field definition for test data generation
 */
interface FieldDefinition {
  name: string
  type: InputFieldType
  description?: string
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  required?: boolean
}

/**
 * Request body schema
 */
const generateTestDataSchema = z.object({
  fields: z.array(
    z.object({
      name: z.string().min(1),
      type: z.enum([
        'text',
        'image',
        'pdf',
        'word',
        'excel',
        'audio',
        'video',
        'select',
        'multiselect',
      ]),
      description: z.string().optional(),
      options: z
        .array(
          z.object({
            label: z.string(),
            value: z.string(),
          })
        )
        .optional(),
      placeholder: z.string().optional(),
      required: z.boolean().optional(),
    })
  ),
})

/**
 * Response type
 */
interface GenerateTestDataResponse {
  data: Record<string, string>
  isAIGenerated: boolean
  isFallback?: boolean
  warnings?: string[]
}

/**
 * Generate fallback test data when AI is unavailable
 * This provides basic placeholder data based on field types
 */
function generateFallbackData(fields: FieldDefinition[]): Record<string, string> {
  const data: Record<string, string> = {}

  for (const field of fields) {
    switch (field.type) {
      case 'text':
        data[field.name] = field.placeholder || `测试${field.name}`
        break
      case 'image':
        data[field.name] = 'https://picsum.photos/800/600'
        break
      case 'select':
        if (field.options && field.options.length > 0) {
          data[field.name] = field.options[0].value
        } else {
          data[field.name] = ''
        }
        break
      case 'multiselect':
        if (field.options && field.options.length > 0) {
          data[field.name] = field.options[0].value
        } else {
          data[field.name] = ''
        }
        break
      case 'pdf':
      case 'word':
      case 'excel':
        data[field.name] = `示例${field.type.toUpperCase()}文件`
        break
      case 'audio':
        data[field.name] = '示例音频文件'
        break
      case 'video':
        data[field.name] = '示例视频文件'
        break
      default:
        data[field.name] = ''
    }
  }

  return data
}

/**
 * Build AI prompt for test data generation
 */
function buildTestDataPrompt(fields: FieldDefinition[]): {
  systemPrompt: string
  userPrompt: string
} {
  const systemPrompt = `你是一个专业的测试数据生成助手。你的任务是根据字段定义生成合理的测试数据。

## 输出要求
1. 输出必须是有效的 JSON 对象
2. JSON 对象的键必须与输入字段的 name 完全匹配
3. 根据字段类型生成合适的值：
   - text: 生成有意义的文本内容，与字段名称和描述相关
   - select: 从提供的选项中选择一个有效值（使用 value 而非 label）
   - multiselect: 从提供的选项中选择一个或多个有效值，用逗号分隔
   - image: 生成一个示例图片 URL（使用 https://picsum.photos/800/600 格式）
   - pdf/word/excel: 生成一个示例文件描述（因为无法生成实际文件）
   - audio/video: 生成一个示例媒体描述（因为无法生成实际文件）
4. 生成的数据应该是真实、合理的测试数据
5. 不要添加任何解释或额外文本，只输出 JSON

## 重要
- 只输出 JSON 对象，不要包含 markdown 代码块标记
- 确保 JSON 格式正确，可以被直接解析`

  const fieldDescriptions = fields.map((field) => {
    let desc = `- ${field.name} (类型: ${field.type})`
    if (field.description) {
      desc += `\n  描述: ${field.description}`
    }
    if (field.placeholder) {
      desc += `\n  提示: ${field.placeholder}`
    }
    if (field.required !== undefined) {
      desc += `\n  必填: ${field.required ? '是' : '否'}`
    }
    if (field.options && field.options.length > 0) {
      const optionsList = field.options
        .map((opt) => `${opt.label}(${opt.value})`)
        .join(', ')
      desc += `\n  可选值: ${optionsList}`
    }
    return desc
  })

  const userPrompt = `请为以下字段生成测试数据：

${fieldDescriptions.join('\n\n')}

请直接输出 JSON 对象：`

  return { systemPrompt, userPrompt }
}

/**
 * Parse AI response to extract JSON data
 */
function parseAIResponse(content: string): Record<string, string> {
  // Try to extract JSON from the response
  let jsonStr = content.trim()

  // Remove markdown code block if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }
  jsonStr = jsonStr.trim()

  try {
    const parsed = JSON.parse(jsonStr)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('AI 返回的数据格式不正确，期望 JSON 对象')
    }

    // Convert all values to strings
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value === null || value === undefined) {
        result[key] = ''
      } else if (typeof value === 'object') {
        result[key] = JSON.stringify(value)
      } else {
        result[key] = String(value)
      }
    }

    return result
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`AI 返回的 JSON 格式无效: ${error.message}`)
    }
    throw error
  }
}

/**
 * Validate generated data against field definitions
 */
function validateGeneratedData(
  data: Record<string, string>,
  fields: FieldDefinition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const field of fields) {
    const value = data[field.name]

    // Check if required field is missing
    if (field.required && (value === undefined || value === '')) {
      errors.push(`必填字段 "${field.name}" 缺少值`)
      continue
    }

    // Skip validation for empty optional fields
    if (value === undefined || value === '') {
      continue
    }

    // Validate select fields
    if (field.type === 'select' && field.options && field.options.length > 0) {
      const validValues = field.options.map((opt) => opt.value)
      if (!validValues.includes(value)) {
        errors.push(
          `字段 "${field.name}" 的值 "${value}" 不在有效选项中`
        )
      }
    }

    // Validate multiselect fields
    if (field.type === 'multiselect' && field.options && field.options.length > 0) {
      const validValues = field.options.map((opt) => opt.value)
      const selectedValues = value.split(',').map((v) => v.trim())
      for (const selected of selectedValues) {
        if (selected && !validValues.includes(selected)) {
          errors.push(
            `字段 "${field.name}" 的值 "${selected}" 不在有效选项中`
          )
        }
      }
    }

    // Validate image URL format
    if (field.type === 'image' && value) {
      try {
        new URL(value)
      } catch {
        errors.push(`字段 "${field.name}" 的图片 URL 格式无效`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * POST /api/workflows/[id]/generate-test-data
 * Generate test data for workflow input fields using AI
 */
export const POST = withAuth<ApiSuccessResponse<GenerateTestDataResponse>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<GenerateTestDataResponse>>> => {
    const workflowId = params?.id

    if (!workflowId) {
      throw new NotFoundError('工作流ID不能为空')
    }

    // Verify workflow exists and user has access
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      select: { id: true, name: true },
    })

    if (!workflow) {
      throw new NotFoundError('工作流不存在或无权访问')
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = generateTestDataSchema.safeParse(body)

    if (!parseResult.success) {
      throw new ValidationError(
        '请求参数无效',
        { errors: parseResult.error.issues }
      )
    }

    const { fields } = parseResult.data

    if (fields.length === 0) {
      throw new ValidationError('字段列表不能为空')
    }

    // Get AI configuration
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        organizationId: user.organizationId,
        isDefault: true,
        isActive: true,
      },
    })

    if (!apiKey) {
      // Fallback: Return placeholder data when AI is not configured
      console.warn('[Generate Test Data] No AI config, using fallback data')
      const fallbackData = generateFallbackData(fields as FieldDefinition[])
      return ApiResponse.success({
        data: fallbackData,
        isAIGenerated: false,
        isFallback: true,
        warnings: ['未配置 AI 服务，已生成占位测试数据。请在设置中配置 AI 服务商以获得更智能的测试数据。'],
      })
    }

    // Build prompt and call AI
    const { systemPrompt, userPrompt } = buildTestDataPrompt(fields as FieldDefinition[])

    try {
      const response = await aiService.chat(
        apiKey.provider,
        {
          model: apiKey.defaultModel || 'deepseek/deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          maxTokens: 2000,
        },
        safeDecryptApiKey(apiKey.keyEncrypted),
        apiKey.baseUrl || undefined
      )

      // Parse AI response
      const generatedData = parseAIResponse(response.content)

      // Validate generated data
      const validation = validateGeneratedData(generatedData, fields as FieldDefinition[])

      const result: GenerateTestDataResponse = {
        data: generatedData,
        isAIGenerated: true,
      }

      if (!validation.valid) {
        console.warn(
          '[Generate Test Data] Validation warnings:',
          validation.errors
        )
        // Include warnings in response for frontend to display
        result.warnings = validation.errors
      }

      return ApiResponse.success(result)
    } catch (error) {
      console.error('[Generate Test Data] AI call failed:', error)

      // Determine error type and provide appropriate fallback
      let errorMessage = 'AI 生成测试数据失败'

      if (error instanceof Error) {
        const message = error.message.toLowerCase()
        if (message.includes('timeout') || message.includes('timed out')) {
          errorMessage = 'AI 服务响应超时'
        } else if (message.includes('rate limit') || message.includes('too many requests')) {
          errorMessage = 'AI 服务请求频率超限，请稍后重试'
        } else if (message.includes('invalid') || message.includes('parse')) {
          errorMessage = 'AI 返回的数据格式无效'
        } else {
          errorMessage = error.message
        }
      }

      // Return fallback data with error information
      const fallbackData = generateFallbackData(fields as FieldDefinition[])
      return ApiResponse.success({
        data: fallbackData,
        isAIGenerated: false,
        isFallback: true,
        warnings: [`${errorMessage}，已生成占位测试数据。您可以手动修改或稍后重试。`],
      })
    }
  }
)
