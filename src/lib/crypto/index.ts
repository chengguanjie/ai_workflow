import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto'

// Only use fs in Node.js environment (server-side only)
let existsSync: typeof import('fs')['existsSync'] | null = null
let readFileSync: typeof import('fs')['readFileSync'] | null = null
let join: typeof import('path')['join'] | null = null

// Lazy load fs and path modules (server-side only)
function loadFsModules() {
  if (typeof window === 'undefined' && !existsSync) {
    try {
      const fs = require('fs')
      const path = require('path')
      existsSync = fs.existsSync
      readFileSync = fs.readFileSync
      join = path.join
    } catch {
      // fs not available (should not happen in Node.js)
    }
  }
}

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16

let cachedKey: Buffer | null = null

let didLoadDotEnv = false

function loadDotEnvIntoProcessEnv(options?: { override?: boolean }): void {
  if (didLoadDotEnv && !options?.override) return
  if (process.env.NODE_ENV === 'production') return
  if (typeof window !== 'undefined') return

  // Load fs modules if needed
  loadFsModules()
  if (!existsSync || !readFileSync || !join) return

  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    didLoadDotEnv = true
    return
  }

  try {
    if (!readFileSync) return
    const content = readFileSync(envPath, 'utf8')
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const idx = line.indexOf('=')
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim()
      let value = line.slice(idx + 1).trim()
      value = stripOuterQuotes(value)
      if (!key) continue
      if (options?.override || process.env[key] == null || process.env[key] === '') {
        process.env[key] = value
      }
    }
  } finally {
    didLoadDotEnv = true
  }
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function deriveKey(secret: string, saltValue: string): Buffer {
  if (secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long.')
  }
  const salt = createHash('sha256').update(saltValue).digest()
  return scryptSync(secret, salt, KEY_LENGTH)
}

function getEncryptionKey(): Buffer {
  loadDotEnvIntoProcessEnv()
  if (cachedKey) return cachedKey

  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is required. Please set a secure 32+ character random string.')
  }

  if (secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long.')
  }

  const saltValue = process.env.ENCRYPTION_SALT
  if (!saltValue) {
    throw new Error('ENCRYPTION_SALT environment variable is required. Please set a unique random string for your deployment.')
  }

  cachedKey = deriveKey(secret, saltValue)
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
  return decryptApiKeyWithKey(encryptedText, key)
}

function decryptApiKeyWithKey(encryptedText: string, key: Buffer): string {
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

/**
 * 安全解密 API Key，提供更好的错误信息
 */
export function safeDecryptApiKey(encryptedText: string): string {
  try {
    return decryptApiKey(encryptedText)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('Unsupported state or unable to authenticate data')) {
      if (process.env.NODE_ENV !== 'production') {
        const secretRaw = process.env.ENCRYPTION_KEY || ''
        const saltRaw = process.env.ENCRYPTION_SALT || ''
        try {
          const secretHash = secretRaw ? createHash('sha256').update(secretRaw).digest('hex').slice(0, 8) : null
          const saltHash = saltRaw ? createHash('sha256').update(saltRaw).digest('hex').slice(0, 8) : null
          console.warn('[crypto] API key decrypt auth failed', {
            pid: process.pid,
            secretLen: secretRaw.length,
            saltLen: saltRaw.length,
            secretQuoted: (secretRaw.trim().startsWith('"') && secretRaw.trim().endsWith('"')) || (secretRaw.trim().startsWith("'") && secretRaw.trim().endsWith("'")),
            saltQuoted: (saltRaw.trim().startsWith('"') && saltRaw.trim().endsWith('"')) || (saltRaw.trim().startsWith("'") && saltRaw.trim().endsWith("'")),
            secretHash,
            saltHash,
          })
        } catch {
          // ignore debug logging failures
        }
      }

      // In dev/hot-reload environments, different env loaders may include quotes/whitespace.
      // Try again with a cleared cache and normalized env variants (trim + strip quotes).
      loadDotEnvIntoProcessEnv({ override: true })
      const secretRaw = process.env.ENCRYPTION_KEY || ''
      const saltRaw = process.env.ENCRYPTION_SALT || ''

      if (cachedKey) cachedKey = null

      try {
        return decryptApiKey(encryptedText)
      } catch {
        // fall through to variants below
      }

      if (secretRaw && saltRaw) {
        const variants: Array<{ secret: string; salt: string }> = [
          { secret: stripOuterQuotes(secretRaw), salt: stripOuterQuotes(saltRaw) },
          { secret: stripOuterQuotes(secretRaw).trim(), salt: stripOuterQuotes(saltRaw).trim() },
        ]

        for (const v of variants) {
          try {
            const key = deriveKey(v.secret, v.salt)
            return decryptApiKeyWithKey(encryptedText, key)
          } catch {
            // try next
          }
        }
      }

      throw new Error(
        `无法解密 API Key：加密密钥可能已更改或数据损坏。请检查以下项目：\n` +
        `1. 确保 ENCRYPTION_KEY 环境变量设置正确且未更改\n` +
        `2. 如果您更改了 ENCRYPTION_KEY，需要重新配置所有 API Key\n` +
        `3. 在设置页面重新输入并保存 AI 配置`
      )
    }

    throw new Error(`解密 API Key 失败：${errorMessage}`)
  }
}
