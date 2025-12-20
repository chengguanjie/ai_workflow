/**
 * AI 诊断分析服务
 *
 * 用于分析工作流执行反馈，找出问题原因并生成优化建议
 */

import { prisma } from '@/lib/db'
import { IssueCategory, SuggestionType } from '@prisma/client'
import type { WorkflowConfig, NodeConfig } from '@/types/workflow'

// ============================================
// 类型定义
// ============================================

interface DiagnosisContext {
  workflow: {
    id: string
    name: string
    config: WorkflowConfig
  }
  execution: {
    id: string
    input: Record<string, unknown>
    output: Record<string, unknown> | null
    duration: number | null
    totalTokens: number
    logs: Array<{
      nodeId: string
      nodeName: string
      nodeType: string
      input: unknown
      output: unknown
      status: string
      error: string | null
    }>
  }
  feedback: {
    id: string
    rating: number
    isAccurate: boolean
    expectedOutput: string | null
    feedbackComment: string | null
    issueCategories: string[]
  }
}

interface DiagnosisResult {
  issueCategories: IssueCategory[]
  rootCauseAnalysis: {
    summary: string
    details: string[]
    confidence: number
  }
  suggestions: Array<{
    issueType: IssueCategory
    issueDescription: string
    rootCause: string
    suggestionType: SuggestionType
    suggestionTitle: string
    suggestionDetail: string
    suggestedChanges: SuggestedChange[]
    confidence: number
    priority: number
  }>
}

interface SuggestedChange {
  nodeId: string
  field: string
  oldValue: unknown
  newValue: unknown
  explanation: string
}

// ============================================
// AI 诊断服务
// ============================================

export class DiagnosisService {
  /**
   * 分析反馈并生成诊断结果
   */
  async analyzeFeedback(feedbackId: string): Promise<DiagnosisResult> {
    // 1. 获取反馈和执行上下文
    const feedback = await prisma.executionFeedback.findUnique({
      where: { id: feedbackId },
      include: {
        execution: {
          include: {
            logs: true,
            workflow: true,
          },
        },
      },
    })

    if (!feedback) {
      throw new Error('反馈不存在')
    }

    // 更新状态为分析中
    await prisma.executionFeedback.update({
      where: { id: feedbackId },
      data: { optimizationStatus: 'ANALYZING' },
    })

    try {
      // 2. 构建诊断上下文
      const context = this.buildContext(feedback)

      // 3. 执行诊断分析
      const result = await this.performDiagnosis(context)

      // 4. 保存诊断结果
      await prisma.executionFeedback.update({
        where: { id: feedbackId },
        data: {
          aiDiagnosis: result as object,
          diagnosedAt: new Date(),
          optimizationStatus: 'SUGGESTED',
        },
      })

      // 5. 创建优化建议
      await this.createSuggestions(feedbackId, feedback.execution.workflowId, result)

      return result
    } catch (error) {
      // 更新状态为失败
      await prisma.executionFeedback.update({
        where: { id: feedbackId },
        data: { optimizationStatus: 'PENDING' },
      })
      throw error
    }
  }

  /**
   * 构建诊断上下文
   */
  private buildContext(feedback: {
    id: string
    rating: number
    isAccurate: boolean
    expectedOutput: string | null
    feedbackComment: string | null
    issueCategories: unknown
    execution: {
      id: string
      input: unknown
      output: unknown
      duration: number | null
      totalTokens: number
      logs: Array<{
        nodeId: string
        nodeName: string
        nodeType: string
        input: unknown
        output: unknown
        status: string
        error: string | null
      }>
      workflow: {
        id: string
        name: string
        config: unknown
      }
    }
  }): DiagnosisContext {
    return {
      workflow: {
        id: feedback.execution.workflow.id,
        name: feedback.execution.workflow.name,
        config: feedback.execution.workflow.config as WorkflowConfig,
      },
      execution: {
        id: feedback.execution.id,
        input: feedback.execution.input as Record<string, unknown>,
        output: feedback.execution.output as Record<string, unknown> | null,
        duration: feedback.execution.duration,
        totalTokens: feedback.execution.totalTokens,
        logs: feedback.execution.logs.map((log) => ({
          nodeId: log.nodeId,
          nodeName: log.nodeName,
          nodeType: log.nodeType,
          input: log.input,
          output: log.output,
          status: log.status,
          error: log.error,
        })),
      },
      feedback: {
        id: feedback.id,
        rating: feedback.rating,
        isAccurate: feedback.isAccurate,
        expectedOutput: feedback.expectedOutput,
        feedbackComment: feedback.feedbackComment,
        issueCategories: (feedback.issueCategories as string[]) || [],
      },
    }
  }

