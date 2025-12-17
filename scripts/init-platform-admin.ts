/**
 * 初始化平台超级管理员脚本
 *
 * 使用方法:
 * npx ts-node scripts/init-platform-admin.ts
 *
 * 或通过 npm script:
 * npm run init:admin
 */

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.CONSOLE_ADMIN_EMAIL || 'admin@platform.com'
  const password = process.env.CONSOLE_ADMIN_PASSWORD || 'Admin@123456'
  const name = process.env.CONSOLE_ADMIN_NAME || '超级管理员'

  console.log('正在初始化平台超级管理员...')
  console.log(`邮箱: ${email}`)

  // 检查是否已存在
  const existing = await prisma.platformAdmin.findUnique({
    where: { email },
  })

  if (existing) {
    console.log('超级管理员已存在，跳过创建')
    console.log(`ID: ${existing.id}`)
    console.log(`邮箱: ${existing.email}`)
    console.log(`角色: ${existing.role}`)
    return
  }

  // 加密密码
  const passwordHash = await hash(password, 12)

  // 创建超级管理员
  const admin = await prisma.platformAdmin.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  })

  console.log('')
  console.log('========================================')
  console.log('超级管理员创建成功!')
  console.log('========================================')
  console.log(`ID: ${admin.id}`)
  console.log(`邮箱: ${email}`)
  console.log(`密码: ${password}`)
  console.log(`角色: SUPER_ADMIN`)
  console.log('')
  console.log('请妥善保管以上信息，首次登录后建议修改密码')
  console.log('========================================')
}

main()
  .catch((e) => {
    console.error('初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
