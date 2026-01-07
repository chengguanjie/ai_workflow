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
  
  // 找到 AI温馨提示 节点
  const node = config.nodes.find((n: any) => n.name === 'AI温馨提示')
  if (!node) {
    console.log('找不到 AI温馨提示 节点')
    return
  }
  
  console.log('=== AI温馨提示 节点的变量引用 ===')
  const userPrompt = node.config?.userPrompt || ''
  const matches = userPrompt.match(/\{\{[^}]+\}\}/g) || []
  for (const m of matches) {
    console.log(`- ${m}`)
  }
  
  // 检查 {{产品名称}} 应该引用什么
  // 可能是 {{信息填写.产品名称}} 或 {{AI产品名称}}
  // 根据上下文，应该是 {{信息填写.产品名称}}（用户输入的产品名称）
  
  console.log('\n=== 修复变量引用 ===')
  let fixedPrompt = userPrompt
  
  // {{产品名称}} -> {{信息填写.产品名称}}
  fixedPrompt = fixedPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
  
  if (fixedPrompt !== userPrompt) {
    console.log('修复: {{产品名称}} -> {{信息填写.产品名称}}')
    node.config.userPrompt = fixedPrompt
    
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
