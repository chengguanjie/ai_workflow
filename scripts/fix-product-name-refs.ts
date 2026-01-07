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
  
  // 找到 AI产品名称 节点
  const node = config.nodes.find((n: any) => n.name === 'AI产品名称')
  if (!node) {
    console.log('找不到 AI产品名称 节点')
    return
  }
  
  console.log('=== 修复 AI产品名称 节点的知识库引用 ===')
  
  let userPrompt = node.config?.userPrompt || ''
  
  // 替换 {{产品名称.知识库.xxx}} 为 {{AI产品名称.知识库.xxx}}
  const originalPrompt = userPrompt
  userPrompt = userPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
  
  if (userPrompt !== originalPrompt) {
    console.log('修复了以下引用:')
    console.log('  {{产品名称.知识库.参照标准}} -> {{AI产品名称.知识库.参照标准}}')
    console.log('  {{产品名称.知识库.错误案例}} -> {{AI产品名称.知识库.错误案例}}')
    
    node.config.userPrompt = userPrompt
    
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
