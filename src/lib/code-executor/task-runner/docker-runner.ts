/**
 * Docker Task Runner
 * 使用 Docker 容器提供完全隔离的代码执行环境
 *
 * 特性：
 * - 完全的进程和文件系统隔离
 * - 支持多种语言（Python, Node.js 等）
 * - 精确的资源限制（内存、CPU、网络）
 * - 支持自定义镜像
 */

import { spawn, type ChildProcess } from 'child_process'
import { writeFile, unlink, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type {
  ExecutionLanguage,
  ExecutionContext,
  ExecutionResult,
  ResourceLimits,
} from './types'
import { BaseTaskRunner, LogCollector } from './base-runner'
import type { RunnerType } from './types'

/**
 * Docker 执行器配置
 */
export interface DockerRunnerConfig {
  /** 默认 Python 镜像 */
  pythonImage?: string
  /** 默认 Node.js 镜像 */
  nodeImage?: string
  /** 网络模式 */
  networkMode?: 'none' | 'bridge' | 'host'
  /** 运行用户 */
  user?: string
  /** 临时文件目录 */
  tempDir?: string
  /** 是否启用 Docker（可降级到直接执行） */
  enabled?: boolean
}

/**
 * 容器运行状态
 */
interface ContainerState {
  containerId?: string
  process?: ChildProcess
  tempDir: string
  cleanup: () => Promise<void>
}

/**
 * Docker Task Runner
 */
export class DockerRunner extends BaseTaskRunner {
  readonly type: RunnerType = 'docker'
  readonly supportedLanguages: ExecutionLanguage[] = ['python', 'javascript', 'typescript']

  private config: Required<DockerRunnerConfig>
  private dockerAvailable: boolean | null = null
  private runningContainers: Map<string, ContainerState> = new Map()

  constructor(config?: DockerRunnerConfig) {
    super()
    this.config = {
      pythonImage: config?.pythonImage ?? 'python:3.11-slim',
      nodeImage: config?.nodeImage ?? 'node:20-slim',
      networkMode: config?.networkMode ?? 'none',
      user: config?.user ?? 'nobody',
      tempDir: config?.tempDir ?? join(tmpdir(), 'ai-workflow-docker'),
      enabled: config?.enabled ?? true,
    }
  }

  /**
   * 检查 Docker 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (this.dockerAvailable !== null) {
      return this.dockerAvailable
    }

    if (!this.config.enabled) {
      this.dockerAvailable = false
      return false
    }

    try {
      await this.execCommand('docker', ['version'])
      this.dockerAvailable = true
      return true
    } catch {
      this.dockerAvailable = false
      return false
    }
  }

  /**
   * 执行代码
   */
  async execute(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits?: Partial<ResourceLimits>
  ): Promise<ExecutionResult> {
    if (!this.supportedLanguages.includes(language)) {
      return this.createErrorResult(
        `DockerRunner 不支持 ${language} 语言`,
        new Date()
      )
    }

    return this.executeWithTracking(code, language, context, limits)
  }

  /**
   * 内部执行实现
   */
  protected async executeInternal(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits: ResourceLimits
  ): Promise<ExecutionResult> {
    const startedAt = new Date()
    const logCollector = new LogCollector()

    // 检查 Docker 是否可用
    const dockerAvailable = await this.isAvailable()
    if (!dockerAvailable) {
      // 降级到直接执行
      return this.executeFallback(code, language, context, limits, logCollector, startedAt)
    }

    // 创建临时目录
    const executionId = context.executionId
    const tempDir = join(this.config.tempDir, executionId)
    let containerState: ContainerState | null = null

    try {
      await mkdir(tempDir, { recursive: true })

      // 准备代码文件
      const { scriptPath: _scriptPath, command, args } = await this.prepareExecution(
        code,
        language,
        context.inputs,
        tempDir
      )

      // 创建容器状态
      containerState = {
        tempDir,
        cleanup: async () => {
          try {
            await rm(tempDir, { recursive: true, force: true })
          } catch {
            // 忽略清理错误
          }
        },
      }
      this.runningContainers.set(executionId, containerState)

      // 运行 Docker 容器
      const result = await this.runInDocker(
        command,
        args,
        tempDir,
        limits,
        language
      )

      return {
        success: result.exitCode === 0,
        output: result.stdout || result.stderr,
        formattedOutput: result.stdout || result.stderr,
        outputType: result.exitCode === 0 ? 'string' : 'error',
        logs: this.parseOutput(result.stdout, logCollector),
        metrics: {
          executionTime: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        },
        error: result.exitCode !== 0 ? result.stderr : undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return this.createErrorResult(
        errorMessage,
        startedAt,
        error instanceof Error ? error.stack : undefined,
        logCollector.getLogs()
      )
    } finally {
      // 清理
      if (containerState) {
        await containerState.cleanup()
      }
      this.runningContainers.delete(executionId)
    }
  }

  /**
   * 准备执行环境
   */
  private async prepareExecution(
    code: string,
    language: ExecutionLanguage,
    inputs: Record<string, unknown>,
    tempDir: string
  ): Promise<{ scriptPath: string; command: string; args: string[] }> {
    const inputsJson = JSON.stringify(inputs).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

    if (language === 'python') {
      const wrappedCode = `
import json
import sys

# 注入输入数据
inputs = json.loads('${inputsJson}')

# 用户代码
${code}
`
      const scriptPath = join(tempDir, 'script.py')
      await writeFile(scriptPath, wrappedCode, 'utf-8')

      return {
        scriptPath,
        command: 'python3',
        args: ['/workspace/script.py'],
      }
    }

    if (language === 'javascript' || language === 'typescript') {
      const wrappedCode = `
const inputs = JSON.parse('${inputsJson}');

${code}
`
      const scriptPath = join(tempDir, 'script.js')
      await writeFile(scriptPath, wrappedCode, 'utf-8')

      return {
        scriptPath,
        command: 'node',
        args: ['/workspace/script.js'],
      }
    }

    throw new Error(`不支持的语言: ${language}`)
  }

  /**
   * 在 Docker 中运行
   */
  private async runInDocker(
    command: string,
    args: string[],
    tempDir: string,
    limits: ResourceLimits,
    language: ExecutionLanguage
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const image = language === 'python' ? this.config.pythonImage : this.config.nodeImage

    // 构建 Docker 命令
    const dockerArgs = [
      'run',
      '--rm', // 自动删除容器
      '--network', this.config.networkMode,
      '--user', this.config.user,
      '--memory', `${limits.maxMemory}m`,
      '--memory-swap', `${limits.maxMemory}m`, // 禁用 swap
      '--cpus', '1', // 限制 CPU
      '--pids-limit', '50', // 限制进程数
      '--read-only', // 只读文件系统
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', // 临时文件
      '-v', `${tempDir}:/workspace:ro`, // 挂载工作目录（只读）
      '-w', '/workspace',
      '--security-opt', 'no-new-privileges', // 禁止提权
      image,
      command,
      ...args,
    ]

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let killed = false

      const proc = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
        // 限制输出大小
        if (stdout.length > (limits.maxOutputSize ?? 1024 * 1024)) {
          stdout = stdout.slice(0, limits.maxOutputSize) + '\n... (output truncated)'
          killed = true
          proc.kill('SIGTERM')
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (exitCode: number | null) => {
        if (killed && exitCode !== 0) {
          resolve({ stdout, stderr: '输出超过大小限制', exitCode: 1 })
        } else {
          resolve({ stdout, stderr, exitCode: exitCode ?? 0 })
        }
      })

      proc.on('error', (err: Error) => {
        reject(err)
      })

      // 超时处理
      const timeout = setTimeout(() => {
        killed = true
        proc.kill('SIGKILL')
        reject(new Error(`执行超时 (${limits.maxExecutionTime}ms)`))
      }, limits.maxExecutionTime)

      proc.on('close', () => {
        clearTimeout(timeout)
      })
    })
  }

  /**
   * 降级到直接执行（无 Docker）
   */
  private async executeFallback(
    code: string,
    language: ExecutionLanguage,
    context: ExecutionContext,
    limits: ResourceLimits,
    logCollector: LogCollector,
    startedAt: Date
  ): Promise<ExecutionResult> {
    if (language !== 'python') {
      return this.createErrorResult(
        'Docker 不可用，且降级执行仅支持 Python',
        startedAt
      )
    }

    // 使用直接的 Python 执行（与原有实现类似）
    const tempDir = join(tmpdir(), 'ai-workflow-python')
    const fileId = randomUUID()
    const filePath = join(tempDir, `${fileId}.py`)

    try {
      await mkdir(tempDir, { recursive: true })

      const inputsJson = JSON.stringify(context.inputs).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const wrappedCode = `
import json
import sys

inputs = json.loads('${inputsJson}')

${code}
`
      await writeFile(filePath, wrappedCode, 'utf-8')

      const result = await this.runProcess('python3', [filePath], limits.maxExecutionTime)

      return {
        success: result.exitCode === 0,
        output: result.stdout || result.stderr,
        formattedOutput: result.stdout || result.stderr,
        outputType: result.exitCode === 0 ? 'string' : 'error',
        logs: logCollector.getLogs(),
        metrics: {
          executionTime: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        },
        error: result.exitCode !== 0 ? result.stderr : undefined,
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : String(error),
        startedAt,
        error instanceof Error ? error.stack : undefined,
        logCollector.getLogs()
      )
    } finally {
      try {
        await unlink(filePath)
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 运行进程
   */
  private runProcess(
    command: string,
    args: string[],
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let killed = false

      const proc = spawn(command, args, {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (exitCode: number | null) => {
        if (killed) {
          reject(new Error(`执行超时 (${timeout}ms)`))
        } else {
          resolve({ stdout, stderr, exitCode: exitCode ?? 0 })
        }
      })

      proc.on('error', (err: Error) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error(`未找到命令: ${command}`))
        } else {
          reject(err)
        }
      })

      setTimeout(() => {
        killed = true
        proc.kill('SIGTERM')
      }, timeout)
    })
  }

  /**
   * 解析输出为日志条目
   */
  private parseOutput(output: string, collector: LogCollector): ReturnType<LogCollector['getLogs']> {
    // 将输出按行解析
    const lines = output.split('\n').filter(line => line.trim())
    for (const line of lines) {
      collector.add('log', line)
    }
    return collector.getLogs()
  }

  /**
   * 执行命令
   */
  private execCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args)
      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`))
        }
      })

      proc.on('error', reject)
    })
  }

  /**
   * 终止执行
   */
  async terminate(executionId: string): Promise<void> {
    const state = this.runningContainers.get(executionId)
    if (state) {
      // 停止容器
      if (state.containerId) {
        try {
          await this.execCommand('docker', ['stop', '-t', '1', state.containerId])
        } catch {
          // 忽略停止错误
        }
      }

      // 清理临时文件
      await state.cleanup()
      this.runningContainers.delete(executionId)
    }

    await super.terminate(executionId)
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await super.cleanup()

    // 清理所有运行中的容器
    const executions = Array.from(this.runningContainers.keys())
    await Promise.all(executions.map(id => this.terminate(id)))
  }
}

// 导出单例
let defaultRunner: DockerRunner | null = null

export function getDockerRunner(config?: DockerRunnerConfig): DockerRunner {
  if (!defaultRunner) {
    defaultRunner = new DockerRunner(config)
  }
  return defaultRunner
}
