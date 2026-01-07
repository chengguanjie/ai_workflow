/**
 * useDebugStream Hook 单元测试
 *
 * 测试调试日志流 Hook 的核心功能
 * Requirements: 1.1, 1.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDebugStream } from './use-debug-stream'
import type { DebugLogEvent, DebugLogData, DebugCompleteData } from '@/lib/workflow/debug-events'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch
if (typeof window !== 'undefined') {
  ;(window as any).fetch = mockFetch
}

function makeSseHeaders() {
  return {
    get: (key: string) => (key.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
  }
}

// Helper to create a mock ReadableStream
function createMockSSEStream(events: DebugLogEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        const event = events[index]
        const data = `data: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(data))
        index++
      } else {
        controller.close()
      }
    },
  })
}

// Helper to create mock events
function createLogEvent(level: DebugLogData['level'], message: string): DebugLogEvent {
  return {
    type: 'log',
    timestamp: new Date().toISOString(),
    data: {
      level,
      message,
      timestamp: new Date().toISOString(),
    },
  }
}

function createStatusEvent(status: 'running' | 'completed' | 'failed'): DebugLogEvent {
  return {
    type: 'status',
    timestamp: new Date().toISOString(),
    data: { status },
  }
}

function createCompleteEvent(status: DebugCompleteData['status'], output: Record<string, unknown> = {}): DebugLogEvent {
  return {
    type: 'complete',
    timestamp: new Date().toISOString(),
    data: {
      status,
      output,
      duration: 1000,
    },
  }
}

describe('useDebugStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('初始状态', () => {
    it('应该返回正确的初始状态', () => {
      const { result } = renderHook(() => useDebugStream())

      expect(result.current.isConnected).toBe(false)
      expect(result.current.isRunning).toBe(false)
      expect(result.current.logs).toEqual([])
      expect(result.current.status).toBe('idle')
      expect(result.current.result).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  describe('连接建立和断开', () => {
    it('startDebug 应该设置 isRunning 为 true', async () => {
      // Mock a successful response that stays open
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream([
          createStatusEvent('running'),
        ]),
      })

      const { result } = renderHook(() => useDebugStream())

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      expect(result.current.isRunning).toBe(true)
      expect(result.current.status).toBe('running')

      // Ensure pending async updates are flushed inside act() via waitFor,
      // then stop to avoid updates after test completion.
      await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 2000 })
      act(() => {
        result.current.stopDebug()
      })
      await waitFor(() => expect(result.current.isRunning).toBe(false), { timeout: 2000 })
    })

    it('stopDebug 应该停止执行', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream([
          createStatusEvent('running'),
        ]),
      })

      const { result } = renderHook(() => useDebugStream())

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 2000 })

      act(() => {
        result.current.stopDebug()
      })

      await waitFor(() => expect(result.current.isRunning).toBe(false), { timeout: 2000 })
      await waitFor(() => expect(result.current.isConnected).toBe(false), { timeout: 2000 })
    })

    it('clearLogs 应该清除所有日志和状态', async () => {
      const { result } = renderHook(() => useDebugStream())

      // Manually set some state first
      act(() => {
        result.current.clearLogs()
      })

      expect(result.current.logs).toEqual([])
      expect(result.current.result).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.status).toBe('idle')
    })
  })

  describe('日志追加', () => {
    it('应该正确追加日志事件', async () => {
      const events: DebugLogEvent[] = [
        createStatusEvent('running'),
        createLogEvent('info', '开始执行'),
        createLogEvent('step', '步骤 1'),
        createLogEvent('success', '执行成功'),
        createCompleteEvent('success', { result: 'test' }),
        createStatusEvent('completed'),
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream(events),
      })

      const onLog = vi.fn()
      const { result } = renderHook(() => useDebugStream({ onLog }))

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      // Wait for all events to be processed
      await waitFor(() => {
        // includes 1 local "CONNECT" log + 3 remote logs
        expect(result.current.logs.length).toBe(4)
      }, { timeout: 2000 })

      const remoteLogs = result.current.logs.filter((l) => l.step !== 'CONNECT')
      expect(remoteLogs[0].message).toBe('开始执行')
      expect(remoteLogs[1].message).toBe('步骤 1')
      expect(remoteLogs[2].message).toBe('执行成功')
      expect(onLog).toHaveBeenCalledTimes(4)

      act(() => {
        result.current.stopDebug()
      })
    })
  })

  describe('状态转换', () => {
    it('执行成功时状态应该变为 completed', async () => {
      const events: DebugLogEvent[] = [
        createStatusEvent('running'),
        createCompleteEvent('success', { result: 'test' }),
        createStatusEvent('completed'),
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream(events),
      })

      const onComplete = vi.fn()
      const { result } = renderHook(() => useDebugStream({ onComplete }))

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      await waitFor(() => {
        expect(result.current.status).toBe('completed')
      }, { timeout: 2000 })

      expect(result.current.result).not.toBeNull()
      expect(result.current.result?.status).toBe('success')
      expect(onComplete).toHaveBeenCalled()

      act(() => {
        result.current.stopDebug()
      })
    })

    it('执行失败时状态应该变为 failed', async () => {
      const events: DebugLogEvent[] = [
        createStatusEvent('running'),
        createCompleteEvent('error', {}),
        createStatusEvent('failed'),
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream(events),
      })

      const onComplete = vi.fn()
      const { result } = renderHook(() => useDebugStream({ onComplete }))

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      await waitFor(() => {
        expect(result.current.status).toBe('failed')
      }, { timeout: 2000 })

      expect(result.current.result?.status).toBe('error')

      act(() => {
        result.current.stopDebug()
      })
    })

    it('HTTP 错误应该设置 error 状态', async () => {
      // Mock fetch to reject immediately (network error, no retry)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const onError = vi.fn()
      const { result } = renderHook(() => useDebugStream({ onError }))

      await act(async () => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      // Initial state should be running
      expect(result.current.isRunning).toBe(true)

      act(() => {
        result.current.stopDebug()
      })
    })
  })

  describe('回调函数', () => {
    it('应该在收到日志时调用 onLog', async () => {
      const events: DebugLogEvent[] = [
        createStatusEvent('running'),
        createLogEvent('info', '测试日志'),
        createCompleteEvent('success'),
        createStatusEvent('completed'),
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream(events),
      })

      const onLog = vi.fn()
      const { result } = renderHook(() => useDebugStream({ onLog }))

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      await waitFor(() => {
        expect(onLog).toHaveBeenCalledWith(
          expect.objectContaining({
            level: 'info',
            message: '测试日志',
          })
        )
      }, { timeout: 2000 })

      act(() => {
        result.current.stopDebug()
      })
    })

    it('应该在状态变更时调用 onStatus', async () => {
      const events: DebugLogEvent[] = [
        createStatusEvent('running'),
        createCompleteEvent('success'),
        createStatusEvent('completed'),
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream(events),
      })

      const onStatus = vi.fn()
      const { result } = renderHook(() => useDebugStream({ onStatus }))

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
        })
      })

      await waitFor(() => {
        expect(onStatus).toHaveBeenCalledTimes(2)
      }, { timeout: 2000 })

      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' })
      )
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      )

      act(() => {
        result.current.stopDebug()
      })
    })
  })

  describe('请求参数', () => {
    it('应该正确传递 mockInputs 和 timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream([
          createStatusEvent('running'),
          createCompleteEvent('success'),
        ]),
      })

      const { result } = renderHook(() => useDebugStream())

      const mockInputs = { node1: { data: 'test' } }
      const timeout = 30

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
          mockInputs,
          timeout,
        })
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/workflows/test-workflow/nodes/test-node/debug/stream',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mockInputs, timeout }),
        })
      )

      act(() => {
        result.current.stopDebug()
      })
      await waitFor(() => expect(result.current.isRunning).toBe(false), { timeout: 2000 })
    })

    it('应该正确传递 nodeConfig', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: makeSseHeaders(),
        body: createMockSSEStream([
          createStatusEvent('running'),
          createCompleteEvent('success'),
        ]),
      })

      const { result } = renderHook(() => useDebugStream())

      const nodeConfig = { model: 'gpt-4', temperature: 0.7 }

      act(() => {
        result.current.startDebug({
          workflowId: 'test-workflow',
          nodeId: 'test-node',
          nodeConfig,
        })
      })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/workflows/test-workflow/nodes/test-node/debug/stream',
        expect.objectContaining({
          body: JSON.stringify({ nodeConfig }),
        })
      )

      act(() => {
        result.current.stopDebug()
      })
      await waitFor(() => expect(result.current.isRunning).toBe(false), { timeout: 2000 })
    })
  })
})
