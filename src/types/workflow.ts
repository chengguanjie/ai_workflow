/**
 * Workflow Type Definitions
 * 
 * Provides precise TypeScript types for workflow configuration,
 * replacing generic Record types with specific interfaces.
 * 
 * Simplified version: Only INPUT and PROCESS node types are supported.
 */

import type { ModelModality } from '@/lib/ai/types'
import type { OutputType } from '@/lib/workflow/debug-panel/types'

// ============================================
// Basic Types
// ============================================

export type NodeType = 'INPUT' | 'PROCESS' | 'CODE' | 'OUTPUT' | 'LOGIC'

export type AIProviderType = 'SHENSUAN' | 'OPENROUTER' | 'OPENAI' | 'ANTHROPIC' | 'BAIDU_WENXIN' | 'ALIYUN_TONGYI' | 'XUNFEI_SPARK' | 'STABILITYAI'

export type OutputFormat =
  | 'text'
  | 'json'
  | 'markdown'
  | 'html'
  | 'word'
  | 'excel'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'

// ============================================
// Workflow Settings
// ============================================

/**
 * Error handling strategy for parallel execution
 */
export type ParallelErrorStrategy = 'fail_fast' | 'continue' | 'collect'

/**
 * Workflow execution settings
 */
export interface WorkflowSettings {
  /** Execution timeout in seconds (default: 300) */
  timeout?: number
  /** Maximum retry attempts for failed nodes (default: 0) */
  maxRetries?: number
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay?: number
  /** Enable parallel execution of independent nodes */
  enableParallelExecution?: boolean
  /**
   * Error handling strategy for parallel execution:
   * - 'fail_fast': Stop all branches on first error (default)
   * - 'continue': Continue with successful branches
   * - 'collect': Collect all errors and report at the end
   */
  parallelErrorStrategy?: ParallelErrorStrategy
  /** Log level for execution */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  /** Webhook URL for execution notifications */
  webhookUrl?: string
  /** Custom headers for webhook requests */
  webhookHeaders?: Record<string, string>
}

/**
 * Default workflow settings
 */
export const DEFAULT_WORKFLOW_SETTINGS: Required<Pick<WorkflowSettings, 'timeout' | 'maxRetries' | 'retryDelay'>> = {
  timeout: 300,
  maxRetries: 0,
  retryDelay: 1000,
}

// ============================================
// Node Position and Common Types
// ============================================

/**
 * Node position on the canvas
 */
export interface NodePosition {
  x: number
  y: number
}

/**
 * Input field type for INPUT nodes
 */
export type InputFieldType =
  | 'text'        // 文本输入
  | 'image'       // 上传图片
  | 'pdf'         // 上传PDF
  | 'word'        // 上传Word
  | 'excel'       // 上传Excel
  | 'audio'       // 上传音频
  | 'video'       // 上传视频
  | 'select'      // 单选
  | 'multiselect' // 多选

/**
 * Select option for single/multi-select fields
 */
export interface SelectOption {
  /** Option display label */
  label: string
  /** Option value */
  value: string
}

/**
 * Input field definition for INPUT nodes
 */
export interface InputField {
  /** Unique field identifier */
  id: string
  /** Field name for reference by other nodes */
  name: string
  /** Field content/value */
  value: string
  /** Field type (default: text) */
  fieldType?: InputFieldType
  /** Text area height in pixels (default: 80, only for text type) */
  height?: number
  /** Uploaded file information (for file types) */
  file?: {
    /** File name */
    name: string
    /** File URL */
    url: string
    /** File size in bytes */
    size: number
    /** MIME type */
    mimeType: string
  }
  /** Options for select/multiselect fields */
  options?: SelectOption[]
  /** Placeholder text for input fields */
  placeholder?: string
  /** Whether the field is required */
  required?: boolean
  /** Field description/help text */
  description?: string
}

/**
 * Knowledge base item for PROCESS nodes
 */
export interface KnowledgeItem {
  /** Unique item identifier */
  id: string
  /** Knowledge item name */
  name: string
  /** Knowledge content */
  content: string
}

/**
 * AI configuration for nodes that use AI
 */
