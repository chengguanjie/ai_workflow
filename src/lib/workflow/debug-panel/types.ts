/**
 * 节点调试面板增强类型定义
 * 
 * 包含输入数据、模型类别选择和输出结果相关的类型定义
 */

import type { ModelModality } from '@/lib/ai/types'

// ============================================
// 输入数据相关类型
// ============================================

/**
 * 输入Tab类型
 */
export type InputTabType = 'input' | 'reference'

/**
 * 支持的文件类型分类
 */
export const SUPPORTED_FILE_TYPES = {
  document: ['.doc', '.docx', '.pdf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.html', '.json'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  audio: ['.mp3', '.wav', '.m4a'],
  video: ['.mp4', '.webm', '.mov']
} as const

/**
 * 文件类别类型
 */
export type FileCategory = keyof typeof SUPPORTED_FILE_TYPES

/**
 * 所有支持的文件扩展名
 */
export const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_FILE_TYPES.document,
  ...SUPPORTED_FILE_TYPES.image,
  ...SUPPORTED_FILE_TYPES.audio,
  ...SUPPORTED_FILE_TYPES.video
] as const

/**
 * 导入的文件信息
 */
export interface ImportedFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  previewUrl?: string
  content?: string | ArrayBuffer | null
  contentBase64?: string | null
}

// ============================================
// 模型类别相关类型
// ============================================

/**
 * 模型类别显示名称映射
 */
export const MODALITY_LABELS: Record<ModelModality, string> = {
  'text': '文本类',
  'code': '代码类',
  'image-gen': '图片生成',
  'video-gen': '视频生成',
  'audio-transcription': '音频转录',
  'audio-tts': '文字转语音',
  'embedding': '向量嵌入',
  'ocr': '图文识别'
}

/**
 * 模型类别到默认输出类型的映射
 * 当用户选择模型类别时，自动设置对应的输出类型
 */
export const MODALITY_TO_OUTPUT_TYPE: Record<ModelModality, OutputType> = {
  // 对于文本模型，默认按「纯文本」展示，
  // 只有在用户显式要求或工具/提示词推断为结构化时，才使用 JSON 等格式。
  'text': 'text',
  'code': 'json',
  'image-gen': 'image',
  'video-gen': 'video',
  'audio-transcription': 'text',
  'audio-tts': 'audio',
  'embedding': 'json',
  'ocr': 'text'
}

// ============================================
// 输出结果相关类型
// ============================================

/**
 * 输出类型
 */
export type OutputType =
  | 'text'      // 纯文本
  | 'markdown'  // Markdown
  | 'json'      // JSON
  | 'html'      // HTML
  | 'csv'       // CSV
  | 'word'      // Word文档
  | 'pdf'       // PDF文档
  | 'excel'     // Excel表格
  | 'ppt'       // PPT演示
  | 'image'     // 图片
  | 'audio'     // 音频
  | 'video'     // 视频

/**
 * 输出类型显示名称映射
 */
export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  'text': '纯文本',
  'markdown': 'Markdown',
  'json': 'JSON',
  'html': 'HTML',
  'csv': 'CSV',
  'word': 'Word',
  'pdf': 'PDF',
  'excel': 'Excel',
  'ppt': 'PPT',
  'image': '图片',
  'audio': '音频',
  'video': '视频'
}

/**
 * 输出类型对应的MIME类型映射
 */
export const OUTPUT_TYPE_MIME_MAP: Record<OutputType, string[]> = {
  'text': ['text/plain'],
  'markdown': ['text/markdown', 'text/x-markdown'],
  'json': ['application/json'],
  'html': ['text/html'],
  'csv': ['text/csv', 'application/csv'],
  'word': ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'pdf': ['application/pdf'],
  'excel': ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'ppt': ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  'audio': ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'],
  'video': ['video/mp4', 'video/webm', 'video/quicktime']
}

/**
 * 输出类型对应的文件扩展名映射
 */
export const OUTPUT_TYPE_EXTENSION_MAP: Record<OutputType, string> = {
  'text': '.txt',
  'markdown': '.md',
  'json': '.json',
  'html': '.html',
  'csv': '.csv',
  'word': '.docx',
  'pdf': '.pdf',
  'excel': '.xlsx',
  'ppt': '.pptx',
  'image': '.png',
  'audio': '.mp3',
  'video': '.mp4'
}

/**
 * 输出结果数据
 */
export interface OutputResult {
  type: OutputType
  content: string | Blob | ArrayBuffer
  mimeType: string
  fileName?: string
  metadata?: {
    width?: number
    height?: number
    duration?: number
    size?: number
  }
}

// ============================================
// 增强的调试结果类型
// ============================================

/**
 * 增强的调试结果类型
 */
export interface EnhancedDebugResult {
  // 原有字段
  status: 'success' | 'error' | 'skipped' | 'paused'
  output: Record<string, unknown>
  error?: string
  duration: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  logs?: string[]
  approvalRequestId?: string

  // 新增字段
  outputType?: OutputType
  outputContent?: {
    raw: string | Blob | ArrayBuffer
    mimeType: string
    fileName?: string
  }
}

// ============================================
// 增强的节点配置类型
// ============================================

/**
 * 增强的处理配置
 */
export interface EnhancedProcessConfig {
  // 原有字段
  systemPrompt?: string
  userPrompt?: string
  model?: string
  aiConfigId?: string
  knowledgeBaseId?: string

  // 新增字段
  modality?: ModelModality        // 模型类别
  expectedOutputType?: OutputType // 期望输出类型
  importedFiles?: ImportedFile[]  // 导入的文件
}
