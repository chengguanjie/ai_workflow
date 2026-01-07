import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const WORKFLOW_ID = 'cmjdz1u9m0018efn2020ozh90'

async function main() {
  // 获取最近5次执行
  const executions = await prisma.execution.findMany({
    where: { workflowId: WORKFLOW_ID },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  })

  console.log('=== 最近执行记录 ===\n')
  
  for (const exec of executions) {
    console.log(`执行ID: ${exec.id}`)
    console.log(`状态: ${exec.status}`)
    console.log(`创建时间: ${exec.createdAt}`)
    if (exec.error) {
      console.log(`错误: ${exec.error}`)
    }
    
    // 获取该执行的节点日志
    const logs = await prisma.executionLog.findMany({
      where: { executionId: exec.id },
      orderBy: { startedAt: 'asc' },
      select: {
        nodeName: true,
        status: true,
        error: true,
      },
    })
    
    console.log(`节点执行情况:`)
    const completed = logs.filter(l => l.status === 'COMPLETED').map(l => l.nodeName)
    const failed = logs.filter(l => l.status === 'FAILED')
    
    console.log(`  ✓ 完成: ${completed.join(', ')}`)
    if (failed.length > 0) {
      for (const f of failed) {
        console.log(`  ✗ 失败: ${f.nodeName} - ${f.error}`)
      }
    }
    console.log('')
  }
}

main()
  .catch(e => console.error('错误:', e))
  .finally(() => prisma.$disconnect())
