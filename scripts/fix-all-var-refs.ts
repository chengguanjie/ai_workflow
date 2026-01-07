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
  
  // 找到输入节点名称
  const inputNode = config.nodes.find((n: any) => n.type === 'INPUT')
  const inputNodeName = inputNode?.name || '信息填写'
  console.log('输入节点名称:', inputNodeName)
  
  let totalFixes = 0
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    let userPrompt = node.config?.userPrompt || ''
    let systemPrompt = node.config?.systemPrompt || ''
    let fixes = 0
    
    // 修复 {{输入.xxx}} -> {{信息填写.xxx}}
    const originalUser = userPrompt
    const originalSystem = systemPrompt
    
    userPrompt = userPrompt.replace(/\{\{输入\./g, `{{${inputNodeName}.`)
    systemPrompt = systemPrompt.replace(/\{\{输入\./g, `{{${inputNodeName}.`)
    
    // 修复 {{产品名称.知识库.xxx}} -> {{AI产品名称.知识库.xxx}}
    userPrompt = userPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
    systemPrompt = systemPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
    
    // 修复 {{信息填写.卖点标注}} -> {{信息填写.卖点突出}}
    userPrompt = userPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    systemPrompt = systemPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    
    if (userPrompt !== originalUser || systemPrompt !== originalSystem) {
      fixes++
      console.log(`修复节点: ${node.name}`)
      node.config.userPrompt = userPrompt
      node.config.systemPrompt = systemPrompt
    }
    
    totalFixes += fixes
  }
  
  if (totalFixes > 0) {
    console.log(`\n共修复 ${totalFixes} 个节点`)
    
    await prisma.workflow.update({
      where: { id: WORKFLOW_ID },
      data: { draftConfig: config },
    })
    
    console.log('配置已保存')
  } else {
    console.log('没有需要修复的变量引用')
  }
  
  // 验证修复结果
  console.log('\n=== 验证修复结果 ===')
  const updatedWorkflow = await prisma.workflow.findUnique({
    where: { id: WORKFLOW_ID },
    select: { draftConfig: true },
  })
  
  const updatedConfig = updatedWorkflow?.draftConfig as any
  const aiMinganNode = updatedConfig?.nodes?.find((n: any) => n.name === 'AI致敏物质提示生成')
  if (aiMinganNode) {
    const prompt = aiMinganNode.config?.userPrompt || ''
    const hasOldRef = prompt.includes('{{输入.')
    console.log(`AI致敏物质提示生成 节点:`)
    console.log(`  包含 {{输入.xxx}}: ${hasOldRef ? '是 (未修复)' : '否 (已修复)'}`)
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