  /**
   * 执行诊断分析
   */
  private async performDiagnosis(context: DiagnosisContext): Promise<DiagnosisResult> {
    // 分析用户标记的问题类别
    const userIssues = context.feedback.issueCategories as IssueCategory[]

    // 基于规则的分析
    const suggestions = this.analyzeByRules(context)

    // 合并用户标记和规则分析的问题
    const allIssues = [...new Set([...userIssues, ...suggestions.map((s) => s.issueType)])]

    return {
      issueCategories: allIssues,
      rootCauseAnalysis: {
        summary: this.generateSummary(context, allIssues),
        details: this.generateDetails(context, allIssues),
        confidence: 0.75,
      },
      suggestions,
    }
  }

  /**
   * 基于规则的分析
   */
  private analyzeByRules(context: DiagnosisContext): DiagnosisResult['suggestions'] {
    const suggestions: DiagnosisResult['suggestions'] = []
    const config = context.workflow.config

    // 分析 PROCESS 节点
    const processNodes = config.nodes?.filter((n) => n.type === 'PROCESS') || []

    for (const node of processNodes) {
      const nodeConfig = (node as NodeConfig & { config?: { userPrompt?: string; systemPrompt?: string; temperature?: number } }).config

      // 检查提示词
      if (!nodeConfig?.userPrompt || nodeConfig.userPrompt.length < 50) {
        suggestions.push({
          issueType: 'PROMPT_UNCLEAR',
          issueDescription: `节点 "${node.name}" 的提示词过于简短或为空`,
          rootCause: '提示词缺少足够的上下文和指导，可能导致输出不够精确',
          suggestionType: 'PROMPT_OPTIMIZATION',
          suggestionTitle: `优化 "${node.name}" 节点的提示词`,
          suggestionDetail:
            '建议在提示词中添加更多细节，包括：\n1. 明确的输出格式要求\n2. 具体的约束条件\n3. 示例或参考',
          suggestedChanges: [
            {
              nodeId: node.id,
              field: 'config.userPrompt',
              oldValue: nodeConfig?.userPrompt || '',
              newValue:
                (nodeConfig?.userPrompt || '') +
                '\n\n请按照以下格式输出：\n1. [具体内容]\n2. [具体内容]\n3. [具体内容]',
              explanation: '添加输出格式要求以提高回答的结构性',
            },
          ],
          confidence: 0.7,
          priority: 1,
        })
      }

      // 检查 temperature 设置
      if (nodeConfig?.temperature !== undefined && nodeConfig.temperature > 0.9) {
        suggestions.push({
          issueType: 'MODEL_CONFIG',
          issueDescription: `节点 "${node.name}" 的 temperature 设置较高 (${nodeConfig.temperature})`,
          rootCause: '较高的 temperature 会增加输出的随机性，可能导致不稳定的结果',
          suggestionType: 'MODEL_CONFIG_ADJUST',
          suggestionTitle: `调整 "${node.name}" 节点的温度参数`,
          suggestionDetail: '建议将 temperature 降低到 0.7 或更低，以获得更稳定、一致的输出',
          suggestedChanges: [
            {
              nodeId: node.id,
              field: 'config.temperature',
              oldValue: nodeConfig.temperature,
              newValue: 0.7,
              explanation: '降低温度以提高输出稳定性',
            },
          ],
          confidence: 0.8,
          priority: 2,
        })
      }
    }

    // 如果用户标记了知识库问题
    if (context.feedback.issueCategories.includes('KNOWLEDGE_BASE')) {
      suggestions.push({
        issueType: 'KNOWLEDGE_BASE',
        issueDescription: '知识库内容可能不够完整或相关性不足',
        rootCause: '检索到的内容与问题不够匹配，或知识库缺少必要的信息',
        suggestionType: 'KNOWLEDGE_UPDATE',
        suggestionTitle: '补充知识库内容',
        suggestionDetail:
          '建议：\n1. 检查知识库文档是否包含相关内容\n2. 调整检索参数（如 Top-K、相似度阈值）\n3. 添加更多领域相关的文档',
        suggestedChanges: [],
        confidence: 0.6,
        priority: 1,
      })
    }

    return suggestions
  }

