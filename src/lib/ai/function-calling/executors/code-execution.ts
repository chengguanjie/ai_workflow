import type {
  ToolExecutor,
  ToolDefinition,
  ToolCallResult,
  ToolExecutionContext,
} from '../types'
import { executeSandboxedCode } from '@/lib/code-execution/execute'

type SupportedLanguage = 'javascript' | 'typescript' | 'python'

export class CodeExecutionToolExecutor implements ToolExecutor {
  name = 'code_execution'
  description =
    '受控代码执行：在隔离沙箱中运行 JavaScript/TypeScript/Python 代码'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'language',
          type: 'string',
          description: '代码语言：javascript / typescript / python',
          required: true,
          enum: ['javascript', 'typescript', 'python'],
        },
        {
          name: 'code',
          type: 'string',
          description: '要执行的代码内容',
          required: true,
        },
        {
          name: 'input',
          type: 'object',
          description:
            '可选的输入数据，会作为 input 变量注入到代码执行环境中',
          required: false,
        },
        {
          name: 'timeoutMs',
          type: 'number',
          description: '执行超时时间（毫秒），默认 2000，最大 10000',
          required: false,
        },
        {
          name: 'maxOutputSize',
          type: 'number',
          description:
            '最大输出大小（字符数），用于限制 stdout/stderr，默认 32000',
          required: false,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    const startedAt = Date.now()

    const language = String(
      (args.language as SupportedLanguage | undefined) || 'javascript'
    ) as SupportedLanguage
    const code = String(args.code || '').trim()

    if (!code) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: '缺少必需参数: code',
        duration: Date.now() - startedAt,
      }
    }

    // 允许在测试模式下始终启用执行（用于单元测试）
    const enabled =
      process.env.CODE_EXECUTION_ENABLED === 'true' || context.testMode === true

    try {
      const result = await executeSandboxedCode({
        enabled,
        language,
        code,
        input: (args.input as Record<string, unknown>) || {},
        timeoutMs: (args.timeoutMs as number | undefined) ?? undefined,
        maxOutputSize: (args.maxOutputSize as number | undefined) ?? undefined,
      })

      return {
        toolCallId: '',
        toolName: this.name,
        success: result.ok,
        result: {
          ok: result.ok,
          result: result.result,
          logs: result.logs,
          durationMs: result.durationMs,
        },
        error: result.ok ? undefined : (result.result as any)?.error,
        duration: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startedAt,
      }
    }
  }
}
