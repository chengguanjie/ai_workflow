/**
 * SWITCH Node Processor
 *
 * Evaluates a variable and routes to the matching case branch.
 * Supports multiple match types: exact, contains, regex, range.
 *
 * Features:
 * - Multiple output branches based on case values
 * - Variable substitution from node outputs
 * - Case-sensitive/insensitive matching
 * - Default branch for unmatched values
 */

import type {
  SwitchNodeConfig,
  SwitchCase,
  SwitchMatchType,
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
 * Normalize value to string for comparison
 */
function normalizeToString(value: unknown, caseSensitive: boolean): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return caseSensitive ? str : str.toLowerCase()
}

/**
 * Check if value matches a case based on match type
 */
function matchCase(
  switchValue: unknown,
  caseValue: string | number | boolean,
  matchType: SwitchMatchType,
  caseSensitive: boolean
): boolean {
  const normalizedSwitch = normalizeToString(switchValue, caseSensitive)
  const normalizedCase = normalizeToString(caseValue, caseSensitive)

  switch (matchType) {
    case 'exact':
      // Exact match (type-aware for numbers and booleans)
      if (typeof caseValue === 'number') {
        const numValue = Number(switchValue)
        return !isNaN(numValue) && numValue === caseValue
      }
      if (typeof caseValue === 'boolean') {
        return switchValue === caseValue ||
               normalizedSwitch === String(caseValue).toLowerCase()
      }
      return normalizedSwitch === normalizedCase

    case 'contains':
      // String contains
      return normalizedSwitch.includes(normalizedCase)

    case 'regex':
      // Regular expression match
      try {
        const flags = caseSensitive ? '' : 'i'
        const regex = new RegExp(String(caseValue), flags)
        return regex.test(String(switchValue))
      } catch {
        console.warn(`Invalid regex pattern: ${caseValue}`)
        return false
      }

    case 'range':
      // Range match (format: "min-max" or ">=min" or "<=max")
      const strCase = String(caseValue)
      const numValue = Number(switchValue)

      if (isNaN(numValue)) {
        return false
      }

      // Handle "min-max" format
      if (strCase.includes('-') && !strCase.startsWith('-')) {
        const [min, max] = strCase.split('-').map(Number)
        if (!isNaN(min) && !isNaN(max)) {
          return numValue >= min && numValue <= max
        }
      }

      // Handle comparison operators
      if (strCase.startsWith('>=')) {
        const min = Number(strCase.slice(2))
        return !isNaN(min) && numValue >= min
      }
      if (strCase.startsWith('<=')) {
        const max = Number(strCase.slice(2))
        return !isNaN(max) && numValue <= max
      }
      if (strCase.startsWith('>')) {
        const min = Number(strCase.slice(1))
        return !isNaN(min) && numValue > min
      }
      if (strCase.startsWith('<')) {
        const max = Number(strCase.slice(1))
        return !isNaN(max) && numValue < max
      }

      return false

    default:
      return normalizedSwitch === normalizedCase
  }
}

/**
 * Find matching case for the switch value
 */
function findMatchingCase(
  switchValue: unknown,
  cases: SwitchCase[],
  matchType: SwitchMatchType,
  caseSensitive: boolean
): SwitchCase | undefined {
  // First, try to find a non-default matching case
  for (const switchCase of cases) {
    if (switchCase.isDefault) {
      continue
    }

    if (matchCase(switchValue, switchCase.value, matchType, caseSensitive)) {
      return switchCase
    }
  }

  // If no match found, return default case
  return cases.find(c => c.isDefault)
}

/**
 * Process SWITCH node
 *
 * @param node - SWITCH node configuration
 * @param context - Execution context with node outputs
 * @returns Node output with matched case information
 */
export async function processSwitchNode(
  node: SwitchNodeConfig,
  context: ExecutionContext
): Promise<NodeOutput> {
  const startedAt = new Date()
  const {
    switchVariable,
    cases,
    matchType = 'exact',
    caseSensitive = true,
    includeDefault = true,
  } = node.config

  try {
    // Validate configuration
    if (!switchVariable) {
      throw new Error('SWITCH node must have a switchVariable configured')
    }

    if (!cases || cases.length === 0) {
      throw new Error('SWITCH node must have at least one case')
    }

    // Resolve the switch variable value
    const switchValue = resolveVariable(switchVariable, context)

    // Find matching case
    const matchedCase = findMatchingCase(switchValue, cases, matchType, caseSensitive)

    // Prepare case evaluation details
    const evaluatedCases = cases.map(c => ({
      id: c.id,
      label: c.label,
      value: c.value,
      isDefault: c.isDefault || false,
      matched: matchedCase?.id === c.id,
    }))

    // Return evaluation result
    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'success',
      data: {
        switchVariable,
        switchValue,
        matchType,
        matchedCase: matchedCase ? {
          id: matchedCase.id,
          label: matchedCase.label,
          value: matchedCase.value,
          isDefault: matchedCase.isDefault || false,
        } : null,
        matchedBranch: matchedCase?.id || (includeDefault ? 'default' : null),
        evaluatedCases,
        hasMatch: !!matchedCase,
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
      error: error instanceof Error ? error.message : 'Switch 节点处理失败',
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  }
}

/**
 * SWITCH 节点处理器
 */
export const switchNodeProcessor: NodeProcessor = {
  nodeType: 'SWITCH',
  process: (node: NodeConfig, context: ExecutionContext) =>
    processSwitchNode(node as SwitchNodeConfig, context),
}
