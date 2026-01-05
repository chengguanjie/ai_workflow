/**
 * Node Diagnosis Service
 *
 * Provides functionality to diagnose node configuration issues.
 * Checks for missing required fields, invalid variable references,
 * and potential performance issues.
 *
 * Requirements: 4.2, 4.3, 4.4
 */

import type {
  NodeConfig,
  WorkflowConfig,
  ProcessNodeConfigData,
  CodeNodeConfigData,
  InputNodeConfigData,
  OutputNodeConfigData,
  LogicNodeConfigData,
} from '@/types/workflow'

// ============================================
// Types
// ============================================

/**
 * Severity level for diagnostic issues
 */
export type DiagnosisSeverity = 'error' | 'warning' | 'info'

/**
 * Diagnosis issue codes
 */
export const DIAGNOSIS_CODES = {
  // Errors
  MISSING_REQUIRED_FIELD: 'missing_required_field',
  INVALID_VARIABLE_REF: 'invalid_variable_ref',
  CIRCULAR_DEPENDENCY: 'circular_dependency',
  INVALID_NODE_REF: 'invalid_node_ref',

  // Warnings
  EMPTY_PROMPT: 'empty_prompt',
  LONG_PROMPT: 'long_prompt',
  COMPLEX_CODE: 'complex_code',
  UNUSED_INPUT: 'unused_input',
  HIGH_TEMPERATURE: 'high_temperature',
  NO_TIMEOUT: 'no_timeout',
  MISSING_ERROR_HANDLING: 'missing_error_handling',

  // Info
  OPTIMIZATION_AVAILABLE: 'optimization_available',
  MISSING_DESCRIPTION: 'missing_description',
} as const

export type DiagnosisCode = (typeof DIAGNOSIS_CODES)[keyof typeof DIAGNOSIS_CODES]

/**
 * Single diagnostic issue
 */
export interface DiagnosisIssue {
  /** Issue severity level */
  severity: DiagnosisSeverity
  /** Issue code for programmatic handling */
  code: DiagnosisCode
  /** Human-readable message */
  message: string
  /** Field path that has the issue (optional) */
  field?: string
  /** Suggestion for fixing the issue (optional) */
  suggestion?: string
}

/**
 * Diagnosis response
 */
export interface DiagnoseNodeResponse {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'error'
  /** List of issues found */
  issues: DiagnosisIssue[]
}

// ============================================
// Constants
// ============================================

/** Maximum recommended prompt length (characters) */
const MAX_PROMPT_LENGTH = 4000

/** Maximum recommended code length (lines) */
const MAX_CODE_LINES = 200

/** High temperature threshold */
const HIGH_TEMPERATURE_THRESHOLD = 0.9

// ============================================
// Variable Reference Parsing
// ============================================

/**
 * Extract variable references from a string
 * Matches patterns like {{nodeName.fieldName}} or {{nodeName}}
 */
function extractVariableReferences(text: string): Array<{ nodeRef: string; fieldRef?: string }> {
  const pattern = /\{\{([^}]+)\}\}/g
  const references: Array<{ nodeRef: string; fieldRef?: string }> = []
  let match

  while ((match = pattern.exec(text)) !== null) {
    const ref = match[1].trim()
    const parts = ref.split('.')

    if (parts.length >= 1) {
      references.push({
        nodeRef: parts[0],
        fieldRef: parts.length > 1 ? parts.slice(1).join('.') : undefined,
      })
    }
  }

  return references
}

/**
 * Check if a node reference is valid
 */
function isValidNodeReference(
  nodeRef: string,
  workflowConfig: WorkflowConfig,
  currentNodeId: string
): { valid: boolean; reason?: string } {
  // Special references that are always valid
  const specialRefs = ['input', 'global', 'env', 'context']
  if (specialRefs.includes(nodeRef.toLowerCase())) {
    return { valid: true }
  }

  // Check if node exists by ID or name
  const nodeById = workflowConfig.nodes.find((n) => n.id === nodeRef)
  const nodeByName = workflowConfig.nodes.find((n) => n.name === nodeRef)
  const referencedNode = nodeById || nodeByName

  if (!referencedNode) {
    return { valid: false, reason: `节点 "${nodeRef}" 不存在` }
  }

  // Check for self-reference (not necessarily an error, but worth noting)
  if (referencedNode.id === currentNodeId) {
    return { valid: true } // Self-reference is allowed in some cases
  }

  return { valid: true }
}

