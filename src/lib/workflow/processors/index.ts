/**
 * 节点处理器索引
 *
 * 说明：
 * - `PROCESS` 在启用工具调用时会在执行器层自动切换为 `PROCESS_WITH_TOOLS`
 * - `MERGE` 为历史兼容类型，当前走 `LOGIC` 处理器的 merge 模式
 */

import type { NodeProcessor } from '../types'
import { inputNodeProcessor } from './input'
import { processNodeProcessor } from './process'
import { processWithToolsNodeProcessor } from './process-with-tools'
import { codeNodeProcessor } from './code'
import { outputNodeProcessor } from './output'
import { logicNodeProcessor } from './logic'
import { groupNodeProcessor } from './group'

const processors: Map<string, NodeProcessor> = new Map()

processors.set('INPUT', inputNodeProcessor)
processors.set('PROCESS', processNodeProcessor)
processors.set('PROCESS_WITH_TOOLS', processWithToolsNodeProcessor)
processors.set('CODE', codeNodeProcessor)
processors.set('OUTPUT', outputNodeProcessor)
processors.set('LOGIC', logicNodeProcessor)
processors.set('GROUP', groupNodeProcessor)
// MERGE 类型使用 logic 处理器的 merge 模式
processors.set('MERGE', logicNodeProcessor)

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
  groupNodeProcessor,
}
