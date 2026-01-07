/**
 * 执行工作流并跟踪每个节点的输入输出
 * 检查是否按照AI提示词如期执行
 */

import { PrismaClient, ExecutionType } from '@prisma/client'

const prisma = new PrismaClient()

const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

// 获取第一个用户和组织
async function getTestUser() {
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      organizationId: true,
      email: true,
    },
  })
  return user
}

interface NodeConfig {
  id: string
  name: string
  type: string
  config: {
    model?: string
    userPrompt?: string
    systemPrompt?: string
    fields?: Array<{ name: string; value: string }>
    [key: string]: unknown
  }
}

interface WorkflowConfig {
  nodes: NodeConfig[]
  edges: Array<{ source: string; target: string }>
}

async function main() {
  console.log('='.repeat(80))
  console.log('工作流执行与跟踪')
  console.log('='.repeat(80))
  console.log('')

  // 1. 获取测试用户
  const user = await getTestUser()
  if (!user) {
    console.error('没有找到可用的用户')
    return
  }
  console.log(`使用用户: ${user.email}`)
  console.log(`组织ID: ${user.organizationId}`)
  console.log('')

  // 2. 获取工作流配置
  const workflow = await prisma.workflow.findUnique({
    where: { id: WORKFLOW_ID },
    select: {
      id: true,
      name: true,
      config: true,
      draftConfig: true,
      organizationId: true,
    },
  })

  if (!workflow) {
    console.error('工作流不存在')
    return
  }

  // 检查组织是否匹配
  if (workflow.organizationId !== user.organizationId) {
    console.error(`工作流组织 (${workflow.organizationId}) 与用户组织 (${user.organizationId}) 不匹配`)
    return
  }

  console.log(`工作流名称: ${workflow.name}`)
  console.log('')

  const config = (workflow.draftConfig || workflow.config) as unknown as WorkflowConfig

  // 3. 显示输入节点的默认值
  const inputNode = config.nodes.find(n => n.type === 'INPUT')
  if (inputNode && inputNode.config.fields) {
    console.log('=== 输入数据 ===')
    for (const field of inputNode.config.fields) {
      if (field.value) {
        const displayValue = field.value.length > 100 ? field.value.substring(0, 100) + '...' : field.value
        console.log(`${field.name}: ${displayValue}`)
      }
    }
    console.log('')
  }

  // 4. 动态导入执行引擎
  console.log('=== 开始执行工作流 ===')
  console.log('注意: 这可能需要几分钟时间...')
  console.log('')

  try {
    // 使用 Prisma 直接创建执行记录，然后调用引擎
    const { executeWorkflow } = await import('../src/lib/workflow/engine')
    
    const startTime = Date.now()
    
    const result = await executeWorkflow(
      WORKFLOW_ID,
      user.organizationId,
      user.id,
      undefined, // 使用默认输入
      { 
        mode: 'draft',
        executionType: 'TEST' as ExecutionType,
      }
    )

    const duration = Date.now() - startTime

    console.log('')
    console.log('=== 执行结果 ===')
    console.log(`状态: ${result.status}`)
    console.log(`执行ID: ${result.executionId}`)
    console.log(`耗时: ${duration}ms`)
    console.log(`Token消耗: ${result.totalTokens}`)
    
    if (result.error) {
      console.log(`错误: ${result.error}`)
    }

    if (result.output) {
      console.log('')
      console.log('=== 最终输出 ===')
      for (const [key, value] of Object.entries(result.output)) {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value)
        const displayValue = strValue.length > 500 ? strValue.substring(0, 500) + '...' : strValue
        console.log(`${key}:`)
        console.log(displayValue)
        console.log('')
      }
    }

    // 5. 获取详细的执行日志
    console.log('')
    console.log('=== 节点执行详情 ===')
    
    const logs = await prisma.executionLog.findMany({
      where: { executionId: result.executionId },
      orderBy: { startedAt: 'asc' },
    })

    for (const log of logs) {
      console.log('-'.repeat(60))
      console.log(`节点: ${log.nodeName}`)
      console.log(`状态: ${log.status}`)
      console.log(`耗时: ${log.duration || 0}ms`)
      
      if (log.aiModel) {
        console.log(`模型: ${log.aiModel}`)
        console.log(`Token: ${log.promptTokens || 0} prompt + ${log.completionTokens || 0} completion`)
      }

      // 显示输出
      const output = log.output as Record<string, unknown>
      if (output) {
        console.log('输出:')
        for (const [key, value] of Object.entries(output)) {
          if (key === '结果' || key === 'result') {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value)
            const displayValue = strValue.length > 300 ? strValue.substring(0, 300) + '...' : strValue
            console.log(`  ${displayValue}`)
          }
        }
      }

      if (log.error) {
        console.log(`错误: ${log.error}`)
      }
      console.log('')
    }

  } catch (error) {
    console.error('执行失败:', error)
  }

  console.log('='.repeat(80))
  console.log('执行完成')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
