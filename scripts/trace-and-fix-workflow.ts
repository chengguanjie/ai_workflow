/**
 * 执行工作流 + 追踪每个节点输入/输出 + 按提示词进行契约校验 + (可选) 自动修复后重跑
 *
 * 适用场景：
 * - 你希望验证“每个节点的输出是否符合提示词要求（如 JSON 结构/字段）”
 * - 你希望自动修复一些常见配置问题（变量引用、expectedOutputType、误配模型模态）
 *
 * 运行方式（推荐，避免 tsx CLI 在部分环境的 IPC 权限问题）：
 *   node --import tsx scripts/trace-and-fix-workflow.ts --workflow-id <id> --apply
 *
 * 常用参数：
 *   --workflow-id <id>       工作流 ID（默认：凤韩研发AI工作流的 ID）
 *   --mode draft|production  执行模式（默认：draft）
 *   --max-iterations <n>     最大迭代次数（默认：3）
 *   --apply                  实际写回 draftConfig（默认：仅 dry-run，不写回）
 */

import { PrismaClient, ExecutionType } from '@prisma/client'
import { executeWorkflow } from '@/lib/workflow/engine'
import type { NodeConfig, ProcessNodeConfig, WorkflowConfig } from '@/types/workflow'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  fixExpectedOutputTypesFromPrompts,
  fixInputVariableReferences,
  inferExpectedType,
  validateNodeOutputAgainstPrompt,
  type PromptViolation,
} from '@/lib/workflow/validation'
import { SHENSUAN_DEFAULT_MODELS, getModelModality } from '@/lib/ai/types'

const prisma = new PrismaClient()

const DEFAULT_WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90' // 凤韩研发AI工作流

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args.set(key, true)
    } else {
      args.set(key, next)
      i++
    }
  }
  const workflowId = (args.get('--workflow-id') as string | undefined) || DEFAULT_WORKFLOW_ID
  const mode = ((args.get('--mode') as string | undefined) || 'draft') as 'draft' | 'production'
  const maxIterationsRaw = (args.get('--max-iterations') as string | undefined) || '3'
  const maxIterations = Number.parseInt(maxIterationsRaw, 10)
  const apply = Boolean(args.get('--apply'))

  if (!Number.isFinite(maxIterations) || maxIterations <= 0) {
    throw new Error(`Invalid --max-iterations: ${maxIterationsRaw}`)
  }

  if (mode !== 'draft' && mode !== 'production') {
    throw new Error(`Invalid --mode: ${mode}`)
  }

  return { workflowId, mode, maxIterations, apply }
}

