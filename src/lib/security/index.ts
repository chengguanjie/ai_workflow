/**
 * Security utilities module
 * 
 * This module provides comprehensive security utilities for the application:
 * - XSS prevention and HTML/CSS sanitization
 * - SQL injection prevention through identifier validation
 * - Sensitive data masking for logs and displays
 * - File upload validation and sanitization
 * 
 * @module security
 */

// ============================================================================
// Basic HTML Sanitizer (lightweight)
// ============================================================================
export {
  sanitizeHtml,
  escapeHtml,
  containsXss,
  type SanitizeOptions
} from './sanitizer'

// ============================================================================
// XSS Sanitizer (DOMPurify-based, more comprehensive)
// ============================================================================
export {
  sanitizeHtml as sanitizeHtmlAdvanced,
  sanitizeCss,
  containsDangerousContent,
  escapeHtml as escapeHtmlAdvanced,
  type SanitizeHtmlOptions
} from './xss-sanitizer'

// ============================================================================
// SQL Injection Prevention
// ============================================================================
export {
  validateIdentifier,
  validateTableName,
  validateIndexName,
  getSafeIdentifier,
  getSafeTableName,
  getSafeIndexName,
  isReservedKeyword,
  SQLValidationError,
  SQL_RESERVED_KEYWORDS,
  type ValidationResult
} from './sql-validator'

// ============================================================================
// Sensitive Data Masking
// ============================================================================
export {
  maskApiKey,
  maskPassword,
  maskEmail,
  mask,
  redactSensitiveFields,
  looksLikeSensitiveValue,
  sanitizeLogMessage,
  DEFAULT_SENSITIVE_KEYS
} from './sensitive-masker'

// ============================================================================
// File Upload Validation
// ============================================================================
export {
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
  MIME_TO_EXTENSIONS,
  type FileValidationResult,
  type FileValidationOptions
} from './file-validator'
