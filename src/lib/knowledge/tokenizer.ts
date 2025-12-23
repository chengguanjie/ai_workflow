/**
 * Token 计数工具
 * 使用 gpt-tokenizer 实现准确的 token 计数
 */

import { encode, encodeChat, decode } from 'gpt-tokenizer'

/**
 * 计算文本的 token 数量
 * @param text 要计数的文本
 * @returns token 数量
 */
export function countTokens(text: string): number {
  if (!text) return 0
  try {
    return encode(text).length
  } catch {
    // 如果编码失败，使用估算值
    return estimateTokens(text)
  }
}

/**
 * 估算文本的 token 数量（降级方案）
 * 中文约 1.5-2 字符/token，英文约 4 字符/token
 * @param text 要估算的文本
 * @returns 估算的 token 数量
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  // 分别统计中文和英文字符
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars

  // 中文约 1.5 字符/token，英文约 4 字符/token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

/**
 * 批量计算多个文本的 token 数量
 * @param texts 文本数组
 * @returns token 数量数组
 */
export function countTokensBatch(texts: string[]): number[] {
  return texts.map(countTokens)
}

/**
 * 计算总 token 数量
 * @param texts 文本数组
 * @returns 总 token 数量
 */
export function countTotalTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + countTokens(text), 0)
}

/**
 * 对聊天消息计算 token（包含特殊标记）
 * @param messages 聊天消息数组
 * @returns token 数量
 */
export function countChatTokens(
  messages: Array<{ role: string; content: string }>
): number {
  try {
    const chatMessages = messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }))
    return encodeChat(chatMessages).length
  } catch {
    // 降级：简单累加各消息的 token + 每条消息约 4 token 的开销
    return messages.reduce(
      (sum, msg) => sum + countTokens(msg.content) + 4,
      3 // 基础开销
    )
  }
}

/**
 * 截断文本到指定的最大 token 数
 * @param text 要截断的文本
 * @param maxTokens 最大 token 数
 * @returns 截断后的文本
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (!text || maxTokens <= 0) return ''

  try {
    const tokens = encode(text)
    if (tokens.length <= maxTokens) {
      return text
    }
    return decode(tokens.slice(0, maxTokens))
  } catch {
    // 降级方案：按字符估算截断
    const avgCharsPerToken = text.length / estimateTokens(text)
    const maxChars = Math.floor(maxTokens * avgCharsPerToken)
    return text.slice(0, maxChars)
  }
}

/**
 * 检查文本是否超过 token 限制
 * @param text 要检查的文本
 * @param maxTokens 最大 token 数
 * @returns 是否超过限制
 */
export function exceedsTokenLimit(text: string, maxTokens: number): boolean {
  return countTokens(text) > maxTokens
}

/**
 * 计算剩余可用 token 数
 * @param usedTokens 已使用的 token 数
 * @param maxTokens 最大 token 数
 * @returns 剩余 token 数
 */
export function remainingTokens(usedTokens: number, maxTokens: number): number {
  return Math.max(0, maxTokens - usedTokens)
}

const TokenizerModule = {
  countTokens,
  estimateTokens,
  countTokensBatch,
  countTotalTokens,
  countChatTokens,
  truncateToTokenLimit,
  exceedsTokenLimit,
  remainingTokens,
}

export default TokenizerModule
