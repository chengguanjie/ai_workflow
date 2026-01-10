/**
 * File Validator Module
 * 
 * Provides comprehensive file upload validation including extension validation,
 * MIME type validation, size limits, filename sanitization, and path traversal prevention.
 * 
 * @module security/file-validator
 */

import * as path from 'path'

/**
 * File validation result interface
 */
export interface FileValidationResult {
  valid: boolean
  error?: string
}

/**
 * Options for comprehensive file validation
 */
export interface FileValidationOptions {
  /** Set of allowed file extensions (without dot, lowercase) */
  allowedExtensions?: Set<string>
  /** Set of allowed MIME types */
  allowedMimeTypes?: Set<string>
  /** Maximum file size in bytes */
  maxSize?: number
  /** Base directory for storage path validation */
  baseDir?: string
}

/**
 * File Validation Error
 */
export class FileValidationError extends Error {
  readonly code = 'FILE_VALIDATION_FAILED'
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'FileValidationError'
  }
}

/**
 * Default allowed extensions for file uploads
 */
export const DEFAULT_ALLOWED_EXTENSIONS = new Set([
  'txt', 'csv', 'html', 'md', 'json',
  'pdf', 'doc', 'docx', 'xlsx',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'mp3', 'wav', 'ogg',
  'mp4', 'webm',
])

/**
 * Default allowed MIME types for file uploads
 */
export const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/ogg',
])

/**
 * MIME type to extension mapping for validation
 */
