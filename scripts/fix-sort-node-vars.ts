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
  
  // 找到输入节点，查看有哪些字段
  const inputNode = config.nodes.find((n: any) => n.type === 'INPUT')
  console.log('=== 输入节点字段 ===')
  if (inputNode?.config?.fields) {
    for (const field of inputNode.config.fields) {
      console.log(`- ${field.name}`)
    }
  }
  
  // 找到排序节点
  const sortNode = config.nodes.find((n: any) => n.name === '排序')
  if (!sortNode) {
    console.log('找不到排序节点')
    return
  }
  
  console.log('\n=== 排序节点 userPrompt 中的变量引用 ===')
  const userPrompt = sortNode.config?.userPrompt || ''
  const matches = userPrompt.match(/\{\{[^}]+\}\}/g) || []
  for (const m of matches) {
    console.log(`- ${m}`)
  }
  
  // 检查是否有 卖点标注 vs 卖点突出 的问题
  if (userPrompt.includes('{{信息填写.卖点标注}}')) {
    console.log('\n=== 修复变量引用 ===')
    console.log('将 {{信息填写.卖点标注}} 替换为 {{信息填写.卖点突出}}')
    
    sortNode.config.userPrompt = userPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    
    await prisma.workflow.update({
      where: { id: WORKFLOW_ID },
      data: { draftConfig: config },
    })
    
    console.log('配置已保存')
  } else {
    console.log('\n没有找到需要修复的变量引用')
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
