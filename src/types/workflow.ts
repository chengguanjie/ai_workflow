/**
 * Workflow Type Definitions
 * 
 * Provides precise TypeScript types for workflow configuration,
 * replacing generic Record types with specific interfaces.
 * 
 * Requirements: 9.2
 */

// ============================================
// Basic Types
// ============================================

export type NodeType = 'TRIGGER' | 'INPUT' | 'PROCESS' | 'CODE' | 'OUTPUT' | 'DATA' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'CONDITION' | 'LOOP' | 'HTTP' | 'MERGE' | 'IMAGE_GEN' | 'NOTIFICATION' | 'SWITCH' | 'GROUP'

/**
 * Trigger type for TRIGGER nodes
 */
export type TriggerType = 'MANUAL' | 'WEBHOOK' | 'SCHEDULE'

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

export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'sql' | 'other'

// ============================================
// Workflow Settings
// ============================================

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
 * Input field definition for INPUT nodes
 */
export interface InputField {
  /** Unique field identifier */
  id: string
  /** Field name for reference by other nodes */
  name: string
  /** Field content/value */
  value: string
  /** Text area height in pixels (default: 80) */
  height?: number
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
  /** Index signature for compatibility */
  [key: string]: unknown
}

// ============================================
// Specific Node Configurations
// ============================================

/**
 * TRIGGER node configuration - Workflow trigger configuration
 */
export interface TriggerNodeConfigData {
  /** Trigger type: manual, webhook, or schedule */
  triggerType: TriggerType
  /** Whether the trigger is enabled */
  enabled?: boolean
  /** Webhook path (auto-generated, for WEBHOOK type) */
  webhookPath?: string
  /** Whether webhook has a secret configured */
  hasWebhookSecret?: boolean
  /** Cron expression (for SCHEDULE type) */
  cronExpression?: string
  /** Timezone for cron (default: Asia/Shanghai) */
  timezone?: string
  /** Default input template (JSON) */
  inputTemplate?: Record<string, unknown>
  /** Retry on failure */
  retryOnFail?: boolean
  /** Maximum retry attempts */
  maxRetries?: number
  /** Associated trigger ID in database (for syncing) */
  triggerId?: string
}

export interface TriggerNodeConfig extends BaseNodeConfig {
  type: 'TRIGGER'
  config: TriggerNodeConfigData
}

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
}

export interface ProcessNodeConfig extends BaseNodeConfig {
  type: 'PROCESS'
  config: ProcessNodeConfigData
}

/**
 * Code execution result
 */
export interface CodeExecutionResult {
  /** Whether execution succeeded */
  success: boolean
  /** Execution output */
  output?: string
  /** Error message if failed */
  error?: string
  /** Execution time in milliseconds */
  executionTime?: number
}

/**
 * CODE node configuration - AI-assisted code generation
 */
export interface CodeNodeConfigData extends NodeAIConfig {
  /** Description of required code */
  prompt?: string
  /** Programming language */
  language?: CodeLanguage
  /** Generated/edited code */
  code?: string
  /** Last execution result */
  executionResult?: CodeExecutionResult
}

export interface CodeNodeConfig extends BaseNodeConfig {
  type: 'CODE'
  config: CodeNodeConfigData
}

/**
 * OUTPUT node configuration - Output formatting
 */
export interface OutputNodeConfigData extends NodeAIConfig {
  /** Output description and format prompt */
  prompt?: string
  /** Output format type */
  format?: OutputFormat
  /** Template name for word/excel */
  templateName?: string
  /** Output file name (supports variables like {{date}}) */
  fileName?: string
  /** Base URL for file downloads */
  downloadUrl?: string
}

export interface OutputNodeConfig extends BaseNodeConfig {
  type: 'OUTPUT'
  config: OutputNodeConfigData
}

// ============================================
// File and Media Node Configurations
// ============================================

/**
 * Imported file definition
 */
export interface ImportedFile {
  /** Unique file identifier */
  id: string
  /** Original file name */
  name: string
  /** File URL for access */
  url: string
  /** File size in bytes */
  size?: number
  /** MIME type */
  type?: string
  /** Upload timestamp */
  uploadedAt?: string
}

/**
 * Base configuration for file-based nodes
 */
export interface FileNodeConfigData {
  /** Imported files */
  files?: ImportedFile[]
  /** Processing prompt */
  prompt?: string
}

/**
 * DATA node configuration - Excel/CSV data import
 */
