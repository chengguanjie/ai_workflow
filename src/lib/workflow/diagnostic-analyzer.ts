/**
 * 工作流执行诊断分析器
 * 分析执行失败原因并提供改进建议
 */

import { prisma } from '@/lib/db'
import { aiService } from '@/lib/ai'
import { type IssueCategory, Prisma, type SuggestionType } from '@prisma/client'

interface DiagnosticResult {
  issueType: IssueCategory
  rootCause: string
  confidence: number
  evidence: string[]
  suggestedActions: string[]
}


export class DiagnosticAnalyzer {
  /**
   * 诊断单个执行实例
   */
  async diagnoseExecution(executionId: string): Promise<void> {
    try {
      // 获取执行详情
      const execution = await prisma.execution.findUnique({
        where: { id: executionId },
        include: {
          logs: {
            orderBy: { createdAt: 'asc' }
          },
          feedbacks: true,
          workflow: {
            select: {
              id: true,
              name: true,
              config: true,
              publishedConfig: true
            }
          }
        }
      })

      if (!execution || execution.feedbacks.length === 0) {
        console.warn(`No execution or feedback found for ${executionId}`)
        return
      }

      const feedback = execution.feedbacks[0]

      // 收集诊断上下文
      const diagnosticContext = {
        workflowName: execution.workflow.name,
        executionStatus: execution.status,
        error: execution.error,
        errorDetail: execution.errorDetail as Record<string, unknown>,
        duration: execution.duration,
        totalTokens: execution.totalTokens,
        feedback: feedback,
        logs: execution.logs as unknown as Record<string, unknown>[],
        workflowConfig: (execution.workflow.publishedConfig || execution.workflow.config) as Record<string, unknown>
      }

      // 执行AI诊断
      const diagnosis = await this.performAIDiagnosis(diagnosticContext)

      // 保存诊断结果
      await prisma.executionFeedback.update({
        where: { id: feedback.id },
        data: {
          aiDiagnosis: diagnosis as Prisma.InputJsonValue,
          diagnosedAt: new Date(),
          optimizationStatus: 'ANALYZING'
        }
      })

      // 如果诊断出明确问题，生成优化建议
      if (diagnosis.results && Array.isArray(diagnosis.results) && diagnosis.results.length > 0 && (diagnosis.results[0] as DiagnosticResult).confidence > 0.7) {
        await this.generateOptimizationSuggestions(
          feedback.id,
          execution.workflowId,
          diagnosis.results as DiagnosticResult[]
        )
      }
    } catch (error) {
      console.error('Diagnostic analysis failed:', error)
    }
  }

