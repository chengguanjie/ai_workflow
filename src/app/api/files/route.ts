/**
 * 文件管理 API
 *
 * GET  /api/files - 获取文件列表
 * POST /api/files - 上传文件（用于节点导入）
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { storageService, FORMAT_MIME_TYPES, FORMAT_EXTENSIONS } from '@/lib/storage'
import { ApiResponse } from '@/lib/api/api-response'
import type { OutputFormat } from '@/lib/storage'
import {
  validateFile,
  sanitizeFilename,
  containsPathTraversal,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_ALLOWED_MIME_TYPES,
  DEFAULT_MAX_FILE_SIZE,
} from '@/lib/security/file-validator'

const MAX_FILE_SIZE = DEFAULT_MAX_FILE_SIZE // 100MB

const ALLOWED_MIME_TYPES = DEFAULT_ALLOWED_MIME_TYPES

const ALLOWED_EXTENSIONS = DEFAULT_ALLOWED_EXTENSIONS

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
      return ApiResponse.error('未登录', 401)
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

    return ApiResponse.success({
      files,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Get files error:', error)
    return ApiResponse.error('获取文件列表失败', 500)
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
      return ApiResponse.error('未登录', 401)
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const executionId = formData.get('executionId') as string
    const nodeId = formData.get('nodeId') as string
    const format = formData.get('format') as OutputFormat | null
    const maxDownloads = formData.get('maxDownloads')
    const expiresIn = formData.get('expiresIn')

    if (!file) {
      return ApiResponse.error('缺少文件', 400)
    }

    // Check for path traversal in filename
    if (containsPathTraversal(file.name)) {
      return ApiResponse.error('文件名包含非法字符', 400)
    }

    // Comprehensive file validation using File Validator
    const validationResult = validateFile(
      { name: file.name, type: file.type, size: file.size },
      {
        allowedExtensions: ALLOWED_EXTENSIONS,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
        maxSize: MAX_FILE_SIZE,
      }
    )

    if (!validationResult.valid) {
      return ApiResponse.error(validationResult.error || '文件验证失败', 400)
    }

    if (!executionId || !nodeId) {
      return ApiResponse.error('缺少 executionId 或 nodeId', 400)
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
      return ApiResponse.error('执行记录不存在或无权访问', 404)
    }

    // 确定文件格式
    const detectedFormat = format || detectFormat(file.name, file.type)

    // Sanitize filename before storage
    const safeFileName = sanitizeFilename(file.name)

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer())

    // 上传并保存
    const result = await storageService.uploadAndSave({
      file: buffer,
      fileName: safeFileName,
      mimeType: file.type || FORMAT_MIME_TYPES[detectedFormat],
      format: detectedFormat,
      organizationId: session.user.organizationId,
      executionId,
      nodeId,
      maxDownloads: maxDownloads ? parseInt(maxDownloads as string) : undefined,
      expiresIn: expiresIn ? parseInt(expiresIn as string) : undefined,
    })

    return ApiResponse.created({
      id: result.id,
      fileKey: result.fileKey,
      url: result.url,
      size: result.size,
      fileName: safeFileName,
      format: detectedFormat,
    })
  } catch (error) {
    console.error('Upload file error:', error)
    return ApiResponse.error('上传文件失败', 500)
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
