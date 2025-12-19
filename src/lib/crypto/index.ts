import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

let cachedKey: Buffer | null = null

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey
  
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is required. Please set a secure 32+ character random string.')
  }
  
  if (secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long.')
  }
  
  const salt = createHash('sha256').update(process.env.ENCRYPTION_SALT || 'ai-workflow-salt-v1').digest()
  cachedKey = scryptSync(secret, salt, KEY_LENGTH)
  return cachedKey
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
