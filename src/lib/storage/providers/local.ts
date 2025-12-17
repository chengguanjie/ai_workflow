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
   * 生成文件存储路径
   * 格式: {organizationId}/{year}/{month}/{executionId}/{nodeId}_{timestamp}_{fileName}
   */
  private generateFileKey(request: UploadRequest): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const timestamp = Date.now()

    // 清理文件名中的特殊字符
    const safeName = request.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')

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
    const filePath = path.join(this.uploadDir, fileKey)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      // 文件不存在时忽略错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  async exists(fileKey: string): Promise<boolean> {
    const filePath = path.join(this.uploadDir, fileKey)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取文件的本地路径（用于下载）
   */
  getLocalPath(fileKey: string): string {
    return path.join(this.uploadDir, fileKey)
  }

  /**
   * 读取文件内容
   */
  async readFile(fileKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, fileKey)
    return fs.readFile(filePath)
  }
}

export const localStorageProvider = new LocalStorageProvider()
