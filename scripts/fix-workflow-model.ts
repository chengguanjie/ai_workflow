/**
 * 修复工作流节点模型配置
 * 将错误的视频模型替换为正确的文本模型
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

interface NodeConfig {
  id: string
  name: string
  type: string
  config: {
    model?: string
    [key: string]: unknown
  }
  position: { x: number; y: number }
}

interface WorkflowConfig {
  nodes: NodeConfig[]
  edges: Array<{ id: string; source: string; target: string }>
  manual?: string
  version?: number
}

async function main() {
  console.log('=== 修复工作流模型配置 ===')
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
  console.log('')

  const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig

  // 2. 检查所有节点的模型配置
  console.log('=== 检查节点模型配置 ===')
  const problematicNodes: NodeConfig[] = []
  
  for (const node of config.nodes) {
    if (node.type === 'PROCESS' && node.config.model) {
      const model = node.config.model as string
      console.log(`节点: ${node.name}`)
      console.log(`  当前模型: ${model}`)
      
      // 检查是否是视频模型或其他不支持的模型
      if (model.includes('veo') || model.includes('video') || model.includes('imagen')) {
        console.log(`  ⚠️ 问题: 这是视频/图像生成模型，不支持文本处理`)
        problematicNodes.push(node)
      } else {
        console.log(`  ✓ 正常`)
      }
      console.log('')
    }
  }

  if (problematicNodes.length === 0) {
    console.log('所有节点模型配置正常')
    return
  }

  // 3. 修复问题节点
  console.log('=== 修复问题节点 ===')
  
  // 使用 Claude Sonnet 4.5 作为默认替换模型
  const defaultModel = 'anthropic/claude-sonnet-4.5:thinking'
  
  for (const node of problematicNodes) {
    console.log(`修复节点: ${node.name}`)
    console.log(`  原模型: ${node.config.model}`)
    console.log(`  新模型: ${defaultModel}`)
    
    // 在配置中找到并更新节点
    const nodeIndex = config.nodes.findIndex(n => n.id === node.id)
    if (nodeIndex !== -1) {
      config.nodes[nodeIndex].config.model = defaultModel
    }
  }

  // 4. 保存更新后的配置
  console.log('')
  console.log('=== 保存更新 ===')
  
  await prisma.workflow.update({
    where: { id: WORKFLOW_ID },
    data: {
      draftConfig: config as unknown as Record<string, unknown>,
    },
  })

  console.log('✓ 配置已更新')
  console.log('')
  console.log('修复完成！请重新执行工作流测试。')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
