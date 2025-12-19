/**
 * Webhook 签名验证工具
 *
 * 使用 HMAC-SHA256 算法验证 Webhook 请求的签名
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto'

/**
 * 生成 Webhook 签名
 * @param payload 请求体
 * @param secret 密钥
 * @param timestamp 时间戳
 * @returns 签名字符串
 */
export function generateSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signaturePayload = `${timestamp}.${payload}`
  const hmac = createHmac('sha256', secret)
  hmac.update(signaturePayload)
  return hmac.digest('hex')
}

/**
 * 验证 Webhook 签名
 *
 * 签名格式: X-Webhook-Signature: t=<timestamp>,v1=<signature>
 *
 * @param signatureHeader 签名头
 * @param payload 请求体
 * @param secret 密钥
 * @param toleranceSeconds 时间容差（秒），防止重放攻击
 * @returns 验证结果
 */
export function verifySignature(
  signatureHeader: string | null,
  payload: string,
  secret: string,
  toleranceSeconds: number = 300 // 5分钟容差
): { valid: boolean; error?: string } {
  if (!signatureHeader) {
    return { valid: false, error: '缺少签名头' }
  }

  // 解析签名头
  const elements = signatureHeader.split(',')
  const timestampElement = elements.find((e) => e.startsWith('t='))
  const signatureElement = elements.find((e) => e.startsWith('v1='))

  if (!timestampElement || !signatureElement) {
    return { valid: false, error: '签名格式无效' }
  }

  const timestamp = parseInt(timestampElement.slice(2), 10)
  const signature = signatureElement.slice(3)

  if (isNaN(timestamp)) {
    return { valid: false, error: '时间戳无效' }
  }

  // 检查时间容差（防止重放攻击）
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, error: '请求已过期' }
  }

  // 计算期望的签名
  const expectedSignature = generateSignature(payload, secret, timestamp)

  // 使用时序安全比较
  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    const actualBuffer = Buffer.from(signature, 'hex')

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, error: '签名不匹配' }
    }

    if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
      return { valid: false, error: '签名不匹配' }
    }
  } catch {
    return { valid: false, error: '签名格式错误' }
  }

  return { valid: true }
}

/**
 * 生成安全的 Webhook 密钥
 * @returns 随机密钥
 */
export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(32).toString('hex')
}

/**
 * 生成 Webhook 路径标识
 * @returns 随机路径标识
 */
export function generateWebhookPath(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 构建签名头
 * @param payload 请求体
 * @param secret 密钥
 * @returns 签名头字符串
 */
export function buildSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = generateSignature(payload, secret, timestamp)
  return `t=${timestamp},v1=${signature}`
}
