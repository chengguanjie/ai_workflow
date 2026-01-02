/**
 * Fix workflows/templates where "配图需求提取与生成" was mistakenly configured as image-gen.
 *
 * Usage:
 *   pnpm exec tsx scripts/fix-illustration-plan-node.ts --dry-run
 *   pnpm exec tsx scripts/fix-illustration-plan-node.ts --apply
 *
 * Optional filters:
 *   --workflow "<name substring>"
 *   --template "<name substring>"
 */

import { prisma } from '@/lib/db'
import { SHENSUAN_DEFAULT_MODELS, getModelModality } from '@/lib/ai/types'
import type { Prisma } from '@prisma/client'

type JsonObject = Record<string, unknown>

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
  return {
    dryRun: Boolean(args.get('--dry-run')) || !Boolean(args.get('--apply')),
    apply: Boolean(args.get('--apply')),
    workflowFilter: (args.get('--workflow') as string | undefined) || '',
    templateFilter: (args.get('--template') as string | undefined) || '',
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function fixWorkflowConfig(input: unknown): { changed: boolean; output: unknown; touchedNodes: number } {
  if (!isObject(input)) return { changed: false, output: input, touchedNodes: 0 }
  if (!Array.isArray(input.nodes)) return { changed: false, output: input, touchedNodes: 0 }

  const output = cloneJson(input) as { nodes: Array<{ type?: string; name?: string; config?: JsonObject }> } & JsonObject
  let changed = false
  let touchedNodes = 0

  output.nodes = output.nodes.map((node) => {
    if (!node || node.type !== 'PROCESS') return node
    if (!node.name || !node.name.includes('配图需求提取与生成')) return node
    if (!isObject(node.config)) return node

    const currentModel = typeof node.config.model === 'string' ? node.config.model : undefined
    const currentModality = typeof node.config.modality === 'string' ? node.config.modality : undefined

    // Force this node to be "text plan generation"
    const nextConfig: JsonObject = { ...node.config, modality: 'text' }

    // If the model is image-gen (or empty), swap to a text model to avoid routing to /images/generations.
    const inferred = currentModel ? getModelModality(currentModel) : null
    if (!currentModel || inferred === 'image-gen' || inferred === 'video-gen') {
      nextConfig.model = SHENSUAN_DEFAULT_MODELS.text
    }

    // Ensure we actually changed something before marking
    const didChange =
      currentModality !== 'text' ||
      (nextConfig.model !== currentModel && typeof nextConfig.model === 'string')

    if (didChange) {
      changed = true
      touchedNodes++
      return { ...node, config: nextConfig }
    }

    return node
  })

  return { changed, output, touchedNodes }
}

async function main() {
  const { dryRun, workflowFilter, templateFilter } = parseArgs(process.argv.slice(2))

  console.log(`[fix-illustration-plan-node] mode=${dryRun ? 'dry-run' : 'apply'}`)

  const [workflows, templates] = await Promise.all([
    prisma.workflow.findMany({
      where: workflowFilter ? { name: { contains: workflowFilter } } : undefined,
      select: {
        id: true,
        name: true,
        config: true,
        draftConfig: true,
        publishedConfig: true,
      },
    }),
    prisma.workflowTemplate.findMany({
      where: templateFilter ? { name: { contains: templateFilter } } : undefined,
      select: {
        id: true,
        name: true,
        config: true,
      },
    }),
  ])

  let workflowChanged = 0
  let workflowTouchedNodes = 0
  for (const wf of workflows) {
    const updates: Prisma.WorkflowUpdateInput = {}
    let changed = false
    let touched = 0

    for (const key of ['config', 'draftConfig', 'publishedConfig'] as const) {
      const current = wf[key]
      if (!current) continue
      const fixed = fixWorkflowConfig(current)
      if (fixed.changed) {
        updates[key] = fixed.output as Prisma.InputJsonValue
        changed = true
        touched += fixed.touchedNodes
      }
    }

    if (!changed) continue

    workflowChanged++
    workflowTouchedNodes += touched
    console.log(`- workflow "${wf.name}" (${wf.id}): nodes fixed=${touched}`)

    if (!dryRun) {
      await prisma.workflow.update({
        where: { id: wf.id },
        data: updates,
      })
    }
  }

  let templateChanged = 0
  let templateTouchedNodes = 0
  for (const tpl of templates) {
    const fixed = fixWorkflowConfig(tpl.config)
    if (!fixed.changed) continue
    templateChanged++
    templateTouchedNodes += fixed.touchedNodes
    console.log(`- template "${tpl.name}" (${tpl.id}): nodes fixed=${fixed.touchedNodes}`)

    if (!dryRun) {
      await prisma.workflowTemplate.update({
        where: { id: tpl.id },
        data: { config: fixed.output as Prisma.InputJsonValue },
      })
    }
  }

  console.log(
    `[fix-illustration-plan-node] done workflows=${workflowChanged} (nodes=${workflowTouchedNodes}), templates=${templateChanged} (nodes=${templateTouchedNodes})`
  )
  if (dryRun) {
    console.log('[fix-illustration-plan-node] dry-run only; rerun with --apply to persist changes.')
  }
}

main().catch((err) => {
  console.error('[fix-illustration-plan-node] failed:', err)
  process.exit(1)
})
