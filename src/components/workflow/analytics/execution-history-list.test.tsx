import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  ExecutionHistoryList,
  formatDuration,
  getStatusIcon,
  getStatusText,
  getStatusColor,
  filterExecutionsByStatus,
  type Execution,
  type StatusFilter,
} from './execution-history-list'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock fetch
global.fetch = vi.fn()

describe('ExecutionHistoryList', () => {
  const mockExecutions: Execution[] = [
    {
      id: 'exec-1',
      status: 'COMPLETED',
      duration: 1500,
      totalTokens: 1000,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    {
      id: 'exec-2',
      status: 'FAILED',
      duration: 500,
      totalTokens: 200,
      error: '执行失败：API 调用超时',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      completedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'exec-3',
      status: 'RUNNING',
      duration: null,
      totalTokens: null,
      error: null,
      createdAt: new Date(Date.now() - 60000).toISOString(),
      completedAt: null,
    },
    {
      id: 'exec-4',
      status: 'PENDING',
      duration: null,
      totalTokens: null,
      error: null,
      createdAt: new Date(Date.now() - 30000).toISOString(),
      completedAt: null,
    },
  ]

  const mockApiResponse = {
    success: true,
    data: {
      executions: mockExecutions,
      total: 4,
      limit: 20,
      offset: 0,
    },
  }

  const emptyApiResponse = {
    success: true,
    data: {
      executions: [],
      total: 0,
      limit: 20,
      offset: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Helper Functions', () => {
    describe('formatDuration', () => {
      it('should return "-" for null duration', () => {
        expect(formatDuration(null)).toBe('-')
      })

      it('should format milliseconds correctly', () => {
        expect(formatDuration(500)).toBe('500ms')
      })

      it('should format seconds correctly', () => {
        expect(formatDuration(1500)).toBe('1.5s')
        expect(formatDuration(30000)).toBe('30.0s')
      })

      it('should format minutes correctly', () => {
        expect(formatDuration(90000)).toBe('1m 30s')
        expect(formatDuration(120000)).toBe('2m 0s')
      })
    })

    describe('getStatusText', () => {
      it('should return correct Chinese text for each status', () => {
        expect(getStatusText('COMPLETED')).toBe('成功')
        expect(getStatusText('FAILED')).toBe('失败')
        expect(getStatusText('RUNNING')).toBe('执行中')
        expect(getStatusText('PENDING')).toBe('等待中')
      })
    })

    describe('getStatusColor', () => {
      it('should return correct color classes for each status', () => {
        expect(getStatusColor('COMPLETED')).toContain('green')
        expect(getStatusColor('FAILED')).toContain('red')
        expect(getStatusColor('RUNNING')).toContain('blue')
        expect(getStatusColor('PENDING')).toContain('amber')
      })
    })

    describe('filterExecutionsByStatus', () => {
      it('should return all executions when filter is "all"', () => {
        const result = filterExecutionsByStatus(mockExecutions, 'all')
        expect(result).toHaveLength(4)
      })

      it('should filter by COMPLETED status', () => {
        const result = filterExecutionsByStatus(mockExecutions, 'COMPLETED')
        expect(result).toHaveLength(1)
        expect(result[0].status).toBe('COMPLETED')
      })

      it('should filter by FAILED status', () => {
        const result = filterExecutionsByStatus(mockExecutions, 'FAILED')
        expect(result).toHaveLength(1)
        expect(result[0].status).toBe('FAILED')
      })

      it('should filter by RUNNING status', () => {
        const result = filterExecutionsByStatus(mockExecutions, 'RUNNING')
        expect(result).toHaveLength(1)
        expect(result[0].status).toBe('RUNNING')
      })

      it('should filter by PENDING status', () => {
        const result = filterExecutionsByStatus(mockExecutions, 'PENDING')
        expect(result).toHaveLength(1)
        expect(result[0].status).toBe('PENDING')
      })

      it('should return empty array when no matches', () => {
        const completedOnly: Execution[] = [mockExecutions[0]]
        const result = filterExecutionsByStatus(completedOnly, 'FAILED')
        expect(result).toHaveLength(0)
      })
    })
  })

  describe('Component Rendering', () => {
    it('should show loading state initially', () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}) // Never resolves to keep loading state
      )

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      // Should show loading spinner
      expect(document.querySelector('.animate-spin')).toBeTruthy()
      expect(screen.getByText('加载中...')).toBeTruthy()
    })

    it('should load and display execution records', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        // Should display status texts
        expect(screen.getByText('成功')).toBeTruthy()
        expect(screen.getByText('失败')).toBeTruthy()
        expect(screen.getByText('执行中')).toBeTruthy()
        expect(screen.getByText('等待中')).toBeTruthy()
      })

      // Should display total count
      expect(screen.getByText('共 4 条记录')).toBeTruthy()
    })

    it('should display empty state when no executions', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('暂无执行记录')).toBeTruthy()
        expect(screen.getByText('执行工作流后，记录将显示在这里')).toBeTruthy()
      })
    })

    it('should handle API error gracefully', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('获取执行历史失败')).toBeTruthy()
        expect(screen.getByText('重试')).toBeTruthy()
      })
    })

    it('should display duration and tokens for each execution', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        // Should display formatted duration
        expect(screen.getByText('1.5s')).toBeTruthy()
        // Should display token count
        expect(screen.getByText('1,000')).toBeTruthy()
      })
    })
  })

  describe('Expand/Collapse Functionality', () => {
    it('should expand execution details when clicked', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('成功')).toBeTruthy()
      })

      // Find and click the first execution card
      const executionCards = document.querySelectorAll('.rounded-lg.border.p-4')
      fireEvent.click(executionCards[0])

      // Should show expanded details
      await waitFor(() => {
        expect(screen.getByText('执行 ID:')).toBeTruthy()
        expect(screen.getByText('exec-1')).toBeTruthy()
      })
    })

    it('should collapse execution details when clicked again', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('成功')).toBeTruthy()
      })

      // Click to expand
      const executionCards = document.querySelectorAll('.rounded-lg.border.p-4')
      fireEvent.click(executionCards[0])

      await waitFor(() => {
        expect(screen.getByText('执行 ID:')).toBeTruthy()
      })

      // Click again to collapse
      fireEvent.click(executionCards[0])

      await waitFor(() => {
        expect(screen.queryByText('执行 ID:')).toBeFalsy()
      })
    })

    it('should display error message in expanded details for failed execution', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('失败')).toBeTruthy()
      })

      // Find and click the failed execution card (second one)
      const executionCards = document.querySelectorAll('.rounded-lg.border.p-4')
      fireEvent.click(executionCards[1])

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText('错误信息:')).toBeTruthy()
        expect(screen.getByText('执行失败：API 调用超时')).toBeTruthy()
      })
    })
  })

  describe('Status Filter Interaction', () => {
    it('should include workflowId in API call', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('成功')).toBeTruthy()
      })

      // Verify the initial API call includes workflowId
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls[0][0]).toContain('workflowId=test-workflow-id')
    })

    it('should render status filter select', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('成功')).toBeTruthy()
      })

      // Verify the status filter select is rendered
      const selectTrigger = screen.getByRole('combobox')
      expect(selectTrigger).toBeTruthy()
    })
  })

  describe('Refresh Functionality', () => {
    it('should refresh data when refresh button is clicked', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('成功')).toBeTruthy()
      })

      const initialCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Click refresh button
      const refreshButton = screen.getByRole('button', { name: /刷新/i })
      fireEvent.click(refreshButton)

      await waitFor(() => {
        // Should have made another API call
        expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount)
      })
    })
  })

  describe('Detail Links', () => {
    it('should have correct link to execution detail page', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      })

      render(<ExecutionHistoryList workflowId="test-workflow-id" period="week" />)

      await waitFor(() => {
        expect(screen.getByText('成功')).toBeTruthy()
      })

      // Check that links are generated correctly
      const links = document.querySelectorAll('a[href^="/executions/"]')
      expect(links.length).toBeGreaterThan(0)
      expect(links[0].getAttribute('href')).toBe('/executions/exec-1')
    })
  })
})
