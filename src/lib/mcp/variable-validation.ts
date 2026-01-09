/**
 * MCP Variable Reference Validation
 * 
 * Provides utilities for validating variable references in MCP tool configurations.
 * Validates that referenced variables exist in the workflow context.
 * 
 * **Validates: Requirements 7.3**
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Variable reference pattern: {{variableName}} or {{path.to.variable}}
 */
export const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

/**
 * Single variable reference pattern (for exact match)
 */
export const SINGLE_VARIABLE_PATTERN = /^\{\{([^}]+)\}\}$/

/**
 * Validation result for a single variable reference
 */
export interface VariableValidationResult {
  /** The variable path (e.g., "input.message") */
  path: string
  /** Whether the variable exists in the context */
  exists: boolean
  /** The resolved value if exists */
  value?: unknown
  /** Error message if validation failed */
  error?: string
}

/**
 * Overall validation result for a value containing variable references
 */
export interface ValidationResult {
  /** Whether all variable references are valid */
  isValid: boolean
  /** List of validation results for each variable reference */
  variables: VariableValidationResult[]
  /** List of missing variable paths */
  missingVariables: string[]
  /** List of error messages */
  errors: string[]
}

/**
 * Available variable in the workflow context
 */
export interface AvailableVariable {
  /** Variable path (e.g., "input.message" or "node_1.output") */
  path: string
  /** Display name for the variable */
  name: string
  /** Variable type (for display purposes) */
  type: 'field' | 'output' | 'knowledge' | 'system'
  /** Source node name */
  nodeName?: string
  /** Description of the variable */
  description?: string
  /** Reference string to insert (e.g., "{{input.message}}") */
  reference: string
}

// ============================================================================
// Core Validation Functions
// ============================================================================

/**
 * Extracts all variable references from a value
 * @param value - Value to extract references from
 * @returns Array of variable paths found
 */
export function extractVariableRefs(value: unknown): string[] {
  const refs: string[] = []

  function extract(val: unknown): void {
    if (typeof val === 'string') {
      // Reset regex state
      const pattern = new RegExp(VARIABLE_PATTERN.source, 'g')
      let match
      while ((match = pattern.exec(val)) !== null) {
        refs.push(match[1].trim())
      }
    } else if (Array.isArray(val)) {
      val.forEach(extract)
    } else if (val !== null && typeof val === 'object') {
      Object.values(val).forEach(extract)
    }
  }

  extract(value)
  return refs
}

/**
 * Resolves a variable path from the context
 * @param path - Variable path (e.g., "input.message" or "node_1.output")
 * @param variables - Available variables context
 * @returns Resolved value or undefined if not found
 */
export function resolveVariablePath(
  path: string,
  variables: Record<string, unknown>
): unknown {
  const parts = path.trim().split('.')
  let current: unknown = variables

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Validates a single variable reference
 * @param path - Variable path to validate
 * @param variables - Available variables context
 * @returns Validation result for the variable
 */
export function validateVariableRef(
  path: string,
  variables: Record<string, unknown>
): VariableValidationResult {
  const value = resolveVariablePath(path, variables)
  const exists = value !== undefined

  return {
    path,
    exists,
    value: exists ? value : undefined,
    error: exists ? undefined : `变量 "${path}" 不存在于工作流上下文中`,
  }
}

/**
 * Validates all variable references in a value
 * @param value - Value containing variable references
 * @param variables - Available variables context
 * @returns Overall validation result
 */
export function validateVariableRefs(
  value: unknown,
  variables: Record<string, unknown>
): ValidationResult {
  const refs = extractVariableRefs(value)
  const results: VariableValidationResult[] = []
  const missingVariables: string[] = []
  const errors: string[] = []

  for (const path of refs) {
    const result = validateVariableRef(path, variables)
    results.push(result)
    
    if (!result.exists) {
      missingVariables.push(path)
      if (result.error) {
        errors.push(result.error)
      }
    }
  }

  return {
    isValid: missingVariables.length === 0,
    variables: results,
    missingVariables,
    errors,
  }
}

/**
 * Checks if a string contains any variable references
 * @param value - Value to check
 * @returns True if contains variable references
 */
export function containsVariableRef(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }
  // Use a new regex without global flag to avoid state issues
  return /\{\{[^}]+\}\}/.test(value)
}

