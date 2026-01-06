/**
 * 模型配置验证工具函数
 * 
 * 用于验证和修复节点配置中的模型设置，确保 PROCESS 节点使用正确的文本模型
 */

import { getModelModality, SHENSUAN_DEFAULT_MODELS } from '@/lib/ai/types'
import type { ModelModality } from '@/lib/ai/types'

/**
 * 验证并修复模型配置的结果
 */
export interface ValidateModelConfigResult {
  config: Record<string, unknown>
  wasFixed: boolean
  originalModel?: string
}

/**
 * 验证并修复模型配置
 * 检测非文本模型（如 video-gen, image-gen 等）并自动替换为默认文本模型
 * 
 * @param config - 节点配置对象
 * @returns 修复后的配置对象（如果需要修复）或原配置
 */
export function validateAndFixModelConfig(config: Record<string, unknown>): ValidateModelConfigResult {
  const model = config.model as string | undefined
  
  if (!model) {
    return { config, wasFixed: false }
  }
  
  const modality = getModelModality(model)
  
  // 检测非文本模型（video-gen, image-gen, audio-tts 等）
  // 这些模型不适合用于 PROCESS 节点的文本处理任务
  if (modality && modality !== 'text' && modality !== 'code') {
    return {
      config: {
        ...config,
        model: SHENSUAN_DEFAULT_MODELS.text,
        modality: 'text' as ModelModality,
      },
      wasFixed: true,
      originalModel: model,
    }
  }
  
  return { config, wasFixed: false }
}

/**
 * 检查模型是否为非文本模型
 * 
 * @param model - 模型ID
 * @returns 如果是非文本模型返回 true
 */
export function isNonTextModel(model: string): boolean {
  const modality = getModelModality(model)
  return modality !== null && modality !== 'text' && modality !== 'code'
}

/**
 * 获取模型的模态类型（重新导出以便测试）
 */
export { getModelModality, SHENSUAN_DEFAULT_MODELS }
