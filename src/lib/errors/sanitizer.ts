/**
 * Error Sanitizer Module
 * 
 * Provides functions to detect and mask sensitive data in error messages
 * and error contexts to prevent accidental exposure of confidential information.
 * 
 * @module errors/sanitizer
 */

import { ErrorContext, FieldError } from './types'

// ============================================================================
// Constants
// ============================================================================

const MASK_CHAR = '*'

/**
 * Patterns for detecting sensitive data in error messages
 */
const SENSITIVE_PATTERNS = {
  // Email pattern: captures local part and domain separately
  email: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  
  // API key patterns (various providers)
  apiKeyOpenAI: /\b(sk-[a-zA-Z0-9]{20,})\b/g,
  apiKeyStripe: /\b(sk_(?:live|test)_[a-zA-Z0-9]{20,})\b/g,
  apiKeyGeneric: /\b(api[_-]?key[_-]?[=:]\s*['"]?)([a-zA-Z0-9_-]{16,})(['"]?)/gi,
  
  // Password patterns
  passwordInUrl: /:\/\/([^:]+):([^@]+)@/g,
  passwordField: /(password|passwd|pwd)[_-]?[=:]\s*['"]?([^'"\s,}]+)['"]?/gi,
  
  // Token patterns
  bearerToken: /(bearer\s+)([a-zA-Z0-9._-]+)/gi,
  basicAuth: /(basic\s+)([a-zA-Z0-9+/=]+)/gi,
  jwtToken: /\b(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*)\b/g,
  
  // GitHub tokens
  githubToken: /\b(gh[pousr]_[a-zA-Z0-9]{36,})\b/g,
  
  // Slack tokens
  slackToken: /\b(xox[baprs]-[a-zA-Z0-9-]+)\b/g,
  
  // AWS keys
  awsAccessKey: /\b(AKIA[A-Z0-9]{16})\b/g,
  awsSecretKey: /\b([a-zA-Z0-9/+=]{40})\b/g,
  
  // Credit card numbers (basic pattern)
  creditCard: /\b(\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4})\b/g,
  
  // Phone numbers (various formats)
  phoneNumber: /\b(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
  
  // SSN pattern
  ssn: /\b(\d{3}[-]?\d{2}[-]?\d{4})\b/g,
  
  // IP addresses (for privacy)
  ipAddress: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
}

/**
 * Sensitive field names that should be redacted in error context
 */
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'apikey',
  'api_key',
  'apiKey',
  'token',
  'accesstoken',
  'access_token',
  'accessToken',
  'refreshtoken',
  'refresh_token',
  'refreshToken',
  'privatekey',
  'private_key',
  'privateKey',
  'secretkey',
  'secret_key',
  'secretKey',
  'credential',
  'credentials',
  'authorization',
  'auth',
  'cookie',
  'session',
  'sessionid',
  'session_id',
  'sessionId',
  'ssn',
  'creditcard',
  'credit_card',
  'creditCard',
  'cardnumber',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'pin',
  'encryptionkey',
  'encryption_key',
  'encryptionKey',
  'salt',
  'hash',
  'passwordhash',
  'password_hash',
  'passwordHash',
])

// ============================================================================
// Masking Functions
// ============================================================================

/**
 * Masks an email address, showing only the first character of the local part
 * and the full domain.
 * 
 * @param email - The email address to mask
 * @returns Masked email address (e.g., "j***@example.com")
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) {
    return mask(email, 1, 0)
  }
  
  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  
  if (localPart.length <= 1) {
    return `${localPart}${MASK_CHAR.repeat(3)}${domain}`
  }
  
  const visibleChar = localPart[0]
  const maskedLength = Math.min(localPart.length - 1, 5)
  
  return `${visibleChar}${MASK_CHAR.repeat(maskedLength)}${domain}`
}

/**
 * Masks an API key, showing only the prefix and last few characters.
 * 
 * @param key - The API key to mask
 * @returns Masked API key (e.g., "sk-***...***")
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) {
    return MASK_CHAR.repeat(key?.length || 8)
  }
  
  // Determine prefix length (usually 2-4 chars like "sk-" or "pk_")
  const prefixMatch = key.match(/^([a-zA-Z]{2,4}[-_]?)/)
  const prefixLength = prefixMatch ? prefixMatch[1].length : 4
  
  const prefix = key.slice(0, prefixLength)
  const suffix = key.slice(-4)
  
  return `${prefix}${MASK_CHAR.repeat(3)}...${MASK_CHAR.repeat(3)}${suffix}`
}

/**
 * Masks a password completely with a fixed-length mask.
 * 
 * @param _password - The password to mask (unused, always returns fixed mask)
 * @returns Fixed-length masked string
 */
