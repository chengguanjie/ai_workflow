/**
 * MERGE 节点处理器测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processMergeNode } from './merge'
import type { MergeNodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from '../types'

function createMockContext(
  nodeOutputs: Record<string, NodeOutput> = {}
): ExecutionContext {
  const outputsMap = new Map<string, NodeOutput>()
  for (const [key, value] of Object.entries(nodeOutputs)) {
    outputsMap.set(key, value)
  }

  return {
    executionId: 'test-exec-123',
    workflowId: 'test-workflow-123',
    organizationId: 'test-org-123',
    userId: 'test-user-123',
    nodeOutputs: outputsMap,
    globalVariables: {},
    aiConfigs: new Map(),
  }
}

function createMergeNode(config: Partial<MergeNodeConfig['config']> = {}): MergeNodeConfig {
  return {
    id: 'merge-1',
    type: 'MERGE',
    name: 'Test Merge',
    position: { x: 0, y: 0 },
    config: {
      mergeStrategy: 'all',
      errorStrategy: 'fail_fast',
      outputMode: 'merge',
      ...config,
    },
  }
}

function createNodeOutput(
  nodeId: string,
  nodeName: string,
  data: Record<string, unknown>,
  status: 'success' | 'error' = 'success',
  error?: string
): NodeOutput {
  return {
    nodeId,
    nodeName,
    nodeType: 'PROCESS',
    status,
    data,
    error,
    startedAt: new Date(),
    completedAt: new Date(),
    duration: 100,
  }
}

describe('MERGE Node Processor', () => {
  describe('Basic Functionality', () => {
    it('should merge outputs from multiple branches', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { result: 'value1' }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', { result: 'value2' }),
      })

      const node = createMergeNode({ mergeStrategy: 'all', outputMode: 'merge' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data.Branch1).toEqual({ result: 'value1' })
      expect(result.data.Branch2).toEqual({ result: 'value2' })
      expect(result.data._merge).toBeDefined()
      expect(result.data._merge.totalBranches).toBe(2)
      expect(result.data._merge.successfulBranches).toBe(2)
    })

    it('should output as array when outputMode is array', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { value: 1 }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', { value: 2 }),
      })

      const node = createMergeNode({ outputMode: 'array' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data.branches).toBeInstanceOf(Array)
      expect(result.data.branches).toHaveLength(2)
    })

    it('should use first result when outputMode is first', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { value: 'first' }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', { value: 'second' }),
      })

      const node = createMergeNode({ outputMode: 'first' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data.value).toBe('first')
    })
  })

  describe('Merge Strategies', () => {
    it('should wait for all branches with all strategy', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { done: true }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', { done: true }),
        'branch-3': createNodeOutput('branch-3', 'Branch3', { done: true }),
      })

      const node = createMergeNode({ mergeStrategy: 'all' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data._merge.successfulBranches).toBe(3)
    })

    it('should succeed with any successful branch using any strategy', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { done: true }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', {}, 'error', 'Failed'),
      })

      const node = createMergeNode({
        mergeStrategy: 'any',
        errorStrategy: 'continue',
      })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data._merge.successfulBranches).toBe(1)
    })

    it('should use first completed branch with race strategy', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { winner: true }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', { winner: false }),
      })

      const node = createMergeNode({ mergeStrategy: 'race' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      // Race uses first result (outputMode: 'first' internally)
      expect(result.data.winner).toBeDefined()
    })
  })

  describe('Error Handling Strategies', () => {
    it('should fail immediately with fail_fast strategy', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { done: true }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', {}, 'error', 'Test error'),
      })

      const node = createMergeNode({ errorStrategy: 'fail_fast' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('error')
      expect(result.error).toContain('Branch2')
    })

    it('should continue with successful branches using continue strategy', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { value: 'success' }),
        'branch-2': createNodeOutput('branch-2', 'Branch2', {}, 'error', 'Failed'),
      })

      const node = createMergeNode({ errorStrategy: 'continue' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data.Branch1).toEqual({ value: 'success' })
      expect(result.data._merge.failedBranches).toBe(1)
    })

    it('should collect all errors with collect strategy', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', {}, 'error', 'Error 1'),
        'branch-2': createNodeOutput('branch-2', 'Branch2', {}, 'error', 'Error 2'),
        'branch-3': createNodeOutput('branch-3', 'Branch3', { value: 'ok' }),
      })

      const node = createMergeNode({ errorStrategy: 'collect' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data._errors).toHaveLength(2)
      expect(result.data._merge.failedBranches).toBe(2)
      expect(result.data._merge.successfulBranches).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty context', async () => {
      const context = createMockContext({})
      const node = createMergeNode({ errorStrategy: 'continue' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('success')
      expect(result.data._merge.totalBranches).toBe(0)
    })

    it('should include metadata in output', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', { data: 'test' }),
      })

      const node = createMergeNode()
      const result = await processMergeNode(node, context)

      expect(result.data._merge).toMatchObject({
        strategy: 'all',
        totalBranches: 1,
        successfulBranches: 1,
        failedBranches: 0,
        branchNames: ['Branch1'],
      })
    })

    it('should handle all branches failing', async () => {
      const context = createMockContext({
        'branch-1': createNodeOutput('branch-1', 'Branch1', {}, 'error', 'Error 1'),
        'branch-2': createNodeOutput('branch-2', 'Branch2', {}, 'error', 'Error 2'),
      })

      const node = createMergeNode({ errorStrategy: 'fail_fast' })
      const result = await processMergeNode(node, context)

      expect(result.status).toBe('error')
    })
  })
})
