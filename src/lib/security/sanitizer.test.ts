/**
 * Property-based tests for XSS sanitization and HTML escaping
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { sanitizeHtml, escapeHtml, containsXss } from './sanitizer'

/**
 * **Feature: project-optimization, Property 10: XSS Sanitization Completeness**
 * **Validates: Requirements 6.1, 6.2**
 * 
 * For any user-submitted text content containing `<script>` tags or `on*` event handlers,
 * the sanitized output SHALL contain neither script tags nor event handler attributes.
 */
describe('Property 10: XSS Sanitization Completeness', () => {
  // Arbitrary for generating random script tag content
  const scriptContentArb = fc.string({ minLength: 0, maxLength: 100 })
  
  // Arbitrary for generating random event handler names (onclick, onload, onerror, etc.)
  const eventHandlerNameArb = fc.constantFrom(
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown',
    'onkeyup', 'onkeypress', 'ondblclick', 'oncontextmenu'
  )
  
  // Arbitrary for generating random event handler values
  const eventHandlerValueArb = fc.string({ minLength: 1, maxLength: 50 })
  
  // Arbitrary for generating random safe text content
  const safeTextArb = fc.string({ minLength: 0, maxLength: 100 })
    .filter(s => !s.includes('<') && !s.includes('>'))

  it('should remove all script tags from input', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        safeTextArb,
        async (scriptContent, safeText) => {
          // Create input with script tag
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

  it('should remove script tags with attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        async (scriptContent, attrValue) => {
          // Create input with script tag with src attribute
          const input = `<script src="${attrValue}">${scriptContent}</script>`
          const result = sanitizeHtml(input)
          
          // Result should not contain script tags
          expect(result.toLowerCase()).not.toContain('<script')
          expect(result.toLowerCase()).not.toContain('</script>')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove all event handler attributes', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventHandlerNameArb,
        eventHandlerValueArb,
        safeTextArb,
        async (eventName, eventValue, text) => {
          // Create input with event handler
          const input = `<div ${eventName}="${eventValue}">${text}</div>`
          const result = sanitizeHtml(input)
          
          // Result should not contain event handlers
          expect(result.toLowerCase()).not.toMatch(/\son\w+\s*=/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove event handlers with single quotes', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventHandlerNameArb,
        eventHandlerValueArb,
        async (eventName, eventValue) => {
          // Create input with single-quoted event handler
          const input = `<p ${eventName}='${eventValue}'>text</p>`
          const result = sanitizeHtml(input)
          
          // Result should not contain event handlers
          expect(result.toLowerCase()).not.toMatch(/\son\w+\s*=/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove event handlers without quotes', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventHandlerNameArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes(' ') && !s.includes('>')),
        async (eventName, eventValue) => {
          // Create input with unquoted event handler
          const input = `<span ${eventName}=${eventValue}>content</span>`
          const result = sanitizeHtml(input)
          
          // Result should not contain event handlers
          expect(result.toLowerCase()).not.toMatch(/\son\w+\s*=/)
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
          
          // Result should not contain javascript: protocol
          expect(result.toLowerCase()).not.toContain('javascript:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle mixed XSS vectors', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        eventHandlerNameArb,
        eventHandlerValueArb,
        async (scriptContent, eventName, eventValue) => {
          // Create input with multiple XSS vectors
          const input = `<div ${eventName}="${eventValue}"><script>${scriptContent}</script><a href="javascript:alert(1)">link</a></div>`
          const result = sanitizeHtml(input)
          
          // Result should not contain any XSS vectors
          expect(result.toLowerCase()).not.toContain('<script')
          expect(result.toLowerCase()).not.toMatch(/\son\w+\s*=/)
          expect(result.toLowerCase()).not.toContain('javascript:')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve safe content while removing XSS', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeTextArb.filter(s => s.length > 0),
        scriptContentArb,
        async (safeText, scriptContent) => {
          const input = `<p>${safeText}</p><script>${scriptContent}</script>`
          const result = sanitizeHtml(input)
          
          // Safe text should be preserved
          expect(result).toContain(safeText)
          // Script should be removed
          expect(result.toLowerCase()).not.toContain('<script')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle case variations in script tags', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptContentArb,
        fc.constantFrom('SCRIPT', 'Script', 'ScRiPt', 'sCRIPT'),
        async (content, tagCase) => {
          const input = `<${tagCase}>${content}</${tagCase}>`
          const result = sanitizeHtml(input)
          
          // Result should not contain script tags in any case
          expect(result.toLowerCase()).not.toContain('<script')
          expect(result.toLowerCase()).not.toContain('</script>')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle case variations in event handlers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ONCLICK', 'OnClick', 'onClick', 'ONLOAD', 'OnLoad'),
        eventHandlerValueArb,
        async (eventName, eventValue) => {
          const input = `<div ${eventName}="${eventValue}">text</div>`
          const result = sanitizeHtml(input)
          
          // Result should not contain event handlers in any case
          expect(result.toLowerCase()).not.toMatch(/\son\w+\s*=/)
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * **Feature: project-optimization, Property 11: HTML Entity Escaping**
 * **Validates: Requirements 6.3**
 * 
 * For any string containing HTML special characters (`<`, `>`, `&`, `"`, `'`),
 * the escaped output SHALL replace these with their corresponding HTML entities.
 */
describe('Property 11: HTML Entity Escaping', () => {
  // Arbitrary for generating strings with HTML special characters
  const stringWithSpecialCharsArb = fc.string({ minLength: 1, maxLength: 200 })
  
  // Arbitrary for generating strings that definitely contain special chars
  const stringWithGuaranteedSpecialCharsArb = fc.tuple(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom('<', '>', '&', '"', "'"),
    fc.string({ minLength: 0, maxLength: 50 })
  ).map(([before, special, after]) => `${before}${special}${after}`)

  it('should escape < to &lt;', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        async (before, after) => {
          const input = `${before}<${after}`
          const result = escapeHtml(input)
          
          // Result should not contain unescaped <
          expect(result).not.toContain('<')
          // Result should contain the entity
          expect(result).toContain('&lt;')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should escape > to &gt;', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        async (before, after) => {
          const input = `${before}>${after}`
          const result = escapeHtml(input)
          
          // Result should not contain unescaped >
          expect(result).not.toContain('>')
          // Result should contain the entity
          expect(result).toContain('&gt;')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should escape & to &amp;', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes('&')),
        fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes('&')),
        async (before, after) => {
          const input = `${before}&${after}`
          const result = escapeHtml(input)
          
          // Result should contain &amp; for the original &
          expect(result).toContain('&amp;')
          // The original & should be escaped (not appear as standalone)
          // Count occurrences - escaped & appears as &amp;
          const ampCount = (input.match(/&/g) || []).length
          const ampEntityCount = (result.match(/&amp;/g) || []).length
          expect(ampEntityCount).toBe(ampCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should escape " to &quot;', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes('"')),
        fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes('"')),
        async (before, after) => {
          const input = `${before}"${after}`
          const result = escapeHtml(input)
          
          // Result should not contain unescaped "
          expect(result).not.toContain('"')
          // Result should contain the entity
          expect(result).toContain('&quot;')
        }
      ),
      { numRuns: 100 }
    )
  })

  it("should escape ' to &#39;", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes("'")),
        fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes("'")),
        async (before, after) => {
          const input = `${before}'${after}`
          const result = escapeHtml(input)
          
          // Result should not contain unescaped '
          expect(result).not.toContain("'")
          // Result should contain the entity
          expect(result).toContain('&#39;')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should escape all special characters in a string', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringWithSpecialCharsArb,
        async (input) => {
          const result = escapeHtml(input)
          
          // Result should not contain any unescaped special characters
          // (except those that are part of entity names)
          const hasUnescapedLt = result.includes('<')
          const hasUnescapedGt = result.includes('>')
          const hasUnescapedQuot = result.includes('"')
          const hasUnescapedApos = result.includes("'")
          
          expect(hasUnescapedLt).toBe(false)
          expect(hasUnescapedGt).toBe(false)
          expect(hasUnescapedQuot).toBe(false)
          expect(hasUnescapedApos).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve non-special characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 })
          .filter(s => !/[<>&"']/.test(s)),
        async (input) => {
          const result = escapeHtml(input)
          
          // Input without special chars should remain unchanged
          expect(result).toBe(input)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle multiple occurrences of the same special character', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('<', '>', '&', '"', "'"),
        fc.integer({ min: 1, max: 10 }),
        async (char, count) => {
          const input = char.repeat(count)
          const result = escapeHtml(input)
          
          // Count the entities - each original char should become one entity
          const entityMap: Record<string, string> = {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;'
          }
          const entity = entityMap[char]
          const entityCount = (result.match(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
          expect(entityCount).toBe(count)
          
          // For non-ampersand chars, verify they don't appear raw
          if (char !== '&') {
            expect(result).not.toContain(char)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('should handle string with all special characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(['<', '>', '&', '"', "'"], { minLength: 1, maxLength: 5 }),
        async (chars) => {
          const input = chars.join('')
          const result = escapeHtml(input)
          
          // None of the original special chars should remain
          expect(result).not.toContain('<')
          expect(result).not.toContain('>')
          expect(result).not.toContain('"')
          expect(result).not.toContain("'")
          // & will appear in entities, but original standalone & should be escaped
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should produce output that is safe for HTML insertion', async () => {
    await fc.assert(
      fc.asyncProperty(
        stringWithGuaranteedSpecialCharsArb,
        async (input) => {
          const result = escapeHtml(input)
          
          // The result should be safe - no raw HTML special chars
          // that could be interpreted as HTML
          expect(result).not.toMatch(/[<>]/)
          expect(result).not.toContain('"')
          expect(result).not.toContain("'")
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Additional tests for containsXss utility function
 */
describe('containsXss utility function', () => {
  it('should detect script tags', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 50 }),
        async (content) => {
          const input = `<script>${content}</script>`
          expect(containsXss(input)).toBe(true)
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
          expect(containsXss(input)).toBe(true)
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
          expect(containsXss(input)).toBe(true)
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
            !/\son\w+\s*=/i.test(s) &&
            !/data:text\/html/i.test(s)
          ),
        async (input) => {
          expect(containsXss(input)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
