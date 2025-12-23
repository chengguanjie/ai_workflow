import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InputTabs } from './input-tabs'
import type { ImportedFile } from '@/lib/workflow/debug-panel/types'

/**
 * Unit tests for InputTabs component
 * 
 * Tests Tab switching functionality and file upload interactions
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1**
 */

// Mock data
const mockPredecessorNodes = [
  {
    id: 'node-1',
    type: 'PROCESS',
    data: { name: '处理节点1' }
  },
  {
    id: 'node-2', 
    type: 'INPUT',
    data: { name: '输入节点' }
  }
]

const mockMockInputs = {
  '处理节点1': { result: '测试数据1' },
  '输入节点': { result: '测试数据2' }
}

const mockImportedFiles: ImportedFile[] = [
  {
    id: 'file-1',
    name: 'test.pdf',
    size: 1024,
    type: 'application/pdf',
    file: new File(['test'], 'test.pdf', { type: 'application/pdf' })
  }
]

describe('InputTabs Component', () => {
  const defaultProps = {
    activeTab: 'upstream-data' as const,
    onTabChange: vi.fn(),
    importedFiles: [] as ImportedFile[],
    onFilesChange: vi.fn(),
    predecessorNodes: mockPredecessorNodes,
    mockInputs: mockMockInputs,
    onMockInputChange: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Tab Switching', () => {
    /**
     * Test: Default tab selection
     * **Validates: Requirements 1.2**
     */
    it('should render with upstream-data tab selected by default', () => {
      render(<InputTabs {...defaultProps} />)
      
      const upstreamTab = screen.getByRole('tab', { name: /上游数据/i })
      expect(upstreamTab.getAttribute('data-state')).toBe('active')
    })

    /**
     * Test: Both tabs are rendered
     * **Validates: Requirements 1.1**
     */
    it('should render both tab triggers', () => {
      render(<InputTabs {...defaultProps} />)
      
      expect(screen.getByRole('tab', { name: /上游数据/i })).toBeTruthy()
      expect(screen.getByRole('tab', { name: /导入文件/i })).toBeTruthy()
    })
  })

  describe('Upstream Data Tab', () => {
    /**
     * Test: Display predecessor nodes
     * **Validates: Requirements 1.4**
     */
    it('should display predecessor nodes when upstream-data tab is active', () => {
      render(<InputTabs {...defaultProps} />)
      
      expect(screen.getByText('处理节点1')).toBeTruthy()
      expect(screen.getByText('输入节点')).toBeTruthy()
    })

    /**
     * Test: Display node types
     */
    it('should display node types as badges', () => {
      render(<InputTabs {...defaultProps} />)
      
      expect(screen.getByText('PROCESS')).toBeTruthy()
      expect(screen.getByText('INPUT')).toBeTruthy()
    })

    /**
     * Test: Display empty state when no predecessor nodes
     */
    it('should display empty state when no predecessor nodes', () => {
      render(<InputTabs {...defaultProps} predecessorNodes={[]} />)
      
      expect(screen.getByText('当前节点没有上游输入')).toBeTruthy()
    })

    /**
     * Test: Mock input change callback
     */
    it('should call onMockInputChange when input value changes', () => {
      render(<InputTabs {...defaultProps} />)
      
      const textareas = screen.getAllByRole('textbox')
      fireEvent.change(textareas[0], { target: { value: '新值' } })
      
      expect(defaultProps.onMockInputChange).toHaveBeenCalled()
    })
  })

  describe('File Import Tab', () => {
    /**
     * Test: Display upload area when file-import tab is active
     * **Validates: Requirements 2.1**
     */
    it('should display upload area when file-import tab is active', () => {
      render(<InputTabs {...defaultProps} activeTab="file-import" />)
      
      expect(screen.getByText('点击或拖拽文件到此处')).toBeTruthy()
    })

    /**
     * Test: Display supported file types hint
     */
    it('should display supported file types hint', () => {
      render(<InputTabs {...defaultProps} activeTab="file-import" />)
      
      expect(screen.getByText(/支持 Word、PDF、Excel/i)).toBeTruthy()
    })

    /**
     * Test: Display imported files list
     * **Validates: Requirements 2.3**
     */
    it('should display imported files list', () => {
      render(
        <InputTabs 
          {...defaultProps} 
          activeTab="file-import"
          importedFiles={mockImportedFiles}
        />
      )
      
      expect(screen.getByText('test.pdf')).toBeTruthy()
    })

    /**
     * Test: Display file count
     */
    it('should display file count when files are imported', () => {
      render(
        <InputTabs 
          {...defaultProps} 
          activeTab="file-import"
          importedFiles={mockImportedFiles}
        />
      )
      
      expect(screen.getByText(/已导入文件/i)).toBeTruthy()
    })

    /**
     * Test: Clear all files button
     * **Validates: Requirements 2.6**
     */
    it('should call onFilesChange with empty array when clear button is clicked', () => {
      render(
        <InputTabs 
          {...defaultProps} 
          activeTab="file-import"
          importedFiles={mockImportedFiles}
        />
      )
      
      const clearButton = screen.getByRole('button', { name: /清空/i })
      fireEvent.click(clearButton)
      
      expect(defaultProps.onFilesChange).toHaveBeenCalledWith([])
    })
  })
})
