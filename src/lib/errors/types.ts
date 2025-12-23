/**
 * Enhanced Error Handling Types
 * 
 * Provides type definitions for the enhanced error handling system,
 * including error causes, solutions, context, and response structures.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Likelihood of an error cause being the actual reason
 */
export type ErrorLikelihood = 'high' | 'medium' | 'low'

/**
 * Type of action for error solutions
 */
export type ErrorActionType = 'manual' | 'automatic' | 'link'

/**
 * Error severity levels
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'database'
  | 'file_system'
  | 'external_service'
  | 'workflow'
  | 'internal'

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * Represents a possible cause for an error
 */
export interface ErrorCause {
  /** Unique identifier for the cause */
  id: string
  /** Human-readable description of the cause */
  description: string
  /** Likelihood of this being the actual cause */
  likelihood: ErrorLikelihood
}

/**
 * Represents a suggested solution for an error
 */
export interface ErrorSolution {
  /** Unique identifier for the solution */
  id: string
  /** Human-readable description of the solution */
  description: string
  /** Type of action required */
  actionType: ErrorActionType
  /** URL for link-type actions */
  actionUrl?: string
  /** Label for the action button */
  actionLabel?: string
}

/**
 * Field-specific error details for validation errors
 */
export interface FieldError {
  /** Name of the field with the error */
  field: string
  /** The invalid value (optional, may be omitted for security) */
  value?: unknown
  /** The constraint that was violated */
  constraint: string
  /** Human-readable error message */
  message: string
}

/**
 * Context information about where and when the error occurred
 */
export interface ErrorContext {
  // User context
  /** ID of the user who encountered the error */
  userId?: string
  /** ID of the organization */
  organizationId?: string

  // Workflow context
  /** ID of the workflow being executed */
  workflowId?: string
  /** ID of the execution instance */
  executionId?: string
  /** ID of the node that caused the error */
  nodeId?: string
  /** Type of the node that caused the error */
  nodeType?: string

  // Request context
  /** API endpoint that was called */
  endpoint?: string
  /** HTTP method used */
  method?: string

  // Validation context
  /** Field-specific errors for validation failures */
  fieldErrors?: FieldError[]

  // Database context
  /** Type of database error */
  dbErrorType?: 'connection' | 'constraint' | 'timeout' | 'query'
  /** Type of constraint violation */
  constraintType?: 'unique' | 'foreign_key' | 'check' | 'not_null'
  /** Field affected by the constraint */
  affectedField?: string

  // External service context
  /** Name of the external service */
  serviceName?: string
  /** Whether the error is temporary */
  isTemporary?: boolean
  /** Suggested retry time in seconds */
  retryAfter?: number

  // File operation context
  /** Type of file error */
  fileErrorType?: 'size' | 'type' | 'permission' | 'not_found' | 'corrupted'
  /** Maximum allowed file size in bytes */
  maxSize?: number
  /** List of allowed file types */
  allowedTypes?: string[]
  /** Actual file size that was rejected */
  actualSize?: number
  /** Actual file type that was rejected */
  actualType?: string
}


// ============================================================================
// Enhanced Error Response
// ============================================================================

/**
 * Enhanced error details with causes and solutions
 */
export interface EnhancedErrorDetails {
  /** Unique error code for identification */
  code: string
  /** Human-readable error message */
  message: string
  /** Array of possible causes for the error */
  causes: ErrorCause[]
  /** Array of suggested solutions */
  solutions: ErrorSolution[]
  /** Context information about the error */
  context?: ErrorContext
  /** Unique request ID for tracking */
  requestId: string
  /** ISO timestamp when the error occurred */
  timestamp: string
  /** Severity level of the error */
  severity: ErrorSeverity
  /** URL to relevant documentation */
  documentationUrl?: string
}

/**
 * Enhanced API error response structure
 * Extends the basic ApiErrorResponse with additional diagnostic information
 */
export interface EnhancedErrorResponse {
  success: false
  error: EnhancedErrorDetails
}

/**
 * Error catalog entry for predefined error types
 */
export interface ErrorCatalogEntry {
  /** Unique error code */
  code: string
  /** Error category for classification */
  category: ErrorCategory
  /** Default error message */
  defaultMessage: string
  /** Predefined possible causes */
  causes: ErrorCause[]
  /** Predefined suggested solutions */
  solutions: ErrorSolution[]
  /** Default severity level */
  severity: ErrorSeverity
  /** URL to documentation */
  documentationUrl?: string
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an object is an ErrorCause
 */
export function isErrorCause(obj: unknown): obj is ErrorCause {
  if (typeof obj !== 'object' || obj === null) return false
  const cause = obj as Record<string, unknown>
  return (
    typeof cause.id === 'string' &&
    typeof cause.description === 'string' &&
    ['high', 'medium', 'low'].includes(cause.likelihood as string)
  )
}

/**
 * Type guard to check if an object is an ErrorSolution
 */
export function isErrorSolution(obj: unknown): obj is ErrorSolution {
  if (typeof obj !== 'object' || obj === null) return false
  const solution = obj as Record<string, unknown>
  return (
    typeof solution.id === 'string' &&
    typeof solution.description === 'string' &&
    ['manual', 'automatic', 'link'].includes(solution.actionType as string)
  )
}

/**
 * Type guard to check if an object is an EnhancedErrorResponse
 */
export function isEnhancedErrorResponse(obj: unknown): obj is EnhancedErrorResponse {
  if (typeof obj !== 'object' || obj === null) return false
  const response = obj as Record<string, unknown>
  if (response.success !== false) return false
  if (typeof response.error !== 'object' || response.error === null) return false
  
  const error = response.error as Record<string, unknown>
  return (
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    Array.isArray(error.causes) &&
    Array.isArray(error.solutions) &&
    typeof error.requestId === 'string' &&
    typeof error.timestamp === 'string' &&
    ['info', 'warning', 'error', 'critical'].includes(error.severity as string)
  )
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates an empty ErrorContext
 */
export function createEmptyContext(): ErrorContext {
  return {}
}

/**
 * Creates a default EnhancedErrorDetails object
 */
export function createDefaultErrorDetails(
  code: string,
  message: string,
  requestId: string
): EnhancedErrorDetails {
  return {
    code,
    message,
    causes: [],
    solutions: [],
    requestId,
    timestamp: new Date().toISOString(),
    severity: 'error',
  }
}
