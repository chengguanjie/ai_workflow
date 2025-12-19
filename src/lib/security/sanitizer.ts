/**
 * Security utilities for XSS prevention and HTML sanitization
 * 
 * @module security/sanitizer
 */

/**
 * Options for HTML sanitization
 */
export interface SanitizeOptions {
  /** List of allowed HTML tags (default: basic formatting tags) */
  allowedTags?: string[]
  /** Map of allowed attributes per tag */
  allowedAttributes?: Record<string, string[]>
}

/**
 * Default allowed tags for sanitization
 */
const DEFAULT_ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre'
]

/**
 * Default allowed attributes per tag
 */
const DEFAULT_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  'a': ['href', 'title', 'target'],
  'span': ['class'],
  'p': ['class'],
  'code': ['class'],
  'pre': ['class']
}

/**
 * Pattern to match script tags (including variations)
 */
const SCRIPT_TAG_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi

/**
 * Pattern to match script tags that may not be closed
 */
const SCRIPT_OPEN_TAG_PATTERN = /<script\b[^>]*>/gi

/**
 * Pattern to match event handler attributes (on*)
 */
const EVENT_HANDLER_PATTERN = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi

/**
 * Pattern to match javascript: protocol in href/src attributes
 */
const JAVASCRIPT_PROTOCOL_PATTERN = /(?:href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi

/**
 * Pattern to match data: protocol that could contain scripts
 */
const DATA_SCRIPT_PATTERN = /(?:href|src)\s*=\s*(?:"data:text\/html[^"]*"|'data:text\/html[^']*')/gi

/**
 * Sanitizes HTML content by removing dangerous elements and attributes
 * while preserving safe formatting.
 * 
 * @param input - The HTML string to sanitize
 * @param options - Sanitization options
 * @returns Sanitized HTML string
 * 
 * @example
 * ```typescript
 * const dirty = '<p onclick="alert(1)">Hello <script>evil()</script></p>'
 * const clean = sanitizeHtml(dirty)
 * // Returns: '<p>Hello </p>'
 * ```
 */
export function sanitizeHtml(input: string, options?: SanitizeOptions): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  const allowedTags = options?.allowedTags ?? DEFAULT_ALLOWED_TAGS
  const allowedAttributes = options?.allowedAttributes ?? DEFAULT_ALLOWED_ATTRIBUTES

  let result = input

  // Remove script tags (complete tags)
  result = result.replace(SCRIPT_TAG_PATTERN, '')
  
  // Remove any remaining script opening tags
  result = result.replace(SCRIPT_OPEN_TAG_PATTERN, '')
  
  // Remove closing script tags that might be orphaned
  result = result.replace(/<\/script>/gi, '')

  // Remove event handlers (on* attributes)
  result = result.replace(EVENT_HANDLER_PATTERN, '')

  // Remove javascript: protocol
  result = result.replace(JAVASCRIPT_PROTOCOL_PATTERN, '')

  // Remove dangerous data: protocols
  result = result.replace(DATA_SCRIPT_PATTERN, '')

  // Remove disallowed tags while keeping their content
  result = removeDisallowedTags(result, allowedTags)

  // Remove disallowed attributes from allowed tags
  result = removeDisallowedAttributes(result, allowedTags, allowedAttributes)

  return result.trim()
}

/**
 * Removes HTML tags that are not in the allowed list while preserving their content
 */
function removeDisallowedTags(html: string, allowedTags: string[]): string {
  const allowedTagsLower = allowedTags.map(t => t.toLowerCase())
  
  // Match any HTML tag
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi
  
  return html.replace(tagPattern, (match, tagName) => {
    const tagLower = tagName.toLowerCase()
    if (allowedTagsLower.includes(tagLower)) {
      return match
    }
    // Remove disallowed tags but keep content
    return ''
  })
}

/**
 * Removes attributes that are not in the allowed list for each tag
 */
function removeDisallowedAttributes(
  html: string, 
  allowedTags: string[], 
  allowedAttributes: Record<string, string[]>
): string {
  const allowedTagsLower = allowedTags.map(t => t.toLowerCase())
  
  // Match opening tags with attributes
  const tagWithAttrsPattern = /<([a-zA-Z][a-zA-Z0-9]*)\s+([^>]*)>/gi
  
  return html.replace(tagWithAttrsPattern, (match, tagName, attrs) => {
    const tagLower = tagName.toLowerCase()
    
    if (!allowedTagsLower.includes(tagLower)) {
      return match // Will be handled by removeDisallowedTags
    }
    
    const tagAllowedAttrs = allowedAttributes[tagLower] || []
    
    if (tagAllowedAttrs.length === 0) {
      // No attributes allowed for this tag
      return `<${tagName}>`
    }
    
    // Parse and filter attributes
    const filteredAttrs = filterAttributes(attrs, tagAllowedAttrs)
    
    if (filteredAttrs) {
      return `<${tagName} ${filteredAttrs}>`
    }
    return `<${tagName}>`
  })
}

/**
 * Filters attributes keeping only those in the allowed list
 */
function filterAttributes(attrsString: string, allowedAttrs: string[]): string {
  const allowedAttrsLower = allowedAttrs.map(a => a.toLowerCase())
  const attrPattern = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g
  
  const validAttrs: string[] = []
  let match
  
  while ((match = attrPattern.exec(attrsString)) !== null) {
    const attrName = match[1].toLowerCase()
    const attrValue = match[2] ?? match[3] ?? match[4] ?? ''
    
    if (allowedAttrsLower.includes(attrName)) {
      // Skip if value contains javascript:
      if (attrValue.toLowerCase().includes('javascript:')) {
        continue
      }
      validAttrs.push(`${attrName}="${escapeAttributeValue(attrValue)}"`)
    }
  }
  
  return validAttrs.join(' ')
}

/**
 * Escapes special characters in attribute values
 */
function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * HTML entity mapping for escaping
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/**
 * Pattern to match HTML special characters
 */
const HTML_SPECIAL_CHARS_PATTERN = /[&<>"']/g

/**
 * Escapes HTML special characters to prevent XSS when displaying user content.
 * This function converts special characters to their HTML entity equivalents.
 * 
 * @param input - The string to escape
 * @returns String with HTML special characters escaped
 * 
 * @example
 * ```typescript
 * const unsafe = '<script>alert("xss")</script>'
 * const safe = escapeHtml(unsafe)
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 * ```
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  return input.replace(HTML_SPECIAL_CHARS_PATTERN, (char) => HTML_ENTITIES[char] || char)
}

/**
 * Checks if a string contains potential XSS vectors
 * 
 * @param input - The string to check
 * @returns true if potential XSS is detected
 */
export function containsXss(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false
  }

  const lowerInput = input.toLowerCase()
  
  // Check for script tags
  if (/<script/i.test(input)) {
    return true
  }
  
  // Check for event handlers
  if (/\son\w+\s*=/i.test(input)) {
    return true
  }
  
  // Check for javascript: protocol
  if (lowerInput.includes('javascript:')) {
    return true
  }
  
  // Check for data: protocol with HTML
  if (/data:text\/html/i.test(input)) {
    return true
  }
  
  return false
}
