import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { storageService, FORMAT_MIME_TYPES } from '@/lib/storage'
import type { OutputFormat } from '@/lib/storage'
import { ApiResponse } from '@/lib/api/api-response'
import {
  validateSize,
  validateMimeType,
  sanitizeFilename,
  containsPathTraversal,
  getExtension,
} from '@/lib/security/file-validator'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// 根据字段类型定义允许的 MIME 类型
const FIELD_TYPE_MIME_TYPES: Record<string, Set<string>> = {
  image: new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ]),
  pdf: new Set(['application/pdf']),
  word: new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  excel: new Set([
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ]),
  audio: new Set([
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp3',
    'audio/webm',
  ]),
  video: new Set([
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
  ]),
}

/**
 * POST /api/files/temp
 * 上传临时文件
 *
 * FormData:
 *   file - 文件
 *   fieldType - 字段类型 (image/pdf/word/excel/audio/video)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return ApiResponse.error('未登录', 401)
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fieldType = formData.get('fieldType') as string | null

    if (!file) {
      return ApiResponse.error('缺少文件', 400)
    }

    if (!fieldType) {
      return ApiResponse.error('缺少字段类型', 400)
    }

    // Check for path traversal in filename
    if (containsPathTraversal(file.name)) {
      return ApiResponse.error('文件名包含非法字符', 400)
    }

    // Validate file size using File Validator
    const sizeResult = validateSize(file.size, MAX_FILE_SIZE)
    if (!sizeResult.valid) {
      return ApiResponse.error(sizeResult.error || `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)`, 400)
    }

    // 验证文件类型
    const allowedMimeTypes = FIELD_TYPE_MIME_TYPES[fieldType]
    if (allowedMimeTypes && file.type) {
      // Validate MIME type using File Validator
      const ext = getExtension(file.name)
      const mimeResult = validateMimeType(file.type, ext, allowedMimeTypes)
      if (!mimeResult.valid) {
        return ApiResponse.error(`不支持的文件格式，请上传${fieldType}类型的文件`, 400)
      }
    }

    // 确定文件格式
    const format = detectFormat(file.name, file.type, fieldType)

    // Sanitize filename before storage
    const safeFileName = sanitizeFilename(file.name)

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer())

    // 上传到存储（临时文件，24小时后过期）
    const result = await storageService.uploadAndSave({
      file: buffer,
      fileName: safeFileName,
      mimeType: file.type || FORMAT_MIME_TYPES[format],
      format: format,
      organizationId: session.user.organizationId,
      // 临时文件不关联执行记录，使用特殊标识
      executionId: 'temp',
      nodeId: 'input',
      expiresIn: 24 * 60 * 60, // 24小时后过期
    })

    return ApiResponse.success({
      data: {
        id: result.id,
        fileKey: result.fileKey,
        url: result.url,
        size: result.size,
        fileName: safeFileName,
        format: format,
        mimeType: file.type,
      },
    })
  } catch (error) {
    console.error('Upload temp file error:', error)
    return ApiResponse.error('上传文件失败', 500)
  }
}

/**
 * 根据文件名、MIME 类型和字段类型检测输出格式
 */
function detectFormat(fileName: string, mimeType: string, fieldType: string): OutputFormat {
  // 根据字段类型映射到格式
  const fieldTypeFormatMap: Record<string, OutputFormat> = {
    image: 'image',
    pdf: 'pdf',
    word: 'word',
    excel: 'excel',
    audio: 'audio',
    video: 'video',
  }

  if (fieldTypeFormatMap[fieldType]) {
    return fieldTypeFormatMap[fieldType]
  }

  // 默认根据 MIME 类型检测
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('word')) return 'word'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'text/csv') return 'excel'

  return 'text' // 默认
}