export const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'text/html': ['html', 'htm'],
  'text/markdown': ['md', 'markdown'],
  'application/json': ['json'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  // Some clients still use vnd.ms-excel for .xlsx uploads.
  // We only allow .xlsx for security reasons.
  'application/vnd.ms-excel': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/svg+xml': ['svg'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/ogg': ['ogg'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'video/ogg': ['ogv'],
}

/**
 * Default maximum file size (100MB)
 */
export const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024

/**
 * Dangerous filename patterns that indicate path traversal attempts
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,           // Parent directory reference
  /\.\\/,           // Windows parent directory
  /^[/\\]/,         // Absolute path (Unix or Windows)
  /^[a-zA-Z]:/,     // Windows drive letter
  /%2e%2e/i,        // URL encoded ..
  /%2f/i,           // URL encoded /
  /%5c/i,           // URL encoded \
  /\0/,             // Null byte
]

/**
 * Characters that should be removed from filenames
 */
const DANGEROUS_FILENAME_CHARS = /[<>:"|?*\x00-\x1f\x7f]/g

/**
 * Validates a file extension against an allowlist.
 * 
 * @param filename - The filename to validate
 * @param allowedExtensions - Set of allowed extensions (without dot, lowercase)
 * @returns FileValidationResult with valid status and optional error message
 * 
 * @example
 * ```typescript
 * validateExtension('document.pdf', new Set(['pdf', 'doc']))
 * // Returns: { valid: true }
 * 
 * validateExtension('script.exe', new Set(['pdf', 'doc']))
 * // Returns: { valid: false, error: 'File extension "exe" is not allowed' }
 * ```
 */
export function validateExtension(
  filename: string,
  allowedExtensions: Set<string> = DEFAULT_ALLOWED_EXTENSIONS
): FileValidationResult {
  if (!filename || typeof filename !== 'string') {
    return {
      valid: false,
      error: 'Filename must be a non-empty string',
    }
  }

  const ext = getExtension(filename)
  
  if (!ext) {
    return {
      valid: false,
      error: 'File must have an extension',
    }
  }

  if (!allowedExtensions.has(ext)) {
    return {
      valid: false,
      error: `File extension "${ext}" is not allowed`,
    }
  }

  return { valid: true }
}

/**
 * Validates a MIME type against an allowlist and optionally checks
 * if it matches the expected type for the file extension.
 * 
 * @param mimeType - The MIME type to validate
 * @param extension - The file extension (without dot, lowercase)
 * @param allowedMimeTypes - Set of allowed MIME types
 * @returns FileValidationResult with valid status and optional error message
 * 
 * @example
 * ```typescript
 * validateMimeType('application/pdf', 'pdf')
 * // Returns: { valid: true }
 * 
 * validateMimeType('application/pdf', 'jpg')
 * // Returns: { valid: false, error: 'MIME type "application/pdf" does not match extension "jpg"' }
 * ```
 */
export function validateMimeType(
  mimeType: string,
  extension: string,
  allowedMimeTypes: Set<string> = DEFAULT_ALLOWED_MIME_TYPES
): FileValidationResult {
  if (!mimeType || typeof mimeType !== 'string') {
    // If no MIME type provided, we can't validate it
    // This is acceptable as some uploads may not have MIME type
    return { valid: true }
  }

  const normalizedMime = mimeType.toLowerCase().trim()
  
  // Check if MIME type is in allowlist
  if (!allowedMimeTypes.has(normalizedMime)) {
    return {
      valid: false,
      error: `MIME type "${mimeType}" is not allowed`,
    }
  }

  // Check if MIME type matches the extension
  if (extension) {
    const normalizedExt = extension.toLowerCase()
    const expectedExtensions = MIME_TO_EXTENSIONS[normalizedMime]
    
    if (expectedExtensions && !expectedExtensions.includes(normalizedExt)) {
      return {
        valid: false,
        error: `MIME type "${mimeType}" does not match extension "${extension}"`,
      }
    }
  }

  return { valid: true }
}

/**
 * Validates file size against a maximum limit.
 * 
 * @param size - The file size in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @returns FileValidationResult with valid status and optional error message
 * 
 * @example
 * ```typescript
 * validateSize(1024, 10 * 1024 * 1024)
 * // Returns: { valid: true }
 * 
 * validateSize(200 * 1024 * 1024, 100 * 1024 * 1024)
 * // Returns: { valid: false, error: 'File size (200MB) exceeds maximum allowed (100MB)' }
 * ```
 */
export function validateSize(
  size: number,
  maxSize: number = DEFAULT_MAX_FILE_SIZE
): FileValidationResult {
  if (typeof size !== 'number' || size < 0) {
    return {
      valid: false,
      error: 'File size must be a non-negative number',
    }
  }

  if (size > maxSize) {
    const sizeMB = Math.round(size / (1024 * 1024))
    const maxMB = Math.round(maxSize / (1024 * 1024))
    return {
      valid: false,
      error: `File size (${sizeMB}MB) exceeds maximum allowed (${maxMB}MB)`,
    }
  }

  return { valid: true }
}

/**
 * Sanitizes a filename by removing path traversal sequences and dangerous characters.
 * 
 * @param filename - The filename to sanitize
 * @returns Sanitized filename safe for storage
 * 
 * @example
 * ```typescript
 * sanitizeFilename('../../../etc/passwd')
 * // Returns: 'etc_passwd'
 * 
 * sanitizeFilename('my file<script>.txt')
 * // Returns: 'my file_script_.txt'
 * ```
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed'
  }

  let sanitized = filename

  // Normalize Windows backslashes to forward slashes for cross-platform handling
  sanitized = sanitized.replace(/\\/g, '/')

  // Remove Windows drive letters (e.g., C:, D:)
  sanitized = sanitized.replace(/^[a-zA-Z]:/, '')

  // Remove path components - only keep the base filename
  // Use both Unix and Windows path separators
  const lastSlash = Math.max(sanitized.lastIndexOf('/'), sanitized.lastIndexOf('\\'))
  if (lastSlash !== -1) {
    sanitized = sanitized.slice(lastSlash + 1)
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '')

  // Remove path traversal sequences (both Unix and Windows style)
  sanitized = sanitized.replace(/\.\.\//g, '')
  sanitized = sanitized.replace(/\.\.\\/g, '')
  sanitized = sanitized.replace(/\.\./g, '')

  // Remove URL encoded path traversal
  sanitized = sanitized.replace(/%2e%2e/gi, '')
  sanitized = sanitized.replace(/%2f/gi, '_')
  sanitized = sanitized.replace(/%5c/gi, '_')

  // Remove dangerous characters (including backslashes and forward slashes)
  sanitized = sanitized.replace(DANGEROUS_FILENAME_CHARS, '_')
  sanitized = sanitized.replace(/[/\\]/g, '_')

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '')

  // Replace multiple consecutive underscores/spaces with single underscore
  sanitized = sanitized.replace(/[_\s]+/g, '_')

  // If filename is empty after sanitization, use a default
  if (!sanitized || sanitized === '_') {
    return 'unnamed'
  }

  // Limit filename length (255 is common filesystem limit)
  if (sanitized.length > 255) {
    const ext = getExtension(sanitized)
    const nameWithoutExt = sanitized.slice(0, sanitized.lastIndexOf('.'))
    const maxNameLength = 255 - (ext ? ext.length + 1 : 0)
    sanitized = nameWithoutExt.slice(0, maxNameLength) + (ext ? `.${ext}` : '')
  }

  return sanitized
}

/**
 * Validates that a storage path is safely contained within a base directory.
 * Prevents path traversal attacks that could access files outside the upload directory.
 * 
 * @param filePath - The file path to validate
 * @param baseDir - The base directory that should contain the file
 * @returns FileValidationResult with valid status and optional error message
 * 
 * @example
 * ```typescript
 * validateStoragePath('/uploads/user123/file.pdf', '/uploads')
 * // Returns: { valid: true }
 * 
 * validateStoragePath('/uploads/../etc/passwd', '/uploads')
 * // Returns: { valid: false, error: 'Path traversal detected' }
 * ```
 */
export function validateStoragePath(
  filePath: string,
  baseDir: string
): FileValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return {
      valid: false,
      error: 'File path must be a non-empty string',
    }
  }

  if (!baseDir || typeof baseDir !== 'string') {
    return {
      valid: false,
      error: 'Base directory must be a non-empty string',
    }
  }

  // Check for obvious path traversal patterns in the raw path
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(filePath)) {
      return {
        valid: false,
        error: 'Path traversal detected',
      }
    }
  }

  // Resolve both paths to absolute paths
  const resolvedPath = path.resolve(baseDir, filePath)
  const resolvedBase = path.resolve(baseDir)

  // Ensure the resolved path starts with the base directory
  // Add path separator to prevent matching partial directory names
  // e.g., /uploads-backup should not match /uploads
  const normalizedPath = resolvedPath + path.sep
  const normalizedBase = resolvedBase + path.sep

  if (!normalizedPath.startsWith(normalizedBase)) {
    return {
      valid: false,
      error: 'Path traversal detected: file path escapes base directory',
    }
  }

  return { valid: true }
}

