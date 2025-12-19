/**
 * 文件管理 API
 *
 * GET  /api/files - 获取文件列表
 * POST /api/files - 上传文件（用于节点导入）
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { storageService, FORMAT_MIME_TYPES, FORMAT_EXTENSIONS } from '@/lib/storage'
import type { OutputFormat } from '@/lib/storage'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/ogg',
])

const ALLOWED_EXTENSIONS = new Set([
  'txt', 'csv', 'html', 'md', 'json',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'mp3', 'wav', 'ogg',
  'mp4', 'webm',
])

/**
 * GET /api/files
 * 获取文件列表
 *
 * Query params:
 *   executionId - 执行 ID（可选）
 *   limit - 每页数量（默认 20）
 *   offset - 偏移量（默认 0）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const executionId = searchParams.get('executionId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where = {
      organizationId: session.user.organizationId,
      ...(executionId ? { executionId } : {}),
    }

    const [files, total] = await Promise.all([
      prisma.outputFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          fileName: true,
          format: true,
          mimeType: true,
          size: true,
          url: true,
          downloadCount: true,
          maxDownloads: true,
          expiresAt: true,
          createdAt: true,
          executionId: true,
          nodeId: true,
        },
      }),
      prisma.outputFile.count({ where }),
    ])

    return NextResponse.json({
      files,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Get files error:', error)
    return NextResponse.json(
      { error: '获取文件列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/files
 * 上传文件
 *
 * FormData:
 *   file - 文件
 *   executionId - 执行 ID
 *   nodeId - 节点 ID
 *   format - 输出格式（可选，自动检测）
 *   maxDownloads - 最大下载次数（可选）
 *   expiresIn - 过期时间秒数（可选）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const executionId = formData.get('executionId') as string
    const nodeId = formData.get('nodeId') as string
    const format = formData.get('format') as OutputFormat | null
    const maxDownloads = formData.get('maxDownloads')
    const expiresIn = formData.get('expiresIn')

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      )
    }

    const fileExt = file.name.toLowerCase().split('.').pop() || ''
    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      return NextResponse.json(
        { error: '不支持的文件类型' },
        { status: 400 }
      )
    }

    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: '不支持的文件格式' },
        { status: 400 }
      )
    }

    if (!executionId || !nodeId) {
      return NextResponse.json(
        { error: '缺少 executionId 或 nodeId' },
        { status: 400 }
      )
    }

    // 验证执行记录属于当前企业
    const execution = await prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId: session.user.organizationId,
        },
      },
    })

    if (!execution) {
      return NextResponse.json(
        { error: '执行记录不存在或无权访问' },
        { status: 404 }
      )
    }

    // 确定文件格式
    const detectedFormat = format || detectFormat(file.name, file.type)

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer())

    // 上传并保存
    const result = await storageService.uploadAndSave({
      file: buffer,
      fileName: file.name,
      mimeType: file.type || FORMAT_MIME_TYPES[detectedFormat],
      format: detectedFormat,
      organizationId: session.user.organizationId,
      executionId,
      nodeId,
      maxDownloads: maxDownloads ? parseInt(maxDownloads as string) : undefined,
      expiresIn: expiresIn ? parseInt(expiresIn as string) : undefined,
    })

    return NextResponse.json({
      id: result.id,
      fileKey: result.fileKey,
      url: result.url,
      size: result.size,
      fileName: file.name,
      format: detectedFormat,
    })
  } catch (error) {
    console.error('Upload file error:', error)
    return NextResponse.json(
      { error: '上传文件失败' },
      { status: 500 }
    )
  }
}

/**
 * 根据文件名和 MIME 类型检测输出格式
 */
function detectFormat(fileName: string, mimeType: string): OutputFormat {
  const ext = fileName.toLowerCase().split('.').pop()

  // 根据扩展名检测
  for (const [format, extension] of Object.entries(FORMAT_EXTENSIONS)) {
    if (extension === `.${ext}`) {
      return format as OutputFormat
    }
  }

  // 根据 MIME 类型检测
  for (const [format, mime] of Object.entries(FORMAT_MIME_TYPES)) {
    if (mimeType === mime) {
      return format as OutputFormat
    }
  }

  // 根据 MIME 类型前缀检测
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('text/')) return 'text'

  return 'text' // 默认
}
