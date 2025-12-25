/**
 * 代码执行审计日志服务
 * 记录所有代码执行活动，用于安全审计和问题排查
 */

import { randomUUID } from 'crypto'
import type {
  AuditLogEntry,
  AuditLogService,
  ExecutionLanguage,
  RunnerType,
} from './types'
import { PrismaClient } from '@prisma/client'

/**
 * 审计日志存储后端接口
 */
export interface AuditLogStorage {
  save(entry: AuditLogEntry): Promise<void>
  query(filters: AuditQueryFilters): Promise<AuditLogEntry[]>
  count(filters: AuditQueryFilters): Promise<number>
  delete(filters: AuditQueryFilters): Promise<number>
}

/**
 * 审计日志查询过滤器
 */
export interface AuditQueryFilters {
  userId?: string
  workflowId?: string
  nodeId?: string
  eventType?: AuditLogEntry['eventType']
  language?: ExecutionLanguage
  runnerType?: RunnerType
  startTime?: Date
  endTime?: Date
  limit?: number
  offset?: number
}

/**
 * 内存存储实现（开发/测试用）
 */
export class InMemoryAuditStorage implements AuditLogStorage {
  private entries: AuditLogEntry[] = []
  private maxEntries: number

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries
  }

  async save(entry: AuditLogEntry): Promise<void> {
    this.entries.push(entry)

    // 超过最大条目数时清理旧条目
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
  }

  async query(filters: AuditQueryFilters): Promise<AuditLogEntry[]> {
    const results = this.entries.filter(entry => {
      if (filters.userId && entry.userId !== filters.userId) return false
      if (filters.workflowId && entry.workflowId !== filters.workflowId) return false
      if (filters.nodeId && entry.nodeId !== filters.nodeId) return false
      if (filters.eventType && entry.eventType !== filters.eventType) return false
      if (filters.language && entry.language !== filters.language) return false
      if (filters.runnerType && entry.runnerType !== filters.runnerType) return false
      if (filters.startTime && entry.timestamp < filters.startTime) return false
      if (filters.endTime && entry.timestamp > filters.endTime) return false
      return true
    })

    // 按时间倒序排列
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // 分页
    const offset = filters.offset ?? 0
    const limit = filters.limit ?? 100
    return results.slice(offset, offset + limit)
  }

  async count(filters: AuditQueryFilters): Promise<number> {
    const results = await this.query({ ...filters, limit: undefined, offset: undefined })
    return results.length
  }

  async delete(filters: AuditQueryFilters): Promise<number> {
    const initialLength = this.entries.length

    this.entries = this.entries.filter(entry => {
      if (filters.userId && entry.userId === filters.userId) return false
      if (filters.workflowId && entry.workflowId === filters.workflowId) return false
      if (filters.startTime && filters.endTime &&
        entry.timestamp >= filters.startTime && entry.timestamp <= filters.endTime) {
        return false
      }
      return true
    })

    return initialLength - this.entries.length
  }

  // 测试辅助方法
  clear(): void {
    this.entries = []
  }

  getAll(): AuditLogEntry[] {
    return [...this.entries]
  }
}

/**
 * 数据库存储实现（生产用）
 * 使用 Prisma 存储审计日志
 */
export class DatabaseAuditStorage implements AuditLogStorage {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  async save(entry: AuditLogEntry): Promise<void> {
    // 检查 CodeExecutionAudit 模型是否存在
    const prismaAny = this.prisma as any
    if (!prismaAny.codeExecutionAudit) {
      // 如果模型不存在，降级到控制台日志
      console.log('[AuditLog]', JSON.stringify(entry))
      return
    }

    // 映射 runnerType 到 Prisma 枚举格式（下划线分隔）
    const runnerTypeMap: Record<string, string> = {
      'isolated-vm': 'isolated_vm',
      'docker': 'docker',
      'native': 'native',
    }

    await prismaAny.codeExecutionAudit.create({
      data: {
        id: entry.id,
        eventType: entry.eventType,
        executionId: entry.executionId,
        userId: entry.userId,
        workflowId: entry.workflowId,
        nodeId: entry.nodeId,
        language: entry.language,
        runnerType: runnerTypeMap[entry.runnerType] || entry.runnerType,
        codeHash: entry.codeHash,
        executionTime: entry.metrics?.executionTime,
        memoryUsed: entry.metrics?.memoryUsed,
        error: entry.error,
        metadata: entry.metadata,
        timestamp: entry.timestamp,
      },
    })
  }

