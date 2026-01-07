/**
 * XSS Sanitizer Module
 * 
 * Provides robust HTML and CSS sanitization using DOMPurify
 * to prevent Cross-Site Scripting (XSS) attacks.
 * 
 * @module security/xss-sanitizer
 */

import DOMPurify from 'isomorphic-dompurify'

/**
 * Options for HTML sanitization
 */
export interface SanitizeHtmlOptions {
  /** List of allowed HTML tags */
  allowedTags?: string[]
  /** Map of allowed attributes per tag */
  allowedAttributes?: Record<string, string[]>
  /** List of allowed CSS properties in style attributes */
  allowedStyles?: string[]
  /** Whether to allow data: URIs (default: false) */
  allowDataUri?: boolean
}

/**
 * Default allowed tags for sanitization
 */
const DEFAULT_ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption',
  'form', 'input', 'textarea', 'select', 'option', 'button', 'label'
]

/**
 * Default allowed attributes per tag
 */
const DEFAULT_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  'a': ['href', 'title', 'target', 'rel'],
  'img': ['src', 'alt', 'title', 'width', 'height'],
  'span': ['class', 'style'],
  'div': ['class', 'style', 'id'],
  'p': ['class', 'style'],
  'code': ['class'],
  'pre': ['class'],
  'table': ['class', 'style'],
  'th': ['class', 'style', 'colspan', 'rowspan'],
  'td': ['class', 'style', 'colspan', 'rowspan'],
  'form': ['class', 'style', 'id'],
  'input': ['type', 'name', 'value', 'placeholder', 'required', 'class', 'id', 'data-field-id'],
  'textarea': ['name', 'placeholder', 'required', 'class', 'id', 'rows', 'cols', 'data-field-id'],
  'select': ['name', 'required', 'class', 'id', 'data-field-id'],
  'option': ['value', 'selected'],
  'button': ['type', 'class', 'id'],
  'label': ['for', 'class']
}

/**
 * Dangerous CSS patterns that should be removed
 */
