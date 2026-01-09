/**
 * 工作流节点输入验证器
 * 
 * 提供节点执行前的输入验证功能：
 * - 前置节点状态验证
 * - 变量引用验证
 * - INPUT 节点必填字段验证
 */

import type { NodeConfig, EdgeConfig, InputNodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from '../types'
import type { InputValidationResult, InputValidatorOptions } from './types'

// ============================================
// Helper Functions
// ============================================

/**
 * 获取节点的所有前置节点ID
 */
function getPredecessorIds(nodeId: string, edges: EdgeConfig[]): string[] {
  return edges
    .filter(e => e.target === nodeId)
    .map(e => e.source)
}

/**
 * 根据节点ID查找节点配置
 */
function findNodeById(nodeId: string, nodes: NodeConfig[]): NodeConfig | undefined {
  return nodes.find(n => n.id === nodeId)
}

/**
 * 变量引用正则表达式
 * 匹配 {{节点名.字段名}} 或 {{节点名.字段名.子字段}} 格式
 */
const VARIABLE_PATTERN = /\{\{([^.}]+)\.([^}]+)\}\}/g

/**
 * 简化变量引用正则表达式
 * 匹配 {{节点名}} 格式（不含字段名）
 */
const SIMPLE_VARIABLE_PATTERN = /\{\{([^.{}]+)\}\}/g

// ============================================
// Predecessor Validation
// ============================================

/**
 * 前置节点验证结果
 */
export interface PredecessorValidationResult {
  valid: boolean
  missingPredecessors: string[]
  failedPredecessors: string[]
  skippedPredecessors: string[]
}

/**
 * 验证前置节点状态
 * 
 * 检查所有前置节点是否已成功完成执行。
 * 
 * @param nodeId - 当前节点ID
 * @param edges - 工作流边配置
 * @param nodes - 工作流所有节点配置
 * @param context - 执行上下文
 * @returns 前置节点验证结果
 */
export function validatePredecessors(
  nodeId: string,
  edges: EdgeConfig[],
  nodes: NodeConfig[],
  context: ExecutionContext
): PredecessorValidationResult {
  const predecessorIds = getPredecessorIds(nodeId, edges)
  
  // 如果没有前置节点，验证通过
  if (predecessorIds.length === 0) {
    return {
      valid: true,
      missingPredecessors: [],
      failedPredecessors: [],
      skippedPredecessors: [],
    }
  }

  const missingPredecessors: string[] = []
  const failedPredecessors: string[] = []
  const skippedPredecessors: string[] = []

  for (const predId of predecessorIds) {
    const predNode = findNodeById(predId, nodes)
    const predOutput = context.nodeOutputs.get(predId)
    const predName = predNode?.name || predId

    if (!predOutput) {
      // 前置节点没有输出（未执行）
      missingPredecessors.push(predName)
    } else if (predOutput.status === 'error') {
      // 前置节点执行失败
      failedPredecessors.push(predName)
    } else if (predOutput.status === 'skipped') {
      // 前置节点被跳过
      skippedPredecessors.push(predName)
    }
    // status === 'success' 或 'paused' 视为有效
  }

  const valid = missingPredecessors.length === 0 && 
                failedPredecessors.length === 0 && 
                skippedPredecessors.length === 0

  return {
    valid,
    missingPredecessors,
    failedPredecessors,
    skippedPredecessors,
  }
}

// ============================================
// Variable Reference Validation
// ============================================

/**
 * 变量引用信息
 */
export interface VariableReferenceInfo {
  original: string
  nodeName: string
  fieldPath: string | null
}

/**
 * 变量引用验证结果
 */
export interface VariableValidationResult {
  valid: boolean
  unresolvedVariables: string[]
  details: Array<{
    variable: string
    reason: 'node_not_found' | 'field_not_found'
  }>
}

/**
 * 从文本中提取所有变量引用
 */