export function maskPassword(_password: string): string {
  // Always return fixed length to not reveal password length
  return MASK_CHAR.repeat(8)
}

/**
 * Masks a token, showing only the first and last few characters.
 * 
 * @param token - The token to mask
 * @returns Masked token
 */
export function maskToken(token: string): string {
  if (!token || token.length < 12) {
    return MASK_CHAR.repeat(token?.length || 12)
  }
  
  const prefix = token.slice(0, 4)
  const suffix = token.slice(-4)
  
  return `${prefix}${MASK_CHAR.repeat(8)}${suffix}`
}

/**
 * Generic masking function.
 * 
 * @param value - The string to mask
 * @param visibleStart - Number of characters to show at start
 * @param visibleEnd - Number of characters to show at end
 * @returns Masked string
 */
export function mask(
  value: string,
  visibleStart: number = 0,
  visibleEnd: number = 0
): string {
  if (!value) return ''
  
  visibleStart = Math.max(0, visibleStart)
  visibleEnd = Math.max(0, visibleEnd)
  
  if (value.length <= visibleStart + visibleEnd) {
    return MASK_CHAR.repeat(value.length)
  }
  
  const start = value.slice(0, visibleStart)
  const end = visibleEnd > 0 ? value.slice(-visibleEnd) : ''
  const maskLength = value.length - visibleStart - visibleEnd
  
  return `${start}${MASK_CHAR.repeat(maskLength)}${end}`
}

/**
 * Masks a credit card number, showing only the last 4 digits.
 * 
 * @param cardNumber - The credit card number to mask
 * @returns Masked credit card number
 */
export function maskCreditCard(cardNumber: string): string {
  // Remove spaces and dashes
  const cleaned = cardNumber.replace(/[-\s]/g, '')
  if (cleaned.length < 4) {
    return MASK_CHAR.repeat(cleaned.length)
  }
  
  const lastFour = cleaned.slice(-4)
  return `${MASK_CHAR.repeat(12)}${lastFour}`
}

/**
 * Masks a phone number, showing only the last 4 digits.
 * 
 * @param phone - The phone number to mask
 * @returns Masked phone number
 */
export function maskPhoneNumber(phone: string): string {
  // Remove non-digit characters for processing
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) {
    return MASK_CHAR.repeat(phone.length)
  }
  
  const lastFour = digits.slice(-4)
  return `${MASK_CHAR.repeat(6)}-${lastFour}`
}

/**
 * Masks an SSN, showing only the last 4 digits.
 * 
 * @param ssn - The SSN to mask
 * @returns Masked SSN
 */
export function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, '')
  if (digits.length < 4) {
    return MASK_CHAR.repeat(ssn.length)
  }
  
  const lastFour = digits.slice(-4)
  return `${MASK_CHAR.repeat(3)}-${MASK_CHAR.repeat(2)}-${lastFour}`
}

/**
 * Masks an IP address for privacy.
 * 
 * @param ip - The IP address to mask
 * @returns Masked IP address
 */
export function maskIPAddress(ip: string): string {
  const parts = ip.split('.')
  if (parts.length !== 4) {
    return mask(ip, 0, 0)
  }
  
  // Show first octet, mask the rest
  return `${parts[0]}.${MASK_CHAR.repeat(3)}.${MASK_CHAR.repeat(3)}.${MASK_CHAR.repeat(3)}`
}

