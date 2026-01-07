/**
 * MCP (Model Context Protocol) Type Definitions
 * 
 * This file defines all TypeScript interfaces for MCP server configuration,
 * connections, tools, and JSON-RPC message types.
 */

// ============================================================================
// Server Configuration Types
// ============================================================================

/**
 * Transport protocol types supported by MCP
 */
export type MCPTransportType = 'sse' | 'http'

/**
 * Authentication types for MCP server connections
 */
export type MCPAuthType = 'none' | 'api-key' | 'bearer'

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** Unique identifier for the server configuration */
  id: string
  /** Display name for the server */
  name: string
  /** Server URL endpoint */
  url: string
  /** Transport protocol (SSE or HTTP) */
  transport: MCPTransportType
  /** Authentication type */
  authType: MCPAuthType
  /** API key for authentication (encrypted in storage) */
  apiKey?: string
  /** Custom HTTP headers */
  headers?: Record<string, string>
  /** Connection timeout in milliseconds */
  timeout?: number
  /** Whether this is a preset configuration */
  isPreset?: boolean
  /** Preset type identifier */
  presetType?: 'modelscope' | string
  /** Creation timestamp */
  createdAt?: Date
  /** Last update timestamp */
  updatedAt?: Date
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Connection status
 */
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

/**
 * MCP Server information returned after connection
 */
export interface MCPServerInfo {
  /** Server name */
  name: string
  /** Server version */
  version: string
  /** Protocol version supported */
  protocolVersion?: string
}

/**
 * MCP Server capabilities
 */
export interface MCPCapabilities {
  /** Whether the server supports tools */
  tools?: {
    listChanged?: boolean
  }
  /** Whether the server supports resources */
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  /** Whether the server supports prompts */
  prompts?: {
    listChanged?: boolean
  }
  /** Whether the server supports logging */
  logging?: Record<string, unknown>
  /** Experimental capabilities */
  experimental?: Record<string, unknown>
}

/**
 * MCP Connection state
 */
export interface MCPConnection {
  /** Connection identifier */
  id: string
  /** Server configuration */
  config: MCPServerConfig
  /** Server information */
  serverInfo?: MCPServerInfo
  /** Server capabilities */
  capabilities?: MCPCapabilities
  /** Current connection status */
  status: MCPConnectionStatus
  /** Error message if status is 'error' */
  error?: string
  /** Connection timestamp */
  connectedAt?: Date
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * JSON Schema type for tool parameters
 */
export interface JSONSchema {
  type?: string | string[]
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  description?: string
  default?: unknown
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  additionalProperties?: boolean | JSONSchema
  oneOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  allOf?: JSONSchema[]
  $ref?: string
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  /** Tool name (unique identifier) */
  name: string
  /** Human-readable description */
  description?: string
  /** Input parameter schema */
  inputSchema: {
    type: 'object'
    properties?: Record<string, JSONSchema>
    required?: string[]
    additionalProperties?: boolean
  }
}

/**
 * MCP Tool content types
 */
export type MCPContentType = 'text' | 'image' | 'resource'

/**
 * MCP Tool result content item
 */
export interface MCPContent {
  /** Content type */
  type: MCPContentType
  /** Text content (for type 'text') */
  text?: string
  /** Base64 encoded data (for type 'image') */
  data?: string
  /** MIME type (for type 'image' or 'resource') */
  mimeType?: string
  /** Resource URI (for type 'resource') */
  uri?: string
}

/**
 * MCP Tool call result
 */
export interface MCPToolResult {
  /** Result content array */
  content: MCPContent[]
  /** Whether the result represents an error */
  isError?: boolean
}

// ============================================================================
// JSON-RPC Types (MCP uses JSON-RPC 2.0)
// ============================================================================

/**
 * JSON-RPC 2.0 Request
 */
export interface MCPRequest {
  /** JSON-RPC version (always "2.0") */
  jsonrpc: '2.0'
  /** Request identifier */
  id: string | number
  /** Method name */
  method: string
  /** Method parameters */
  params?: unknown
}

/**
 * JSON-RPC 2.0 Error object
 */
export interface MCPJsonRpcError {
  /** Error code */
  code: number
  /** Error message */
  message: string
  /** Additional error data */
  data?: unknown
}

/**
 * JSON-RPC 2.0 Response
 */
export interface MCPResponse {
  /** JSON-RPC version (always "2.0") */
  jsonrpc: '2.0'
  /** Request identifier (matches request) */
  id: string | number
  /** Result (present on success) */
  result?: unknown
  /** Error (present on failure) */
  error?: MCPJsonRpcError
}

/**
 * JSON-RPC 2.0 Notification (no id, no response expected)
 */
export interface MCPNotification {
  /** JSON-RPC version (always "2.0") */
  jsonrpc: '2.0'
  /** Method name */
  method: string
  /** Method parameters */
  params?: unknown
}

// ============================================================================
// Tool Configuration Types (for workflow nodes)
// ============================================================================

/**
 * Variable reference for parameter mapping
 */
export interface VariableRef {
  /** Variable reference type */
  type: 'variable'
  /** Variable path (e.g., "input.message" or "node_1.output") */
  path: string
}

/**
 * Parameter value (can be static or variable reference)
 */
export type ParameterValue = string | number | boolean | null | VariableRef | Record<string, unknown>

/**
 * Selected tool configuration
 */
export interface MCPSelectedTool {
  /** Tool name */
  name: string
  /** Whether the tool is enabled */
  enabled: boolean
  /** Parameter mappings (parameter name -> value or variable reference) */
  parameterMappings: Record<string, ParameterValue>
}

/**
 * MCP Tool node configuration (stored in workflow node config)
 */
export interface MCPToolNodeConfig {
  /** Server configuration */
  mcpServer: MCPServerConfig
  /** Selected tools with their configurations */
  selectedTools: MCPSelectedTool[]
  /** Whether to retry on error */
  retryOnError?: boolean
  /** Maximum retry attempts */
  maxRetries?: number
  /** Timeout in milliseconds */
  timeoutMs?: number
}

// ============================================================================
// Error Types (Re-exported from errors.ts for backward compatibility)
// ============================================================================

// Import and re-export error types from the dedicated error module
export { 
  MCPErrorCode, 
  MCPError,
  isRetryableError,
  isRetryableErrorCode,
  createMCPError,
  classifyError,
  formatErrorForUI,
  formatErrorForLog,
  ERROR_MESSAGES_ZH,
  ERROR_MESSAGES_EN,
  ERROR_SUGGESTIONS,
  RETRYABLE_ERROR_CODES,
} from './errors'

/**
 * Legacy MCP error class - kept for backward compatibility
 * @deprecated Use MCPError from './errors' instead
 */
export class MCPClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'MCPClientError'
  }
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * ModelScope MCP preset configuration
 */