export interface NodeAIConfig {
  /** Organization AI configuration ID */
  aiConfigId?: string
  /** AI model identifier */
  model?: string
  /** Selected modality (explicitly saved from UI) */
  modality?: ModelModality
  /** Temperature for AI generation (0-2) */
  temperature?: number
  /** Maximum tokens for AI response */
  maxTokens?: number
}

// ============================================
// Base Node Configuration
// ============================================

/**
 * Base configuration shared by all node types
 */
export interface BaseNodeConfig {
  /** Unique node identifier */
  id: string
  /** Node type */
  type: NodeType
  /** Display name */
  name: string
  /** Position on canvas */
  position: NodePosition
  /** Node comment/annotation - describes what this node does */
  comment?: string
  /** Index signature for compatibility */
  [key: string]: unknown
}

// ============================================
// INPUT Node Configuration
// ============================================

/**
 * INPUT node configuration - User input fields
 */
export interface InputNodeConfigData {
  /** Array of input fields */
  fields: InputField[]
}

export interface InputNodeConfig extends BaseNodeConfig {
  type: 'INPUT'
  config: InputNodeConfigData
}

// ============================================
// PROCESS Node Configuration
// ============================================

/**
 * RAG (Retrieval Augmented Generation) configuration
 */
export interface RAGConfig {
  /** Number of top results to retrieve (default: 5) */
  topK?: number
  /** Minimum similarity threshold (0-1, default: 0.7) */
  threshold?: number
  /** Maximum context tokens to include */
  maxContextTokens?: number
}

/**
 * Tool configuration for AI nodes (from UI layer)
 */
export interface UIToolConfig {
  id: string
  type: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * PROCESS node configuration - AI processing with knowledge base
 */
export interface ProcessNodeConfigData extends NodeAIConfig {
  /** Knowledge base items for context */
  knowledgeItems?: KnowledgeItem[]
  /** Knowledge base ID for RAG retrieval */
  knowledgeBaseId?: string
  /** RAG configuration */
  ragConfig?: RAGConfig
  /** System prompt for AI */
  systemPrompt?: string
  /** User prompt with variable support ({{nodeName.fieldName}}) */
  userPrompt?: string
  /** Tools configured in UI */
  tools?: UIToolConfig[]
  /** Enable tool calling */
  enableToolCalling?: boolean
  /** Enabled tool names (backend format) */
  enabledTools?: string[]
  /** Tool choice mode */
  toolChoice?: 'auto' | 'none' | 'required'
  /** Maximum tool call rounds */
  maxToolCallRounds?: number

  // ===== 多模态生成配置 =====

  /** 图片生成配置 */
  imageSize?: '1024x1024' | '1792x1024' | '1024x1792' | string
  imageCount?: number
  imageQuality?: 'standard' | 'hd'
  imageStyle?: 'vivid' | 'natural'
  negativePrompt?: string

  /** 视频生成配置 */
  videoDuration?: number
  videoAspectRatio?: '16:9' | '9:16' | '1:1'
  videoResolution?: '720p' | '1080p' | '4k'
  referenceImage?: string

  /** TTS 配置 */
  ttsVoice?: string
  ttsSpeed?: number
  ttsFormat?: 'mp3' | 'wav' | 'opus'

  /** 音频转录配置 */
  transcriptionLanguage?: string
  transcriptionFormat?: 'json' | 'text' | 'srt' | 'vtt'

  /** 向量嵌入配置 */
  embeddingDimensions?: number