export interface DataNodeConfigData extends FileNodeConfigData {
  /** Data parsing options */
  parseOptions?: {
    /** Header row index (0-based) */
    headerRow?: number
    /** Skip empty rows */
    skipEmptyRows?: boolean
    /** Date format for parsing */
    dateFormat?: string
  }
}

export interface DataNodeConfig extends BaseNodeConfig {
  type: 'DATA'
  config: DataNodeConfigData
}

/**
 * IMAGE node configuration - Image import
 */
export interface ImageNodeConfigData extends FileNodeConfigData {
  /** Image processing options */
  processingOptions?: {
    /** Resize width */
    maxWidth?: number
    /** Resize height */
    maxHeight?: number
    /** Output format */
    outputFormat?: 'jpeg' | 'png' | 'webp'
    /** Quality (1-100) */
    quality?: number
  }
}

export interface ImageNodeConfig extends BaseNodeConfig {
  type: 'IMAGE'
  config: ImageNodeConfigData
}

/**
 * VIDEO node configuration - Video/image import
 */
export interface VideoNodeConfigData extends FileNodeConfigData {
  /** Video processing options */
  processingOptions?: {
    /** Extract frames */
    extractFrames?: boolean
    /** Frame interval in seconds */
    frameInterval?: number
    /** Generate thumbnail */
    generateThumbnail?: boolean
  }
}

export interface VideoNodeConfig extends BaseNodeConfig {
  type: 'VIDEO'
  config: VideoNodeConfigData
}

/**
 * AUDIO node configuration - Audio import
 */
export interface AudioNodeConfigData extends FileNodeConfigData {
  /** Audio processing options */
  processingOptions?: {
    /** Transcribe audio to text */
    transcribe?: boolean
    /** Transcription language */
    language?: string
  }
}

export interface AudioNodeConfig extends BaseNodeConfig {
  type: 'AUDIO'
  config: AudioNodeConfigData
}

// ============================================
// Control Flow Node Configurations
// ============================================

/**
 * Condition operator types
 */
export type ConditionOperator =
  | 'equals'           // ==
  | 'notEquals'        // !=
  | 'greaterThan'      // >
  | 'lessThan'         // <
  | 'greaterOrEqual'   // >=
  | 'lessOrEqual'      // <=
  | 'contains'         // string contains
  | 'notContains'      // string not contains
  | 'startsWith'       // string starts with
  | 'endsWith'         // string ends with
  | 'isEmpty'          // is empty/null/undefined
  | 'isNotEmpty'       // is not empty

/**
 * Logic operator for combining conditions
 */
export type LogicOperator = 'AND' | 'OR'

/**
 * Single condition configuration
 */
export interface Condition {
  /** Variable to check (supports {{node.output.field}} syntax) */
  variable: string
  /** Comparison operator */
  operator: ConditionOperator
  /** Value to compare against */
  value?: string | number | boolean
  /** Logic operator with next condition */
  logic?: LogicOperator
}

/**
 * CONDITION node configuration - Conditional branching
 */
export interface ConditionNodeConfigData {
  /** Array of conditions to evaluate */
  conditions: Condition[]
  /** Evaluation mode: all conditions must be true (AND) or any (OR) */
  evaluationMode?: 'all' | 'any'
}

export interface ConditionNodeConfig extends BaseNodeConfig {
  type: 'CONDITION'
  config: ConditionNodeConfigData
}

// ============================================
// Loop Node Configuration
// ============================================

/**
 * Loop type
 */
export type LoopType = 'FOR' | 'WHILE'

/**
 * FOR loop configuration - iterate over arrays
 */
export interface ForLoopConfig {
  /** Array variable to iterate (supports {{node.output.items}} syntax) */
  arrayVariable: string
  /** Variable name for current item (accessible as {{loop.item}}) */
  itemName: string
  /** Variable name for current index (accessible as {{loop.index}}) */
  indexName?: string
}

/**
 * WHILE loop configuration - repeat until condition is false
 */
export interface WhileLoopConfig {
  /** Condition to evaluate each iteration */
  condition: Condition
  /** Maximum iterations to prevent infinite loops (default: 100) */
  maxIterations: number
}

/**
 * LOOP node configuration - iteration control
 */