const DANGEROUS_CSS_PATTERNS = [
  // JavaScript execution
  /javascript\s*:/gi,
  /expression\s*\(/gi,
  /behavior\s*:/gi,
  /-moz-binding\s*:/gi,
  // URL-based attacks
  /url\s*\(\s*["']?\s*javascript:/gi,
  /url\s*\(\s*["']?\s*data:text\/html/gi,
  /url\s*\(\s*["']?\s*vbscript:/gi,
  // Import attacks
  /@import/gi,
  // Charset manipulation
  /@charset/gi
]

/**
 * Sanitizes HTML content using DOMPurify to remove dangerous elements
 * while preserving safe formatting.
 * 
 * @param html - The HTML string to sanitize
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
export function sanitizeHtml(html: string, options?: SanitizeHtmlOptions): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  const allowedTags = options?.allowedTags ?? DEFAULT_ALLOWED_TAGS
  const allowedAttributes = options?.allowedAttributes ?? DEFAULT_ALLOWED_ATTRIBUTES

  const allowDataUri = Boolean(options?.allowDataUri)

  // Build DOMPurify configuration
  const config: Record<string, unknown> = {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: buildAllowedAttrList(allowedAttributes),
    ALLOW_DATA_ATTR: true, // Allow data-* attributes for form fields
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown',
      'onkeyup', 'onkeypress', 'ondblclick', 'oncontextmenu',
      'onmousedown', 'onmouseup', 'onmousemove', 'onmouseenter',
      'onmouseleave', 'ontouchstart', 'ontouchend', 'ontouchmove'],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
  }

  // Disable data: URIs unless explicitly allowed
  config.ALLOW_UNKNOWN_PROTOCOLS = false

  // Explicitly restrict allowed URI schemes (defense-in-depth)
  // - Allows: http(s), mailto, tel
  // - Allows relative URLs and plain text (no scheme)
  // - Optionally allows data:image/* when allowDataUri=true (still blocks data:text/html)
  config.ALLOWED_URI_REGEXP = allowDataUri
    ? /^(?:(?:https?|mailto|tel):|data:image\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    : /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

  // Add hook to sanitize style attributes
  DOMPurify.addHook('uponSanitizeAttribute', (_node: Element, data: { attrName: string; attrValue: string; keepAttr?: boolean }) => {
    if (data.attrName === 'style') {
      data.attrValue = sanitizeCssInline(data.attrValue)
    }
    // Remove javascript: from href/src
    if (data.attrName === 'href' || data.attrName === 'src' || data.attrName === 'xlink:href') {
      const value = (data.attrValue || '').toLowerCase().trim()
      const isJs = value.startsWith('javascript:') || value.startsWith('vbscript:')
      const isBadData = value.startsWith('data:text/html') || value.startsWith('data:application/xhtml+xml')
      const isAnyData = value.startsWith('data:')

      if (isJs || isBadData || (!allowDataUri && isAnyData)) {
        data.attrValue = ''
        data.keepAttr = false
      }
    }
  })

  let result = DOMPurify.sanitize(html, config) as string

  // Remove the hook after use to avoid affecting other calls
  DOMPurify.removeHook('uponSanitizeAttribute')

  // Final hardening pass: strip dangerous URL schemes in case DOMPurify implementation changes.
  result = result
    .replace(/\b(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript)\s*:[\s\S]*?\2/gi, '$1=""')
    .replace(/\b(href|src)\s*=\s*(["'])\s*data\s*:\s*text\/html[\s\S]*?\2/gi, '$1=""')

  return result
}

/**
 * Builds a flat list of allowed attributes from the per-tag configuration
 */
function buildAllowedAttrList(allowedAttributes: Record<string, string[]>): string[] {
  const attrSet = new Set<string>()
  for (const attrs of Object.values(allowedAttributes)) {
    for (const attr of attrs) {
      attrSet.add(attr)
    }
  }
  return Array.from(attrSet)
}

/**
 * Sanitizes inline CSS (style attribute value) by removing dangerous patterns
 */
function sanitizeCssInline(css: string): string {
  if (!css || typeof css !== 'string') {
    return ''
  }

  let result = css

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    result = result.replace(pattern, '')
  }

  return result.trim()
}

/**
 * Sanitizes CSS content by removing dangerous rules and patterns.
 * This is used for sanitizing <style> tag content or external CSS.
 * 
 * @param css - The CSS string to sanitize
 * @returns Sanitized CSS string
 * 
 * @example
 * ```typescript
 * const dirty = 'body { background: url(javascript:alert(1)); }'
 * const clean = sanitizeCss(dirty)
 * // Returns: 'body { background: ; }'
 * ```
 */
export function sanitizeCss(css: string): string {
  if (!css || typeof css !== 'string') {
    return ''
  }

  let result = css

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    result = result.replace(pattern, '')
  }

  // Remove HTML comments that could be used for injection
  result = result.replace(/<!--[\s\S]*?-->/g, '')

  // Remove closing style/script tags that could break out
  result = result.replace(/<\/style>/gi, '')
  result = result.replace(/<\/script>/gi, '')
  result = result.replace(/<script[^>]*>/gi, '')

  return result.trim()
}

/**
 * Checks if content contains potentially dangerous XSS vectors.
 * This is a detection function, not a sanitization function.
 * 
 * @param content - The string to check
 * @returns true if potential XSS is detected
 * 
 * @example
 * ```typescript
 * containsDangerousContent('<script>alert(1)</script>') // true
 * containsDangerousContent('<p>Hello World</p>') // false
 * ```
 */
export function containsDangerousContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }

  const lowerContent = content.toLowerCase()

  // Check for script tags
  if (/<script[\s>]/i.test(content)) {
    return true
  }

  // Check for event handlers (on* attributes)
  if (/\s+on\w+\s*=/i.test(content)) {
    return true
  }

  // Check for javascript: protocol
  if (lowerContent.includes('javascript:')) {
    return true
  }

  // Check for vbscript: protocol
  if (lowerContent.includes('vbscript:')) {
    return true
  }

  // Check for data: protocol with HTML content
  if (/data:text\/html/i.test(content)) {
    return true
  }

  // Check for dangerous CSS patterns
  if (/expression\s*\(/i.test(content)) {
    return true
  }

  if (/-moz-binding\s*:/i.test(content)) {
    return true
  }

  // Check for iframe/object/embed tags
  if (/<(iframe|object|embed|base)[\s>]/i.test(content)) {
    return true
  }

  return false
}

/**
 * Escapes HTML special characters to prevent XSS when displaying user content.
 * Use this when you need to display user input as plain text, not as HTML.
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

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
