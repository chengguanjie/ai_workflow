/**
 * 阿里云 OSS 存储提供商
 *
 * 使用前需要安装依赖: npm install ali-oss
 * 环境变量配置:
 *   OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
 *   OSS_BUCKET=your-bucket-name
 *   OSS_ACCESS_KEY_ID=your-access-key-id
 *   OSS_ACCESS_KEY_SECRET=your-access-key-secret
 */

import { StorageProvider, UploadRequest, UploadResult } from '../types'

// 阿里云 OSS 配置
const OSS_CONFIG = {
  endpoint: process.env.OSS_ENDPOINT || '',
  bucket: process.env.OSS_BUCKET || '',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
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

    try {
      // 动态导入 ali-oss
      const OSS = await import('ali-oss').then(m => m.default)
      this.client = new OSS({
        region: OSS_CONFIG.endpoint.replace('.aliyuncs.com', ''),
        accessKeyId: OSS_CONFIG.accessKeyId,
        accessKeySecret: OSS_CONFIG.accessKeySecret,
        bucket: OSS_CONFIG.bucket,
      })
      return this.client
    } catch {
      throw new Error('阿里云 OSS 未配置或 ali-oss 包未安装')
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
