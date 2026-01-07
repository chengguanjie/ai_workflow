/**
 * 工作流执行工具函数
 */

import type { ExecutionContext, VariableReference } from './types'
import type { NodeConfig, EdgeConfig } from '@/types/workflow'
import type { ContentPart } from '@/lib/ai/types'

/**
 * 变量引用正则表达式
 * 匹配 {{节点名.字段名}} 或 {{节点名.字段名.子字段.更深层级}} 格式
 */
const VARIABLE_PATTERN = /\{\{([^.}]+)\.([^}]+)\}\}/g

/**
 * 简化变量引用正则表达式
 * 匹配 {{节点名}} 格式（不含字段名）
 */
const SIMPLE_VARIABLE_PATTERN = /\{\{([^.{}]+)\}\}/g

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

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  // ```json\n{...}\n```
  const lines = trimmed.split('\n')
  if (lines.length < 3) return trimmed
  if (!lines[0].startsWith('```')) return trimmed
  if (!lines[lines.length - 1].startsWith('```')) return trimmed
  return lines.slice(1, -1).join('\n').trim()
}

function tryParseJsonLike(text: string): unknown | null {
  const candidate = stripMarkdownCodeFence(text)
  if (!candidate) return null

  try {
    return JSON.parse(candidate)
  } catch {
    // Heuristic: parse the largest {...} block if response has leading/trailing prose.
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    const slice = candidate.slice(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch {
      return null
    }
  }
}

function buildImageUrlsFromImages(images: Array<{ url?: string; revisedPrompt?: string }>): Array<{
  index: number
  url: string
  description?: string
}> {
  return images
    .filter((img) => typeof img.url === 'string' && img.url)
    .map((img, index) => ({
      index: index + 1,
      url: img.url as string,
      description: img.revisedPrompt || `图片${index + 1}`,
    }))
}

/**
 * 解析节点输出字段值（带兼容逻辑）
 * - 兼容 result/结果 的字段别名
 * - 当节点输出为 JSON 字符串（常见：AI 输出）时，允许用 {{节点.xxx}} 直接取 JSON 字段
 * - 当节点输出包含 images 时，允许用 {{节点.imageUrls}} 取可用 URL 列表
 */
function resolveNodeFieldValue(
  nodeData: Record<string, unknown>,
  fieldPath: string
): unknown {
  const direct = fieldPath.includes('.')
    ? getNestedValue(nodeData, fieldPath)
    : nodeData[fieldPath]
  if (direct !== undefined) return direct

  // Common alias: result <-> 结果
  if (fieldPath === 'result' && nodeData['结果'] !== undefined) return nodeData['结果']
  if (fieldPath === '结果' && nodeData['result'] !== undefined) return nodeData['result']

  // Convenience: imageUrls derived from images
  if (fieldPath === 'imageUrls' || fieldPath === 'image_urls') {
    const images = nodeData.images
    if (Array.isArray(images) && images.length > 0) {
      return {
        ...(typeof nodeData === 'object' ? nodeData : {}),
        imageUrls: buildImageUrlsFromImages(images as Array<{ url?: string; revisedPrompt?: string }>),
      }
    }
  }

  // If the node "result" is actually a JSON string, allow dot-access into it.
  const rawText =
    (typeof nodeData['结果'] === 'string' && nodeData['结果']) ||
    (typeof nodeData['result'] === 'string' && nodeData['result']) ||
    null
  if (!rawText) return undefined

  const parsed = tryParseJsonLike(rawText)
  if (!parsed || typeof parsed !== 'object') return undefined
  const parsedObj = parsed as Record<string, unknown>

  const fromParsed = fieldPath.includes('.')
    ? getNestedValue(parsedObj, fieldPath)
    : parsedObj[fieldPath]
  if (fromParsed !== undefined) return fromParsed

  if (fieldPath === 'result' && parsedObj['结果'] !== undefined) return parsedObj['结果']
  if (fieldPath === '结果' && parsedObj['result'] !== undefined) return parsedObj['result']

  return undefined
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
 * 从文本中提取所有引用的节点名称
 * 支持 {{节点名.xxx}} 和 {{节点名}} 两种格式
 * 返回去重后的节点名数组
 */
export function extractReferencedNodeNames(text: string): string[] {
  const nodeNames = new Set<string>()

  // 匹配完整格式 {{节点名.字段名}}
  let match
  const fullPattern = /\{\{([^.}]+)\.([^}]+)\}\}/g
  while ((match = fullPattern.exec(text)) !== null) {
    nodeNames.add(match[1].trim())
  }

  // 匹配简化格式 {{节点名}}
  const simplePattern = /\{\{([^.{}]+)\}\}/g
  while ((match = simplePattern.exec(text)) !== null) {
    nodeNames.add(match[1].trim())
  }

  return Array.from(nodeNames)
}

