/**
 * LOOP Node Processor Tests
 */

import { describe, it, expect } from 'vitest'
import {
  processLoopNode,
  initializeForLoop,
  initializeWhileLoop,
  advanceForLoop,
  advanceWhileLoop,
  getLoopContextVariables,
  shouldLoopContinue,
  aggregateLoopResults,
  type LoopState,
} from './loop'
import type { LoopNodeConfig, ExecutionContext } from '@/types/workflow'

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

function createForLoopNode(config: Partial<LoopNodeConfig['config']>): LoopNodeConfig {
  return {
    id: 'test-loop',
    type: 'LOOP',
    name: 'Test Loop',
    position: { x: 0, y: 0 },
    config: {
      loopType: 'FOR',
      forConfig: {
        arrayVariable: '{{data.items}}',
        itemName: 'item',
        indexName: 'index',
      },
      ...config,
    },
  }
}

function createWhileLoopNode(config: Partial<LoopNodeConfig['config']>): LoopNodeConfig {
  return {
    id: 'test-loop',
    type: 'LOOP',
    name: 'Test Loop',
    position: { x: 0, y: 0 },
    config: {
      loopType: 'WHILE',
      whileConfig: {
        condition: {
          variable: '{{counter.value}}',
          operator: 'lessThan',
          value: 5,
        },
        maxIterations: 100,
      },
      ...config,
    },
  }
}

describe('processLoopNode', () => {
  describe('FOR loop initialization', () => {
    it('should initialize FOR loop with array', async () => {
      const node = createForLoopNode({})
      const context = createContext({
        data: { items: ['a', 'b', 'c'] },
      })
      
      const result = await processLoopNode(node, context)
      
      expect(result.loopType).toBe('FOR')
      expect(result.shouldContinue).toBe(true)
      expect(result.currentIndex).toBe(0)
      expect(result.currentItem).toBe('a')
      expect(result.arrayLength).toBe(3)
    })
    
    it('should handle empty array', async () => {
      const node = createForLoopNode({})
      const context = createContext({
        data: { items: [] },
      })
      
      const result = await processLoopNode(node, context)
      
      expect(result.shouldContinue).toBe(false)
      expect(result.arrayLength).toBe(0)
    })
    
    it('should throw error for non-array variable', async () => {
      const node = createForLoopNode({})
      const context = createContext({
        data: { items: 'not-an-array' },
      })
      
      await expect(processLoopNode(node, context)).rejects.toThrow('not an array')
    })
    
    it('should throw error when forConfig is missing', async () => {
      const node: LoopNodeConfig = {
        id: 'test',
        type: 'LOOP',
        name: 'Test',
        position: { x: 0, y: 0 },
        config: { loopType: 'FOR' },
      }
      const context = createContext()
      
      await expect(processLoopNode(node, context)).rejects.toThrow('requires forConfig')
    })
  })
  
  describe('WHILE loop initialization', () => {
    it('should initialize WHILE loop when condition is true', async () => {
      const node = createWhileLoopNode({})
      const context = createContext({
        counter: { value: 0 },
      })
      
      const result = await processLoopNode(node, context)
      
      expect(result.loopType).toBe('WHILE')
      expect(result.shouldContinue).toBe(true)
      expect(result.currentIndex).toBe(0)
    })
    
    it('should not start WHILE loop when condition is false', async () => {
      const node = createWhileLoopNode({})
      const context = createContext({
        counter: { value: 10 },
      })
      
      const result = await processLoopNode(node, context)
      
      expect(result.shouldContinue).toBe(false)
    })
    
    it('should throw error when whileConfig is missing', async () => {
      const node: LoopNodeConfig = {
        id: 'test',
        type: 'LOOP',
        name: 'Test',
        position: { x: 0, y: 0 },
        config: { loopType: 'WHILE' },
      }
      const context = createContext()
      
      await expect(processLoopNode(node, context)).rejects.toThrow('requires whileConfig')
    })
  })
})