// ============================================
// Node Type Specific Checks
// ============================================

/**
 * Check PROCESS node configuration
 */
function checkProcessNode(
  node: NodeConfig,
  config: ProcessNodeConfigData,
  workflowConfig: WorkflowConfig
): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = []

  // Check for empty user prompt
  if (!config.userPrompt || config.userPrompt.trim().length === 0) {
    issues.push({
      severity: 'warning',
      code: DIAGNOSIS_CODES.EMPTY_PROMPT,
      message: '用户提示词为空',
      field: 'config.userPrompt',
      suggestion: '添加用户提示词以指导 AI 生成内容',
    })
  } else {
    // Check for long prompt
    if (config.userPrompt.length > MAX_PROMPT_LENGTH) {
      issues.push({
        severity: 'warning',
        code: DIAGNOSIS_CODES.LONG_PROMPT,
        message: `用户提示词过长 (${config.userPrompt.length} 字符)，可能影响性能`,
        field: 'config.userPrompt',
        suggestion: `建议将提示词控制在 ${MAX_PROMPT_LENGTH} 字符以内，或考虑拆分为多个节点`,
      })
    }

    // Check variable references in user prompt
    const refs = extractVariableReferences(config.userPrompt)
    for (const ref of refs) {
      const result = isValidNodeReference(ref.nodeRef, workflowConfig, node.id)
      if (!result.valid) {
        issues.push({
          severity: 'error',
          code: DIAGNOSIS_CODES.INVALID_VARIABLE_REF,
          message: `用户提示词中引用了不存在的节点: ${ref.nodeRef}`,
          field: 'config.userPrompt',
          suggestion: result.reason,
        })
      }
    }
  }

  // Check system prompt variable references
  if (config.systemPrompt) {
    if (config.systemPrompt.length > MAX_PROMPT_LENGTH) {
      issues.push({
        severity: 'warning',
        code: DIAGNOSIS_CODES.LONG_PROMPT,
        message: `系统提示词过长 (${config.systemPrompt.length} 字符)`,
        field: 'config.systemPrompt',
        suggestion: `建议将系统提示词控制在 ${MAX_PROMPT_LENGTH} 字符以内`,
      })
    }

    const refs = extractVariableReferences(config.systemPrompt)
    for (const ref of refs) {
      const result = isValidNodeReference(ref.nodeRef, workflowConfig, node.id)
      if (!result.valid) {
        issues.push({
          severity: 'error',
          code: DIAGNOSIS_CODES.INVALID_VARIABLE_REF,
          message: `系统提示词中引用了不存在的节点: ${ref.nodeRef}`,
          field: 'config.systemPrompt',
          suggestion: result.reason,
        })
      }
    }
  }

  // Check temperature setting
  if (config.temperature !== undefined && config.temperature > HIGH_TEMPERATURE_THRESHOLD) {
    issues.push({
      severity: 'warning',
      code: DIAGNOSIS_CODES.HIGH_TEMPERATURE,
      message: `温度参数较高 (${config.temperature})，输出可能不稳定`,
      field: 'config.temperature',
      suggestion: '建议将温度降低到 0.7 或更低以获得更稳定的输出',
    })
  }

  // Check AI config
  if (!config.aiConfigId && !config.model) {
    issues.push({
      severity: 'warning',
      code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
      message: '未配置 AI 模型',
      field: 'config.aiConfigId',
      suggestion: '请选择一个 AI 配置或指定模型',
    })
  }

  return issues
}

/**
 * Check CODE node configuration
 */
