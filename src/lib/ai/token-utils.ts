/**
 * Token counting utilities for managing AI context limits
 */

// Tiktoken interface
interface TiktokenEncoding {
  encode(text: string): { length: number };
  free(): void;
}

interface Tiktoken {
  encoding_for_model(model: string): TiktokenEncoding;
}

// tiktoken is optional - fallback to estimation if not available
let encoding_for_model: ((model: string) => TiktokenEncoding) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tiktoken = require('tiktoken') as Tiktoken
  encoding_for_model = tiktoken.encoding_for_model
} catch {
  // tiktoken not available, use estimation
}

/**
 * Rough estimation of tokens without loading tiktoken
 * Approximately 1 token per 4 characters for English/Chinese mixed text
 */
export function estimateTokenCount(text: string): number {
  // Handle empty strings
  if (!text) return 0

  // Rough estimation: 1 token ≈ 4 characters (conservative estimate)
  // This is faster than using tiktoken for large texts
  return Math.ceil(text.length / 3)
}

/**
 * Accurate token counting using tiktoken
 * Note: This is slower but more accurate
 */
export async function countTokensAccurate(text: string, model: string = 'gpt-3.5-turbo'): Promise<number> {
  try {
    if (!encoding_for_model) throw new Error('tiktoken not available')
    const encoding = encoding_for_model(model)
    const tokens = encoding.encode(text)
    const count = tokens.length
    encoding.free()
    return count
  } catch (error) {
    // Fallback to estimation if tiktoken fails
    console.warn('Failed to count tokens accurately, using estimation:', error)
    return estimateTokenCount(text)
  }
}

/**
 * Context limits for different models
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI models
  'gpt-3.5-turbo': 16385,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,

  // Anthropic models
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-2.1': 200000,
  'claude-2': 100000,

  // Default fallback
  'default': 16385
}

/**
 * Get context limit for a model
 */
export function getModelContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] || MODEL_CONTEXT_LIMITS.default
}

/**
 * Calculate available tokens after accounting for prompt and response
 */
export function calculateAvailableTokens(
  model: string,
  promptTokens: number,
  maxResponseTokens: number = 2000
): number {
  const contextLimit = getModelContextLimit(model)
  const available = contextLimit - promptTokens - maxResponseTokens
  return Math.max(0, available)
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokenLimit(
  text: string,
  maxTokens: number,
  ellipsis: string = '... [truncated]'
): string {
  const estimatedTokens = estimateTokenCount(text)

  if (estimatedTokens <= maxTokens) {
    return text
  }

  // Calculate approximate character limit (3 chars per token)
  const charLimit = maxTokens * 3
  const ellipsisLength = ellipsis.length

  if (charLimit <= ellipsisLength) {
    return ellipsis
  }

  return text.substring(0, charLimit - ellipsisLength) + ellipsis
}

/**
 * Smart text truncation that preserves important parts
 */
export function smartTruncate(
  text: string,
  maxTokens: number,
  options: {
    preserveStart?: number  // Number of tokens to preserve from start
    preserveEnd?: number    // Number of tokens to preserve from end
    priorityMarkers?: string[] // Strings that indicate important sections
  } = {}
): string {
  const {
    preserveStart = Math.floor(maxTokens * 0.3),
    preserveEnd = Math.floor(maxTokens * 0.2),
    priorityMarkers = ['error', 'Error', 'ERROR', '错误', '失败', 'failed', 'Failed']
  } = options

  const estimatedTokens = estimateTokenCount(text)

  if (estimatedTokens <= maxTokens) {
    return text
  }

  // Calculate character positions
  const startChars = preserveStart * 3
  const endChars = preserveEnd * 3
  const middleTokens = maxTokens - preserveStart - preserveEnd - 10 // Reserve 10 tokens for ellipsis

  if (middleTokens <= 0) {
    return truncateToTokenLimit(text, maxTokens)
  }

  // Extract start and end
  const startText = text.substring(0, startChars)
  const endText = text.substring(text.length - endChars)

  // Try to find priority content in the middle
  const middleStart = startChars
  const middleEnd = text.length - endChars
  const middleText = text.substring(middleStart, middleEnd)

  // Find priority sections
  let priorityContent = ''
  for (const marker of priorityMarkers) {
    const index = middleText.toLowerCase().indexOf(marker.toLowerCase())
    if (index !== -1) {
      // Extract context around the marker
      const contextStart = Math.max(0, index - 100)
      const contextEnd = Math.min(middleText.length, index + 500)
      priorityContent += '\n...\n' + middleText.substring(contextStart, contextEnd)

      if (estimateTokenCount(priorityContent) > middleTokens * 3) {
        break
      }
    }
  }

  if (priorityContent) {
    return startText + '\n... [content truncated] ...\n' + priorityContent + '\n... [content truncated] ...\n' + endText
  } else {
    return startText + '\n... [content truncated] ...\n' + endText
  }
}

/**
 * Validate if text fits within model's context limit
 */
export function validateContextSize(
  text: string,
  model: string,
  maxResponseTokens: number = 2000
): { valid: boolean; estimatedTokens: number; limit: number; available: number } {
  const estimatedTokens = estimateTokenCount(text)
  const limit = getModelContextLimit(model)
  const available = calculateAvailableTokens(model, estimatedTokens, maxResponseTokens)

  return {
    valid: available > 0,
    estimatedTokens,
    limit,
    available
  }
}