import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const workflow = await prisma.workflow.findUnique({
    where: { id: 'cmjdz1u9m0018efn2020ozh90' },
    select: {
      id: true,
      name: true,
      description: true,
      config: true,
      draftConfig: true,
      publishedConfig: true,
      publishStatus: true,
    },
  })
  
  if (!workflow) {
    console.log('工作流不存在')
    return
  }
  
  console.log('=== 工作流基本信息 ===')
  console.log(`名称: ${workflow.name}`)
  console.log(`ID: ${workflow.id}`)
  console.log(`发布状态: ${workflow.publishStatus}`)
  console.log('')
  
  // 使用 draftConfig 或 config
  const config = workflow.draftConfig || workflow.config
  console.log('=== 工作流配置 ===')
  console.log(JSON.stringify(config, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
