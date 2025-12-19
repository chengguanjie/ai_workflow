/**
 * 节点处理器索引
 */

import type { NodeProcessor } from '../types'
import { inputNodeProcessor } from './input'
import { processNodeProcessor } from './process'
import { codeNodeProcessor } from './code'
import { outputNodeProcessor } from './output'
import { dataNodeProcessor } from './data'
import { imageNodeProcessor } from './image'
import { videoNodeProcessor } from './video'
import { audioNodeProcessor } from './audio'
import { processConditionNode } from './condition'

// 注册所有处理器
const processors: Map<string, NodeProcessor> = new Map()

// 基础节点
processors.set('INPUT', inputNodeProcessor)
processors.set('PROCESS', processNodeProcessor)
processors.set('CODE', codeNodeProcessor)
processors.set('OUTPUT', outputNodeProcessor)

// 控制流节点
processors.set('CONDITION', processConditionNode)

// 媒体节点
processors.set('DATA', dataNodeProcessor)
processors.set('IMAGE', imageNodeProcessor)
processors.set('VIDEO', videoNodeProcessor)
processors.set('AUDIO', audioNodeProcessor)

/**
 * 获取节点处理器
 */
export function getProcessor(nodeType: string): NodeProcessor | undefined {
  return processors.get(nodeType)
}

/**
 * 获取所有已注册的处理器类型
 */
export function getRegisteredProcessorTypes(): string[] {
  return Array.from(processors.keys())
}

export {
  inputNodeProcessor,
  processNodeProcessor,
  codeNodeProcessor,
  outputNodeProcessor,
  dataNodeProcessor,
  imageNodeProcessor,
  videoNodeProcessor,
  audioNodeProcessor,
  processConditionNode,
}
