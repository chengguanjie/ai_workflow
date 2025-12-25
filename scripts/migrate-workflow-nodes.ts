/**
 * 工作流节点类型迁移脚本
 * 
 * 将数据库中包含旧节点类型的工作流迁移为只使用 INPUT 和 PROCESS 节点
 * 
 * 使用方法：
 * npx tsx scripts/migrate-workflow-nodes.ts [--dry-run] [--verbose]
 * 
 * 参数：
 * --dry-run: 仅分析不实际修改数据库
 * --verbose: 输出详细日志
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const OLD_NODE_TYPES = [
  'TRIGGER',
  'CODE', 
  'OUTPUT',
  'DATA',
  'CONDITION',
  'LOOP',
  'SWITCH',
  'MERGE',
  'HTTP',
  'IMAGE_GEN',
  'NOTIFICATION',
  'GROUP',
  'APPROVAL',
  'IMAGE',
  'VIDEO',
  'AUDIO',
]

const NODES_TO_DELETE = [
  'TRIGGER',
  'OUTPUT', 
  'CONDITION',
  'SWITCH',
  'LOOP',
  'MERGE',
  'NOTIFICATION',
  'GROUP',
  'APPROVAL',
]

const NODES_TO_CONVERT_TO_PROCESS = [
  'CODE',
  'HTTP',
  'IMAGE_GEN',
]

const NODES_TO_CONVERT_TO_INPUT = [
  'DATA',
  'IMAGE',
  'VIDEO',
  'AUDIO',
]

interface NodeConfig {
  id: string
  type: string
  name: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

interface EdgeConfig {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

interface WorkflowConfig {
  version: number
  nodes: NodeConfig[]
  edges: EdgeConfig[]
  globalVariables?: Record<string, unknown>
  settings?: Record<string, unknown>
}

interface InternalStats {
  deleted: number
  convertedToProcess: number
  convertedToInput: number
  preserved: number
  edgeDeleted: number
  edgeFixed: number
  edgePreserved: number
}

interface MigrationStats {
  totalWorkflows: number
  affectedWorkflows: number
  migratedWorkflows: number
  errors: number
  nodeStats: {
    deleted: number
    convertedToProcess: number
    convertedToInput: number
    preserved: number
  }
  edgeStats: {
    deleted: number
    fixed: number
    preserved: number
  }
}

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isVerbose = args.includes('--verbose')

function log(message: string) {
  console.log(message)
}

function verbose(message: string) {
  if (isVerbose) {
    console.log(`  [VERBOSE] ${message}`)
  }
}

function convertNode(node: NodeConfig): NodeConfig | null {
  if (NODES_TO_DELETE.includes(node.type)) {
    verbose(`删除节点: ${node.name} (${node.type})`)
    return null
  }

  if (NODES_TO_CONVERT_TO_PROCESS.includes(node.type)) {
    verbose(`转换节点: ${node.name} (${node.type} -> PROCESS)`)
    const newConfig: Record<string, unknown> = {}
    
    if (node.type === 'CODE') {
      const codeConfig = node.config as { code?: string; language?: string; prompt?: string }
      newConfig.systemPrompt = `你是一个代码执行助手。请根据用户的需求处理数据。
原始代码逻辑（供参考）：
\`\`\`${codeConfig.language || 'javascript'}
${codeConfig.code || ''}
\`\`\``
      newConfig.userPrompt = codeConfig.prompt || '请处理上述逻辑'
    } else if (node.type === 'HTTP') {
      const httpConfig = node.config as { url?: string; method?: string; headers?: Record<string, string> }
      newConfig.systemPrompt = `你是一个 HTTP 请求处理助手。请使用工具调用来执行 HTTP 请求。
目标 URL: ${httpConfig.url || ''}
请求方法: ${httpConfig.method || 'GET'}`
      newConfig.userPrompt = '请执行上述 HTTP 请求并返回结果'
      newConfig.enableToolCalling = true
    } else if (node.type === 'IMAGE_GEN') {
      const imgConfig = node.config as { prompt?: string }
      newConfig.systemPrompt = '你是一个图片生成助手。请根据用户的描述生成图片提示词。'
      newConfig.userPrompt = imgConfig.prompt || '请生成图片'
    }

    return {
      ...node,
      type: 'PROCESS',
      config: newConfig,
    }
  }

  if (NODES_TO_CONVERT_TO_INPUT.includes(node.type)) {
    verbose(`转换节点: ${node.name} (${node.type} -> INPUT)`)
    const newConfig: { fields: Array<{ id: string; name: string; value: string; fieldType?: string }> } = {
      fields: [],
    }

    if (node.type === 'DATA') {
      const dataConfig = node.config as { fields?: Array<{ id: string; name: string; value: string }> }
      newConfig.fields = dataConfig.fields || [{ id: 'data', name: '数据', value: '' }]
    } else {
      const mediaType = node.type.toLowerCase() as 'image' | 'video' | 'audio'
      newConfig.fields = [{
        id: mediaType,
        name: node.name || `${mediaType} 输入`,
        value: '',
        fieldType: mediaType,
      }]
    }

    return {
      ...node,
      type: 'INPUT',
      config: newConfig,
    }
  }

  return node
}

function migrateWorkflowConfig(config: WorkflowConfig): { config: WorkflowConfig; stats: InternalStats } {
  const stats: InternalStats = {
    deleted: 0,
    convertedToProcess: 0,
    convertedToInput: 0,
    preserved: 0,
    edgeDeleted: 0,
    edgeFixed: 0,
    edgePreserved: 0,
  }

  const newNodes: NodeConfig[] = []
  const deletedNodeIds = new Set<string>()

  for (const node of config.nodes) {
    const converted = convertNode(node)
    if (converted === null) {
      deletedNodeIds.add(node.id)
      stats.deleted++
    } else if (converted.type !== node.type) {
      if (converted.type === 'PROCESS') {
        stats.convertedToProcess++
      } else if (converted.type === 'INPUT') {
        stats.convertedToInput++
      }
      newNodes.push(converted)
    } else {
      stats.preserved++
      newNodes.push(converted)
    }
  }

  const validNodeIds = new Set(newNodes.map(n => n.id))
  const newEdges: EdgeConfig[] = []
  const brokenEdges: EdgeConfig[] = []

  for (const edge of config.edges) {
    const sourceValid = validNodeIds.has(edge.source)
    const targetValid = validNodeIds.has(edge.target)

    if (sourceValid && targetValid) {
      stats.edgePreserved++
      newEdges.push(edge)
    } else if (sourceValid || targetValid) {
      brokenEdges.push(edge)
      stats.edgeDeleted++
    } else {
      stats.edgeDeleted++
    }
  }

  for (const brokenEdge of brokenEdges) {
    const sourceValid = validNodeIds.has(brokenEdge.source)
    const targetValid = validNodeIds.has(brokenEdge.target)

    if (sourceValid && !targetValid) {
      const nextEdge = config.edges.find(e => e.source === brokenEdge.target)
      if (nextEdge && validNodeIds.has(nextEdge.target)) {
        const fixedEdge: EdgeConfig = {
          id: `fixed-${brokenEdge.id}`,
          source: brokenEdge.source,
          target: nextEdge.target,
        }
        newEdges.push(fixedEdge)
        stats.edgeFixed++
        stats.edgeDeleted--
        verbose(`修复连线: ${brokenEdge.source} -> ${brokenEdge.target} => ${brokenEdge.source} -> ${nextEdge.target}`)
      }
    }
  }

  return {
    config: {
      ...config,
      nodes: newNodes,
      edges: newEdges,
    },
    stats: {
      deleted: stats.deleted,
      convertedToProcess: stats.convertedToProcess,
      convertedToInput: stats.convertedToInput,
      preserved: stats.preserved,
      edgeDeleted: stats.edgeDeleted,
      edgeFixed: stats.edgeFixed,
      edgePreserved: stats.edgePreserved,
    },
  }
}

function hasOldNodeTypes(config: WorkflowConfig): boolean {
  return config.nodes.some(node => OLD_NODE_TYPES.includes(node.type))
}

async function migrateWorkflows() {
  log('========================================')
  log('工作流节点类型迁移脚本')
  log('========================================')
  
  if (isDryRun) {
    log('模式: 干运行（不会实际修改数据库）')
  } else {
    log('模式: 实际执行')
  }
  log('')

  const stats: MigrationStats = {
    totalWorkflows: 0,
    affectedWorkflows: 0,
    migratedWorkflows: 0,
    errors: 0,
    nodeStats: {
      deleted: 0,
      convertedToProcess: 0,
      convertedToInput: 0,
      preserved: 0,
    },
    edgeStats: {
      deleted: 0,
      fixed: 0,
      preserved: 0,
    },
  }

  log('正在获取所有工作流...')
  const workflows = await prisma.workflow.findMany({
    select: {
      id: true,
      name: true,
      config: true,
    },
  })

  stats.totalWorkflows = workflows.length
  log(`找到 ${workflows.length} 个工作流`)
  log('')

  for (const workflow of workflows) {
    const config = workflow.config as unknown as WorkflowConfig
    
    if (!config || !config.nodes) {
      verbose(`跳过工作流 ${workflow.name}: 无效配置`)
      continue
    }

    if (!hasOldNodeTypes(config)) {
      verbose(`跳过工作流 ${workflow.name}: 无需迁移`)
      continue
    }

    stats.affectedWorkflows++
    log(`处理工作流: ${workflow.name} (${workflow.id})`)

    const oldNodeTypes = config.nodes
      .filter(n => OLD_NODE_TYPES.includes(n.type))
      .map(n => n.type)
    verbose(`包含旧节点类型: ${Array.from(new Set(oldNodeTypes)).join(', ')}`)

    try {
      const { config: migratedConfig, stats: migrationStats } = migrateWorkflowConfig(config)

      stats.nodeStats.deleted += migrationStats.deleted
      stats.nodeStats.convertedToProcess += migrationStats.convertedToProcess
      stats.nodeStats.convertedToInput += migrationStats.convertedToInput
      stats.nodeStats.preserved += migrationStats.preserved
      stats.edgeStats.deleted += migrationStats.edgeDeleted
      stats.edgeStats.fixed += migrationStats.edgeFixed
      stats.edgeStats.preserved += migrationStats.edgePreserved

      if (!isDryRun) {
        await prisma.workflow.update({
          where: { id: workflow.id },
          data: { config: JSON.parse(JSON.stringify(migratedConfig)) },
        })
      }

      stats.migratedWorkflows++
      log(`  ✓ 迁移完成 (节点: ${config.nodes.length} -> ${migratedConfig.nodes.length}, 连线: ${config.edges.length} -> ${migratedConfig.edges.length})`)
    } catch (error) {
      stats.errors++
      log(`  ✗ 迁移失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  log('')
  log('========================================')
  log('迁移统计')
  log('========================================')
  log(`工作流总数: ${stats.totalWorkflows}`)
  log(`需要迁移: ${stats.affectedWorkflows}`)
  log(`成功迁移: ${stats.migratedWorkflows}`)
  log(`迁移失败: ${stats.errors}`)
  log('')
  log('节点统计:')
  log(`  - 删除: ${stats.nodeStats.deleted}`)
  log(`  - 转换为 PROCESS: ${stats.nodeStats.convertedToProcess}`)
  log(`  - 转换为 INPUT: ${stats.nodeStats.convertedToInput}`)
  log(`  - 保留不变: ${stats.nodeStats.preserved}`)
  log('')
  log('连线统计:')
  log(`  - 删除: ${stats.edgeStats.deleted}`)
  log(`  - 修复: ${stats.edgeStats.fixed}`)
  log(`  - 保留不变: ${stats.edgeStats.preserved}`)
  log('========================================')

  if (isDryRun) {
    log('')
    log('这是干运行模式，实际未修改任何数据。')
    log('如需实际执行，请移除 --dry-run 参数。')
  }
}

async function migrateTemplates() {
  log('')
  log('========================================')
  log('迁移工作流模板')
  log('========================================')

  const templates = await prisma.workflowTemplate.findMany({
    select: {
      id: true,
      name: true,
      config: true,
      isOfficial: true,
    },
  })

  log(`找到 ${templates.length} 个模板`)

  let affectedTemplates = 0
  let migratedTemplates = 0

  for (const template of templates) {
    const config = template.config as unknown as WorkflowConfig
    
    if (!config || !config.nodes) {
      continue
    }

    if (!hasOldNodeTypes(config)) {
      continue
    }

    affectedTemplates++
    log(`处理模板: ${template.name} (${template.isOfficial ? '官方' : '用户'})`)

    try {
      const { config: migratedConfig } = migrateWorkflowConfig(config)

      if (!isDryRun) {
        await prisma.workflowTemplate.update({
          where: { id: template.id },
          data: { config: JSON.parse(JSON.stringify(migratedConfig)) },
        })
      }

      migratedTemplates++
      log(`  ✓ 迁移完成`)
    } catch (error) {
      log(`  ✗ 迁移失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  log('')
  log(`模板统计: ${affectedTemplates} 需要迁移, ${migratedTemplates} 成功迁移`)
}

async function main() {
  try {
    await migrateWorkflows()
    await migrateTemplates()
  } catch (error) {
    console.error('迁移脚本执行失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
