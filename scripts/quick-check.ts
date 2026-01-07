import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const exec = await prisma.execution.findFirst({
    where: { workflowId: 'cmjdz1u9m0018efn2020ozh90' },
    orderBy: { createdAt: 'desc' },
  })
  
  console.log('最新执行:', exec?.id)
  console.log('状态:', exec?.status)
  console.log('错误:', exec?.error || '无')
  
  if (exec) {
    const logs = await prisma.executionLog.findMany({
      where: { executionId: exec.id },
      select: { nodeName: true, status: true },
    })
    console.log('完成节点:', logs.filter(l => l.status === 'COMPLETED').map(l => l.nodeName).join(', '))
    console.log('失败节点:', logs.filter(l => l.status === 'FAILED').map(l => l.nodeName).join(', ') || '无')
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
