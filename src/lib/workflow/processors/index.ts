/**
 * 节点处理器索引
 * 
 * 简化版本：只支持 INPUT 和 PROCESS 两种节点类型
 */

import type { NodeProcessor } from '../types'
import { inputNodeProcessor } from './input'
import { processNodeProcessor } from './process'
import { processWithToolsNodeProcessor } from './process-with-tools'

const processors: Map<string, NodeProcessor> = new Map()

processors.set('INPUT', inputNodeProcessor)
processors.set('PROCESS', processNodeProcessor)
processors.set('PROCESS_WITH_TOOLS', processWithToolsNodeProcessor)

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
}
