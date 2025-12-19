/**
 * LOOP Node Processor
 * 
 * Handles loop iteration control for workflow execution.
 * Supports FOR loops (array iteration) and WHILE loops (condition-based).
 * 
 * Features:
 * - FOR loops: iterate over arrays with item/index access
 * - WHILE loops: repeat until condition is false
 * - Maximum iteration safeguard to prevent infinite loops
 * - Loop context variables accessible via {{loop.item}}, {{loop.index}}
 * 
 * Note: This processor handles loop initialization and iteration control.
 * The actual loop body execution is managed by the workflow engine.
 */

import type {
  LoopNodeConfig,
  NodeOutput,
  ExecutionContext,
  Condition,
} from '@/types/workflow'

const DEFAULT_MAX_ITERATIONS = 1000

/**
 * Loop execution state
 */
export interface LoopState {
  /** Current iteration index (0-based) */
  currentIndex: number
  /** Total iterations completed */
  iterationsCompleted: number
  /** Whether loop should continue */
  shouldContinue: boolean
  /** Current item for FOR loops */
  currentItem?: unknown
  /** Array being iterated (FOR loops) */
  array?: unknown[]
  /** Maximum allowed iterations */
  maxIterations: number
  /** Loop type */
  loopType: 'FOR' | 'WHILE'
  /** Item variable name */
  itemName?: string
  /** Index variable name */
  indexName?: string
}

/**
 * Resolve variable value from execution context
 * Supports syntax: {{nodeName.fieldName}} or {{nodeName.output.nested.field}}
 */
function resolveVariable(
  variable: string,
  context: ExecutionContext
): unknown {
  const cleanVar = variable.replace(/^\{\{|\}\}$/g, '').trim()
  const parts = cleanVar.split('.')
  
  if (parts.length === 0) {
    return undefined
  }
  
  const nodeName = parts[0]
  const nodeOutput = context.nodeOutputs.get(nodeName)
  
  if (!nodeOutput) {
    return undefined
  }
  
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
 * Normalize value for comparison
 */
function normalizeValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  
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
      return typeof normalizedLeft === 'number' && typeof normalizedRight === 'number' && normalizedLeft > normalizedRight
    case 'lessThan':
      return typeof normalizedLeft === 'number' && typeof normalizedRight === 'number' && normalizedLeft < normalizedRight
    case 'greaterOrEqual':
      return typeof normalizedLeft === 'number' && typeof normalizedRight === 'number' && normalizedLeft >= normalizedRight
    case 'lessOrEqual':
      return typeof normalizedLeft === 'number' && typeof normalizedRight === 'number' && normalizedLeft <= normalizedRight
    case 'contains':
      return typeof normalizedLeft === 'string' && typeof normalizedRight === 'string' && normalizedLeft.includes(normalizedRight)
    case 'notContains':
      return typeof normalizedLeft === 'string' && typeof normalizedRight === 'string' && !normalizedLeft.includes(normalizedRight)
    case 'startsWith':
      return typeof normalizedLeft === 'string' && typeof normalizedRight === 'string' && normalizedLeft.startsWith(normalizedRight)
    case 'endsWith':
      return typeof normalizedLeft === 'string' && typeof normalizedRight === 'string' && normalizedLeft.endsWith(normalizedRight)
    case 'isEmpty':
      return normalizedLeft === null || normalizedLeft === ''
    case 'isNotEmpty':
      return normalizedLeft !== null && normalizedLeft !== ''
    default:
      return false
  }
}

/**
 * Initialize FOR loop state
 */
export function initializeForLoop(
  node: LoopNodeConfig,
  context: ExecutionContext
): LoopState {
  const { forConfig, maxIterations } = node.config
  
  if (!forConfig) {
    throw new Error('FOR loop requires forConfig')
  }
  
  const arrayValue = resolveVariable(forConfig.arrayVariable, context)
  
  if (!Array.isArray(arrayValue)) {
    throw new Error(`FOR loop variable ${forConfig.arrayVariable} is not an array`)
  }
  
  const max = Math.min(
    maxIterations ?? DEFAULT_MAX_ITERATIONS,
    arrayValue.length
  )
  
  return {
    currentIndex: 0,
    iterationsCompleted: 0,
    shouldContinue: arrayValue.length > 0,
    currentItem: arrayValue.length > 0 ? arrayValue[0] : undefined,
    array: arrayValue,
    maxIterations: max,
    loopType: 'FOR',
    itemName: forConfig.itemName,
    indexName: forConfig.indexName,
  }
}

