/**
 * 知识库诊断系统类型定义
 * 用于检索效率和效果的监控、反馈收集、诊断分析和优化
 */

import type { AIProvider } from '@prisma/client'

/**
 * 检索性能指标
 */
export interface SearchPerformanceMetrics {
  // 时间性能
  totalResponseTime: number        // 总响应时间 (ms)
  embeddingGenerationTime: number  // 向量生成时间 (ms)
  vectorSearchTime: number         // 向量搜索时间 (ms)
  reRankTime?: number             // 重排序时间 (ms)
  databaseQueryTime: number        // 数据库查询时间 (ms)

  // 资源消耗
  memoryUsage: number             // 内存使用量 (MB)
  cpuUsage?: number               // CPU使用率 (%)
  tokenCount: number              // Token消耗量

  // 搜索模式
  searchMode: 'vector' | 'memory' | 'hybrid'  // 搜索模式
  fallbackUsed: boolean           // 是否使用了降级
}

/**
 * 检索效果指标
 */
export interface SearchEffectivenessMetrics {
  // 相关性指标
  avgScore: number                // 平均相关性分数
  topScores: number[]             // 前N个结果的分数
  scoreDistribution: {            // 分数分布
    high: number                  // 高分结果数 (>0.8)
    medium: number                // 中分结果数 (0.6-0.8)
    low: number                   // 低分结果数 (<0.6)
  }

  // 结果质量
  resultCount: number             // 返回结果数
  emptyResults: boolean           // 是否为空结果
  belowThresholdCount: number     // 低于阈值的结果数
}

/**
 * 用户反馈数据
 */
export interface UserFeedback {
  searchId: string                // 搜索会话ID
  feedbackType: 'implicit' | 'explicit'  // 反馈类型

  // 隐式反馈
  clickedResults?: string[]       // 点击的结果ID
  dwellTime?: Record<string, number>  // 停留时间(秒)
  copyActions?: string[]          // 复制的结果ID

  // 显式反馈
  rating?: number                 // 评分 (1-5)
  helpful?: boolean               // 是否有用
  comment?: string                // 用户评论

  // 上下文
  timestamp: Date
  userId: string
  sessionId?: string
}

/**
 * 查询分析数据
 */
export interface QueryAnalysis {
  query: string
  queryLength: number
  queryTokenCount: number
  queryComplexity: 'simple' | 'moderate' | 'complex'

  // 查询特征
  hasKeywords: boolean            // 是否包含关键词
  language: string                // 查询语言
  intent?: 'factual' | 'conceptual' | 'procedural'  // 查询意图

  // 查询增强
  expandedTerms?: string[]        // 扩展的查询词
  synonymsUsed?: string[]         // 使用的同义词
}

/**
 * 搜索会话数据
 */
export interface SearchSession {
  id: string
  knowledgeBaseId: string
  userId: string
  timestamp: Date

  // 查询信息
  query: QueryAnalysis

  // 性能数据
  performance: SearchPerformanceMetrics

  // 效果数据
  effectiveness: SearchEffectivenessMetrics

  // 反馈数据
  feedback?: UserFeedback

  // 配置信息
  config: {
    topK: number
    threshold: number
    embeddingModel: string
    embeddingProvider: AIProvider
    hybridSearch?: boolean
    reRankEnabled?: boolean
  }

  // 诊断信息
  diagnostics?: SearchDiagnostics
}

/**
 * 搜索诊断结果
 */
export interface SearchDiagnostics {
  // 问题识别
  issues: DiagnosticIssue[]

  // 性能分析
  performanceAnalysis: {
    bottleneck?: 'embedding' | 'vector_search' | 'database' | 'rerank'
    isOptimal: boolean
    suggestions: string[]
  }

  // 效果分析
  effectivenessAnalysis: {
    relevanceLevel: 'poor' | 'fair' | 'good' | 'excellent'
    possibleCauses?: string[]
    improvements: string[]
  }

  // 推荐配置
  recommendations: {
    topK?: number
    threshold?: number
    enableHybridSearch?: boolean
    enableReRank?: boolean
    queryExpansion?: boolean
  }
}

/**
 * 诊断问题
 */
export interface DiagnosticIssue {
  type: 'performance' | 'quality' | 'configuration' | 'data'
  severity: 'low' | 'medium' | 'high'
  code: string
  message: string
  details?: Record<string, unknown>
  solution?: string
}

/**
 * 知识库健康度报告
 */
export interface KnowledgeBaseHealthReport {
  knowledgeBaseId: string
  reportDate: Date
  period: {
    start: Date
    end: Date
  }

  // 总体指标
  summary: {
    totalSearches: number
    avgResponseTime: number
    avgRelevanceScore: number
    userSatisfactionRate: number
    errorRate: number
  }

  // 性能趋势
  performanceTrends: {
    responseTimeTrend: 'improving' | 'stable' | 'degrading'
    relevanceTrend: 'improving' | 'stable' | 'degrading'
    usageTrend: 'increasing' | 'stable' | 'decreasing'
  }

  // 常见问题
  topIssues: DiagnosticIssue[]

  // 查询模式
  queryPatterns: {
    topQueries: Array<{
      query: string
      count: number
      avgScore: number
      avgResponseTime: number
    }>
    failedQueries: Array<{
      query: string
      count: number
      reason: string
    }>
    lowScoreQueries: Array<{
      query: string
      avgScore: number
      possibleReason: string
    }>
  }

  // 优化建议
  optimizationSuggestions: Array<{
    priority: 'high' | 'medium' | 'low'
    category: 'performance' | 'quality' | 'data' | 'configuration'
    action: string
    expectedImpact: string
    effort: 'low' | 'medium' | 'high'
  }>

  // 数据质量
  dataQuality: {
    documentCoverage: number      // 文档覆盖率
    chunkQuality: number          // 分块质量评分
    embeddingQuality: number      // 向量质量评分
    duplicateRate: number         // 重复率
  }
}

/**
 * 自动优化配置
 */
export interface AutoOptimizationConfig {
  enabled: boolean

  // 优化策略
  strategies: {
    queryOptimization: boolean    // 查询优化
    parameterTuning: boolean      // 参数调优
    indexOptimization: boolean    // 索引优化
    cacheOptimization: boolean    // 缓存优化
  }

  // 优化阈值
  thresholds: {
    minSearchVolume: number       // 最小搜索量（触发优化）
    maxResponseTime: number       // 最大响应时间 (ms)
    minRelevanceScore: number     // 最小相关性分数
    maxErrorRate: number          // 最大错误率
  }

  // 优化频率
  schedule: {
    realtime: boolean             // 实时优化
    batchInterval?: number        // 批量优化间隔 (小时)
    lastOptimization?: Date       // 上次优化时间
  }
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  optimizationId: string
  timestamp: Date
  knowledgeBaseId: string

  // 应用的优化
  appliedOptimizations: Array<{
    type: string
    before: Record<string, unknown>
    after: Record<string, unknown>
    impact: {
      metric: string
      improvement: number         // 改进百分比
    }
  }>

  // 总体效果
  overallImpact: {
    responseTimeImprovement: number
    relevanceScoreImprovement: number
    errorRateReduction: number
  }

  // 回滚信息
  canRollback: boolean
  rollbackData?: Record<string, unknown>
}