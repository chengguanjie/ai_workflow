/**
 * 输出完整性检查器
 * 
 * 检测 AI 输出是否被截断或不完整。
 * 
 * 检测模式包括：
 * - 未闭合的括号（JSON、代码）
 * - 句子中断（句子未完成）
 * - 列表中断（列表项未完成）
 * - 代码块中断（代码块未闭合）
 */

import type { OutputType } from '../debug-panel/types'
import type { CompletenessResult } from './types'

// ============================================
// Truncation Patterns
// ============================================

/**
 * 常见的截断模式
 */
const TRUNCATION_PATTERNS = {
  // 英文句子中断（以常见连接词结尾）
  englishSentenceInterruption: {
    pattern: /\b(and|or|but|the|a|an|is|are|was|were|will|would|could|should|that|which|who|whom|whose|where|when|while|if|then|because|since|although|though|however|therefore|moreover|furthermore|additionally|finally|firstly|secondly|thirdly|lastly|namely|specifically|particularly|especially|including|such as|for example|for instance|in addition|on the other hand|in contrast|as a result|in conclusion|to summarize|in summary)\s*$/i,
    reason: '句子可能在连接词后被截断',
  },
  
  // 中文句子中断（以常见连接词结尾）- 使用单独的模式
  chineseSentenceInterruption: {
    pattern: /(和|或|但|是|在|有|这|那|因为|所以|如果|虽然|但是|然而|因此|此外|另外|首先|其次|最后|例如|比如|包括|特别是|尤其是|总之|综上所述)\s*$/,
    reason: '句子可能在连接词后被截断',
  },
  
  // 列表中断（以列表标记开头但没有内容）
  listInterruption: {
    pattern: /(?:^|\n)\s*(?:\d+\.|[-*•])\s*$/,
    reason: '列表项可能被截断',
  },
  
  // 冒号后中断
  colonInterruption: {
    pattern: /:\s*$/,
    reason: '内容可能在冒号后被截断',
  },
}

// ============================================
// Type-Specific Completeness Checks
// ============================================

/**
 * 检查 JSON 完整性
 */
function checkJsonCompleteness(content: string): CompletenessResult {
  const trimmed = content.trim()
  
  // 检查是否以 JSON 结构字符开头
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { complete: true }
  }
  
  // 计算括号平衡
  let braceCount = 0
  let bracketCount = 0
  let inString = false
  let escapeNext = false
  
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    
    if (escapeNext) {
      escapeNext = false
      continue
    }
    
    if (char === '\\') {
      escapeNext = true
      continue
    }
    
    if (char === '"') {
      inString = !inString
      continue
    }
    
    if (!inString) {
      if (char === '{') braceCount++
      else if (char === '}') braceCount--
      else if (char === '[') bracketCount++
      else if (char === ']') bracketCount--
    }
  }
  
  if (braceCount > 0) {
    return {
      complete: false,
      reason: `JSON 不完整：缺少 ${braceCount} 个闭合大括号 }`,
      truncationPattern: 'unclosed_braces',
    }
  }
  
  if (bracketCount > 0) {
    return {
      complete: false,
      reason: `JSON 不完整：缺少 ${bracketCount} 个闭合方括号 ]`,
      truncationPattern: 'unclosed_brackets',
    }
  }
  
  // 检查是否在字符串中结束
  if (inString) {
    return {
      complete: false,
      reason: 'JSON 不完整：字符串未闭合',
      truncationPattern: 'unclosed_string',
    }
  }
  
  return { complete: true }
}

/**
 * 检查 HTML 完整性
 */
