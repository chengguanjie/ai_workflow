/**
 * 窗口扩展检索模块
 * 实现上下文窗口扩展，获取搜索结果的相邻分块
 * 用于提供更完整的上下文信息
 */

import { prisma } from '@/lib/db'
import type { SearchResult } from './search'

/**
 * 窗口扩展选项
 */
export interface WindowExpansionOptions {
  // 向前扩展的分块数量
  windowBefore?: number
  // 向后扩展的分块数量
  windowAfter?: number
  // 最大上下文长度（字符数）
  maxContextLength?: number
  // 是否保留原始分块边界标记
  preserveBoundaries?: boolean
}

/**
 * 扩展后的搜索结果
 */
export interface ExpandedSearchResult extends SearchResult {
  // 扩展后的完整上下文
  expandedContent: string
  // 前面的分块内容
  beforeContext: string
  // 后面的分块内容
  afterContext: string
  // 包含的分块 ID 列表
  includedChunkIds: string[]
  // 原始分块在扩展内容中的位置
  originalOffset: {
    start: number
    end: number
  }
}

/**
 * 邻居分块信息
 */
interface NeighborChunk {
  id: string
  content: string
  chunkIndex: number
  documentId: string
}

/**
 * 对搜索结果进行窗口扩展
 * 获取每个结果的相邻分块，组合成更完整的上下文
 */
export async function expandSearchResults(
  results: SearchResult[],
  options: WindowExpansionOptions = {}
): Promise<ExpandedSearchResult[]> {
  const {
    windowBefore = 1,
    windowAfter = 1,
    maxContextLength = 2000,
    preserveBoundaries = true,
  } = options

  if (results.length === 0) {
    return []
  }

  // 获取所有相关的分块 ID
  const chunkIds = results.map(r => r.chunkId)

  // 获取这些分块的详细信息（包括索引）
  const chunks = await prisma.documentChunk.findMany({
    where: { id: { in: chunkIds } },
    select: {
      id: true,
      content: true,
      chunkIndex: true,
      documentId: true,
    },
  })

  const chunkMap = new Map(chunks.map(c => [c.id, c]))

  // 对每个结果进行窗口扩展
  const expandedResults: ExpandedSearchResult[] = []

  for (const result of results) {
    const chunk = chunkMap.get(result.chunkId)
    if (!chunk) {
      expandedResults.push({
        ...result,
        expandedContent: result.content,
        beforeContext: '',
        afterContext: '',
        includedChunkIds: [result.chunkId],
        originalOffset: { start: 0, end: result.content.length },
      })
      continue
    }

    // 获取相邻分块
    const neighbors = await getNeighborChunks(
      chunk.documentId,
      chunk.chunkIndex,
      windowBefore,
      windowAfter
    )

    // 组合上下文
    const { beforeContent, afterContent, allChunkIds } = combineContext(
      chunk,
      neighbors,
      maxContextLength,
      preserveBoundaries
    )

    // 计算原始分块在扩展内容中的位置
    const originalStart = beforeContent.length
    const originalEnd = originalStart + chunk.content.length

    expandedResults.push({
      ...result,
      expandedContent: beforeContent + chunk.content + afterContent,
      beforeContext: beforeContent,
      afterContext: afterContent,
      includedChunkIds: allChunkIds,
      originalOffset: { start: originalStart, end: originalEnd },
    })
  }

  return expandedResults
}

/**
 * 获取相邻分块
 */
async function getNeighborChunks(
  documentId: string,
  currentIndex: number,
  windowBefore: number,
  windowAfter: number
): Promise<{
  before: NeighborChunk[]
  after: NeighborChunk[]
}> {
  // 获取前面的分块
  const beforeChunks = await prisma.documentChunk.findMany({
    where: {
      documentId,
      chunkIndex: {
        gte: Math.max(0, currentIndex - windowBefore),
        lt: currentIndex,
      },
    },
    select: {
      id: true,
      content: true,
      chunkIndex: true,
      documentId: true,
    },
    orderBy: { chunkIndex: 'asc' },
  })

  // 获取后面的分块
  const afterChunks = await prisma.documentChunk.findMany({
    where: {
      documentId,
      chunkIndex: {
        gt: currentIndex,
        lte: currentIndex + windowAfter,
      },
    },
    select: {
      id: true,
      content: true,
      chunkIndex: true,
      documentId: true,
    },
    orderBy: { chunkIndex: 'asc' },
  })

  return {
    before: beforeChunks,
    after: afterChunks,
  }
}

/**
 * 组合上下文
 */
