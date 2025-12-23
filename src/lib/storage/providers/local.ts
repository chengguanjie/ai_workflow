/**
 * 本地文件存储提供商
 */

import fs from 'fs/promises'
import path from 'path'
import { StorageProvider, UploadRequest, UploadResult } from '../types'

// 确保使用绝对路径，避免相对路径在不同上下文中解析错误
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads')
// 使用空字符串表示相对路径，避免端口问题
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

export class LocalStorageProvider implements StorageProvider {
  name = '本地存储'
  type = 'LOCAL' as const

  private uploadDir: string
  private baseUrl: string

  constructor(uploadDir?: string, baseUrl?: string) {
    this.uploadDir = uploadDir || UPLOAD_DIR
    this.baseUrl = baseUrl || BASE_URL
  }

  private validateFileKey(fileKey: string): void {
    if (fileKey.includes('..') || fileKey.startsWith('/') || fileKey.startsWith('\\')) {
      throw new Error('Invalid file key: path traversal detected')
    }
    if (!/^[a-zA-Z0-9/_\-\.]+$/.test(fileKey)) {
      throw new Error('Invalid file key: contains invalid characters')
    }
  }

  private getSafePath(fileKey: string): string {
    this.validateFileKey(fileKey)
    const filePath = path.join(this.uploadDir, fileKey)
    const resolvedPath = path.resolve(filePath)
    if (!resolvedPath.startsWith(path.resolve(this.uploadDir))) {
      throw new Error('Invalid file key: path traversal detected')
    }
    return resolvedPath
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath)
    } catch {
      await fs.mkdir(dirPath, { recursive: true })
    }
  }

  /**
   * 将文件名转换为安全的存储名称
   * 保留扩展名，将非ASCII字符转换为下划线
   */
  private sanitizeFileName(fileName: string): string {
    // 提取扩展名
    const lastDot = fileName.lastIndexOf('.')
    const ext = lastDot > 0 ? fileName.slice(lastDot) : ''
    const nameWithoutExt = lastDot > 0 ? fileName.slice(0, lastDot) : fileName

    // 将非ASCII字符和特殊字符替换为下划线
    const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_')
    
    // 移除连续的下划线
    const cleanName = safeName.replace(/_+/g, '_').replace(/^_|_$/g, '')
    
    // 如果名称为空，使用默认名称
    const finalName = cleanName || 'file'
    
    // 清理扩展名（只保留字母数字）
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '')
    
    return finalName + safeExt
  }

  /**
   * 生成文件存储路径
   * 格式: {organizationId}/{year}/{month}/{executionId}/{nodeId}_{timestamp}_{fileName}
   */
  private generateFileKey(request: UploadRequest): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const timestamp = Date.now()

    // 清理文件名中的特殊字符（包括中文等非ASCII字符）
    const safeName = this.sanitizeFileName(request.fileName)

    return `${request.organizationId}/${year}/${month}/${request.executionId}/${request.nodeId}_${timestamp}_${safeName}`
  }

  async upload(request: UploadRequest): Promise<UploadResult> {
    const fileKey = this.generateFileKey(request)
    const filePath = path.join(this.uploadDir, fileKey)
    const dirPath = path.dirname(filePath)

    // 确保目录存在
    await this.ensureDir(dirPath)

    // 写入文件
    let size: number
    if (Buffer.isBuffer(request.file)) {
      await fs.writeFile(filePath, request.file)
      size = request.file.length
    } else if (request.file instanceof Blob) {
      const buffer = Buffer.from(await request.file.arrayBuffer())
      await fs.writeFile(filePath, buffer)
      size = buffer.length
    } else {
      // ReadableStream
      const chunks: Buffer[] = []
      const reader = (request.file as ReadableStream).getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
      }
      const buffer = Buffer.concat(chunks)
      await fs.writeFile(filePath, buffer)
      size = buffer.length
    }

    return {
      fileKey,
      url: `${this.baseUrl}/api/files/${encodeURIComponent(fileKey)}/download`,
      size,
    }
  }

  async getDownloadUrl(fileKey: string, _expiresIn?: number): Promise<string> {
    // 本地存储直接返回下载 API 地址
    // 实际的权限验证在 API 层处理
    return `${this.baseUrl}/api/files/${encodeURIComponent(fileKey)}/download`
  }

  async delete(fileKey: string): Promise<void> {
    const filePath = this.getSafePath(fileKey)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  async exists(fileKey: string): Promise<boolean> {
    const filePath = this.getSafePath(fileKey)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  getLocalPath(fileKey: string): string {
    return this.getSafePath(fileKey)
  }

  async readFile(fileKey: string): Promise<Buffer> {
    const filePath = this.getSafePath(fileKey)
    return fs.readFile(filePath)
  }

  /**
   * 保存文件到指定路径
   * 用于知识库文档等需要持久化存储的场景
   */
  async saveFile(fileKey: string, buffer: Buffer): Promise<void> {
    const filePath = this.getSafePath(fileKey)
    const dirPath = path.dirname(filePath)
    
    // 确保目录存在
    await this.ensureDir(dirPath)
    
    // 写入文件
    await fs.writeFile(filePath, buffer)
  }
}

export const localStorageProvider = new LocalStorageProvider()
