/**
 * 重新处理文档 API
 *
 * POST /api/knowledge-bases/[id]/documents/[docId]/reprocess - 重新处理文档
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse, ApiSuccessResponse } from '@/lib/api/api-response'
import { NotFoundError, AuthorizationError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { processDocument } from '@/lib/knowledge/processor'
import { safeDecryptApiKey } from '@/lib/crypto'
import { localStorageProvider } from '@/lib/storage/providers/local'

interface ReprocessResponse {
  success: boolean
  documentId: string
  message: string
}

/**
 * POST /api/knowledge-bases/[id]/documents/[docId]/reprocess
 * 重新处理文档（用于处理卡住或失败的文档）
 */
export const POST = withAuth<ApiSuccessResponse<ReprocessResponse>>(
  async (
    request: NextRequest,
    { user, params }: AuthContext
  ): Promise<NextResponse<ApiSuccessResponse<ReprocessResponse>>> => {
    const knowledgeBaseId = params?.id
    const documentId = params?.docId

    if (!knowledgeBaseId || !documentId) {
      throw new ValidationError('参数不完整')
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

    // 获取文档
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    })

    if (!document) {
      throw new NotFoundError('文档不存在')
    }

    if (document.knowledgeBaseId !== knowledgeBaseId) {
      throw new ValidationError('文档不属于此知识库')
    }

    // 只允许重新处理失败或卡住的文档
    if (document.status === 'COMPLETED') {
      throw new ValidationError('文档已处理完成，无需重新处理')
    }

    // 检查文件键是否存在
    if (!document.fileKey) {
      throw new ValidationError('文档文件信息丢失，请重新上传')
    }

    // 重置文档状态为 PENDING
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        status: 'PENDING',
        errorMessage: null,
      },
    })

    // 删除旧的分块
    const deletedChunks = await prisma.documentChunk.deleteMany({
      where: { documentId },
    })

    if (deletedChunks.count > 0) {
      // 更新知识库统计
      await prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          chunkCount: { decrement: deletedChunks.count },
        },
      })
    }

    // 获取文件内容
    let fileBuffer: Buffer
    try {
      // 从本地存储获取文件
      fileBuffer = await localStorageProvider.readFile(document.fileKey)
    } catch {
      // 如果文件不存在，标记为失败
      await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          errorMessage: '原始文件不存在，请重新上传',
        },
      })
      throw new ValidationError('原始文件不存在，请重新上传文档')
    }

    // 获取企业的 AI 配置
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
      apiKey = safeDecryptApiKey(aiConfig.keyEncrypted)
      baseUrl = aiConfig.baseUrl || undefined
    }

    // 异步处理文档
    processDocument({
      documentId: document.id,
      fileBuffer,
      fileType: document.fileType,
      fileName: document.fileName,
      knowledgeBaseId,
      chunkSize: knowledgeBase.chunkSize,
      chunkOverlap: knowledgeBase.chunkOverlap,
      embeddingModel: knowledgeBase.embeddingModel,
      embeddingProvider: knowledgeBase.embeddingProvider,
      apiKey,
      baseUrl,
    }).catch((error) => {
      console.error(`文档重新处理失败 [${document.id}]:`, error)
    })

    return ApiResponse.success({
      success: true,
      documentId: document.id,
      message: '文档已开始重新处理',
    })
  }
)
