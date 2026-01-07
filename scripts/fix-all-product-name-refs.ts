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
  
  console.log('=== 批量修复 {{产品名称}} 引用 ===\n')
  
  let totalFixes = 0
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    let userPrompt = node.config?.userPrompt || ''
    let systemPrompt = node.config?.systemPrompt || ''
    
    const originalUser = userPrompt
    const originalSystem = systemPrompt
    
    // 修复 {{产品名称}} -> {{信息填写.产品名称}}
    // 注意：不要修改 {{产品名称.知识库.xxx}} 这种格式
    userPrompt = userPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
    systemPrompt = systemPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
    
    if (userPrompt !== originalUser || systemPrompt !== originalSystem) {
      console.log(`修复节点: ${node.name}`)
      node.config.userPrompt = userPrompt
      node.config.systemPrompt = systemPrompt
      totalFixes++
    }
  }
  
  if (totalFixes > 0) {
    console.log(`\n共修复 ${totalFixes} 个节点`)
    
    await prisma.workflow.update({
      where: { id: WORKFLOW_ID },
      data: { draftConfig: config },
    })
    
    console.log('配置已保存')
  } else {
    console.log('没有需要修复的引用')
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
