/**
 * 文件存储服务
 *
 * 统一管理不同的存储提供商，提供文件上传、下载、删除等功能
 */

import { prisma } from '@/lib/db'
import { localStorageProvider, LocalStorageProvider } from './providers/local'
import { aliyunOSSProvider } from './providers/aliyun-oss'
import {
  StorageProvider,
  StorageType,
  UploadRequest,
  OutputFormat,
  FORMAT_MIME_TYPES,
  FORMAT_EXTENSIONS,
} from './types'

// 当前使用的存储类型
const STORAGE_TYPE = (process.env.STORAGE_TYPE || 'LOCAL') as StorageType

/**
 * 存储服务类
 */
class StorageService {
  private providers: Map<StorageType, StorageProvider> = new Map()
  private currentType: StorageType

  constructor() {
    // 注册存储提供商
    this.providers.set('LOCAL', localStorageProvider)
    this.providers.set('ALIYUN_OSS', aliyunOSSProvider)

    this.currentType = STORAGE_TYPE
  }

  /**
   * 获取当前存储提供商
   */
  getProvider(type?: StorageType): StorageProvider {
    const providerType = type || this.currentType
    const provider = this.providers.get(providerType)

    if (!provider) {
      throw new Error(`存储提供商 ${providerType} 未注册`)
    }

    return provider
  }

  /**
   * 上传文件并保存到数据库
   */
  async uploadAndSave(request: UploadRequest & {
    maxDownloads?: number
    expiresIn?: number // 过期时间（秒）
  }): Promise<{
    id: string
    fileKey: string
    url: string
    size: number
  }> {
    const provider = this.getProvider()

    // 上传文件
    const result = await provider.upload(request)

    // 计算过期时间
    const expiresAt = request.expiresIn
      ? new Date(Date.now() + request.expiresIn * 1000)
      : null

    // 保存到数据库
    const outputFile = await prisma.outputFile.create({
      data: {
        fileName: request.fileName,
        fileKey: result.fileKey,
        format: request.format.toUpperCase() as 'TEXT' | 'JSON' | 'MARKDOWN' | 'HTML' | 'WORD' | 'EXCEL' | 'PDF' | 'IMAGE' | 'AUDIO' | 'VIDEO',
        mimeType: request.mimeType,
        size: result.size,
        storageType: this.currentType,
        url: result.url,
        maxDownloads: request.maxDownloads,
        expiresAt,
        metadata: request.metadata ? JSON.parse(JSON.stringify(request.metadata)) : undefined,
        executionId: request.executionId,
        nodeId: request.nodeId,
        organizationId: request.organizationId,
      },
    })

    return {
      id: outputFile.id,
      fileKey: result.fileKey,
      url: result.url,
      size: result.size,
    }
  }

  /**
   * 获取文件下载信息
   */
  async getDownloadInfo(fileId: string, organizationId: string): Promise<{
    url: string
    fileName: string
    mimeType: string
    size: number
  } | null> {
    // 查询文件记录
    const file = await prisma.outputFile.findFirst({
      where: {
        id: fileId,
        organizationId,
      },
    })

    if (!file) {
      return null
    }

    // 检查是否过期
    if (file.expiresAt && file.expiresAt < new Date()) {
      return null
    }

    // 检查下载次数限制
    if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
      return null
    }

    // 更新下载次数
    await prisma.outputFile.update({
      where: { id: fileId },
      data: { downloadCount: { increment: 1 } },
    })

    // 获取下载 URL
    const provider = this.getProvider(file.storageType as StorageType)
    const url = await provider.getDownloadUrl(file.fileKey)

    return {
      url,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
    }
  }

  /**
   * 通过 fileKey 获取下载信息（用于 API 路由）
   */
  async getDownloadInfoByKey(fileKey: string): Promise<{
    file: {
      id: string
      fileName: string
      mimeType: string
      size: number
      organizationId: string
    }
    localPath?: string
  } | null> {
    const file = await prisma.outputFile.findUnique({
      where: { fileKey },
    })

    if (!file) {
      return null
    }

    // 检查是否过期
    if (file.expiresAt && file.expiresAt < new Date()) {
      return null
    }

    // 检查下载次数限制
    if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
      return null
    }

    // 更新下载次数
    await prisma.outputFile.update({
      where: { id: file.id },
      data: { downloadCount: { increment: 1 } },
    })

    const result: {
      file: {
        id: string
        fileName: string
        mimeType: string
        size: number
        organizationId: string
      }
      localPath?: string
    } = {
      file: {
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        organizationId: file.organizationId,
      },
    }

    // 如果是本地存储，返回本地路径
    if (file.storageType === 'LOCAL') {
      const localProvider = this.getProvider('LOCAL') as LocalStorageProvider
      result.localPath = localProvider.getLocalPath(file.fileKey)
    }

    return result
  }

  /**
   * 删除文件
   */
  async deleteFile(fileId: string, organizationId: string): Promise<boolean> {
    const file = await prisma.outputFile.findFirst({
      where: {
        id: fileId,
        organizationId,
      },
    })

    if (!file) {
      return false
    }

    // 从存储中删除
    const provider = this.getProvider(file.storageType as StorageType)
    await provider.delete(file.fileKey)

    // 从数据库中删除
    await prisma.outputFile.delete({
      where: { id: fileId },
    })

    return true
  }

  /**
   * 清理过期文件
   */
  async cleanupExpiredFiles(): Promise<number> {
    // 查询过期文件
    const expiredFiles = await prisma.outputFile.findMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })

    // 删除文件
    for (const file of expiredFiles) {
      try {
        const provider = this.getProvider(file.storageType as StorageType)
        await provider.delete(file.fileKey)
      } catch (error) {
        console.error(`Failed to delete file ${file.fileKey}:`, error)
      }
    }

    // 从数据库中删除记录
    await prisma.outputFile.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })

    return expiredFiles.length
  }

  /**
   * 获取执行的所有输出文件
   */
  async getExecutionFiles(executionId: string, organizationId: string) {
    return prisma.outputFile.findMany({
      where: {
        executionId,
        organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }
}

// 导出单例
export const storageService = new StorageService()

// 导出类型和工具函数
export type { StorageType, OutputFormat, UploadRequest, StorageProvider }
export { FORMAT_MIME_TYPES, FORMAT_EXTENSIONS }
