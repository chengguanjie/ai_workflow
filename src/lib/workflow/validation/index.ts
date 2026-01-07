/**
 * 工作流节点输入/输出验证模块
 * 
 * 提供节点执行前的输入验证和执行后的输出验证功能。
 * 
 * 主要功能：
 * - 输入验证：前置节点状态、变量引用、必填字段
 * - 输出验证：类型匹配、内容完整性
 */

// 导出所有类型
export type {
  // Input validation types
  InputStatus,
  InputValidationResult,
  InputValidatorOptions,
  // Output validation types
  OutputValidationStatus,
  OutputValidationResult,
  OutputValidatorOptions,
  // Type validator types
  TypeValidationResult,
  TypeValidator,
  // Completeness types
  CompletenessResult,
} from './types'

// 输入验证函数
export {
  validateNodeInput,
  validatePredecessors,
  validateVariableReferences,
  validateInputNodeFields,
  extractVariableReferences,
} from './input-validator'

// 输入验证相关类型
export type {
  PredecessorValidationResult,
  VariableReferenceInfo,
  VariableValidationResult,
  InputFieldValidationResult,
} from './input-validator'

// 输出验证函数
export {
  validateNodeOutput,
  isOutputValid,
} from './output-validator'

// 完整性检查函数
export {
  isOutputComplete,
} from './completeness-checker'

// 类型验证器
export {
  jsonValidator,
  htmlValidator,
  csvValidator,
  registerValidator,
  getValidator,
} from './type-validators'

// 提示词契约校验（按提示词推断输出类型/字段）
export {
  inferExpectedType,
  extractExpectedJsonKeys,
  getPromptContract,
  validateNodeOutputAgainstPrompt,
  validateWorkflowOutputsAgainstPrompts,
  fixInputVariableReferences,
  fixExpectedOutputTypesFromPrompts,
} from './prompt-contract'

export type {
  PromptExpectedType,
  PromptContract,
  PromptViolation,
} from './prompt-contract'