export interface LoopNodeConfigData {
  /** Loop type: FOR (array iteration) or WHILE (condition-based) */
  loopType: LoopType
  /** FOR loop configuration */
  forConfig?: ForLoopConfig
  /** WHILE loop configuration */
  whileConfig?: WhileLoopConfig
  /** Maximum iterations safeguard (applies to both types, default: 1000) */
  maxIterations?: number
  /** Continue on error within loop body */
  continueOnError?: boolean
}

export interface LoopNodeConfig extends BaseNodeConfig {
  type: 'LOOP'
  config: LoopNodeConfigData
}

// ============================================
// Switch Node Configuration
// ============================================

/**
 * Single case definition for SWITCH node
 */
export interface SwitchCase {
  /** Unique case identifier */
  id: string
  /** Case label for display */
  label: string
  /** Value to match against (supports string, number, boolean) */
  value: string | number | boolean
  /** Whether this is the default case */
  isDefault?: boolean
}

/**
 * Match type for switch comparison
 */
export type SwitchMatchType = 'exact' | 'contains' | 'regex' | 'range'

/**
 * SWITCH node configuration - Multi-way branching based on value matching
 */
export interface SwitchNodeConfigData {
  /** Variable to switch on (supports {{node.output.field}} syntax) */
  switchVariable: string
  /** Array of case definitions */
  cases: SwitchCase[]
  /** Match type for comparison (default: 'exact') */
  matchType?: SwitchMatchType
  /** Case-insensitive matching for string comparison (default: false) */
  caseSensitive?: boolean
  /** Include default branch for unmatched values (default: true) */
  includeDefault?: boolean
}

export interface SwitchNodeConfig extends BaseNodeConfig {
  type: 'SWITCH'
  config: SwitchNodeConfigData
}

// ============================================
// HTTP Node Configuration
// ============================================

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * HTTP body content type
 */
export type HttpBodyType = 'json' | 'form' | 'text' | 'file' | 'none'

/**
 * HTTP authentication type
 */
export type HttpAuthType = 'none' | 'basic' | 'bearer' | 'apikey'

/**
 * HTTP request body configuration
 */
export interface HttpBodyConfig {
  /** Body content type */
  type: HttpBodyType
  /** Body content (string for text/json, object for form data) */
  content?: string | Record<string, unknown>
}

/**
 * API key authentication configuration
 */
export interface ApiKeyAuthConfig {
  /** Header or query parameter name */
  key: string
  /** API key value */
  value: string
  /** Where to add the API key */
  addTo: 'header' | 'query'
}

/**
 * HTTP authentication configuration
 */
export interface HttpAuthConfig {
  /** Authentication type */
  type: HttpAuthType
  /** Username for basic auth */
  username?: string
  /** Password for basic auth */
  password?: string
  /** Token for bearer auth */
  token?: string
  /** API key configuration */
  apiKey?: ApiKeyAuthConfig
}

/**
 * HTTP retry configuration
 */
export interface HttpRetryConfig {
  /** Maximum retry attempts (default: 3) */
  maxRetries: number
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay: number
  /** HTTP status codes to retry on */
  retryOnStatus?: number[]
}

/**
 * HTTP node configuration - External API calls
 */
export interface HttpNodeConfigData {
  /** HTTP method */
  method: HttpMethod
  /** Request URL (supports variables like {{node.url}}) */
  url: string
  /** Request headers */
  headers?: Record<string, string>
  /** Query parameters */
  queryParams?: Record<string, string>
  /** Request body */
  body?: HttpBodyConfig
  /** Authentication configuration */
  auth?: HttpAuthConfig
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Retry configuration */
  retry?: HttpRetryConfig
  /** Expected response type */
  responseType?: 'json' | 'text' | 'blob'
  /** Validate SSL certificates (default: true) */
  validateSSL?: boolean
}

export interface HttpNodeConfig extends BaseNodeConfig {
  type: 'HTTP'
  config: HttpNodeConfigData
}

// ============================================
// MERGE Node Configuration
// ============================================

/**
 * Merge strategy for parallel branches
 */
export type MergeStrategy = 'all' | 'any' | 'race'

/**
 * Error handling strategy for parallel execution
 */
export type ParallelErrorStrategy = 'fail_fast' | 'continue' | 'collect'

/**
 * MERGE node configuration - Merges multiple parallel branches
 */
export interface MergeNodeConfigData {
  /**
   * Merge strategy:
   * - 'all': Wait for all branches to complete (default)
   * - 'any': Continue when any branch completes
   * - 'race': Continue with first completed branch, cancel others
   */
  mergeStrategy: MergeStrategy

