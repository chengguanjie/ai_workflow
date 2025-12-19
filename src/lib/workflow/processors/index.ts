/**
 * 节点处理器索引
 */

import type { NodeProcessor } from '../types'
import { triggerNodeProcessor } from './trigger'
import { inputNodeProcessor } from './input'
import { processNodeProcessor } from './process'
import { codeNodeProcessor } from './code'
import { outputNodeProcessor } from './output'
import { dataNodeProcessor } from './data'
import { imageNodeProcessor } from './image'
import { videoNodeProcessor } from './video'
import { audioNodeProcessor } from './audio'
import { conditionNodeProcessor, processConditionNode } from './condition'
import { loopNodeProcessor, processLoopNode } from './loop'
import { switchNodeProcessor, processSwitchNode } from './switch'
import { httpNodeProcessor, processHttpNode } from './http'
import { mergeNodeProcessor } from './merge'
import { imageGenNodeProcessor } from './image-gen'
import { notificationNodeProcessor } from './notification'

// 注册所有处理器
const processors: Map<string, NodeProcessor> = new Map()

// 触发器节点
processors.set('TRIGGER', triggerNodeProcessor)

// 基础节点
processors.set('INPUT', inputNodeProcessor)
processors.set('PROCESS', processNodeProcessor)
processors.set('CODE', codeNodeProcessor)
processors.set('OUTPUT', outputNodeProcessor)

// 控制流节点
processors.set('CONDITION', conditionNodeProcessor)
processors.set('LOOP', loopNodeProcessor)
processors.set('SWITCH', switchNodeProcessor)
processors.set('MERGE', mergeNodeProcessor)

// HTTP 节点
processors.set('HTTP', httpNodeProcessor)

// 媒体节点
processors.set('DATA', dataNodeProcessor)
processors.set('IMAGE', imageNodeProcessor)
processors.set('VIDEO', videoNodeProcessor)
processors.set('AUDIO', audioNodeProcessor)

// AI 生成节点
processors.set('IMAGE_GEN', imageGenNodeProcessor)

// 通知节点
processors.set('NOTIFICATION', notificationNodeProcessor)

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
  triggerNodeProcessor,
  inputNodeProcessor,
  processNodeProcessor,
  codeNodeProcessor,
  outputNodeProcessor,
  dataNodeProcessor,
  imageNodeProcessor,
  videoNodeProcessor,
  audioNodeProcessor,
  conditionNodeProcessor,
  processConditionNode,
  loopNodeProcessor,
  processLoopNode,
  switchNodeProcessor,
  processSwitchNode,
  httpNodeProcessor,
  processHttpNode,
  mergeNodeProcessor,
  imageGenNodeProcessor,
  notificationNodeProcessor,
}