  async query(filters: AuditQueryFilters): Promise<AuditLogEntry[]> {
    const prismaAny = this.prisma as any
    if (!prismaAny.codeExecutionAudit) {
      return []
    }

    const where: Record<string, unknown> = {}

    if (filters.userId) where.userId = filters.userId
    if (filters.workflowId) where.workflowId = filters.workflowId
    if (filters.nodeId) where.nodeId = filters.nodeId
    if (filters.eventType) where.eventType = filters.eventType
    if (filters.language) where.language = filters.language
    if (filters.runnerType) where.runnerType = filters.runnerType

    if (filters.startTime || filters.endTime) {
      where.timestamp = {}
      if (filters.startTime) {
        (where.timestamp as Record<string, Date>).gte = filters.startTime
      }
      if (filters.endTime) {
        (where.timestamp as Record<string, Date>).lte = filters.endTime
      }
    }

    const results = await prismaAny.codeExecutionAudit.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: filters.offset ?? 0,
      take: filters.limit ?? 100,
    })

    return results.map(this.mapToAuditLogEntry)
  }

  async count(filters: AuditQueryFilters): Promise<number> {
    const prismaAny = this.prisma as any
    if (!prismaAny.codeExecutionAudit) {
      return 0
    }

    const where: Record<string, unknown> = {}

    if (filters.userId) where.userId = filters.userId
    if (filters.workflowId) where.workflowId = filters.workflowId
    if (filters.eventType) where.eventType = filters.eventType

    return prismaAny.codeExecutionAudit.count({ where })
  }

  async delete(filters: AuditQueryFilters): Promise<number> {
    const prismaAny = this.prisma as any
    if (!prismaAny.codeExecutionAudit) {
      return 0
    }

    const where: Record<string, unknown> = {}

    if (filters.userId) where.userId = filters.userId
    if (filters.workflowId) where.workflowId = filters.workflowId

    if (filters.startTime && filters.endTime) {
      where.timestamp = {
        gte: filters.startTime,
        lte: filters.endTime,
      }
    }

    const result = await prismaAny.codeExecutionAudit.deleteMany({ where })
    return result.count
  }

  private mapToAuditLogEntry(row: any): AuditLogEntry {
    return {
      id: row.id,
      eventType: row.eventType,
      executionId: row.executionId,
      userId: row.userId,
      workflowId: row.workflowId,
      nodeId: row.nodeId,
      language: row.language,
      runnerType: row.runnerType,
      codeHash: row.codeHash,
      metrics: row.executionTime ? {
        executionTime: row.executionTime,
        memoryUsed: row.memoryUsed,
        startedAt: row.timestamp,
        completedAt: row.timestamp,
      } : undefined,
      error: row.error,
      metadata: row.metadata,
      timestamp: row.timestamp,
    }
  }
}

/**
 * 审计日志服务实现
 */
export class AuditLogServiceImpl implements AuditLogService {
  private storage: AuditLogStorage
  private enabled: boolean

  constructor(storage: AuditLogStorage, enabled: boolean = true) {
    this.storage = storage
    this.enabled = enabled
  }

  /**
   * 记录审计日志
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.enabled) return

    const fullEntry: AuditLogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date(),
    }

    try {
      await this.storage.save(fullEntry)
    } catch (error) {
      // 审计日志失败不应影响主流程，只记录错误
      console.error('[AuditLog] Failed to save audit log:', error)
    }
  }

  /**
   * 查询审计日志
   */
  async query(filters: AuditQueryFilters): Promise<AuditLogEntry[]> {
    return this.storage.query(filters)
  }

  /**
   * 统计审计日志
   */
  async count(filters: AuditQueryFilters): Promise<number> {
    return this.storage.count(filters)
  }

  /**
   * 删除审计日志
   */
  async delete(filters: AuditQueryFilters): Promise<number> {
    return this.storage.delete(filters)
  }

  /**
   * 获取执行统计
   */
  async getExecutionStats(filters: {
    userId?: string
    workflowId?: string
    startTime?: Date
    endTime?: Date
  }): Promise<{
    totalExecutions: number
    successCount: number
    errorCount: number
    byLanguage: Record<ExecutionLanguage, number>
    byRunner: Record<RunnerType, number>
    avgExecutionTime: number
  }> {
    const allLogs = await this.query({
      ...filters,
      limit: 10000, // 限制统计范围
    })

    const stats = {
      totalExecutions: 0,
      successCount: 0,
      errorCount: 0,
      byLanguage: {} as Record<ExecutionLanguage, number>,
      byRunner: {} as Record<RunnerType, number>,
      avgExecutionTime: 0,
    }

    let totalTime = 0
    let timeCount = 0

    for (const log of allLogs) {
      if (log.eventType === 'execution_complete') {
        stats.totalExecutions++
        stats.successCount++
      } else if (log.eventType === 'execution_error') {
        stats.totalExecutions++
        stats.errorCount++
      }

      // 按语言统计
      stats.byLanguage[log.language] = (stats.byLanguage[log.language] ?? 0) + 1

      // 按执行器统计
      stats.byRunner[log.runnerType] = (stats.byRunner[log.runnerType] ?? 0) + 1

      // 计算平均执行时间
      if (log.metrics?.executionTime) {
        totalTime += log.metrics.executionTime
        timeCount++
      }
    }

    stats.avgExecutionTime = timeCount > 0 ? totalTime / timeCount : 0

    return stats
  }

  /**
   * 获取安全警告
   */
  async getSecurityAlerts(filters: {
    startTime?: Date
    endTime?: Date
    limit?: number
  }): Promise<AuditLogEntry[]> {
    return this.query({
      ...filters,
      eventType: 'security_violation',
    })
  }

  /**
   * 获取资源限制警告
   */
  async getResourceLimitAlerts(filters: {
    startTime?: Date
    endTime?: Date
    limit?: number
  }): Promise<AuditLogEntry[]> {
    return this.query({
      ...filters,
      eventType: 'resource_limit',
    })
  }

  /**
   * 启用/禁用审计日志
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

// 全局服务实例
let auditServiceInstance: AuditLogServiceImpl | null = null

/**
 * 获取审计日志服务
 */
export function getAuditService(storage?: AuditLogStorage): AuditLogServiceImpl {
  if (!auditServiceInstance) {
    auditServiceInstance = new AuditLogServiceImpl(
      storage ?? new InMemoryAuditStorage()
    )
  }
  return auditServiceInstance
}

/**
 * 初始化数据库审计日志服务
 */
export function initDatabaseAuditService(prisma: PrismaClient): AuditLogServiceImpl {
  const storage = new DatabaseAuditStorage(prisma)
  auditServiceInstance = new AuditLogServiceImpl(storage)
  return auditServiceInstance
}
