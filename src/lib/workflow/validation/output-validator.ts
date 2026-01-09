/**
 * 输出验证器
 * 
 * 提供节点执行后的输出验证功能：
 * - 类型匹配验证
 * - 内容完整性检查
 * - 空值检查
 */

import type { NodeConfig, ProcessNodeConfig } from '@/types/workflow'
import type { OutputType } from '../debug-panel/types'
import type { OutputValidationResult, OutputValidatorOptions } from './types'
import { getValidator } from './type-validators'
import { isOutputComplete } from './completeness-checker'

// ============================================
// Helper Functions
// ============================================

/**
 * 从节点输出中提取主要内容
 * 
 * 节点输出可能包含多个字段，我们需要找到主要的输出内容。
 * 优先级：result > output > content > text > 第一个字符串字段
 */
function extractMainContent(output: Record<string, unknown>): string | null {
  // 优先检查常见的输出字段名
  const priorityFields = ['result', 'output', 'content', 'text', 'response', 'data']
  
  for (const field of priorityFields) {
    if (field in output) {
      const value = output[field]
      if (typeof value === 'string') {
        return value
      }
      if (value !== null && value !== undefined) {
        // 尝试将对象转换为 JSON 字符串
        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      }
    }
  }
  
  // 如果没有找到优先字段，查找第一个字符串字段
  for (const [, value] of Object.entries(output)) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value
    }
  }
  
  // 如果没有字符串字段，尝试将整个输出转换为 JSON
  if (Object.keys(output).length > 0) {
    try {
      return JSON.stringify(output)
    } catch {
      return null
    }
  }
  
  return null
}

/**
 * 检查输出是否为空
 */
function isOutputEmpty(output: Record<string, unknown>): boolean {
  if (!output || typeof output !== 'object') {
    return true
  }
  
  const keys = Object.keys(output)
  if (keys.length === 0) {
    return true
  }
  
  // 检查所有值是否都为空
  for (const key of keys) {
    const value = output[key]
    if (value !== null && value !== undefined && value !== '') {
      if (typeof value === 'string' && value.trim() === '') {
        continue
      }
      return false
    }
  }
  
  return true
}

/**
 * 从节点配置中获取期望的输出类型
 */
function getExpectedOutputType(nodeConfig: NodeConfig): OutputType | undefined {
  if (nodeConfig.type === 'PROCESS') {
    const processConfig = nodeConfig as ProcessNodeConfig
    return processConfig.config?.expectedOutputType as OutputType | undefined
  }
  return undefined
}

// ============================================
// Main Validation Function
// ============================================

/**
 * 验证节点输出
 * 
 * 执行以下验证：
 * 1. 空值检查：输出是否为空
 * 2. 类型匹配：输出是否符合期望的类型格式
 * 3. 完整性检查：输出是否被截断
 * 
 * @param options - 验证选项
 * @returns 输出验证结果
 */
export function validateNodeOutput(options: OutputValidatorOptions): OutputValidationResult {
  const { nodeConfig, output, expectedOutputType } = options
  
  // 1. 空值检查
  if (isOutputEmpty(output)) {
    return {
      status: 'empty',
      error: '节点输出为空',
    }
  }
  
  // 获取期望的输出类型
  const outputType = expectedOutputType || getExpectedOutputType(nodeConfig)
  
  // 提取主要内容
  const content = extractMainContent(output)
  
  if (content === null || content.trim() === '') {
    return {
      status: 'empty',
      error: '节点输出内容为空',
    }
  }
  
  // 2. 类型匹配验证（如果指定了期望类型）
  if (outputType) {
    const validator = getValidator(outputType)
    
    if (validator) {
      const typeResult = validator.validate(content)
      
      if (!typeResult.valid) {
        return {
          status: 'invalid',
          error: typeResult.error || `输出不符合期望的 ${outputType} 格式`,
          details: {
            expectedType: outputType,
            formatErrors: typeResult.error ? [typeResult.error] : undefined,
          },
        }
      }
    }
    
    // 3. 完整性检查
    const completenessResult = isOutputComplete(content, outputType)
    
    if (!completenessResult.complete) {
      return {
        status: 'incomplete',
        error: `输出可能被截断: ${completenessResult.reason}`,
        details: {
          expectedType: outputType,
          truncationDetected: true,
        },
      }
    }
  } else {
    // 没有指定类型时，只做基本的完整性检查
    const completenessResult = isOutputComplete(content)
    
    if (!completenessResult.complete) {
      return {
        status: 'incomplete',
        error: `输出可能被截断: ${completenessResult.reason}`,
        details: {
          truncationDetected: true,
        },
      }
    }
  }
  
  // 4. 所有验证通过
  return {
    status: 'valid',
    details: {
      expectedType: outputType,
    },
  }
}

/**
 * 简化的输出有效性检查（兼容旧接口）
 * 
 * 这个函数提供与旧的 isOutputValid 函数相同的接口，
 * 但内部使用新的验证逻辑。
 * 
 * @param output - 节点输出
 * @returns 输出是否有效
 */
export function isOutputValid(output: Record<string, unknown>): boolean {
  return !isOutputEmpty(output)
}
