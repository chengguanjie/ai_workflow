/**
 * CONDITION Node Processor Tests
 */

import { describe, it, expect } from 'vitest'
import { processConditionNode } from './condition'
import type { ConditionNodeConfig, ExecutionContext } from '@/types/workflow'

// Helper function to create test context
function createContext(nodeOutputs: Record<string, unknown> = {}): ExecutionContext {
  const context: ExecutionContext = {
    input: {},
    nodeOutputs: new Map(),
    globalVariables: new Map(),
  }

  for (const [key, value] of Object.entries(nodeOutputs)) {
    context.nodeOutputs.set(key, value as Record<string, unknown>)
  }

  return context
}

// Helper function to create test node
function createConditionNode(config: ConditionNodeConfig['config']): ConditionNodeConfig {
  return {
    id: 'test-condition',
    type: 'CONDITION',
    name: 'Test Condition',
    position: { x: 0, y: 0 },
    config,
  }
}

describe('processConditionNode', () => {
  describe('Equals operator', () => {
    it('should return true when values are equal', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{input1.value}}',
            operator: 'equals',
            value: 'hello',
          },
        ],
      })

      const context = createContext({
        input1: { value: 'hello' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
      expect(result.data.conditionsMet).toBe(true)
    })

    it('should return false when values are not equal', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{input1.value}}',
            operator: 'equals',
            value: 'hello',
          },
        ],
      })

      const context = createContext({
        input1: { value: 'world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(false)
    })
  })

  describe('Numeric operators', () => {
    it('should handle greaterThan operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.count}}',
            operator: 'greaterThan',
            value: 10,
          },
        ],
      })

      const context = createContext({
        node1: { count: 15 },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should handle lessThan operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.count}}',
            operator: 'lessThan',
            value: 10,
          },
        ],
      })

      const context = createContext({
        node1: { count: 5 },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should handle greaterOrEqual operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.count}}',
            operator: 'greaterOrEqual',
            value: 10,
          },
        ],
      })

      const context = createContext({
        node1: { count: 10 },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })
  })

  describe('String operators', () => {
    it('should handle contains operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.text}}',
            operator: 'contains',
            value: 'world',
          },
        ],
      })

      const context = createContext({
        node1: { text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should handle notContains operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.text}}',
            operator: 'notContains',
            value: 'goodbye',
          },
        ],
      })

      const context = createContext({
        node1: { text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should handle startsWith operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.text}}',
            operator: 'startsWith',
            value: 'hello',
          },
        ],
      })

      const context = createContext({
        node1: { text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should handle endsWith operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.text}}',
            operator: 'endsWith',
            value: 'world',
          },
        ],
      })

      const context = createContext({
        node1: { text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })
  })

  describe('Empty/null operators', () => {
    it('should handle isEmpty operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.text}}',
            operator: 'isEmpty',
          },
        ],
      })

      const context = createContext({
        node1: { text: '' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should handle isNotEmpty operator', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.text}}',
            operator: 'isNotEmpty',
          },
        ],
      })

      const context = createContext({
        node1: { text: 'hello' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })
  })

  describe('Multiple conditions', () => {
    it('should evaluate all conditions with AND logic (default)', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.count}}',
            operator: 'greaterThan',
            value: 5,
          },
          {
            variable: '{{node1.text}}',
            operator: 'contains',
            value: 'hello',
          },
        ],
        evaluationMode: 'all',
      })

      const context = createContext({
        node1: { count: 10, text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })

    it('should return false if any condition fails in AND mode', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.count}}',
            operator: 'greaterThan',
            value: 5,
          },
          {
            variable: '{{node1.text}}',
            operator: 'contains',
            value: 'goodbye',
          },
        ],
        evaluationMode: 'all',
      })

      const context = createContext({
        node1: { count: 10, text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(false)
    })

    it('should evaluate conditions with OR logic', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.count}}',
            operator: 'lessThan',
            value: 5,
          },
          {
            variable: '{{node1.text}}',
            operator: 'contains',
            value: 'hello',
          },
        ],
        evaluationMode: 'any',
      })

      const context = createContext({
        node1: { count: 10, text: 'hello world' },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true) // Second condition is true
    })
  })

  describe('Nested properties', () => {
    it('should handle nested object properties', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{node1.user.name}}',
            operator: 'equals',
            value: 'John',
          },
        ],
      })

      const context = createContext({
        node1: {
          user: { name: 'John', age: 30 },
        },
      })

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should return error if no conditions provided', async () => {
      const node = createConditionNode({
        conditions: [],
      })

      const context = createContext()

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('error')
      expect(result.error).toContain('at least one condition')
    })

    it('should return false for undefined variables', async () => {
      const node = createConditionNode({
        conditions: [
          {
            variable: '{{nonexistent.value}}',
            operator: 'equals',
            value: 'test',
          },
        ],
      })

      const context = createContext()

      const result = await processConditionNode(node, context)
      expect(result.status).toBe('success')
      expect(result.data.result).toBe(false)
    })
  })
})
