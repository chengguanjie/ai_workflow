// 工作流类型定义

export type NodeType = 'INPUT' | 'PROCESS' | 'CODE' | 'OUTPUT' | 'DATA' | 'IMAGE' | 'VIDEO' | 'AUDIO'

export type AIProviderType = 'SHENSUAN' | 'OPENROUTER'

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

// 输入字段定义 - 包含名称和可输入内容的文本框
export interface InputField {
  id: string
  name: string // 字段名称，用于其他节点引用
  value: string // 字段内容
  height?: number // 文本框高度，默认 80
}

// 知识库/参考文本定义
export interface KnowledgeItem {
  id: string
  name: string
  content: string
}

// 基础节点配置
export interface BaseNodeConfig {
  id: string
  type: NodeType
  name: string
  position: { x: number; y: number }
  [key: string]: unknown // Index signature for compatibility
}

// 输入节点配置 - 用户添加多个输入文本框
export interface InputNodeConfig extends BaseNodeConfig {
  type: 'INPUT'
  config: {
    fields: InputField[]
  }
}

// 处理节点配置 - AI处理，有知识库和提示词
export interface ProcessNodeConfig extends BaseNodeConfig {
  type: 'PROCESS'
  config: {
    aiConfigId?: string // 企业 AI 配置 ID
    model?: string
    knowledgeItems?: KnowledgeItem[] // 多个知识库文本
    systemPrompt?: string
    userPrompt?: string // 支持 {{节点名.字段名}} 引用
    temperature?: number
    maxTokens?: number
  }
}

// Code节点配置 - AI帮助写代码
export interface CodeNodeConfig extends BaseNodeConfig {
  type: 'CODE'
  config: {
    aiConfigId?: string // 企业 AI 配置 ID
    model?: string
    prompt?: string // 描述需要什么代码
    language?: 'javascript' | 'typescript' | 'python' | 'sql' | 'other'
    code?: string // 代码
    executionResult?: {
      success: boolean
      output?: string
      error?: string
      executionTime?: number
    }
  }
}

// 输出节点配置 - 制定输出格式
export interface OutputNodeConfig extends BaseNodeConfig {
  type: 'OUTPUT'
  config: {
    aiConfigId?: string // 企业 AI 配置 ID
    model?: string
    prompt?: string // 描述输出内容和格式，支持引用前面节点
    format?: OutputFormat
    templateName?: string // 模板名称（用于word/excel）
    fileName?: string // 输出文件名（支持变量如 {{日期}}）
    downloadUrl?: string // 文件下载基础地址
    temperature?: number
    maxTokens?: number
  }
}

// 导入文件项定义
export interface ImportedFile {
  id: string
  name: string // 文件名
  url: string // 文件 URL
  size?: number // 文件大小（字节）
  type?: string // MIME 类型
  uploadedAt?: string // 上传时间
}

// 数据节点配置 - 导入 Excel/CSV 数据
export interface DataNodeConfig extends BaseNodeConfig {
  type: 'DATA'
  config: {
    files?: ImportedFile[] // 导入的文件列表
    prompt?: string // 数据处理提示词
  }
}

// 图片节点配置 - 导入图片
export interface ImageNodeConfig extends BaseNodeConfig {
  type: 'IMAGE'
  config: {
    files?: ImportedFile[] // 导入的图片列表
    prompt?: string // 图片处理提示词
  }
}

// 视频节点配置 - 导入视频或图片
export interface VideoNodeConfig extends BaseNodeConfig {
  type: 'VIDEO'
  config: {
    files?: ImportedFile[] // 导入的视频/图片列表
    prompt?: string // 视频处理提示词
  }
}

// 音频节点配置 - 导入音频
export interface AudioNodeConfig extends BaseNodeConfig {
  type: 'AUDIO'
  config: {
    files?: ImportedFile[] // 导入的音频列表
    prompt?: string // 音频处理提示词
  }
}

export type NodeConfig =
  | InputNodeConfig
  | ProcessNodeConfig
  | CodeNodeConfig
  | OutputNodeConfig
  | DataNodeConfig
  | ImageNodeConfig
  | VideoNodeConfig
  | AudioNodeConfig

// 连线配置
export interface EdgeConfig {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

// 工作流配置
export interface WorkflowConfig {
  version: number
  nodes: NodeConfig[]
  edges: EdgeConfig[]
  globalVariables?: Record<string, unknown>
}

// 执行上下文
export interface ExecutionContext {
  input: Record<string, unknown>
  nodeOutputs: Map<string, Record<string, unknown>>
  globalVariables: Map<string, unknown>
}

// 节点执行结果
export interface NodeExecutionResult {
  nodeId: string
  status: 'success' | 'error'
  output?: Record<string, unknown>
  error?: string
  duration: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// 工作流执行结果
export interface WorkflowExecutionResult {
  status: 'completed' | 'failed'
  output?: Record<string, unknown>
  error?: string
  nodeResults: NodeExecutionResult[]
  totalDuration: number
  totalTokens: number
  outputFiles?: OutputFileResult[] // 生成的输出文件
}

// 输出文件信息
export interface OutputFileResult {
  id: string
  fileName: string
  format: OutputFormat
  mimeType: string
  size: number
  url: string
  nodeId: string
  downloadCount?: number
  maxDownloads?: number
  expiresAt?: string
  createdAt: string
}

// 存储类型
export type StorageType = 'LOCAL' | 'ALIYUN_OSS' | 'AWS_S3' | 'CUSTOM'
