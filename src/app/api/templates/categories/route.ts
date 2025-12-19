/**
 * 模板分类 API
 *
 * GET /api/templates/categories - 获取模板分类列表
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'

/**
 * 模板分类定义
 */
const TEMPLATE_CATEGORIES = [
  { id: 'ai-processing', name: 'AI处理', icon: 'Brain', description: '使用AI进行文本、图像处理' },
  { id: 'data-analysis', name: '数据分析', icon: 'BarChart', description: 'Excel、CSV数据分析和处理' },
  { id: 'document-generation', name: '文档生成', icon: 'FileText', description: '生成Word、PDF等文档' },
  { id: 'content-creation', name: '内容创作', icon: 'PenTool', description: '文章、营销内容创作' },
  { id: 'image-processing', name: '图像处理', icon: 'Image', description: '图像分析、生成和处理' },
  { id: 'translation', name: '翻译', icon: 'Globe', description: '多语言翻译工作流' },
  { id: 'automation', name: '自动化', icon: 'Zap', description: '重复性任务自动化' },
  { id: 'qa', name: '问答', icon: 'MessageCircle', description: '基于知识库的问答系统' },
  { id: 'other', name: '其他', icon: 'MoreHorizontal', description: '其他类型模板' },
] as const

type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]['id']

interface CategoryResponse {
  categories: typeof TEMPLATE_CATEGORIES
}

/**
 * GET /api/templates/categories
 * 获取模板分类列表
 */
export async function GET(
  _request: NextRequest
): Promise<NextResponse<ApiSuccessResponse<CategoryResponse>>> {
  return ApiResponse.success({
    categories: TEMPLATE_CATEGORIES,
  })
}
