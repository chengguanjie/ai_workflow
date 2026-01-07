import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

async function main() {
  const workflow = await prisma.workflow.findUnique({
    where: { id: WORKFLOW_ID },
    select: { config: true, draftConfig: true },
  })

  if (!workflow) {
    console.log('工作流不存在')
    return
  }

  const config = (workflow.draftConfig || workflow.config) as any
  
  // 找到 GROUP 节点
  const groupNode = config.nodes.find((n: any) => n.type === 'GROUP')
  if (!groupNode) {
    console.log('没有 GROUP 节点')
    return
  }
  
  console.log('=== GROUP 节点分析 ===')
  console.log('GROUP 节点名称:', groupNode.name)
  console.log('GROUP 节点ID:', groupNode.id)
  console.log('子节点IDs:', groupNode.config.childNodeIds)
  
  // 找到最后一个子节点（排序）
  const lastChildId = groupNode.config.childNodeIds[groupNode.config.childNodeIds.length - 1]
  const lastChild = config.nodes.find((n: any) => n.id === lastChildId)
  console.log('\n最后一个子节点:', lastChild?.name)
  
  // 检查依赖 GROUP 节点的节点
  console.log('\n=== 依赖 GROUP 节点的节点 ===')
  const dependentEdges = config.edges.filter((e: any) => e.source === groupNode.id)
  for (const edge of dependentEdges) {
    const targetNode = config.nodes.find((n: any) => n.id === edge.target)
    console.log(`- ${targetNode?.name} (${targetNode?.id})`)
    
    // 检查这个节点的 userPrompt 中引用了什么变量
    if (targetNode?.config?.userPrompt) {
      const matches = targetNode.config.userPrompt.match(/\{\{[^}]+\}\}/g) || []
      console.log('  变量引用:', matches.slice(0, 5).join(', '))
    }
  }
  
  // 检查 "排序" 节点的输出
  console.log('\n=== 排序节点配置 ===')
  const sortNode = config.nodes.find((n: any) => n.name === '排序')
  if (sortNode) {
    console.log('ID:', sortNode.id)
    console.log('输出边:')
    const sortOutEdges = config.edges.filter((e: any) => e.source === sortNode.id)
    for (const e of sortOutEdges) {
      const t = config.nodes.find((n: any) => n.id === e.target)
      console.log(`  - ${t?.name || e.target}`)
    }
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
