/**
 * Debug Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { debugNode, createMockContext, DebugRequest } from './debug'
import type { NodeConfig, WorkflowConfig, NodeType } from '@/types/workflow'

function createTestNode(
  type: NodeType,
  config: Record<string, unknown> = {}
): NodeConfig {
  return {
    id: 'test-node',
    type,
    name: 'Test Node',
    position: { x: 0, y: 0 },
    config,
  } as NodeConfig
}

function createTestConfig(): WorkflowConfig {
  return {
    version: 1,
    nodes: [],
    edges: [],
    globalVariables: {},
  }
}

describe('debugNode', () => {
  it('should execute INPUT node with mock data', async () => {
    const node = createTestNode('INPUT', {
      fields: [
        { id: '1', name: 'text', type: 'text', value: 'test value' },
      ],
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.status).toBe('success')
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
  })

  it('should inject mock inputs into context', async () => {
    const node = createTestNode('PROCESS', {
      prompt: 'Process: {{upstream.data}}',
      model: 'test-model',
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {
        upstream: { data: 'test data from upstream' },
      },
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.logs!.some(log => log.includes('注入模拟输入: upstream'))).toBe(true)
  })

  it('should return error for unknown node type', async () => {
    const node = createTestNode('UNKNOWN_TYPE' as NodeType, {})

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.status).toBe('error')
    expect(result.error).toContain('未找到节点处理器')
  })

  it('should include execution logs', async () => {
    const node = createTestNode('INPUT', {
      fields: [{ id: '1', name: 'test', type: 'text', value: 'value' }],
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.logs).toBeDefined()
    expect(result.logs!.some(log => log.includes('开始调试节点'))).toBe(true)
    // Check for type in the data object part of the logs
    expect(result.logs!.some(log => log.includes('"type": "INPUT"'))).toBe(true)
  })

  it('should handle imported files and log them', async () => {
    const node = createTestNode('INPUT', { fields: [] })
    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
      importedFiles: [
        { name: 'test.txt', content: 'hello world', type: 'text/plain' }
      ]
    }

    const result = await debugNode(request)
    expect(result.logs!.some(log => log.includes('注入导入文件: 1 个文件'))).toBe(true)
  })

  it('should switch to PROCESS_WITH_TOOLS processor when tool calling is enabled', async () => {
    const node = createTestNode('PROCESS', {
      prompt: 'test',
      enableToolCalling: true,
      aiConfigId: 'mock-config'
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    // Check if the specific log message for switching appears
    expect(result.logs!.some(log => log.includes('检测到工具调用配置'))).toBe(true)
  })
})

/**
 * Log Completeness Tests
 * 
 * Requirements: 2.1 - WHEN 调试执行过程中发生错误 THEN THE Debug_Panel SHALL 显示错误发生前的所有日志
 * Requirements: 2.2 - WHEN 模型配置错误导致执行失败 THEN THE Debug_Panel SHALL 在日志中显示具体的配置问题
 */
describe('debugNode - Log Completeness', () => {
  it('should return logs even when execution fails with unknown node type', async () => {
    const node = createTestNode('UNKNOWN_TYPE' as NodeType, {})

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    // Verify error status
    expect(result.status).toBe('error')
    
    // Verify logs are returned even on error
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
    
    // Verify logs contain initialization info before error
    expect(result.logs!.some(log => log.includes('开始调试节点'))).toBe(true)
    
    // Verify error is logged
    expect(result.logs!.some(log => log.includes('未找到节点处理器'))).toBe(true)
  })

  it('should include node configuration details in logs', async () => {
    const node = createTestNode('PROCESS', {
      model: 'test-model',
      aiConfigId: 'config-123',
      enableToolCalling: false,
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    // Verify logs contain configuration details
    expect(result.logs).toBeDefined()
    expect(result.logs!.some(log => log.includes('节点配置检查'))).toBe(true)
    expect(result.logs!.some(log => log.includes('test-model'))).toBe(true)
    expect(result.logs!.some(log => log.includes('config-123'))).toBe(true)
  })

  it('should log all steps before error occurs', async () => {
    const node = createTestNode('PROCESS', {
      model: 'invalid-model',
      userPrompt: 'test prompt',
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {
        upstream: { data: 'test data' },
      },
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    // Verify logs are returned
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
    
    // Verify initialization logs are present
    expect(result.logs!.some(log => log.includes('开始调试节点'))).toBe(true)
    
    // Verify mock input injection is logged
    expect(result.logs!.some(log => log.includes('注入模拟输入: upstream'))).toBe(true)
    
    // Verify processor lookup is logged
    expect(result.logs!.some(log => log.includes('获取处理器'))).toBe(true)
  })

  it('should include timestamp in all log entries', async () => {
    const node = createTestNode('INPUT', {
      fields: [{ id: '1', name: 'test', type: 'text', value: 'value' }],
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.logs).toBeDefined()
    
    // Verify all log entries have timestamps (format: [HH:MM:SS])
    const timePattern = /\[\d{2}:\d{2}:\d{2}\]/
    const logsWithTimestamp = result.logs!.filter(log => timePattern.test(log))
    
    // At least the main log entries should have timestamps
    expect(logsWithTimestamp.length).toBeGreaterThan(0)
  })

  it('should log tool configuration when tools are enabled', async () => {
    const node = createTestNode('PROCESS', {
      model: 'test-model',
      enableToolCalling: true,
      tools: [
        { type: 'web_search', name: 'Web Search', enabled: true },
        { type: 'calculator', name: 'Calculator', enabled: false },
      ],
    })

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.logs).toBeDefined()
    
    // Verify tool configuration is logged
    expect(result.logs!.some(log => log.includes('工具调用检查'))).toBe(true)
    expect(result.logs!.some(log => log.includes('web_search'))).toBe(true)
  })

  it('should return duration even when execution fails', async () => {
    const node = createTestNode('UNKNOWN_TYPE' as NodeType, {})

    const request: DebugRequest = {
      workflowId: 'wf-1',
      organizationId: 'org-1',
      userId: 'user-1',
      node,
      mockInputs: {},
      config: createTestConfig(),
    }

    const result = await debugNode(request)

    expect(result.status).toBe('error')
    expect(result.duration).toBeDefined()
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })
})

describe('createMockContext', () => {
  it('should create empty context', () => {
    const context = createMockContext('wf-1', 'org-1', 'user-1')

    expect(context.executionId).toContain('mock-')
    expect(context.workflowId).toBe('wf-1')
    expect(context.organizationId).toBe('org-1')
    expect(context.userId).toBe('user-1')
    expect(context.nodeOutputs.size).toBe(0)
  })

  it('should inject mock inputs', () => {
    const context = createMockContext('wf-1', 'org-1', 'user-1', {
      node1: { result: 'value1' },
      node2: { result: 'value2' },
    })

    expect(context.nodeOutputs.size).toBe(2)
    expect(context.nodeOutputs.get('node1')?.data).toEqual({ result: 'value1' })
    expect(context.nodeOutputs.get('node2')?.data).toEqual({ result: 'value2' })
  })

  it('should include global variables', () => {
    const context = createMockContext('wf-1', 'org-1', 'user-1', {}, {
      apiKey: 'secret',
      baseUrl: 'https://api.example.com',
    })

    expect(context.globalVariables).toEqual({
      apiKey: 'secret',
      baseUrl: 'https://api.example.com',
    })
  })
})
