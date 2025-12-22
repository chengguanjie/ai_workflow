/**
 * 知识库搜索数据收集器
 * 收集搜索性能、效果和用户反馈数据
 */

import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import type {
  SearchPerformanceMetrics,
  SearchEffectivenessMetrics,
  UserFeedback,
  QueryAnalysis,
  SearchSession
} from './types'
import { countTokens } from '../tokenizer'
import type { SearchResult } from '../search'

/**
 * 搜索数据收集器
 */
export class SearchDataCollector {
  private sessionId: string
  private startTime: number
  private metrics: Partial<SearchPerformanceMetrics> = {}

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.startTime = Date.now()
  }

  /**
   * 记录向量生成时间
   */
  recordEmbeddingTime(duration: number) {
    this.metrics.embeddingGenerationTime = duration
  }

  /**
   * 记录向量搜索时间
   */
  recordVectorSearchTime(duration: number) {
    this.metrics.vectorSearchTime = duration
  }

  /**
   * 记录数据库查询时间
   */
  recordDatabaseTime(duration: number) {
    this.metrics.databaseQueryTime = duration
  }

  /**
   * 记录重排序时间
   */
  recordReRankTime(duration: number) {
    this.metrics.reRankTime = duration
  }

  /**
   * 记录搜索模式和降级情况
   */
  recordSearchMode(mode: 'vector' | 'memory' | 'hybrid', fallbackUsed: boolean) {
    this.metrics.searchMode = mode
    this.metrics.fallbackUsed = fallbackUsed
  }

  /**
   * 记录Token使用量
   */
  recordTokenUsage(count: number) {
    this.metrics.tokenCount = count
  }

  /**
   * 记录内存使用
   */
  recordMemoryUsage() {
    const memoryUsage = process.memoryUsage()
    this.metrics.memoryUsage = Math.round(memoryUsage.heapUsed / 1024 / 1024)
  }

  /**
   * 完成性能数据收集
   */
  finalizePerformanceMetrics(): SearchPerformanceMetrics {
    const totalResponseTime = Date.now() - this.startTime

    return {
      totalResponseTime,
      embeddingGenerationTime: this.metrics.embeddingGenerationTime || 0,
      vectorSearchTime: this.metrics.vectorSearchTime || 0,
      reRankTime: this.metrics.reRankTime,
      databaseQueryTime: this.metrics.databaseQueryTime || 0,
      memoryUsage: this.metrics.memoryUsage || 0,
      tokenCount: this.metrics.tokenCount || 0,
      searchMode: this.metrics.searchMode || 'vector',
      fallbackUsed: this.metrics.fallbackUsed || false
    }
  }

  /**
   * 分析搜索效果
   */
  static analyzeEffectiveness(results: SearchResult[]): SearchEffectivenessMetrics {
    if (results.length === 0) {
      return {
        avgScore: 0,
        topScores: [],
        scoreDistribution: { high: 0, medium: 0, low: 0 },
        resultCount: 0,
        emptyResults: true,
        belowThresholdCount: 0
      }
    }

    const scores = results.map(r => r.score)
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length

    const scoreDistribution = scores.reduce(
      (dist, score) => {
        if (score > 0.8) dist.high++
        else if (score >= 0.6) dist.medium++
        else dist.low++
        return dist
      },
      { high: 0, medium: 0, low: 0 }
    )

    return {
      avgScore,
      topScores: scores.slice(0, 5),
      scoreDistribution,
      resultCount: results.length,
      emptyResults: false,
      belowThresholdCount: scores.filter(s => s < 0.7).length
    }
  }

  /**
   * 分析查询
   */
  static async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const queryLength = query.length
    const queryTokenCount = countTokens(query)

    // 简单的复杂度判断
    let queryComplexity: 'simple' | 'moderate' | 'complex' = 'simple'
    if (queryTokenCount > 50) queryComplexity = 'complex'
    else if (queryTokenCount > 20) queryComplexity = 'moderate'

    // 检测是否包含关键词
    const hasKeywords = /\b(AND|OR|NOT|NEAR)\b/i.test(query)

    // 简单的语言检测
    const language = /[\u4e00-\u9fa5]/.test(query) ? 'zh' : 'en'

    return {
      query,
      queryLength,
      queryTokenCount,
      queryComplexity,
      hasKeywords,
      language
    }
  }
}

/**
 * 保存搜索会话数据
 */
