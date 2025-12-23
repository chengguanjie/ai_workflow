'use client'

/**
 * 执行历史页面
 * 
 * 分为两个区域：
 * - RunningSection: 正在执行的工作流（RUNNING/PENDING）
 * - HistorySection: 历史记录（COMPLETED/FAILED/CANCELLED）
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  History,
  RefreshCw,
} from 'lucide-react'
import { RunningSection } from '@/components/execution/running-section'
import { HistorySection, type HistoryFilters, type WorkflowOption } from '@/components/execution/history-section'
import type { Execution } from '@/lib/execution/categorize'

// 自动刷新间隔（毫秒）
const AUTO_REFRESH_INTERVAL = 5000

export default function ExecutionsPage() {
  // 运行中的执行记录
  const [runningExecutions, setRunningExecutions] = useState<Execution[]>([])
  const [isLoadingRunning, setIsLoadingRunning] = useState(true)
  
  // 历史记录
  const [historyExecutions, setHistoryExecutions] = useState<Execution[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const historyPageSize = 20

  // 筛选状态
  const [filters, setFilters] = useState<HistoryFilters>({})

  // 工作流列表
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([])

  // 自动刷新相关
  const runningIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 加载工作流列表
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const response = await fetch('/api/workflows')
        if (response.ok) {
          const data = await response.json()
          setWorkflows(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        console.error('Load workflows error:', error)
      }
    }
    loadWorkflows()
  }, [])

  // 加载运行中的执行记录
  const loadRunningExecutions = useCallback(async () => {
    try {
      // 获取运行中和等待中的执行记录
      const params = new URLSearchParams({
        limit: '100', // 获取足够多的记录以包含所有运行中的
        offset: '0',
      })
      
      const response = await fetch(`/api/executions?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          // 过滤出运行中的执行记录
          const allExecutions = result.data.executions || []
          const running = allExecutions.filter(
            (e: Execution) => e.status === 'RUNNING' || e.status === 'PENDING'
          )
          setRunningExecutions(running)
        } else {
          setRunningExecutions([])
        }
      }
    } catch (error) {
      console.error('Load running executions error:', error)
    } finally {
      setIsLoadingRunning(false)
    }
  }, [])

  // 加载历史记录
  const loadHistoryExecutions = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const offset = (historyPage - 1) * historyPageSize
      const params = new URLSearchParams({
        limit: String(historyPageSize),
        offset: String(offset),
      })
      
      // 添加筛选条件
      if (filters.workflowId) {
        params.append('workflowId', filters.workflowId)
      }
      if (filters.status) {
        params.append('status', filters.status)
      } else {
        // 默认只获取历史记录状态
        params.append('statusIn', 'COMPLETED,FAILED,CANCELLED')
      }
      if (filters.startDate) {
        params.append('startDate', filters.startDate)
      }
      if (filters.endDate) {
        params.append('endDate', filters.endDate)
      }
      
      const response = await fetch(`/api/executions?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          // 过滤确保只有历史记录状态
          const executions = (result.data.executions || []).filter(
            (e: Execution) => 
              e.status === 'COMPLETED' || 
              e.status === 'FAILED' || 
              e.status === 'CANCELLED'
          )
          setHistoryExecutions(executions)
          setHistoryTotal(result.data.total || 0)
        } else {
          setHistoryExecutions([])
          setHistoryTotal(0)
        }
      }
    } catch (error) {
      console.error('Load history executions error:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [historyPage, filters])

  // 初始加载
  useEffect(() => {
    loadRunningExecutions()
  }, [loadRunningExecutions])

  useEffect(() => {
    loadHistoryExecutions()
  }, [loadHistoryExecutions])

  // 运行区域自动刷新逻辑（5秒间隔）
  useEffect(() => {
    // 只有当有运行中的执行记录时才启动自动刷新
    if (runningExecutions.length > 0) {
      runningIntervalRef.current = setInterval(() => {
        loadRunningExecutions()
        // 同时刷新历史记录，因为运行中的可能已完成
        loadHistoryExecutions()
      }, AUTO_REFRESH_INTERVAL)
    } else {
      // 没有运行中的执行记录时，清除定时器
      if (runningIntervalRef.current) {
        clearInterval(runningIntervalRef.current)
        runningIntervalRef.current = null
      }
    }

    return () => {
      if (runningIntervalRef.current) {
        clearInterval(runningIntervalRef.current)
      }
    }
  }, [runningExecutions.length, loadRunningExecutions, loadHistoryExecutions])

  // 手动刷新
  const handleRefresh = () => {
    setIsLoadingRunning(true)
    setIsLoadingHistory(true)
    loadRunningExecutions()
    loadHistoryExecutions()
  }

  // 处理筛选条件变化
  const handleFiltersChange = (newFilters: HistoryFilters) => {
    setFilters(newFilters)
    setHistoryPage(1) // 重置到第一页
  }

  // 处理页码变化
  const handlePageChange = (page: number) => {
    setHistoryPage(page)
  }

  // 计算总记录数（运行中 + 历史）
  const totalRecords = runningExecutions.length + historyTotal

  return (
    <div className="container mx-auto py-6">
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">执行历史</h1>
          <span className="text-sm text-muted-foreground">共 {totalRecords} 条记录</span>
        </div>
        <div className="flex items-center gap-4">
          {/* 自动刷新状态指示 */}
          {runningExecutions.length > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
              </span>
              自动刷新中
            </span>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={isLoadingRunning || isLoadingHistory}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${(isLoadingRunning || isLoadingHistory) ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 正在执行区域 - 视觉区分样式 */}
      <RunningSection
        executions={runningExecutions}
        isLoading={isLoadingRunning}
      />

      {/* 历史记录区域 */}
      <HistorySection
        executions={historyExecutions}
        total={historyTotal}
        page={historyPage}
        pageSize={historyPageSize}
        isLoading={isLoadingHistory}
        filters={filters}
        workflows={workflows}
        onPageChange={handlePageChange}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}
