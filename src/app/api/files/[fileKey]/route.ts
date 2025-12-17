/**
 * 单个文件操作 API
 *
 * GET    /api/files/[fileKey] - 获取文件信息
 * DELETE /api/files/[fileKey] - 删除文件
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { storageService } from '@/lib/storage'

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
      return NextResponse.json({ error: '未登录' }, { status: 401 })
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
      return NextResponse.json({ error: '文件不存在' }, { status: 404 })
    }

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: '无权访问此文件' }, { status: 403 })
    }

    // 检查是否过期
    if (file.expiresAt && file.expiresAt < new Date()) {
      return NextResponse.json({ error: '文件已过期' }, { status: 410 })
    }

    return NextResponse.json({ file })
  } catch (error) {
    console.error('Get file info error:', error)
    return NextResponse.json(
      { error: '获取文件信息失败' },
      { status: 500 }
    )
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
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { fileKey } = await params
    const decodedKey = decodeURIComponent(fileKey)

    const file = await prisma.outputFile.findUnique({
      where: { fileKey: decodedKey },
    })

    if (!file) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 })
    }

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: '无权删除此文件' }, { status: 403 })
    }

    // 删除文件
    const deleted = await storageService.deleteFile(
      file.id,
      session.user.organizationId
    )

    if (!deleted) {
      return NextResponse.json({ error: '删除失败' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete file error:', error)
    return NextResponse.json(
      { error: '删除文件失败' },
      { status: 500 }
    )
  }
}
