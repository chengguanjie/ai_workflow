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
  
  // 找到 AI产品类型 节点
  const node = config.nodes.find((n: any) => n.name === 'AI产品类型')
  if (!node) {
    console.log('找不到 AI产品类型 节点')
    return
  }
  
  console.log('=== AI产品类型 节点配置 ===')
  console.log('变量引用:')
  const userPrompt = node.config?.userPrompt || ''
  const matches = userPrompt.match(/\{\{[^}]+\}\}/g) || []
  for (const m of matches) {
    console.log(`  ${m}`)
  }
  
  // 问题是 {{AI产品类别.知识库.产品名称标准描述}}
  // 这是引用 AI产品类别 节点的知识库字段
  // 但知识库引用格式应该是 {{节点名.知识库.字段名}}
  // 系统可能不支持这种知识库引用
  
  // 检查 AI产品类别 节点是否有知识库配置
  const categoryNode = config.nodes.find((n: any) => n.name === 'AI产品类别')
  if (categoryNode) {
    console.log('\n=== AI产品类别 节点配置 ===')
    console.log('节点配置:', JSON.stringify(categoryNode.config, null, 2).substring(0, 500))
  }
  
  // 由于知识库引用无法解析，我们需要移除或替换这个引用
  // 暂时将其替换为空字符串，让工作流能继续执行
  console.log('\n=== 修复方案 ===')
  console.log('将错误的知识库引用改为引用本节点的 knowledgeItems')
  
  let fixedPrompt = userPrompt
  // 该条目实际配置在 AI产品类型 节点自身的 knowledgeItems 中
  fixedPrompt = fixedPrompt.replace(
    /\{\{AI产品类别\.知识库\.产品名称标准描述\}\}/g,
    '{{AI产品类型.知识库.产品名称标准描述}}'
  )
  
  if (fixedPrompt !== userPrompt) {
    node.config.userPrompt = fixedPrompt
    
    await prisma.workflow.update({
      where: { id: WORKFLOW_ID },
      data: { draftConfig: config },
    })
    
    console.log('配置已保存')
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
