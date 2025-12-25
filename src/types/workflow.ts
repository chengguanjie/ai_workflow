/**
 * Workflow Type Definitions
 * 
 * Provides precise TypeScript types for workflow configuration,
 * replacing generic Record types with specific interfaces.
 * 
 * Simplified version: Only INPUT and PROCESS node types are supported.
 */

// ============================================
// Basic Types
// ============================================

export type NodeType = 'INPUT' | 'PROCESS'

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
}

export interface ProcessNodeConfig extends BaseNodeConfig {
  type: 'PROCESS'
  config: ProcessNodeConfigData
}

// ============================================
// Union Types
// ============================================

/**
 * Union type of all node configurations
 */
export type NodeConfig = InputNodeConfig | ProcessNodeConfig

/**
 * Union type of all node config data types
 */
export type NodeConfigData = InputNodeConfigData | ProcessNodeConfigData

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
