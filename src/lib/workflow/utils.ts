/**
 * 工作流执行工具函数
 */

import type { ExecutionContext, VariableReference } from './types'
import type { NodeConfig, EdgeConfig } from '@/types/workflow'

/**
 * 变量引用正则表达式
 * 匹配 {{节点名.字段名}} 格式
 */
const VARIABLE_PATTERN = /\{\{([^.}]+)\.([^}]+)\}\}/g

/**
 * 解析文本中的变量引用
 */
export function parseVariableReferences(text: string): VariableReference[] {
  const references: VariableReference[] = []
  let match

  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    references.push({
      original: match[0],
      nodeName: match[1].trim(),
      fieldName: match[2].trim(),
    })
  }

  // 重置正则表达式状态
  VARIABLE_PATTERN.lastIndex = 0

  return references
}

/**
 * 替换文本中的变量引用
 */
export function replaceVariables(
  text: string,
  context: ExecutionContext
): string {
  return text.replace(VARIABLE_PATTERN, (match, nodeName, fieldName) => {
    const nodeOutput = findNodeOutputByName(nodeName.trim(), context)

    if (!nodeOutput) {
      console.warn(`Variable reference not found: ${match}`)
      return match // 保持原样
    }

    const value = nodeOutput.data[fieldName.trim()]

    if (value === undefined || value === null) {
      console.warn(`Field not found in node output: ${match}`)
      return ''
    }

    // 将值转换为字符串
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }

    return String(value)
  })
}

/**
 * 根据节点名称查找节点输出
 */
export function findNodeOutputByName(
  nodeName: string,
  context: ExecutionContext
): { data: Record<string, unknown> } | undefined {
  for (const [, output] of context.nodeOutputs) {
    if (output.nodeName === nodeName) {
      return output
    }
  }
  return undefined
}

/**
 * 替换文件名中的变量
 * 支持特殊变量：{{日期}}, {{时间}}, {{时间戳}}
 */
export function replaceFileNameVariables(
  fileName: string,
  context: ExecutionContext
): string {
  const now = new Date()

  // 替换内置变量
  let result = fileName
    .replace(/\{\{日期\}\}/g, formatDate(now))
    .replace(/\{\{时间\}\}/g, formatTime(now))
    .replace(/\{\{时间戳\}\}/g, String(Date.now()))
    .replace(/\{\{执行ID\}\}/g, context.executionId.slice(0, 8))

  // 替换节点引用变量
  result = replaceVariables(result, context)

  // 清理文件名中的非法字符
  return sanitizeFileName(result)
}

/**
 * 格式化日期 YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 格式化时间 HH-mm-ss
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}-${minutes}-${seconds}`
}

/**
 * 清理文件名中的非法字符
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
}

/**
 * 根据拓扑排序获取节点执行顺序
 */
export function getExecutionOrder(
  nodes: NodeConfig[],
  edges: EdgeConfig[]
): NodeConfig[] {
  // 构建邻接表和入度表
  const adjList = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  // 初始化
  for (const node of nodes) {
    adjList.set(node.id, [])
    inDegree.set(node.id, 0)
  }

  // 构建图
  for (const edge of edges) {
    const targets = adjList.get(edge.source) || []
    targets.push(edge.target)
    adjList.set(edge.source, targets)

    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
  }

  // 拓扑排序（Kahn's algorithm）
  const queue: string[] = []
  const result: NodeConfig[] = []

  // 将入度为 0 的节点加入队列
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId)
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    const node = nodes.find((n) => n.id === nodeId)

    if (node) {
      result.push(node)
    }

    // 减少相邻节点的入度
    const neighbors = adjList.get(nodeId) || []
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)

      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  // 检查是否有环
  if (result.length !== nodes.length) {
    throw new Error('工作流中存在循环依赖')
  }

  return result
}

/**
 * 获取节点的所有前置节点输出
 */
export function getPredecessorOutputs(
  nodeId: string,
  edges: EdgeConfig[],
  context: ExecutionContext
): Record<string, unknown> {
  const predecessorIds = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source)

  const outputs: Record<string, unknown> = {}

  for (const predId of predecessorIds) {
    const output = context.nodeOutputs.get(predId)
    if (output && output.status === 'success') {
      outputs[output.nodeName] = output.data
    }
  }

  return outputs
}
