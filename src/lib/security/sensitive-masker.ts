/**
 * Sensitive Data Masker Module
 * 
 * Provides functions to mask and redact sensitive data such as
 * API keys, passwords, emails, and other confidential information
 * to prevent accidental exposure in logs and displays.
 * 
 * @module security/sensitive-masker
 */

/**
 * Default mask character
 */
const MASK_CHAR = '*'

/**
 * Default number of visible characters at start for API keys
 */
const API_KEY_VISIBLE_START = 4

/**
 * Default number of visible characters at end for API keys
 */
const API_KEY_VISIBLE_END = 4

/**
 * Minimum length for masking to be applied
 */
const _MIN_MASK_LENGTH = 4

/**
 * Masks an API key, showing only the first and last few characters.
 * 
 * @param key - The API key to mask
 * @param visibleStart - Number of characters to show at the start (default: 4)
 * @param visibleEnd - Number of characters to show at the end (default: 4)
 * @returns Masked API key
 * 
 * @example
 * ```typescript
 * maskApiKey('sk-1234567890abcdef')
 * // Returns: 'sk-1****cdef'
 * ```
 */
export function maskApiKey(
  key: string,
  visibleStart: number = API_KEY_VISIBLE_START,
  visibleEnd: number = API_KEY_VISIBLE_END
): string {
  if (!key || typeof key !== 'string') {
    return ''
  }

  // For very short keys, mask entirely
  if (key.length <= visibleStart + visibleEnd) {
    return MASK_CHAR.repeat(key.length)
  }

  const start = key.slice(0, visibleStart)
  const end = key.slice(-visibleEnd)
  const maskLength = key.length - visibleStart - visibleEnd

  return `${start}${MASK_CHAR.repeat(maskLength)}${end}`
}

/**
 * Masks a password completely, replacing all characters with mask characters.
 * 
 * @param password - The password to mask
 * @returns Masked password (fixed length for security)
 * 
 * @example
 * ```typescript
 * maskPassword('mySecretPassword123')
 * // Returns: '********'
 * ```
 */
export function maskPassword(password: string): string {
  if (!password || typeof password !== 'string') {
    return ''
  }

  // Always return a fixed length to not reveal password length
  return MASK_CHAR.repeat(8)
}

/**
 * Masks an email address, showing only the first character of the local part
 * and the domain.
 * 
 * @param email - The email address to mask
 * @returns Masked email address
 * 
 * @example
 * ```typescript
 * maskEmail('john.doe@example.com')
 * // Returns: 'j***@example.com'
 * ```
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return ''
  }

  const atIndex = email.indexOf('@')

  // If no @ found, treat as invalid email and mask entirely
  if (atIndex === -1) {
    return mask(email, 1, 0)
  }

  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex)

  // If local part is empty or very short
  if (localPart.length <= 1) {
    return `${localPart}${MASK_CHAR.repeat(3)}${domain}`
  }

  // Show first character, mask the rest
  const visibleChar = localPart[0]
  const maskedLength = Math.min(localPart.length - 1, 5) // Cap mask length for readability

  return `${visibleChar}${MASK_CHAR.repeat(maskedLength)}${domain}`
}

/**
 * Generic masking function that preserves specified visible portions.
 * 
 * @param value - The string to mask
 * @param visibleStart - Number of characters to show at the start (default: 0)
 * @param visibleEnd - Number of characters to show at the end (default: 0)
 * @param maskChar - Character to use for masking (default: '*')
 * @returns Masked string
 * 
 * @example
 * ```typescript
 * mask('1234567890', 2, 2)
 * // Returns: '12******90'
 * 
 * mask('secret', 0, 0)
 * // Returns: '******'
 * ```
 */
export function mask(
  value: string,
  visibleStart: number = 0,
  visibleEnd: number = 0,
  maskChar: string = MASK_CHAR
): string {
  if (!value || typeof value !== 'string') {
    return ''
  }

  // Ensure non-negative values
  visibleStart = Math.max(0, visibleStart)
  visibleEnd = Math.max(0, visibleEnd)

  // If the value is too short to mask meaningfully
  if (value.length <= visibleStart + visibleEnd) {
    // If we want to show everything, return as-is
    if (visibleStart + visibleEnd >= value.length) {
      return maskChar.repeat(value.length)
    }
    return maskChar.repeat(value.length)
  }

  const start = value.slice(0, visibleStart)
  const end = visibleEnd > 0 ? value.slice(-visibleEnd) : ''
  const maskLength = value.length - visibleStart - visibleEnd

  return `${start}${maskChar.repeat(maskLength)}${end}`
}

/**
 * Default sensitive field names that should be redacted
 */
export const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'apiKey',
  'api_key',
  'apikey',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'credential',
  'credentials',
  'auth',
  'authorization',
  'cookie',
  'session',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'pin',
  'encryptionKey',
  'encryption_key',
  'salt',
]

