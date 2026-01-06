import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExecutionPanel } from './execution-panel'

// Mock the workflow store
vi.mock('@/stores/workflow-store', () => ({
  useWorkflowStore: () => ({
    nodes: [],
    edges: [],
    setActiveExecution: vi.fn(),
    clearNodeExecutionStatus: vi.fn(),
    updateNodeExecutionStatus: vi.fn(),
  }),
}))

// Mock the execution stream hook
vi.mock('@/hooks/use-execution-stream', () => ({
  useExecutionStream: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: false,
  }),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe('ExecutionPanel', () => {
  const defaultProps = {
    workflowId: 'test-workflow-id',
    isOpen: true,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Mode Switching', () => {
    it('should render with execute mode by default', () => {
      render(<ExecutionPanel {...defaultProps} />)
      
      // Check that the execute mode button is active (has bg-background class)
      const executeButton = screen.getByRole('button', { name: /执行模式/i })
      expect(executeButton.className).toContain('bg-background')
    })

    it('should render with test mode when initialMode is test', () => {
      render(<ExecutionPanel {...defaultProps} initialMode="test" />)
      
      // Check that the test mode button is active
      const testButton = screen.getByRole('button', { name: /测试模式/i })
      expect(testButton.className).toContain('bg-background')
    })

    it('should switch to test mode when test mode button is clicked', () => {
      render(<ExecutionPanel {...defaultProps} />)
      
      const testButton = screen.getByRole('button', { name: /测试模式/i })
      fireEvent.click(testButton)
      
      // After clicking, test mode button should be active
      expect(testButton.className).toContain('bg-background')
    })

    it('should switch to execute mode when execute mode button is clicked', () => {
      render(<ExecutionPanel {...defaultProps} initialMode="test" />)
      
      const executeButton = screen.getByRole('button', { name: /执行模式/i })
      fireEvent.click(executeButton)
      
      // After clicking, execute mode button should be active
      expect(executeButton.className).toContain('bg-background')
    })

    it('should display header for execute mode', () => {
      render(<ExecutionPanel {...defaultProps} />)
      
      // The header should be present
      const header = screen.getByText('执行工作流')
      expect(header).toBeTruthy()
    })

    it('should display header for test mode', () => {
      render(<ExecutionPanel {...defaultProps} initialMode="test" />)
      
      // The header should be present
      const header = screen.getByText('执行工作流')
      expect(header).toBeTruthy()
    })
  })

  describe('Minimize Functionality', () => {
    it('should not show minimize button when not executing', () => {
      render(<ExecutionPanel {...defaultProps} />)
      
      // Minimize button should not be visible when not executing
      const minimizeButton = screen.queryByTitle('最小化到后台')
      expect(minimizeButton).toBeNull()
    })

    it('should call onMinimize when minimize button is clicked and onMinimize is provided', async () => {
      const onMinimize = vi.fn()
      
      // Mock fetch to simulate execution
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: { taskId: 'test-task-id' } 
        }),
      })
      
      render(<ExecutionPanel {...defaultProps} onMinimize={onMinimize} />)
      
      // Click execute button to start execution
      const executeButton = screen.getByRole('button', { name: /^执行$/i })
      fireEvent.click(executeButton)
      
      // Wait for the minimize button to appear
      await waitFor(() => {
        const minimizeButton = screen.queryByTitle('最小化到后台')
        expect(minimizeButton).not.toBeNull()
      })
      
      // Click minimize button
      const minimizeButton = screen.getByTitle('最小化到后台')
      fireEvent.click(minimizeButton)
      
      expect(onMinimize).toHaveBeenCalled()
    })

    it('should call onClose when minimize button is clicked without onMinimize prop', async () => {
      const onClose = vi.fn()
      
      // Mock fetch to simulate execution
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          data: { taskId: 'test-task-id' } 
        }),
      })
      
      render(<ExecutionPanel {...defaultProps} onClose={onClose} />)
      
      // Click execute button to start execution
      const executeButton = screen.getByRole('button', { name: /^执行$/i })
      fireEvent.click(executeButton)
      
      // Wait for the minimize button to appear
      await waitFor(() => {
        const minimizeButton = screen.queryByTitle('最小化到后台')
        expect(minimizeButton).not.toBeNull()
      })
      
      // Click minimize button
      const minimizeButton = screen.getByTitle('最小化到后台')
      fireEvent.click(minimizeButton)
      
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('Panel Visibility', () => {
    it('should not render when isOpen is false', () => {
      render(<ExecutionPanel {...defaultProps} isOpen={false} />)
      
      expect(screen.queryByText('执行工作流')).toBeNull()
    })

    it('should render when isOpen is true', () => {
      render(<ExecutionPanel {...defaultProps} isOpen={true} />)
      
      expect(screen.getByText('执行工作流')).toBeTruthy()
    })

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn()
      render(<ExecutionPanel {...defaultProps} onClose={onClose} />)
      
      // Find and click the close button (X icon)
      const closeButtons = screen.getAllByRole('button')
      const closeButton = closeButtons.find(btn => btn.querySelector('svg.lucide-x'))
      
      if (closeButton) {
        fireEvent.click(closeButton)
        expect(onClose).toHaveBeenCalled()
      }
    })
  })
})
