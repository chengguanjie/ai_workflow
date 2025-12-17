/**
 * 文件存储类型定义
 */

export type StorageType = 'LOCAL' | 'ALIYUN_OSS' | 'AWS_S3' | 'CUSTOM'

export type OutputFormat =
  | 'text'
  | 'json'
  | 'markdown'
  | 'html'
  | 'word'
  | 'excel'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'

/**
 * 文件上传请求
 */
export interface UploadRequest {
  file: Buffer | Blob | ReadableStream
  fileName: string
  mimeType: string
  format: OutputFormat
  organizationId: string
  executionId: string
  nodeId: string
  metadata?: Record<string, unknown>
}

/**
 * 文件上传结果
 */
export interface UploadResult {
  fileKey: string      // 存储键/路径
  url: string          // 访问 URL
  size: number         // 文件大小
}

/**
 * 存储配置
 */
export interface StorageConfig {
  type: StorageType
  // 本地存储
  localPath?: string
  localUrlPrefix?: string
  // 阿里云 OSS
  ossEndpoint?: string
  ossBucket?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  // AWS S3
  s3Region?: string
  s3Bucket?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  // 自定义
  customBaseUrl?: string
}

/**
 * 存储提供商接口
 */
export interface StorageProvider {
  name: string
  type: StorageType

  /**
   * 上传文件
   */
  upload(request: UploadRequest): Promise<UploadResult>

  /**
   * 获取文件下载 URL
   * @param fileKey 文件键
   * @param expiresIn URL 有效期（秒），默认 3600
   */
  getDownloadUrl(fileKey: string, expiresIn?: number): Promise<string>

  /**
   * 删除文件
   */
  delete(fileKey: string): Promise<void>

  /**
   * 检查文件是否存在
   */
  exists(fileKey: string): Promise<boolean>
}

/**
 * MIME 类型映射
 */
export const FORMAT_MIME_TYPES: Record<OutputFormat, string> = {
  text: 'text/plain',
  json: 'application/json',
  markdown: 'text/markdown',
  html: 'text/html',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  image: 'image/png',
  audio: 'audio/mpeg',
  video: 'video/mp4',
}

/**
 * 文件扩展名映射
 */
export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  text: '.txt',
  json: '.json',
  markdown: '.md',
  html: '.html',
  word: '.docx',
  excel: '.xlsx',
  pdf: '.pdf',
  image: '.png',
  audio: '.mp3',
  video: '.mp4',
}
