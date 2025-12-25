
import { prisma } from '@/lib/db'
import { hash } from 'bcryptjs'
import crypto from 'crypto'
import { validatePassword } from '@/lib/auth/password-validator'

async function simulateFlow() {
                  const email = '15001807003@126.com'
                  console.log(`1. 查找用户: ${email}`)
                  const user = await prisma.user.findUnique({ where: { email } })

                  if (!user) {
                                    console.error('❌ 用户不存在，请先注册或修改脚本中的邮箱')
                                    return
                  }
                  console.log('✅ 用户已找到:', user.id)

                  console.log('2. 生成重置 Token')
                  const token = crypto.randomBytes(32).toString('hex')
                  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

                  // 模拟 forgot-password 逻辑
                  await prisma.passwordResetToken.create({
                                    data: {
                                                      email: email.toLowerCase(),
                                                      token,
                                                      expiresAt,
                                    },
                  })
                  console.log('✅ Token 已创建:', token)

                  console.log('3. 模拟重置密码')
                  const newPassword = 'NewPassword123!'

                  // 验证密码强度
                  const validation = validatePassword(newPassword)
                  if (!validation.isValid) {
                                    throw new Error('密码强度不足')
                  }

                  // 模拟 reset-password 逻辑
                  const passwordHash = await hash(newPassword, 12)

                  await prisma.$transaction(async (tx) => {
                                    await tx.user.update({
                                                      where: { id: user.id },
                                                      data: {
                                                                        passwordHash,
                                                                        mustChangePassword: false,
                                                                        loginAttempts: 0,
                                                                        lockedUntil: null,
                                                      },
                                    })

                                    await tx.passwordResetToken.update({
                                                      where: { token },
                                                      data: { usedAt: new Date() },
                                    })
                  })

                  console.log('✅ 密码重置成功！')
                  console.log('验证流程通过。请重启 Next.js 服务以应用 API 更改。')
}

simulateFlow()
                  .catch(console.error)
                  .finally(async () => {
                                    await prisma.$disconnect()
                  })
