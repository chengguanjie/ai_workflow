/**
 * 种子脚本：导入官方工作流模板
 *
 * 使用方法:
 * npx ts-node scripts/seed-templates.ts
 *
 * 或通过 npm script:
 * npm run seed:templates
 */

import { PrismaClient } from '@prisma/client'
import { seedOfficialTemplates } from '../src/lib/templates/official-templates'

const prisma = new PrismaClient()

async function main() {
  console.log('正在初始化官方模板库...')
  
  // 直接调用 src/lib/templates/official-templates.ts 中的逻辑
  // 该逻辑已经包含了 deleteMany 清理旧数据和 create 新数据的步骤
  await seedOfficialTemplates()
  
  console.log('种子脚本执行完毕！')
}

main()
  .catch((e) => {
    console.error('导入失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
