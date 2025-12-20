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
    expect(result.logs!.some(log => log.includes('节点类型'))).toBe(true)
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
