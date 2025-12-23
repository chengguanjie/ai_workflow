/**
 * 节点调试面板工具函数
 * 
 * 包含文件类型验证、输出类型推断、文件名生成等工具函数
 */

import {
  SUPPORTED_FILE_TYPES,
  ALL_SUPPORTED_EXTENSIONS,
  OUTPUT_TYPE_MIME_MAP,
  OUTPUT_TYPE_EXTENSION_MAP,
  type FileCategory,
  type OutputType
} from './types'
import {
  type ModelModality,
  SHENSUAN_MODELS,
  SHENSUAN_DEFAULT_MODELS
} from '@/lib/ai/types'

// ============================================
// 模型类别相关函数
// ============================================

/**
 * 所有支持的模型类别
 */
export const ALL_MODALITIES: ModelModality[] = [
  'text',
  'code',
  'image-gen',
  'video-gen',
  'audio-transcription',
  'audio-tts',
  'embedding',
  'ocr'
]

/**
 * 根据模型类别获取该类别下的所有模型
 * 
 * @param modality - 模型类别
 * @returns 该类别下的模型列表
 */
export function getModelsForModality(modality: ModelModality): readonly string[] {
  return SHENSUAN_MODELS[modality] || []
}

/**
 * 根据模型类别获取默认模型
 * 
 * @param modality - 模型类别
 * @returns 该类别的默认模型
 */
export function getDefaultModelForModality(modality: ModelModality): string {
  return SHENSUAN_DEFAULT_MODELS[modality] || SHENSUAN_DEFAULT_MODELS.text
}

/**
 * 检查模型是否属于指定的模型类别
 * 
 * @param model - 模型ID
 * @param modality - 模型类别
 * @returns 模型是否属于该类别
 */
export function isModelInModality(model: string, modality: ModelModality): boolean {
  const models = getModelsForModality(modality)
  return models.includes(model)
}

/**
 * 过滤模型列表，只保留属于指定类别的模型
 * 
 * @param models - 模型列表
 * @param modality - 模型类别
 * @returns 过滤后的模型列表
 */
export function filterModelsByModality(models: string[], modality: ModelModality): string[] {
  const modalityModels = getModelsForModality(modality)
  return models.filter(model => modalityModels.includes(model))
}

/**
 * 验证模型类别切换后的一致性
 * 
 * 当模型类别切换时，需要确保：
 * 1. 返回的模型列表只包含该类别的模型
 * 2. 默认模型属于该类别
 * 
 * @param modality - 目标模型类别
 * @param models - 返回的模型列表
 * @param defaultModel - 返回的默认模型
 * @returns 是否一致
 */