/**
 * Checks if a string is a single variable reference (entire string is one reference)
 * @param value - Value to check
 * @returns True if the entire string is a single variable reference
 */
export function isSingleVariableRef(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }
  return SINGLE_VARIABLE_PATTERN.test(value.trim())
}

// ============================================================================
// UI Validation Helpers
// ============================================================================

/**
 * Validates variable references and returns user-friendly error messages
 * @param value - Value to validate
 * @param availableVariables - List of available variables
 * @returns Validation result with user-friendly messages
 */
export function validateForUI(
  value: unknown,
  availableVariables: AvailableVariable[]
): ValidationResult {
  // ----- Revised logic: exact-path validation only -----
  // Build a Set for quick existence checks
  const availableSet = new Set(availableVariables.map(v => v.path))

  // Extract refs using core helper
  const refs = extractVariableRefs(value)

  const variablesResults: VariableValidationResult[] = refs.map(path => {
    const exists = availableSet.has(path)
    return {
      path,
      exists,
      value: undefined,
      error: exists ? undefined : `变量 "${path}" 不存在于工作流上下文中`,
    }
  })

  const missingVariables = variablesResults.filter(r => !r.exists).map(r => r.path)

  return {
    isValid: missingVariables.length === 0,
    variables: variablesResults,
    missingVariables,
    errors: variablesResults.filter(r => r.error).map(r => r.error as string),
  }
}

/**
 * Gets suggestions for variable autocomplete based on partial input
 * @param partialPath - Partial variable path typed by user
 * @param availableVariables - List of available variables
 * @returns Filtered list of matching variables
 */
export function getVariableSuggestions(
  partialPath: string,
  availableVariables: AvailableVariable[]
): AvailableVariable[] {
  if (!partialPath) {
    return availableVariables
  }

  const lowerPartial = partialPath.toLowerCase()
  
  return availableVariables.filter(v => {
    // Match against path, name, or node name
    return (
      v.path.toLowerCase().includes(lowerPartial) ||
      v.name.toLowerCase().includes(lowerPartial) ||
      (v.nodeName && v.nodeName.toLowerCase().includes(lowerPartial))
    )
  })
}

/**
 * Formats a validation error for display in the UI
 * @param result - Validation result
 * @returns Formatted error message or null if valid
 */
export function formatValidationError(result: ValidationResult): string | null {
  if (result.isValid) {
    return null
  }

  if (result.missingVariables.length === 1) {
    return `变量 "${result.missingVariables[0]}" 不存在`
  }

  return `以下变量不存在: ${result.missingVariables.join(', ')}`
}

// ============================================================================
// Workflow Context Helpers
// ============================================================================

/**
 * Builds available variables from workflow nodes
 * This is a helper function to be used by UI components
 * @param nodes - Workflow nodes
 * @param edges - Workflow edges
 * @param currentNodeId - Current node ID (to filter predecessors)
 * @returns List of available variables
 */
