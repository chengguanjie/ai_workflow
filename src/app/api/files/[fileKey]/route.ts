import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { storageService } from '@/lib/storage'
import { ApiResponse } from '@/lib/api/api-response'

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
      return ApiResponse.error('未登录', 401)
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
      return ApiResponse.error('文件不存在', 404)
    }

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      return ApiResponse.error('无权访问此文件', 403)
    }

    // 检查是否过期
    if (file.expiresAt && file.expiresAt < new Date()) {
      return ApiResponse.error('文件已过期', 410)
    }

    return ApiResponse.success({ file })
  } catch (error) {
    console.error('Get file info error:', error)
    return ApiResponse.error('获取文件信息失败', 500)
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
      return ApiResponse.error('未登录', 401)
    }

    const { fileKey } = await params
    const decodedKey = decodeURIComponent(fileKey)

    const file = await prisma.outputFile.findUnique({
      where: { fileKey: decodedKey },
    })

    if (!file) {
      return ApiResponse.error('文件不存在', 404)
    }

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      return ApiResponse.error('无权删除此文件', 403)
    }

    // 删除文件
    const deleted = await storageService.deleteFile(
      file.id,
      session.user.organizationId
    )

    if (!deleted) {
      return ApiResponse.error('删除失败', 500)
    }

    return ApiResponse.success({ success: true })
  } catch (error) {
    console.error('Delete file error:', error)
    return ApiResponse.error('删除文件失败', 500)
  }
}