  /**
   * Error handling strategy:
   * - 'fail_fast': Fail immediately when any branch fails (default)
   * - 'continue': Continue with successful branches, collect errors
   * - 'collect': Wait for all branches, then report all errors
   */
  errorStrategy?: ParallelErrorStrategy

  /**
   * Timeout for waiting branches in milliseconds (default: 300000 = 5 min)
   * Only applies when mergeStrategy is 'all'
   */
  timeout?: number

  /**
   * Output mode:
   * - 'merge': Merge all branch outputs into a single object
   * - 'array': Collect all branch outputs as an array
   * - 'first': Use only the first completed branch output
   */
  outputMode?: 'merge' | 'array' | 'first'
}

export interface MergeNodeConfig extends BaseNodeConfig {
  type: 'MERGE'
  config: MergeNodeConfigData
}

// ============================================
// IMAGE_GEN Node Configuration
// ============================================

/**
 * Image generation provider type
 */
export type ImageGenProvider = 'OPENAI' | 'STABILITYAI' | 'ALIYUN_TONGYI' | 'SHENSUAN'

/**
 * Image size options
 */
export type ImageSize = '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024'

/**
 * Image generation quality
 */
export type ImageQuality = 'standard' | 'hd'

/**
 * IMAGE_GEN node configuration - AI image generation
 */
export interface ImageGenNodeConfigData extends NodeAIConfig {
  /** Image generation prompt (supports variables) */
  prompt?: string
  /** Negative prompt for things to avoid */
  negativePrompt?: string
  /** Image provider */
  provider?: ImageGenProvider
  /** Image generation model */
  imageModel?: string
  /** Image size */
  size?: ImageSize
  /** Image quality */
  quality?: ImageQuality
  /** Number of images to generate (1-4) */
  n?: number
  /** Style preset (provider-specific) */
  style?: string
  /** Reference image URL for image-to-image */
  referenceImageUrl?: string
  /** Output filename template */
  outputFileName?: string
}

export interface ImageGenNodeConfig extends BaseNodeConfig {
  type: 'IMAGE_GEN'
  config: ImageGenNodeConfigData
}

// ============================================
// NOTIFICATION Node Configuration
// ============================================

/**
 * Notification platform type
 */
export type NotificationPlatform = 'feishu' | 'dingtalk' | 'wecom'

/**
 * Notification message type
 */
export type NotificationMessageType = 'text' | 'markdown' | 'card'

/**
 * NOTIFICATION node configuration - Send notifications to messaging platforms
 */
export interface NotificationNodeConfigData {
  /** Target platform */
  platform: NotificationPlatform
  /** Webhook URL for the platform */
  webhookUrl: string
  /** Message type */
  messageType: NotificationMessageType
  /** Message content (supports {{variable}} syntax) */
  content: string
  /** Message title (for markdown and card types) */
  title?: string
  /** Phone numbers to @ mention (platform-specific) */
  atMobiles?: string[]
  /** Whether to @ all members */
  atAll?: boolean
}

export interface NotificationNodeConfig extends BaseNodeConfig {
  type: 'NOTIFICATION'
  config: NotificationNodeConfigData
}

// ============================================
// GROUP Node Configuration
// ============================================

/**
 * GROUP node configuration - Groups multiple nodes together
 */
export interface GroupNodeConfigData {
  /** IDs of nodes contained in this group */
  childNodeIds: string[]
  /** Group display name */
  label?: string
  /** Whether the group is collapsed */
  collapsed?: boolean
  /** Original positions of child nodes relative to group origin */
  childRelativePositions?: Record<string, NodePosition>
}

export interface GroupNodeConfig extends BaseNodeConfig {
  type: 'GROUP'
  config: GroupNodeConfigData
}

/**
 * Union type of all node configurations
 */
export type NodeConfig =
  | TriggerNodeConfig
  | InputNodeConfig
  | ProcessNodeConfig
  | CodeNodeConfig
  | OutputNodeConfig
  | DataNodeConfig
  | ImageNodeConfig
  | VideoNodeConfig
  | AudioNodeConfig
  | ConditionNodeConfig
  | LoopNodeConfig
  | SwitchNodeConfig
  | HttpNodeConfig
  | MergeNodeConfig
  | ImageGenNodeConfig
  | NotificationNodeConfig
  | GroupNodeConfig

/**
 * Union type of all node config data types
 */
