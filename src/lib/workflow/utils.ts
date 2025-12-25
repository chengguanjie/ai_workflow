/**
 * 工作流执行工具函数
 */

import type { ExecutionContext, VariableReference } from './types'
import type { NodeConfig, EdgeConfig } from '@/types/workflow'

/**
 * 变量引用正则表达式
 * 匹配 {{节点名.字段名}} 或 {{节点名.字段名.子字段.更深层级}} 格式
 */
const VARIABLE_PATTERN = /\{\{([^.}]+)\.([^}]+)\}\}/g

/**
 * 根据路径获取嵌套属性值
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

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

  VARIABLE_PATTERN.lastIndex = 0

  return references
}

/**
 * 替换文本中的变量引用
 * 支持嵌套属性访问，如 {{节点名.字段.子字段}}
 */
export function replaceVariables(
  text: string,
  context: ExecutionContext
): string {
  return text.replace(VARIABLE_PATTERN, (match, nodeName, fieldPath) => {
    const nodeOutput = findNodeOutputByName(nodeName.trim(), context)

    if (!nodeOutput) {
      console.warn(`Variable reference not found: ${match}`)
      return match
    }

    const trimmedPath = fieldPath.trim()
    let value: unknown

    if (trimmedPath.includes('.')) {
      value = getNestedValue(nodeOutput.data, trimmedPath)
    } else {
      value = nodeOutput.data[trimmedPath]
    }

    if (value === undefined || value === null) {
      console.warn(`Field not found in node output: ${match}`)
      return ''
    }

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
  _allNodes: NodeConfig[]
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

// ============================================
// Parallel Execution Utilities
// ============================================

/**
 * 并行执行层
 * 同一层的节点可以并行执行，不同层按顺序执行
 */
export interface ExecutionLayer {
  /** 层级索引 (0-based) */
  level: number
  /** 该层的节点列表 */
  nodes: NodeConfig[]
}

/**
 * 获取可并行执行的节点分层
 * 使用改进的 Kahn's algorithm，将同一批入度为0的节点放在同一层
 * 
 * @param nodes - 所有节点
 * @param edges - 所有边
 * @returns 按执行顺序排列的层级数组
 */
export function getParallelExecutionLayers(
  nodes: NodeConfig[],
  edges: EdgeConfig[]
): ExecutionLayer[] {
  const adjList = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const nodeMap = new Map<string, NodeConfig>()

  for (const node of nodes) {
    adjList.set(node.id, [])
    inDegree.set(node.id, 0)
    nodeMap.set(node.id, node)
  }

  for (const edge of edges) {
    const targets = adjList.get(edge.source) || []
    targets.push(edge.target)
    adjList.set(edge.source, targets)
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
  }

  const layers: ExecutionLayer[] = []
  let currentLevel = 0

  let currentQueue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      currentQueue.push(nodeId)
    }
  }

  while (currentQueue.length > 0) {
    const layerNodes: NodeConfig[] = []
    const nextQueue: string[] = []

    for (const nodeId of currentQueue) {
      const node = nodeMap.get(nodeId)
      if (node) {
        layerNodes.push(node)
      }

      const neighbors = adjList.get(nodeId) || []
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1
        inDegree.set(neighbor, newDegree)

        if (newDegree === 0) {
          nextQueue.push(neighbor)
        }
      }
    }

    if (layerNodes.length > 0) {
      layers.push({
        level: currentLevel,
        nodes: layerNodes,
      })
      currentLevel++
    }

    currentQueue = nextQueue
  }

  const totalProcessed = layers.reduce((sum, layer) => sum + layer.nodes.length, 0)
  if (totalProcessed !== nodes.length) {
    throw new Error('工作流中存在循环依赖')
  }

  return layers
}

/**
 * 检查节点是否可以执行（所有前置节点都已完成）
 */
export function canNodeExecute(
  nodeId: string,
  edges: EdgeConfig[],
  completedNodes: Set<string>,
  skippedNodes: Set<string>
): boolean {
  const predecessors = edges
    .filter(e => e.target === nodeId)
    .map(e => e.source)

  if (predecessors.length === 0) {
    return true
  }

  return predecessors.every(
    predId => completedNodes.has(predId) || skippedNodes.has(predId)
  )
}

/**
 * 获取节点的所有前置节点ID
 */
export function getPredecessorIds(
  nodeId: string,
  edges: EdgeConfig[]
): string[] {
  return edges
    .filter(e => e.target === nodeId)
    .map(e => e.source)
}

/**
 * 获取节点的所有后继节点ID
 */
export function getSuccessorIds(
  nodeId: string,
  edges: EdgeConfig[]
): string[] {
  return edges
    .filter(e => e.source === nodeId)
    .map(e => e.target)
}

/**
 * 检查节点是否是合并节点（有多个入边）
 */
export function isMergeNode(
  nodeId: string,
  edges: EdgeConfig[]
): boolean {
  const incomingEdges = edges.filter(e => e.target === nodeId)
  return incomingEdges.length > 1
}

