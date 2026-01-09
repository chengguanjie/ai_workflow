/**
 * 类型特定验证器
 * 
 * 提供不同输出类型的验证功能：
 * - JSON 验证
 * - HTML 验证
 * - CSV 验证
 * 
 * 支持注册自定义验证器以扩展验证能力。
 */

import type { OutputType } from '../debug-panel/types'
import type { TypeValidator, TypeValidationResult } from './types'

// ============================================
// Validator Registry
// ============================================

/**
 * 验证器注册表
 */
const validatorRegistry = new Map<OutputType, TypeValidator>()

/**
 * 注册类型验证器
 * 
 * @param validator - 要注册的验证器
 */
export function registerValidator(validator: TypeValidator): void {
  validatorRegistry.set(validator.type, validator)
}

/**
 * 获取指定类型的验证器
 * 
 * @param type - 输出类型
 * @returns 对应的验证器，如果不存在则返回 undefined
 */
export function getValidator(type: OutputType): TypeValidator | undefined {
  return validatorRegistry.get(type)
}

// ============================================
// JSON Validator
// ============================================

/**
 * JSON 验证器
 * 
 * 验证内容是否为有效的 JSON 格式。
 */
export const jsonValidator: TypeValidator = {
  type: 'json',
  validate(content: string): TypeValidationResult {
    if (!content || content.trim() === '') {
      return {
        valid: false,
        error: '内容为空',
      }
    }

    const trimmed = content.trim()
    
    // 检查是否以 JSON 结构字符开头
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && 
        !trimmed.startsWith('"') && trimmed !== 'null' && 
        trimmed !== 'true' && trimmed !== 'false' &&
        !/^-?\d/.test(trimmed)) {
      return {
        valid: false,
        error: '内容不是有效的 JSON 格式：必须以 {、[、" 开头或为有效的 JSON 原始值',
      }
    }

    try {
      JSON.parse(content)
      return { valid: true }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '未知解析错误'
      return {
        valid: false,
        error: `输出不是有效的 JSON 格式: ${errorMessage}`,
      }
    }
  },
}

// ============================================
// HTML Validator
// ============================================

/**
 * HTML 标签正则表达式
 * 匹配开始标签、结束标签和自闭合标签
 */
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^>]*)?>/

/**
 * 常见 HTML 标签列表
 */
const COMMON_HTML_TAGS = [
  'html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'ul', 'ol', 'li',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'form', 'input', 'button',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'section',
  'article', 'aside', 'main', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u',
  'pre', 'code', 'blockquote', 'script', 'style', 'link', 'meta', 'title',
]

/**
 * HTML 验证器
 * 
 * 验证内容是否包含有效的 HTML 结构。
 * 注意：这是一个轻量级验证，不进行完整的 DOM 解析。
 */
export const htmlValidator: TypeValidator = {
  type: 'html',
  validate(content: string): TypeValidationResult {
    if (!content || content.trim() === '') {
      return {
        valid: false,
        error: '内容为空',
      }
    }

    // 检查是否包含 HTML 标签
    if (!HTML_TAG_PATTERN.test(content)) {
      return {
        valid: false,
        error: '输出不是有效的 HTML 格式：未检测到 HTML 标签',
      }
    }

    // 检查是否包含常见的 HTML 标签
    const lowerContent = content.toLowerCase()
    const hasCommonTag = COMMON_HTML_TAGS.some(tag => 
      lowerContent.includes(`<${tag}`) || lowerContent.includes(`</${tag}>`)
    )

    if (!hasCommonTag) {
      return {
        valid: false,
        error: '输出不是有效的 HTML 格式：未检测到常见 HTML 标签',
      }
    }

    // 检查基本的标签配对（简化检查）
    const openTags: string[] = []
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g
    const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']
    
    let match
    while ((match = tagPattern.exec(content)) !== null) {
      const fullTag = match[0]
      const tagName = match[1].toLowerCase()
      
      // 跳过自闭合标签
      if (selfClosingTags.includes(tagName) || fullTag.endsWith('/>')) {
        continue
      }
      
      if (fullTag.startsWith('</')) {
        // 结束标签
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
          openTags.pop()
        }
        // 不严格要求配对，因为 HTML 可能是片段
      } else if (!fullTag.startsWith('<!')) {
        // 开始标签（排除注释和声明）
        openTags.push(tagName)
      }
    }

    // 允许未闭合的标签（HTML 片段是常见的）
    return { valid: true }
  },
}

