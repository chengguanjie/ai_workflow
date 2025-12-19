/**
 * 阿里云 OSS 存储提供商
 *
 * 使用前需要安装依赖: pnpm add ali-oss
 * 环境变量配置:
 *   STORAGE_TYPE=ALIYUN_OSS
 *   ALIYUN_OSS_REGION=oss-cn-hangzhou
 *   ALIYUN_OSS_BUCKET=your-bucket-name
 *   ALIYUN_OSS_ACCESS_KEY_ID=your-access-key-id
 *   ALIYUN_OSS_ACCESS_KEY_SECRET=your-access-key-secret
 */

import { StorageProvider, UploadRequest, UploadResult } from '../types'

// 阿里云 OSS 配置
const OSS_CONFIG = {
  region: process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou',
  bucket: process.env.ALIYUN_OSS_BUCKET || '',
  accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || '',
}

export class AliyunOSSProvider implements StorageProvider {
  name = '阿里云 OSS'
  type = 'ALIYUN_OSS' as const

  private client: unknown // OSS 客户端实例

  constructor() {
    // 延迟初始化，仅在需要时加载 ali-oss
    this.client = null
  }

  /**
   * 获取 OSS 客户端（延迟加载）
   */
  private async getClient(): Promise<unknown> {
    if (this.client) return this.client

    // 验证配置
    if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket) {
      throw new Error('阿里云 OSS 未配置: 请检查 ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET 环境变量')
    }

    try {
      // 动态导入 ali-oss
      const OSS = await import('ali-oss').then(m => m.default)
      this.client = new OSS({
        region: OSS_CONFIG.region,
        accessKeyId: OSS_CONFIG.accessKeyId,
        accessKeySecret: OSS_CONFIG.accessKeySecret,
        bucket: OSS_CONFIG.bucket,
      })
      return this.client
    } catch (error) {
      throw new Error(`阿里云 OSS 初始化失败: ${error instanceof Error ? error.message : 'ali-oss 包未安装'}`)
    }
  }

  /**
   * 生成文件存储路径
   */
  private generateFileKey(request: UploadRequest): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const timestamp = Date.now()
    const safeName = request.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')

    return `workflow-outputs/${request.organizationId}/${year}/${month}/${request.executionId}/${request.nodeId}_${timestamp}_${safeName}`
  }

  async upload(request: UploadRequest): Promise<UploadResult> {
    const client = await this.getClient() as {
      put: (key: string, content: Buffer) => Promise<{ url: string; res: { size: number } }>
    }
    const fileKey = this.generateFileKey(request)

    // 转换为 Buffer
    let buffer: Buffer
    if (Buffer.isBuffer(request.file)) {
      buffer = request.file
    } else if (request.file instanceof Blob) {
      buffer = Buffer.from(await request.file.arrayBuffer())
    } else {
      const chunks: Buffer[] = []
      const reader = (request.file as ReadableStream).getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
      }
      buffer = Buffer.concat(chunks)
    }

    // 上传到 OSS
    const result = await client.put(fileKey, buffer)

    return {
      fileKey,
      url: result.url,
      size: buffer.length,
    }
  }

  async getDownloadUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    const client = await this.getClient() as {
      signatureUrl: (key: string, options: { expires: number }) => string
    }

    // 生成签名 URL
    const url = client.signatureUrl(fileKey, {
      expires: expiresIn,
    })

    return url
  }

  async delete(fileKey: string): Promise<void> {
    const client = await this.getClient() as {
      delete: (key: string) => Promise<void>
    }
    await client.delete(fileKey)
  }

  async exists(fileKey: string): Promise<boolean> {
    const client = await this.getClient() as {
      head: (key: string) => Promise<unknown>
    }
    try {
      await client.head(fileKey)
      return true
    } catch {
      return false
    }
  }
}

export const aliyunOSSProvider = new AliyunOSSProvider()
