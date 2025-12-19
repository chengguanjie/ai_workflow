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
 * 获取条件节点的下游节点
 * @param nodeId 条件节点ID
 * @param edges 所有边
 * @param branch 分支类型 'true' 或 'false'
 */
export function getConditionBranchNodes(
  nodeId: string,
  edges: EdgeConfig[],
  branch: 'true' | 'false'
): string[] {
  return edges
    .filter(e => e.source === nodeId && e.sourceHandle === branch)
    .map(e => e.target)
}

/**
 * 获取所有可达节点（从指定节点开始）
 */
export function getReachableNodes(
  startNodeIds: string[],
  edges: EdgeConfig[],
  allNodes: NodeConfig[]
): Set<string> {
  const reachable = new Set<string>()
  const queue = [...startNodeIds]
  
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (reachable.has(nodeId)) continue
    reachable.add(nodeId)
    
    const outgoingEdges = edges.filter(e => e.source === nodeId)
    for (const edge of outgoingEdges) {
      if (!reachable.has(edge.target)) {
        queue.push(edge.target)
      }
    }
  }
  
  return reachable
}

/**
 * 判断节点是否为条件节点
 */
export function isConditionNode(node: NodeConfig): boolean {
  return node.type === 'CONDITION'
}

/**
 * 判断节点是否为循环节点
 */
export function isLoopNode(node: NodeConfig): boolean {
  return node.type === 'LOOP'
}

/**
 * 获取循环节点的循环体节点
 * 循环体节点是通过 sourceHandle='body' 连接的直接下游节点
 * 及其所有后续节点（直到遇到循环汇合点）
 */
export function getLoopBodyNodes(
  loopNodeId: string,
  edges: EdgeConfig[],
  allNodes: NodeConfig[]
): string[] {
  const bodyStartEdges = edges.filter(
    e => e.source === loopNodeId && e.sourceHandle === 'body'
  )
  
  if (bodyStartEdges.length === 0) {
    return []
  }
  
  const loopEndEdges = edges.filter(
    e => e.source === loopNodeId && e.sourceHandle === 'done'
  )
  const loopEndTargets = new Set(loopEndEdges.map(e => e.target))
  
  const bodyNodes: string[] = []
  const visited = new Set<string>()
  const queue = bodyStartEdges.map(e => e.target)
  
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId) || loopEndTargets.has(nodeId)) continue
    visited.add(nodeId)
    bodyNodes.push(nodeId)
    
    const outgoing = edges.filter(e => e.source === nodeId)
    for (const edge of outgoing) {
      if (!visited.has(edge.target) && edge.target !== loopNodeId) {
        queue.push(edge.target)
      }
    }
  }
  
  return bodyNodes
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