  /**
   * 生成问题摘要
   */
  private generateSummary(context: DiagnosisContext, issues: IssueCategory[]): string {
    const parts: string[] = []

    if (issues.includes('PROMPT_UNCLEAR') || issues.includes('PROMPT_WRONG')) {
      parts.push('提示词可能需要优化')
    }
    if (issues.includes('KNOWLEDGE_BASE')) {
      parts.push('知识库内容可能不足')
    }
    if (issues.includes('MODEL_CAPABILITY') || issues.includes('MODEL_CONFIG')) {
      parts.push('模型配置可能需要调整')
    }
    if (issues.includes('INPUT_QUALITY')) {
      parts.push('输入数据质量可能影响结果')
    }

    if (parts.length === 0) {
      return '需要进一步分析以确定问题原因'
    }

    return `根据分析，${parts.join('，')}。`
  }

  /**
   * 生成详细分析
   */
  private generateDetails(context: DiagnosisContext, issues: IssueCategory[]): string[] {
    const details: string[] = []

    details.push(`用户评分: ${context.feedback.rating}/5`)
    details.push(`执行时长: ${context.execution.duration || 0}ms`)
    details.push(`Token 消耗: ${context.execution.totalTokens}`)

    if (context.feedback.feedbackComment) {
      details.push(`用户反馈: ${context.feedback.feedbackComment}`)
    }

    if (context.feedback.expectedOutput) {
      details.push(`用户期望输出已记录，可用于对比分析`)
    }

    return details
  }

  /**
   * 创建优化建议记录
   */
  private async createSuggestions(
    feedbackId: string,
    workflowId: string,
    result: DiagnosisResult
  ): Promise<void> {
    for (const suggestion of result.suggestions) {
      await prisma.optimizationSuggestion.create({
        data: {
          feedbackId,
          workflowId,
          issueType: suggestion.issueType,
          issueDescription: suggestion.issueDescription,
          rootCause: suggestion.rootCause,
          suggestionType: suggestion.suggestionType,
          suggestionTitle: suggestion.suggestionTitle,
          suggestionDetail: suggestion.suggestionDetail,
          suggestedChanges: suggestion.suggestedChanges as object,
          confidence: suggestion.confidence,
          priority: suggestion.priority,
          status: 'PENDING',
        },
      })
    }
  }

  /**
   * 获取反馈的诊断结果
   */
  async getDiagnosis(feedbackId: string) {
    const feedback = await prisma.executionFeedback.findUnique({
      where: { id: feedbackId },
      include: {
        suggestions: {
          orderBy: { priority: 'asc' },
        },
      },
    })

    if (!feedback) {
      throw new Error('反馈不存在')
    }

    return {
      status: feedback.optimizationStatus,
      result: feedback.aiDiagnosis as DiagnosisResult | null,
      diagnosedAt: feedback.diagnosedAt,
      suggestions: feedback.suggestions,
    }
  }
}

// 导出单例
export const diagnosisService = new DiagnosisService()