  /**
   * 执行AI诊断分析
   */
  private async performAIDiagnosis(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    const prompt = `作为工作流诊断专家，请分析以下工作流执行问题：

工作流名称：${context.workflowName}
执行状态：${context.executionStatus}
错误信息：${context.error || '无'}
执行时长：${context.duration}ms
Token使用：${context.totalTokens}
用户反馈评分：${(context.feedback as Record<string, unknown>).rating}/5
准确性：${(context.feedback as Record<string, unknown>).isAccurate ? '准确' : '不准确'}
问题分类：${((context.feedback as Record<string, unknown>).issueCategories as string[] || []).join(', ')}

执行日志摘要：
${this.summarizeExecutionLogs(context.logs as Record<string, unknown>[], 1000)}

请提供诊断分析，包括：
1. 根本原因分析
2. 问题严重程度（低/中/高）
3. 具体的改进建议
4. 预防措施

返回JSON格式：
{
  "results": [{
    "issueType": "KNOWLEDGE_BASE|PROMPT_UNCLEAR|MODEL_CAPABILITY|...",
    "rootCause": "问题的根本原因",
    "confidence": 0.0-1.0,
    "evidence": ["证据1", "证据2"],
    "suggestedActions": ["建议1", "建议2"]
  }],
  "nodeDiagnostics": [{
    "nodeId": "节点ID",
    "nodeName": "节点名称",
    "nodeType": "节点类型",
    "issue": "具体问题",
    "severity": "low|medium|high",
    "suggestions": ["针对性建议"]
  }],
  "overallAssessment": "整体评估"
}`

    try {
      // 获取默认模型配置
      const defaultApiKey = await prisma.apiKey.findFirst({
        where: { isDefault: true }
      })

      if (!defaultApiKey) {
        throw new Error('未配置默认 AI 服务')
      }

      const response = await aiService.chat(
        defaultApiKey.provider,
        {
          model: 'claude-3-haiku',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          maxTokens: 2000
        },
        defaultApiKey.keyEncrypted, // Expecting decryption if needed, but following current lib structure
        defaultApiKey.baseUrl || undefined
      )

      const text = response.content || ''

      // 解析AI响应
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }

      // 如果解析失败，返回默认诊断
      return {
        results: [{
          issueType: 'OTHER',
          rootCause: '诊断分析未能识别具体问题',
          confidence: 0.3,
          evidence: [context.error || '执行失败'],
          suggestedActions: ['检查工作流配置', '优化提示词']
        }],
        nodeDiagnostics: [],
        overallAssessment: '需要更多信息进行深入分析'
      }
    } catch (error) {
      console.error('AI diagnosis failed:', error)
      return {
        results: [],
        nodeDiagnostics: [],
        overallAssessment: '诊断分析失败'
      }
    }
  }

  /**
   * 总结执行日志
   */
  private summarizeExecutionLogs(logs: Record<string, unknown>[], maxTokens: number = 1000): string {
    if (!logs || logs.length === 0) {
      return '无执行日志'
    }

    const summary: string[] = []

    // 统计各节点执行情况
    const nodeStats = new Map<string, { success: number; failed: number; duration: number }>()

    for (const log of logs) {
      const key = `${(log.nodeName as string)} (${(log.nodeType as string)})`
      if (!nodeStats.has(key)) {
        nodeStats.set(key, { success: 0, failed: 0, duration: 0 })
      }

      const stats = nodeStats.get(key)!
      if (log.status === 'COMPLETED') {
        stats.success++
      } else if (log.status === 'FAILED') {
        stats.failed++
      }
      stats.duration += (log.duration as number) || 0
    }

    // 生成摘要
    nodeStats.forEach((stats, nodeName) => {
      if (stats.failed > 0) {
        summary.push(`❌ ${nodeName}: ${stats.failed}次失败`)
      } else if (stats.duration > 5000) {
        summary.push(`⚠️ ${nodeName}: 执行缓慢 (${stats.duration}ms)`)
      } else {
        summary.push(`✅ ${nodeName}: 正常执行`)
      }
    })

    // 添加错误详情
    const errorLogs = logs.filter(log => log.error)
    if (errorLogs.length > 0) {
      summary.push('\n错误详情:')
      errorLogs.forEach(log => {
        summary.push(`- ${log.nodeName}: ${log.error}`)
      })
    }

    // 截断以符合maxTokens限制 (简单字符截断，不考虑token实际计算)
    let currentLength = 0;
    const truncatedSummary: string[] = [];
    for (const line of summary) {
      if (currentLength + line.length + 1 > maxTokens) { // +1 for newline
        truncatedSummary.push('...(日志已截断)');
        break;
      }
      truncatedSummary.push(line);
      currentLength += line.length + 1;
    }


    return truncatedSummary.join('\n')
  }

  /**
   * 生成优化建议
   */
  private async generateOptimizationSuggestions(
    feedbackId: string,
    _workflowId: string,
    diagnosticResults: DiagnosticResult[]
  ): Promise<void> {
    for (const result of diagnosticResults) {
      if (result.confidence < 0.5) continue

      // 根据问题类型生成具体建议
      const suggestions = await this.generateSpecificSuggestions(result, _workflowId)

      for (const suggestion of suggestions) {
        await prisma.optimizationSuggestion.create({
          data: {
            feedbackId,
            workflowId: _workflowId,
            issueType: result.issueType,
            issueDescription: result.rootCause,
            rootCause: result.evidence.join('; '),
            suggestionType: suggestion.suggestionType as SuggestionType,
            suggestionTitle: suggestion.suggestionTitle,
            suggestionDetail: suggestion.suggestionDetail,
            suggestedChanges: suggestion.suggestedChanges as Prisma.InputJsonValue,
            confidence: result.confidence,
            priority: this.calculatePriority(result),
            status: 'PENDING'
          }
        })
      }
    }

    // 更新反馈状态
    await prisma.executionFeedback.update({
      where: { id: feedbackId },
      data: {
        optimizationStatus: 'SUGGESTED'
      }
    })
  }

  /**
   * 生成特定类型的优化建议
   */
  private async generateSpecificSuggestions(
    diagnostic: DiagnosticResult,
    _workflowId: string
  ): Promise<Array<{
    suggestionType: string
    suggestionTitle: string
    suggestionDetail: string
    suggestedChanges: Record<string, unknown>
  }>> {
    const suggestions = []

    switch (diagnostic.issueType) {
      case 'KNOWLEDGE_BASE':
        suggestions.push({
          suggestionType: 'KNOWLEDGE_UPDATE',
          suggestionTitle: '更新知识库内容',
          suggestionDetail: `知识库缺少相关信息导致无法准确回答。建议添加以下内容：\n${diagnostic.suggestedActions.join('\n')}`,
          suggestedChanges: {
            action: 'add_knowledge',
            content: diagnostic.suggestedActions
          }
        })
        break

      case 'PROMPT_UNCLEAR':
      case 'PROMPT_WRONG':
        suggestions.push({
          suggestionType: 'PROMPT_OPTIMIZATION',
          suggestionTitle: '优化提示词',
          suggestionDetail: `当前提示词不够清晰或存在错误。${diagnostic.rootCause}`,
          suggestedChanges: {
            action: 'optimize_prompt',
            improvements: diagnostic.suggestedActions
          }
        })
        break

      case 'MODEL_CAPABILITY':
        suggestions.push({
          suggestionType: 'MODEL_CHANGE',
          suggestionTitle: '切换到更强大的模型',
          suggestionDetail: '当前模型能力不足以处理此任务。建议升级到GPT-4或Claude 3等更强大的模型。',
          suggestedChanges: {
            action: 'change_model',
            recommendedModels: ['gpt-4', 'claude-3-opus']
          }
        })
        break

      case 'MODEL_CONFIG':
        suggestions.push({
          suggestionType: 'MODEL_CONFIG_ADJUST',
          suggestionTitle: '调整模型参数',
          suggestionDetail: '模型参数配置不当导致输出质量问题。',
          suggestedChanges: {
            action: 'adjust_config',
            parameters: {
              temperature: 0.7,
              maxTokens: 2000,
              topP: 0.9
            }
          }
        })
        break

      case 'LOGIC_ERROR':
        suggestions.push({
          suggestionType: 'MODIFY_FLOW',
          suggestionTitle: '修改工作流逻辑',
          suggestionDetail: `工作流逻辑存在问题：${diagnostic.rootCause}`,
          suggestedChanges: {
            action: 'modify_flow',
            modifications: diagnostic.suggestedActions
          }
        })
        break

      default:
        suggestions.push({
          suggestionType: 'OTHER',
          suggestionTitle: '通用优化建议',
          suggestionDetail: diagnostic.rootCause,
          suggestedChanges: {
            action: 'general',
            suggestions: diagnostic.suggestedActions
          }
        })
    }

    return suggestions
  }

  /**
   * 计算优化建议优先级
   */
  private calculatePriority(diagnostic: DiagnosticResult): number {
    // 基础优先级
    let priority = 50

    // 根据置信度调整
    priority += Math.floor(diagnostic.confidence * 30)

    // 根据问题类型调整
    const priorityBoost: Record<IssueCategory, number> = {
      KNOWLEDGE_BASE: 20,
      PROMPT_UNCLEAR: 15,
      PROMPT_WRONG: 15,
      MODEL_CAPABILITY: 10,
      MODEL_CONFIG: 5,
      INPUT_QUALITY: 10,
      CONTEXT_MISSING: 15,
      LOGIC_ERROR: 25,
      OTHER: 0
    }

    priority += priorityBoost[diagnostic.issueType] || 0

    return Math.min(100, Math.max(0, priority))
  }

  /**
   * 批量诊断工作流的多个执行
   */
  async diagnoseWorkflowExecutions(
    workflowId: string,
    limit: number = 10
  ): Promise<void> {
    // 获取需要诊断的执行
    const executions = await prisma.execution.findMany({
      where: {
        workflowId,
        feedbacks: {
          some: {
            optimizationStatus: 'PENDING',
            rating: { lte: 3 } // 只诊断低分反馈
          }
        }
      },
      select: {
        id: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })

    // 并行诊断
    await Promise.all(
      executions.map(exec => this.diagnoseExecution(exec.id))
    )
  }
}