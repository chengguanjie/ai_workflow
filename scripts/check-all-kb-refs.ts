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
  
  // 获取所有节点名称
  const nodeNames = new Set(config.nodes.map((n: any) => n.name))
  
  console.log('=== 所有节点名称 ===')
  for (const name of nodeNames) {
    console.log(`- ${name}`)
  }
  
  console.log('\n=== 检查知识库引用 ===')
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    const userPrompt = node.config?.userPrompt || ''
    const systemPrompt = node.config?.systemPrompt || ''
    const allPrompts = userPrompt + systemPrompt
    
    // 查找所有变量引用
    const matches = allPrompts.match(/\{\{[^}]+\}\}/g) || []
    
    // 检查知识库引用
    const kbRefs = matches.filter((m: string) => m.includes('.知识库.'))
    
    if (kbRefs.length > 0) {
      console.log(`\n节点: ${node.name}`)
      for (const ref of kbRefs) {
        // 提取节点名
        const match = ref.match(/\{\{([^.]+)\.知识库\.([^}]+)\}\}/)
        if (match) {
          const refNodeName = match[1]
          const kbField = match[2]
          const exists = nodeNames.has(refNodeName)
          console.log(`  ${ref}`)
          console.log(`    节点 "${refNodeName}" ${exists ? '✓ 存在' : '✗ 不存在'}`)
        }
      }
    }
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
