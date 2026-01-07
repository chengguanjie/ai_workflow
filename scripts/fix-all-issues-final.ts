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
  
  // 获取所有节点名称和输入节点字段
  const nodeNames = new Set(config.nodes.map((n: any) => n.name))
  const inputNode = config.nodes.find((n: any) => n.type === 'INPUT')
  const inputNodeName = inputNode?.name || '信息填写'
  const inputFields = new Set((inputNode?.config?.fields || []).map((f: any) => f.name))
  
  console.log('输入节点:', inputNodeName)
  console.log('输入字段:', Array.from(inputFields).join(', '))
  console.log('所有节点:', Array.from(nodeNames).join(', '))
  console.log('')
  
  // 收集所有问题
  const allIssues: string[] = []
  
  for (const node of config.nodes) {
    if (node.type !== 'PROCESS') continue
    
    let userPrompt = node.config?.userPrompt || ''
    let systemPrompt = node.config?.systemPrompt || ''
    const original = userPrompt + systemPrompt
    
    // 1. 修复 {{输入.xxx}} -> {{信息填写.xxx}}
    userPrompt = userPrompt.replace(/\{\{输入\./g, `{{${inputNodeName}.`)
    systemPrompt = systemPrompt.replace(/\{\{输入\./g, `{{${inputNodeName}.`)
    
    // 2. 修复 {{产品名称}} -> {{信息填写.产品名称}}
    userPrompt = userPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
    systemPrompt = systemPrompt.replace(/\{\{产品名称\}\}/g, '{{信息填写.产品名称}}')
    
    // 3. 修复 {{产品名称.知识库.xxx}} -> {{AI产品名称.知识库.xxx}}
    userPrompt = userPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
    systemPrompt = systemPrompt.replace(/\{\{产品名称\.知识库\./g, '{{AI产品名称.知识库.')
    
    // 4. 修复 {{信息填写.卖点标注}} -> {{信息填写.卖点突出}}
    userPrompt = userPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    systemPrompt = systemPrompt.replace(/\{\{信息填写\.卖点标注\}\}/g, '{{信息填写.卖点突出}}')
    
    // 5. 移除所有 .知识库. 引用（系统不支持）
    const kbPattern = /\{\{[^}]+\.知识库\.[^}]+\}\}/g
    const kbMatches = userPrompt.match(kbPattern) || []
    for (const kb of kbMatches) {
      // 提取字段名作为占位符
      const fieldMatch = kb.match(/\.知识库\.([^}]+)\}\}/)
      const fieldName = fieldMatch ? fieldMatch[1] : '参考标准'
      userPrompt = userPrompt.replace(kb, `【${fieldName}】`)
      allIssues.push(`${node.name}: ${kb} -> 【${fieldName}】`)
    }
    
    const kbMatchesSys = systemPrompt.match(kbPattern) || []
    for (const kb of kbMatchesSys) {
      const fieldMatch = kb.match(/\.知识库\.([^}]+)\}\}/)
      const fieldName = fieldMatch ? fieldMatch[1] : '参考标准'
      systemPrompt = systemPrompt.replace(kb, `【${fieldName}】`)
    }
    
    // 检查还有哪些无法解析的引用
    const allRefs = (userPrompt + systemPrompt).match(/\{\{([^}]+)\}\}/g) || []
    for (const ref of allRefs) {
      const content = ref.replace(/\{\{|\}\}/g, '')
      
      // 简单引用 {{节点名}}
      if (!content.includes('.')) {
        if (!nodeNames.has(content)) {
          allIssues.push(`${node.name}: ${ref} - 节点不存在`)
        }
        continue
      }
      
      // 复杂引用 {{节点名.字段}}
      const [refNode, ...rest] = content.split('.')
      if (refNode === inputNodeName) {
        // 检查输入字段是否存在
        const fieldName = rest[0]
        if (!inputFields.has(fieldName)) {
          allIssues.push(`${node.name}: ${ref} - 输入字段 "${fieldName}" 不存在`)
        }
      } else if (!nodeNames.has(refNode)) {
        allIssues.push(`${node.name}: ${ref} - 节点 "${refNode}" 不存在`)
      }
    }
    
    node.config.userPrompt = userPrompt
    node.config.systemPrompt = systemPrompt
  }
  
  console.log('=== 修复的问题 ===')
  if (allIssues.length > 0) {
    for (const issue of allIssues) {
      console.log(`  ${issue}`)
    }
  } else {
    console.log('  无')
  }
  
  await prisma.workflow.update({
    where: { id: WORKFLOW_ID },
    data: { draftConfig: config },
  })
  
  console.log('\n配置已保存')
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
