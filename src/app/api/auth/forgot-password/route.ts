import { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'
import { sendEmail, getPasswordResetEmailTemplate } from '@/lib/email'

// 请求重置密码的 schema
const forgotPasswordSchema = z.object({
                  email: z.string().email('请输入有效的邮箱地址'),
})

// 重置链接有效期（分钟）
const RESET_TOKEN_EXPIRY_MINUTES = 30

// POST: 请求重置密码
export async function POST(request: NextRequest) {
                  try {
                                    const body = await request.json()
                                    const { email } = forgotPasswordSchema.parse(body)

                                    // 查找用户
                                    const user = await prisma.user.findUnique({
                                                      where: { email: email.toLowerCase() },
                                                      select: {
                                                                        id: true,
                                                                        name: true,
                                                                        email: true,
                                                                        isActive: true,
                                                      },
                                    })

                                    // 为了安全，即使用户不存在也返回相同的响应
                                    // 这样可以防止通过此接口探测有效邮箱
                                    if (!user || !user.isActive) {
                                                      // 模拟一些延迟，使响应时间一致
                                                      await new Promise(resolve => setTimeout(resolve, 500))

                                                      return ApiResponse.success({
                                                                        message: '如果该邮箱已注册，您将收到密码重置邮件',
                                                      })
                                    }

                                    // 生成安全的随机 token
                                    const token = crypto.randomBytes(32).toString('hex')
                                    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000)

                                    // 使已有的重置令牌失效（同一邮箱只保留最新的）
                                    await prisma.passwordResetToken.updateMany({
                                                      where: {
                                                                        email: email.toLowerCase(),
                                                                        usedAt: null,
                                                      },
                                                      data: {
                                                                        usedAt: new Date(), // 标记为已使用
                                                      },
                                    })

                                    // 创建新的重置令牌
                                    await prisma.passwordResetToken.create({
                                                      data: {
                                                                        email: email.toLowerCase(),
                                                                        token,
                                                                        expiresAt,
                                                      },
                                    })

                                    // 构建重置链接
                                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
                                    const resetUrl = `${baseUrl}/reset-password?token=${token}`

                                    // 发送邮件
                                    const emailTemplate = getPasswordResetEmailTemplate({
                                                      userName: user.name || undefined,
                                                      resetUrl,
                                                      expiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES,
                                    })

                                    const emailResult = await sendEmail({
                                                      to: user.email,
                                                      subject: emailTemplate.subject,
                                                      html: emailTemplate.html,
                                                      text: emailTemplate.text,
                                    })

                                    if (!emailResult.success) {
                                                      console.error('发送重置密码邮件失败:', emailResult.error)
                                                      // 仍然返回成功响应，避免暴露内部错误
                                    }

                                    // 记录审计日志
                                    await prisma.auditLog.create({
                                                      data: {
                                                                        action: 'password.reset_requested',
                                                                        resource: 'user',
                                                                        resourceId: user.id,
                                                                        detail: {
                                                                                          email: email.toLowerCase(),
                                                                                          success: emailResult.success,
                                                                        },
                                                      },
                                    })

                                    return ApiResponse.success({
                                                      message: '如果该邮箱已注册，您将收到密码重置邮件',
                                    })
                  } catch (error) {
                                    if (error instanceof z.ZodError) {
                                                      return ApiResponse.error(error.issues[0]?.message || '输入验证失败', 400)
                                    }

                                    console.error('Forgot password error:', error)
                                    return ApiResponse.error('请求失败，请稍后重试', 500)
                  }
}
