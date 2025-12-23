/**
 * 执行记录分类工具函数
 * 
 * 将执行记录分为两类：
 * - 正在执行 (Running): RUNNING 或 PENDING 状态
 * - 历史记录 (History): COMPLETED、FAILED 或 CANCELLED 状态
 */

import type { ExecutionStatus } from '@/lib/workflow/types'

/**
 * 执行记录接口
 */
export interface Execution {
  id: string
  status: ExecutionStatus
  workflowId: string
  workflowName: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  duration: number | null
  totalTokens: number
  error: string | null
  outputFileCount: number
}

/**
 * 分类结果接口
 */
export interface CategorizedExecutions {
  running: Execution[]  // RUNNING 或 PENDING 状态
  history: Execution[]  // COMPLETED、FAILED 或 CANCELLED 状态
}

/**
 * 运行中状态集合
 */
const RUNNING_STATUSES: Set<ExecutionStatus> = new Set(['RUNNING', 'PENDING'])

/**
 * 历史记录状态集合
 */
const HISTORY_STATUSES: Set<ExecutionStatus> = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/**
 * 检查执行记录是否为运行中状态
 * @param execution 执行记录
 * @returns 是否为运行中
 */
export function isRunningExecution(execution: Execution): boolean {
  return RUNNING_STATUSES.has(execution.status)
}

/**
 * 检查执行记录是否为历史记录状态
 * @param execution 执行记录
 * @returns 是否为历史记录
 */
export function isHistoryExecution(execution: Execution): boolean {
  return HISTORY_STATUSES.has(execution.status)
}

/**
 * 将执行记录分类为运行中和历史记录
 * @param executions 所有执行记录
 * @returns 分类后的执行记录
 */
export function categorizeExecutions(executions: Execution[]): CategorizedExecutions {
  const running: Execution[] = []
  const history: Execution[] = []
  
  for (const execution of executions) {
    if (isRunningExecution(execution)) {
      running.push(execution)
    } else if (isHistoryExecution(execution)) {
      history.push(execution)
    }
    // PAUSED 状态暂时不处理，可根据需求添加
  }
  
  return { running, history }
}

/**
 * 计算执行的已用时间（毫秒）
 * @param execution 执行记录
 * @returns 已用时间（毫秒）
 */
export function calculateElapsedTime(execution: Execution): number {
  if (!execution.startedAt) {
    return 0
  }
  
  const startTime = new Date(execution.startedAt).getTime()
  const endTime = execution.completedAt 
    ? new Date(execution.completedAt).getTime() 
    : Date.now()
  
  return Math.max(0, endTime - startTime)
}

/**
 * 格式化已用时间为可读字符串
 * @param milliseconds 毫秒数
 * @returns 格式化的时间字符串
 */
export function formatElapsedTime(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`
  }
  
  const seconds = Math.floor(milliseconds / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}


/**
 * 筛选参数接口
 */
export interface HistoryFilters {
  workflowId?: string
  status?: 'COMPLETED' | 'FAILED' | 'CANCELLED'
  startDate?: string
  endDate?: string
}

/**
 * 分页参数接口
 */
export interface PaginationParams {
  page: number
  pageSize: number
}

/**
 * 分页结果接口
 */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * 根据筛选条件过滤历史执行记录
 * @param executions 执行记录列表
 * @param filters 筛选条件
 * @returns 过滤后的执行记录
 */
export function filterHistoryExecutions(
  executions: Execution[],
  filters: HistoryFilters
): Execution[] {
  return executions.filter((execution) => {
    // 只处理历史记录状态
    if (!isHistoryExecution(execution)) {
      return false
    }

    // 工作流筛选
    if (filters.workflowId && execution.workflowId !== filters.workflowId) {
      return false
    }

    // 状态筛选
    if (filters.status && execution.status !== filters.status) {
      return false
    }

    // 开始日期筛选
    if (filters.startDate) {
      const executionDate = execution.startedAt || execution.createdAt
      const startDate = new Date(filters.startDate)
      startDate.setHours(0, 0, 0, 0)
      if (new Date(executionDate) < startDate) {
        return false
      }
    }

    // 结束日期筛选
    if (filters.endDate) {
      const executionDate = execution.startedAt || execution.createdAt
      const endDate = new Date(filters.endDate)
      endDate.setHours(23, 59, 59, 999)
      if (new Date(executionDate) > endDate) {
        return false
      }
    }

    return true
  })
}

/**
 * 对执行记录进行分页
 * @param executions 执行记录列表
 * @param params 分页参数
 * @returns 分页结果
 */
export function paginateExecutions(
  executions: Execution[],
  params: PaginationParams
): PaginatedResult<Execution> {
  const { page, pageSize } = params
  const total = executions.length
  const totalPages = Math.ceil(total / pageSize)
  
  // 确保页码在有效范围内
  const validPage = Math.max(1, Math.min(page, totalPages || 1))
  
  const startIndex = (validPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const items = executions.slice(startIndex, endIndex)

  return {
    items,
    total,
    page: validPage,
    pageSize,
    totalPages,
  }
}

/**
 * 筛选并分页历史执行记录
 * @param executions 执行记录列表
 * @param filters 筛选条件
 * @param pagination 分页参数
 * @returns 分页结果
 */
export function filterAndPaginateHistory(
  executions: Execution[],
  filters: HistoryFilters,
  pagination: PaginationParams
): PaginatedResult<Execution> {
  const filtered = filterHistoryExecutions(executions, filters)
  return paginateExecutions(filtered, pagination)
}
