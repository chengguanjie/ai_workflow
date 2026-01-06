/**
 * 输入验证器测试
 * 
 * 包含属性测试和单元测试，验证输入验证功能的正确性。
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  validatePredecessors,
  validateVariableReferences,
  validateInputNodeFields,
  validateNodeInput,
  extractVariableReferences,
} from './input-validator'
import type { NodeConfig, EdgeConfig, InputNodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from '../types'

// ============================================
// Test Helpers
// ============================================

/**
 * 创建模拟的执行上下文
 */
function createMockContext(nodeOutputs: Map<string, NodeOutput> = new Map()): ExecutionContext {
  return {
    executionId: 'test-execution-id',
    workflowId: 'test-workflow-id',
    organizationId: 'test-org-id',
    userId: 'test-user-id',
    nodeOutputs,
    globalVariables: {},
    aiConfigs: new Map(),
  }
}

/**
 * 创建模拟的节点输出
 */
function createMockNodeOutput(
  nodeId: string,
  nodeName: string,
  status: 'success' | 'error' | 'skipped' | 'paused' = 'success',
  data: Record<string, unknown> = {}
): NodeOutput {
  return {
    nodeId,
    nodeName,
    nodeType: 'PROCESS',
    status,
    data,
    startedAt: new Date(),
    completedAt: new Date(),
  }
}

/**
 * 创建模拟的 INPUT 节点
 */
function createMockInputNode(
  id: string,
  name: string,
  fields: Array<{ id: string; name: string; value: string; required?: boolean }>
): InputNodeConfig {
  return {
    id,
    type: 'INPUT',
    name,
    position: { x: 0, y: 0 },
    config: {
      fields: fields.map(f => ({
        id: f.id,
        name: f.name,
        value: f.value,
        required: f.required,
      })),
    },
  }
}

/**
 * 创建模拟的 PROCESS 节点
 */
function createMockProcessNode(
  id: string,
  name: string,
  userPrompt: string = '',
  systemPrompt: string = ''
): ProcessNodeConfig {
  return {
    id,
    type: 'PROCESS',
    name,
    position: { x: 0, y: 0 },
    config: {
      userPrompt,
      systemPrompt,
    },
  }
}

// ============================================
// Arbitraries for Property-Based Testing
// ============================================

/**
 * 生成有效的节点ID
 */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{8}$/)

/**
 * 生成有效的节点名称
 */
const nodeNameArb = fc.stringMatching(/^[A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5_-]{0,19}$/)

/**
 * 生成节点状态
 */
const nodeStatusArb = fc.constantFrom('success', 'error', 'skipped', 'paused') as fc.Arbitrary<'success' | 'error' | 'skipped' | 'paused'>

/**
 * 生成简单的工作流图（节点和边）
 */
const workflowGraphArb = fc.integer({ min: 2, max: 5 }).chain(nodeCount => {
  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `node-${i}`)
  const nodes: NodeConfig[] = nodeIds.map((id, i) => ({
    id,
    type: i === 0 ? 'INPUT' : 'PROCESS',
    name: `Node${i}`,
    position: { x: i * 100, y: 0 },
    config: i === 0 ? { fields: [] } : { userPrompt: '', systemPrompt: '' },
  } as NodeConfig))

  // 生成边：每个节点（除了第一个）至少有一个前置节点
  const edges: EdgeConfig[] = []
  for (let i = 1; i < nodeCount; i++) {
    // 随机选择一个前置节点
    const sourceIndex = Math.floor(Math.random() * i)
    edges.push({
      id: `edge-${sourceIndex}-${i}`,
      source: nodeIds[sourceIndex],
      target: nodeIds[i],
    })
  }

  return fc.constant({ nodes, edges, nodeIds })
})

// ============================================
// Property Tests
// ============================================

