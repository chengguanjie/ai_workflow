/**
 * Node Optimization Service
 *
 * Provides AI-powered optimization suggestions for workflow nodes.
 * Analyzes node configuration and suggests improvements for
 * prompts, code, performance, and error handling.
 *
 * Requirements: 5.2, 5.3
 */

import type {
  NodeConfig,
  WorkflowConfig,
  ProcessNodeConfigData,
  CodeNodeConfigData,
} from '@/types/workflow'
import { prisma } from '@/lib/db'
import { aiService } from '@/lib/ai'
import { safeDecryptApiKey } from '@/lib/crypto'
import type { AIProviderType } from '@/lib/ai'

// ============================================
// Types
// ============================================

/**
 * Optimization suggestion impact level
 */
export type OptimizationImpact = 'high' | 'medium' | 'low'

/**
 * Optimization suggestion category
 */
export type OptimizationCategory = 'prompt' | 'performance' | 'error_handling' | 'clarity'

/**
 * Single optimization suggestion
 */
export interface OptimizationSuggestion {
  /** Unique identifier for the suggestion */
  id: string
  /** Short title for the suggestion */
  title: string
  /** Detailed description of what the suggestion does */
  description: string
  /** Rationale explaining why this improvement is recommended */
  rationale: string
  /** Suggested new configuration for the node */
  suggestedConfig: Record<string, unknown>
  /** Expected impact level of the suggestion */
  impact: OptimizationImpact
  /** Category of the optimization */
  category: OptimizationCategory
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Optimization request options
 */
export interface OptimizeNodeRequest {
  /** Whether to automatically apply the first suggestion */
  apply?: boolean
}

/**
 * Optimization response
 */
export interface OptimizeNodeResponse {
  /** List of optimization suggestions */
  suggestions: OptimizationSuggestion[]
  /** ID of the applied suggestion (if apply=true) */
  appliedSuggestion?: string
  /** Updated node configuration (if apply=true) */
  updatedNode?: NodeConfig
  /** Token usage for the AI analysis */
  tokenUsage: TokenUsage
}

// ============================================
// Constants
// ============================================

/** Node types that support optimization */
const OPTIMIZABLE_NODE_TYPES = ['PROCESS', 'CODE']

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a unique suggestion ID
 */
function generateSuggestionId(): string {
  return `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Build the optimization prompt for PROCESS nodes
 */
function buildProcessNodePrompt(node: NodeConfig, config: ProcessNodeConfigData): string {
  return `作为 AI 工作流优化专家，请分析以下 PROCESS 节点配置并提供优化建议。

节点名称: ${node.name}
节点类型: PROCESS (AI 处理节点)

当前配置:
- 系统提示词: ${config.systemPrompt || '(未设置)'}
- 用户提示词: ${config.userPrompt || '(未设置)'}
- 温度参数: ${config.temperature ?? '(默认)'}
- 最大 Token: ${config.maxTokens ?? '(默认)'}
- 期望输出类型: ${config.expectedOutputType || '(默认)'}

请从以下几个方面分析并提供优化建议:
1. 提示词清晰度和具体性
2. 提示词结构和格式
3. 参数配置优化
4. 错误处理和边界情况

请以 JSON 格式返回优化建议数组，每个建议包含:
{
  "suggestions": [
    {
      "title": "建议标题",
      "description": "详细描述",
      "rationale": "为什么这样改进",
      "category": "prompt|performance|error_handling|clarity",
      "impact": "high|medium|low",
      "suggestedConfig": {
        // 建议的配置更改
      }
    }
  ]
}

注意:
- 只返回有实际价值的建议，不要为了建议而建议
- suggestedConfig 只包含需要更改的字段
- 如果当前配置已经很好，可以返回空数组`
}

/**
 * Build the optimization prompt for CODE nodes
 */
function buildCodeNodePrompt(node: NodeConfig, config: CodeNodeConfigData): string {
  return `作为代码优化专家，请分析以下 CODE 节点配置并提供优化建议。

节点名称: ${node.name}
节点类型: CODE (代码执行节点)

当前代码:
\`\`\`javascript
${config.code || '// 无代码'}
\`\`\`

超时设置: ${config.timeout || '(未设置)'}ms

请从以下几个方面分析并提供优化建议:
1. 代码性能优化
2. 错误处理完善
3. 代码可读性和可维护性
4. 安全性考虑

请以 JSON 格式返回优化建议数组，每个建议包含:
{
  "suggestions": [
    {
      "title": "建议标题",
      "description": "详细描述",
      "rationale": "为什么这样改进",
      "category": "prompt|performance|error_handling|clarity",
      "impact": "high|medium|low",
      "suggestedConfig": {
        "code": "优化后的代码",
        "timeout": 30000
      }
    }
  ]
}

注意:
- 只返回有实际价值的建议
- suggestedConfig 只包含需要更改的字段
- 保持代码的原有功能不变
- 如果当前代码已经很好，可以返回空数组`
}

/**
 * Parse AI response to extract suggestions
 */
function parseAIResponse(content: string): OptimizationSuggestion[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    const rawSuggestions = parsed.suggestions || []

    // Validate and transform suggestions
    return rawSuggestions.map((s: Record<string, unknown>) => ({
      id: generateSuggestionId(),
      title: String(s.title || '优化建议'),
      description: String(s.description || ''),
      rationale: String(s.rationale || ''),
      suggestedConfig: (s.suggestedConfig as Record<string, unknown>) || {},
      impact: validateImpact(s.impact),
      category: validateCategory(s.category),
    }))
  } catch {
    console.error('Failed to parse AI optimization response')
    return []
  }
}