// ============================================
// Markdown Validator
// ============================================

/**
 * Markdown 常见语法模式
 */
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+.+$/m,           // 标题 (# Heading)
  /\*\*.+?\*\*/,              // 粗体 (**bold**)
  /\*.+?\*/,                  // 斜体 (*italic*)
  /__.+?__/,                  // 粗体 (__bold__)
  /_.+?_/,                    // 斜体 (_italic_)
  /\[.+?\]\(.+?\)/,           // 链接 [text](url)
  /!\[.*?\]\(.+?\)/,          // 图片 ![alt](url)
  /^[-*+]\s+.+$/m,            // 无序列表
  /^\d+\.\s+.+$/m,            // 有序列表
  /^>\s+.+$/m,                // 引用块
  /`[^`]+`/,                  // 行内代码
  /^```[\s\S]*?```$/m,        // 代码块
  /^\|.+\|$/m,                // 表格
  /^---+$/m,                  // 分隔线
  /^___+$/m,                  // 分隔线
  /^\*\*\*+$/m,               // 分隔线
]

/**
 * Markdown 验证器
 *
 * 验证内容是否包含有效的 Markdown 语法。
 * 由于 Markdown 本质是纯文本的超集，验证相对宽松。
 */
export const markdownValidator: TypeValidator = {
  type: 'markdown',
  validate(content: string): TypeValidationResult {
    if (!content || content.trim() === '') {
      return {
        valid: false,
        error: '内容为空',
      }
    }

    // Markdown 验证相对宽松，只要是文本就可以被视为有效的 Markdown
    // 但我们可以检查是否包含常见的 Markdown 语法以提高置信度
    MARKDOWN_PATTERNS.some(pattern => pattern.test(content))

    // 即使没有 Markdown 语法，纯文本也是有效的 Markdown
    // 所以我们总是返回 valid: true
    return { valid: true }
  },
}

// ============================================
// CSV Validator
// ============================================

/**
 * CSV 验证器
 *
 * 验证内容是否符合 CSV 格式。
 * 支持逗号、分号、制表符作为分隔符。
 */
export const csvValidator: TypeValidator = {
  type: 'csv',
  validate(content: string): TypeValidationResult {
    if (!content || content.trim() === '') {
      return {
        valid: false,
        error: '内容为空',
      }
    }

    const lines = content.trim().split(/\r?\n/)
    
    if (lines.length === 0) {
      return {
        valid: false,
        error: '输出不是有效的 CSV 格式：没有数据行',
      }
    }

    // 检测分隔符（逗号、分号、制表符）
    const firstLine = lines[0]
    let delimiter: string | null = null
    
    if (firstLine.includes(',')) {
      delimiter = ','
    } else if (firstLine.includes(';')) {
      delimiter = ';'
    } else if (firstLine.includes('\t')) {
      delimiter = '\t'
    }

    if (!delimiter) {
      // 单列 CSV 也是有效的
      if (lines.length >= 1) {
        return { valid: true }
      }
      return {
        valid: false,
        error: '输出不是有效的 CSV 格式：未检测到分隔符（逗号、分号或制表符）',
      }
    }

    // 解析 CSV 并检查列数一致性
    const columnCounts: number[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '') continue // 跳过空行
      
      // 简单的列计数（不处理引号内的分隔符）
      const columns = parseCSVLine(line, delimiter)
      columnCounts.push(columns.length)
    }

    if (columnCounts.length === 0) {
      return {
        valid: false,
        error: '输出不是有效的 CSV 格式：没有有效数据行',
      }
    }

    // 检查列数是否一致（允许一定的容差）
    const firstColumnCount = columnCounts[0]
    const inconsistentRows = columnCounts.filter(count => count !== firstColumnCount)
    
    if (inconsistentRows.length > columnCounts.length * 0.2) {
      // 超过 20% 的行列数不一致
      return {
        valid: false,
        error: `输出不是有效的 CSV 格式：列数不一致（第一行有 ${firstColumnCount} 列，但有 ${inconsistentRows.length} 行列数不同）`,
      }
    }

    return { valid: true }
  },
}

/**
 * 解析 CSV 行，处理引号内的分隔符
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 转义的引号
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current)
  return result
}

// ============================================
// Initialize Default Validators
// ============================================

// 注册默认验证器
registerValidator(jsonValidator)
registerValidator(htmlValidator)
registerValidator(markdownValidator)
registerValidator(csvValidator)
