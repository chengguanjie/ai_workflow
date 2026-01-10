/**
 * 工具执行器注册表
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'

// 导出所有执行器
export { 
  NotificationToolExecutor,
  createFeishuNotificationTool,
  createDingtalkNotificationTool,
  createWecomNotificationTool,
} from './notification'

export { 
  HttpToolExecutor,
  createHttpTool,
} from './http'

export { FeishuBitableToolExecutor } from './feishu-bitable'
export { WechatMpToolExecutor } from './wechat-mp'
export { DouyinVideoToolExecutor } from './douyin-video'
export { WechatChannelsToolExecutor } from './wechat-channels'
export { XiaohongshuToolExecutor } from './xiaohongshu'
export { MultimodalToolExecutor, ImageGenerationToolExecutor, VideoGenerationToolExecutor, AudioTTSToolExecutor } from './multimodal'
export { CodeExecutionToolExecutor } from './code-execution'
export { 
  MCPToolExecutor, 
  createMCPToolExecutor,
  resolveVariables,
  resolveVariablePath,
  resolveVariableString,
  validateVariableRefs,
  containsVariableRef,
} from './mcp'

/**
 * 工具执行器注册表
 */
class ToolExecutorRegistry {
  private executors: Map<string, ToolExecutor> = new Map()

  /**
   * 注册工具执行器
   */
  register(executor: ToolExecutor): void {
    this.executors.set(executor.name, executor)
    console.log(`[ToolRegistry] 已注册工具: ${executor.name}`)
  }

  /**
   * 批量注册工具执行器
   */
  registerAll(executors: ToolExecutor[]): void {
    for (const executor of executors) {
      this.register(executor)
    }
  }

  /**
   * 获取工具执行器
   */
  get(name: string): ToolExecutor | undefined {
    return this.executors.get(name)
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.executors.has(name)
  }

  /**
   * 获取所有工具定义
   */
  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.executors.values()).map(e => e.getDefinition())
  }

  /**
   * 按类别获取工具定义
   */
  getDefinitionsByCategory(category: string): ToolDefinition[] {
    return Array.from(this.executors.values())
      .filter(e => e.category === category)
      .map(e => e.getDefinition())
  }

  /**
   * 执行工具
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    const executor = this.executors.get(toolName)
    
    if (!executor) {
      return {
        toolCallId: '',
        toolName,
        success: false,
        error: `未找到工具执行器: ${toolName}`,
      }
    }

    const startTime = Date.now()
    
    try {
      const result = await executor.execute(args, context)
      result.duration = Date.now() - startTime
      return result
    } catch (error) {
      return {
        toolCallId: '',
        toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 获取所有已注册的工具名称
   */
  getRegisteredTools(): string[] {
    return Array.from(this.executors.keys())
  }

  /**
   * 清除所有注册的执行器
   */
  clear(): void {
    this.executors.clear()
  }
}

// 全局单例
export const toolRegistry = new ToolExecutorRegistry()
