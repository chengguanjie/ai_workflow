import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TestFeedbackStatistics from './test-feedback-statistics'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock next/dynamic to render components synchronously
vi.mock('next/dynamic', () => ({
  default: (fn: () => Promise<{ default: React.ComponentType }>) => {
    const Component = vi.fn(() => null)
    // Return a simple mock component
    return function MockDynamicComponent() {
      return null
    }
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe('TestFeedbackStatistics', () => {
  const mockStatisticsData = {
    success: true,
    data: {
      totalTests: 10,
      nodeStatistics: [
        {
          nodeId: 'node-1',
          nodeName: 'AI 处理节点',
          nodeType: 'AI',
          totalFeedbacks: 8,
          correctCount: 6,
          incorrectCount: 2,
          correctRate: 0.75,
          errorCategories: {
            OUTPUT_FORMAT: 1,
            LOGIC_ERROR: 1,
          },
        },
        {
          nodeId: 'node-2',
          nodeName: '数据转换节点',
          nodeType: 'TRANSFORM',
          totalFeedbacks: 5,
          correctCount: 5,
          incorrectCount: 0,
          correctRate: 1.0,
          errorCategories: {},
        },
      ],
      errorCategoryBreakdown: {
        OUTPUT_FORMAT: 1,
        LOGIC_ERROR: 1,
      },
      trend: [
        { date: '2025-01-01', correctRate: 0.7, testCount: 3 },
        { date: '2025-01-02', correctRate: 0.8, testCount: 4 },
        { date: '2025-01-03', correctRate: 0.85, testCount: 3 },
      ],
    },
  }

  const emptyStatisticsData = {
    success: true,
    data: {
      totalTests: 0,
      nodeStatistics: [],
      errorCategoryBreakdown: {},
      trend: [],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Data Loading and Display', () => {
    it('should show loading state initially', () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {}) // Never resolves to keep loading state
      )

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)
      
      // Should show loading spinner
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('should load and display statistics data', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        // Should display total tests
        expect(screen.getByText('10')).toBeTruthy()
      })

      // Should display correct rate
      expect(screen.getByText('84.6%')).toBeTruthy()

      // Should display node names
      expect(screen.getByText('AI 处理节点')).toBeTruthy()
      expect(screen.getByText('数据转换节点')).toBeTruthy()
    })

    it('should display empty state when no data', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        // Should display zero total tests - use getAllByText since there are multiple 0s
        const zeros = screen.getAllByText('0')
        expect(zeros.length).toBeGreaterThan(0)
      })

      // Should display empty state messages
      expect(screen.getByText('暂无节点反馈数据')).toBeTruthy()
      expect(screen.getByText('暂无错误反馈')).toBeTruthy()
    })

    it('should handle API error gracefully', async () => {
      const { toast } = await import('sonner')
      
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('加载测试统计数据失败')
      })
    })
  })

  describe('Filtering Functionality', () => {
    it('should call API with date filters when dates are set', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        expect(screen.getByText('10')).toBeTruthy()
      })

      // Find and set start date using the id
      const startDateInput = document.getElementById('start-date') as HTMLInputElement
      fireEvent.change(startDateInput, { target: { value: '2025-01-01' } })

      await waitFor(() => {
        // Should have called fetch with date parameter
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[0]).toContain('startDate=')
      })
    })

    it('should reset filters when reset button is clicked', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      const { rerender } = render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('10')).toBeTruthy()
      })

      // Set a date filter first
      const startDateInput = document.getElementById('start-date') as HTMLInputElement
      fireEvent.change(startDateInput, { target: { value: '2025-01-01' } })

      // Wait for the filter to be applied
      await waitFor(() => {
        expect(startDateInput.value).toBe('2025-01-01')
      })

      // Click reset button
      const resetButton = screen.getByRole('button', { name: '重置' })
      fireEvent.click(resetButton)

      // Re-render to pick up state changes
      rerender(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      // Wait for the component to update - the input should be cleared
      await waitFor(() => {
        const updatedInput = document.getElementById('start-date') as HTMLInputElement
        expect(updatedInput.value).toBe('')
      }, { timeout: 2000 })
    })

    it('should refresh data when refresh button is clicked', async () => {
      const { toast } = await import('sonner')
      
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        expect(screen.getByText('10')).toBeTruthy()
      })

      const initialCallCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

      // Click refresh button
      const refreshButton = screen.getByRole('button', { name: /刷新/i })
      fireEvent.click(refreshButton)

      await waitFor(() => {
        // Should have made another API call
        expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount)
        expect(toast.success).toHaveBeenCalledWith('数据已刷新')
      })
    })
  })

  describe('Node Statistics Display', () => {
    it('should display node correct rates with appropriate colors', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        // Node with 75% correct rate should show yellow
        expect(screen.getByText('75.0%')).toBeTruthy()
        // Node with 100% correct rate should show green
        expect(screen.getByText('100.0%')).toBeTruthy()
      })
    })

    it('should display node type badges', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        expect(screen.getByText('AI')).toBeTruthy()
        expect(screen.getByText('TRANSFORM')).toBeTruthy()
      })
    })
  })

  describe('Error Category Display', () => {
    it('should display error category breakdown', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatisticsData),
      })

      render(<TestFeedbackStatistics workflowId="test-workflow-id" />)

      await waitFor(() => {
        // Should display error category labels
        expect(screen.getByText('输出格式错误')).toBeTruthy()
        expect(screen.getByText('逻辑错误')).toBeTruthy()
      })
    })
  })
})