async function getTestUser() {
  return prisma.user.findFirst({
    select: { id: true, organizationId: true, email: true },
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function fixTextLikeNodeModality(config: WorkflowConfig): { changed: boolean; changes: string[] } {
  const changes: string[] = []
  let changed = false

  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    const p = node as ProcessNodeConfig
    const expected = inferExpectedType(p.config?.systemPrompt, p.config?.userPrompt)
    const textLike = expected === 'text' || expected === 'json' || expected === 'markdown' || expected === 'html'
    if (!textLike) continue

    const currentModel = typeof p.config?.model === 'string' ? p.config.model : undefined
    const currentModality = typeof p.config?.modality === 'string' ? p.config.modality : undefined
    const inferredModality = currentModel ? getModelModality(currentModel) : null

    const isBadModel = inferredModality === 'image-gen' || inferredModality === 'video-gen' || inferredModality === 'audio-tts'
    const isBadModality = currentModality === 'image-gen' || currentModality === 'video-gen' || currentModality === 'audio-tts'

    if (!isBadModel && !isBadModality) continue

    p.config.modality = 'text'
    if (isBadModel) p.config.model = SHENSUAN_DEFAULT_MODELS.text

    changed = true
    changes.push(
      `节点 "${node.name}": 提示词推断为文本输出，但配置为 ${currentModality || '(未设置)'} / ${currentModel || '(未设置)'}，已修正为 text + ${p.config.model}`
    )
  }

  return { changed, changes }
}

function buildViolations(config: WorkflowConfig, logs: Array<{ nodeId: string; output: unknown; status: string; error: string | null }>) {
  const outputsById = new Map<string, unknown>()
  for (const log of logs) outputsById.set(log.nodeId, log.output)

  const violations: PromptViolation[] = []
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    // 仅校验本次执行实际跑到的节点，避免“未执行节点”被误判为输出缺失
    if (!outputsById.has(node.id)) continue
    violations.push(...validateNodeOutputAgainstPrompt(node as ProcessNodeConfig, outputsById.get(node.id)))
  }
  return violations
}

async function main() {
  const { workflowId, mode, maxIterations, apply } = parseArgs(process.argv.slice(2))

  console.log('='.repeat(80))
  console.log('[trace-and-fix-workflow]')
  console.log(`workflowId=${workflowId} mode=${mode} maxIterations=${maxIterations} apply=${apply}`)
  console.log('='.repeat(80))

  const user = await getTestUser()
  if (!user) throw new Error('没有找到可用的用户')
  console.log(`使用用户: ${user.email}`)

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log('')
    console.log('-'.repeat(80))
    console.log(`迭代 ${iteration}/${maxIterations}: 执行工作流...`)

    const wf = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, name: true, organizationId: true, config: true, draftConfig: true, publishedConfig: true },
    })
    if (!wf) throw new Error(`工作流不存在: ${workflowId}`)
    if (wf.organizationId !== user.organizationId) {
      throw new Error(`工作流组织 (${wf.organizationId}) 与用户组织 (${user.organizationId}) 不匹配`)
    }

    const rawConfig = mode === 'draft' ? (wf.draftConfig || wf.config) : (wf.publishedConfig || wf.config)
    const workflowConfig = rawConfig as unknown as WorkflowConfig

    const execResult = await executeWorkflow(
      workflowId,
      user.organizationId,
      user.id,
      undefined,
      { mode, executionType: 'TEST' as ExecutionType }
    )

    const logs = await prisma.executionLog.findMany({
      where: { executionId: execResult.executionId },
      orderBy: { startedAt: 'asc' },
      select: { nodeId: true, nodeName: true, nodeType: true, status: true, input: true, output: true, error: true, startedAt: true, duration: true },
    })

    const violations = buildViolations(workflowConfig, logs)
    const failedLogs = logs.filter(l => l.status !== 'COMPLETED' || l.error)

    console.log(`执行状态: ${execResult.status} executionId=${execResult.executionId} tokens=${execResult.totalTokens ?? 0}`)
    console.log(`节点失败数: ${failedLogs.length} / ${logs.length}`)
    console.log(`提示词契约违规数: ${violations.length}`)

    const reportDir = join(process.cwd(), 'tmp', 'workflow-traces', workflowId)
    await mkdir(reportDir, { recursive: true })
    const reportPath = join(reportDir, `${execResult.executionId}.json`)
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          workflow: { id: wf.id, name: wf.name, mode },
          execution: execResult,
          nodes: workflowConfig.nodes.map((n: NodeConfig) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            config: n.type === 'PROCESS' ? (n as ProcessNodeConfig).config : n.config,
          })),
          logs,
          violations,
        },
        null,
        2
      )
    )
    console.log(`追踪报告已保存: ${reportPath}`)

    if (execResult.status === 'success' && failedLogs.length === 0 && violations.length === 0) {
      console.log('✅ 全流程跑通且符合提示词契约')
      return
    }

    const nextConfig = cloneJson(workflowConfig)
    const fixes = [
      fixInputVariableReferences(nextConfig),
      fixExpectedOutputTypesFromPrompts(nextConfig),
      fixTextLikeNodeModality(nextConfig),
    ].filter(r => r.changed)

    if (fixes.length === 0) {
      console.log('⚠️ 未发现可自动修复的配置项；请根据报告手动排查。')
      return
    }

    const fixMessages = fixes.flatMap(f => f.changes)
    console.log('发现可自动修复项:')
    for (const msg of fixMessages) console.log(`  - ${msg}`)

    if (!apply) {
      console.log('当前为 dry-run（未写回 DB）；如需写回并继续重跑，请添加参数 --apply')
      return
    }

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { draftConfig: nextConfig as unknown as Record<string, unknown> },
    })
    console.log('✅ 已写回 draftConfig，准备进入下一轮重跑...')
  }

  console.log(`❌ 已达到最大迭代次数 (${maxIterations})，仍未完全跑通；请查看 tmp/workflow-traces 下的报告。`)
}

main()
  .catch((err) => {
    console.error('[trace-and-fix-workflow] failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    const { closeRedisConnection } = await import('@/lib/redis')
    await closeRedisConnection().catch(() => null)
    await prisma.$disconnect()
  })