export async function saveSearchSession(
  session: Omit<SearchSession, 'id' | 'timestamp'>
): Promise<string> {
  const sessionId = `search_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const sessionData: SearchSession = {
    id: sessionId,
    timestamp: new Date(),
    ...session
  }

  // 保存到Redis（用于实时分析）
  await redis.setex(
    `search_session:${sessionId}`,
    86400, // 保存24小时
    JSON.stringify(sessionData)
  )

  // 异步保存到数据库（用于长期分析）
  saveToDatabase(sessionData).catch(console.error)

  return sessionId
}

/**
 * 异步保存到数据库
 */
async function saveToDatabase(session: SearchSession) {
  // 这里可以创建一个新的表来存储搜索会话数据
  // 为了演示，我们暂时使用JSON字段存储
  await prisma.$executeRaw`
    INSERT INTO search_sessions (
      id, knowledge_base_id, user_id, query,
      performance_metrics, effectiveness_metrics,
      config, created_at
    ) VALUES (
      ${session.id},
      ${session.knowledgeBaseId},
      ${session.userId},
      ${session.query.query},
      ${JSON.stringify(session.performance)},
      ${JSON.stringify(session.effectiveness)},
      ${JSON.stringify(session.config)},
      ${session.timestamp}
    )
  `
}

/**
 * 收集用户反馈
 */
export async function collectUserFeedback(
  searchId: string,
  feedback: Omit<UserFeedback, 'searchId' | 'timestamp'>
): Promise<void> {
  const feedbackData: UserFeedback = {
    searchId,
    timestamp: new Date(),
    ...feedback
  }

  // 更新搜索会话
  const sessionKey = `search_session:${searchId}`
  const sessionData = await redis.get(sessionKey)

  if (sessionData) {
    const session = JSON.parse(sessionData) as SearchSession
    session.feedback = feedbackData
    await redis.setex(sessionKey, 86400, JSON.stringify(session))
  }

  // 保存反馈到数据库
  await saveFeedbackToDatabase(feedbackData)
}

/**
 * 保存反馈到数据库
 */
async function saveFeedbackToDatabase(feedback: UserFeedback) {
  await prisma.$executeRaw`
    INSERT INTO search_feedback (
      search_id, feedback_type, user_id,
      clicked_results, dwell_time, rating,
      helpful, comment, created_at
    ) VALUES (
      ${feedback.searchId},
      ${feedback.feedbackType},
      ${feedback.userId},
      ${JSON.stringify(feedback.clickedResults || [])},
      ${JSON.stringify(feedback.dwellTime || {})},
      ${feedback.rating || null},
      ${feedback.helpful || null},
      ${feedback.comment || null},
      ${feedback.timestamp}
    )
  `
}

/**
 * 收集隐式反馈
 */
export function collectImplicitFeedback(
  searchId: string,
  userId: string,
  action: 'click' | 'dwell' | 'copy',
  data: { resultId?: string; duration?: number }
) {
  // 使用Redis收集实时反馈
  const key = `implicit_feedback:${searchId}`

  redis.hset(key, {
    [`${action}_${Date.now()}`]: JSON.stringify({
      userId,
      action,
      ...data,
      timestamp: new Date().toISOString()
    })
  }).catch(console.error)

  // 设置过期时间
  redis.expire(key, 86400).catch(console.error)
}

/**
 * 聚合隐式反馈
 */
export async function aggregateImplicitFeedback(searchId: string): Promise<UserFeedback | null> {
  const key = `implicit_feedback:${searchId}`
  const feedbackData = await redis.hgetall(key)

  if (!feedbackData || Object.keys(feedbackData).length === 0) {
    return null
  }

  const clickedResults: string[] = []
  const dwellTime: Record<string, number> = {}
  const copyActions: string[] = []
  let userId = ''

  Object.values(feedbackData).forEach(item => {
    const data = JSON.parse(item)
    userId = data.userId

    switch (data.action) {
      case 'click':
        if (data.resultId) clickedResults.push(data.resultId)
        break
      case 'dwell':
        if (data.resultId && data.duration) {
          dwellTime[data.resultId] = (dwellTime[data.resultId] || 0) + data.duration
        }
        break
      case 'copy':
        if (data.resultId) copyActions.push(data.resultId)
        break
    }
  })

  return {
    searchId,
    feedbackType: 'implicit',
    clickedResults,
    dwellTime,
    copyActions,
    timestamp: new Date(),
    userId
  }
}