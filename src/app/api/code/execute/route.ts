import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import vm from 'vm'

// 代码执行超时时间（毫秒）
const EXECUTION_TIMEOUT = 5000

// 最大输出长度
const MAX_OUTPUT_LENGTH = 10000

interface ExecuteRequest {
  code: string
  language: string
  inputs?: Record<string, unknown>
}

interface ExecuteResult {
  success: boolean
  output?: string
  result?: unknown
  error?: string
  executionTime?: number
  logs?: string[]
}

export async function POST(request: NextRequest): Promise<NextResponse<ExecuteResult>> {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const body: ExecuteRequest = await request.json()
    const { code, language, inputs = {} } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: '代码不能为空' }, { status: 400 })
    }

    if (language !== 'javascript' && language !== 'typescript') {
      return NextResponse.json(
        { success: false, error: '目前只支持 JavaScript/TypeScript 执行' },
        { status: 400 }
      )
    }

    const result = await executeJavaScript(code, inputs)
    return NextResponse.json(result)
  } catch (error) {
    console.error('代码执行失败:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '执行失败' },
      { status: 500 }
    )
  }
}

async function executeJavaScript(
  code: string,
  inputs: Record<string, unknown>
): Promise<ExecuteResult> {
  const logs: string[] = []
  const startTime = Date.now()

  // 创建安全的沙箱环境
  const sandbox = {
    // 输入数据
    inputs,
    // 结果变量
    __result__: undefined as unknown,
    // 安全的 console
    console: {
      log: (...args: unknown[]) => {
        const output = args.map(arg => formatOutput(arg)).join(' ')
        logs.push(`[LOG] ${output}`)
      },
      error: (...args: unknown[]) => {
        const output = args.map(arg => formatOutput(arg)).join(' ')
        logs.push(`[ERROR] ${output}`)
      },
      warn: (...args: unknown[]) => {
        const output = args.map(arg => formatOutput(arg)).join(' ')
        logs.push(`[WARN] ${output}`)
      },
      info: (...args: unknown[]) => {
        const output = args.map(arg => formatOutput(arg)).join(' ')
        logs.push(`[INFO] ${output}`)
      },
    },
    // 安全的内置对象
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    // 禁止危险操作
    require: undefined,
    process: undefined,
    global: undefined,
    __dirname: undefined,
    __filename: undefined,
    module: undefined,
    exports: undefined,
    Buffer: undefined,
    fetch: undefined,
    XMLHttpRequest: undefined,
    WebSocket: undefined,
  }

  // 包装代码，捕获返回值
  const wrappedCode = `
    (async function() {
      try {
        ${code}
      } catch (e) {
        throw e;
      }
    })().then(r => { __result__ = r; }).catch(e => { throw e; });
  `

  try {
    const context = vm.createContext(sandbox)

    // 执行代码（带超时）
    const script = new vm.Script(wrappedCode, {
      filename: 'user-code.js',
      timeout: EXECUTION_TIMEOUT,
    })

    script.runInContext(context, {
      timeout: EXECUTION_TIMEOUT,
    })

    // 等待异步代码完成
    await new Promise(resolve => setTimeout(resolve, 100))

    const executionTime = Date.now() - startTime
    const result = sandbox.__result__

    // 格式化输出
    let output = logs.join('\n')
    if (result !== undefined) {
      output += (output ? '\n' : '') + `[RESULT] ${formatOutput(result)}`
    }

    // 限制输出长度
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.substring(0, MAX_OUTPUT_LENGTH) + '\n...(输出过长，已截断)'
    }

    return {
      success: true,
      output,
      result,
      executionTime,
      logs,
    }
  } catch (error) {
    const executionTime = Date.now() - startTime
    let errorMessage = '执行错误'

    if (error instanceof Error) {
      if (error.message.includes('Script execution timed out')) {
        errorMessage = `执行超时（超过 ${EXECUTION_TIMEOUT / 1000} 秒）`
      } else {
        errorMessage = error.message
      }
    }

    return {
      success: false,
      error: errorMessage,
      executionTime,
      logs,
    }
  }
}

function formatOutput(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'function') return '[Function]'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
