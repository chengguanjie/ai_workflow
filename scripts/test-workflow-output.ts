/**
 * 测试工作流执行脚本
 * 用于测试微信公众号文章二创工作流的每个节点输出是否完整
 * 
 * 使用方法:
 * npx ts-node scripts/test-workflow-output.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 工作流 ID - 微信公众号文章智能二创助手
const WORKFLOW_ID = 'cmjsmsfjn0001efk73lpkohga'

interface NodeLog {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  input: unknown
  output: unknown
  status: string
  promptTokens: number | null
  completionTokens: number | null
  startedAt: Date
  completedAt: Date | null
  duration: number | null
  error: string | null
}

interface Execution {
  id: string
  status: string
  input: unknown
  output: unknown
  startedAt: Date | null
  completedAt: Date | null
  duration: number | null
  totalTokens: number | null
  error: string | null
  logs: NodeLog[]
}

async function getWorkflowInfo() {
  console.log('='.repeat(80))
  console.log('查询工作流信息...')
  console.log('='.repeat(80))
  
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: WORKFLOW_ID,
    },
    select: {
      id: true,
      name: true,
      description: true,
      config: true,
      publishedConfig: true,
      publishStatus: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!workflow) {
    console.error('❌ 工作流不存在:', WORKFLOW_ID)
    return null
  }

  console.log('\n📋 工作流基本信息:')
  console.log(`  ID: ${workflow.id}`)
  console.log(`  名称: ${workflow.name}`)
  console.log(`  描述: ${workflow.description || '无'}`)
  console.log(`  发布状态: ${workflow.publishStatus}`)
  console.log(`  组织ID: ${workflow.organizationId}`)
  console.log(`  创建时间: ${workflow.createdAt}`)
  console.log(`  更新时间: ${workflow.updatedAt}`)

  // 解析配置获取节点信息
  const config = (workflow.publishedConfig || workflow.config) as {
    nodes?: Array<{ id: string; name: string; type: string }>
    edges?: Array<{ source: string; target: string }>
  }
  
  if (config?.nodes) {
    console.log(`\n📦 节点列表 (共 ${config.nodes.length} 个):`)
    config.nodes.forEach((node, index) => {
      console.log(`  ${index + 1}. [${node.type}] ${node.name} (${node.id})`)
    })
  }

  return workflow
}

async function getLatestExecutions(limit: number = 5) {
  console.log('\n' + '='.repeat(80))
  console.log(`查询最近 ${limit} 次执行记录...`)
  console.log('='.repeat(80))

  const executions = await prisma.execution.findMany({
    where: {
      workflowId: WORKFLOW_ID,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    include: {
      logs: {
        orderBy: { startedAt: 'asc' },
        select: {
          id: true,
          nodeId: true,
          nodeName: true,
          nodeType: true,
          input: true,
          output: true,
          status: true,
          promptTokens: true,
          completionTokens: true,
          startedAt: true,
          completedAt: true,
          duration: true,
          error: true,
        },
      },
    },
  })

  if (executions.length === 0) {
    console.log('❌ 没有找到执行记录')
    return []
  }

  console.log(`\n找到 ${executions.length} 条执行记录:\n`)

  for (const exec of executions) {
    console.log('-'.repeat(80))
    console.log(`🔄 执行 ID: ${exec.id}`)
    console.log(`   状态: ${exec.status}`)
    console.log(`   开始时间: ${exec.startedAt}`)
    console.log(`   完成时间: ${exec.completedAt}`)
    console.log(`   耗时: ${exec.duration}ms`)
    console.log(`   Token 使用: ${exec.totalTokens}`)
    
    if (exec.error) {
      console.log(`   ❌ 错误: ${exec.error}`)
    }

    console.log(`\n   📝 节点执行日志 (共 ${exec.logs.length} 个):`)
    
    for (const log of exec.logs) {
      console.log(`\n   ┌─ 节点: ${log.nodeName} [${log.nodeType}]`)
      console.log(`   │  ID: ${log.nodeId}`)
      console.log(`   │  状态: ${log.status}`)
      console.log(`   │  耗时: ${log.duration}ms`)
      
      if (log.promptTokens || log.completionTokens) {
        console.log(`   │  Tokens: prompt=${log.promptTokens}, completion=${log.completionTokens}`)
      }
      
      if (log.error) {
        console.log(`   │  ❌ 错误: ${log.error}`)
      }

      // 检查输出内容
      analyzeNodeOutput(log)
    }
  }

  return executions
}

function analyzeNodeOutput(log: NodeLog) {
  const output = log.output as Record<string, unknown> | null
  
  if (!output) {
    console.log(`   │  ⚠️ 输出为空`)
    return
  }

  console.log(`   │  📤 输出分析:`)
  
  // 遍历输出字段
  for (const [key, value] of Object.entries(output)) {
    if (typeof value === 'string') {
      const length = value.length
      const truncated = checkIfTruncated(value)
      const preview = value.substring(0, 100).replace(/\n/g, '\\n')
      
      console.log(`   │     ${key}: ${length} 字符`)
      console.log(`   │        预览: "${preview}${length > 100 ? '...' : ''}"`)
      
      if (truncated.isTruncated) {
        console.log(`   │        ⚠️ 可能被截断: ${truncated.reason}`)
      } else {
        console.log(`   │        ✅ 内容完整`)
      }
    } else if (Array.isArray(value)) {
      console.log(`   │     ${key}: 数组, ${value.length} 项`)
      
      // 检查数组中的字符串项
      value.forEach((item, index) => {
        if (typeof item === 'string' && item.length > 50) {
          const truncated = checkIfTruncated(item)
          console.log(`   │        [${index}]: ${item.length} 字符 ${truncated.isTruncated ? '⚠️ 可能截断' : '✅'}`)
        }
      })
    } else if (typeof value === 'object' && value !== null) {
      const jsonStr = JSON.stringify(value)
      console.log(`   │     ${key}: 对象, ${jsonStr.length} 字符`)
    } else {
      console.log(`   │     ${key}: ${typeof value}`)
    }
  }
  
  console.log(`   └─`)
}

function checkIfTruncated(text: string): { isTruncated: boolean; reason: string } {
  // 检查常见的截断标志
  const truncationIndicators = [
    { pattern: /\.{3}$/, reason: '以省略号结尾' },
    { pattern: /…$/, reason: '以省略号结尾' },
    { pattern: /\[truncated\]/i, reason: '包含 [truncated] 标记' },
    { pattern: /\[cut off\]/i, reason: '包含 [cut off] 标记' },
    { pattern: /\.\.\.\s*$/, reason: '以 ... 结尾' },
  ]

  for (const indicator of truncationIndicators) {
    if (indicator.pattern.test(text)) {
      return { isTruncated: true, reason: indicator.reason }
    }
  }

  // 检查是否在句子中间结束（没有正常的结束标点）
  const lastChar = text.trim().slice(-1)
  const normalEndings = ['.', '。', '!', '！', '?', '？', '"', '"', '\'', '）', ')', ']', '】', '}', '>', '》']
  
  if (text.length > 500 && !normalEndings.includes(lastChar)) {
    // 长文本且没有正常结尾，可能被截断
    return { isTruncated: true, reason: '长文本没有正常结尾标点' }
  }

  return { isTruncated: false, reason: '' }
}

async function getDetailedNodeOutput(executionId: string) {
  console.log('\n' + '='.repeat(80))
  console.log(`获取执行 ${executionId} 的详细节点输出...`)
  console.log('='.repeat(80))

  const logs = await prisma.nodeLog.findMany({
    where: {
      executionId,
    },
    orderBy: {
      startedAt: 'asc',
    },
  })

  for (const log of logs) {
    console.log('\n' + '─'.repeat(80))
    console.log(`📦 节点: ${log.nodeName} [${log.nodeType}]`)
    console.log(`   状态: ${log.status}`)
    
    console.log('\n   📥 输入:')
    console.log(JSON.stringify(log.input, null, 2).split('\n').map(l => '      ' + l).join('\n'))
    
    console.log('\n   📤 输出:')
    const outputStr = JSON.stringify(log.output, null, 2)
    console.log(outputStr.split('\n').map(l => '      ' + l).join('\n'))
    
    // 输出完整长度统计
    console.log(`\n   📊 输出统计:`)
    console.log(`      JSON 总长度: ${outputStr.length} 字符`)
    
    if (log.output && typeof log.output === 'object') {
      for (const [key, value] of Object.entries(log.output as Record<string, unknown>)) {
        if (typeof value === 'string') {
          console.log(`      ${key}: ${value.length} 字符`)
        }
      }
    }
  }
}

async function main() {
  try {
    console.log('\n🚀 开始测试工作流输出完整性\n')
    console.log(`目标工作流 ID: ${WORKFLOW_ID}\n`)

    // 1. 获取工作流信息
    const workflow = await getWorkflowInfo()
    if (!workflow) {
      process.exit(1)
    }

    // 2. 获取最近的执行记录
    const executions = await getLatestExecutions(3)
    
    if (executions.length > 0) {
      // 3. 获取最新一次执行的详细输出
      const latestExecution = executions[0]
      await getDetailedNodeOutput(latestExecution.id)
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ 测试完成')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('❌ 测试失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