export function validateModalitySwitchConsistency(
  modality: ModelModality,
  models: readonly string[],
  defaultModel: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  const modalityModels = getModelsForModality(modality)
  
  // 检查所有返回的模型是否都属于该类别
  for (const model of models) {
    if (!modalityModels.includes(model)) {
      errors.push(`模型 "${model}" 不属于类别 "${modality}"`)
    }
  }
  
  // 检查默认模型是否属于该类别
  if (!modalityModels.includes(defaultModel)) {
    errors.push(`默认模型 "${defaultModel}" 不属于类别 "${modality}"`)
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// ============================================
// 文件类型验证函数
// ============================================

/**
 * 检查文件扩展名是否受支持
 * 
 * @param extension - 文件扩展名（带或不带点号）
 * @returns 是否支持该文件类型
 */
export function isFileTypeSupported(extension: string): boolean {
  if (!extension || typeof extension !== 'string') {
    return false
  }
  
  // 标准化扩展名：转小写，确保以点号开头
  const normalizedExt = normalizeExtension(extension)
  
  return (ALL_SUPPORTED_EXTENSIONS as readonly string[]).includes(normalizedExt)
}

/**
 * 获取文件扩展名对应的类别
 * 
 * @param extension - 文件扩展名（带或不带点号）
 * @returns 文件类别，如果不支持则返回 null
 */
export function getFileCategory(extension: string): FileCategory | null {
  if (!extension || typeof extension !== 'string') {
    return null
  }
  
  const normalizedExt = normalizeExtension(extension)
  
  for (const [category, extensions] of Object.entries(SUPPORTED_FILE_TYPES)) {
    if ((extensions as readonly string[]).includes(normalizedExt)) {
      return category as FileCategory
    }
  }
  
  return null
}

/**
 * 标准化文件扩展名
 * 
 * @param extension - 原始扩展名
 * @returns 标准化后的扩展名（小写，带点号）
 */
export function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase()
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

// ============================================
// 输出类型推断函数
// ============================================

/**
 * 根据内容和MIME类型推断输出类型
 * 
 * @param content - 输出内容
 * @param mimeType - 可选的MIME类型
 * @returns 推断的输出类型
 */
export function inferOutputType(content: unknown, mimeType?: string): OutputType {
  // 1. 首先尝试根据MIME类型推断
  if (mimeType) {
    const typeFromMime = inferFromMimeType(mimeType)
    if (typeFromMime) {
      return typeFromMime
    }
  }
  
  // 2. 根据内容类型推断
  if (content === null || content === undefined) {
    return 'text'
  }
  
  // 处理 Blob 类型
  if (content instanceof Blob) {
    const blobType = inferFromMimeType(content.type)
    return blobType || 'text'
  }
  
  // 处理 ArrayBuffer 类型
  if (content instanceof ArrayBuffer) {
    // ArrayBuffer 通常是二进制数据，默认返回 text
    // 如果有 mimeType 则已经在上面处理过了
    return 'text'
  }
  
  // 处理字符串类型
  if (typeof content === 'string') {
    return inferFromStringContent(content)
  }
  
  // 处理对象类型（可能是 JSON）
  if (typeof content === 'object') {
    return 'json'
  }
  
  // 默认返回纯文本
  return 'text'
}

/**
 * 根据MIME类型推断输出类型
 */
function inferFromMimeType(mimeType: string): OutputType | null {
  const normalizedMime = mimeType.toLowerCase().trim()
  
  for (const [outputType, mimeTypes] of Object.entries(OUTPUT_TYPE_MIME_MAP)) {
    if (mimeTypes.some(mime => normalizedMime.includes(mime) || mime.includes(normalizedMime))) {
      return outputType as OutputType
    }
  }
  
  // 处理通用类型
  if (normalizedMime.startsWith('image/')) {
    return 'image'
  }
  if (normalizedMime.startsWith('audio/')) {
    return 'audio'
  }
  if (normalizedMime.startsWith('video/')) {
    return 'video'
  }
  if (normalizedMime.startsWith('text/')) {
    return 'text'
  }
  
  return null
}

/**
 * 根据字符串内容推断输出类型
 */
function inferFromStringContent(content: string): OutputType {
  const trimmed = content.trim()
  
  // 尝试检测 JSON
  if (isJsonString(trimmed)) {
    return 'json'
  }
  
  // 尝试检测 HTML
  if (isHtmlString(trimmed)) {
    return 'html'
  }
  
  // 尝试检测 CSV
  if (isCsvString(trimmed)) {
    return 'csv'
  }
  
  // 默认返回纯文本
  return 'text'
}

/**
 * 检查字符串是否为有效的 JSON
 */
function isJsonString(str: string): boolean {
  if (!str.startsWith('{') && !str.startsWith('[')) {
    return false
  }
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

/**
 * 检查字符串是否为 HTML
 */
function isHtmlString(str: string): boolean {
  // 检查是否包含 HTML 标签
  const htmlPattern = /<\s*[a-z][^>]*>/i
  const hasHtmlTags = htmlPattern.test(str)
  
  // 检查是否以 DOCTYPE 或 html 标签开头
  const startsWithHtml = /^\s*<!DOCTYPE\s+html/i.test(str) || /^\s*<html/i.test(str)
  
  return hasHtmlTags || startsWithHtml
}

/**
 * 检查字符串是否为 CSV
 */
function isCsvString(str: string): boolean {
  const lines = str.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) {
    return false
  }
  
  // 检查是否有一致的分隔符（逗号或制表符）
  const firstLineCommas = (lines[0].match(/,/g) || []).length
  const firstLineTabs = (lines[0].match(/\t/g) || []).length
  
  if (firstLineCommas === 0 && firstLineTabs === 0) {
    return false
  }
  
  // 检查至少前几行是否有相似的列数
  const delimiter = firstLineCommas >= firstLineTabs ? ',' : '\t'
  const firstLineColumns = lines[0].split(delimiter).length
  
  // 至少检查前3行（或所有行如果少于3行）
  const linesToCheck = Math.min(3, lines.length)
  for (let i = 1; i < linesToCheck; i++) {
    const columns = lines[i].split(delimiter).length
    // 允许一定的误差（考虑到引号内的分隔符）
    if (Math.abs(columns - firstLineColumns) > 1) {
      return false
    }
  }
  
  return true
}

// ============================================
// 下载文件名生成函数
// ============================================

/**
 * 生成下载文件名
 * 
 * @param nodeName - 节点名称
 * @param outputType - 输出类型
 * @returns 生成的文件名
 */
export function generateDownloadFileName(nodeName: string, outputType: OutputType): string {
  // 清理节点名称中的非法字符
  const sanitizedNodeName = sanitizeFileName(nodeName)
  
  // 生成时间戳
  const timestamp = formatTimestamp(new Date())
  
  // 获取文件扩展名
  const extension = OUTPUT_TYPE_EXTENSION_MAP[outputType] || '.txt'
  
  return `${sanitizedNodeName}_${timestamp}${extension}`
}

/**
 * 清理文件名中的非法字符
 * 
 * @param fileName - 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'output'
  }
  
  // 移除或替换非法字符
  // Windows 非法字符: \ / : * ? " < > |
  // 同时移除控制字符和其他可能导致问题的字符
  let sanitized = fileName
    .replace(/[\\/:*?"<>|]/g, '_')  // 替换非法字符为下划线
    .replace(/[\x00-\x1f\x7f]/g, '') // 移除控制字符
    .replace(/\s+/g, '_')            // 替换空白字符为下划线
    .replace(/_+/g, '_')             // 合并连续下划线
    .replace(/^_+|_+$/g, '')         // 移除首尾下划线
  
  // 如果清理后为空，使用默认名称
  if (!sanitized) {
    sanitized = 'output'
  }
  
  // 限制长度（保留足够空间给时间戳和扩展名）
  const maxLength = 50
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }
  
  return sanitized
}

/**
 * 格式化时间戳
 * 
 * @param date - 日期对象
 * @returns 格式化的时间戳字符串 (YYYYMMDD_HHmmss)
 */
export function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

// ============================================
// CSV 解析工具函数
// ============================================

/**
 * 解析 CSV 字符串为二维数组
 * 
 * @param csvString - CSV 字符串
 * @param delimiter - 分隔符，默认为逗号
 * @returns 解析后的二维数组
 */
export function parseCSV(csvString: string, delimiter: string = ','): string[][] {
  const lines = csvString.split('\n')
  const result: string[][] = []
  
  for (const line of lines) {
    // 只跳过完全空的行（没有任何字符）
    if (line === '') continue
    
    const row = parseCSVLine(line, delimiter)
    result.push(row)
  }
  
  return result
}

/**
 * 解析单行 CSV
 * 注意：不对单元格内容进行 trim，以保持往返一致性
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // 转义的引号
          current += '"'
          i++
        } else {
          // 结束引号
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }
  
  // 添加最后一个字段
  result.push(current)
  
  return result
}

/**
 * 将二维数组序列化为 CSV 字符串
 * 
 * @param data - 二维数组数据
 * @param delimiter - 分隔符，默认为逗号
 * @returns CSV 字符串
 */
export function serializeCSV(data: string[][], delimiter: string = ','): string {
  return data.map(row => 
    row.map(cell => {
      // 如果单元格包含分隔符、引号或换行符，需要用引号包裹
      if (cell.includes(delimiter) || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`
      }
      return cell
    }).join(delimiter)
  ).join('\n')
}
