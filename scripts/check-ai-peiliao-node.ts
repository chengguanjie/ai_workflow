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
  
  // 找到 AI配料 节点
  const aiPeiliaoNode = config.nodes.find((n: any) => n.name === 'AI配料')
  
  if (!aiPeiliaoNode) {
    console.log('找不到 AI配料 节点')
    console.log('所有节点名称:')
    config.nodes.forEach((n: any) => console.log(`  - ${n.name} (${n.type})`))
    return
  }

  console.log('=== AI配料 节点配置 ===')
  console.log('节点ID:', aiPeiliaoNode.id)
  console.log('节点类型:', aiPeiliaoNode.type)
  console.log('节点配置:')
  console.log(JSON.stringify(aiPeiliaoNode.config, null, 2))
  
  // 检查边（依赖关系）
  console.log('\n=== 边（依赖关系）===')
  const incomingEdges = config.edges.filter((e: any) => e.target === aiPeiliaoNode.id)
  const outgoingEdges = config.edges.filter((e: any) => e.source === aiPeiliaoNode.id)
  
  console.log('输入边:')
  for (const edge of incomingEdges) {
    const sourceNode = config.nodes.find((n: any) => n.id === edge.source)
    console.log(`  - 来自: ${sourceNode?.name || edge.source}`)
  }
  
  console.log('输出边:')
  for (const edge of outgoingEdges) {
    const targetNode = config.nodes.find((n: any) => n.id === edge.target)
    console.log(`  - 到: ${targetNode?.name || edge.target}`)
  }

  // 检查 GROUP 节点
  console.log('\n=== GROUP 节点 ===')
  const groupNodes = config.nodes.filter((n: any) => n.type === 'GROUP')
  if (groupNodes.length === 0) {
    console.log('没有 GROUP 节点')
  } else {
    for (const node of groupNodes) {
      console.log(`节点: ${node.name}`)
      console.log('配置:', JSON.stringify(node.config, null, 2))
    }
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