/**
 * Redacts sensitive fields from an object by replacing their values with a redacted marker.
 * This function performs a deep clone and does not modify the original object.
 * 
 * @param obj - The object to redact sensitive fields from
 * @param sensitiveKeys - Array of field names to redact (case-insensitive)
 * @returns A new object with sensitive fields redacted
 * 
 * @example
 * ```typescript
 * const data = {
 *   username: 'john',
 *   password: 'secret123',
 *   config: {
 *     apiKey: 'sk-12345'
 *   }
 * }
 * 
 * redactSensitiveFields(data, ['password', 'apiKey'])
 * // Returns: {
 * //   username: 'john',
 * //   password: '[REDACTED]',
 * //   config: {
 * //     apiKey: '[REDACTED]'
 * //   }
 * // }
 * ```
 */
export function redactSensitiveFields(
  obj: Record<string, unknown>,
  sensitiveKeys: string[] = DEFAULT_SENSITIVE_KEYS
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  // Create a lowercase set for case-insensitive matching
  const sensitiveSet = new Set(sensitiveKeys.map(k => k.toLowerCase()))

  return redactRecursive(obj, sensitiveSet) as Record<string, unknown>
}

/**
 * Recursively redacts sensitive fields from an object
 */
function redactRecursive(
  obj: unknown,
  sensitiveSet: Set<string>
): unknown {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactRecursive(item, sensitiveSet))
  }

  // Handle non-objects
  if (typeof obj !== 'object') {
    return obj
  }

  // Handle objects
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Check if this key should be redacted (case-insensitive)
    if (sensitiveSet.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else if (value !== null && typeof value === 'object') {
      // Recursively process nested objects
      result[key] = redactRecursive(value, sensitiveSet)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Checks if a string appears to be a sensitive value based on common patterns.
 * This is a heuristic check and may have false positives/negatives.
 * 
 * @param value - The string to check
 * @returns true if the value appears to be sensitive
 */
export function looksLikeSensitiveValue(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  // Check for common API key patterns
  const apiKeyPatterns = [
    /^sk[-_]/i,           // OpenAI, Stripe style
    /^pk[-_]/i,           // Public key prefix
    /^api[-_]?key/i,      // Generic API key
    /^bearer\s+/i,        // Bearer token
    /^basic\s+/i,         // Basic auth
    /^ghp_/i,             // GitHub personal access token
    /^gho_/i,             // GitHub OAuth token
    /^ghu_/i,             // GitHub user-to-server token
    /^ghs_/i,             // GitHub server-to-server token
    /^ghr_/i,             // GitHub refresh token
    /^xox[baprs]-/i,      // Slack tokens
    /^eyJ[a-zA-Z0-9]/,    // JWT tokens (base64 encoded JSON)
  ]

  for (const pattern of apiKeyPatterns) {
    if (pattern.test(value)) {
      return true
    }
  }

  // Check for high entropy strings (likely secrets)
  // A simple heuristic: long strings with mixed case, numbers, and special chars
  if (value.length >= 20) {
    const hasLower = /[a-z]/.test(value)
    const hasUpper = /[A-Z]/.test(value)
    const hasNumber = /[0-9]/.test(value)
    const hasSpecial = /[^a-zA-Z0-9]/.test(value)

    // If it has 3+ character types and is long, it might be a secret
    const charTypes = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length
    if (charTypes >= 3) {
      return true
    }
  }

  return false
}

/**
 * Creates a safe log message by masking any detected sensitive values.
 * 
 * @param message - The message to sanitize
 * @param additionalPatterns - Additional regex patterns to mask
 * @returns Sanitized message
 */
export function sanitizeLogMessage(
  message: string,
  additionalPatterns: RegExp[] = []
): string {
  if (!message || typeof message !== 'string') {
    return ''
  }

  let result = message

  // Common patterns to mask in logs
  const patterns = [
    // API keys with common prefixes
    /(sk[-_][a-zA-Z0-9]{20,})/g,
    /(pk[-_][a-zA-Z0-9]{20,})/g,
    // Bearer tokens
    /(bearer\s+)[a-zA-Z0-9._-]+/gi,
    // Basic auth
    /(basic\s+)[a-zA-Z0-9+/=]+/gi,
    // JWT tokens
    /(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)/g,
    // Password in URLs
    /(:\/\/[^:]+:)[^@]+(@)/g,
    // Email addresses (partial mask)
    /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    ...additionalPatterns,
  ]

  for (const pattern of patterns) {
    result = result.replace(pattern, (match, ...groups) => {
      // Handle different pattern types
      if (pattern.source.includes('bearer') || pattern.source.includes('basic')) {
        return `${groups[0]}[REDACTED]`
      }
      if (pattern.source.includes(':\/\/')) {
        return `${groups[0]}[REDACTED]${groups[1]}`
      }
      if (pattern.source.includes('@')) {
        // Email: mask local part
        const local = groups[0]
        const domain = groups[1]
        return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 5))}@${domain}`
      }
      // Default: mask the entire match
      return maskApiKey(match)
    })
  }

  return result
}
