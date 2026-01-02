import vm from 'node:vm'
import ts from 'typescript'
import { spawn } from 'node:child_process'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'sql' | 'other'

export type CodeExecutionResult = {
  ok: boolean
  result: unknown
  logs: string[]
  durationMs: number
}

// Python 执行配置
const PYTHON_CONFIG = {
  // Python 解释器路径，可通过环境变量覆盖
  PYTHON_PATH: process.env.PYTHON_EXEC_PATH || 'python3',
  // 临时文件目录
  TEMP_DIR: process.env.PYTHON_TEMP_DIR || join(tmpdir(), 'ai-workflow-python'),
  // 是否启用 Python 执行
  ENABLED: process.env.PYTHON_EXECUTION_ENABLED === 'true',
  // 禁止的模块列表（安全考虑）
  BLOCKED_MODULES: [
    'os.system', 'os.popen', 'subprocess', 'multiprocessing',
    'socket', 'http.server', 'ftplib', 'smtplib', 'telnetlib',
    '__builtins__.__import__', 'importlib', 'ctypes', 'pickle',
  ],
}

function normalizeTimeoutMs(timeoutMs?: number): number {
  const val = typeof timeoutMs === 'number' ? timeoutMs : 2000
  return Math.max(100, Math.min(val, 10_000))
}

function normalizeMaxOutputSize(maxOutputSize?: number): number {
  const val = typeof maxOutputSize === 'number' ? maxOutputSize : 32_000
  return Math.max(1000, Math.min(val, 256_000))
}

function transpileIfNeeded(language: CodeLanguage, code: string): string {
  if (language !== 'typescript') return code
  const out = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: false,
    },
  })
  return out.outputText
}

/**
 * 检查 Python 代码是否包含危险操作
 */
function validatePythonCode(code: string): { valid: boolean; error?: string } {
  // 检查禁止的模块导入
  for (const blocked of PYTHON_CONFIG.BLOCKED_MODULES) {
    const patterns = [
      new RegExp(`import\\s+${blocked.replace('.', '\\.')}`, 'i'),
      new RegExp(`from\\s+${blocked.split('.')[0]}\\s+import`, 'i'),
    ]
    for (const pattern of patterns) {
      if (pattern.test(code)) {
        return { valid: false, error: `禁止使用模块: ${blocked}` }
      }
    }
  }

  // 检查 exec/eval
  if (/\b(exec|eval|compile)\s*\(/.test(code)) {
    return { valid: false, error: '禁止使用 exec/eval/compile' }
  }

  // 检查文件操作（除了明确的数据处理）
  if (/open\s*\([^)]*,\s*['"][wa]/.test(code)) {
    return { valid: false, error: '禁止写入文件操作' }
  }

  return { valid: true }
}

/**
 * 生成 Python 包装代码
 */
function wrapPythonCode(code: string, input: Record<string, unknown>): string {
  const inputJson = JSON.stringify(input)
  
  return `
import json
import sys

# 注入输入数据
input_data = json.loads('''${inputJson}''')
input = type('Input', (), input_data)()

# 捕获输出的结果
__result__ = None

# 重写 print 以便捕获输出
__logs__ = []
__original_print__ = print
def print(*args, **kwargs):
    msg = ' '.join(str(a) for a in args)
    __logs__.append(msg)
    __original_print__(msg, file=sys.stderr)

# 用户代码开始
try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    __result__ = {"error": str(e)}

# 输出结果
if __result__ is None:
    # 尝试获取最后一个表达式的值
    __result__ = locals().get('result', None)

output = {
    "result": __result__,
    "logs": __logs__
}
print(json.dumps(output, default=str), file=sys.stdout)
`
}

/**
 * 执行 Python 代码
 */
async function executePythonCode(params: {
  code: string
  input?: Record<string, unknown>
  timeoutMs?: number
  maxOutputSize?: number
}): Promise<CodeExecutionResult> {
  const startedAt = Date.now()
  const timeoutMs = normalizeTimeoutMs(params.timeoutMs)
  const maxOutputSize = normalizeMaxOutputSize(params.maxOutputSize)
  const input = params.input ?? {}

  // 验证代码安全性
  const validation = validatePythonCode(params.code)
  if (!validation.valid) {
    return {
      ok: false,
      result: { error: validation.error },
      logs: [],
      durationMs: Date.now() - startedAt,
    }
  }

  // 生成包装后的代码
  const wrappedCode = wrapPythonCode(params.code, input)
  
  // 创建临时文件
  const fileId = randomUUID()
  const tempDir = PYTHON_CONFIG.TEMP_DIR
  const tempFile = join(tempDir, `script_${fileId}.py`)

  try {
    // 确保临时目录存在
    await mkdir(tempDir, { recursive: true })
    
    // 写入临时文件
    await writeFile(tempFile, wrappedCode, 'utf-8')

    // 执行 Python 脚本
    const result = await new Promise<CodeExecutionResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let killed = false
      let outputSize = 0

      const proc = spawn(PYTHON_CONFIG.PYTHON_PATH, [tempFile], {
        timeout: timeoutMs,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      })

      proc.stdout.on('data', (data) => {
        const chunk = data.toString()
        outputSize += chunk.length
        if (outputSize > maxOutputSize) {
          proc.kill()
          killed = true
          return
        }
        stdout += chunk
      })

      proc.stderr.on('data', (data) => {
        const chunk = data.toString()
        outputSize += chunk.length
        if (outputSize > maxOutputSize) {
          proc.kill()
          killed = true
          return
        }
        stderr += chunk
      })

      proc.on('close', (code) => {
        const durationMs = Date.now() - startedAt

        if (killed) {
          resolve({
            ok: false,
            result: { error: '输出过大，已中止' },
            logs: stderr.split('\n').filter(Boolean),
            durationMs,
          })
          return
        }

        // 解析输出
        try {
          const output = JSON.parse(stdout.trim())
          resolve({
            ok: code === 0 && !output.result?.error,
            result: output.result,
            logs: output.logs || [],
            durationMs,
          })
        } catch {
          // JSON 解析失败，返回原始输出
          resolve({
            ok: code === 0,
            result: code === 0 ? stdout : { error: stderr || '执行失败' },
            logs: stderr.split('\n').filter(Boolean),
            durationMs,
          })
        }
      })

      proc.on('error', (err) => {
        resolve({
          ok: false,
          result: { error: `Python 执行错误: ${err.message}` },
          logs: [],
          durationMs: Date.now() - startedAt,
        })
      })

      // 超时处理
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill()
          resolve({
            ok: false,
            result: { error: `执行超时（${timeoutMs}ms）` },
            logs: stderr.split('\n').filter(Boolean),
            durationMs: timeoutMs,
          })
        }
      }, timeoutMs)
    })

    return result
  } finally {
    // 清理临时文件
    try {
      await unlink(tempFile)
    } catch {
      // 忽略清理错误
    }
  }
}