  /** 期望输出类型（用于画布展示与下载预设） */
  expectedOutputType?: OutputType
}

export interface ProcessNodeConfig extends BaseNodeConfig {
  type: 'PROCESS'
  config: ProcessNodeConfigData
}

// ============================================
// CODE Node Configuration
// ============================================

export interface CodeNodeConfigData extends NodeAIConfig {
  prompt?: string
  language?: 'javascript' | 'typescript' | 'python' | 'sql' | 'other'
  code?: string
  /** Timeout in milliseconds */
  timeout?: number
  /** Max output size in characters */
  maxOutputSize?: number
}

export interface CodeNodeConfig extends BaseNodeConfig {
  type: 'CODE'
  config: CodeNodeConfigData
}

// ============================================
// OUTPUT Node Configuration
// ============================================

export interface OutputNodeConfigData extends NodeAIConfig {
  /** Content template; variables like {{Node.field}} supported */
  prompt?: string
  /** Output format */
  format?: OutputFormat
  /** File name override */
  fileName?: string
}

export interface OutputNodeConfig extends BaseNodeConfig {
  type: 'OUTPUT'
  config: OutputNodeConfigData
}

// ============================================
// LOGIC Node Configuration
// ============================================

/**
 * 逻辑节点模式：
 * - condition: 条件判断，根据表达式决定激活哪些后续分支
 * - merge: 合并处理，等待所有上游节点完成后汇总结果传递给下游
 */
export type LogicNodeMode = 'condition' | 'merge'

/**
 * 通用逻辑分支描述
 */
export interface LogicBranch {
  /** 分支 ID（用于内部识别） */
  id: string
  /** 分支显示名称 */
  label: string
  /** 目标节点 ID（可选，部分模式仅作为文档提示，实际路由由边决定） */
  targetNodeId?: string
}

/**
 * 条件判断配置
 */
export interface LogicCondition {
  /** 条件 ID */
  id: string
  /** 条件描述（短标签） */
  label?: string
  /**
   * 条件表达式（字符串形式）
   * 例如：`{{上游节点.字段}} > 5 && {{变量.xxx}} === "wechat"`
   */
  expression: string
  /**
   * 命中该条件时建议前往的目标节点（可选，主要用于配置 UI 提示）
   * 仅用于可视化和 AI 建议，不直接参与执行路由（路由仍由边决定）
   */
  targetNodeId?: string
  /**
   * 目标节点名称提示（当还没有确定具体 nodeId 时由 AI 先给出名称，后续再解析为 nodeId）
   */
  targetNodeNameHint?: string
  /** 条件的自然语言说明，便于展示和调试 */
  description?: string
}

/**
 * LOGIC 节点配置
 *
 * 注意：路由的真正生效仍由边决定，这里的 targetNodeId 主要用于 UI 与分析提示。
 */
export interface LogicNodeConfigData {
  /** 逻辑模式 */
  mode: LogicNodeMode

  /** 条件模式配置 */
  conditions?: LogicCondition[]
  /** 未命中任何条件时建议的兜底目标节点（可选） */
  fallbackTargetNodeId?: string

  /** 拆分 / 合并 / Switch 模式下可复用的分支定义 */
  branches?: LogicBranch[]

  /** Merge 模式：显式声明需要聚合的上游节点 ID；默认聚合所有上游 */
  mergeFromNodeIds?: string[]
  /** Merge 策略：all-聚合所有、first-取第一个成功的结果、custom-预留扩展 */
  mergeStrategy?: 'all' | 'first' | 'custom'

