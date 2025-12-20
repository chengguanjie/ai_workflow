/**
 * Pyodide 浏览器端 Python 执行器
 * 使用 WebAssembly 在浏览器中运行 Python 代码
 */

// Pyodide 类型定义
interface PyodideInterface {
  runPython: (code: string) => unknown
  runPythonAsync: (code: string) => Promise<unknown>
  globals: {
    get: (name: string) => unknown
    set: (name: string, value: unknown) => void
  }
  loadPackagesFromImports: (code: string) => Promise<void>
}

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<PyodideInterface>
  }
}

// Pyodide CDN URL
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'

// 单例 Pyodide 实例
let pyodideInstance: PyodideInterface | null = null
let pyodideLoading: Promise<PyodideInterface> | null = null

export interface PythonExecutionResult {
  success: boolean
  output: string
  error?: string
  executionTime: number
}

/**
 * 加载 Pyodide 脚本
 */
async function loadPyodideScript(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Pyodide 只能在浏览器环境中运行')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).loadPyodide) {
    return
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PYODIDE_CDN}pyodide.js`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('无法加载 Pyodide'))
    document.head.appendChild(script)
  })
}

/**
 * 初始化 Pyodide 实例
 */
export async function initPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) {
    return pyodideInstance
  }

  if (pyodideLoading) {
    return pyodideLoading
  }

  pyodideLoading = (async () => {
    await loadPyodideScript()
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pyodideInstance = await (window as any).loadPyodide({
      indexURL: PYODIDE_CDN,
    })

    // 设置 stdout/stderr 捕获
    await pyodideInstance.runPythonAsync(`
import sys
from io import StringIO

class OutputCapture:
    def __init__(self):
        self.stdout = StringIO()
        self.stderr = StringIO()
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
    
    def start(self):
        sys.stdout = self.stdout
        sys.stderr = self.stderr
    
    def stop(self):
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr
    
    def get_output(self):
        return self.stdout.getvalue() + self.stderr.getvalue()
    
    def clear(self):
        self.stdout = StringIO()
        self.stderr = StringIO()
        sys.stdout = self.stdout
        sys.stderr = self.stderr

_output_capture = OutputCapture()
`)

    return pyodideInstance
  })()

  return pyodideLoading
}

/**
 * 在浏览器中执行 Python 代码
 */
export async function executePythonInBrowser(
  code: string,
  inputs: Record<string, unknown> = {}
): Promise<PythonExecutionResult> {
  const startTime = Date.now()

  try {
    const pyodide = await initPyodide()

    // 注入 inputs 变量
    const inputsJson = JSON.stringify(inputs)
    await pyodide.runPythonAsync(`
import json
inputs = json.loads('''${inputsJson.replace(/'/g, "\\'")}''')
`)

    // 开始捕获输出
    await pyodide.runPythonAsync(`
_output_capture.clear()
_output_capture.start()
`)

    // 执行用户代码
    try {
      await pyodide.runPythonAsync(code)
    } catch (pyError) {
      // 停止捕获
      await pyodide.runPythonAsync(`_output_capture.stop()`)
      
      return {
        success: false,
        output: '',
        error: pyError instanceof Error ? pyError.message : String(pyError),
        executionTime: Date.now() - startTime,
      }
    }

    // 停止捕获并获取输出
    await pyodide.runPythonAsync(`_output_capture.stop()`)
    const output = await pyodide.runPythonAsync(`_output_capture.get_output()`)

    return {
      success: true,
      output: String(output || ''),
      executionTime: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime,
    }
  }
}

/**
 * 检查 Pyodide 是否已加载
 */
export function isPyodideLoaded(): boolean {
  return pyodideInstance !== null
}

/**
 * 获取 Pyodide 加载状态
 */
export function getPyodideStatus(): 'not_loaded' | 'loading' | 'loaded' {
  if (pyodideInstance) return 'loaded'
  if (pyodideLoading) return 'loading'
  return 'not_loaded'
}
