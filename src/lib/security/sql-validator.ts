/**
 * SQL Identifier Validator Module
 * 
 * Provides validation for SQL identifiers (table names, column names, index names)
 * to prevent SQL injection attacks through dynamic identifier construction.
 * 
 * @module security/sql-validator
 */

/**
 * SQL reserved keywords that cannot be used as identifiers
 * This is a subset of PostgreSQL reserved keywords
 */
export const SQL_RESERVED_KEYWORDS = new Set([
  // PostgreSQL reserved keywords (most common)
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
  'asymmetric', 'authorization', 'binary', 'both', 'case', 'cast',
  'check', 'collate', 'collation', 'column', 'concurrently', 'constraint',
  'create', 'cross', 'current_catalog', 'current_date', 'current_role',
  'current_schema', 'current_time', 'current_timestamp', 'current_user',
  'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
  'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from',
  'full', 'grant', 'group', 'having', 'ilike', 'in', 'initially',
  'inner', 'intersect', 'into', 'is', 'isnull', 'join', 'lateral',
  'leading', 'left', 'like', 'limit', 'localtime', 'localtimestamp',
  'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or',
  'order', 'outer', 'overlaps', 'placing', 'primary', 'references',
  'returning', 'right', 'select', 'session_user', 'similar', 'some',
  'symmetric', 'table', 'tablesample', 'then', 'to', 'trailing', 'true',
  'union', 'unique', 'user', 'using', 'variadic', 'verbose', 'when',
  'where', 'window', 'with',
  // Additional common SQL keywords
  'add', 'alter', 'begin', 'between', 'by', 'cascade', 'commit',
  'database', 'delete', 'drop', 'execute', 'exists', 'explain',
  'function', 'index', 'insert', 'key', 'lock', 'procedure', 'replace',
  'rollback', 'schema', 'set', 'show', 'start', 'transaction', 'trigger',
  'truncate', 'update', 'values', 'view',
])

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * SQL Validation Error
 */
export class SQLValidationError extends Error {
  readonly code = 'INVALID_SQL_IDENTIFIER'
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'SQLValidationError'
  }
}

/**
 * Pattern for valid SQL identifiers:
 * - Must start with a letter (a-z, A-Z) or underscore (_)
 * - Can contain letters, numbers, and underscores
 * - Length: 1-64 characters
 */
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/

/**
 * Validates a SQL identifier against security rules
 * 
 * Rules:
 * - Only alphanumeric characters and underscores allowed
 * - Must start with a letter or underscore
 * - Length must be 1-64 characters
 * - Cannot be a SQL reserved keyword
 * 
 * @param identifier - The identifier to validate
 * @returns ValidationResult with valid status and optional error message
 */
export function validateIdentifier(identifier: string): ValidationResult {
  // Check for null/undefined/empty
  if (!identifier || typeof identifier !== 'string') {
    return {
      valid: false,
      error: 'Identifier must be a non-empty string',
    }
  }

  // Check length
  if (identifier.length === 0) {
    return {
      valid: false,
      error: 'Identifier cannot be empty',
    }
  }

  if (identifier.length > 64) {
    return {
      valid: false,
      error: 'Identifier cannot exceed 64 characters',
    }
  }

  // Check pattern (alphanumeric + underscore, starts with letter or underscore)
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    return {
      valid: false,
      error: 'Identifier must start with a letter or underscore and contain only alphanumeric characters and underscores',
    }
  }

  // Check for SQL reserved keywords (case-insensitive)
  if (SQL_RESERVED_KEYWORDS.has(identifier.toLowerCase())) {
    return {
      valid: false,
      error: `Identifier "${identifier}" is a SQL reserved keyword`,
    }
  }

  return { valid: true }
}

/**
 * Validates a table name
 * 
 * @param tableName - The table name to validate
 * @returns ValidationResult with valid status and optional error message
 */
export function validateTableName(tableName: string): ValidationResult {
  const result = validateIdentifier(tableName)
  if (!result.valid) {
    return {
      valid: false,
      error: `Invalid table name: ${result.error}`,
    }
  }
  return result
}

/**
 * Validates an index name
 * 
 * @param indexName - The index name to validate
 * @returns ValidationResult with valid status and optional error message
 */
export function validateIndexName(indexName: string): ValidationResult {
  const result = validateIdentifier(indexName)
  if (!result.valid) {
    return {
      valid: false,
      error: `Invalid index name: ${result.error}`,
    }
  }
  return result
}

/**
 * Gets a safe identifier, throwing an error if validation fails
 * 
 * @param identifier - The identifier to validate
 * @returns The validated identifier
 * @throws SQLValidationError if validation fails
 */
export function getSafeIdentifier(identifier: string): string {
  const result = validateIdentifier(identifier)
  if (!result.valid) {
    throw new SQLValidationError(result.error || 'Invalid SQL identifier')
  }
  return identifier
}

/**
 * Gets a safe table name, throwing an error if validation fails
 * 
 * @param tableName - The table name to validate
 * @returns The validated table name
 * @throws SQLValidationError if validation fails
 */
export function getSafeTableName(tableName: string): string {
  const result = validateTableName(tableName)
  if (!result.valid) {
    throw new SQLValidationError(result.error || 'Invalid table name')
  }
  return tableName
}

/**
 * Gets a safe index name, throwing an error if validation fails
 * 
 * @param indexName - The index name to validate
 * @returns The validated index name
 * @throws SQLValidationError if validation fails
 */
export function getSafeIndexName(indexName: string): string {
  const result = validateIndexName(indexName)
  if (!result.valid) {
    throw new SQLValidationError(result.error || 'Invalid index name')
  }
  return indexName
}

/**
 * Checks if a string is a SQL reserved keyword
 * 
 * @param word - The word to check
 * @returns true if the word is a reserved keyword
 */
export function isReservedKeyword(word: string): boolean {
  return SQL_RESERVED_KEYWORDS.has(word.toLowerCase())
}