/**
 * 从文本中提取所有变量引用的详细信息
 * 返回包含节点名和字段路径的数组
 */
export function extractVariableReferences(text: string): Array<{ nodeName: string; fieldPath: string | null }> {
  const references: Array<{ nodeName: string; fieldPath: string | null }> = []

  // 匹配完整格式 {{节点名.字段名}}
  let match
  const fullPattern = /\{\{([^.}]+)\.([^}]+)\}\}/g
  while ((match = fullPattern.exec(text)) !== null) {
    references.push({
      nodeName: match[1].trim(),
      fieldPath: match[2].trim(),
    })
  }

  // 匹配简化格式 {{节点名}}
  const simplePattern = /\{\{([^.{}]+)\}\}/g
  while ((match = simplePattern.exec(text)) !== null) {
    references.push({
      nodeName: match[1].trim(),
      fieldPath: null,
    })
  }

  return references
}

/**
 * 从节点输出中获取默认值
 * 优先级：result > 结果 > 第一个字段 > 整个对象
 * 
 * 特殊处理：如果输出包含多媒体内容（images/videos/audio），
 * 会将其与文本结果合并返回，确保下游节点能获取完整数据
 */
function getDefaultOutputValue(nodeOutput: { data: Record<string, unknown> }): unknown {
  const { data } = nodeOutput

  // 检查是否有多媒体内容
  const hasImages = Array.isArray(data.images) && data.images.length > 0
  const hasVideos = Array.isArray(data.videos) && data.videos.length > 0
  const hasAudio = data.audio !== undefined && data.audio !== null

  // 如果有多媒体内容，返回包含文本和多媒体URL的完整对象
  if (hasImages || hasVideos || hasAudio) {
    const result: Record<string, unknown> = {}
    
    // 添加文本结果
    if ('result' in data) {
      result['结果'] = data.result
    } else if ('结果' in data) {
      result['结果'] = data['结果']
    }
    
    // 添加多媒体内容（保留完整对象，同时提取URL列表供AI使用）
    if (hasImages) {
      const images = data.images as Array<{ url?: string; b64?: string; revisedPrompt?: string }>
      result.images = images
      // 提取图片URL列表，方便AI在HTML中使用
      result.imageUrls = images
        .filter(img => img.url)
        .map((img, index) => ({
          index: index + 1,
          url: img.url,
          description: img.revisedPrompt || `图片${index + 1}`
        }))
    }
    if (hasVideos) {
      const videos = data.videos as Array<{ url?: string; duration?: number; format?: string }>
      result.videos = videos
      result.videoUrls = videos
        .filter(v => v.url)
        .map((v, index) => ({
          index: index + 1,
          url: v.url,
          duration: v.duration,
          format: v.format
        }))
    }
    if (hasAudio) {
      result.audio = data.audio
    }
    
    return result
  }

  // 优先使用 result 字段
  if ('result' in data) {
    return data.result
  }

  // 其次使用"结果"字段
  if ('结果' in data) {
    return data['结果']
  }

  // 如果只有一个字段，直接返回该字段的值
  const keys = Object.keys(data)
  if (keys.length === 1) {
    return data[keys[0]]
  }

  // 否则返回整个对象
  return data
}

/**
 * 替换循环变量
 * 支持格式：{{loop.item}}、{{loop.index}}、{{loop.isFirst}}、{{loop.isLast}}、{{loop.total}}、{{loop.results}}
 * 对于嵌套循环，支持自定义命名空间：{{loop1.item}}、{{innerLoop.index}} 等
 */
