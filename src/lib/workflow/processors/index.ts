/**
 * 节点处理器索引
 */

import type { NodeProcessor } from '../types'
import { triggerNodeProcessor } from './trigger'
import { inputNodeProcessor } from './input'
import { processNodeProcessor } from './process'
import { codeNodeProcessor } from './code'
import { codeNodeProcessorV2, isTaskRunnerEnabled, setTaskRunnerEnabled, initializeTaskRunner } from './code-v2'
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
import { groupNodeProcessor } from './group'
import {
  approvalNodeProcessor,
  processApprovalDecision,
  resumeApprovalNode,
  handleApprovalTimeout,
} from './approval'

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

// 分组节点
processors.set('GROUP', groupNodeProcessor)

// 审批节点 (Human-in-the-Loop)
processors.set('APPROVAL', approvalNodeProcessor)

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

/**
 * 获取代码节点处理器
 * 根据 Task Runner 是否启用返回对应版本
 */
export function getCodeProcessor(): NodeProcessor {
  return isTaskRunnerEnabled() ? codeNodeProcessorV2 : codeNodeProcessor
}

export {
  triggerNodeProcessor,
  inputNodeProcessor,
  processNodeProcessor,
  codeNodeProcessor,
  codeNodeProcessorV2,
  isTaskRunnerEnabled,
  setTaskRunnerEnabled,
  initializeTaskRunner,
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
  groupNodeProcessor,
  approvalNodeProcessor,
  processApprovalDecision,
  resumeApprovalNode,
  handleApprovalTimeout,
}