function checkCodeNode(
  node: NodeConfig,
  config: CodeNodeConfigData,
  workflowConfig: WorkflowConfig
): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = []

  // Check for empty code
  if (!config.code || config.code.trim().length === 0) {
    issues.push({
      severity: 'error',
      code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
      message: '代码内容为空',
      field: 'config.code',
      suggestion: '请添加要执行的代码',
    })
  } else {
    // Check code complexity (line count)
    const lineCount = config.code.split('\n').length
    if (lineCount > MAX_CODE_LINES) {
      issues.push({
        severity: 'warning',
        code: DIAGNOSIS_CODES.COMPLEX_CODE,
        message: `代码较长 (${lineCount} 行)，可能影响可维护性`,
        field: 'config.code',
        suggestion: '考虑将复杂逻辑拆分为多个节点或使用外部函数',
      })
    }

    // Check for basic error handling patterns
    const hasErrorHandling =
      config.code.includes('try') ||
      config.code.includes('catch') ||
      config.code.includes('.catch(') ||
      config.code.includes('if (error') ||
      config.code.includes('if(error')

    if (!hasErrorHandling && lineCount > 10) {
      issues.push({
        severity: 'info',
        code: DIAGNOSIS_CODES.MISSING_ERROR_HANDLING,
        message: '代码中未检测到错误处理逻辑',
        field: 'config.code',
        suggestion: '建议添加 try-catch 块来处理潜在错误',
      })
    }

    // Check variable references in code (if using template syntax)
    const refs = extractVariableReferences(config.code)
    for (const ref of refs) {
      const result = isValidNodeReference(ref.nodeRef, workflowConfig, node.id)
      if (!result.valid) {
        issues.push({
          severity: 'error',
          code: DIAGNOSIS_CODES.INVALID_VARIABLE_REF,
          message: `代码中引用了不存在的节点: ${ref.nodeRef}`,
          field: 'config.code',
          suggestion: result.reason,
        })
      }
    }
  }

  // Check timeout setting
  if (!config.timeout) {
    issues.push({
      severity: 'info',
      code: DIAGNOSIS_CODES.NO_TIMEOUT,
      message: '未设置执行超时时间',
      field: 'config.timeout',
      suggestion: '建议设置超时时间以防止代码执行时间过长',
    })
  }

  return issues
}

/**
 * Check INPUT node configuration
 */
function checkInputNode(
  _node: NodeConfig,
  config: InputNodeConfigData,
  _workflowConfig: WorkflowConfig
): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = []

  // Check for empty fields
  if (!config.fields || config.fields.length === 0) {
    issues.push({
      severity: 'warning',
      code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
      message: '输入节点没有定义任何字段',
      field: 'config.fields',
      suggestion: '添加至少一个输入字段',
    })
  } else {
    // Check each field
    for (let i = 0; i < config.fields.length; i++) {
      const field = config.fields[i]
      if (!field.name || field.name.trim().length === 0) {
        issues.push({
          severity: 'error',
          code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
          message: `字段 ${i + 1} 缺少名称`,
          field: `config.fields[${i}].name`,
          suggestion: '为字段指定一个唯一的名称',
        })
      }
    }

    // Check for duplicate field names
    const fieldNames = config.fields.map((f) => f.name).filter(Boolean)
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index)
    if (duplicates.length > 0) {
      issues.push({
        severity: 'error',
        code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
        message: `存在重复的字段名称: ${[...new Set(duplicates)].join(', ')}`,
        field: 'config.fields',
        suggestion: '确保每个字段名称唯一',
      })
    }
  }

  return issues
}

/**
 * Check OUTPUT node configuration
 */
function checkOutputNode(
  node: NodeConfig,
  config: OutputNodeConfigData,
  workflowConfig: WorkflowConfig
): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = []

  // Check for empty prompt/content
  if (!config.prompt || config.prompt.trim().length === 0) {
    issues.push({
      severity: 'warning',
      code: DIAGNOSIS_CODES.EMPTY_PROMPT,
      message: '输出内容模板为空',
      field: 'config.prompt',
      suggestion: '添加输出内容模板，可以使用 {{节点名.字段}} 引用其他节点的输出',
    })
  } else {
    // Check variable references
    const refs = extractVariableReferences(config.prompt)
    for (const ref of refs) {
      const result = isValidNodeReference(ref.nodeRef, workflowConfig, node.id)
      if (!result.valid) {
        issues.push({
          severity: 'error',
          code: DIAGNOSIS_CODES.INVALID_VARIABLE_REF,
          message: `输出模板中引用了不存在的节点: ${ref.nodeRef}`,
          field: 'config.prompt',
          suggestion: result.reason,
        })
      }
    }
  }

  return issues
}

/**
 * Check LOGIC node configuration
 */
