import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  primaryNodes,
  moreNodes,
  advancedNodes,
  mediaDataNodes,
  allNodeTypes,
  NodeType,
} from './node-panel'

/**
 * Property tests for NodePanel completeness and drag data consistency
 * These tests verify that all required node types are available in the panel
 * and that drag data is consistent with node type definitions
 */

// ============================================
// Backend Processor Types (from processors/index.ts)
// ============================================

/**
 * All node types that have registered processors in the backend
 */
const ALL_BACKEND_PROCESSOR_TYPES = [
  'TRIGGER',
  'INPUT',
  'PROCESS',
  'CODE',
  'OUTPUT',
  'CONDITION',
  'LOOP',
  'SWITCH',
  'MERGE',
  'HTTP',
  'DATA',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'IMAGE_GEN',
  'NOTIFICATION',
  'GROUP',
  'APPROVAL',
] as const

/**
 * Node types that should be displayed in the NodePanel
 * (excludes internal-only types like GROUP and APPROVAL)
 */
const PANEL_PROCESSOR_TYPES = [
  'TRIGGER',
  'INPUT',
  'PROCESS',
  'CODE',
  'OUTPUT',
  'CONDITION',
  'LOOP',
  'SWITCH',
  'MERGE',
  'HTTP',
  'DATA',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'IMAGE_GEN',
  'NOTIFICATION',
] as const

/**
 * Required advanced node types (from Requirements 1.1)
 * These should be in the "更多" section
 */
const REQUIRED_ADVANCED_NODES = [
  'condition',
  'loop',
  'switch',
  'merge',
  'trigger',
  'notification',
  'http',
] as const

/**
 * Required media/data node types (from Requirements 1.2)
 * These should be in the "媒体/数据" section
 */
const REQUIRED_MEDIA_DATA_NODES = [
  'image',
  'audio',
  'video',
  'data',
] as const

// ============================================
// Property 1: Node Panel Completeness
// ============================================

describe('Property 1: Node Panel Completeness', () => {
  /**
   * **Feature: advanced-nodes-ui, Property 1: Node Panel Completeness**
   * **Validates: Requirements 1.1, 1.3**
   * 
   * For any node type that has a registered processor in the backend,
   * the NodePanel component should include that node type in its available nodes list.
   */
  it('all panel processor types should have corresponding nodes in the panel', () => {
    const allPanelNodeTypes = allNodeTypes.map(n => n.type.toUpperCase())

    fc.assert(
      fc.property(
        fc.constantFrom(...PANEL_PROCESSOR_TYPES),
        (backendType) => {
          expect(allPanelNodeTypes).toContain(backendType)
        }
      ),
      { numRuns: PANEL_PROCESSOR_TYPES.length }
    )
  })

  /**
   * All required advanced nodes should be present in advancedNodes array
   */
  it('all required advanced nodes should be in advancedNodes array', () => {
    const advancedNodeTypes = advancedNodes.map(n => n.type)

    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_ADVANCED_NODES),
        (requiredType) => {
          expect(advancedNodeTypes).toContain(requiredType)
        }
      ),
      { numRuns: REQUIRED_ADVANCED_NODES.length }
    )
  })

  /**
   * All required media/data nodes should be present in mediaDataNodes array
   */
  it('all required media/data nodes should be in mediaDataNodes array', () => {
    const mediaDataNodeTypes = mediaDataNodes.map(n => n.type)

    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_MEDIA_DATA_NODES),
        (requiredType) => {
          expect(mediaDataNodeTypes).toContain(requiredType)
        }
      ),
      { numRuns: REQUIRED_MEDIA_DATA_NODES.length }
    )
  })

  /**
   * Each node in the panel should have all required properties
   */
  it('each node should have all required properties (type, name, description, icon, color, bgColor)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allNodeTypes),
        (node: NodeType) => {
          expect(node.type).toBeDefined()
          expect(node.type.length).toBeGreaterThan(0)

          expect(node.name).toBeDefined()
          expect(node.name.length).toBeGreaterThan(0)

          expect(node.description).toBeDefined()
          expect(node.description.length).toBeGreaterThan(0)

          expect(node.icon).toBeDefined()
          // React components can be functions or objects (forwardRef components)
          expect(['function', 'object'].includes(typeof node.icon)).toBe(true)

          expect(node.color).toBeDefined()
          expect(node.color).toMatch(/^text-/)

          expect(node.bgColor).toBeDefined()
          expect(node.bgColor).toMatch(/^bg-/)
        }
      ),
      { numRuns: allNodeTypes.length }
    )
  })

  /**
   * No duplicate node types should exist across all node arrays
   */
  it('no duplicate node types should exist in allNodeTypes', () => {
    const types = allNodeTypes.map(n => n.type)
    const uniqueTypes = new Set(types)
    expect(types.length).toBe(uniqueTypes.size)
  })
})