export type NodeConfigData =
  | TriggerNodeConfigData
  | InputNodeConfigData
  | ProcessNodeConfigData
  | CodeNodeConfigData
  | OutputNodeConfigData
  | DataNodeConfigData
  | ImageNodeConfigData
  | VideoNodeConfigData
  | AudioNodeConfigData
  | ConditionNodeConfigData
  | LoopNodeConfigData
  | SwitchNodeConfigData
  | HttpNodeConfigData
  | MergeNodeConfigData
  | ImageGenNodeConfigData
  | NotificationNodeConfigData
  | GroupNodeConfigData

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
 * Type guard to check if a node is a TRIGGER node
 */
export function isTriggerNode(node: NodeConfig): node is TriggerNodeConfig {
  return node.type === 'TRIGGER'
}

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
 * Type guard to check if a node is a CODE node
 */
export function isCodeNode(node: NodeConfig): node is CodeNodeConfig {
  return node.type === 'CODE'
}

/**
 * Type guard to check if a node is an OUTPUT node
 */
export function isOutputNode(node: NodeConfig): node is OutputNodeConfig {
  return node.type === 'OUTPUT'
}

/**
 * Type guard to check if a node is a DATA node
 */
export function isDataNode(node: NodeConfig): node is DataNodeConfig {
  return node.type === 'DATA'
}

/**
 * Type guard to check if a node is an IMAGE node
 */
export function isImageNode(node: NodeConfig): node is ImageNodeConfig {
  return node.type === 'IMAGE'
}

/**
 * Type guard to check if a node is a VIDEO node
 */
export function isVideoNode(node: NodeConfig): node is VideoNodeConfig {
  return node.type === 'VIDEO'
}

/**
 * Type guard to check if a node is an AUDIO node
 */
export function isAudioNode(node: NodeConfig): node is AudioNodeConfig {
  return node.type === 'AUDIO'
}

/**
 * Type guard to check if a node is a CONDITION node
 */
export function isConditionNode(node: NodeConfig): node is ConditionNodeConfig {
  return node.type === 'CONDITION'
}

/**
 * Type guard to check if a node is a LOOP node
 */
export function isLoopNode(node: NodeConfig): node is LoopNodeConfig {
  return node.type === 'LOOP'
}

/**
 * Type guard to check if a node is an HTTP node
 */
export function isHttpNode(node: NodeConfig): node is HttpNodeConfig {
  return node.type === 'HTTP'
}

/**
 * Type guard to check if a node is a MERGE node
 */
export function isMergeNode(node: NodeConfig): node is MergeNodeConfig {
  return node.type === 'MERGE'
}

/**
 * Type guard to check if a node is a SWITCH node
 */
export function isSwitchNode(node: NodeConfig): node is SwitchNodeConfig {
  return node.type === 'SWITCH'
}

/**
 * Type guard to check if a node is an IMAGE_GEN node
 */
export function isImageGenNode(node: NodeConfig): node is ImageGenNodeConfig {
  return node.type === 'IMAGE_GEN'
}

/**
 * Type guard to check if a node is a NOTIFICATION node
 */
export function isNotificationNode(node: NodeConfig): node is NotificationNodeConfig {
  return node.type === 'NOTIFICATION'
}

/**
 * Type guard to check if a node is a GROUP node
 */
export function isGroupNode(node: NodeConfig): node is GroupNodeConfig {
  return node.type === 'GROUP'
}

/**
 * Type guard to check if a node uses AI
 */
export function isAINode(node: NodeConfig): node is ProcessNodeConfig | CodeNodeConfig | OutputNodeConfig | ImageGenNodeConfig {
  return node.type === 'PROCESS' || node.type === 'CODE' || node.type === 'OUTPUT' || node.type === 'IMAGE_GEN'
}

/**
 * Type guard to check if a node handles files
 */
export function isFileNode(node: NodeConfig): node is DataNodeConfig | ImageNodeConfig | VideoNodeConfig | AudioNodeConfig {
  return node.type === 'DATA' || node.type === 'IMAGE' || node.type === 'VIDEO' || node.type === 'AUDIO'
}

/**
 * Type guard to check if a node is a control flow node
 */
export function isControlFlowNode(node: NodeConfig): node is ConditionNodeConfig | LoopNodeConfig | MergeNodeConfig | SwitchNodeConfig {
  return node.type === 'CONDITION' || node.type === 'LOOP' || node.type === 'MERGE' || node.type === 'SWITCH'
}
