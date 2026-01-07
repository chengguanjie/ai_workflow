import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

const childNodeIds = [
  "process_1766157570372",
  "process_1766157592749",
  "process_1766157616090",
  "process_1766157625790",
  "process_1766157653290"
]

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
  
  console.log('=== AI配料 组内的子节点 ===\n')
  
  for (const childId of childNodeIds) {
    const node = config.nodes.find((n: any) => n.id === childId)
    if (node) {
      console.log(`节点: ${node.name}`)
      console.log(`  ID: ${node.id}`)
      console.log(`  类型: ${node.type}`)
      console.log(`  模型: ${node.config?.model || '无'}`)
      
      // 检查这个节点的边
      const inEdges = config.edges.filter((e: any) => e.target === childId)
      const outEdges = config.edges.filter((e: any) => e.source === childId)
      
      if (inEdges.length > 0) {
        console.log('  输入来自:')
        for (const e of inEdges) {
          const src = config.nodes.find((n: any) => n.id === e.source)
          console.log(`    - ${src?.name || e.source}`)
        }
      }
      
      if (outEdges.length > 0) {
        console.log('  输出到:')
        for (const e of outEdges) {
          const tgt = config.nodes.find((n: any) => n.id === e.target)
          console.log(`    - ${tgt?.name || e.target}`)
        }
      }
      
      console.log('')
    } else {
      console.log(`找不到节点: ${childId}\n`)
    }
  }
  
  // 检查工作流引擎是否有 GROUP 处理器
  console.log('=== 工作流结构分析 ===')
  const nodeTypes = new Set(config.nodes.map((n: any) => n.type))
  console.log('节点类型:', Array.from(nodeTypes).join(', '))
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
