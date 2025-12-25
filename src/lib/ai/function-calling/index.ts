/**
 * AI Function Calling 模块
 * 
 * 提供完整的 AI 工具调用支持：
 * - 工具定义和类型
 * - 格式转换（OpenAI/Claude）
 * - 工具执行器
 * - Function Calling 服务
 */

// 类型导出
export type {
  ToolDefinition,
  ToolParameter,
  ToolCall,
  ToolCallResult,
  ToolExecutionContext,
  ToolExecutor,
  ToolConfig,
  OpenAITool,
  ClaudeTool,
  ClaudeToolUse,
  ChatRequestWithTools,
  ChatResponseWithTools,
  JSONSchema,
  JSONSchemaProperty,
  AIProviderFormat,
} from './types'

// 转换器
export {
  toOpenAIFormat,
  toClaudeFormat,
  convertTools,
  toolConfigToDefinition,
  toolConfigsToDefinitions,
  getProviderFormat,
  validateToolDefinition,
} from './converter'

// 执行器
export {
  toolRegistry,
  NotificationToolExecutor,
  HttpToolExecutor,
  createFeishuNotificationTool,
  createDingtalkNotificationTool,
  createWecomNotificationTool,
  createHttpTool,
} from './executors'

// 服务
export {
  FunctionCallingService,
  functionCallingService,
} from './service'

export type { FunctionCallingServiceConfig } from './service'

// 工具名称映射
export {
  mapUIToolToExecutor,
  mapExecutorToUITool,
  getNotificationPlatform,
  isNotificationTool,
  isToolImplemented,
  getUnimplementedToolMessage,
} from './tool-name-mapper'

// 初始化默认工具
import { toolRegistry } from './executors'
import { NotificationToolExecutor } from './executors/notification'
import { HttpToolExecutor } from './executors/http'

// 工具初始化状态
let toolsInitialized = false

/**
 * 初始化默认工具执行器（防重复初始化）
 */
export function initializeDefaultTools(): void {
  if (toolsInitialized) {
    return
  }
  
  // 注册通用通知工具
  if (!toolRegistry.has('send_notification')) {
    toolRegistry.register(new NotificationToolExecutor())
  }
  
  // 注册通用 HTTP 工具
  if (!toolRegistry.has('http_request')) {
    toolRegistry.register(new HttpToolExecutor())
  }
  
  toolsInitialized = true
  console.log('[FunctionCalling] 已初始化默认工具')
}

/**
 * 确保工具已初始化（用于处理器等需要工具的场景）
 */
export function ensureToolsInitialized(): void {
  initializeDefaultTools()
}

/**
 * 根据工具配置初始化工具
 */
export function initializeToolsFromConfig(configs: Array<{
  name: string
  type: 'notification' | 'http'
  config: Record<string, unknown>
}>): void {
  for (const cfg of configs) {
    switch (cfg.type) {
      case 'notification': {
        const executor = new NotificationToolExecutor({
          webhookUrl: cfg.config.webhookUrl as string,
          platform: cfg.config.platform as 'feishu' | 'dingtalk' | 'wecom',
        })
        executor.name = cfg.name
        toolRegistry.register(executor)
        break
      }
      case 'http': {
        const executor = new HttpToolExecutor({
          baseUrl: cfg.config.baseUrl as string,
          defaultHeaders: cfg.config.headers as Record<string, string>,
        })
        executor.name = cfg.name
        toolRegistry.register(executor)
        break
      }
    }
  }
}
