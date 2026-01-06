/**
 * 通过 API Token 测试工作流执行
 * 检查微信公众号文章二创工作流的每个节点输出是否完整
 * 
 * 使用方法:
 * npx ts-node scripts/test-workflow-api.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// API Token - 用于执行工作流
const API_TOKEN = 'wf_xIQi-ljimvi3LudxmHXpU7Fjy3g_VVAaLpaZLq39NXI'

// 基础 URL
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3100'

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

/**
 * 通过 API Token 查找关联的组织和工作流
 */
async function findTokenInfo(): Promise<{ organizationId: string } | null> {
  console.log('='.repeat(80))
  console.log('通过 API Token 查找信息...')
  console.log('='.repeat(80))

  // 查找 API Token
  const token = await prisma.apiToken.findFirst({
    where: {
      token: API_TOKEN,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      scopes: true,
    },
  })

  if (!token) {
    console.error('❌ API Token 不存在或已禁用')
    return null
  }

  console.log('\n📋 Token 信息:')
  console.log(`  Token ID: ${token.id}`)
  console.log(`  Token 名称: ${token.name}`)
  console.log(`  组织 ID: ${token.organizationId}`)
  console.log(`  作用域: ${JSON.stringify(token.scopes)}`)

  return { organizationId: token.organizationId }
}

/**
 * 获取组织下的工作流列表
 */
async function listWorkflows(organizationId: string) {
  console.log('\n' + '='.repeat(80))
  console.log('获取组织下的工作流列表...')
  console.log('='.repeat(80))

  const workflows = await prisma.workflow.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      publishStatus: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 10,
  })

  console.log(`\n找到 ${workflows.length} 个工作流:`)
  workflows.forEach((wf, index) => {
    console.log(`  ${index + 1}. ${wf.name} (${wf.id}) - ${wf.publishStatus}`)
    if (wf.description) {
      console.log(`     ${wf.description.substring(0, 50)}...`)
    }
  })

  // 查找微信公众号文章二创相关的工作流
  const targetWorkflow = workflows.find(wf => 
    wf.name.includes('微信') || 
    wf.name.includes('公众号') || 
    wf.name.includes('二创') ||
    wf.name.includes('文章')
  )

  if (targetWorkflow) {
    console.log(`\n🎯 找到目标工作流: ${targetWorkflow.name} (${targetWorkflow.id})`)
    return targetWorkflow.id
  }

  // 如果没找到，返回第一个已发布的工作流
  const publishedWorkflow = workflows.find(wf => wf.publishStatus === 'PUBLISHED')
  if (publishedWorkflow) {
    console.log(`\n🎯 使用已发布工作流: ${publishedWorkflow.name} (${publishedWorkflow.id})`)
    return publishedWorkflow.id
  }

  return workflows[0]?.id || null
}

/**
 * 获取工作流详细信息
 */
async function getWorkflowInfo(workflowId: string) {
  console.log('\n' + '='.repeat(80))
  console.log('获取工作流详细信息...')
  console.log('='.repeat(80))

  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      config: true,
      publishedConfig: true,
      publishStatus: true,
      organizationId: true,
    },
  })

  if (!workflow) {
    console.error('❌ 工作流不存在')
    return null
  }

  // 解析配置获取节点信息
  const config = (workflow.publishedConfig || workflow.config) as {
    nodes?: Array<{ id: string; name: string; type: string; data?: Record<string, unknown> }>
    edges?: Array<{ source: string; target: string }>
  }

  console.log(`\n📋 工作流: ${workflow.name}`)
  console.log(`   发布状态: ${workflow.publishStatus}`)

  if (config?.nodes) {
    console.log(`\n📦 节点列表 (共 ${config.nodes.length} 个):`)
    config.nodes.forEach((node, index) => {
      console.log(`  ${index + 1}. [${node.type}] ${node.name} (${node.id})`)
    })
  }

  // 检查输入节点需要的参数
  const inputNodes = config?.nodes?.filter(n => n.type === 'INPUT') || []
  if (inputNodes.length > 0) {
    console.log('\n📥 输入参数:')
    inputNodes.forEach(node => {
      const fields = (node.data?.fields as Array<{ name: string; type: string; required?: boolean }>) || []
      fields.forEach(field => {
        console.log(`  - ${field.name} (${field.type})${field.required ? ' *必填' : ''}`)
      })
    })
  }

  return workflow
}