describe('initializeForLoop', () => {
  it('should set correct initial state', () => {
    const node = createForLoopNode({})
    const context = createContext({
      data: { items: [1, 2, 3, 4, 5] },
    })
    
    const state = initializeForLoop(node, context)
    
    expect(state.currentIndex).toBe(0)
    expect(state.iterationsCompleted).toBe(0)
    expect(state.shouldContinue).toBe(true)
    expect(state.currentItem).toBe(1)
    expect(state.array).toEqual([1, 2, 3, 4, 5])
    expect(state.loopType).toBe('FOR')
    expect(state.itemName).toBe('item')
    expect(state.indexName).toBe('index')
  })
  
  it('should respect maxIterations limit', () => {
    const node = createForLoopNode({ maxIterations: 2 })
    const context = createContext({
      data: { items: [1, 2, 3, 4, 5] },
    })
    
    const state = initializeForLoop(node, context)
    
    expect(state.maxIterations).toBe(2)
  })
})

describe('advanceForLoop', () => {
  it('should advance to next item', () => {
    const initialState: LoopState = {
      currentIndex: 0,
      iterationsCompleted: 0,
      shouldContinue: true,
      currentItem: 'a',
      array: ['a', 'b', 'c'],
      maxIterations: 10,
      loopType: 'FOR',
      itemName: 'item',
    }
    
    const nextState = advanceForLoop(initialState)
    
    expect(nextState.currentIndex).toBe(1)
    expect(nextState.iterationsCompleted).toBe(1)
    expect(nextState.currentItem).toBe('b')
    expect(nextState.shouldContinue).toBe(true)
  })
  
  it('should stop at end of array', () => {
    const state: LoopState = {
      currentIndex: 2,
      iterationsCompleted: 2,
      shouldContinue: true,
      currentItem: 'c',
      array: ['a', 'b', 'c'],
      maxIterations: 10,
      loopType: 'FOR',
    }
    
    const nextState = advanceForLoop(state)
    
    expect(nextState.currentIndex).toBe(3)
    expect(nextState.shouldContinue).toBe(false)
    expect(nextState.currentItem).toBeUndefined()
  })
  
  it('should stop at maxIterations', () => {
    const state: LoopState = {
      currentIndex: 1,
      iterationsCompleted: 1,
      shouldContinue: true,
      currentItem: 'b',
      array: ['a', 'b', 'c', 'd', 'e'],
      maxIterations: 2,
      loopType: 'FOR',
    }
    
    const nextState = advanceForLoop(state)
    
    expect(nextState.currentIndex).toBe(2)
    expect(nextState.shouldContinue).toBe(false)
  })
})

describe('advanceWhileLoop', () => {
  it('should continue when condition is still true', () => {
    const state: LoopState = {
      currentIndex: 0,
      iterationsCompleted: 0,
      shouldContinue: true,
      maxIterations: 10,
      loopType: 'WHILE',
    }
    
    const condition = {
      variable: '{{counter.value}}',
      operator: 'lessThan' as const,
      value: 5,
    }
    
    const context = createContext({
      counter: { value: 2 },
    })
    
    const nextState = advanceWhileLoop(state, condition, context)
    
    expect(nextState.currentIndex).toBe(1)
    expect(nextState.iterationsCompleted).toBe(1)
    expect(nextState.shouldContinue).toBe(true)
  })
  
  it('should stop when condition becomes false', () => {
    const state: LoopState = {
      currentIndex: 4,
      iterationsCompleted: 4,
      shouldContinue: true,
      maxIterations: 10,
      loopType: 'WHILE',
    }
    
    const condition = {
      variable: '{{counter.value}}',
      operator: 'lessThan' as const,
      value: 5,
    }
    
    const context = createContext({
      counter: { value: 5 },
    })
    
    const nextState = advanceWhileLoop(state, condition, context)
    
    expect(nextState.shouldContinue).toBe(false)
  })
})