function combineContext(
  currentChunk: NeighborChunk,
  neighbors: { before: NeighborChunk[]; after: NeighborChunk[] },
  maxLength: number,
  preserveBoundaries: boolean
): {
  beforeContent: string
  afterContent: string
  allChunkIds: string[]
} {
  const allChunkIds: string[] = []
  let beforeContent = ''
  let afterContent = ''

  // 当前分块的长度
  const currentLength = currentChunk.content.length

  // 计算可用于扩展的长度（前后各一半）
  const availableLength = Math.max(0, maxLength - currentLength)
  const halfAvailable = Math.floor(availableLength / 2)

  // 添加前面的分块（从最近的开始）
  const reversedBefore = [...neighbors.before].reverse()
  let beforeLength = 0
  const beforeParts: string[] = []

  for (const chunk of reversedBefore) {
    if (beforeLength + chunk.content.length > halfAvailable) {
      // 部分添加
      const remaining = halfAvailable - beforeLength
      if (remaining > 100) { // 至少保留100字符才有意义
        const truncated = truncateFromStart(chunk.content, remaining)
        beforeParts.unshift(truncated)
        allChunkIds.unshift(chunk.id)
      }
      break
    }
    beforeParts.unshift(chunk.content)
    allChunkIds.unshift(chunk.id)
    beforeLength += chunk.content.length
  }

  // 添加后面的分块
  let afterLength = 0
  const afterParts: string[] = []
  // 可以使用剩余的前面空间
  const afterAvailable = availableLength - beforeLength

  for (const chunk of neighbors.after) {
    if (afterLength + chunk.content.length > afterAvailable) {
      // 部分添加
      const remaining = afterAvailable - afterLength
      if (remaining > 100) {
        const truncated = truncateFromEnd(chunk.content, remaining)
        afterParts.push(truncated)
        allChunkIds.push(chunk.id)
      }
      break
    }
    afterParts.push(chunk.content)
    allChunkIds.push(chunk.id)
    afterLength += chunk.content.length
  }

  // 添加当前分块 ID
  allChunkIds.push(currentChunk.id)

  // 组合内容
  const separator = preserveBoundaries ? '\n\n---\n\n' : '\n\n'
  beforeContent = beforeParts.join(separator)
  afterContent = afterParts.join(separator)

  // 添加分隔符
  if (beforeContent && preserveBoundaries) {
    beforeContent += separator
  }
  if (afterContent && preserveBoundaries) {
    afterContent = separator + afterContent
  }

  return { beforeContent, afterContent, allChunkIds }
}

/**
 * 从开头截断文本（保留句子边界）
 */
function truncateFromStart(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const truncated = text.slice(text.length - maxLength)

  // 找到第一个句子边界
  const sentenceEnd = truncated.search(/[。！？.!?]\s*/u)
  if (sentenceEnd !== -1 && sentenceEnd < truncated.length / 2) {
    return '...' + truncated.slice(sentenceEnd + 1).trim()
  }

  return '...' + truncated.trim()
}

/**
 * 从结尾截断文本（保留句子边界）
 */
function truncateFromEnd(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const truncated = text.slice(0, maxLength)

  // 找到最后一个句子边界
  const lastSentenceEnd = truncated.search(/[。！？.!?]\s*$/u)
  if (lastSentenceEnd !== -1 && lastSentenceEnd > truncated.length / 2) {
    return truncated.slice(0, lastSentenceEnd + 1).trim() + '...'
  }

  return truncated.trim() + '...'
}

/**
 * 获取文档的所有分块（按顺序）
 */
export async function getDocumentChunksOrdered(
  documentId: string,
  startIndex?: number,
  endIndex?: number
): Promise<NeighborChunk[]> {
  const where: Record<string, unknown> = { documentId }

  if (startIndex !== undefined || endIndex !== undefined) {
    where.chunkIndex = {}
    if (startIndex !== undefined) {
      (where.chunkIndex as Record<string, number>).gte = startIndex
    }
    if (endIndex !== undefined) {
      (where.chunkIndex as Record<string, number>).lte = endIndex
    }
  }

  return prisma.documentChunk.findMany({
    where,
    select: {
      id: true,
      content: true,
      chunkIndex: true,
      documentId: true,
    },
    orderBy: { chunkIndex: 'asc' },
  })
}

/**
 * 合并相邻的搜索结果
 * 如果多个结果来自同一文档的相邻分块，合并它们
 */
export function mergeAdjacentResults(
  results: ExpandedSearchResult[],
  maxGap: number = 1
): ExpandedSearchResult[] {
  if (results.length <= 1) return results

  // 按文档和分块索引排序
  const sorted = [...results].sort((a, b) => {
    if (a.documentId !== b.documentId) {
      return a.documentId.localeCompare(b.documentId)
    }
    // 需要获取分块索引来排序
    return 0
  })

  // TODO: 实现相邻结果合并逻辑
  // 这需要额外获取分块索引信息

  return sorted
}

export default expandSearchResults
