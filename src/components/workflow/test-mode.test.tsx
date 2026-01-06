import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TestMode, type InputField, type NodeExecutionInfo } from './test-mode'

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

describe('TestMode', () => {
  const mockInputFields: InputField[] = [
    {
      nodeId: 'node-1',
      nodeName: '输入节点',
      fieldId: 'field-1',
      fieldName: 'testField',
      fieldType: 'text',
      defaultValue: '',
    },
    {
      nodeId: 'node-1',
      nodeName: '输入节点',
      fieldId: 'field-2',
      fieldName: 'selectField',
      fieldType: 'select',
      defaultValue: '',
      options: [
        { label: '选项1', value: 'option1' },
        { label: '选项2', value: 'option2' },
      ],
    },
  ]

  const mockNodeStates = new Map<string, NodeExecutionInfo>([
    ['node-1', {
      nodeId: 'node-1',
      nodeName: '输入节点',
      nodeType: 'INPUT',
      status: 'pending',
    }],
    ['node-2', {
      nodeId: 'node-2',
      nodeName: '处理节点',
      nodeType: 'PROCESS',
      status: 'pending',
    }],
  ])

  const defaultProps = {
    workflowId: 'test-workflow-id',
    inputFields: mockInputFields,
    inputValues: {},
    onInputChange: vi.fn(),
    nodeStates: mockNodeStates,
    testModeStatus: 'idle' as const,
    currentNodeId: null,
    isExecuting: false,
    onExecute: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('AI Generate Button', () => {
    it('should render AI generate button when in idle state with input fields', () => {
      render(<TestMode {...defaultProps} />)
      
      const generateButton = screen.getByRole('button', { name: /AI 生成测试数据/i })
      expect(generateButton).toBeTruthy()
    })

    it('should not render AI generate button when no input fields', () => {
      render(<TestMode {...defaultProps} inputFields={[]} />)
      
      const generateButton = screen.queryByRole('button', { name: /AI 生成测试数据/i })
      expect(generateButton).toBeNull()
    })

    it('should call API when AI generate button is clicked', async () => {
      const mockResponse = {
        success: true,
        data: {
          data: { testField: 'generated value', selectField: 'option1' },
          isAIGenerated: true,
        },
      }
      
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      render(<TestMode {...defaultProps} />)
      
      const generateButton = screen.getByRole('button', { name: /AI 生成测试数据/i })
      fireEvent.click(generateButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/workflows/test-workflow-id/generate-test-data',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        )
      })
    })

    it('should update input values after successful AI generation', async () => {
      const onInputChange = vi.fn()
      const mockResponse = {
        success: true,
        data: {
          data: { testField: 'AI generated', selectField: 'option2' },
          isAIGenerated: true,
        },
      }
      
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      render(<TestMode {...defaultProps} onInputChange={onInputChange} />)
      
      const generateButton = screen.getByRole('button', { name: /AI 生成测试数据/i })
      fireEvent.click(generateButton)

      await waitFor(() => {
        expect(onInputChange).toHaveBeenCalledWith(
          expect.objectContaining({
            testField: 'AI generated',
            selectField: 'option2',
          })
        )
      })
    })

    it('should show loading state while generating', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ data: { data: {}, isAIGenerated: true } }),
        }), 100))
      )

      render(<TestMode {...defaultProps} />)
      
      const generateButton = screen.getByRole('button', { name: /AI 生成测试数据/i })
      fireEvent.click(generateButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/生成中/i)).toBeTruthy()
      })
    })

    it('should be disabled when executing', () => {
      render(<TestMode {...defaultProps} isExecuting={true} />)
      
      const generateButton = screen.getByRole('button', { name: /AI 生成测试数据/i })
      expect(generateButton).toHaveProperty('disabled', true)
    })
  })

  describe('Node Results Display', () => {
    it('should not show node results in idle state', () => {
      render(<TestMode {...defaultProps} testModeStatus="idle" />)
      
      expect(screen.queryByText('节点执行进度')).toBeNull()
    })

    it('should show node results when running', () => {
      render(<TestMode {...defaultProps} testModeStatus="running" />)
      
      expect(screen.getByText('节点执行进度')).toBeTruthy()
      expect(screen.getByText('输入节点')).toBeTruthy()
      expect(screen.getByText('处理节点')).toBeTruthy()
    })

    it('should show node results when completed', () => {
      render(<TestMode {...defaultProps} testModeStatus="completed" />)
      
      expect(screen.getByText('节点执行进度')).toBeTruthy()
    })

    it('should show node results when failed', () => {
      render(<TestMode {...defaultProps} testModeStatus="failed" />)
      
      expect(screen.getByText('节点执行进度')).toBeTruthy()
    })

    it('should display node output when expanded', () => {
      const nodeStatesWithOutput = new Map<string, NodeExecutionInfo>([
        ['node-1', {
          nodeId: 'node-1',
          nodeName: '输入节点',
          nodeType: 'INPUT',
          status: 'completed',
          output: { result: 'test output' },
        }],
      ])

      render(
        <TestMode 
          {...defaultProps} 
          nodeStates={nodeStatesWithOutput}
          testModeStatus="completed" 
        />
      )
      
      // Click to expand node details
      const nodeButton = screen.getByText('输入节点').closest('button')
      if (nodeButton) {
        fireEvent.click(nodeButton)
      }

      // Should show output
      expect(screen.getByText(/test output/)).toBeTruthy()
    })

    it('should display node error when present', () => {
      const nodeStatesWithError = new Map<string, NodeExecutionInfo>([
        ['node-1', {
          nodeId: 'node-1',
          nodeName: '输入节点',
          nodeType: 'INPUT',
          status: 'failed',
          error: 'Test error message',
        }],
      ])

      render(
        <TestMode 
          {...defaultProps} 
          nodeStates={nodeStatesWithError}
          testModeStatus="failed" 
        />
      )
      
      // Click to expand node details
      const nodeButton = screen.getByText('输入节点').closest('button')
      if (nodeButton) {
        fireEvent.click(nodeButton)
      }

      // Should show error
      expect(screen.getByText(/Test error message/)).toBeTruthy()
    })
  })

  describe('Input Form', () => {
    it('should render input fields in idle state', () => {
      render(<TestMode {...defaultProps} />)
      
      expect(screen.getByPlaceholderText(/输入 testField/i)).toBeTruthy()
    })

    it('should not render input fields when not in idle state', () => {
      render(<TestMode {...defaultProps} testModeStatus="running" />)
      
      expect(screen.queryByPlaceholderText(/输入 testField/i)).toBeNull()
    })

    it('should call onInputChange when input value changes', () => {
      const onInputChange = vi.fn()
      render(<TestMode {...defaultProps} onInputChange={onInputChange} />)
      
      const input = screen.getByPlaceholderText(/输入 testField/i)
      fireEvent.change(input, { target: { value: 'new value' } })

      expect(onInputChange).toHaveBeenCalledWith(
        expect.objectContaining({ testField: 'new value' })
      )
    })

    it('should render execute button in idle state', () => {
      render(<TestMode {...defaultProps} />)
      
      expect(screen.getByRole('button', { name: /开始测试执行/i })).toBeTruthy()
    })

    it('should call onExecute when execute button is clicked', () => {
      const onExecute = vi.fn()
      render(<TestMode {...defaultProps} onExecute={onExecute} />)
      
      const executeButton = screen.getByRole('button', { name: /开始测试执行/i })
      fireEvent.click(executeButton)

      expect(onExecute).toHaveBeenCalled()
    })
  })
})