// ============================================
// Property 2: Drag Data Consistency
// ============================================

describe('Property 2: Drag Data Consistency', () => {
  /**
   * **Feature: advanced-nodes-ui, Property 2: Drag Data Consistency**
   * **Validates: Requirements 1.2**
   * 
   * For any node dragged from the NodePanel, the dataTransfer type
   * should match the node's type property exactly.
   */

  /**
   * Each node type should be a valid string that can be used as drag data
   */
  it('each node type should be a valid non-empty string for drag data', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allNodeTypes),
        (node: NodeType) => {
          // Type should be a valid string
          expect(typeof node.type).toBe('string')
          expect(node.type.length).toBeGreaterThan(0)

          // Type should not contain special characters that could break drag/drop
          expect(node.type).toMatch(/^[a-z_]+$/)
        }
      ),
      { numRuns: allNodeTypes.length }
    )
  })

  /**
   * Node types should be lowercase (consistent with drag data format)
   */
  it('all node types should be lowercase', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allNodeTypes),
        (node: NodeType) => {
          expect(node.type).toBe(node.type.toLowerCase())
        }
      ),
      { numRuns: allNodeTypes.length }
    )
  })

  /**
   * Simulates the drag data that would be set by onDragStart
   * Verifies that the type matches what would be set in dataTransfer
   */
  it('drag data should match node type exactly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allNodeTypes),
        (node: NodeType) => {
          // Simulate what onDragStart does:
          // event.dataTransfer.setData('application/reactflow', nodeType)
          const dragData = node.type

          // The drag data should exactly match the node's type
          expect(dragData).toBe(node.type)

          // When converted to uppercase, it should match backend processor type
          const backendType = dragData.toUpperCase()
          expect(ALL_BACKEND_PROCESSOR_TYPES).toContain(backendType)
        }
      ),
      { numRuns: allNodeTypes.length }
    )
  })
})

// ============================================
// Additional Completeness Tests
// ============================================

describe('Node Panel Structure', () => {
  /**
   * Primary nodes should contain the essential workflow nodes
   */
  it('primary nodes should contain input, process, and output', () => {
    const primaryTypes = primaryNodes.map(n => n.type)
    expect(primaryTypes).toContain('input')
    expect(primaryTypes).toContain('process')
    expect(primaryTypes).toContain('output')
  })

  /**
   * More nodes should contain code node
   */
  it('more nodes should contain code node', () => {
    const moreTypes = moreNodes.map(n => n.type)
    expect(moreTypes).toContain('code')
  })

  /**
   * Advanced nodes should be separate from media/data nodes
   */
  it('advanced nodes and media/data nodes should not overlap', () => {
    const advancedTypes = new Set(advancedNodes.map(n => n.type))
    const mediaDataTypes = new Set(mediaDataNodes.map(n => n.type))

    // Check no overlap
    for (const type of advancedTypes) {
      expect(mediaDataTypes.has(type)).toBe(false)
    }
    for (const type of mediaDataTypes) {
      expect(advancedTypes.has(type)).toBe(false)
    }
  })
})