// ============================================================================
// Main Sanitization Functions
// ============================================================================

/**
 * Sanitizes an error message by detecting and masking sensitive data.
 * 
 * @param message - The error message to sanitize
 * @returns Sanitized error message with sensitive data masked
 * 
 * @example
 * ```typescript
 * sanitizeErrorMessage('Failed to authenticate user john@example.com')
 * // Returns: 'Failed to authenticate user j*****@example.com'
 * 
 * sanitizeErrorMessage('Invalid API key: sk-1234567890abcdef')
 * // Returns: 'Invalid API key: sk-***...***cdef'
 * ```
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return message || ''
  }
  
  let result = message
  
  // Mask emails
  result = result.replace(SENSITIVE_PATTERNS.email, (_, local, domain) => {
    return maskEmail(`${local}@${domain}`)
  })
  
  // Mask OpenAI API keys
  result = result.replace(SENSITIVE_PATTERNS.apiKeyOpenAI, (match) => {
    return maskApiKey(match)
  })
  
  // Mask Stripe API keys
  result = result.replace(SENSITIVE_PATTERNS.apiKeyStripe, (match) => {
    return maskApiKey(match)
  })
  
  // Mask generic API keys
  result = result.replace(SENSITIVE_PATTERNS.apiKeyGeneric, (_, prefix, key, suffix) => {
    return `${prefix}${maskApiKey(key)}${suffix || ''}`
  })
  
  // Mask passwords in URLs
  result = result.replace(SENSITIVE_PATTERNS.passwordInUrl, (_, user, _password) => {
    return `://${user}:${maskPassword('')}@`
  })
  
  // Mask password fields
  result = result.replace(SENSITIVE_PATTERNS.passwordField, (_, fieldName, _value) => {
    return `${fieldName}=${maskPassword('')}`
  })
  
  // Mask bearer tokens
  result = result.replace(SENSITIVE_PATTERNS.bearerToken, (_, prefix, token) => {
    return `${prefix}${maskToken(token)}`
  })
  
  // Mask basic auth
  result = result.replace(SENSITIVE_PATTERNS.basicAuth, (_, prefix, _token) => {
    return `${prefix}[REDACTED]`
  })
  
  // Mask JWT tokens
  result = result.replace(SENSITIVE_PATTERNS.jwtToken, (match) => {
    return maskToken(match)
  })
  
  // Mask GitHub tokens
  result = result.replace(SENSITIVE_PATTERNS.githubToken, (match) => {
    return maskApiKey(match)
  })
  
  // Mask Slack tokens
  result = result.replace(SENSITIVE_PATTERNS.slackToken, (match) => {
    return maskApiKey(match)
  })
  
  // Mask AWS access keys
  result = result.replace(SENSITIVE_PATTERNS.awsAccessKey, (match) => {
    return maskApiKey(match)
  })
  
  // Mask credit card numbers
  result = result.replace(SENSITIVE_PATTERNS.creditCard, (match) => {
    return maskCreditCard(match)
  })
  
  // Mask phone numbers
  result = result.replace(SENSITIVE_PATTERNS.phoneNumber, (match) => {
    return maskPhoneNumber(match)
  })
  
  // Mask SSN
  result = result.replace(SENSITIVE_PATTERNS.ssn, (match) => {
    // Avoid false positives - SSN should be exactly 9 digits
    const digits = match.replace(/\D/g, '')
    if (digits.length === 9) {
      return maskSSN(match)
    }
    return match
  })
  
  return result
}

/**
 * Checks if a field name is considered sensitive.
 * 
 * @param fieldName - The field name to check
 * @returns true if the field name is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  if (!fieldName) return false
  return SENSITIVE_FIELD_NAMES.has(fieldName.toLowerCase())
}

/**
 * Sanitizes an error context by masking sensitive field values.
 * 
 * @param context - The error context to sanitize
 * @returns Sanitized error context with sensitive data masked
 * 
 * @example
 * ```typescript
 * sanitizeErrorContext({
 *   userId: 'user123',
 *   endpoint: '/api/login',
 *   fieldErrors: [
 *     { field: 'password', value: 'secret123', constraint: 'required', message: 'Password is required' }
 *   ]
 * })
 * // Returns context with password value masked
 * ```
 */