function replaceLoopVariables(
  text: string,
  context: ExecutionContext
): string {
  if (!context.loopVariables || Object.keys(context.loopVariables).length === 0) {
    // 如果没有循环变量，尝试从 globalVariables 中获取（处理器已写入）
    return replaceLoopVariablesFromGlobal(text, context)
  }

  let result = text

  // 遍历所有循环命名空间
  for (const [namespace, vars] of Object.entries(context.loopVariables)) {
    // 替换 {{namespace.item}}
    result = result.replace(
      new RegExp(`\\{\\{${escapeRegex(namespace)}\\.item\\}\\}`, 'g'),
      formatLoopValue(vars.item)
    )

    // 替换 {{namespace.index}}
    result = result.replace(
      new RegExp(`\\{\\{${escapeRegex(namespace)}\\.index\\}\\}`, 'g'),
      String(vars.index)
    )

    // 替换 {{namespace.isFirst}}
    result = result.replace(
      new RegExp(`\\{\\{${escapeRegex(namespace)}\\.isFirst\\}\\}`, 'g'),
      String(vars.isFirst)
    )

    // 替换 {{namespace.isLast}}
    result = result.replace(
      new RegExp(`\\{\\{${escapeRegex(namespace)}\\.isLast\\}\\}`, 'g'),
      String(vars.isLast)
    )

    // 替换 {{namespace.total}}
    result = result.replace(
      new RegExp(`\\{\\{${escapeRegex(namespace)}\\.total\\}\\}`, 'g'),
      String(vars.total)
    )
  }

  return result
}

/**
 * 从 globalVariables 中替换循环变量
 * 处理器会将循环变量写入 globalVariables，格式为：
 * globalVariables['loop'] = { item, index, isFirst, isLast, total, results }
 */
function replaceLoopVariablesFromGlobal(
  text: string,
  context: ExecutionContext
): string {
  if (!context.globalVariables) return text

  let result = text

  // 查找所有可能的循环命名空间（以 loop 开头或包含循环变量结构的）
  for (const [key, value] of Object.entries(context.globalVariables)) {
    if (
      value &&
      typeof value === 'object' &&
      'item' in (value as Record<string, unknown>) &&
      'index' in (value as Record<string, unknown>)
    ) {
      const vars = value as { item: unknown; index: number; isFirst?: boolean; isLast?: boolean; total?: number; results?: unknown[] }

      // 替换 {{key.item}}
      result = result.replace(
        new RegExp(`\\{\\{${escapeRegex(key)}\\.item\\}\\}`, 'g'),
        formatLoopValue(vars.item)
      )

      // 替换 {{key.index}}
      result = result.replace(
        new RegExp(`\\{\\{${escapeRegex(key)}\\.index\\}\\}`, 'g'),
        String(vars.index)
      )

      // 替换 {{key.isFirst}}
      result = result.replace(
        new RegExp(`\\{\\{${escapeRegex(key)}\\.isFirst\\}\\}`, 'g'),
        String(vars.isFirst ?? false)
      )

      // 替换 {{key.isLast}}
      result = result.replace(
        new RegExp(`\\{\\{${escapeRegex(key)}\\.isLast\\}\\}`, 'g'),
        String(vars.isLast ?? false)
      )

      // 替换 {{key.total}}
      result = result.replace(
        new RegExp(`\\{\\{${escapeRegex(key)}\\.total\\}\\}`, 'g'),
        String(vars.total ?? -1)
      )

      // 替换 {{key.results}}
      if (vars.results) {
        result = result.replace(
          new RegExp(`\\{\\{${escapeRegex(key)}\\.results\\}\\}`, 'g'),
          JSON.stringify(vars.results, null, 2)
        )
      }
    }
  }

  return result
}

/**
 * 格式化循环变量值
 */
function formatLoopValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 替换文本中的变量引用
 * 支持两种格式：
 * 1. {{节点名.字段名}} 或 {{节点名.字段名.子字段}} - 访问特定字段
 * 2. {{节点名}} - 访问默认字段（result > 结果 > 第一个字段 > 整个对象）
 */
