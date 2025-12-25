import { NextRequest } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { validatePassword } from '@/lib/auth/password-validator'

const resetPasswordSchema = z.object({
                  token: z.string().min(1, 'Token 不能为空'),
                  newPassword: z.string().min(1, '请输入新密码'),
                  confirmPassword: z.string().min(1, '请确认新密码'),
}).refine((data) => data.newPassword === data.confirmPassword, {
                  message: '两次输入的密码不一致',
                  path: ['confirmPassword'],
})

// POST: 重置密码
export async function POST(request: NextRequest) {
                  try {
                                    const body = await request.json()
                                    const { token, newPassword } = resetPasswordSchema.parse(body)

                                    // 验证令牌
                                    const resetToken = await prisma.passwordResetToken.findUnique({
                                                      where: { token },
                                    })

                                    if (!resetToken) {
                                                      return ApiResponse.error('无效的重置链接', 400)
                                    }

                                    if (resetToken.usedAt) {
                                                      return ApiResponse.error('此重置链接已失效', 400)
                                    }

                                    if (resetToken.expiresAt < new Date()) {
                                                      return ApiResponse.error('重置链接已过期，请重新请求', 400)
                                    }

                                    // 验证密码强度
                                    const validationResult = validatePassword(newPassword)
                                    if (!validationResult.isValid) {
                                                      return ApiResponse.error(validationResult.errors[0], 400)
                                    }

                                    // 查找关联用户
                                    const user = await prisma.user.findUnique({
                                                      where: { email: resetToken.email.toLowerCase() },
                                    })

                                    if (!user) {
                                                      // 理论上不应该发生，因为创建 token 时检查了用户
                                                      return ApiResponse.error('用户不存在', 404)
                                    }

                                    // 更新密码
                                    const passwordHash = await hash(newPassword, 12)

                                    await prisma.$transaction(async (tx) => {
                                                      // 1. 更新用户密码，并重置锁定状态
                                                      await tx.user.update({
                                                                        where: { id: user.id },
                                                                        data: {
                                                                                          passwordHash,
                                                                                          mustChangePassword: false, // 重置后不需要强制修改
                                                                                          loginAttempts: 0,          // 重置失败尝试次数
                                                                                          lockedUntil: null,         // 解锁账户
                                                                        },
                                                      })

                                                      // 2. 标记令牌为已使用
                                                      await tx.passwordResetToken.update({
                                                                        where: { id: resetToken.id },
                                                                        data: { usedAt: new Date() },
                                                      })

                                                      // 3. 使该邮箱其他所有未使用的令牌失效
                                                      await tx.passwordResetToken.updateMany({
                                                                        where: {
                                                                                          email: user.email,
                                                                                          usedAt: null,
                                                                                          id: { not: resetToken.id },
                                                                        },
                                                                        data: { usedAt: new Date() },
                                                      })
                                    })

                                    // 记录审计日志
                                    await prisma.auditLog.create({
                                                      data: {
                                                                        action: 'password.reset_completed',
                                                                        resource: 'user',
                                                                        resourceId: user.id,
                                                                        detail: {
                                                                                          email: user.email,
                                                                        },
                                                                        userId: user.id, // 这里可能记录操作者ID，重置密码场景下即用户本人
                                                      },
                                    })

                                    return ApiResponse.success({
                                                      message: '密码重置成功，请使用新密码登录',
                                    })
                  } catch (error) {
                                    if (error instanceof z.ZodError) {
                                                      return ApiResponse.error(error.issues[0]?.message || '输入验证失败', 400)
                                    }

                                    console.error('Reset password error:', error)
                                    return ApiResponse.error('密码重置失败，请稍后重试', 500)
                  }
}
