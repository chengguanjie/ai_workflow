/**
 * 邮件服务
 * 
 * 支持多种邮件发送方式：
 * 1. SMTP (Nodemailer)
 * 2. 阿里云邮件推送
 * 3. 开发环境模拟发送
 */

import nodemailer from 'nodemailer'

export interface EmailOptions {
                  to: string | string[]
                  subject: string
                  html: string
                  text?: string
}

export interface EmailResult {
                  success: boolean
                  messageId?: string
                  error?: string
}

// 获取邮件传输器
function getTransporter() {
                  const smtpHost = process.env.SMTP_HOST
                  const smtpPort = parseInt(process.env.SMTP_PORT || '587')
                  const smtpUser = process.env.SMTP_USER
                  const smtpPass = process.env.SMTP_PASS
                  const smtpSecure = process.env.SMTP_SECURE === 'true'

                  if (!smtpHost || !smtpUser || !smtpPass) {
                                    return null
                  }

                  return nodemailer.createTransport({
                                    host: smtpHost,
                                    port: smtpPort,
                                    secure: smtpSecure,
                                    auth: {
                                                      user: smtpUser,
                                                      pass: smtpPass,
                                    },
                  })
}

// 发送邮件
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
                  const transporter = getTransporter()

                  // 开发模式或无邮件配置时，模拟发送
                  if (!transporter || process.env.NODE_ENV === 'development') {
                                    console.log('📧 模拟发送邮件:')
                                    console.log('  收件人:', Array.isArray(options.to) ? options.to.join(', ') : options.to)
                                    console.log('  主题:', options.subject)
                                    console.log('  内容:', options.html.substring(0, 200) + '...')

                                    // 在开发模式下返回成功
                                    return {
                                                      success: true,
                                                      messageId: `dev-${Date.now()}`,
                                    }
                  }

                  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER
                  const fromName = process.env.SMTP_FROM_NAME || 'AI Workflow'

                  try {
                                    const result = await transporter.sendMail({
                                                      from: `"${fromName}" <${fromEmail}>`,
                                                      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
                                                      subject: options.subject,
                                                      html: options.html,
                                                      text: options.text,
                                    })

                                    return {
                                                      success: true,
                                                      messageId: result.messageId,
                                    }
                  } catch (error) {
                                    console.error('发送邮件失败:', error)
                                    return {
                                                      success: false,
                                                      error: error instanceof Error ? error.message : '发送邮件失败',
                                    }
                  }
}

// 密码重置邮件模板
export function getPasswordResetEmailTemplate(params: {
                  userName?: string
                  resetUrl: string
                  expiresInMinutes: number
}): { subject: string; html: string; text: string } {
                  const { userName, resetUrl, expiresInMinutes } = params

                  const subject = '【AI Workflow】重置您的密码'

                  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>重置密码</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">AI Workflow</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">智能工作流自动化平台</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #333333; font-size: 22px; font-weight: 600;">重置您的密码</h2>
              
              <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.6;">
                ${userName ? `${userName}，您好！` : '您好！'}
              </p>
              
              <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.6;">
                我们收到了重置您 AI Workflow 账户密码的请求。点击下方按钮来设置新密码：
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                      重置密码
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #999999; font-size: 14px; line-height: 1.6;">
                如果按钮无法点击，请复制以下链接到浏览器打开：
              </p>
              
              <p style="margin: 0 0 20px; padding: 12px; background-color: #f5f5f5; border-radius: 6px; color: #666666; font-size: 12px; word-break: break-all;">
                ${resetUrl}
              </p>
              
              <div style="margin: 30px 0; padding: 20px; background-color: #fff8e1; border-radius: 8px; border-left: 4px solid #ffc107;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  ⚠️ 此链接将在 <strong>${expiresInMinutes} 分钟</strong>后过期。如果您没有请求重置密码，请忽略此邮件。
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-radius: 0 0 12px 12px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 10px; color: #999999; font-size: 12px; text-align: center;">
                此邮件由系统自动发送，请勿直接回复。
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} AI Workflow. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

                  const text = `
AI Workflow - 重置您的密码

${userName ? `${userName}，您好！` : '您好！'}

我们收到了重置您 AI Workflow 账户密码的请求。请点击以下链接来设置新密码：

${resetUrl}

此链接将在 ${expiresInMinutes} 分钟后过期。

如果您没有请求重置密码，请忽略此邮件。

© ${new Date().getFullYear()} AI Workflow. All rights reserved.
  `.trim()

                  return { subject, html, text }
}
