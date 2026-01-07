import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DebugLogViewer } from './debug-log-viewer'
import type { DebugLogData } from '@/lib/workflow/debug-events'

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn(() => Promise.resolve()),
}
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  configurable: true,
})

describe('DebugLogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('日志渲染', () => {
    it('renders empty state when no logs and idle', () => {
      render(<DebugLogViewer logs={[]} isRunning={false} status="idle" />)
      expect(screen.getByText('等待执行...')).toBeTruthy()
    })

    it('renders logs with correct content', () => {
      const logs: DebugLogData[] = [
        { level: 'info', message: '开始执行', timestamp: '2024-01-01T10:00:00Z' },
        { level: 'success', message: '执行成功', timestamp: '2024-01-01T10:00:01Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="completed" />)

      expect(screen.getByText('开始执行')).toBeTruthy()
      expect(screen.getByText('执行成功')).toBeTruthy()
    })

    it('renders log with step information', () => {
      const logs: DebugLogData[] = [
        { level: 'step', message: '处理数据', step: 'step-1', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="running" />)

      expect(screen.getByText('[step-1]')).toBeTruthy()
      expect(screen.getByText('处理数据')).toBeTruthy()
    })
  })

  describe('颜色样式', () => {
    it('applies correct color class for info level', () => {
      const logs: DebugLogData[] = [
        { level: 'info', message: 'Info message', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="idle" />)

      const messageElement = screen.getByText('Info message')
      expect(messageElement.className).toContain('text-blue-400')
    })

    it('applies correct color class for error level', () => {
      const logs: DebugLogData[] = [
        { level: 'error', message: 'Error message', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="failed" />)

      const messageElement = screen.getByText('Error message')
      expect(messageElement.className).toContain('text-red-400')
    })

    it('applies correct color class for success level', () => {
      const logs: DebugLogData[] = [
        { level: 'success', message: 'Success message', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="completed" />)

      const messageElement = screen.getByText('Success message')
      expect(messageElement.className).toContain('text-green-400')
    })

    it('applies correct color class for warning level', () => {
      const logs: DebugLogData[] = [
        { level: 'warning', message: 'Warning message', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="idle" />)

      const messageElement = screen.getByText('Warning message')
      expect(messageElement.className).toContain('text-orange-400')
    })

    it('applies correct color class for step level', () => {
      const logs: DebugLogData[] = [
        { level: 'step', message: 'Step message', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="running" />)

      const messageElement = screen.getByText('Step message')
      expect(messageElement.className).toContain('text-yellow-400')
    })
  })

  describe('JSON 格式化', () => {
    it('renders expandable data section when log has data', () => {
      const logs: DebugLogData[] = [
        {
          level: 'info',
          message: 'With data',
          timestamp: '2024-01-01T10:00:00Z',
          data: { key: 'value', nested: { a: 1 } },
        },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="idle" />)

      expect(screen.getByText('▶ 展开数据')).toBeTruthy()
    })

    it('expands and shows formatted JSON when clicking expand button', async () => {
      const logs: DebugLogData[] = [
        {
          level: 'info',
          message: 'With data',
          timestamp: '2024-01-01T10:00:00Z',
          data: { key: 'value' },
        },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="idle" />)

      fireEvent.click(screen.getByText('▶ 展开数据'))

      await waitFor(() => {
        expect(screen.getByText('▼ 收起数据')).toBeTruthy()
      })

      // Check that JSON is formatted with indentation
      const preElement = screen.getByText(/"key": "value"/)
      expect(preElement).toBeTruthy()
    })
  })

  describe('状态指示器', () => {
    it('shows running indicator when isRunning is true', () => {
      render(<DebugLogViewer logs={[]} isRunning={true} status="running" />)
      expect(screen.getByText('正在执行...')).toBeTruthy()
    })

    it('shows completed indicator when status is completed', () => {
      const logs: DebugLogData[] = [
        { level: 'info', message: 'Test', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="completed" />)
      expect(screen.getByText('执行完成')).toBeTruthy()
    })

    it('shows failed indicator when status is failed', () => {
      const logs: DebugLogData[] = [
        { level: 'error', message: 'Error', timestamp: '2024-01-01T10:00:00Z' },
      ]

      render(<DebugLogViewer logs={logs} isRunning={false} status="failed" />)
      expect(screen.getByText('执行失败')).toBeTruthy()
    })
  })

  describe('复制功能', () => {
    it('copies logs to clipboard when copy button is clicked', async () => {
      const logs: DebugLogData[] = [
        { level: 'info', message: 'Test message', timestamp: '2024-01-01T10:00:00Z' },
      ]
      const onCopy = vi.fn()

      render(<DebugLogViewer logs={logs} isRunning={false} status="idle" onCopy={onCopy} />)

      const copyButton = screen.getByTitle('复制日志')
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalled()
        expect(onCopy).toHaveBeenCalled()
      })
    })
  })
})
