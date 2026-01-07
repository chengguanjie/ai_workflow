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
  
  // 找到 综合标签信息 节点
  const node = config.nodes.find((n: any) => n.name === '综合标签信息')
  if (!node) {
    console.log('找不到 综合标签信息 节点')
    return
  }
  
  console.log('=== 综合标签信息 节点配置 ===')
  console.log('userPrompt:', node.config?.userPrompt || '(空)')
  console.log('systemPrompt:', node.config?.systemPrompt || '(空)')
  
  // 如果 userPrompt 为空，设置一个默认值
  if (!node.config?.userPrompt || node.config.userPrompt.trim() === '') {
    console.log('\n=== 修复空提示词 ===')
    node.config.userPrompt = `请汇总以下标签信息：

产品名称：{{AI产品名称}}
配料表：{{AI配料}}
净含量：{{AI净含量}}
贮存条件：{{AI贮存条件}}
食用方法：{{AI食用方法}}
致敏物质提示：{{AI致敏物质提示生成}}
温馨提示：{{AI温馨提示}}
产品类型：{{AI产品类型}}
产品类别：{{AI产品类别}}
产品标代号：{{AI产品标代号}}

请整理成完整的产品标签信息。`
    
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