export function replaceVariables(
  text: string,
  context: ExecutionContext
): string {
  // 1. 首先处理循环变量 {{loop.item}}、{{loop.index}} 等
  let result = replaceLoopVariables(text, context)

  // 2. 处理完整格式 {{节点名.字段名}}
  result = result.replace(VARIABLE_PATTERN, (match, nodeName, fieldPath) => {
    const nodeNameOrId = nodeName.trim()
    const nodeOutput = findNodeOutputByNameOrId(nodeNameOrId, context)
    const globalValue = context.globalVariables?.[nodeNameOrId]
    const data =
      nodeOutput?.data ||
      (globalValue && typeof globalValue === 'object' && !Array.isArray(globalValue)
        ? (globalValue as Record<string, unknown>)
        : undefined)

    if (!data) {
      console.warn(`Variable reference not found: ${match}`)
      return match
    }

    const trimmedPath = fieldPath.trim()
    const value = resolveNodeFieldValue(data, trimmedPath)

    if (value === undefined || value === null) {
      console.warn(`Field not found in node output: ${match}`)
      return ''
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }

    return String(value)
  })

  // 再处理简化格式 {{节点名}}（不含点号）
  result = result.replace(SIMPLE_VARIABLE_PATTERN, (match, nodeName) => {
    const nodeNameOrId = nodeName.trim()
    const nodeOutput = findNodeOutputByNameOrId(nodeNameOrId, context)
    const globalValue = context.globalVariables?.[nodeNameOrId]

    let value: unknown
    if (nodeOutput) {
      value = getDefaultOutputValue(nodeOutput)
    } else if (globalValue !== undefined) {
      value = globalValue
    } else {
      console.warn(`Variable reference not found (simple format): ${match}`)
      return match
    }

    if (value === undefined || value === null) {
      console.warn(`No output found for node: ${match}`)
      return ''
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }

    return String(value)
  })

  return result
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
 * 根据节点名称或 nodeId 查找节点输出
 * - 兼容旧的按名称引用
 * - 允许按 nodeId 引用以降低改名脆弱性
 */
export function findNodeOutputByNameOrId(
  nodeNameOrId: string,
  context: ExecutionContext
): { data: Record<string, unknown> } | undefined {
  const byName = findNodeOutputByName(nodeNameOrId, context)
  if (byName) return byName

  for (const [, output] of context.nodeOutputs) {
    if (output.nodeId === nodeNameOrId) {
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
 * 
 * 特殊处理 GROUP 节点：GROUP 节点必须在其所有子节点执行完成后才执行
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

  // 特殊处理 GROUP 节点：添加从子节点到 GROUP 节点的隐式依赖
  for (const node of nodes) {
    if (node.type === 'GROUP') {
      const groupConfig = node.config as { childNodeIds?: string[] } | undefined
      const childNodeIds = groupConfig?.childNodeIds || []
      
      // 找到最后一个子节点（按执行顺序）
      // GROUP 节点依赖其最后一个子节点
      if (childNodeIds.length > 0) {
        const lastChildId = childNodeIds[childNodeIds.length - 1]
        
        // 添加从最后一个子节点到 GROUP 节点的边
        const targets = adjList.get(lastChildId) || []
        if (!targets.includes(node.id)) {
          targets.push(node.id)
          adjList.set(lastChildId, targets)
          inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1)
        }
      }
    }
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

/**
 * 将变量值转换为多模态内容部分
 */
function convertValueToContentParts(value: unknown): ContentPart[] {
  if (!value) return []

  // 1. 处理数组 (例如多选图片、Image节点的输出)
  if (Array.isArray(value)) {
    return value.flatMap(convertValueToContentParts)
  }

  // 2. 处理字符串（可能是纯 URL）
  if (typeof value === 'string') {
    const trimmed = value.trim()
    
    // 检查是否是 data URI
    if (trimmed.startsWith('data:image/')) {
      return [{
        type: 'image_url',
        image_url: { url: trimmed, detail: 'auto' }
      }]
    }
    if (trimmed.startsWith('data:audio/')) {
      return [{
        type: 'audio_url',
        audio_url: { url: trimmed }
      }]
    }
    if (trimmed.startsWith('data:video/')) {
      return [{
        type: 'video_url',
        video_url: { url: trimmed }
      }]
    }
    
    // 检查是否是 HTTP/HTTPS URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/api/files/')) {
      const mimeType = detectMimeType(trimmed)
      const format = detectFormat(trimmed)
      
      // 图片 URL
      if (mimeType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(format)) {
        return [{
          type: 'image_url',
          image_url: { url: trimmed, detail: 'auto' }
        }]
      }
      
      // 音频 URL
      if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm', 'aac'].includes(format)) {
        return [{
          type: 'audio_url',
          audio_url: { url: trimmed }
        }]
      }
      
      // 视频 URL
      if (mimeType?.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(format)) {
        return [{
          type: 'video_url',
          video_url: { url: trimmed }
        }]
      }
    }
    
    // 普通文本
    return [{ type: 'text', text: value }]
  }

  // 3. 处理对象
  if (typeof value === 'object') {
    const val = value as Record<string, any>

    // 3.1 检查是否是 ImageInfo / AudioInfo / VideoInfo (来自 Image/Audio/Video 节点)
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
      if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'].includes(format)) {
        return [{
          type: 'audio_url',
          audio_url: { url: val.url }
        }]
      }

      // 视频
      if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi'].includes(format)) {
        return [{
          type: 'video_url',
          video_url: { url: val.url }
        }]
      }
    }

    // 3.2 特殊处理 InputNode 的 file 结构
    // { value, file: { url, mimeType }, url }
    if (val.file && val.file.url) {
      return convertValueToContentParts(val.file)
    }
    
    // 3.3 检查是否包含 imageUrls（来自 getDefaultOutputValue 的增强输出）
    // 这种情况下，我们需要将整个对象转换为文本，让AI知道图片URL
    if (val.imageUrls && Array.isArray(val.imageUrls)) {
      const parts: ContentPart[] = []
      
      // 添加文本结果
      if (val['结果']) {
        parts.push({ type: 'text', text: String(val['结果']) })
      }
      
      // 添加图片URL信息作为文本（让AI知道URL以便在HTML中使用）
      const imageUrlsText = val.imageUrls.map((img: { index: number; url: string; description?: string }) => 
        `图片${img.index}: ${img.url}${img.description ? ` (${img.description})` : ''}`
      ).join('\n')
      parts.push({ type: 'text', text: `\n\n【可用的配图URL】\n${imageUrlsText}\n` })
      
      // 同时添加图片本身（让AI能"看到"图片内容）
      if (val.images && Array.isArray(val.images)) {
        for (const img of val.images) {
          if (img.url) {
            parts.push({ type: 'image_url', image_url: { url: img.url, detail: 'auto' } })
          }
        }
      }
      
      return parts
    }
    
    // 3.4 检查 images 数组（来自图片生成节点，没有 imageUrls 的情况）
    if (val.images && Array.isArray(val.images)) {
      const parts: ContentPart[] = []
      
      // 添加图片URL作为文本
      const imageUrlsText = val.images
        .filter((img: { url?: string }) => img.url)
        .map((img: { url?: string; revisedPrompt?: string }, index: number) => 
          `图片${index + 1}: ${img.url}${img.revisedPrompt ? ` (${img.revisedPrompt})` : ''}`
        ).join('\n')
      if (imageUrlsText) {
        parts.push({ type: 'text', text: `【可用的配图URL】\n${imageUrlsText}\n` })
      }
      
      // 同时添加图片本身
      for (const img of val.images) {
        if (img.url) {
          parts.push({ type: 'image_url', image_url: { url: img.url, detail: 'auto' } })
        }
      }
      
      return parts
    }
  }

  // 4. 默认转换为文本
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
  const ext = extractExtensionFromUrl(url)
  if (!ext) return null
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
  if (['mp4', 'webm'].includes(ext)) return `video/${ext}`
  if (['mp3', 'wav', 'ogg'].includes(ext)) return `audio/${ext}`
  return null
}