/**
 * Validate impact level
 */
function validateImpact(impact: unknown): OptimizationImpact {
  if (impact === 'high' || impact === 'medium' || impact === 'low') {
    return impact
  }
  return 'medium'
}

/**
 * Validate category
 */
function validateCategory(category: unknown): OptimizationCategory {
  if (
    category === 'prompt' ||
    category === 'performance' ||
    category === 'error_handling' ||
    category === 'clarity'
  ) {
    return category
  }
  return 'clarity'
}

// ============================================
// Main Service
// ============================================

/**
 * Node Optimization Service class
 */
export class NodeOptimizationService {
  /**
   * Get optimization suggestions for a node
   *
   * @param node - The node to optimize
   * @param workflowConfig - The full workflow configuration (for context)
   * @param organizationId - Organization ID for AI config lookup
   * @param options - Optimization options
   * @returns Optimization response with suggestions and token usage
   */
  async optimizeNode(
    node: NodeConfig,
    workflowConfig: WorkflowConfig,
    organizationId: string,
    options: OptimizeNodeRequest = {}
  ): Promise<OptimizeNodeResponse> {
    // Check if node type is optimizable
    if (!OPTIMIZABLE_NODE_TYPES.includes(node.type)) {
      return {
        suggestions: [],
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      }
    }

    // Get AI configuration
    const aiConfig = await this.getAIConfig(organizationId)
    if (!aiConfig) {
      throw new Error('未找到可用的 AI 配置')
    }

    // Build prompt based on node type
    const prompt = this.buildPrompt(node)

    // Call AI service
    const response = await aiService.chat(
      aiConfig.provider as AIProviderType,
      {
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 2000,
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )

    // Parse suggestions from response
    const suggestions = parseAIResponse(response.content || '')

    // Build token usage
    const tokenUsage: TokenUsage = {
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
    }

    // Apply first suggestion if requested
    let appliedSuggestion: string | undefined
    let updatedNode: NodeConfig | undefined

    if (options.apply && suggestions.length > 0) {
      const firstSuggestion = suggestions[0]
      appliedSuggestion = firstSuggestion.id
      updatedNode = this.applyOptimization(node, firstSuggestion)
    }

    return {
      suggestions,
      appliedSuggestion,
      updatedNode,
      tokenUsage,
    }
  }

  /**
   * Build optimization prompt based on node type
   */
  private buildPrompt(node: NodeConfig): string {
    const config = node.config as unknown

    switch (node.type) {
      case 'PROCESS':
        return buildProcessNodePrompt(node, config as ProcessNodeConfigData)
      case 'CODE':
        return buildCodeNodePrompt(node, config as CodeNodeConfigData)
      default:
        throw new Error(`不支持优化的节点类型: ${node.type}`)
    }
  }

  /**
   * Apply an optimization suggestion to a node
   */
  private applyOptimization(
    node: NodeConfig,
    suggestion: OptimizationSuggestion
  ): NodeConfig {
    // Create a new node with merged config
    const currentConfig = node.config as Record<string, unknown>
    const mergedConfig = {
      ...currentConfig,
      ...suggestion.suggestedConfig,
    }

    // Return a properly typed node based on the node type
    switch (node.type) {
      case 'PROCESS':
        return {
          ...node,
          type: 'PROCESS',
          config: mergedConfig as ProcessNodeConfigData,
        }
      case 'CODE':
        return {
          ...node,
          type: 'CODE',
          config: mergedConfig as CodeNodeConfigData,
        }
      default:
        // For other node types, return as-is (they shouldn't be optimized anyway)
        return node
    }
  }

  /**
   * Get AI configuration for the organization
   */
  private async getAIConfig(organizationId: string): Promise<{
    provider: string
    model: string
    apiKey: string
    baseUrl?: string
  } | null> {
    // First try to get organization's default AI config
    const orgConfig = await prisma.apiKey.findFirst({
      where: {
        organizationId,
        isDefault: true,
      },
    })

    if (orgConfig) {
      return {
        provider: orgConfig.provider,
        model: orgConfig.defaultModel || 'gpt-4o-mini',
        apiKey: safeDecryptApiKey(orgConfig.keyEncrypted),
        baseUrl: orgConfig.baseUrl || undefined,
      }
    }

    // Fall back to system default
    const systemConfig = await prisma.apiKey.findFirst({
      where: {
        isDefault: true,
      },
    })

    if (systemConfig) {
      return {
        provider: systemConfig.provider,
        model: systemConfig.defaultModel || 'gpt-4o-mini',
        apiKey: safeDecryptApiKey(systemConfig.keyEncrypted),
        baseUrl: systemConfig.baseUrl || undefined,
      }
    }

    return null
  }
}

// Export singleton instance
export const nodeOptimizationService = new NodeOptimizationService()
