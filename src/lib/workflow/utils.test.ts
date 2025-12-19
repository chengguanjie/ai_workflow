/**
 * Workflow Utils Tests - Parallel Execution
 */

import { describe, it, expect } from 'vitest'
import {
  getParallelExecutionLayers,
  canNodeExecute,
  getPredecessorIds,
  getSuccessorIds,
  isMergeNode,
  isForkNode,
  getExecutionOrder,
} from './utils'
import type { NodeConfig, EdgeConfig } from '@/types/workflow'

function createNode(id: string, type: string = 'PROCESS'): NodeConfig {
  return {
    id,
    type,
    name: `Node ${id}`,
    position: { x: 0, y: 0 },
    config: {},
  }
}

function createEdge(source: string, target: string, sourceHandle?: string): EdgeConfig {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
  }
}

describe('getParallelExecutionLayers', () => {
  it('should return single layer for independent nodes', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')]
    const edges: EdgeConfig[] = []

    const layers = getParallelExecutionLayers(nodes, edges)

    expect(layers).toHaveLength(1)
    expect(layers[0].level).toBe(0)
    expect(layers[0].nodes).toHaveLength(3)
  })

  it('should return sequential layers for linear workflow', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'c')]

    const layers = getParallelExecutionLayers(nodes, edges)

    expect(layers).toHaveLength(3)
    expect(layers[0].nodes.map(n => n.id)).toEqual(['a'])
    expect(layers[1].nodes.map(n => n.id)).toEqual(['b'])
    expect(layers[2].nodes.map(n => n.id)).toEqual(['c'])
  })

  it('should group parallel branches in same layer', () => {
    const nodes = [
      createNode('start'),
      createNode('branch1'),
      createNode('branch2'),
      createNode('end'),
    ]
    const edges = [
      createEdge('start', 'branch1'),
      createEdge('start', 'branch2'),
      createEdge('branch1', 'end'),
      createEdge('branch2', 'end'),
    ]

    const layers = getParallelExecutionLayers(nodes, edges)

    expect(layers).toHaveLength(3)
    expect(layers[0].nodes.map(n => n.id)).toEqual(['start'])
    expect(layers[1].nodes.map(n => n.id).sort()).toEqual(['branch1', 'branch2'])
    expect(layers[2].nodes.map(n => n.id)).toEqual(['end'])
  })

  it('should handle diamond pattern correctly', () => {
    const nodes = [
      createNode('a'),
      createNode('b'),
      createNode('c'),
      createNode('d'),
      createNode('e'),
    ]
    const edges = [
      createEdge('a', 'b'),
      createEdge('a', 'c'),
      createEdge('b', 'd'),
      createEdge('c', 'd'),
      createEdge('d', 'e'),
    ]

    const layers = getParallelExecutionLayers(nodes, edges)

    expect(layers).toHaveLength(4)
    expect(layers[0].nodes.map(n => n.id)).toEqual(['a'])
    expect(layers[1].nodes.map(n => n.id).sort()).toEqual(['b', 'c'])
    expect(layers[2].nodes.map(n => n.id)).toEqual(['d'])
    expect(layers[3].nodes.map(n => n.id)).toEqual(['e'])
  })

  it('should throw error for cyclic dependencies', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')]
    const edges = [
      createEdge('a', 'b'),
      createEdge('b', 'c'),
      createEdge('c', 'a'),
    ]

    expect(() => getParallelExecutionLayers(nodes, edges)).toThrow('循环依赖')
  })

  it('should handle complex workflow with multiple parallel branches', () => {
    const nodes = [
      createNode('input'),
      createNode('process1'),
      createNode('process2'),
      createNode('process3'),
      createNode('merge'),
      createNode('output'),
    ]
    const edges = [
      createEdge('input', 'process1'),
      createEdge('input', 'process2'),
      createEdge('input', 'process3'),
      createEdge('process1', 'merge'),
      createEdge('process2', 'merge'),
      createEdge('process3', 'merge'),
      createEdge('merge', 'output'),
    ]

    const layers = getParallelExecutionLayers(nodes, edges)

    expect(layers).toHaveLength(4)
    expect(layers[0].nodes).toHaveLength(1)
    expect(layers[1].nodes).toHaveLength(3)
    expect(layers[2].nodes).toHaveLength(1)
    expect(layers[3].nodes).toHaveLength(1)
  })
})