  /**
   * Switch 模式：输入变量路径（如 \"节点名.字段\"）
   * 实际值由引擎在执行时根据 nodeOutputs/globalVariables 解析
   */
  switchInput?: string
}

export interface LogicNodeConfig extends BaseNodeConfig {
  type: 'LOGIC'
  config: LogicNodeConfigData
}

// ============================================
// Union Types
// ============================================

/**
 * Union type of all node configurations
 */
export type NodeConfig =
  | InputNodeConfig
  | ProcessNodeConfig
  | CodeNodeConfig
  | OutputNodeConfig
  | LogicNodeConfig

/**
 * Union type of all node config data types
 */
export type NodeConfigData =
  | InputNodeConfigData
  | ProcessNodeConfigData
  | CodeNodeConfigData
  | OutputNodeConfigData
  | LogicNodeConfigData

// ============================================
// Edge Configuration
// ============================================

/**
 * Edge (connection) configuration between nodes
 */
export interface EdgeConfig {
  /** Unique edge identifier */
  id: string
  /** Source node ID */
  source: string
  /** Target node ID */
  target: string
  /** Source handle identifier */
  sourceHandle?: string | null
  /** Target handle identifier */
  targetHandle?: string | null
}

// ============================================
// Workflow Configuration
// ============================================

/**
 * Global variables for workflow execution
 */
export interface WorkflowGlobalVariables {
  [key: string]: string | number | boolean
}

/**
 * Complete workflow configuration
 */
export interface WorkflowConfig {
  /** Configuration version */
  version: number
  /** Array of node configurations */
  nodes: NodeConfig[]
  /** Array of edge configurations */
  edges: EdgeConfig[]
  /** Global variables accessible to all nodes */
  globalVariables?: WorkflowGlobalVariables
  /** Workflow execution settings */
  settings?: WorkflowSettings
  /** Workflow manual/documentation - operation guide for the workflow */
  manual?: string
}

// ============================================
// Execution Types
// ============================================

/**
 * Node output data structure
 */
export interface NodeOutput {
  [key: string]: unknown
}

/**
 * Execution context passed between nodes
 */
export interface ExecutionContext {
  /** Initial input data */
  input: Record<string, unknown>
  /** Outputs from completed nodes */
  nodeOutputs: Map<string, NodeOutput>
  /** Global variables */
  globalVariables: Map<string, unknown>
  /** Execution start time */
  startTime?: Date
  /** Timeout timestamp */
  timeoutAt?: Date
}

/**
 * Token usage statistics for AI operations
 */
export interface TokenUsage {
  /** Tokens used in prompt */
  promptTokens: number
  /** Tokens used in completion */
  completionTokens: number
  /** Total tokens used */
  totalTokens: number
}

/**
 * Execution status for nodes and workflows
 */
export type ExecutionStatus = 'success' | 'error' | 'pending' | 'running' | 'cancelled' | 'timeout'

/**
 * Result of a single node execution
 */
export interface NodeExecutionResult {
  /** Node identifier */
  nodeId: string
  /** Node name */
  nodeName?: string
  /** Execution status */
  status: 'success' | 'error'
  /** Node output data */
  output?: NodeOutput
  /** Error message if failed */
  error?: string
  /** Execution duration in milliseconds */
  duration: number
  /** Token usage for AI nodes */
  tokenUsage?: TokenUsage
  /** Timestamp when node started */
  startedAt?: string
  /** Timestamp when node completed */
  completedAt?: string
}

/**
 * Result of workflow execution
 */
export interface WorkflowExecutionResult {
  /** Overall execution status */
  status: 'completed' | 'failed' | 'cancelled' | 'timeout'
  /** Final output data */
  output?: NodeOutput
  /** Error message if failed */
  error?: string
  /** Results from each node */
  nodeResults: NodeExecutionResult[]
  /** Total execution duration in milliseconds */
  totalDuration: number
  /** Total tokens used across all AI nodes */
  totalTokens: number
  /** Generated output files */
  outputFiles?: OutputFileResult[]
  /** Execution ID for reference */
  executionId?: string
}

/**
 * Output file information
 */
export interface OutputFileResult {
  /** Unique file identifier */
  id: string
  /** File name */
  fileName: string
  /** Output format */
  format: OutputFormat
  /** MIME type */
  mimeType: string
  /** File size in bytes */
  size: number
  /** Download URL */
  url: string
  /** Node that generated this file */
  nodeId: string
  /** Current download count */
  downloadCount?: number
  /** Maximum allowed downloads */
  maxDownloads?: number
  /** Expiration timestamp */
  expiresAt?: string
  /** Creation timestamp */
  createdAt: string
}

// ============================================
// Storage Types
// ============================================

/**
 * Storage provider type
 */
export type StorageType = 'LOCAL' | 'ALIYUN_OSS' | 'AWS_S3' | 'CUSTOM'

// ============================================
// Type Guards
// ============================================

/**
 * Type guard to check if a node is an INPUT node
 */
export function isInputNode(node: NodeConfig): node is InputNodeConfig {
  return node.type === 'INPUT'
}

/**
 * Type guard to check if a node is a PROCESS node
 */
export function isProcessNode(node: NodeConfig): node is ProcessNodeConfig {
  return node.type === 'PROCESS'
}

/**
 * Type guard to check if a node uses AI
 */
export function isAINode(node: NodeConfig): node is ProcessNodeConfig {
  return node.type === 'PROCESS'
}
