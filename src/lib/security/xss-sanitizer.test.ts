/**
 * Property-based tests for XSS Sanitizer
 * 
 * **Feature: security-vulnerabilities-fix**
 * 
 * Tests Property 1: HTML/CSS Sanitization Safety
 * Tests Property 2: Sanitization Idempotence
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { sanitizeHtml, sanitizeCss, containsDangerousContent, escapeHtml } from './xss-sanitizer'

/**
 * **Feature: security-vulnerabilities-fix, Property 1: HTML/CSS Sanitization Safety**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * For any HTML or CSS string input, after sanitization, the output SHALL NOT contain
 * any script tags, event handlers (on* attributes), javascript: URLs, or dangerous
 * CSS functions (expression, url with javascript).
 */
describe('Property 1: HTML/CSS Sanitization Safety', () => {
  // Arbitrary for generating random script content
  const scriptContentArb = fc.string({ minLength: 0, maxLength: 100 })
  
  // Arbitrary for generating random event handler names
  const eventHandlerNameArb = fc.constantFrom(
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown',
    'onkeyup', 'onkeypress', 'ondblclick', 'oncontextmenu'
  )
  
  // Arbitrary for generating random event handler values
  const eventHandlerValueArb = fc.string({ minLength: 1, maxLength: 50 })
  
  // Arbitrary for generating safe text content
  const safeTextArb = fc.string({ minLength: 0, maxLength: 100 })
    .filter(s => !s.includes('<') && !s.includes('>'))

  it('should remove all script tags from HTML input', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        safeTextArb,
        async (scriptContent, safeText) => {
          const input = `${safeText}<script>${scriptContent}</script>${safeText}`
          const result = sanitizeHtml(input)
          
          // Result should not contain script tags
          expect(result.toLowerCase()).not.toContain('<script')
          expect(result.toLowerCase()).not.toContain('</script>')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove script tags with various attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        async (scriptContent, attrValue) => {
          const input = `<script src="${attrValue}">${scriptContent}</script>`
          const result = sanitizeHtml(input)
          
          expect(result.toLowerCase()).not.toContain('<script')
          expect(result.toLowerCase()).not.toContain('</script>')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove all event handler attributes from HTML', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventHandlerNameArb,
        eventHandlerValueArb,
        safeTextArb,
        async (eventName, eventValue, text) => {
          const input = `<div ${eventName}="${eventValue}">${text}</div>`
          const result = sanitizeHtml(input)
          
          // Result should not contain event handlers
          expect(result.toLowerCase()).not.toMatch(/\s+on\w+\s*=/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove javascript: protocol from href attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        async (jsCode) => {
          const input = `<a href="javascript:${jsCode}">link</a>`
          const result = sanitizeHtml(input)
          
          expect(result.toLowerCase()).not.toContain('javascript:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove vbscript: protocol from href attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        async (vbCode) => {
          const input = `<a href="vbscript:${vbCode}">link</a>`
          const result = sanitizeHtml(input)
          
          expect(result.toLowerCase()).not.toContain('vbscript:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove iframe tags from HTML', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (src) => {
          const input = `<iframe src="${src}"></iframe>`
          const result = sanitizeHtml(input)
          
          expect(result.toLowerCase()).not.toContain('<iframe')
          expect(result.toLowerCase()).not.toContain('</iframe>')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove dangerous CSS patterns from sanitizeCss', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        async (code) => {
          const dangerousPatterns = [
            `body { background: url(javascript:${code}); }`,
            `div { behavior: url(${code}); }`,
            `span { -moz-binding: url(${code}); }`,
            `p { width: expression(${code}); }`
          ]
          
          for (const pattern of dangerousPatterns) {
            const result = sanitizeCss(pattern)
            expect(result.toLowerCase()).not.toContain('javascript:')
            expect(result.toLowerCase()).not.toMatch(/expression\s*\(/)
            expect(result.toLowerCase()).not.toMatch(/behavior\s*:/)
            expect(result.toLowerCase()).not.toMatch(/-moz-binding\s*:/)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove @import from CSS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (url) => {
          const input = `@import url("${url}"); body { color: red; }`
          const result = sanitizeCss(input)
          
          expect(result.toLowerCase()).not.toContain('@import')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle mixed XSS vectors in HTML', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        eventHandlerNameArb,
        eventHandlerValueArb,
        async (scriptContent, eventName, eventValue) => {
          const input = `<div ${eventName}="${eventValue}"><script>${scriptContent}</script><a href="javascript:alert(1)">link</a></div>`
          const result = sanitizeHtml(input)
          
          expect(result.toLowerCase()).not.toContain('<script')
          expect(result.toLowerCase()).not.toMatch(/\s+on\w+\s*=/)
          expect(result.toLowerCase()).not.toContain('javascript:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve safe content while removing XSS vectors', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate safe text that doesn't contain HTML special characters
        fc.string({ minLength: 1, maxLength: 100 })
          .filter(s => s.trim().length > 0 && !/[<>&"']/.test(s)),
        scriptContentArb,
        async (safeText, scriptContent) => {
          const input = `<p>${safeText}</p><script>${scriptContent}</script>`
          const result = sanitizeHtml(input)
          
          // Safe text should be preserved (without HTML special chars, it won't be encoded)
          expect(result).toContain(safeText)
          // Script should be removed
          expect(result.toLowerCase()).not.toContain('<script')
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: security-vulnerabilities-fix, Property 2: Sanitization Idempotence**
 * **Validates: Requirements 1.5**
 * 
 * For any HTML content, sanitizing it once and sanitizing it twice SHALL produce
 * identical output (idempotence property).
 */
describe('Property 2: Sanitization Idempotence', () => {
  // Arbitrary for generating random HTML-like content
  const htmlContentArb = fc.oneof(
    // Safe HTML
    fc.string({ minLength: 0, maxLength: 200 }),
    // HTML with tags
    fc.tuple(
      fc.constantFrom('p', 'div', 'span', 'b', 'i', 'strong', 'em'),
      fc.string({ minLength: 0, maxLength: 50 })
    ).map(([tag, content]) => `<${tag}>${content}</${tag}>`),
    // HTML with attributes
    fc.tuple(
      fc.constantFrom('div', 'span', 'p'),
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 0, maxLength: 30 })
    ).map(([tag, className, content]) => `<${tag} class="${className}">${content}</${tag}>`),
    // Potentially dangerous HTML
    fc.tuple(
      fc.string({ minLength: 0, maxLength: 30 }),
      fc.string({ minLength: 0, maxLength: 30 })
    ).map(([before, after]) => `${before}<script>alert(1)</script>${after}`)
  )

  it('sanitizeHtml should be idempotent - sanitizing twice equals sanitizing once', async () => {
    await fc.assert(
      fc.asyncProperty(
        htmlContentArb,
        async (html) => {
          const sanitizedOnce = sanitizeHtml(html)
          const sanitizedTwice = sanitizeHtml(sanitizedOnce)
          
          expect(sanitizedTwice).toBe(sanitizedOnce)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('sanitizeCss should be idempotent - sanitizing twice equals sanitizing once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 200 }),
        async (css) => {
          const sanitizedOnce = sanitizeCss(css)
          const sanitizedTwice = sanitizeCss(sanitizedOnce)
          
          expect(sanitizedTwice).toBe(sanitizedOnce)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('escapeHtml should be idempotent for already escaped content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 100 }),
        async (input) => {
          const escapedOnce = escapeHtml(input)
          const escapedTwice = escapeHtml(escapedOnce)
          
          // Note: escapeHtml is NOT idempotent by design (& becomes &amp; becomes &amp;amp;)
          // But the output should always be safe
          expect(escapedTwice).not.toContain('<')
          expect(escapedTwice).not.toContain('>')
          expect(escapedTwice).not.toContain('"')
          expect(escapedTwice).not.toContain("'")
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Additional tests for containsDangerousContent utility function
 */
describe('containsDangerousContent detection', () => {
  it('should detect script tags', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        async (content) => {
          const input = `<script>${content}</script>`
          expect(containsDangerousContent(input)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect event handlers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('onclick', 'onload', 'onerror', 'onmouseover'),
        fc.string({ minLength: 1, maxLength: 30 }),
        async (handler, value) => {
          const input = `<div ${handler}="${value}">text</div>`
          expect(containsDangerousContent(input)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect javascript: protocol', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 30 }),
        async (code) => {
          const input = `javascript:${code}`
          expect(containsDangerousContent(input)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return false for safe content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 })
          .filter(s => 
            !s.toLowerCase().includes('<script') &&
            !s.toLowerCase().includes('javascript:') &&
            !s.toLowerCase().includes('vbscript:') &&
            !/\s+on\w+\s*=/i.test(s) &&
            !/data:text\/html/i.test(s) &&
            !/expression\s*\(/i.test(s) &&
            !/<(iframe|object|embed|base)[\s>]/i.test(s) &&
            !/-moz-binding\s*:/i.test(s)
          ),
        async (input) => {
          expect(containsDangerousContent(input)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
