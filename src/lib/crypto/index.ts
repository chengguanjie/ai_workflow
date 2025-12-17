import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

// 从环境变量获取加密密钥，如果没有则使用默认值（仅开发环境）
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET || 'default-dev-secret-change-in-production'
  return scryptSync(secret, 'salt', KEY_LENGTH)
}

/**
 * 加密 API Key
 */
export function encryptApiKey(plainText: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // 格式: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * 解密 API Key
 */
export function decryptApiKey(encryptedText: string): string {
  const key = getEncryptionKey()
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * 生成 API Key 掩码（显示前4位和后4位）
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '****'
  }
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
}