function checkHtmlCompleteness(content: string): CompletenessResult {
  // 检查未闭合的标签
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
      const lastOpenTag = openTags.pop()
      if (lastOpenTag !== tagName) {
        // 标签不匹配，可能是截断
        if (lastOpenTag) {
          openTags.push(lastOpenTag) // 恢复
        }
      }
    } else if (!fullTag.startsWith('<!')) {
      // 开始标签（排除注释和声明）
      openTags.push(tagName)
    }
  }
  
  // 检查是否有重要的未闭合标签
  const importantTags = ['html', 'body', 'head', 'div', 'table', 'ul', 'ol', 'form']
  const unclosedImportant = openTags.filter(tag => importantTags.includes(tag))
  
  if (unclosedImportant.length > 0) {
    return {
      complete: false,
      reason: `HTML 可能不完整：标签 <${unclosedImportant.join('>, <')}> 未闭合`,
      truncationPattern: 'unclosed_html_tags',
    }
  }
  
  return { complete: true }
}

/**
 * 检查代码完整性
 */
function checkCodeCompleteness(content: string): CompletenessResult {
  // 检查未闭合的代码块
  const codeBlockMatches = content.match(/```/g)
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    return {
      complete: false,
      reason: '代码块未闭合：缺少结束的 ```',
      truncationPattern: 'unclosed_code_block',
    }
  }
  
  // 检查括号平衡（简化检查，不处理字符串内的括号）
  let braceCount = 0
  let bracketCount = 0
  let parenCount = 0
  
  for (const char of content) {
    if (char === '{') braceCount++
    else if (char === '}') braceCount--
    else if (char === '[') bracketCount++
    else if (char === ']') bracketCount--
    else if (char === '(') parenCount++
    else if (char === ')') parenCount--
  }
  
  if (braceCount > 2) {
    return {
      complete: false,
      reason: `代码可能不完整：缺少 ${braceCount} 个闭合大括号`,
      truncationPattern: 'unclosed_braces',
    }
  }

  if (bracketCount > 2) {
    return {
      complete: false,
      reason: `代码可能不完整：缺少 ${bracketCount} 个闭合中括号`,
      truncationPattern: 'unclosed_brackets',
    }
  }

  if (parenCount > 2) {
    return {
      complete: false,
      reason: `代码可能不完整：缺少 ${parenCount} 个闭合小括号`,
      truncationPattern: 'unclosed_parentheses',
    }
  }
  
  return { complete: true }
}

// ============================================
// General Completeness Check
// ============================================

/**
 * 检查通用文本完整性
 */
function checkGeneralCompleteness(content: string): CompletenessResult {
  const trimmed = content.trim()
  
  // 检查各种截断模式
  for (const [key, { pattern, reason }] of Object.entries(TRUNCATION_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return {
        complete: false,
        reason,
        truncationPattern: key,
      }
    }
  }
  
  // 检查是否以省略号结尾（可能是有意的，但也可能是截断）
  if (trimmed.endsWith('...') || trimmed.endsWith('…')) {
    // 这可能是有意的省略，不标记为不完整
    return { complete: true }
  }
  
  // 检查是否以逗号结尾（可能是列表被截断）
  if (trimmed.endsWith(',')) {
    return {
      complete: false,
      reason: '内容可能在逗号后被截断',
      truncationPattern: 'comma_truncation',
    }
  }
  
  return { complete: true }
}

// ============================================
// Main Function
// ============================================

/**
 * 检查输出内容是否完整
 * 
 * 根据期望的输出类型执行相应的完整性检查。
 * 
 * @param content - 要检查的内容
 * @param expectedType - 期望的输出类型（可选）
 * @returns 完整性检查结果
 */
export function isOutputComplete(
  content: string,
  expectedType?: OutputType
): CompletenessResult {
  // 空内容视为完整（空检查由其他验证器处理）
  if (!content || content.trim() === '') {
    return { complete: true }
  }
  
  // 根据类型执行特定检查
  switch (expectedType) {
    case 'json':
      return checkJsonCompleteness(content)
    
    case 'html':
      return checkHtmlCompleteness(content)
    
    case 'text':
    case 'csv':
    default:
      // 对于文本和其他类型，执行通用检查
      const generalResult = checkGeneralCompleteness(content)
      if (!generalResult.complete) {
        return generalResult
      }
      
      // 额外检查代码块
      return checkCodeCompleteness(content)
  }
}
