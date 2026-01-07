import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

async function main() {
  const workflow = await prisma.workflow.findUnique({
    where: { id: WORKFLOW_ID },
    select: { id: true, name: true, config: true, draftConfig: true },
  })

  if (!workflow) {
    console.log('工作流不存在')
    return
  }

  console.log('工作流名称:', workflow.name)

  const config = (workflow.draftConfig || workflow.config) as any
  const inputNode = config.nodes.find((n: any) => n.type === 'INPUT')
  
  console.log('输入节点名称:', inputNode?.name)
  
  let fixCount = 0
  const fixes: string[] = []
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    const nodeConfig = node.config
    
    if (nodeConfig.userPrompt && typeof nodeConfig.userPrompt === 'string') {
      const original = nodeConfig.userPrompt
      const fixed = original.replace(/\{\{输入\./g, `{{${inputNode.name}.`)
      
      if (fixed !== original) {
        fixes.push(`节点 "${node.name}": 修复变量引用`)
        nodeConfig.userPrompt = fixed
        fixCount++
      }
    }
  }

  if (fixCount === 0) {
    console.log('没有需要修复的变量引用')
    return
  }

  console.log(`修复了 ${fixCount} 个节点:`)
  fixes.forEach(f => console.log('  -', f))
  
  await prisma.workflow.update({
    where: { id: WORKFLOW_ID },
    data: { draftConfig: config },
  })

  console.log('配置已保存')
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
