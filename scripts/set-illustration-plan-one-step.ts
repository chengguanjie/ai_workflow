/**
 * Set "配图需求提取与生成" node to one-step mode (image-gen + auto plan&generate).
 *
 * The engine auto-detects "配图方案" prompts when modality=image-gen, so here we only
 * need to set modality/model/imageSize on the node.
 *
 * Usage:
 *   npx tsx scripts/set-illustration-plan-one-step.ts --workflow "微信公众号文章智能二创助手" --apply
 *   npx tsx scripts/set-illustration-plan-one-step.ts --workflow "..." --dry-run
 */

import { prisma } from '@/lib/db'
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
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function setOneStepOnConfig(input: unknown): { changed: boolean; output: unknown; touchedNodes: number } {
  if (!isObject(input)) return { changed: false, output: input, touchedNodes: 0 }
  if (!Array.isArray(input.nodes)) return { changed: false, output: input, touchedNodes: 0 }

  const output = cloneJson(input) as { nodes: Array<{ type?: string; name?: string; config?: JsonObject }> } & JsonObject
  let changed = false
  let touchedNodes = 0

  output.nodes = output.nodes.map((node) => {
    if (!node || node.type !== 'PROCESS') return node
    if (!node.name || !node.name.includes('配图需求提取与生成')) return node
    if (!isObject(node.config)) return node

    const nextConfig: JsonObject = {
      ...node.config,
      modality: 'image-gen',
      model: 'google/gemini-3-pro-image-preview',
      imageSize: (node.config.imageSize as string) || '1792x1024',
      imageCount: 1,
    }

    changed = true
    touchedNodes++
    return { ...node, config: nextConfig }
  })

  return { changed, output, touchedNodes }
}

async function main() {
  const { dryRun, workflowFilter } = parseArgs(process.argv.slice(2))
  if (!workflowFilter.trim()) {
    throw new Error('Missing required arg: --workflow "<name substring>"')
  }

  console.log(`[set-illustration-plan-one-step] mode=${dryRun ? 'dry-run' : 'apply'}`)

  const workflows = await prisma.workflow.findMany({
    where: { name: { contains: workflowFilter } },
    select: { id: true, name: true, config: true, draftConfig: true, publishedConfig: true },
  })

  let changedCount = 0
  let touchedNodes = 0
  for (const wf of workflows) {
    const updates: Prisma.WorkflowUpdateInput = {}
    let changed = false
    let touched = 0

    for (const key of ['config', 'draftConfig', 'publishedConfig'] as const) {
      const current = wf[key]
      if (!current) continue
      const fixed = setOneStepOnConfig(current)
      if (fixed.changed) {
        updates[key] = fixed.output as Prisma.InputJsonValue
        changed = true
        touched += fixed.touchedNodes
      }
    }

    if (!changed) continue

    changedCount++
    touchedNodes += touched
    console.log(`- workflow "${wf.name}" (${wf.id}): nodes updated=${touched}`)
    if (!dryRun) {
      await prisma.workflow.update({ where: { id: wf.id }, data: updates })
    }
  }

  console.log(`[set-illustration-plan-one-step] done workflows=${changedCount} nodes=${touchedNodes}`)
  if (dryRun) console.log('[set-illustration-plan-one-step] dry-run only; rerun with --apply to persist changes.')
}

main().catch((err) => {
  console.error('[set-illustration-plan-one-step] failed:', err)
  process.exit(1)
})

