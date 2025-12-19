/**
 * 知识库文档 API
 *
 * GET /api/knowledge-bases/[id]/documents - 获取文档列表
 * POST /api/knowledge-bases/[id]/documents - 上传文档
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { processDocument } from '@/lib/knowledge/processor'
import { decryptApiKey } from '@/lib/crypto'
import type { KnowledgeDocument } from '@prisma/client'

// 支持的文件类型
const SUPPORTED_FILE_TYPES = ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

interface DocumentListResponse {
  documents: KnowledgeDocument[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * GET /api/knowledge-bases/[id]/documents
 * 获取文档列表
 */
export const GET = withAuth<ApiSuccessResponse<DocumentListResponse>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<DocumentListResponse>>> => {
    const knowledgeBaseId = params?.id

    if (!knowledgeBaseId) {
      throw new ValidationError('知识库ID不能为空')
    }

    // 验证知识库存在且有权限
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权访问此知识库')
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const status = searchParams.get('status') || undefined

    const where: Record<string, unknown> = {
      knowledgeBaseId,
    }

    if (status) {
      where.status = status
    }

    const [documents, total] = await Promise.all([
      prisma.knowledgeDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.knowledgeDocument.count({ where }),
    ])

    return ApiResponse.success({
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  }
)

/**
 * POST /api/knowledge-bases/[id]/documents
 * 上传文档
 */
export const POST = withAuth<ApiSuccessResponse<KnowledgeDocument>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<KnowledgeDocument>>> => {
    const knowledgeBaseId = params?.id

    if (!knowledgeBaseId) {
      throw new ValidationError('知识库ID不能为空')
    }

    // 验证知识库存在且有权限
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    })

    if (!knowledgeBase) {
      throw new NotFoundError('知识库不存在')
    }

    if (knowledgeBase.organizationId !== user.organizationId) {
      throw new AuthorizationError('无权访问此知识库')
    }

    if (!knowledgeBase.isActive) {
      throw new ValidationError('知识库已被禁用')
    }

    // 解析 multipart/form-data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      throw new ValidationError('请上传文件')
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError(`文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    }

    // 获取文件扩展名
    const fileName = file.name
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || ''

    // 验证文件类型
    if (!SUPPORTED_FILE_TYPES.includes(fileExtension)) {
      throw new ValidationError(
        `不支持的文件类型。支持的类型：${SUPPORTED_FILE_TYPES.join(', ')}`
      )
    }

    // 读取文件内容
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const fileKey = `knowledge/${knowledgeBaseId}/${Date.now()}_${fileName}`

    // 创建文档记录
    const document = await prisma.knowledgeDocument.create({
      data: {
        fileName,
        fileType: fileExtension,
        fileSize: file.size,
        fileKey,
        status: 'PENDING',
        knowledgeBaseId,
        uploadedById: user.id,
        metadata: {
          originalName: fileName,
          mimeType: file.type,
        },
      },
    })

    // 更新知识库统计
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        documentCount: { increment: 1 },
        totalSize: { increment: file.size },
      },
    })

    // 获取企业的 AI 配置（用于嵌入）
    // 优先查找与嵌入提供商匹配的配置，否则使用默认配置
    const aiConfig = await prisma.apiKey.findFirst({
      where: {
        organizationId: user.organizationId,
        provider: knowledgeBase.embeddingProvider,
        isActive: true,
      },
    }) || await prisma.apiKey.findFirst({
      where: {
        organizationId: user.organizationId,
        isDefault: true,
        isActive: true,
      },
    })

    // 解密 API Key
    let apiKey: string | undefined
    let baseUrl: string | undefined
    if (aiConfig) {
      apiKey = decryptApiKey(aiConfig.keyEncrypted)
      baseUrl = aiConfig.baseUrl || undefined
    }

    // 异步处理文档（不阻塞响应）
    // 使用 Promise 在后台处理，但不等待结果
    processDocument({
      documentId: document.id,
      fileBuffer,
      fileType: fileExtension,
      fileName,
      knowledgeBaseId,
      chunkSize: knowledgeBase.chunkSize,
      chunkOverlap: knowledgeBase.chunkOverlap,
      embeddingModel: knowledgeBase.embeddingModel,
      embeddingProvider: knowledgeBase.embeddingProvider,
      apiKey,
      baseUrl,
    }).catch((error) => {
      console.error(`文档处理失败 [${document.id}]:`, error)
    })

    return ApiResponse.created(document)
  }
)
