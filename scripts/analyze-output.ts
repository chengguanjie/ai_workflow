/**
 * 分析节点输出详情
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const executionId = 'cmk1c09ng0001ef747zpffbtp'
  
  const logs = await prisma.executionLog.findMany({
    where: { executionId },
    orderBy: { startedAt: 'asc' },
  })
  
  console.log('='.repeat(80))
  console.log('详细节点输出分析')
  console.log('='.repeat(80))
  
  for (const log of logs) {
    console.log('\n' + '-'.repeat(80))
    console.log('节点:', log.nodeName, '[' + log.nodeType + ']')
    console.log('状态:', log.status)
    console.log('Tokens: prompt=' + log.promptTokens + ', completion=' + log.completionTokens)
    
    const output = log.output as Record<string, unknown> | null
    if (!output) {
      console.log('输出: 空')
      continue
    }
    
    console.log('\n输出字段:')
    for (const [key, value] of Object.entries(output)) {
      if (typeof value === 'string') {
        console.log('  ' + key + ': ' + value.length + ' 字符')
        
        // 检查是否有截断标记
        if (value.includes('[truncated') || value.includes('…[truncated')) {
          console.log('    ⚠️ 发现截断标记!')
        }
        
        // 显示最后200个字符
        const ending = value.slice(-200)
        console.log('    结尾: "...' + ending.replace(/\n/g, '\\n') + '"')
      } else if (key === '_truncated') {
        console.log('  _truncated:', value)
      } else if (key === '_truncatedKeys') {
        console.log('  _truncatedKeys:', JSON.stringify(value))
      } else if (Array.isArray(value)) {
        console.log('  ' + key + ': 数组, ' + value.length + ' 项')
        // 检查数组中的字符串
        value.forEach((item, idx) => {
          if (typeof item === 'string' && item.length > 100) {
            console.log('    [' + idx + ']: ' + item.length + ' 字符')
            if (item.includes('[truncated')) {
              console.log('      ⚠️ 发现截断标记!')
            }
          }
        })
      } else if (typeof value === 'object' && value !== null) {
        const jsonStr = JSON.stringify(value)
        console.log('  ' + key + ': 对象, ' + jsonStr.length + ' 字符')
      } else {
        console.log('  ' + key + ':', typeof value, '=', value)
      }
    }
  }
  
  await prisma.$disconnect()
}

main()