export function buildAvailableVariablesFromWorkflow(
  nodes: Array<{
    id: string
    data: Record<string, unknown>
    parentId?: string
  }>,
  edges: Array<{
    source: string
    target: string
    data?: Record<string, unknown>
  }>,
  currentNodeId: string
): AvailableVariable[] {
  const availableVariables: AvailableVariable[] = []
  const standardOutputFieldKeys = [
    '结果',
    'result',
    'model',
    'images',
    'imageUrls',
    'videos',
    'audio',
    'text',
    'taskId',
    'toolCalls',
    'toolCallRounds',
    '_meta',
  ] as const

  // Get current node
  const currentNode = nodes.find(n => n.id === currentNodeId)
  if (!currentNode) return availableVariables

  // Current node inputs.* (from inputBindings)
  const currentConfig = (currentNode.data as Record<string, unknown>)?.config as Record<string, unknown> | undefined
  const inputBindings = currentConfig?.inputBindings as Record<string, string> | undefined
  if (inputBindings && typeof inputBindings === 'object') {
    for (const slot of Object.keys(inputBindings)) {
      availableVariables.push({
        path: `inputs.${slot}`,
        name: `输入: ${slot}`,
        type: 'system',
        description: `输入绑定槽位: ${slot}`,
        reference: `{{inputs.${slot}}}`,
      })
    }
  }

  // Find all predecessor nodes
  const predecessorIds = new Set<string>()
  const findPredecessors = (nodeId: string, visited: Set<string> = new Set()) => {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const targetNode = nodes.find(n => n.id === nodeId)

    const incoming = edges.filter(e => e.target === nodeId)
    for (const edge of incoming) {
      if (!predecessorIds.has(edge.source)) {
        predecessorIds.add(edge.source)
        findPredecessors(edge.source, visited)
      }
    }

    // Handle group nodes
    if (targetNode?.parentId) {
      const parentGroupId = targetNode.parentId
      const groupIncoming = edges.filter(e => {
        if (e.target === parentGroupId) {
          const originalTarget = e.data?._originalTarget as string | undefined
          if (originalTarget === nodeId) return true
          if (!originalTarget) return true
          return false
        }
        return false
      })

      for (const edge of groupIncoming) {
        if (!predecessorIds.has(edge.source)) {
          predecessorIds.add(edge.source)
          findPredecessors(edge.source, visited)
        }
      }

      findPredecessors(parentGroupId, visited)
    }
  }
  findPredecessors(currentNodeId)

  // Expand group nodes
  const groupIds = new Set<string>()
  for (const nodeId of predecessorIds) {
    const node = nodes.find(n => n.id === nodeId)
    const nodeData = node?.data as Record<string, unknown>
    const nodeType = (nodeData?.type as string)?.toLowerCase()
    if (nodeType === 'group') {
      groupIds.add(nodeId)
    }
  }
  for (const node of nodes) {
    if (node.parentId && groupIds.has(node.parentId)) {
      predecessorIds.add(node.id)
    }
  }

  // Process each predecessor node
  for (const node of nodes) {
    if (!predecessorIds.has(node.id)) continue

    const nodeData = node.data as Record<string, unknown>
    const nodeType = (nodeData.type as string)?.toLowerCase()

    if (nodeType === 'group') continue

    const nodeName = nodeData.name as string
    const nodeConfig = nodeData.config as Record<string, unknown> | undefined

    if (nodeType === 'input') {
      // Input node fields
      const inputFields = (nodeConfig?.fields as Array<{ id: string; name: string }>) || []
      for (const field of inputFields) {
        availableVariables.push({
          path: `${nodeName}.${field.name}`,
          name: field.name,
          type: 'field',
          nodeName,
          description: `输入字段: ${field.name}`,
          reference: `{{${nodeName}.${field.name}}}`,
        })
      }
    } else if (nodeType === 'process') {
      // Process node knowledge items
      const knowledgeItems = (nodeConfig?.knowledgeItems as Array<{ id: string; name: string }>) || []
      for (const kb of knowledgeItems) {
        availableVariables.push({
          path: `${nodeName}.知识库.${kb.name}`,
          name: `知识库: ${kb.name}`,
          type: 'knowledge',
          nodeName,
          description: `知识库检索结果`,
          reference: `{{${nodeName}.知识库.${kb.name}}}`,
        })
      }
      // Process node output
      availableVariables.push({
        path: nodeName,
        name: '全部输出内容',
        type: 'output',
        nodeName,
        description: `${nodeName} 的输出结果`,
        reference: `{{${nodeName}}}`,
      })
      for (const key of standardOutputFieldKeys) {
        availableVariables.push({
          path: `${nodeName}.${key}`,
          name: key,
          type: 'output',
          nodeName,
          description: `${nodeName} 输出字段: ${key}`,
          reference: `{{${nodeName}.${key}}}`,
        })
      }
    } else {
      // Other nodes - just output
      availableVariables.push({
        path: nodeName,
        name: '全部输出内容',
        type: 'output',
        nodeName,
        description: `${nodeName} 的输出结果`,
        reference: `{{${nodeName}}}`,
      })
      // 尽量提供常用输出字段引用（具体字段是否存在由运行时决定）
      for (const key of standardOutputFieldKeys) {
        availableVariables.push({
          path: `${nodeName}.${key}`,
          name: key,
          type: 'output',
          nodeName,
          description: `${nodeName} 输出字段: ${key}`,
          reference: `{{${nodeName}.${key}}}`,
        })
      }
    }
  }

  return availableVariables
}