/**
 * Checks if a filename contains path traversal sequences.
 * 
 * @param filename - The filename to check
 * @returns true if path traversal is detected
 */
export function containsPathTraversal(filename: string): boolean {
  if (!filename || typeof filename !== 'string') {
    return false
  }

  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(filename)) {
      return true
    }
  }

  return false
}

/**
 * Comprehensive file validation that checks extension, MIME type, size, and filename safety.
 * 
 * @param file - Object containing file information
 * @param options - Validation options
 * @returns FileValidationResult with valid status and optional error message
 * 
 * @example
 * ```typescript
 * validateFile(
 *   { name: 'document.pdf', type: 'application/pdf', size: 1024 },
 *   { maxSize: 10 * 1024 * 1024 }
 * )
 * // Returns: { valid: true }
 * ```
 */
export function validateFile(
  file: { name: string; type?: string; size: number },
  options: FileValidationOptions = {}
): FileValidationResult {
  const {
    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
    allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES,
    maxSize = DEFAULT_MAX_FILE_SIZE,
  } = options

  // Check for path traversal in filename
  if (containsPathTraversal(file.name)) {
    return {
      valid: false,
      error: 'Filename contains path traversal sequences',
    }
  }

  // Validate extension
  const extResult = validateExtension(file.name, allowedExtensions)
  if (!extResult.valid) {
    return extResult
  }

  // Validate MIME type if provided
  if (file.type) {
    const ext = getExtension(file.name)
    const mimeResult = validateMimeType(file.type, ext, allowedMimeTypes)
    if (!mimeResult.valid) {
      return mimeResult
    }
  }

  // Validate size
  const sizeResult = validateSize(file.size, maxSize)
  if (!sizeResult.valid) {
    return sizeResult
  }

  return { valid: true }
}

/**
 * Gets a safe file for storage, throwing an error if validation fails.
 * Returns the sanitized filename.
 * 
 * @param file - Object containing file information
 * @param options - Validation options
 * @returns Sanitized filename
 * @throws FileValidationError if validation fails
 */
export function getSafeFile(
  file: { name: string; type?: string; size: number },
  options: FileValidationOptions = {}
): string {
  const result = validateFile(file, options)
  if (!result.valid) {
    throw new FileValidationError(result.error || 'File validation failed')
  }
  return sanitizeFilename(file.name)
}

/**
 * Extracts the extension from a filename (lowercase, without dot).
 * 
 * @param filename - The filename to extract extension from
 * @returns The extension in lowercase, or empty string if none
 */
export function getExtension(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return ''
  }
  
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return ''
  }
  
  return filename.slice(lastDot + 1).toLowerCase()
}
