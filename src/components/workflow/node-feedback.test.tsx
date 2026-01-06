import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodeFeedback, TestCompleteSummary, type NodeFeedbackData } from './node-feedback'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe('NodeFeedback', () => {
  const defaultProps = {
    nodeId: 'test-node-id',
    nodeName: 'Test Node',
    nodeType: 'AI_PROCESSOR',
    executionId: 'test-execution-id',
    nodeOutput: { result: 'test output' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Feedback Option Interaction', () => {
    it('should render correct and incorrect buttons', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /正确/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /错误/i })).toBeTruthy()
    })

    it('should highlight correct button when clicked', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      // Button should have green background class
      expect(correctButton.className).toContain('bg-green-600')
    })

    it('should highlight incorrect button when clicked', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      const incorrectButton = screen.getByRole('button', { name: /错误/i })
      fireEvent.click(incorrectButton)
      
      // Button should have red background class
      expect(incorrectButton.className).toContain('bg-red-600')
    })

    it('should show submit button after selecting correct', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      expect(screen.getByRole('button', { name: /提交反馈/i })).toBeTruthy()
    })

    it('should show error details form when incorrect is selected', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      const incorrectButton = screen.getByRole('button', { name: /错误/i })
      fireEvent.click(incorrectButton)
      
      // Should show error category select and error reason textarea
      expect(screen.getByText('错误分类')).toBeTruthy()
      expect(screen.getByText('错误原因（可选）')).toBeTruthy()
    })

    it('should not show error details form when correct is selected', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      // Should not show error category select
      expect(screen.queryByText('错误分类')).toBeNull()
    })
  })

  describe('Error Reason Input', () => {
    it('should allow entering error reason', () => {
      render(<NodeFeedback {...defaultProps} />)
      
      // Select incorrect
      const incorrectButton = screen.getByRole('button', { name: /错误/i })
      fireEvent.click(incorrectButton)
      
      // Find and type in the textarea
      const textarea = screen.getByPlaceholderText('请描述错误原因...')
      fireEvent.change(textarea, { target: { value: 'Test error reason' } })
      
      expect((textarea as HTMLTextAreaElement).value).toBe('Test error reason')
    })

    it('should show error when submitting incorrect without reason or category', async () => {
      render(<NodeFeedback {...defaultProps} />)
      
      // Select incorrect
      const incorrectButton = screen.getByRole('button', { name: /错误/i })
      fireEvent.click(incorrectButton)
      
      // Try to submit without providing reason or category
      const submitButton = screen.getByRole('button', { name: /提交反馈/i })
      fireEvent.click(submitButton)
      
      // Should show error message
      expect(screen.getByText('请提供错误原因或选择错误分类')).toBeTruthy()
    })
  })

  describe('Feedback Submission', () => {
    it('should submit correct feedback successfully', async () => {
      const onSubmit = vi.fn()
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: { feedback: { id: 'feedback-id' } } 
        }),
      })
      
      render(<NodeFeedback {...defaultProps} onSubmit={onSubmit} />)
      
      // Select correct
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      // Submit
      const submitButton = screen.getByRole('button', { name: /提交反馈/i })
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/executions/test-execution-id/node-feedback',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        )
      })
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
          nodeId: 'test-node-id',
          isCorrect: true,
        }))
      })
    })

    it('should show submitted state after successful submission', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: { feedback: { id: 'feedback-id' } } 
        }),
      })
      
      render(<NodeFeedback {...defaultProps} />)
      
      // Select correct and submit
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      const submitButton = screen.getByRole('button', { name: /提交反馈/i })
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('已标记为正确')).toBeTruthy()
      })
    })

    it('should allow modifying feedback after submission', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: { feedback: { id: 'feedback-id' } } 
        }),
      })
      
      render(<NodeFeedback {...defaultProps} />)
      
      // Select correct and submit
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      const submitButton = screen.getByRole('button', { name: /提交反馈/i })
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('已标记为正确')).toBeTruthy()
      })
      
      // Click modify button
      const modifyButton = screen.getByRole('button', { name: /修改/i })
      fireEvent.click(modifyButton)
      
      // Should show feedback options again
      expect(screen.getByRole('button', { name: /正确/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /错误/i })).toBeTruthy()
    })

    it('should handle submission error', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ 
          error: { message: 'Submission failed' } 
        }),
      })
      
      render(<NodeFeedback {...defaultProps} />)
      
      // Select correct and submit
      const correctButton = screen.getByRole('button', { name: /正确/i })
      fireEvent.click(correctButton)
      
      const submitButton = screen.getByRole('button', { name: /提交反馈/i })
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('Submission failed')).toBeTruthy()
      })
    })
  })

  describe('Initial Feedback State', () => {
    it('should show submitted state when initialFeedback is provided', () => {
      render(
        <NodeFeedback 
          {...defaultProps} 
          initialFeedback={{ isCorrect: true }}
        />
      )
      
      expect(screen.getByText('已标记为正确')).toBeTruthy()
    })

    it('should show error details in submitted state when initialFeedback has error', () => {
      render(
        <NodeFeedback 
          {...defaultProps} 
          initialFeedback={{ 
            isCorrect: false, 
            errorCategory: 'OUTPUT_FORMAT' 
          }}
        />
      )
      
      expect(screen.getByText(/已标记为错误/)).toBeTruthy()
      expect(screen.getByText(/输出格式错误/)).toBeTruthy()
    })
  })

  describe('Disabled State', () => {
    it('should disable buttons when disabled prop is true', () => {
      render(<NodeFeedback {...defaultProps} disabled={true} />)
      
      const correctButton = screen.getByRole('button', { name: /正确/i })
      const incorrectButton = screen.getByRole('button', { name: /错误/i })
      
      expect(correctButton).toHaveProperty('disabled', true)
      expect(incorrectButton).toHaveProperty('disabled', true)
    })
  })
})