/**
 * 获取最新执行的节点日志
 */
async function getLatestExecutionLogs(workflowId: string) {
  console.log('\n' + '='.repeat(80))
  console.log('获取最新执行的节点日志...')
  console.log('='.repeat(80))

  const execution = await prisma.execution.findFirst({
    where: {
      workflowId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      logs: {
        orderBy: { startedAt: 'asc' },
      },
    },
  })

  if (!execution) {
    console.log('❌ 没有找到执行记录')
    return null
  }

  console.log(`\n🔄 执行 ID: ${execution.id}`)
  console.log(`   状态: ${execution.status}`)
  console.log(`   开始时间: ${execution.startedAt}`)
  console.log(`   完成时间: ${execution.completedAt}`)
  console.log(`   耗时: ${execution.duration}ms`)
  console.log(`   Token 使用: ${execution.totalTokens}`)

  if (execution.error) {
    console.log(`   ❌ 错误: ${execution.error}`)
  }

  return execution
}

/**
 * 分析节点输出是否被截断
 */
function analyzeNodeOutput(log: NodeLog) {
  const output = log.output as Record<string, unknown> | null

  console.log(`\n┌─ 节点: ${log.nodeName} [${log.nodeType}]`)
  console.log(`│  ID: ${log.nodeId}`)
  console.log(`│  状态: ${log.status}`)
  console.log(`│  耗时: ${log.duration}ms`)

  if (log.promptTokens || log.completionTokens) {
    console.log(`│  Tokens: prompt=${log.promptTokens}, completion=${log.completionTokens}`)
  }

  if (log.error) {
    console.log(`│  ❌ 错误: ${log.error}`)
  }

  if (!output) {
    console.log(`│  ⚠️ 输出为空`)
    console.log(`└─`)
    return { nodeName: log.nodeName, status: 'empty', issues: ['输出为空'] }
  }

  console.log(`│  📤 输出分析:`)

  const issues: string[] = []

  for (const [key, value] of Object.entries(output)) {
    if (typeof value === 'string') {
      const length = value.length
      const truncated = checkIfTruncated(value)
      const preview = value.substring(0, 150).replace(/\n/g, '\\n')

      console.log(`│     ${key}: ${length} 字符`)
      console.log(`│        预览: "${preview}${length > 150 ? '...' : ''}"`)

      if (truncated.isTruncated) {
        console.log(`│        ⚠️ 可能被截断: ${truncated.reason}`)
        issues.push(`${key}: ${truncated.reason}`)
      } else {
        console.log(`│        ✅ 内容完整`)
      }
    } else if (Array.isArray(value)) {
      console.log(`│     ${key}: 数组, ${value.length} 项`)

      value.forEach((item, index) => {
        if (typeof item === 'string' && item.length > 50) {
          const truncated = checkIfTruncated(item)
          if (truncated.isTruncated) {
            console.log(`│        [${index}]: ${item.length} 字符 ⚠️ 可能截断: ${truncated.reason}`)
            issues.push(`${key}[${index}]: ${truncated.reason}`)
          } else {
            console.log(`│        [${index}]: ${item.length} 字符 ✅`)
          }
        }
      })
    } else if (typeof value === 'object' && value !== null) {
      const jsonStr = JSON.stringify(value)
      console.log(`│     ${key}: 对象, ${jsonStr.length} 字符`)
    } else {
      console.log(`│     ${key}: ${typeof value}`)
    }
  }

  console.log(`└─`)

  return {
    nodeName: log.nodeName,
    status: issues.length > 0 ? 'truncated' : 'complete',
    issues,
  }
}

/**
 * 检查文本是否被截断
 */