function detectFormat(url: string): string {
  return extractExtensionFromUrl(url) || ''
}

function extractExtensionFromUrl(url: string): string | null {
  const raw = url.split('?')[0] || url

  // Prefer extracting from /api/files/{encodedFileKey}/download (fileKey contains the original filename+ext)
  try {
    const parsed = new URL(raw, 'http://localhost')
    const match = parsed.pathname.match(/^\/api\/files\/([^/]+)\/download$/)
    if (match?.[1]) {
      const fileKey = decodeURIComponent(match[1])
      const name = fileKey.split('/').pop() || ''
      const ext = name.includes('.') ? name.split('.').pop() : null
      if (ext) return ext.toLowerCase()
    }
  } catch {
    // ignore
  }

  // Fallback: last "." segment (may fail for URLs ending with "/download")
  const last = raw.split('.').pop()?.toLowerCase() || ''
  if (!last || last.includes('/') || last.includes('%2f')) return null
  return last
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
 * 通用变量匹配正则 - 匹配所有 {{...}} 格式
 * 用于一次性遍历所有变量引用
 */
const ALL_VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g

/**
 * 解析文本并生成多模态内容部分 (ProcessNode使用)
 * 支持两种格式：
 * 1. {{节点名.字段名}} - 访问特定字段
 * 2. {{节点名}} - 访问默认字段
 */
export function createContentPartsFromText(
  text: string,
  context: ExecutionContext
): ContentPart[] {
  const parts: ContentPart[] = []
  let lastIndex = 0
  let match

  // 重置正则索引
  ALL_VARIABLE_PATTERN.lastIndex = 0

  while ((match = ALL_VARIABLE_PATTERN.exec(text)) !== null) {
    // 1. 添加前导文本
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }

    // 2. 解析变量
    const varContent = match[1].trim()
    let value: unknown

    // 检查是否包含点号（完整格式 vs 简化格式）
    if (varContent.includes('.')) {
      // 完整格式：{{节点名.字段名}}
      const dotIndex = varContent.indexOf('.')
      const nodeName = varContent.substring(0, dotIndex).trim()
      const fieldPath = varContent.substring(dotIndex + 1).trim()
      const nodeOutput = findNodeOutputByNameOrId(nodeName, context)

      const globalValue = context.globalVariables?.[nodeName]
      const data =
        nodeOutput?.data ||
        (globalValue && typeof globalValue === 'object' && !Array.isArray(globalValue)
          ? (globalValue as Record<string, unknown>)
          : undefined)

      if (data) {
        value = resolveNodeFieldValue(data, fieldPath)
      } else {
        console.warn(`Variable reference not found in createContentParts: ${match[0]}`)
        value = match[0]
      }
    } else {
      // 简化格式：{{节点名}}
      const nodeName = varContent
      const nodeOutput = findNodeOutputByNameOrId(nodeName, context)

      const globalValue = context.globalVariables?.[nodeName]

      if (nodeOutput) {
        value = getDefaultOutputValue(nodeOutput)
      } else if (globalValue !== undefined) {
        value = globalValue
      } else {
        console.warn(`Variable reference not found (simple format) in createContentParts: ${match[0]}`)
        value = match[0]
      }
    }

    // 如果值是 undefined/null，保留为空字符串
    if (value === undefined || value === null) {
      value = ''
    }

    // 如果变量未找到，value 已经是原始字符串 match[0]
    if (value === match[0]) {
      parts.push({ type: 'text', text: String(value) })
    } else {
      // 3. 转换值为 ContentPart
      const variableParts = convertValueToContentParts(value)
      parts.push(...variableParts)
    }

    lastIndex = ALL_VARIABLE_PATTERN.lastIndex
  }

  // 4. 添加剩余文本
  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }

  // 5. 合并
  return mergeTextParts(parts)
}