describe('getLoopContextVariables', () => {
  it('should return loop variables for FOR loop', () => {
    const state: LoopState = {
      currentIndex: 2,
      iterationsCompleted: 2,
      shouldContinue: true,
      currentItem: { name: 'test' },
      array: [{}, {}, { name: 'test' }],
      maxIterations: 10,
      loopType: 'FOR',
      itemName: 'item',
      indexName: 'idx',
    }
    
    const vars = getLoopContextVariables(state)
    
    expect(vars.index).toBe(2)
    expect(vars.iteration).toBe(3)
    expect(vars.isFirst).toBe(false)
    expect(vars.isLast).toBe(true)
    expect(vars.item).toEqual({ name: 'test' })
    expect(vars['item']).toEqual({ name: 'test' })
    expect(vars['idx']).toBe(2)
  })
  
  it('should return loop variables for WHILE loop', () => {
    const state: LoopState = {
      currentIndex: 5,
      iterationsCompleted: 5,
      shouldContinue: true,
      maxIterations: 10,
      loopType: 'WHILE',
    }
    
    const vars = getLoopContextVariables(state)
    
    expect(vars.index).toBe(5)
    expect(vars.iteration).toBe(6)
    expect(vars.isFirst).toBe(false)
    expect(vars.isLast).toBe(false)
    expect(vars.item).toBeUndefined()
  })
})

describe('shouldLoopContinue', () => {
  it('should return true when loop can continue', () => {
    const state: LoopState = {
      currentIndex: 5,
      iterationsCompleted: 5,
      shouldContinue: true,
      maxIterations: 10,
      loopType: 'FOR',
    }
    
    expect(shouldLoopContinue(state)).toBe(true)
  })
  
  it('should return false when max iterations reached', () => {
    const state: LoopState = {
      currentIndex: 10,
      iterationsCompleted: 10,
      shouldContinue: true,
      maxIterations: 10,
      loopType: 'FOR',
    }
    
    expect(shouldLoopContinue(state)).toBe(false)
  })
  
  it('should return false when shouldContinue is false', () => {
    const state: LoopState = {
      currentIndex: 5,
      iterationsCompleted: 5,
      shouldContinue: false,
      maxIterations: 10,
      loopType: 'FOR',
    }
    
    expect(shouldLoopContinue(state)).toBe(false)
  })
})

describe('aggregateLoopResults', () => {
  it('should aggregate successful results', () => {
    const results = [
      { success: true, output: 'a' },
      { success: true, output: 'b' },
      { success: true, output: 'c' },
    ]
    
    const aggregated = aggregateLoopResults(results)
    
    expect(aggregated.iterations).toBe(3)
    expect(aggregated.results).toEqual(results)
    expect(aggregated.allSucceeded).toBe(true)
  })
  
  it('should detect failed iterations', () => {
    const results = [
      { success: true, output: 'a' },
      { success: false, error: 'failed' },
      { success: true, output: 'c' },
    ]
    
    const aggregated = aggregateLoopResults(results)
    
    expect(aggregated.iterations).toBe(3)
    expect(aggregated.allSucceeded).toBe(false)
  })
})

describe('Condition operators in WHILE loop', () => {
  const operators = [
    { op: 'equals', left: 5, right: 5, expected: true },
    { op: 'notEquals', left: 5, right: 3, expected: true },
    { op: 'greaterThan', left: 10, right: 5, expected: true },
    { op: 'lessThan', left: 3, right: 5, expected: true },
    { op: 'greaterOrEqual', left: 5, right: 5, expected: true },
    { op: 'lessOrEqual', left: 5, right: 5, expected: true },
    { op: 'contains', left: 'hello world', right: 'world', expected: true },
    { op: 'notContains', left: 'hello', right: 'world', expected: true },
    { op: 'startsWith', left: 'hello world', right: 'hello', expected: true },
    { op: 'endsWith', left: 'hello world', right: 'world', expected: true },
    { op: 'isEmpty', left: '', right: undefined, expected: true },
    { op: 'isNotEmpty', left: 'value', right: undefined, expected: true },
  ] as const
  
  operators.forEach(({ op, left, right, expected }) => {
    it(`should handle ${op} operator`, async () => {
      const node: LoopNodeConfig = {
        id: 'test',
        type: 'LOOP',
        name: 'Test',
        position: { x: 0, y: 0 },
        config: {
          loopType: 'WHILE',
          whileConfig: {
            condition: {
              variable: '{{test.value}}',
              operator: op,
              value: right,
            },
            maxIterations: 10,
          },
        },
      }
      
      const context = createContext({
        test: { value: left },
      })
      
      const result = await processLoopNode(node, context)
      expect(result.shouldContinue).toBe(expected)
    })
  })
})
