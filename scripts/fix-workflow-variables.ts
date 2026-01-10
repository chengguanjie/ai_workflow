/**
 * 修复工作流变量引用
 * 将错误的变量引用 {{输入.xxx}} 替换为正确的 {{信息填写.xxx}}
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

interface NodeConfig {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}

interface WorkflowConfig {
  nodes: NodeConfig[]
  edges: Array<{ id: string; source: string; target: string }>
  manual?: string
  version?: number
}

async function main() {
  console.log('=== 修复工作流变量引用 ===\n')

  const workflow = await prisma.workflow.findUnique({
    where: { id: WORKFLOW_ID },
    select: { id: true, name: true, config: true, draftConfig: true },
  })

  if (!workflow) {
    console.error('工作流不存在')
    return
  }

  console.log(`工作流名称: ${workflow.name}\n`)

  const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig
  const inputNode = config.nodes.find(n => n.type === 'INPUT')
  
  if (!inputNode) {
    console.error('找不到输入节点')
    return
  }
  
  console.log(`输入节点名称: ${inputNode.name}\n`)
  console.log('=== 检查并修复变量引用 ===')
  
  let fixCount = 0
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    const nodeConfig = node.config
    
    // 检查 userPrompt
    if (nodeConfig.userPrompt && typeof nodeConfig.userPrompt === 'string') {
      const original = nodeConfig.userPrompt
      const fixed = original.replace(/\{\{输入\./g, `{{${inputNode.name}.`)
      
      if (fixed !== original) {
        console.log(`\n节点: ${node.name}`)
        const matches = original.match(/\{\{输入\.[^}]+\}\}/g) || []
        for (const m of matches) {
          console.log(`  ${m} -> ${m.replace('{{输入.', `{{${inputNode.name}.`)}`)
        }
        nodeConfig.userPrompt = fixed
        fixCount++
      }
    }
  }

  if (fixCount === 0) {
    console.log('\n没有需要修复的变量引用')
    return
  }

  console.log(`\n共修复 ${fixCount} 个节点`)
  console.log('\n=== 保存更新 ===')
  
  await prisma.workflow.update({
    where: { id: WORKFLOW_ID },
    data: { draftConfig: config as unknown as Record<string, unknown> },
  })

  console.log('✓ 配置已更新')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