export function extractVariableReferences(text: string): VariableReferenceInfo[] {
  const references: VariableReferenceInfo[] = []

  // 匹配完整格式 {{节点名.字段名}}
  let match
  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    references.push({
      original: match[0],
      nodeName: match[1].trim(),
      fieldPath: match[2].trim(),
    })
  }

  // 匹配简化格式 {{节点名}}
  while ((match = SIMPLE_VARIABLE_PATTERN.exec(text)) !== null) {
    references.push({
      original: match[0],
      nodeName: match[1].trim(),
      fieldPath: null,
    })
  }

  return references
}

/**
 * 根据路径获取嵌套属性值
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

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
 * 根据节点名称或ID查找节点输出
 */
function findNodeOutputByNameOrId(
  nodeNameOrId: string,
  context: ExecutionContext
): NodeOutput | undefined {
  // 先按名称查找
  for (const [, output] of context.nodeOutputs) {
    if (output.nodeName === nodeNameOrId) {
      return output
    }
  }
  // 再按ID查找
  for (const [, output] of context.nodeOutputs) {
    if (output.nodeId === nodeNameOrId) {
      return output
    }
  }
  return undefined
}

/**
 * 验证变量引用是否可解析
 * 
 * 检查 PROCESS 节点的 userPrompt 和 systemPrompt 中的变量引用
 * 是否都能在执行上下文中找到对应的值。
 * 
 * @param text - 包含变量引用的文本
 * @param context - 执行上下文
 * @param nodes - 工作流所有节点配置
 * @returns 变量引用验证结果
 */
export function validateVariableReferences(
  text: string,
  context: ExecutionContext,
  nodes: NodeConfig[]
): VariableValidationResult {
  const references = extractVariableReferences(text)
  
  if (references.length === 0) {
    return {
      valid: true,
      unresolvedVariables: [],
      details: [],
    }
  }

  const unresolvedVariables: string[] = []
  const details: Array<{ variable: string; reason: 'node_not_found' | 'field_not_found' }> = []

  function hasResolvableField(data: Record<string, unknown>, fieldPath: string): boolean {
    // direct access
    const direct = fieldPath.includes('.')
      ? getNestedValue(data, fieldPath)
      : data[fieldPath]
    if (direct !== undefined) return true

    // aliases
    if (fieldPath === 'result' && data['结果'] !== undefined) return true
    if (fieldPath === '结果' && data['result'] !== undefined) return true

    // derived multimodal helpers
    if (fieldPath === 'imageUrls' || fieldPath === 'image_urls') {
      if (Array.isArray(data['imageUrls']) && (data['imageUrls'] as unknown[]).length > 0) return true
      if (Array.isArray(data['images']) && (data['images'] as unknown[]).length > 0) return true
    }
    if (fieldPath === 'videoUrls' || fieldPath === 'video_urls') {
      if (Array.isArray(data['videoUrls']) && (data['videoUrls'] as unknown[]).length > 0) return true
      if (Array.isArray(data['videos']) && (data['videos'] as unknown[]).length > 0) return true
    }

    return false
  }

  for (const ref of references) {
    // 查找节点输出
    const nodeOutput = findNodeOutputByNameOrId(ref.nodeName, context)
    
    // 也检查节点是否存在于配置中（可能还未执行）
    const nodeExists = nodes.some(n => n.name === ref.nodeName || n.id === ref.nodeName)

    if (!nodeOutput && !nodeExists) {
      // 节点不存在
      unresolvedVariables.push(ref.original)
      details.push({
        variable: ref.original,
        reason: 'node_not_found',
      })
      continue
    }

    // 如果节点存在但还没有输出，这是正常的（可能是前置节点还未执行）
    // 我们只在有输出时检查字段是否存在
    if (nodeOutput && ref.fieldPath) {
      if (!hasResolvableField(nodeOutput.data, ref.fieldPath)) {
        unresolvedVariables.push(ref.original)
        details.push({
          variable: ref.original,
          reason: 'field_not_found',
        })
      }
    }
  }

  return {
    valid: unresolvedVariables.length === 0,
    unresolvedVariables,
    details,
  }
}

// ============================================
// INPUT Node Field Validation
// ============================================

/**
 * INPUT 节点字段验证结果
 */
export interface InputFieldValidationResult {
  valid: boolean
  missingFields: string[]
}

