import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { storageService } from '@/lib/storage'
import { ApiResponse } from '@/lib/api/api-response'
import { handleError } from '@/lib/api/error-middleware'
import { AuthenticationError, NotFoundError, AuthorizationError } from '@/lib/errors'

interface RouteParams {
  params: Promise<{ fileKey: string }>
}

/**
 * GET /api/files/[fileKey]
 * 获取文件信息
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new AuthenticationError('未登录')
    }

    const { fileKey } = await params
    const decodedKey = decodeURIComponent(fileKey)

    const file = await prisma.outputFile.findUnique({
      where: { fileKey: decodedKey },
      select: {
        id: true,
        fileName: true,
        fileKey: true,
        format: true,
        mimeType: true,
        size: true,
        url: true,
        downloadCount: true,
        maxDownloads: true,
        expiresAt: true,
        metadata: true,
        createdAt: true,
        executionId: true,
        nodeId: true,
        organizationId: true,
      },
    })

    if (!file) {
      throw new NotFoundError('文件不存在')
    }

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      throw new AuthorizationError('无权访问此文件')
    }

    // 检查是否过期
    if (file.expiresAt && file.expiresAt < new Date()) {
      throw new NotFoundError('文件已过期')
    }

    return ApiResponse.success({ file })
  } catch (error) {
    return handleError(error, request)
  }
}

/**
 * DELETE /api/files/[fileKey]
 * 删除文件
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new AuthenticationError('未登录')
    }

    const { fileKey } = await params
    const decodedKey = decodeURIComponent(fileKey)

    const file = await prisma.outputFile.findUnique({
      where: { fileKey: decodedKey },
    })

    if (!file) {
      throw new NotFoundError('文件不存在')
    }

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      throw new AuthorizationError('无权删除此文件')
    }

    // 删除文件
    const deleted = await storageService.deleteFile(
      file.id,
      session.user.organizationId
    )

    if (!deleted) {
      throw new Error('删除失败')
    }

    return ApiResponse.success({ success: true })
  } catch (error) {
    return handleError(error, request)
  }
}
