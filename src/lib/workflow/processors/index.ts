/**
 * 节点处理器索引
 * 
 * 简化版本：主要支持 INPUT/PROCESS/CODE（其他类型会被跳过）
 */

import type { NodeProcessor } from '../types'
import { inputNodeProcessor } from './input'
import { processNodeProcessor } from './process'
import { processWithToolsNodeProcessor } from './process-with-tools'
import { codeNodeProcessor } from './code'
import { outputNodeProcessor } from './output'
import { logicNodeProcessor } from './logic'

const processors: Map<string, NodeProcessor> = new Map()

processors.set('INPUT', inputNodeProcessor)
processors.set('PROCESS', processNodeProcessor)
processors.set('PROCESS_WITH_TOOLS', processWithToolsNodeProcessor)
processors.set('CODE', codeNodeProcessor)
processors.set('OUTPUT', outputNodeProcessor)
processors.set('LOGIC', logicNodeProcessor)

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
  processWithToolsNodeProcessor,
  codeNodeProcessor,
  outputNodeProcessor,
}