export interface ModelScopeMCPPreset {
  /** Preset identifier */
  id: string
  /** Display name */
  name: string
  /** Server URL */
  url: string
  /** Description */
  description: string
  /** Available tools */
  tools: string[]
  /** Category for grouping */
  category?: 'data' | 'search' | 'utility' | 'ai'
}

/**
 * ModelScope MCP presets - 魔搭平台 MCP 服务预设配置
 */
export const MODELSCOPE_MCP_PRESETS: Record<string, ModelScopeMCPPreset> = {
  fetch: {
    id: 'modelscope-fetch',
    name: '网页内容抓取',
    url: 'https://mcp.modelscope.cn/servers/fetch',
    description: '抓取网页内容并转换为 Markdown 格式，支持动态渲染页面',
    tools: ['fetch'],
    category: 'data',
  },
  search: {
    id: 'modelscope-search',
    name: '网络搜索',
    url: 'https://mcp.modelscope.cn/servers/search',
    description: '搜索互联网内容，获取最新信息',
    tools: ['search'],
    category: 'search',
  },
  filesystem: {
    id: 'modelscope-filesystem',
    name: '文件系统',
    url: 'https://mcp.modelscope.cn/servers/filesystem',
    description: '文件系统操作，支持读写文件和目录管理',
    tools: ['read_file', 'write_file', 'list_directory'],
    category: 'utility',
  },
  time: {
    id: 'modelscope-time',
    name: '时间服务',
    url: 'https://mcp.modelscope.cn/servers/time',
    description: '获取当前时间、时区转换等时间相关操作',
    tools: ['get_current_time', 'convert_timezone'],
    category: 'utility',
  },
  weather: {
    id: 'modelscope-weather',
    name: '天气查询',
    url: 'https://mcp.modelscope.cn/servers/weather',
    description: '查询全球城市天气信息',
    tools: ['get_weather'],
    category: 'data',
  },
  translation: {
    id: 'modelscope-translation',
    name: '翻译服务',
    url: 'https://mcp.modelscope.cn/servers/translation',
    description: '多语言翻译服务，支持主流语言互译',
    tools: ['translate'],
    category: 'ai',
  },
}
