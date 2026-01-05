/**
 * 智能上下文构建器 - 用于AI小浮标功能
 * 自动管理上下文大小，防止超过模型限制
 */

import { estimateTokenCount, smartTruncate, truncateToTokenLimit } from './token-utils'

export interface WorkflowNode {
  id: string
  name: string
  type: string
  config?: Record<string, unknown>
}

export interface WorkflowContextInput {
  workflowName?: string
  workflowDescription?: string
  nodes?: WorkflowNode[]
  currentNodeId?: string
  currentNodeName?: string
  currentNodeType?: string
}

export interface ContextBuildResult {
  context: string
  estimatedTokens: number
  wasTruncated: boolean
  truncationInfo?: {
    originalTokens: number
    removedNodes: string[]
  }
}

const NODE_TYPE_NAMES: Record<string, string> = {
  INPUT: '输入节点',
  PROCESS: '文本处理节点',
  CODE: '代码节点',
  OUTPUT: '输出节点',
  DATA: '数据节点',
  IMAGE: '图片节点',
  VIDEO: '视频节点',
  AUDIO: '音频节点',
  CONDITION: '条件分支节点',
  LOOP: '循环节点',
  SWITCH: '多路分支节点',
  HTTP: 'HTTP请求节点',
  MERGE: '合并节点',
  IMAGE_GEN: '图片生成节点',
  NOTIFICATION: '通知节点',
  TRIGGER: '触发器节点',
  GROUP: '节点组',
  LOGIC: '逻辑节点',
}

export class WorkflowContextBuilder {
  private maxTokens: number
  private reservedForResponse: number

  constructor(options: { maxTokens?: number; reservedForResponse?: number } = {}) {
    this.maxTokens = options.maxTokens || 6000
    this.reservedForResponse = options.reservedForResponse || 2000
  }

  private getNodeTypeName(type: string): string {
    return NODE_TYPE_NAMES[type?.toUpperCase()] || type
  }

  private extractNodeSummary(node: WorkflowNode, maxConfigLength: number = 100): string {
    const typeName = this.getNodeTypeName(node.type)
    let summary = `- **${node.name}** (${typeName})`

    if (!node.config) return summary

    const nodeType = node.type?.toUpperCase()

    if (nodeType === 'INPUT' && node.config.fields) {
      const fields = node.config.fields as Array<{ name: string }>
      const fieldNames = fields.map(f => f.name).join('、')
      summary += `\n  - 输入字段：${truncateToTokenLimit(fieldNames, 50, '...')}`
    } else if (nodeType === 'PROCESS') {
      if (node.config.systemPrompt) {
        const sp = String(node.config.systemPrompt)
        summary += `\n  - 系统提示词：${sp.substring(0, maxConfigLength)}${sp.length > maxConfigLength ? '...' : ''}`
      }
      if (node.config.userPrompt) {
        const up = String(node.config.userPrompt)
        summary += `\n  - 用户提示词：${up.substring(0, maxConfigLength)}${up.length > maxConfigLength ? '...' : ''}`
      }
    }

    return summary
  }

  private extractMinimalNodeInfo(node: WorkflowNode): string {
    const typeName = this.getNodeTypeName(node.type)
    return `- ${node.name} (${typeName})`
  }

  build(input: WorkflowContextInput): ContextBuildResult {
    const {
      workflowName,
      workflowDescription,
      nodes = [],
      currentNodeId,
      currentNodeName,
      currentNodeType,
    } = input

    const currentNodeIndex = nodes.findIndex(n => n.id === currentNodeId)
    const predecessorNodes = nodes.slice(0, Math.max(0, currentNodeIndex))
    
    const directPredecessorCount = Math.min(5, predecessorNodes.length)
    const directPredecessors = predecessorNodes.slice(-directPredecessorCount)
    const indirectPredecessors = predecessorNodes.slice(0, -directPredecessorCount)

    let context = '## 工作流信息\n'
    if (workflowName) context += `- 名称：${workflowName}\n`
    if (workflowDescription) {
      const desc = truncateToTokenLimit(workflowDescription, 100, '...')
      context += `- 描述：${desc}\n`
    }

    let wasTruncated = false
    const removedNodes: string[] = []

    if (directPredecessors.length > 0) {
      context += '\n## 直接前置节点\n'
      directPredecessors.forEach((node, index) => {
        context += `${index + 1}. ${this.extractNodeSummary(node)}\n`
      })
    }

    let currentTokens = estimateTokenCount(context)

    if (indirectPredecessors.length > 0 && currentTokens < this.maxTokens * 0.7) {
      context += '\n## 其他前置节点\n'
      for (const node of indirectPredecessors.reverse()) {
        const nodeInfo = this.extractMinimalNodeInfo(node)
        const nodeTokens = estimateTokenCount(nodeInfo)
        
        if (currentTokens + nodeTokens > this.maxTokens * 0.8) {
          wasTruncated = true
          removedNodes.push(node.name)
          continue
        }
        
        context += nodeInfo + '\n'
        currentTokens += nodeTokens
      }
    } else if (indirectPredecessors.length > 0) {
      wasTruncated = true
      indirectPredecessors.forEach(n => removedNodes.push(n.name))
    }

    if (currentNodeName && currentNodeType) {
      const nodeTypeName = this.getNodeTypeName(currentNodeType)
      context += `\n## 当前节点\n- 名称：${currentNodeName}\n- 类型：${nodeTypeName}\n`
    }

    const finalTokens = estimateTokenCount(context)

    if (finalTokens > this.maxTokens) {
      context = smartTruncate(context, this.maxTokens, {
        preserveStart: Math.floor(this.maxTokens * 0.4),
        preserveEnd: Math.floor(this.maxTokens * 0.3),
      })
      wasTruncated = true
    }

    return {
      context,
      estimatedTokens: estimateTokenCount(context),
      wasTruncated,
      truncationInfo: wasTruncated ? {
        originalTokens: finalTokens,
        removedNodes,
      } : undefined,
    }
  }

  buildAvailableReferences(
    nodes: WorkflowNode[],
    edges: Array<{ source: string; target: string }>,
    currentNodeId: string,
    maxReferences: number = 20
  ): string[] {
    const references: string[] = []
    const directPredecessorIds = new Set<string>()

    edges.forEach(edge => {
      if (edge.target === currentNodeId) {
        directPredecessorIds.add(edge.source)
      }
    })

    for (const node of nodes) {
      if (!directPredecessorIds.has(node.id)) continue
      if (references.length >= maxReferences) break

      const nodeName = node.name || node.id
      const nodeType = node.type?.toUpperCase()

      if (nodeType === 'INPUT' && node.config?.fields) {
        const fields = node.config.fields as Array<{ name: string }>
        for (const field of fields.slice(0, 5)) {
          references.push(`- {{${nodeName}.${field.name}}}`)
          if (references.length >= maxReferences) break
        }
      } else {
        references.push(`- {{${nodeName}}}`)
      }
    }

    return references
  }

  estimateContextTokens(input: WorkflowContextInput): number {
    const result = this.build(input)
    return result.estimatedTokens
  }

  getMaxTokens(): number {
    return this.maxTokens
  }
}

export const defaultContextBuilder = new WorkflowContextBuilder()
