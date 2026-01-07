/**
 * 工作流测试脚本
 * 测试凤韩研发AI工作流 (cmjdz1u9m0018efn2020ozh90)
 * 跟踪每个节点的输入输出，检查是否按照AI提示词如期执行
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

interface NodeConfig {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
}

interface WorkflowConfig {
  nodes: NodeConfig[]
  edges: Array<{ source: string; target: string }>
}

async function main() {
  console.log('='.repeat(80))
  console.log('工作流测试脚本')
  console.log('='.repeat(80))
  console.log('')

  // 1. 获取工作流配置
  const workflow = await prisma.workflow.findUnique({
    where: { id: WORKFLOW_ID },
    select: {
      id: true,
      name: true,
      config: true,
      draftConfig: true,
    },
  })

  if (!workflow) {
    console.error('工作流不存在')
    return
  }

  console.log(`工作流名称: ${workflow.name}`)
  console.log(`工作流ID: ${workflow.id}`)
  console.log('')

  const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig

  // 2. 分析节点结构
  console.log('=== 节点结构分析 ===')
  const nodes = config.nodes.filter(n => n.type !== 'GROUP')
  
  console.log(`总节点数: ${nodes.length}`)
  console.log('')

  // 按类型分组
  const nodesByType: Record<string, NodeConfig[]> = {}
  for (const node of nodes) {
    if (!nodesByType[node.type]) {
      nodesByType[node.type] = []
    }
    nodesByType[node.type].push(node)
  }

  for (const [type, typeNodes] of Object.entries(nodesByType)) {
    console.log(`${type} 节点 (${typeNodes.length}个):`)
    for (const node of typeNodes) {
      console.log(`  - ${node.name} (${node.id})`)
    }
    console.log('')
  }

  // 3. 分析执行顺序
  console.log('=== 执行顺序分析 ===')
  const edges = config.edges
  const inputNode = nodes.find(n => n.type === 'INPUT')
  
  if (inputNode) {
    console.log(`输入节点: ${inputNode.name}`)
    const inputConfig = inputNode.config as { fields?: Array<{ name: string; value: string }> }
    if (inputConfig.fields) {
      console.log('输入字段:')
      for (const field of inputConfig.fields) {
        const value = field.value || '(空)'
        const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value
        console.log(`  - ${field.name}: ${displayValue}`)
      }
    }
  }
  console.log('')

  // 4. 获取最近的执行记录
  console.log('=== 最近执行记录 ===')
  const recentExecutions = await prisma.execution.findMany({
    where: { workflowId: WORKFLOW_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      duration: true,
      error: true,
      totalTokens: true,
    },
  })

  if (recentExecutions.length === 0) {
    console.log('暂无执行记录')
  } else {
    for (const exec of recentExecutions) {
      console.log(`执行ID: ${exec.id}`)
      console.log(`  状态: ${exec.status}`)
      console.log(`  创建时间: ${exec.createdAt}`)
      console.log(`  耗时: ${exec.duration ? exec.duration + 'ms' : '未完成'}`)
      console.log(`  Token消耗: ${exec.totalTokens}`)
      if (exec.error) {
        console.log(`  错误: ${exec.error}`)
      }
      console.log('')
    }
  }

  // 5. 获取最近一次执行的详细日志
  if (recentExecutions.length > 0) {
    const latestExecution = recentExecutions[0]
    console.log('=== 最近执行详细日志 ===')
    console.log(`执行ID: ${latestExecution.id}`)
    console.log('')

    const logs = await prisma.executionLog.findMany({
      where: { executionId: latestExecution.id },
      orderBy: { startedAt: 'asc' },
    })

    if (logs.length === 0) {
      console.log('暂无执行日志')
    } else {
      for (const log of logs) {
        console.log(`节点: ${log.nodeName} (${log.nodeId})`)
        console.log(`  类型: ${log.nodeType}`)
        console.log(`  状态: ${log.status}`)
        console.log(`  耗时: ${log.duration ? log.duration + 'ms' : '未完成'}`)
        
        if (log.aiModel) {
          console.log(`  AI模型: ${log.aiModel}`)
          console.log(`  Token: ${log.promptTokens || 0} + ${log.completionTokens || 0}`)
        }

        // 显示输入摘要
        const input = log.input as Record<string, unknown>
        if (input) {
          console.log('  输入:')
          for (const [key, value] of Object.entries(input)) {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value)
            const displayValue = strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue
            console.log(`    ${key}: ${displayValue}`)
          }
        }

        // 显示输出摘要
        const output = log.output as Record<string, unknown>
        if (output) {
          console.log('  输出:')
          for (const [key, value] of Object.entries(output)) {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value)
            const displayValue = strValue.length > 200 ? strValue.substring(0, 200) + '...' : strValue
            console.log(`    ${key}: ${displayValue}`)
          }
        }

        if (log.error) {
          console.log(`  错误: ${log.error}`)
        }

        console.log('')
      }
    }
  }

  console.log('='.repeat(80))
  console.log('分析完成')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
