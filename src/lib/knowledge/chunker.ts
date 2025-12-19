/**
 * 文本分块器
 * 将长文本分割成适合向量化的小块
 */

export interface TextChunk {
  content: string
  index: number
  startOffset: number
  endOffset: number
  metadata?: Record<string, unknown>
}

export interface ChunkingOptions {
  chunkSize: number // 每个分块的目标字符数
  chunkOverlap: number // 分块之间的重叠字符数
  separators?: string[] // 分割符优先级列表
}

const DEFAULT_SEPARATORS = [
  '\n\n', // 段落
  '\n', // 换行
  '。', // 中文句号
  '！', // 中文感叹号
  '？', // 中文问号
  '.', // 英文句号
  '!', // 英文感叹号
  '?', // 英文问号
  '；', // 中文分号
  ';', // 英文分号
  '，', // 中文逗号
  ',', // 英文逗号
  ' ', // 空格
  '', // 字符级别
]

/**
 * 递归文本分块
 * 类似 LangChain 的 RecursiveCharacterTextSplitter
 */
export function splitText(text: string, options: ChunkingOptions): TextChunk[] {
  const { chunkSize, chunkOverlap, separators = DEFAULT_SEPARATORS } = options

  if (chunkOverlap >= chunkSize) {
    throw new Error('分块重叠不能大于等于分块大小')
  }

  const chunks: TextChunk[] = []
  let currentOffset = 0

  // 递归分割
  const splitRecursive = (text: string, separatorIndex: number): string[] => {
    if (text.length <= chunkSize) {
      return [text]
    }

    const separator = separators[separatorIndex]

    // 如果已经没有分隔符了，直接按字符分割
    if (separator === '' || separatorIndex >= separators.length - 1) {
      return splitByLength(text, chunkSize, chunkOverlap)
    }

    // 按当前分隔符分割
    const parts = text.split(separator)

    // 如果只有一个部分，说明没有这���分隔符，尝试下一个
    if (parts.length === 1) {
      return splitRecursive(text, separatorIndex + 1)
    }

    // 合并小块，确保不超过 chunkSize
    const mergedParts: string[] = []
    let currentPart = ''

    for (const part of parts) {
      const potentialPart = currentPart
        ? currentPart + separator + part
        : part

      if (potentialPart.length <= chunkSize) {
        currentPart = potentialPart
      } else {
        // 当前部分已满，保存并开始新部分
        if (currentPart) {
          mergedParts.push(currentPart)
        }

        // 如果单个部分就超过了 chunkSize，需要进一步分割
        if (part.length > chunkSize) {
          const subParts = splitRecursive(part, separatorIndex + 1)
          mergedParts.push(...subParts)
          currentPart = ''
        } else {
          currentPart = part
        }
      }
    }

    // 保存最后一部分
    if (currentPart) {
      mergedParts.push(currentPart)
    }

    return mergedParts
  }

  // 按长度强制分割（最后的手段）
  const splitByLength = (text: string, size: number, overlap: number): string[] => {
    const result: string[] = []
    let start = 0

    while (start < text.length) {
      const end = Math.min(start + size, text.length)
      result.push(text.slice(start, end))
      start = end - overlap
      if (start >= text.length - overlap) break
    }

    return result
  }

  // 执行分割
  const textChunks = splitRecursive(text.trim(), 0)

  // 添加重叠
  for (let i = 0; i < textChunks.length; i++) {
    const content = textChunks[i].trim()

    // 跳过空块
    if (!content) continue

    // 计算偏移量
    const startOffset = currentOffset
    const endOffset = currentOffset + content.length

    chunks.push({
      content,
      index: chunks.length,
      startOffset,
      endOffset,
    })

    // 更新偏移量（考虑重叠）
    currentOffset = endOffset - chunkOverlap
    if (currentOffset < 0) currentOffset = 0
  }

  return chunks
}

/**
 * 计算文本的预估分块数
 */
export function estimateChunkCount(
  textLength: number,
  chunkSize: number,
  chunkOverlap: number
): number {
  if (textLength <= chunkSize) return 1
  const effectiveChunkSize = chunkSize - chunkOverlap
  return Math.ceil((textLength - chunkOverlap) / effectiveChunkSize)
}

/**
 * 合并相邻的小块
 */
export function mergeSmallChunks(
  chunks: TextChunk[],
  minChunkSize: number
): TextChunk[] {
  if (chunks.length <= 1) return chunks

  const result: TextChunk[] = []
  let currentChunk: TextChunk | null = null

  for (const chunk of chunks) {
    if (!currentChunk) {
      currentChunk = { ...chunk }
      continue
    }

    // 如果当前块太小，合并到下一个
    if (currentChunk.content.length < minChunkSize) {
      currentChunk = {
        content: currentChunk.content + '\n' + chunk.content,
        index: currentChunk.index,
        startOffset: currentChunk.startOffset,
        endOffset: chunk.endOffset,
        metadata: { ...currentChunk.metadata, ...chunk.metadata },
      }
    } else {
      result.push(currentChunk)
      currentChunk = { ...chunk }
    }
  }

  // 添加最后一个块
  if (currentChunk) {
    result.push(currentChunk)
  }

  // 重新编号
  return result.map((chunk, index) => ({
    ...chunk,
    index,
  }))
}