export function sanitizeErrorContext(context: ErrorContext): ErrorContext {
  if (!context || typeof context !== 'object') {
    return context || {}
  }
  
  const sanitized: ErrorContext = { ...context }
  
  // Sanitize field errors
  if (sanitized.fieldErrors && Array.isArray(sanitized.fieldErrors)) {
    sanitized.fieldErrors = sanitized.fieldErrors.map((fieldError): FieldError => {
      const sanitizedFieldError: FieldError = { ...fieldError }
      
      // Check if the field name is sensitive
      if (isSensitiveField(fieldError.field)) {
        // Remove or mask the value
        if (sanitizedFieldError.value !== undefined) {
          sanitizedFieldError.value = '[REDACTED]'
        }
      } else if (sanitizedFieldError.value !== undefined && typeof sanitizedFieldError.value === 'string') {
        // Sanitize the value even for non-sensitive fields (might contain sensitive data)
        sanitizedFieldError.value = sanitizeErrorMessage(sanitizedFieldError.value)
      }
      
      // Sanitize the error message
      if (sanitizedFieldError.message) {
        sanitizedFieldError.message = sanitizeErrorMessage(sanitizedFieldError.message)
      }
      
      return sanitizedFieldError
    })
  }
  
  // Sanitize endpoint (might contain sensitive query params)
  if (sanitized.endpoint) {
    sanitized.endpoint = sanitizeUrl(sanitized.endpoint)
  }
  
  // Sanitize service name (might contain API keys in some cases)
  if (sanitized.serviceName) {
    sanitized.serviceName = sanitizeErrorMessage(sanitized.serviceName)
  }
  
  return sanitized
}

/**
 * Sanitizes a URL by masking sensitive query parameters.
 * 
 * @param url - The URL to sanitize
 * @returns Sanitized URL
 */
export function sanitizeUrl(url: string): string {
  if (!url) return url
  
  try {
    // Handle relative URLs
    const isRelative = !url.startsWith('http://') && !url.startsWith('https://')
    const fullUrl = isRelative ? `http://placeholder${url.startsWith('/') ? '' : '/'}${url}` : url
    
    const urlObj = new URL(fullUrl)
    
    // Mask password in URL
    if (urlObj.password) {
      urlObj.password = maskPassword(urlObj.password)
    }
    
    // Mask sensitive query parameters
    const sensitiveParams = [
      'token', 'api_key', 'apikey', 'key', 'secret', 'password', 'pwd',
      'access_token', 'refresh_token', 'auth', 'authorization', 'credential'
    ]
    
    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]')
      }
    }
    
    // Return the sanitized URL
    if (isRelative) {
      return urlObj.pathname + urlObj.search + urlObj.hash
    }
    return urlObj.toString()
  } catch {
    // If URL parsing fails, apply basic sanitization
    return sanitizeErrorMessage(url)
  }
}

/**
 * Sanitizes an entire error object, including message and context.
 * 
 * @param error - The error object with message and optional context
 * @returns Sanitized error object
 */
export function sanitizeError<T extends { message: string; context?: ErrorContext }>(
  error: T
): T {
  return {
    ...error,
    message: sanitizeErrorMessage(error.message),
    context: error.context ? sanitizeErrorContext(error.context) : undefined,
  }
}

/**
 * Checks if a string contains potentially sensitive data.
 * 
 * @param value - The string to check
 * @returns true if the string appears to contain sensitive data
 */
export function containsSensitiveData(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }
  
  // Check against all sensitive patterns
  for (const pattern of Object.values(SENSITIVE_PATTERNS)) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    if (pattern.test(value)) {
      return true
    }
  }
  
  return false
}

// ============================================================================
// Exports
// ============================================================================

export {
  SENSITIVE_PATTERNS,
  SENSITIVE_FIELD_NAMES,
}
