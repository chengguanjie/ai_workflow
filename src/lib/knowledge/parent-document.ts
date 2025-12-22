/**
 * 父文档检索模块
 * 实现双层分块策略：小块用于精确匹配，大块（父块）用于提供完整上下文
 *
 * 核心思想：
 * 1. 创建两层分块：小块（child chunks）和大块（parent chunks）
 * 2. 使用小块进行向量搜索（更精确）
 * 3. 返回匹配的小块所属的父块（更完整的上下文）
 */

import { splitText } from './chunker'
import type { SearchResult } from './search'

/**
 * 双层分块配置
 */
export interface TwoLevelChunkConfig {
  // 父块（大块）配置
  parentChunkSize: number      // 默认 2000
  parentChunkOverlap: number   // 默认 200
  // 子块（小块）配置
  childChunkSize: number       // 默认 400
  childChunkOverlap: number    // 默认 50
}

/**
 * 子块信息
 */
export interface ChildChunk {
  id: string
  content: string
  index: number
  startOffset: number
  endOffset: number
  parentId: string        // 父块 ID
  parentIndex: number     // 父块索引
  metadata?: Record<string, unknown>
}

/**
 * 父块信息
 */
export interface ParentChunk {
  id: string
  content: string
  index: number
  startOffset: number
  endOffset: number
  children: ChildChunk[]
  metadata?: Record<string, unknown>
}

/**
 * 双层分块结果
 */
export interface TwoLevelChunkResult {
  parents: ParentChunk[]
  children: ChildChunk[]
  mapping: Map<string, string>  // childId -> parentId
}

/**
 * 执行双层分块
 * 先分成大块（父块），再将每个父块分成小块（子块）
 */
export function createTwoLevelChunks(
  text: string,
  config: Partial<TwoLevelChunkConfig> = {},
  documentId: string = ''
): TwoLevelChunkResult {
  const {
    parentChunkSize = 2000,
    parentChunkOverlap = 200,
    childChunkSize = 400,
    childChunkOverlap = 50,
  } = config

  // 第一层：创建父块
  const parentChunks = splitText(text, {
    chunkSize: parentChunkSize,
    chunkOverlap: parentChunkOverlap,
  })

  const parents: ParentChunk[] = []
  const children: ChildChunk[] = []
  const mapping = new Map<string, string>()

  let globalChildIndex = 0

  for (let parentIndex = 0; parentIndex < parentChunks.length; parentIndex++) {
    const parentChunk = parentChunks[parentIndex]
    const parentId = `${documentId}-p${parentIndex}`

    // 第二层：将父块分成子块
    const childChunks = splitText(parentChunk.content, {
      chunkSize: childChunkSize,
      chunkOverlap: childChunkOverlap,
    })

    const parentChildren: ChildChunk[] = []

    for (let i = 0; i < childChunks.length; i++) {
      const childChunk = childChunks[i]
      const childId = `${documentId}-c${globalChildIndex}`

      const child: ChildChunk = {
        id: childId,
        content: childChunk.content,
        index: globalChildIndex,
        // 计算在原文中的实际位置
        startOffset: parentChunk.startOffset + (childChunk.startOffset || 0),
        endOffset: parentChunk.startOffset + (childChunk.endOffset || childChunk.content.length),
        parentId,
        parentIndex,
        metadata: childChunk.metadata,
      }

      parentChildren.push(child)
      children.push(child)
      mapping.set(childId, parentId)
      globalChildIndex++
    }

    parents.push({
      id: parentId,
      content: parentChunk.content,
      index: parentIndex,
      startOffset: parentChunk.startOffset,
      endOffset: parentChunk.endOffset || (parentChunk.startOffset + parentChunk.content.length),
      children: parentChildren,
      metadata: parentChunk.metadata,
    })
  }

  return { parents, children, mapping }
}

/**
 * 父文档检索结果
 */
export interface ParentDocumentSearchResult extends SearchResult {
  // 父块内容
  parentContent: string
  // 父块 ID
  parentId: string
  // 匹配的子块在父块中的位置
  childOffsets: Array<{
    start: number
    end: number
  }>
  // 所有匹配的子块 ID
  matchedChildIds: string[]
}

/**
 * 从搜索结果中获取父文档
 * 将多个子块的搜索结果聚合到其父块
 */