export async function executeSandboxedCode(params: {
  enabled: boolean
  language: CodeLanguage
  code: string
  input?: Record<string, unknown>
  timeoutMs?: number
  maxOutputSize?: number
}): Promise<CodeExecutionResult> {
  if (!params.enabled) {
    return {
      ok: false,
      result: { error: '代码执行未启用（设置 CODE_EXECUTION_ENABLED=true）' },
      logs: [],
      durationMs: 0,
    }
  }

  // Python 执行
  if (params.language === 'python') {
    if (!PYTHON_CONFIG.ENABLED) {
      return {
        ok: false,
        result: { error: 'Python 执行未启用（设置 PYTHON_EXECUTION_ENABLED=true）' },
        logs: [],
        durationMs: 0,
      }
    }
    return executePythonCode(params)
  }

  // JavaScript/TypeScript 执行
  if (params.language !== 'javascript' && params.language !== 'typescript') {
    return {
      ok: false,
      result: { error: `暂不支持执行语言: ${params.language}` },
      logs: [],
      durationMs: 0,
    }
  }

  const startedAt = Date.now()
  const timeoutMs = normalizeTimeoutMs(params.timeoutMs)
  const maxOutputSize = normalizeMaxOutputSize(params.maxOutputSize)

  const logs: string[] = []
  let totalLogSize = 0

  const writeLog = (line: string) => {
    const msg = String(line)
    totalLogSize += msg.length
    if (totalLogSize > maxOutputSize) {
      throw new Error('输出过大，已中止（maxOutputSize）')
    }
    logs.push(msg)
  }

  const sandboxConsole = {
    log: (...args: unknown[]) => writeLog(args.map(String).join(' ')),
    info: (...args: unknown[]) => writeLog(args.map(String).join(' ')),
    warn: (...args: unknown[]) => writeLog(args.map(String).join(' ')),
    error: (...args: unknown[]) => writeLog(args.map(String).join(' ')),
  }

  const input = params.input ?? {}

  const userCode = transpileIfNeeded(params.language, params.code)

  // Run as an async function body so callers can use `await` and `return`.
  const wrapped = `
    "use strict";
    (async () => {
      const input = __input;
      const console = __console;
      ${userCode}
    })()
  `

  const context = vm.createContext(
    {
      __input: input,
      __console: sandboxConsole,
      // Provide a minimal set of globals
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
    },
    {
      codeGeneration: { strings: false, wasm: false },
    }
  )

  try {
    const script = new vm.Script(wrapped, { filename: 'workflow-code-node.js' })
    const result = await script.runInContext(context, { timeout: timeoutMs })
    return {
      ok: true,
      result,
      logs,
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      result: { error: error instanceof Error ? error.message : '代码执行失败' },
      logs,
      durationMs: Date.now() - startedAt,
    }
  }
}

/**
 * 检查 Python 执行环境是否可用
 */
export async function checkPythonEnvironment(): Promise<{
  available: boolean
  version?: string
  error?: string
}> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_CONFIG.PYTHON_PATH, ['--version'], {
      timeout: 5000,
    })

    let output = ''
    proc.stdout.on('data', (data) => {
      output += data.toString()
    })
    proc.stderr.on('data', (data) => {
      output += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        const version = output.trim().replace('Python ', '')
        resolve({ available: true, version })
      } else {
        resolve({ available: false, error: '无法执行 Python' })
      }
    })

    proc.on('error', (err) => {
      resolve({ available: false, error: err.message })
    })
  })
}

/**
 * 获取代码执行能力状态
 */
export function getCodeExecutionCapabilities(): {
  javascript: boolean
  typescript: boolean
  python: { enabled: boolean; configPath: string }
} {
  return {
    javascript: true,
    typescript: true,
    python: {
      enabled: PYTHON_CONFIG.ENABLED,
      configPath: PYTHON_CONFIG.PYTHON_PATH,
    },
  }
}
