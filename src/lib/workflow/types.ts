/**
 * 工作流执行引擎类型定义
 */

import type { NodeConfig, OutputFormat } from '@/types/workflow'

/**
 * 执行上下文
 */
export interface ExecutionContext {
  executionId: string
  workflowId: string
  organizationId: string
  userId: string

  // 节点输出存储
  nodeOutputs: Map<string, NodeOutput>

  // 全局变量
  globalVariables: Record<string, unknown>

  // AI 配置缓存
  aiConfigs: Map<string, AIConfigCache>
}

/**
 * AI 配置缓存
 */
export interface AIConfigCache {
  id: string
  provider: 'SHENSUAN' | 'OPENROUTER'
  baseUrl: string
  apiKey: string // 已解密
  defaultModel: string
}

/**
 * 节点输出
 */
export interface NodeOutput {
  nodeId: string
  nodeName: string
  nodeType: string
  status: 'success' | 'error' | 'skipped'
  data: Record<string, unknown>
  error?: string
  startedAt: Date
  completedAt?: Date
  duration?: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 节点处理器接口
 */
export interface NodeProcessor {
  nodeType: string
  process(node: NodeConfig, context: ExecutionContext): Promise<NodeOutput>
}

/**
 * 输出文件生成请求
 */
export interface OutputFileRequest {
  content: string | Buffer
  format: OutputFormat
  fileName?: string
  templateName?: string
  metadata?: Record<string, unknown>
}

/**
 * 变量引用解析结果
 */
export interface VariableReference {
  original: string    // 原始引用字符串，如 {{节点名.字段名}}
  nodeName: string    // 节点名
  fieldName: string   // 字段名
  value?: unknown     // 解析后的值
}

/**
 * 执行状态
 */
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

/**
 * 执行结果
 */
export interface ExecutionResult {
  status: ExecutionStatus
  output?: Record<string, unknown>
  error?: string
  errorDetail?: Record<string, unknown>
  duration: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  outputFiles?: Array<{
    id: string
    fileName: string
    format: string
    url: string
    size: number
  }>
}
