/**
 * 工作流节点输入/输出验证类型定义
 * 
 * 提供输入验证和输出验证的类型接口，用于在节点执行前后
 * 验证数据的有效性、完整性和类型匹配性。
 */

import type { NodeConfig, EdgeConfig } from '@/types/workflow'
import type { ExecutionContext } from '../types'
import type { OutputType } from '../debug-panel/types'

// ============================================
// Input Validation Types
// ============================================

/**
 * 输入状态类型
 */
export type InputStatus = 'valid' | 'invalid' | 'missing'

/**
 * 输入验证结果
 */
export interface InputValidationResult {
  /** 验证状态 */
  status: InputStatus
  /** 错误信息（当状态不是 'valid' 时） */
  error?: string
  /** 详细信息 */
  details?: {
    /** 缺失的前置节点名称列表 */
    missingPredecessors?: string[]
    /** 无法解析的变量引用列表 */
    unresolvedVariables?: string[]
    /** 缺失值的必填字段列表 */
    missingFields?: string[]
  }
}

/**
 * 输入验证器选项
 */
export interface InputValidatorOptions {
  /** 当前节点配置 */
  node: NodeConfig
  /** 执行上下文 */
  context: ExecutionContext
  /** 工作流边配置 */
  edges: EdgeConfig[]
  /** 工作流所有节点配置 */
  nodes: NodeConfig[]
}

// ============================================
// Output Validation Types
// ============================================

/**
 * 输出状态类型
 * - valid: 输出有效
 * - empty: 输出为空
 * - invalid: 输出格式/类型不匹配
 * - incomplete: 输出被截断或不完整
 */
export type OutputValidationStatus = 'valid' | 'empty' | 'invalid' | 'incomplete'

/**
 * 输出验证结果
 */
export interface OutputValidationResult {
  /** 验证状态 */
  status: OutputValidationStatus
  /** 错误信息（当状态不是 'valid' 时） */
  error?: string
  /** 详细信息 */
  details?: {
    /** 期望的输出类型 */
    expectedType?: OutputType
    /** 实际检测到的输出类型 */
    actualType?: OutputType
    /** 是否检测到截断 */
    truncationDetected?: boolean
    /** 格式错误列表 */
    formatErrors?: string[]
  }
}

/**
 * 输出验证器选项
 */
export interface OutputValidatorOptions {
  /** 节点配置 */
  nodeConfig: NodeConfig
  /** 节点输出数据 */
  output: Record<string, unknown>
  /** 期望的输出类型（可选） */
  expectedOutputType?: OutputType
}

// ============================================
// Type Validator Types
// ============================================

/**
 * 类型验证结果
 */
export interface TypeValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 错误信息（当无效时） */
  error?: string
}

/**
 * 类型验证器接口
 */
export interface TypeValidator {
  /** 验证器对应的输出类型 */
  type: OutputType
  /** 验证函数 */
  validate(content: string): TypeValidationResult
}

// ============================================
// Completeness Checker Types
// ============================================

/**
 * 完整性检查结果
 */
export interface CompletenessResult {
  /** 内容是否完整 */
  complete: boolean
  /** 不完整的原因 */
  reason?: string
  /** 检测到的截断模式 */
  truncationPattern?: string
}
