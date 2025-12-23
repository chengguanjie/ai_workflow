/**
 * 初始化平台超级管理员脚本
 *
 * 使用方法:
 * CONSOLE_ADMIN_EMAIL=admin@example.com CONSOLE_ADMIN_PASSWORD=YourSecurePassword npx ts-node scripts/init-platform-admin.ts
 *
 * 或通过 npm script:
 * npm run init:admin
 *
 * 必需的环境变量:
 * - CONSOLE_ADMIN_EMAIL: 管理员邮箱
 * - CONSOLE_ADMIN_PASSWORD: 管理员密码 (至少8个字符)
 *
 * 可选的环境变量:
 * - CONSOLE_ADMIN_NAME: 管理员名称 (默认: 超级管理员)
 */

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

/**
 * Validates password strength
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: '密码长度至少为8个字符' }
  }
  
  // Check for at least one uppercase, one lowercase, one number
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  
  if (!hasUppercase || !hasLowercase || !hasNumber) {
    return { 
      valid: false, 
      error: '密码必须包含至少一个大写字母、一个小写字母和一个数字' 
    }
  }
  
  return { valid: true }
}

async function main() {
  // Require email from environment variable
  const email = process.env.CONSOLE_ADMIN_EMAIL
  if (!email) {
    console.error('错误: 必须设置 CONSOLE_ADMIN_EMAIL 环境变量')
    console.error('示例: CONSOLE_ADMIN_EMAIL=admin@example.com CONSOLE_ADMIN_PASSWORD=YourSecurePassword npx ts-node scripts/init-platform-admin.ts')
    process.exit(1)
  }

  // Require password from environment variable - NO DEFAULT PASSWORD
  const password = process.env.CONSOLE_ADMIN_PASSWORD
  if (!password) {
    console.error('错误: 必须设置 CONSOLE_ADMIN_PASSWORD 环境变量')
    console.error('安全提示: 请使用强密码，至少8个字符，包含大小写字母和数字')
    console.error('示例: CONSOLE_ADMIN_EMAIL=admin@example.com CONSOLE_ADMIN_PASSWORD=YourSecurePassword npx ts-node scripts/init-platform-admin.ts')
    process.exit(1)
  }

  // Validate password strength
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.valid) {
    console.error(`错误: ${passwordValidation.error}`)
    process.exit(1)
  }

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
  console.log(`角色: SUPER_ADMIN`)
  console.log('')
  console.log('首次登录后建议修改密码')
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
