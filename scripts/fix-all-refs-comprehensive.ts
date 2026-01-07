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
  const inputNodeName = config.nodes.find((n: any) => n.type === 'INPUT')?.name || '信息填写'
  
  console.log('=== 全面修复变量引用 ===\n')
  console.log('输入节点名称:', inputNodeName)
  console.log('所有节点:', Array.from(nodeNames).join(', '))
  console.log('')
  
  let totalFixes = 0
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    let userPrompt = node.config?.userPrompt || ''
    let systemPrompt = node.config?.systemPrompt || ''
    
    const originalUser = userPrompt
    const originalSystem = systemPrompt
    
    // 1. 修复 {{输入.xxx}} -> {{信息填写.xxx}}
    userPrompt = userPrompt.replace(/\{\{输入\./g, `{{${inputNodeName}.`)
    systemPrompt = systemPrompt.replace(/\{\{输入\./g, `{{${inputNodeName}.`)
    
    // 2. 修复 {{产品名称}} -> {{信息填写.产品名称}} (不含.知识库的)
    userPrompt = userPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
    systemPrompt = systemPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
    
    // 3. 修复 {{产品名称.知识库.xxx}} -> {{AI产品名称.知识库.xxx}}
    userPrompt = userPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
    systemPrompt = systemPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
    
    // 4. 修复 {{信息填写.卖点标注}} -> {{信息填写.卖点突出}}
    userPrompt = userPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    systemPrompt = systemPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    
    if (userPrompt !== originalUser || systemPrompt !== originalSystem) {
      console.log(`修复节点: ${node.name}`)
      node.config.userPrompt = userPrompt
      node.config.systemPrompt = systemPrompt
      totalFixes++
    }
  }
  
  // 检查所有节点中还有哪些无法解析的变量引用
  console.log('\n=== 检查剩余的变量引用问题 ===')
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    const userPrompt = node.config?.userPrompt || ''
    const matches = userPrompt.match(/\{\{([^.}]+)\}\}/g) || []
    
    for (const m of matches) {
      const refName = m.replace(/\{\{|\}\}/g, '')
      if (!nodeNames.has(refName) && refName !== inputNodeName) {
        console.log(`节点 "${node.name}": ${m} - 节点不存在`)
      }
    }
    
    // 检查 {{xxx.yyy}} 格式
    const fullMatches = userPrompt.match(/\{\{([^.}]+)\.([^}]+)\}\}/g) || []
    for (const m of fullMatches) {
      const match = m.match(/\{\{([^.}]+)\./)
      if (match) {
        const refNodeName = match[1]
        // 跳过知识库引用（这些是预期的）
        if (m.includes('.知识库.')) continue
        if (!nodeNames.has(refNodeName) && refNodeName !== inputNodeName) {
          console.log(`节点 "${node.name}": ${m} - 节点 "${refNodeName}" 不存在`)
        }
      }
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
    console.log('\n没有需要修复的引用')
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