describe('canNodeExecute', () => {
  it('should return true for node with no predecessors', () => {
    const edges: EdgeConfig[] = []
    const completed = new Set<string>()
    const skipped = new Set<string>()

    expect(canNodeExecute('a', edges, completed, skipped)).toBe(true)
  })

  it('should return true when all predecessors completed', () => {
    const edges = [createEdge('a', 'b'), createEdge('c', 'b')]
    const completed = new Set(['a', 'c'])
    const skipped = new Set<string>()

    expect(canNodeExecute('b', edges, completed, skipped)).toBe(true)
  })

  it('should return false when some predecessors not completed', () => {
    const edges = [createEdge('a', 'b'), createEdge('c', 'b')]
    const completed = new Set(['a'])
    const skipped = new Set<string>()

    expect(canNodeExecute('b', edges, completed, skipped)).toBe(false)
  })

  it('should treat skipped predecessors as completed', () => {
    const edges = [createEdge('a', 'b'), createEdge('c', 'b')]
    const completed = new Set(['a'])
    const skipped = new Set(['c'])

    expect(canNodeExecute('b', edges, completed, skipped)).toBe(true)
  })
})

describe('getPredecessorIds', () => {
  it('should return empty array for node with no predecessors', () => {
    const edges = [createEdge('a', 'b')]

    expect(getPredecessorIds('a', edges)).toEqual([])
  })

  it('should return all predecessor node IDs', () => {
    const edges = [
      createEdge('a', 'c'),
      createEdge('b', 'c'),
      createEdge('c', 'd'),
    ]

    expect(getPredecessorIds('c', edges).sort()).toEqual(['a', 'b'])
  })
})

describe('getSuccessorIds', () => {
  it('should return empty array for node with no successors', () => {
    const edges = [createEdge('a', 'b')]

    expect(getSuccessorIds('b', edges)).toEqual([])
  })

  it('should return all successor node IDs', () => {
    const edges = [
      createEdge('a', 'b'),
      createEdge('a', 'c'),
      createEdge('b', 'd'),
    ]

    expect(getSuccessorIds('a', edges).sort()).toEqual(['b', 'c'])
  })
})

describe('isMergeNode', () => {
  it('should return false for node with single incoming edge', () => {
    const edges = [createEdge('a', 'b')]

    expect(isMergeNode('b', edges)).toBe(false)
  })

  it('should return true for node with multiple incoming edges', () => {
    const edges = [createEdge('a', 'c'), createEdge('b', 'c')]

    expect(isMergeNode('c', edges)).toBe(true)
  })

  it('should return false for node with no incoming edges', () => {
    const edges = [createEdge('a', 'b')]

    expect(isMergeNode('a', edges)).toBe(false)
  })
})

describe('isForkNode', () => {
  it('should return false for node with single outgoing edge', () => {
    const edges = [createEdge('a', 'b')]

    expect(isForkNode('a', edges)).toBe(false)
  })

  it('should return true for node with multiple outgoing edges', () => {
    const edges = [createEdge('a', 'b'), createEdge('a', 'c')]

    expect(isForkNode('a', edges)).toBe(true)
  })

  it('should return false for node with no outgoing edges', () => {
    const edges = [createEdge('a', 'b')]

    expect(isForkNode('b', edges)).toBe(false)
  })
})

describe('getExecutionOrder', () => {
  it('should return nodes in topological order', () => {
    const nodes = [createNode('c'), createNode('a'), createNode('b')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'c')]

    const order = getExecutionOrder(nodes, edges)

    const ids = order.map(n => n.id)
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'))
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'))
  })

  it('should handle parallel nodes', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')]
    const edges: EdgeConfig[] = []

    const order = getExecutionOrder(nodes, edges)

    expect(order).toHaveLength(3)
  })

  it('should throw error for cyclic dependencies', () => {
    const nodes = [createNode('a'), createNode('b')]
    const edges = [createEdge('a', 'b'), createEdge('b', 'a')]

    expect(() => getExecutionOrder(nodes, edges)).toThrow('循环依赖')
  })
})