export function aggregateToParentDocuments(
  childResults: SearchResult[],
  twoLevelData: TwoLevelChunkResult
): ParentDocumentSearchResult[] {
  const { parents, children } = twoLevelData

  // 按父块聚合结果
  const parentResultMap = new Map<string, {
    parentId: string
    parentContent: string
    matchedChildren: Array<{
      result: SearchResult
      child: ChildChunk
    }>
    maxScore: number
    totalScore: number
  }>()

  // 创建子块查找映射
  const childMap = new Map(children.map(c => [c.id, c]))

  for (const result of childResults) {
    const child = childMap.get(result.chunkId)
    if (!child) continue

    const parentId = child.parentId
    const parent = parents.find(p => p.id === parentId)
    if (!parent) continue

    const existing = parentResultMap.get(parentId)
    if (existing) {
      existing.matchedChildren.push({ result, child })
      existing.maxScore = Math.max(existing.maxScore, result.score)
      existing.totalScore += result.score
    } else {
      parentResultMap.set(parentId, {
        parentId,
        parentContent: parent.content,
        matchedChildren: [{ result, child }],
        maxScore: result.score,
        totalScore: result.score,
      })
    }
  }

  // 构建父文档检索结果
  const results: ParentDocumentSearchResult[] = []

  for (const [parentId, data] of parentResultMap) {
    // 按分数排序匹配的子块
    data.matchedChildren.sort((a, b) => b.result.score - a.result.score)

    const firstMatch = data.matchedChildren[0]
    const parent = parents.find(p => p.id === parentId)

    if (!firstMatch || !parent) continue

    results.push({
      chunkId: firstMatch.result.chunkId,
      documentId: firstMatch.result.documentId,
      documentName: firstMatch.result.documentName,
      content: firstMatch.result.content,
      // 使用平均分数或最高分数（可配置）
      score: data.maxScore,
      metadata: firstMatch.result.metadata,
      matchedKeywords: firstMatch.result.matchedKeywords,
      highlightedContent: firstMatch.result.highlightedContent,
      // 父文档特有字段
      parentContent: data.parentContent,
      parentId,
      childOffsets: data.matchedChildren.map(({ child }) => ({
        start: child.startOffset - parent.startOffset,
        end: child.endOffset - parent.startOffset,
      })),
      matchedChildIds: data.matchedChildren.map(({ child }) => child.id),
    })
  }

  // 按分数排序
  results.sort((a, b) => b.score - a.score)

  return results
}

/**
 * 高亮父文档中的匹配子块
 */
export function highlightMatchedChildren(
  parentContent: string,
  childOffsets: Array<{ start: number; end: number }>,
  highlightTag: { start: string; end: string } = { start: '【', end: '】' }
): string {
  if (childOffsets.length === 0) return parentContent

  // 按位置排序
  const sortedOffsets = [...childOffsets].sort((a, b) => a.start - b.start)

  // 合并重叠区域
  const mergedOffsets: Array<{ start: number; end: number }> = []
  for (const offset of sortedOffsets) {
    const last = mergedOffsets[mergedOffsets.length - 1]
    if (last && offset.start <= last.end) {
      last.end = Math.max(last.end, offset.end)
    } else {
      mergedOffsets.push({ ...offset })
    }
  }

  // 从后往前插入标记（避免偏移量变化）
  let result = parentContent
  for (let i = mergedOffsets.length - 1; i >= 0; i--) {
    const { start, end } = mergedOffsets[i]
    if (start >= 0 && end <= result.length) {
      result = result.slice(0, end) + highlightTag.end + result.slice(end)
      result = result.slice(0, start) + highlightTag.start + result.slice(start)
    }
  }

  return result
}

/**
 * 获取子块的父块内容
 */
export function getParentContent(
  childId: string,
  twoLevelData: TwoLevelChunkResult
): string | null {
  const parentId = twoLevelData.mapping.get(childId)
  if (!parentId) return null

  const parent = twoLevelData.parents.find(p => p.id === parentId)
  return parent?.content || null
}

/**
 * 默认双层分块配置
 */
export const DEFAULT_TWO_LEVEL_CONFIG: TwoLevelChunkConfig = {
  parentChunkSize: 2000,
  parentChunkOverlap: 200,
  childChunkSize: 400,
  childChunkOverlap: 50,
}

export default {
  createTwoLevelChunks,
  aggregateToParentDocuments,
  highlightMatchedChildren,
  getParentContent,
  DEFAULT_TWO_LEVEL_CONFIG,
}
