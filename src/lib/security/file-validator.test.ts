/**
 * Property-based tests for File Validator
 * 
 * **Feature: security-vulnerabilities-fix**
 * 
 * Tests Property 7: File Upload Path Containment
 * Tests Property 8: Filename Sanitization Safety
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as path from 'path'
import {
  validateExtension,
  validateMimeType,
  validateSize,
  sanitizeFilename,
  validateStoragePath,
  containsPathTraversal,
  validateFile,
  getSafeFile,
  getExtension,
  FileValidationError,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_ALLOWED_MIME_TYPES,
  DEFAULT_MAX_FILE_SIZE,
} from './file-validator'

/**
 * **Feature: security-vulnerabilities-fix, Property 7: File Upload Path Containment**
 * **Validates: Requirements 6.3, 6.6**
 * 
 * For any uploaded file, the final storage path SHALL be a descendant of the
 * configured upload directory, preventing path traversal attacks.
 */
describe('Property 7: File Upload Path Containment', () => {
  // Arbitrary for generating path traversal sequences
  const pathTraversalArb = fc.constantFrom(
    '../',
    '..\\',
    '../../../',
    '..\\..\\..\\',
    '%2e%2e/',
    '%2e%2e%2f',
    '..../',
    '....//',
  )

  // Arbitrary for generating safe path components
  const safePathComponentArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => /^[a-z0-9_-]+$/.test(s))

  // Arbitrary for generating base directories
  const baseDirArb = fc.tuple(
    fc.constant('/'),
    fc.array(safePathComponentArb, { minLength: 1, maxLength: 3 })
  ).map(([root, parts]) => root + parts.join('/'))

  it('should reject paths containing path traversal sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseDirArb,
        pathTraversalArb,
        safePathComponentArb,
        async (baseDir, traversal, filename) => {
          const maliciousPath = traversal + filename
          const result = validateStoragePath(maliciousPath, baseDir)
          expect(result.valid).toBe(false)
          expect(result.error).toContain('traversal')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should accept paths that stay within base directory', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseDirArb,
        fc.array(safePathComponentArb, { minLength: 1, maxLength: 3 }),
        async (baseDir, pathParts) => {
          const safePath = pathParts.join('/')
          const result = validateStoragePath(safePath, baseDir)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject absolute paths that escape base directory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('/uploads'),
        fc.array(safePathComponentArb, { minLength: 1, maxLength: 2 }),
        async (baseDir, pathParts) => {
          // Create an absolute path outside the base directory
          const escapePath = '/etc/' + pathParts.join('/')
          const result = validateStoragePath(escapePath, baseDir)
          expect(result.valid).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect path traversal in containsPathTraversal function', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathTraversalArb,
        safePathComponentArb,
        async (traversal, suffix) => {
          const maliciousFilename = traversal + suffix
          expect(containsPathTraversal(maliciousFilename)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should not detect path traversal in safe filenames', async () => {
    await fc.assert(
      fc.asyncProperty(
        safePathComponentArb,
        fc.constantFrom(...Array.from(DEFAULT_ALLOWED_EXTENSIONS)),
        async (name, ext) => {
          const safeFilename = `${name}.${ext}`
          expect(containsPathTraversal(safeFilename)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: security-vulnerabilities-fix, Property 8: Filename Sanitization Safety**
 * **Validates: Requirements 6.3**
 * 
 * For any filename input containing path traversal sequences or special characters,
 * the sanitized output SHALL NOT contain these dangerous sequences.
 */
describe('Property 8: Filename Sanitization Safety', () => {
  // Arbitrary for path traversal sequences
  const pathTraversalArb = fc.constantFrom(
    '../',
    '..\\',
    '../../../',
    '..\\..\\..\\',
    '%2e%2e/',
    '%2e%2e%2f',
    '%2f',
    '%5c',
  )

  // Arbitrary for dangerous characters
  const dangerousCharArb = fc.constantFrom(
    '<', '>', ':', '"', '|', '?', '*', '\x00', '\x1f'
  )

  // Arbitrary for safe filename parts
  const safeNamePartArb = fc.string({ minLength: 1, maxLength: 10 })
    .filter(s => /^[a-z0-9]+$/.test(s))

  it('should remove path traversal sequences from filenames', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathTraversalArb,
        safeNamePartArb,
        fc.constantFrom(...Array.from(DEFAULT_ALLOWED_EXTENSIONS)),
        async (traversal, name, ext) => {
          const maliciousFilename = `${traversal}${name}.${ext}`
          const sanitized = sanitizeFilename(maliciousFilename)
          
          // Sanitized filename should not contain path traversal
          expect(sanitized).not.toContain('..')
          expect(sanitized).not.toContain('%2e')
          expect(sanitized).not.toContain('%2f')
          expect(sanitized).not.toContain('%5c')
          expect(containsPathTraversal(sanitized)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should remove dangerous characters from filenames', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNamePartArb,
        dangerousCharArb,
        safeNamePartArb,
        fc.constantFrom(...Array.from(DEFAULT_ALLOWED_EXTENSIONS)),
        async (prefix, dangerous, suffix, ext) => {
          const maliciousFilename = `${prefix}${dangerous}${suffix}.${ext}`
          const sanitized = sanitizeFilename(maliciousFilename)
          
          // Sanitized filename should not contain dangerous characters
          expect(sanitized).not.toMatch(/[<>:"|?*\x00-\x1f]/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve valid filenames', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNamePartArb,
        fc.constantFrom(...Array.from(DEFAULT_ALLOWED_EXTENSIONS)),
        async (name, ext) => {
          const validFilename = `${name}.${ext}`
          const sanitized = sanitizeFilename(validFilename)
          
          // Should preserve the extension
          expect(getExtension(sanitized)).toBe(ext)
          // Should not be empty
          expect(sanitized.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle null bytes in filenames', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNamePartArb,
        safeNamePartArb,
        fc.constantFrom(...Array.from(DEFAULT_ALLOWED_EXTENSIONS)),
        async (prefix, suffix, ext) => {
          const maliciousFilename = `${prefix}\x00${suffix}.${ext}`
          const sanitized = sanitizeFilename(maliciousFilename)
          
          // Sanitized filename should not contain null bytes
          expect(sanitized).not.toContain('\x00')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('sanitization should be idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (filename) => {
          const sanitized1 = sanitizeFilename(filename)
          const sanitized2 = sanitizeFilename(sanitized1)
          
          // Sanitizing twice should produce the same result
          expect(sanitized1).toBe(sanitized2)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Additional property tests for file validation
 */
describe('File Validation Properties', () => {
  // Arbitrary for allowed extensions
  const allowedExtArb = fc.constantFrom(...Array.from(DEFAULT_ALLOWED_EXTENSIONS))
  
  // Arbitrary for disallowed extensions
  const disallowedExtArb = fc.constantFrom('exe', 'bat', 'cmd', 'sh', 'php', 'asp', 'jsp')

  // Arbitrary for safe filename parts
  const safeNameArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => /^[a-z0-9]+$/.test(s))

  it('should accept files with allowed extensions', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNameArb,
        allowedExtArb,
        async (name, ext) => {
          const filename = `${name}.${ext}`
          const result = validateExtension(filename)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject files with disallowed extensions', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNameArb,
        disallowedExtArb,
        async (name, ext) => {
          const filename = `${name}.${ext}`
          const result = validateExtension(filename)
          expect(result.valid).toBe(false)
          expect(result.error).toContain('not allowed')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should accept files within size limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: DEFAULT_MAX_FILE_SIZE }),
        async (size) => {
          const result = validateSize(size)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reject files exceeding size limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: DEFAULT_MAX_FILE_SIZE + 1, max: DEFAULT_MAX_FILE_SIZE * 2 }),
        async (size) => {
          const result = validateSize(size)
          expect(result.valid).toBe(false)
          expect(result.error).toContain('exceeds')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('comprehensive validateFile should check all validations', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNameArb,
        allowedExtArb,
        fc.integer({ min: 1, max: DEFAULT_MAX_FILE_SIZE }),
        async (name, ext, size) => {
          const file = {
            name: `${name}.${ext}`,
            size: size,
          }
          const result = validateFile(file)
          expect(result.valid).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSafeFile should return sanitized filename for valid files', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNameArb,
        allowedExtArb,
        fc.integer({ min: 1, max: DEFAULT_MAX_FILE_SIZE }),
        async (name, ext, size) => {
          const file = {
            name: `${name}.${ext}`,
            size: size,
          }
          const safeName = getSafeFile(file)
          expect(safeName).toBeDefined()
          expect(safeName.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getSafeFile should throw for invalid files', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeNameArb,
        disallowedExtArb,
        fc.integer({ min: 1, max: 1000 }),
        async (name, ext, size) => {
          const file = {
            name: `${name}.${ext}`,
            size: size,
          }
          expect(() => getSafeFile(file)).toThrow(FileValidationError)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Unit tests for edge cases
 */
describe('File Validator Edge Cases', () => {
  describe('validateExtension', () => {
    it('should reject files without extension', () => {
      expect(validateExtension('filename').valid).toBe(false)
      expect(validateExtension('filename.').valid).toBe(false)
    })

    it('should handle case-insensitive extensions', () => {
      expect(validateExtension('file.PDF').valid).toBe(true)
      expect(validateExtension('file.Jpg').valid).toBe(true)
      expect(validateExtension('file.TXT').valid).toBe(true)
    })

    it('should reject empty filename', () => {
      expect(validateExtension('').valid).toBe(false)
    })
  })

  describe('validateMimeType', () => {
    it('should accept matching MIME type and extension', () => {
      expect(validateMimeType('application/pdf', 'pdf').valid).toBe(true)
      expect(validateMimeType('image/jpeg', 'jpg').valid).toBe(true)
      expect(validateMimeType('image/jpeg', 'jpeg').valid).toBe(true)
    })

    it('should reject mismatched MIME type and extension', () => {
      expect(validateMimeType('application/pdf', 'jpg').valid).toBe(false)
      expect(validateMimeType('image/png', 'pdf').valid).toBe(false)
    })

    it('should accept empty MIME type', () => {
      expect(validateMimeType('', 'pdf').valid).toBe(true)
    })

    it('should reject disallowed MIME types', () => {
      expect(validateMimeType('application/x-executable', 'exe').valid).toBe(false)
    })
  })

  describe('validateSize', () => {
    it('should accept zero size', () => {
      expect(validateSize(0).valid).toBe(true)
    })

    it('should reject negative size', () => {
      expect(validateSize(-1).valid).toBe(false)
    })

    it('should accept custom max size', () => {
      expect(validateSize(500, 1000).valid).toBe(true)
      expect(validateSize(1500, 1000).valid).toBe(false)
    })
  })

  describe('sanitizeFilename', () => {
    it('should handle empty filename', () => {
      expect(sanitizeFilename('')).toBe('unnamed')
    })

    it('should handle filename with only dots', () => {
      expect(sanitizeFilename('...')).toBe('unnamed')
    })

    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt'
      const sanitized = sanitizeFilename(longName)
      expect(sanitized.length).toBeLessThanOrEqual(255)
      expect(sanitized.endsWith('.txt')).toBe(true)
    })

    it('should remove Windows drive letters', () => {
      const sanitized = sanitizeFilename('C:\\Users\\file.txt')
      expect(sanitized).not.toContain('C:')
      expect(sanitized).not.toContain('\\')
    })

    it('should handle Unix absolute paths', () => {
      const sanitized = sanitizeFilename('/etc/passwd')
      expect(sanitized).not.toContain('/')
      expect(sanitized).toBe('passwd')
    })
  })

  describe('validateStoragePath', () => {
    it('should reject empty path', () => {
      expect(validateStoragePath('', '/uploads').valid).toBe(false)
    })

    it('should reject empty base directory', () => {
      expect(validateStoragePath('file.txt', '').valid).toBe(false)
    })

    it('should accept relative paths within base', () => {
      expect(validateStoragePath('subdir/file.txt', '/uploads').valid).toBe(true)
    })

    it('should reject paths with encoded traversal', () => {
      expect(validateStoragePath('%2e%2e/etc/passwd', '/uploads').valid).toBe(false)
    })
  })

  describe('getExtension', () => {
    it('should extract extension correctly', () => {
      expect(getExtension('file.txt')).toBe('txt')
      expect(getExtension('file.tar.gz')).toBe('gz')
      expect(getExtension('FILE.PDF')).toBe('pdf')
    })

    it('should return empty for no extension', () => {
      expect(getExtension('filename')).toBe('')
      expect(getExtension('filename.')).toBe('')
    })

    it('should handle empty input', () => {
      expect(getExtension('')).toBe('')
    })
  })
})