/**
 * 检查节点是否是分叉节点（有多个出边）
 */
export function isForkNode(
  nodeId: string,
  edges: EdgeConfig[]
): boolean {
  const outgoingEdges = edges.filter(e => e.source === nodeId)
  return outgoingEdges.length > 1
}

// ============================================
// Multimodal Content Utilities
// ============================================

import type { ContentPart } from '@/lib/ai/types'

/**
 * 将变量值转换为多模态内容部分
 */
function convertValueToContentParts(value: unknown): ContentPart[] {
  if (!value) return []

  // 1. 处理数组 (例如多选图片、Image节点的输出)
  if (Array.isArray(value)) {
    return value.flatMap(convertValueToContentParts)
  }

  // 2. 处理对象
  if (typeof value === 'object') {
    const val = value as Record<string, any>

    // 2.1 检查是否是 ImageInfo / AudioInfo / VideoInfo (来自 Image/Audio/Video 节点)
    if (val.url) {
      // 尝试推断类型
      const mimeType = val.type || val.mimeType || detectMimeType(val.url) || ''
      const format = val.format || detectFormat(val.url)

      // 图片
      if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(format)) {
        return [{
          type: 'image_url',
          image_url: { url: val.url, detail: 'auto' }
        }]
      }

      // 音频 
      // 注意: 音频通常需要 base64 数据 (input_audio)，但部分模型可能支持 URL (暂不支持)
      // 如果对象中有 content/base64 ? 目前 ImageNode/AudioNode 没有返回 base64。
      // 对于 AudioNode，它返回了 url。
      // 这里的处理比较棘手，标准的 ContentPart for audio 需要 base64。
      // 暂时如果遇到 audio 只能忽略或当作文本，除非模型支持 video_url 泛化。
      // 为简单起见，如果检测到 visual 模型支持的 URL (图片/视频)，则转换。

      // 视频
      if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi'].includes(format)) {
        return [{
          type: 'video_url',
          video_url: { url: val.url }
        }]
      }
    }

    // 2.2 特殊处理 InputNode 的 file 结构
    // { value, file: { url, mimeType }, url }
    if (val.file && val.file.url) {
      return convertValueToContentParts(val.file)
    }
  }

  // 3. 默认转换为文本
  let textVal = ''
  if (typeof value === 'object') {
    textVal = JSON.stringify(value, null, 2)
  } else {
    textVal = String(value)
  }

  return [{ type: 'text', text: textVal }]
}

/**
 * 简单的 MIME 检测
 */
function detectMimeType(url: string): string | null {
  const ext = url.split('.').pop()?.toLowerCase()
  if (!ext) return null
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
  if (['mp4', 'webm'].includes(ext)) return `video/${ext}`
  if (['mp3', 'wav', 'ogg'].includes(ext)) return `audio/${ext}`
  return null
}

function detectFormat(url: string): string {
  return url.split('.').pop()?.toLowerCase() || ''
}

/**
 * 合并相邻的文本 ContentPart
 */
function mergeTextParts(parts: ContentPart[]): ContentPart[] {
  const result: ContentPart[] = []
  let currentText = ''

  for (const part of parts) {
    if (part.type === 'text') {
      currentText += part.text
    } else {
      if (currentText) {
        result.push({ type: 'text', text: currentText })
        currentText = ''
      }
      result.push(part)
    }
  }

  if (currentText) {
    result.push({ type: 'text', text: currentText })
  }

  return result
}

/**
 * 解析文本并生成多模态内容部分 (ProcessNode使用)
 */
export function createContentPartsFromText(
  text: string,
  context: ExecutionContext
): ContentPart[] {
  const parts: ContentPart[] = []
  let lastIndex = 0
  let match

  // 重置正则索引
  VARIABLE_PATTERN.lastIndex = 0

  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    // 1. 添加前导文本
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }

    // 2. 解析变量
    const nodeName = match[1].trim()
    const fieldPath = match[2].trim()
    const nodeOutput = findNodeOutputByName(nodeName, context)
    let value: unknown

    if (nodeOutput) {
      if (fieldPath.includes('.')) {
        value = getNestedValue(nodeOutput.data, fieldPath)
      } else {
        value = nodeOutput.data[fieldPath]
      }
    } else {
      console.warn(`Variable reference not found in createContentParts: ${match[0]}`)
      // 找不到变量时保留原始字符串
      value = match[0]
    }

    // 如果值是 undefined/null，保留为 text
    if (value === undefined || value === null) {
      value = ''  // 或者 match[0] ?
    }

    // 如果变量未找到（上面的 else），value已经是 string match[0]
    // 否则 value 是 node output

    if (value === match[0]) {
      parts.push({ type: 'text', text: String(value) })
    } else {
      // 3. 转换值为 ContentPart
      const variableParts = convertValueToContentParts(value)
      parts.push(...variableParts)
    }

    lastIndex = VARIABLE_PATTERN.lastIndex
  }

  // 4. 添加剩余文本
  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }

  // 5. 合并
  return mergeTextParts(parts)
}