function checkIfTruncated(text: string): { isTruncated: boolean; reason: string } {
  // 检查常见的截断标志
  const truncationIndicators = [
    { pattern: /\.{3}$/, reason: '以省略号结尾' },
    { pattern: /…$/, reason: '以省略号结尾' },
    { pattern: /\[truncated\]/i, reason: '包含 [truncated] 标记' },
    { pattern: /\[cut off\]/i, reason: '包含 [cut off] 标记' },
    { pattern: /\.\.\.\s*$/, reason: '以 ... 结尾' },
    { pattern: /【未完】/i, reason: '包含 【未完】 标记' },
    { pattern: /\(continued\)/i, reason: '包含 (continued) 标记' },
  ]

  for (const indicator of truncationIndicators) {
    if (indicator.pattern.test(text)) {
      return { isTruncated: true, reason: indicator.reason }
    }
  }

  // 检查是否在句子中间结束（没有正常的结束标点）
  const lastChar = text.trim().slice(-1)
  const normalEndings = ['.', '。', '!', '！', '?', '？', '"', '"', '\'', '）', ')', ']', '】', '}', '>', '》', '：', ':']

  if (text.length > 500 && !normalEndings.includes(lastChar)) {
    return { isTruncated: true, reason: '长文本没有正常结尾标点' }
  }

  return { isTruncated: false, reason: '' }
}

/**
 * 打印详细的节点输出
 */
function printDetailedOutput(log: NodeLog) {
  console.log('\n' + '─'.repeat(80))
  console.log(`📦 节点: ${log.nodeName} [${log.nodeType}]`)
  console.log(`   状态: ${log.status}`)

  console.log('\n   📥 输入:')
  const inputStr = JSON.stringify(log.input, null, 2)
  if (inputStr.length > 2000) {
    console.log('      [输入内容过长，已省略]')
  } else {
    console.log(inputStr.split('\n').map(l => '      ' + l).join('\n'))
  }

  console.log('\n   📤 输出:')
  const outputStr = JSON.stringify(log.output, null, 2)
  console.log(outputStr.split('\n').map(l => '      ' + l).join('\n'))

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

async function main() {
  try {
    console.log('\n🚀 开始通过 API Token 测试工作流\n')
    console.log(`API Token: ${API_TOKEN.substring(0, 20)}...`)
    console.log(`Base URL: ${BASE_URL}\n`)

    // 1. 通过 Token 查找组织信息
    const tokenInfo = await findTokenInfo()
    if (!tokenInfo) {
      process.exit(1)
    }

    // 2. 获取组织下的工作流
    const workflowId = await listWorkflows(tokenInfo.organizationId)
    if (!workflowId) {
      console.error('❌ 没有找到可用的工作流')
      process.exit(1)
    }

    // 3. 获取工作流信息
    await getWorkflowInfo(workflowId)

    // 4. 获取最新的执行记录来分析
    const latestExecution = await getLatestExecutionLogs(workflowId)

    if (latestExecution && latestExecution.logs.length > 0) {
      console.log('\n' + '='.repeat(80))
      console.log('分析最新执行的节点输出...')
      console.log('='.repeat(80))

      const results: Array<{ nodeName: string; status: string; issues: string[] }> = []

      for (const log of latestExecution.logs) {
        const result = analyzeNodeOutput(log as NodeLog)
        results.push(result)
      }

      // 打印汇总
      console.log('\n' + '='.repeat(80))
      console.log('📊 输出完整性汇总')
      console.log('='.repeat(80))

      const truncatedNodes = results.filter(r => r.status === 'truncated')
      const emptyNodes = results.filter(r => r.status === 'empty')
      const completeNodes = results.filter(r => r.status === 'complete')

      console.log(`\n✅ 完整输出: ${completeNodes.length} 个节点`)
      completeNodes.forEach(n => console.log(`   - ${n.nodeName}`))

      if (emptyNodes.length > 0) {
        console.log(`\n⚠️ 空输出: ${emptyNodes.length} 个节点`)
        emptyNodes.forEach(n => console.log(`   - ${n.nodeName}`))
      }

      if (truncatedNodes.length > 0) {
        console.log(`\n❌ 可能被截断: ${truncatedNodes.length} 个节点`)
        truncatedNodes.forEach(n => {
          console.log(`   - ${n.nodeName}`)
          n.issues.forEach(issue => console.log(`     • ${issue}`))
        })
      }

      // 打印详细输出
      console.log('\n' + '='.repeat(80))
      console.log('📝 详细节点输出')
      console.log('='.repeat(80))

      for (const log of latestExecution.logs) {
        printDetailedOutput(log as NodeLog)
      }
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