/**
 * 验证 INPUT 节点的必填字段
 * 
 * 检查 INPUT 节点配置中标记为 required 的字段是否都有非空值。
 * 
 * @param node - INPUT 节点配置
 * @returns 字段验证结果
 */
export function validateInputNodeFields(node: NodeConfig): InputFieldValidationResult {
  // 只处理 INPUT 类型节点
  if (node.type !== 'INPUT') {
    return {
      valid: true,
      missingFields: [],
    }
  }

  const inputNode = node as InputNodeConfig
  const fields = inputNode.config?.fields || []
  const missingFields: string[] = []

  for (const field of fields) {
    // 检查是否是必填字段
    if (field.required) {
      // 检查值是否为空
      const value = field.value
      const isEmpty = value === undefined || 
                      value === null || 
                      (typeof value === 'string' && value.trim() === '')

      if (isEmpty) {
        missingFields.push(field.name || field.id)
      }
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  }
}

// ============================================
// Main Validation Function
// ============================================

/**
 * 验证节点输入
 * 
 * 根据节点类型执行相应的验证逻辑：
 * - INPUT 节点：验证必填字段
 * - PROCESS 节点：验证前置节点状态和变量引用
 * - 其他节点：验证前置节点状态
 * 
 * @param options - 验证选项
 * @returns 输入验证结果
 */
export function validateNodeInput(options: InputValidatorOptions): InputValidationResult {
  const { node, context, edges, nodes } = options

  // 1. INPUT 节点特殊处理
  if (node.type === 'INPUT') {
    const fieldResult = validateInputNodeFields(node)
    
    if (!fieldResult.valid) {
      return {
        status: 'missing',
        error: `必填字段 "${fieldResult.missingFields.join('", "')}" 为空`,
        details: {
          missingFields: fieldResult.missingFields,
        },
      }
    }

    return {
      status: 'valid',
    }
  }

  // 2. 验证前置节点状态
  const predecessorResult = validatePredecessors(node.id, edges, nodes, context)
  
  if (!predecessorResult.valid) {
    const errorMessages: string[] = []
    
    if (predecessorResult.failedPredecessors.length > 0) {
      errorMessages.push(`前置节点 "${predecessorResult.failedPredecessors.join('", "')}" 执行失败`)
    }
    if (predecessorResult.skippedPredecessors.length > 0) {
      errorMessages.push(`前置节点 "${predecessorResult.skippedPredecessors.join('", "')}" 被跳过`)
    }
    if (predecessorResult.missingPredecessors.length > 0) {
      errorMessages.push(`前置节点 "${predecessorResult.missingPredecessors.join('", "')}" 未执行`)
    }

    return {
      status: 'missing',
      error: errorMessages.join('; '),
      details: {
        missingPredecessors: [
          ...predecessorResult.missingPredecessors,
          ...predecessorResult.failedPredecessors,
          ...predecessorResult.skippedPredecessors,
        ],
      },
    }
  }

  // 3. PROCESS 节点额外验证变量引用
  // PROCESS_WITH_TOOLS 与 PROCESS 使用同一套 prompt 字段，也应参与变量校验
  if (node.type === 'PROCESS' || (node as unknown as { type?: string }).type === 'PROCESS_WITH_TOOLS') {
    const processNode = node as ProcessNodeConfig
    // 对于 PROCESS_WITH_TOOLS，类型断言依旧可用（两者 config 结构兼容 userPrompt/systemPrompt）
    const userPrompt = processNode.config?.userPrompt || ''
    const systemPrompt = processNode.config?.systemPrompt || ''
    const combinedText = `${userPrompt}\n${systemPrompt}`

    const variableResult = validateVariableReferences(combinedText, context, nodes)
    
    if (!variableResult.valid) {
      const errorDetails = variableResult.details.map(d => {
        if (d.reason === 'node_not_found') {
          return `变量引用 "${d.variable}" 无法解析：节点不存在`
        } else {
          return `变量引用 "${d.variable}" 无法解析：字段不存在`
        }
      })

      return {
        status: 'invalid',
        error: errorDetails.join('; '),
        details: {
          unresolvedVariables: variableResult.unresolvedVariables,
        },
      }
    }
  }

  // 4. 所有验证通过
  return {
    status: 'valid',
  }
}
