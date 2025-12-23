/**
 * 工作流执行引擎类型定义
 */

import type { NodeConfig, OutputFormat } from '@/types/workflow'

/**
 * 执行上下文
 */
/**
 * 执行日志类型
 */
export type ExecutionLogType = 'info' | 'step' | 'success' | 'warning' | 'error'

/**
 * 执行日志条目
 */
export interface ExecutionLogEntry {
  type: ExecutionLogType
  message: string
  timestamp: Date
  step?: string      // 步骤标识
  data?: unknown     // 附加数据
}

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

  // 执行日志收集器（可选，调试模式使用）
  logs?: ExecutionLogEntry[]

  // 添加日志的辅助方法
  addLog?: (type: ExecutionLogType, message: string, step?: string, data?: unknown) => void

  // 调试用的导入文件
  importedFiles?: Array<{ name: string; content: string; type: string }>
}

/**
 * AI 配置缓存
 */
export interface AIConfigCache {
  id: string
  provider: 'SHENSUAN' | 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'BAIDU_WENXIN' | 'ALIYUN_TONGYI' | 'XUNFEI_SPARK' | 'STABILITYAI'
  baseUrl: string
  apiKey: string // 已解密
  defaultModel: string
}

/**
 * 节点输出
 */
export interface NodeOutput {
  [key: string]: unknown  // 添加索引签名以兼容 @/types/workflow 中的定义
  nodeId: string
  nodeName: string
  nodeType: string
  status: 'success' | 'error' | 'skipped' | 'paused'
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
  /** Approval request ID when node is paused for approval */
  approvalRequestId?: string
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
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED'

/**
 * 执行结果
 */
export interface ExecutionResult {
  executionId: string
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