function checkLogicNode(
  node: NodeConfig,
  config: LogicNodeConfigData,
  workflowConfig: WorkflowConfig
): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = []

  // Check mode
  if (!config.mode) {
    issues.push({
      severity: 'error',
      code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
      message: '未设置逻辑节点模式',
      field: 'config.mode',
      suggestion: '请选择 condition（条件判断）或 merge（合并）模式',
    })
  }

  // Check conditions for condition mode
  if (config.mode === 'condition') {
    if (!config.conditions || config.conditions.length === 0) {
      issues.push({
        severity: 'warning',
        code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
        message: '条件模式下未定义任何条件',
        field: 'config.conditions',
        suggestion: '添加至少一个条件表达式',
      })
    } else {
      // Check each condition
      for (let i = 0; i < config.conditions.length; i++) {
        const condition = config.conditions[i]
        if (!condition.expression || condition.expression.trim().length === 0) {
          issues.push({
            severity: 'error',
            code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
            message: `条件 ${i + 1} 缺少表达式`,
            field: `config.conditions[${i}].expression`,
            suggestion: '为条件指定一个表达式',
          })
        } else {
          // Check variable references in expression
          const refs = extractVariableReferences(condition.expression)
          for (const ref of refs) {
            const result = isValidNodeReference(ref.nodeRef, workflowConfig, node.id)
            if (!result.valid) {
              issues.push({
                severity: 'error',
                code: DIAGNOSIS_CODES.INVALID_VARIABLE_REF,
                message: `条件 ${i + 1} 中引用了不存在的节点: ${ref.nodeRef}`,
                field: `config.conditions[${i}].expression`,
                suggestion: result.reason,
              })
            }
          }
        }
      }
    }
  }

  // Check merge mode
  if (config.mode === 'merge') {
    if (config.mergeFromNodeIds && config.mergeFromNodeIds.length > 0) {
      for (const nodeId of config.mergeFromNodeIds) {
        const exists = workflowConfig.nodes.some((n) => n.id === nodeId)
        if (!exists) {
          issues.push({
            severity: 'error',
            code: DIAGNOSIS_CODES.INVALID_NODE_REF,
            message: `合并节点引用了不存在的节点 ID: ${nodeId}`,
            field: 'config.mergeFromNodeIds',
            suggestion: '请检查并更新合并节点列表',
          })
        }
      }
    }
  }

  return issues
}

// ============================================
// Main Service
// ============================================

/**
 * Node Diagnosis Service class
 */
export class NodeDiagnosisService {
  /**
   * Diagnose a node's configuration
   *
   * @param node - The node to diagnose
   * @param workflowConfig - The full workflow configuration (for context)
   * @returns Diagnosis response with status and issues
   */
  diagnoseNode(node: NodeConfig, workflowConfig: WorkflowConfig): DiagnoseNodeResponse {
    const issues: DiagnosisIssue[] = []

    // Common checks for all node types
    if (!node.name || node.name.trim().length === 0) {
      issues.push({
        severity: 'warning',
        code: DIAGNOSIS_CODES.MISSING_REQUIRED_FIELD,
        message: '节点名称为空',
        field: 'name',
        suggestion: '为节点指定一个有意义的名称',
      })
    }

    // Check for node comment/description
    if (!node.comment) {
      issues.push({
        severity: 'info',
        code: DIAGNOSIS_CODES.MISSING_DESCRIPTION,
        message: '节点缺少注释说明',
        field: 'comment',
        suggestion: '添加注释以说明节点的用途',
      })
    }

    // Type-specific checks
    const config = node.config as unknown

    switch (node.type) {
      case 'PROCESS':
        issues.push(...checkProcessNode(node, config as ProcessNodeConfigData, workflowConfig))
        break
      case 'CODE':
        issues.push(...checkCodeNode(node, config as CodeNodeConfigData, workflowConfig))
        break
      case 'INPUT':
        issues.push(...checkInputNode(node, config as InputNodeConfigData, workflowConfig))
        break
      case 'OUTPUT':
        issues.push(...checkOutputNode(node, config as OutputNodeConfigData, workflowConfig))
        break
      case 'LOGIC':
        issues.push(...checkLogicNode(node, config as LogicNodeConfigData, workflowConfig))
        break
    }

    // Determine overall status
    const hasErrors = issues.some((i) => i.severity === 'error')
    const hasWarnings = issues.some((i) => i.severity === 'warning')

    let status: 'healthy' | 'warning' | 'error' = 'healthy'
    if (hasErrors) {
      status = 'error'
    } else if (hasWarnings) {
      status = 'warning'
    }

    return {
      status,
      issues,
    }
  }
}

// Export singleton instance
export const nodeDiagnosisService = new NodeDiagnosisService()