/**
 * 检查节点输出是否有效（非空、非null、非undefined、非空字符串）
 * 用于判断节点输出状态是 'valid' 还是 'empty'
 */
export function isOutputValid(data: Record<string, unknown> | undefined | null): boolean {
  if (!data || Object.keys(data).length === 0) {
    return false
  }

  const values = Object.values(data)
  return values.some(value => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string' && value.trim() === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    if (typeof value === 'object' && Object.keys(value as object).length === 0) return false
    return true
  })
}

/**
 * 递归替换对象中所有字符串字段的变量引用
 * 用于工具配置中的变量替换
 *
 * @param config 工具配置对象
 * @param context 执行上下文
 * @returns 替换后的配置对象（深拷贝）
 */
export function replaceVariablesInConfig<T extends Record<string, unknown>>(
  config: T,
  context: ExecutionContext
): T {
  const result = {} as T

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      // 字符串：替换变量
      result[key as keyof T] = replaceVariables(value, context) as T[keyof T]
    } else if (Array.isArray(value)) {
      // 数组：递归处理每个元素
      result[key as keyof T] = value.map(item => {
        if (typeof item === 'string') {
          return replaceVariables(item, context)
        } else if (typeof item === 'object' && item !== null) {
          return replaceVariablesInConfig(item as Record<string, unknown>, context)
        }
        return item
      }) as T[keyof T]
    } else if (typeof value === 'object' && value !== null) {
      // 对象：递归处理
      result[key as keyof T] = replaceVariablesInConfig(
        value as Record<string, unknown>,
        context
      ) as T[keyof T]
    } else {
      // 其他类型（number、boolean、null、undefined等）：保持原样
      result[key as keyof T] = value as T[keyof T]
    }
  }

  return result
}
