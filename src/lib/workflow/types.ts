/**
 * 工作流执行引擎类型定义
 */

import type { NodeConfig, OutputFormat } from '@/types/workflow'
import type { OutputType } from '@/lib/workflow/debug-panel/types'

/**
 * 循环迭代上下文
 */
export interface LoopIterationContext {
  /** 循环节点 ID */
  loopNodeId: string
  /** 当前迭代索引（0-based） */
  currentIndex: number
  /** 总迭代次数（forEach 为数组长度，times 为固定次数，while 为当前迭代数） */
  totalIterations?: number
  /** forEach 模式：当前迭代的元素 */
  currentItem?: unknown
  /** forEach 模式：原始数组 */
  iterableArray?: unknown[]
  /** 是否为最后一次迭代 */
  isLast?: boolean
  /** 是否为第一次迭代 */
  isFirst?: boolean
  /** 累积结果 */
  accumulatedResults: unknown[]
  /** 循环开始时间 */
  loopStartTime: Date
  /** 嵌套层级（0 = 最外层） */
  nestingLevel: number
  /** 循环变量命名空间 */
  loopNamespace: string
  /** 父循环上下文（嵌套循环时） */
  parentLoopContext?: LoopIterationContext
}

/**
 * 循环变量（暴露给表达式引用）
 */
export interface LoopVariables {
  item: unknown
  index: number
  isFirst: boolean
  isLast: boolean
  total: number
}

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

  // ===== 循环相关 =====
  /** 活跃的循环上下文栈（支持嵌套循环） */
  activeLoops?: Map<string, LoopIterationContext>

  /** 循环变量（暴露给表达式引用，按命名空间存储） */
  loopVariables?: Record<string, LoopVariables>
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
  /**
   * 节点标准化输出类型（可选）
   * - 用于前端根据类型选择合适的预览与下载方式
   * - 由各节点处理器在有明确语义时填充（如多模态图片/音频/视频结果）
   */
  outputType?: OutputType
  error?: string
  aiProvider?: AIConfigCache['provider']
  aiModel?: string
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
