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
  FeishuBitableToolExecutor,
  WechatMpToolExecutor,
  DouyinVideoToolExecutor,
  WechatChannelsToolExecutor,
  XiaohongshuToolExecutor,
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
import { FeishuBitableToolExecutor } from './executors/feishu-bitable'
import { WechatMpToolExecutor } from './executors/wechat-mp'
import { XiaohongshuToolExecutor } from './executors/xiaohongshu'
import { DouyinVideoToolExecutor } from './executors/douyin-video'
import { WechatChannelsToolExecutor } from './executors/wechat-channels'
import {
  MultimodalToolExecutor,
  ImageGenerationToolExecutor,
  VideoGenerationToolExecutor,
  AudioTTSToolExecutor,
} from './executors/multimodal'
import { CodeExecutionToolExecutor } from './executors/code-execution'

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

  // 注册飞书多维表格工具
  if (!toolRegistry.has('feishu_bitable')) {
    toolRegistry.register(new FeishuBitableToolExecutor())
  }

  // 注册微信公众号工具
  if (!toolRegistry.has('wechat_mp')) {
    toolRegistry.register(new WechatMpToolExecutor())
  }

  // 注册小红书工具
  if (!toolRegistry.has('xiaohongshu')) {
    toolRegistry.register(new XiaohongshuToolExecutor())
  }

  // 注册抖音视频工具
  if (!toolRegistry.has('douyin_video')) {
    toolRegistry.register(new DouyinVideoToolExecutor())
  }

  // 注册视频号工具
  if (!toolRegistry.has('wechat_channels')) {
    toolRegistry.register(new WechatChannelsToolExecutor())
  }

  // 注册多模态 AI 工具（图片/视频/音频生成）
  if (!toolRegistry.has('multimodal_ai')) {
    toolRegistry.register(new MultimodalToolExecutor())
  }

  // 注册拆分后的单模态生成工具
  if (!toolRegistry.has('image_gen_ai')) {
    toolRegistry.register(new ImageGenerationToolExecutor())
  }
  if (!toolRegistry.has('video_gen_ai')) {
    toolRegistry.register(new VideoGenerationToolExecutor())
  }
  if (!toolRegistry.has('audio_tts_ai')) {
    toolRegistry.register(new AudioTTSToolExecutor())
  }

  // 注册代码执行工具（受控沙箱执行）
  if (!toolRegistry.has('code_execution')) {
    toolRegistry.register(new CodeExecutionToolExecutor())
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
