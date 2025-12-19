/**
 * CONDITION Node Processor
 * 
 * Evaluates conditional expressions and determines execution flow.
 * Supports multiple operators and logic combinations (AND/OR).
 * 
 * Features:
 * - Multiple condition operators (equals, greaterThan, contains, etc.)
 * - Variable substitution from node outputs
 * - AND/OR logic for combining conditions
 * - Type-safe comparisons
 */

import type {
  ConditionNodeConfig,
  Condition,
  ConditionOperator,
  NodeConfig,
} from '@/types/workflow'
import type { NodeProcessor, ExecutionContext, NodeOutput } from '../types'

/**
 * Resolve variable value from execution context
 * Supports syntax: {{nodeName.fieldName}} or {{nodeName.output.nested.field}}
 */
function resolveVariable(
  variable: string,
  context: ExecutionContext
): unknown {
  // Remove {{ }} markers if present
  const cleanVar = variable.replace(/^\{\{|\}\}$/g, '').trim()
  
  // Split by dots to handle nested properties
  const parts = cleanVar.split('.')
  
  if (parts.length === 0) {
    return undefined
  }
  
  // First part is the node name
  const nodeName = parts[0]
  const nodeOutput = context.nodeOutputs.get(nodeName)
  
  if (!nodeOutput) {
    return undefined
  }
  
  // Navigate through nested properties
  let value: unknown = nodeOutput
  for (let i = 1; i < parts.length; i++) {
    if (value && typeof value === 'object' && parts[i] in value) {
      value = (value as Record<string, unknown>)[parts[i]]
    } else {
      return undefined
    }
  }
  
  return value
}

/**
 * Convert value to appropriate type for comparison
 */
function normalizeValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  
  // Convert objects/arrays to string for comparison
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  
  return String(value)
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  condition: Condition,
  context: ExecutionContext
): boolean {
  const leftValue = resolveVariable(condition.variable, context)
  const normalizedLeft = normalizeValue(leftValue)
  const normalizedRight = normalizeValue(condition.value)
  
  switch (condition.operator) {
    case 'equals':
      return normalizedLeft === normalizedRight
      
    case 'notEquals':
      return normalizedLeft !== normalizedRight
      
    case 'greaterThan':
      if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
        return normalizedLeft > normalizedRight
      }
      return false
      
    case 'lessThan':
      if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
        return normalizedLeft < normalizedRight
      }
      return false
      
    case 'greaterOrEqual':
      if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
        return normalizedLeft >= normalizedRight
      }
      return false
      
    case 'lessOrEqual':
      if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
        return normalizedLeft <= normalizedRight
      }
      return false
      
    case 'contains':
      if (typeof normalizedLeft === 'string' && typeof normalizedRight === 'string') {
        return normalizedLeft.includes(normalizedRight)
      }
      return false
      
    case 'notContains':
      if (typeof normalizedLeft === 'string' && typeof normalizedRight === 'string') {
        return !normalizedLeft.includes(normalizedRight)
      }
      return true
      
    case 'startsWith':
      if (typeof normalizedLeft === 'string' && typeof normalizedRight === 'string') {
        return normalizedLeft.startsWith(normalizedRight)
      }
      return false
      
    case 'endsWith':
      if (typeof normalizedLeft === 'string' && typeof normalizedRight === 'string') {
        return normalizedLeft.endsWith(normalizedRight)
      }
      return false
      
    case 'isEmpty':
      return normalizedLeft === null || normalizedLeft === '' || normalizedLeft === undefined
      
    case 'isNotEmpty':
      return normalizedLeft !== null && normalizedLeft !== '' && normalizedLeft !== undefined
      
    default:
      console.warn(`Unknown operator: ${condition.operator}`)
      return false
  }
}

/**
 * Evaluate all conditions with AND/OR logic
 */
function evaluateConditions(
  conditions: Condition[],
  evaluationMode: 'all' | 'any' = 'all',
  context: ExecutionContext
): boolean {
  if (conditions.length === 0) {
    return true
  }
  
  // For 'all' mode, use AND logic (all conditions must be true)
  // For 'any' mode, use OR logic (at least one condition must be true)
  if (evaluationMode === 'any') {
    return conditions.some(condition => evaluateCondition(condition, context))
  }
  
  return conditions.every(condition => evaluateCondition(condition, context))
}

/**
 * Process CONDITION node
 *
 * @param node - CONDITION node configuration
 * @param context - Execution context with node outputs
 * @returns Node output with evaluation result
 */
export async function processConditionNode(
  node: ConditionNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const startedAt = new Date()
  const { conditions, evaluationMode = 'all' } = node.config

  try {
    // Validate configuration
    if (!conditions || conditions.length === 0) {
      throw new Error('CONDITION node must have at least one condition')
    }

    // Evaluate all conditions
    const result = evaluateConditions(conditions, evaluationMode, context)

    // Return evaluation result
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'success',
      data: {
        result,
        conditionsMet: result,
        evaluatedConditions: conditions.map(cond => ({
          variable: cond.variable,
          operator: cond.operator,
          value: cond.value,
          resolved: resolveVariable(cond.variable, context),
          passed: evaluateCondition(cond, context),
        })),
      },
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  } catch (error) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'error',
      data: {},
      error: error instanceof Error ? error.message : '条件节点处理失败',
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  }
}

/**
 * CONDITION 节点处理器
 */
export const conditionNodeProcessor: NodeProcessor = {
  nodeType: 'CONDITION',
  process: (node: NodeConfig, context: ExecutionContext) =>
    processConditionNode(node as ConditionNodeConfig, context),
}