describe('TestCompleteSummary', () => {
  const createFeedbackMap = (feedbacks: NodeFeedbackData[]): Map<string, NodeFeedbackData> => {
    const map = new Map<string, NodeFeedbackData>()
    feedbacks.forEach(f => map.set(f.nodeId, f))
    return map
  }

  it('should display correct statistics', () => {
    const feedbacks = createFeedbackMap([
      { nodeId: '1', nodeName: 'Node 1', nodeType: 'AI', isCorrect: true },
      { nodeId: '2', nodeName: 'Node 2', nodeType: 'AI', isCorrect: true },
      { nodeId: '3', nodeName: 'Node 3', nodeType: 'AI', isCorrect: false, errorCategory: 'OUTPUT_FORMAT' },
    ])
    
    render(<TestCompleteSummary feedbacks={feedbacks} totalNodes={5} />)
    
    // Check statistics using more specific queries
    expect(screen.getByText('5')).toBeTruthy() // Total nodes
    expect(screen.getByText('总节点数')).toBeTruthy()
    expect(screen.getByText('正确')).toBeTruthy()
    expect(screen.getByText('错误')).toBeTruthy()
    expect(screen.getByText('未反馈')).toBeTruthy()
    // Verify the correct rate is displayed
    expect(screen.getByText('正确率: 67%')).toBeTruthy()
  })

  it('should display correct rate', () => {
    const feedbacks = createFeedbackMap([
      { nodeId: '1', nodeName: 'Node 1', nodeType: 'AI', isCorrect: true },
      { nodeId: '2', nodeName: 'Node 2', nodeType: 'AI', isCorrect: false },
    ])
    
    render(<TestCompleteSummary feedbacks={feedbacks} totalNodes={2} />)
    
    // 1 correct out of 2 = 50%
    expect(screen.getByText('正确率: 50%')).toBeTruthy()
  })

  it('should display error category breakdown', () => {
    const feedbacks = createFeedbackMap([
      { nodeId: '1', nodeName: 'Node 1', nodeType: 'AI', isCorrect: false, errorCategory: 'OUTPUT_FORMAT' },
      { nodeId: '2', nodeName: 'Node 2', nodeType: 'AI', isCorrect: false, errorCategory: 'OUTPUT_FORMAT' },
      { nodeId: '3', nodeName: 'Node 3', nodeType: 'AI', isCorrect: false, errorCategory: 'LOGIC_ERROR' },
    ])
    
    render(<TestCompleteSummary feedbacks={feedbacks} totalNodes={3} />)
    
    expect(screen.getByText('错误分类统计')).toBeTruthy()
    expect(screen.getByText('输出格式错误')).toBeTruthy()
    expect(screen.getByText('逻辑错误')).toBeTruthy()
  })

  it('should be collapsible', () => {
    const feedbacks = createFeedbackMap([
      { nodeId: '1', nodeName: 'Node 1', nodeType: 'AI', isCorrect: true },
    ])
    
    render(<TestCompleteSummary feedbacks={feedbacks} totalNodes={1} />)
    
    // Initially expanded, should show statistics
    expect(screen.getByText('总节点数')).toBeTruthy()
    
    // Click to collapse
    const headerButton = screen.getByText('测试完成摘要').closest('button')
    if (headerButton) {
      fireEvent.click(headerButton)
    }
    
    // After collapse, statistics should be hidden
    expect(screen.queryByText('总节点数')).toBeNull()
  })

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const feedbacks = createFeedbackMap([
      { nodeId: '1', nodeName: 'Node 1', nodeType: 'AI', isCorrect: true },
    ])
    
    render(<TestCompleteSummary feedbacks={feedbacks} totalNodes={1} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /关闭/i })
    fireEvent.click(closeButton)
    
    expect(onClose).toHaveBeenCalled()
  })
})
