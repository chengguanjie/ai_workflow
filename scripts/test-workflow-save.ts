/**
 * 测试工作流保存的脚本
 * 
 * 这个脚本直接调用 workflowService.update 来测试保存功能
 * 
 * 运行方式: npx tsx scripts/test-workflow-save.ts <workflow-id>
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const workflowId = process.argv[2]
  
  if (!workflowId) {
    console.log('用法: npx tsx scripts/test-workflow-save.ts <workflow-id>')
    console.log('')
    console.log('首先，让我列出所有工作流...')
    
    const workflows = await prisma.workflow.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        organizationId: true,
        creatorId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    })
    
    if (workflows.length === 0) {
      console.log('没有找到工作流')
    } else {
      console.log('\n最近的工作流:')
      workflows.forEach((w, i) => {
        console.log(`  ${i + 1}. ${w.name} (${w.id})`)
        console.log(`     组织: ${w.organizationId}`)
        console.log(`     更新时间: ${w.updatedAt}`)
      })
    }
    
    await prisma.$disconnect()
    return
  }
  
  console.log(`\n=== 测试工作流保存: ${workflowId} ===\n`)
  
  // 获取工作流
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      creator: { select: { id: true, name: true } },
    },
  })
  
  if (!workflow) {
    console.log('❌ 工作流不存在')
    await prisma.$disconnect()
    return
  }
  
  console.log('工作流信息:')
  console.log(`  名称: ${workflow.name}`)
  console.log(`  组织: ${workflow.organizationId}`)
  console.log(`  创建者: ${workflow.creator?.name || workflow.creatorId}`)
  console.log(`  版本: ${workflow.version}`)
  
  // 解析配置
  const config = workflow.config as { nodes?: Array<{ id: string; type: string; name: string }>; edges?: Array<{ id: string }> }
  
  if (config?.nodes) {
    console.log(`\n节点信息 (${config.nodes.length} 个):`)
    const nodeTypes = new Map<string, number>()
    config.nodes.forEach(n => {
      nodeTypes.set(n.type, (nodeTypes.get(n.type) || 0) + 1)
    })
    nodeTypes.forEach((count, type) => {
      console.log(`  - ${type}: ${count} 个`)
    })
  }
  
  if (config?.edges) {
    console.log(`\n边信息: ${config.edges.length} 条`)
  }
  
  // 尝试更新（只更新名称，不改变配置）
  console.log('\n尝试更新工作流...')
  try {
    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        name: workflow.name, // 保持原名称
        version: { increment: 1 },
      },
    })
    console.log('✅ 更新成功!')
    console.log(`  新版本: ${updated.version}`)
  } catch (error) {
    console.log('❌ 更新失败!')
    console.error(error)
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