describe('Input Validator Property Tests', () => {
  /**
   * Property 1: Predecessor Validation Consistency
   * 
   * For any node with predecessor nodes in a workflow, the input status SHALL reflect
   * the completion status of all predecessors: if any predecessor has failed or been skipped,
   * input status is 'missing'; if all predecessors completed successfully with valid outputs,
   * input status is 'valid'.
   * 
   * **Feature: node-input-status-validation, Property 1: Predecessor Validation Consistency**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it('Property 1: Predecessor Validation Consistency', () => {
    fc.assert(
      fc.property(
        // 生成节点数量
        fc.integer({ min: 2, max: 6 }),
        // 生成前置节点状态数组
        fc.array(nodeStatusArb, { minLength: 1, maxLength: 5 }),
        (nodeCount, predecessorStatuses) => {
          // 创建节点
          const targetNodeId = 'target-node'
          const nodes: NodeConfig[] = [
            {
              id: targetNodeId,
              type: 'PROCESS',
              name: 'TargetNode',
              position: { x: 0, y: 0 },
              config: { userPrompt: '', systemPrompt: '' },
            } as ProcessNodeConfig,
          ]

          // 创建前置节点和边
          const edges: EdgeConfig[] = []
          const nodeOutputs = new Map<string, NodeOutput>()

          predecessorStatuses.forEach((status, i) => {
            const predId = `pred-node-${i}`
            const predName = `PredNode${i}`
            
            nodes.push({
              id: predId,
              type: 'PROCESS',
              name: predName,
              position: { x: 0, y: 0 },
              config: { userPrompt: '', systemPrompt: '' },
            } as ProcessNodeConfig)

            edges.push({
              id: `edge-${i}`,
              source: predId,
              target: targetNodeId,
            })

            // 只有非 'paused' 状态才添加输出
            if (status !== 'paused') {
              nodeOutputs.set(predId, createMockNodeOutput(predId, predName, status, { result: 'test' }))
            }
          })

          const context = createMockContext(nodeOutputs)
          const result = validatePredecessors(targetNodeId, edges, nodes, context)

          // 验证属性：
          // 1. 如果所有前置节点都成功，结果应该是 valid
          // 2. 如果有任何前置节点失败/跳过/缺失，结果应该是 invalid
          const allSuccess = predecessorStatuses.every(s => s === 'success')
          const hasPaused = predecessorStatuses.some(s => s === 'paused')
          
          if (allSuccess) {
            expect(result.valid).toBe(true)
            expect(result.failedPredecessors).toHaveLength(0)
            expect(result.skippedPredecessors).toHaveLength(0)
            expect(result.missingPredecessors).toHaveLength(0)
          } else if (hasPaused) {
            // paused 状态的节点没有输出，会被视为 missing
            expect(result.valid).toBe(false)
            expect(result.missingPredecessors.length).toBeGreaterThan(0)
          } else {
            expect(result.valid).toBe(false)
            // 至少有一个失败或跳过的前置节点
            const hasFailedOrSkipped = 
              result.failedPredecessors.length > 0 || 
              result.skippedPredecessors.length > 0 ||
              result.missingPredecessors.length > 0
            expect(hasFailedOrSkipped).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Unit Tests
// ============================================

describe('validatePredecessors', () => {
  it('should return valid when node has no predecessors', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'Node1'),
    ]
    const edges: EdgeConfig[] = []
    const context = createMockContext()

    const result = validatePredecessors('node-1', edges, nodes, context)

    expect(result.valid).toBe(true)
    expect(result.missingPredecessors).toHaveLength(0)
    expect(result.failedPredecessors).toHaveLength(0)
    expect(result.skippedPredecessors).toHaveLength(0)
  })

  it('should return valid when all predecessors completed successfully', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'Node1'),
      createMockProcessNode('node-2', 'Node2'),
    ]
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
    ]
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('node-1', createMockNodeOutput('node-1', 'Node1', 'success', { result: 'test' }))
    const context = createMockContext(nodeOutputs)

    const result = validatePredecessors('node-2', edges, nodes, context)

    expect(result.valid).toBe(true)
  })

  it('should return invalid when predecessor failed', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'Node1'),
      createMockProcessNode('node-2', 'Node2'),
    ]
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
    ]
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('node-1', createMockNodeOutput('node-1', 'Node1', 'error', {}))
    const context = createMockContext(nodeOutputs)

    const result = validatePredecessors('node-2', edges, nodes, context)

    expect(result.valid).toBe(false)
    expect(result.failedPredecessors).toContain('Node1')
  })

  it('should return invalid when predecessor was skipped', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'Node1'),
      createMockProcessNode('node-2', 'Node2'),
    ]
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
    ]
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('node-1', createMockNodeOutput('node-1', 'Node1', 'skipped', {}))
    const context = createMockContext(nodeOutputs)

    const result = validatePredecessors('node-2', edges, nodes, context)

    expect(result.valid).toBe(false)
    expect(result.skippedPredecessors).toContain('Node1')
  })

  it('should return invalid when predecessor has no output', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'Node1'),
      createMockProcessNode('node-2', 'Node2'),
    ]
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
    ]
    const context = createMockContext()

    const result = validatePredecessors('node-2', edges, nodes, context)

    expect(result.valid).toBe(false)
    expect(result.missingPredecessors).toContain('Node1')
  })
})


// ============================================
// Property Tests for Variable Reference Validation
// ============================================

describe('Variable Reference Validation Property Tests', () => {
  /**
   * Property 2: Variable Reference Resolution
   * 
   * For any PROCESS node with variable references in its prompts, the input status SHALL be
   * 'invalid' if any variable reference cannot be resolved (node not found or field not found),
   * and 'valid' only when all references can be resolved.
   * 
   * **Feature: node-input-status-validation, Property 2: Variable Reference Resolution**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  it('Property 2: Variable Reference Resolution', () => {
    fc.assert(
      fc.property(
        // 生成节点名称
        fc.array(fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,8}$/), { minLength: 1, maxLength: 5 }),
        // 生成字段名称
        fc.array(fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/), { minLength: 1, maxLength: 3 }),
        // 是否包含不存在的节点引用
        fc.boolean(),
        // 是否包含不存在的字段引用
        fc.boolean(),
        (nodeNames, fieldNames, includeInvalidNode, includeInvalidField) => {
          // 确保节点名称唯一
          const uniqueNodeNames = [...new Set(nodeNames)]
          if (uniqueNodeNames.length === 0) return // 跳过空数组

          // 创建节点配置
          const nodes: NodeConfig[] = uniqueNodeNames.map((name, i) => ({
            id: `node-${i}`,
            type: 'PROCESS' as const,
            name,
            position: { x: 0, y: 0 },
            config: { userPrompt: '', systemPrompt: '' },
          }))

          // 创建节点输出
          const nodeOutputs = new Map<string, NodeOutput>()
          uniqueNodeNames.forEach((name, i) => {
            const data: Record<string, unknown> = {}
            fieldNames.forEach(field => {
              data[field] = `value-${field}`
            })
            nodeOutputs.set(`node-${i}`, createMockNodeOutput(`node-${i}`, name, 'success', data))
          })

          const context = createMockContext(nodeOutputs)

          // 构建测试文本
          let text = ''
          const validNodeName = uniqueNodeNames[0]
          const validFieldName = fieldNames[0] || 'result'

          // 添加有效引用
          text += `这是一个测试 {{${validNodeName}.${validFieldName}}} 文本`

          // 可能添加无效节点引用
          if (includeInvalidNode) {
            text += ` {{NonExistentNode.field}}`
          }

          // 可能添加无效字段引用
          if (includeInvalidField && fieldNames.length > 0) {
            text += ` {{${validNodeName}.nonExistentField}}`
          }

          const result = validateVariableReferences(text, context, nodes)

          // 验证属性：
          // 1. 如果包含无效节点引用，结果应该是 invalid
          // 2. 如果包含无效字段引用，结果应该是 invalid
          // 3. 如果所有引用都有效，结果应该是 valid
          if (includeInvalidNode) {
            expect(result.valid).toBe(false)
            expect(result.unresolvedVariables.some(v => v.includes('NonExistentNode'))).toBe(true)
          } else if (includeInvalidField && fieldNames.length > 0) {
            expect(result.valid).toBe(false)
            expect(result.unresolvedVariables.some(v => v.includes('nonExistentField'))).toBe(true)
          } else {
            expect(result.valid).toBe(true)
            expect(result.unresolvedVariables).toHaveLength(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Unit Tests for Variable Reference Validation
// ============================================

describe('extractVariableReferences', () => {
  it('should extract full format references {{nodeName.fieldName}}', () => {
    const text = '请处理 {{InputNode.text}} 的内容'
    const refs = extractVariableReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].nodeName).toBe('InputNode')
    expect(refs[0].fieldPath).toBe('text')
  })

  it('should extract simple format references {{nodeName}}', () => {
    const text = '请处理 {{InputNode}} 的内容'
    const refs = extractVariableReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].nodeName).toBe('InputNode')
    expect(refs[0].fieldPath).toBeNull()
  })

  it('should extract multiple references', () => {
    const text = '{{Node1.field1}} 和 {{Node2}} 以及 {{Node3.field3}}'
    const refs = extractVariableReferences(text)

    expect(refs).toHaveLength(3)
  })

  it('should extract nested field paths', () => {
    const text = '{{Node.data.nested.field}}'
    const refs = extractVariableReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].fieldPath).toBe('data.nested.field')
  })
})

describe('validateVariableReferences', () => {
  it('should return valid when no variable references exist', () => {
    const text = '这是一段没有变量引用的文本'
    const context = createMockContext()
    const nodes: NodeConfig[] = []

    const result = validateVariableReferences(text, context, nodes)

    expect(result.valid).toBe(true)
    expect(result.unresolvedVariables).toHaveLength(0)
  })

  it('should return valid when all references can be resolved', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'InputNode'),
    ]
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('node-1', createMockNodeOutput('node-1', 'InputNode', 'success', { text: 'hello' }))
    const context = createMockContext(nodeOutputs)

    const text = '请处理 {{InputNode.text}} 的内容'
    const result = validateVariableReferences(text, context, nodes)

    expect(result.valid).toBe(true)
  })

  it('should return invalid when node does not exist', () => {
    const nodes: NodeConfig[] = []
    const context = createMockContext()

    const text = '请处理 {{NonExistentNode.text}} 的内容'
    const result = validateVariableReferences(text, context, nodes)

    expect(result.valid).toBe(false)
    expect(result.unresolvedVariables).toContain('{{NonExistentNode.text}}')
    expect(result.details[0].reason).toBe('node_not_found')
  })

  it('should return invalid when field does not exist', () => {
    const nodes: NodeConfig[] = [
      createMockProcessNode('node-1', 'InputNode'),
    ]
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('node-1', createMockNodeOutput('node-1', 'InputNode', 'success', { text: 'hello' }))
    const context = createMockContext(nodeOutputs)

    const text = '请处理 {{InputNode.nonExistentField}} 的内容'
    const result = validateVariableReferences(text, context, nodes)

    expect(result.valid).toBe(false)
    expect(result.unresolvedVariables).toContain('{{InputNode.nonExistentField}}')
    expect(result.details[0].reason).toBe('field_not_found')
  })
})


// ============================================
// Property Tests for INPUT Node Field Validation
// ============================================

describe('INPUT Node Field Validation Property Tests', () => {
  /**
   * Property 3: INPUT Node Field Validation
   * 
   * For any INPUT node with required fields, the input status SHALL be 'missing' if any
   * required field has an empty value, and 'valid' only when all required fields have
   * non-empty values.
   * 
   * **Feature: node-input-status-validation, Property 3: INPUT Node Field Validation**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 3: INPUT Node Field Validation', () => {
    fc.assert(
      fc.property(
        // 生成字段数量
        fc.integer({ min: 1, max: 5 }),
        // 生成每个字段是否必填
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        // 生成每个字段是否有值
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        (fieldCount, requiredFlags, hasValueFlags) => {
          // 确保数组长度一致
          const count = Math.min(fieldCount, requiredFlags.length, hasValueFlags.length)
          if (count === 0) return

          // 创建字段配置
          const fields = Array.from({ length: count }, (_, i) => ({
            id: `field-${i}`,
            name: `Field${i}`,
            value: hasValueFlags[i] ? `value-${i}` : '',
            required: requiredFlags[i],
          }))

          const node = createMockInputNode('input-1', 'InputNode', fields)
          const result = validateInputNodeFields(node)

          // 验证属性：
          // 1. 如果有任何必填字段为空，结果应该是 invalid
          // 2. 如果所有必填字段都有值，结果应该是 valid
          const hasEmptyRequiredField = fields.some(f => f.required && f.value === '')

          if (hasEmptyRequiredField) {
            expect(result.valid).toBe(false)
            expect(result.missingFields.length).toBeGreaterThan(0)
            // 验证 missingFields 只包含必填且为空的字段
            result.missingFields.forEach(fieldName => {
              const field = fields.find(f => f.name === fieldName)
              expect(field?.required).toBe(true)
              expect(field?.value).toBe('')
            })
          } else {
            expect(result.valid).toBe(true)
            expect(result.missingFields).toHaveLength(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Unit Tests for INPUT Node Field Validation
// ============================================

describe('validateInputNodeFields', () => {
  it('should return valid for non-INPUT nodes', () => {
    const node = createMockProcessNode('process-1', 'ProcessNode')
    const result = validateInputNodeFields(node)

    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })

  it('should return valid when all required fields have values', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: 'value1', required: true },
      { id: 'f2', name: 'Field2', value: 'value2', required: true },
    ])

    const result = validateInputNodeFields(node)

    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })

  it('should return valid when optional fields are empty', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: 'value1', required: true },
      { id: 'f2', name: 'Field2', value: '', required: false },
    ])

    const result = validateInputNodeFields(node)

    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })

  it('should return invalid when required field is empty', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: '', required: true },
    ])

    const result = validateInputNodeFields(node)

    expect(result.valid).toBe(false)
    expect(result.missingFields).toContain('Field1')
  })

  it('should return invalid when required field is whitespace only', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: '   ', required: true },
    ])

    const result = validateInputNodeFields(node)

    expect(result.valid).toBe(false)
    expect(result.missingFields).toContain('Field1')
  })

  it('should return all missing required fields', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: '', required: true },
      { id: 'f2', name: 'Field2', value: 'value2', required: true },
      { id: 'f3', name: 'Field3', value: '', required: true },
    ])

    const result = validateInputNodeFields(node)

    expect(result.valid).toBe(false)
    expect(result.missingFields).toHaveLength(2)
    expect(result.missingFields).toContain('Field1')
    expect(result.missingFields).toContain('Field3')
  })
})


// ============================================
// Unit Tests for validateNodeInput (Main Function)
// ============================================

describe('validateNodeInput', () => {
  it('should validate INPUT node required fields', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: '', required: true },
    ])
    const context = createMockContext()
    const edges: EdgeConfig[] = []
    const nodes: NodeConfig[] = [node]

    const result = validateNodeInput({ node, context, edges, nodes })

    expect(result.status).toBe('missing')
    expect(result.error).toContain('Field1')
    expect(result.details?.missingFields).toContain('Field1')
  })

  it('should validate INPUT node with all fields filled', () => {
    const node = createMockInputNode('input-1', 'InputNode', [
      { id: 'f1', name: 'Field1', value: 'value1', required: true },
    ])
    const context = createMockContext()
    const edges: EdgeConfig[] = []
    const nodes: NodeConfig[] = [node]

    const result = validateNodeInput({ node, context, edges, nodes })

    expect(result.status).toBe('valid')
  })

  it('should validate PROCESS node predecessors', () => {
    const inputNode = createMockInputNode('input-1', 'InputNode', [])
    const processNode = createMockProcessNode('process-1', 'ProcessNode', '{{InputNode.text}}')
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'input-1', target: 'process-1' },
    ]
    const nodes: NodeConfig[] = [inputNode, processNode]
    const context = createMockContext() // No outputs yet

    const result = validateNodeInput({ node: processNode, context, edges, nodes })

    expect(result.status).toBe('missing')
    expect(result.error).toContain('InputNode')
  })

  it('should validate PROCESS node with successful predecessors', () => {
    const inputNode = createMockInputNode('input-1', 'InputNode', [])
    const processNode = createMockProcessNode('process-1', 'ProcessNode', '{{InputNode.text}}')
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'input-1', target: 'process-1' },
    ]
    const nodes: NodeConfig[] = [inputNode, processNode]
    
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('input-1', createMockNodeOutput('input-1', 'InputNode', 'success', { text: 'hello' }))
    const context = createMockContext(nodeOutputs)

    const result = validateNodeInput({ node: processNode, context, edges, nodes })

    expect(result.status).toBe('valid')
  })

  it('should validate PROCESS node variable references', () => {
    const inputNode = createMockInputNode('input-1', 'InputNode', [])
    const processNode = createMockProcessNode('process-1', 'ProcessNode', '{{NonExistentNode.text}}')
    const edges: EdgeConfig[] = []
    const nodes: NodeConfig[] = [inputNode, processNode]
    
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('input-1', createMockNodeOutput('input-1', 'InputNode', 'success', { text: 'hello' }))
    const context = createMockContext(nodeOutputs)

    const result = validateNodeInput({ node: processNode, context, edges, nodes })

    expect(result.status).toBe('invalid')
    expect(result.error).toContain('NonExistentNode')
    expect(result.details?.unresolvedVariables).toContain('{{NonExistentNode.text}}')
  })

  it('should validate PROCESS node with valid variable references', () => {
    const inputNode = createMockInputNode('input-1', 'InputNode', [])
    const processNode = createMockProcessNode('process-1', 'ProcessNode', '{{InputNode.text}}')
    const edges: EdgeConfig[] = []
    const nodes: NodeConfig[] = [inputNode, processNode]
    
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('input-1', createMockNodeOutput('input-1', 'InputNode', 'success', { text: 'hello' }))
    const context = createMockContext(nodeOutputs)

    const result = validateNodeInput({ node: processNode, context, edges, nodes })

    expect(result.status).toBe('valid')
  })

  it('should check predecessors before variable references', () => {
    const inputNode = createMockInputNode('input-1', 'InputNode', [])
    const processNode = createMockProcessNode('process-1', 'ProcessNode', '{{InputNode.text}}')
    const edges: EdgeConfig[] = [
      { id: 'edge-1', source: 'input-1', target: 'process-1' },
    ]
    const nodes: NodeConfig[] = [inputNode, processNode]
    
    // Predecessor failed
    const nodeOutputs = new Map<string, NodeOutput>()
    nodeOutputs.set('input-1', createMockNodeOutput('input-1', 'InputNode', 'error', {}))
    const context = createMockContext(nodeOutputs)

    const result = validateNodeInput({ node: processNode, context, edges, nodes })

    // Should report predecessor failure, not variable reference issue
    expect(result.status).toBe('missing')
    expect(result.error).toContain('执行失败')
  })
})