/**
 * Initialize WHILE loop state
 */
export function initializeWhileLoop(
  node: LoopNodeConfig,
  context: ExecutionContext
): LoopState {
  const { whileConfig, maxIterations } = node.config
  
  if (!whileConfig) {
    throw new Error('WHILE loop requires whileConfig')
  }
  
  const conditionMet = evaluateCondition(whileConfig.condition, context)
  const max = Math.min(
    maxIterations ?? DEFAULT_MAX_ITERATIONS,
    whileConfig.maxIterations
  )
  
  return {
    currentIndex: 0,
    iterationsCompleted: 0,
    shouldContinue: conditionMet,
    maxIterations: max,
    loopType: 'WHILE',
  }
}

/**
 * Advance FOR loop to next iteration
 */
export function advanceForLoop(state: LoopState): LoopState {
  const nextIndex = state.currentIndex + 1
  const array = state.array ?? []
  
  return {
    ...state,
    currentIndex: nextIndex,
    iterationsCompleted: state.iterationsCompleted + 1,
    shouldContinue: nextIndex < array.length && nextIndex < state.maxIterations,
    currentItem: nextIndex < array.length ? array[nextIndex] : undefined,
  }
}

/**
 * Advance WHILE loop to next iteration
 */
export function advanceWhileLoop(
  state: LoopState,
  condition: Condition,
  context: ExecutionContext
): LoopState {
  const nextIndex = state.currentIndex + 1
  const conditionStillMet = evaluateCondition(condition, context)
  
  return {
    ...state,
    currentIndex: nextIndex,
    iterationsCompleted: state.iterationsCompleted + 1,
    shouldContinue: conditionStillMet && nextIndex < state.maxIterations,
  }
}

/**
 * Get loop context variables for current iteration
 * These are added to the execution context for loop body nodes
 */
export function getLoopContextVariables(state: LoopState): Record<string, unknown> {
  const loopContext: Record<string, unknown> = {
    index: state.currentIndex,
    iteration: state.iterationsCompleted + 1,
    isFirst: state.currentIndex === 0,
    isLast: state.loopType === 'FOR' 
      ? state.currentIndex === (state.array?.length ?? 1) - 1 
      : false,
  }
  
  if (state.loopType === 'FOR' && state.currentItem !== undefined) {
    loopContext.item = state.currentItem
    
    if (state.itemName) {
      loopContext[state.itemName] = state.currentItem
    }
    if (state.indexName) {
      loopContext[state.indexName] = state.currentIndex
    }
  }
  
  return loopContext
}

/**
 * Process LOOP node - Initialize loop and return initial state
 * 
 * @param node - LOOP node configuration
 * @param context - Execution context with node outputs
 * @returns Node output with loop state for engine to manage iterations
 */
export async function processLoopNode(
  node: LoopNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const { loopType, forConfig, whileConfig, maxIterations } = node.config
  
  if (loopType === 'FOR') {
    if (!forConfig) {
      throw new Error('LOOP node with type FOR requires forConfig')
    }
    
    const state = initializeForLoop(node, context)
    const loopVars = getLoopContextVariables(state)
    
    return {
      loopType: 'FOR',
      state,
      loopVariables: loopVars,
      arrayLength: state.array?.length ?? 0,
      shouldContinue: state.shouldContinue,
      currentIndex: state.currentIndex,
      currentItem: state.currentItem,
      maxIterations: state.maxIterations,
    }
  }
  
  if (loopType === 'WHILE') {
    if (!whileConfig) {
      throw new Error('LOOP node with type WHILE requires whileConfig')
    }
    
    const state = initializeWhileLoop(node, context)
    const loopVars = getLoopContextVariables(state)
    
    return {
      loopType: 'WHILE',
      state,
      loopVariables: loopVars,
      shouldContinue: state.shouldContinue,
      currentIndex: state.currentIndex,
      maxIterations: state.maxIterations,
    }
  }
  
  throw new Error(`Unknown loop type: ${loopType}`)
}

/**
 * Check if loop should continue based on current state
 */
export function shouldLoopContinue(state: LoopState): boolean {
  if (state.iterationsCompleted >= state.maxIterations) {
    return false
  }
  
  return state.shouldContinue
}

/**
 * Create aggregated result from all loop iterations
 */
export function aggregateLoopResults(
  iterationResults: Record<string, unknown>[]
): NodeOutput {
  return {
    iterations: iterationResults.length,
    results: iterationResults,
    allSucceeded: iterationResults.every(r => r.success !== false),
  }
}
