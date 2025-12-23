import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  EnhancedAppError,
  DatabaseError,
  ExternalServiceError,
  FileOperationError,
  WorkflowExecutionError,
  CATEGORY_STATUS_MAP,
  getStatusCodeForCategory,
  DbErrorType,
  FileErrorType,
} from './enhanced-errors'
import { ErrorCategory, ErrorSeverity } from './types'

// ============================================================================
// Arbitraries for generating test data
// ============================================================================

const messageArb = fc.string({ minLength: 1, maxLength: 200 })
const nodeIdArb = fc.uuid()
const executionIdArb = fc.uuid()
const workflowIdArb = fc.uuid()
const nodeTypeArb = fc.constantFrom('http', 'code', 'ai', 'transform', 'condition', 'loop')
const serviceNameArb = fc.constantFrom('OpenAI', 'Stripe', 'SendGrid', 'AWS', 'Google')
const fieldNameArb = fc.string({ minLength: 1, maxLength: 50 })
const dbErrorTypeArb = fc.constantFrom<DbErrorType>('connection', 'constraint', 'timeout', 'query')
const fileErrorTypeArb = fc.constantFrom<FileErrorType>('size', 'type', 'permission', 'not_found', 'corrupted')
const fileSizeArb = fc.integer({ min: 1, max: 100 * 1024 * 1024 }) // 1 byte to 100MB
const fileTypesArb = fc.array(fc.constantFrom('.pdf', '.doc', '.txt', '.jpg', '.png'), { minLength: 1, maxLength: 5 })

// ============================================================================
// Property 3: HTTP Status Code Mapping
// **Validates: Requirements 3.2**
// ============================================================================

describe('Property 3: HTTP Status Code Mapping', () => {
  /**
   * For any error type, the HTTP status code returned SHALL match the expected 
   * status code for that error category (e.g., validation errors → 400, 
   * auth errors → 401/403, not found → 404, internal → 500).
   */

  it('DatabaseError should return 500 status code for database category', () => {
    fc.assert(
      fc.property(
        messageArb,
        dbErrorTypeArb,
        (message, dbErrorType) => {
          const error = new DatabaseError(message, { dbErrorType })
          
          expect(error.statusCode).toBe(500)
          expect(error.category).toBe('database')
          expect(CATEGORY_STATUS_MAP['database']).toBe(500)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ExternalServiceError should return 502 status code for external_service category', () => {
    fc.assert(
      fc.property(
        messageArb,
        serviceNameArb,
        (message, serviceName) => {
          const error = new ExternalServiceError(message, { serviceName })
          
          expect(error.statusCode).toBe(502)
          expect(error.category).toBe('external_service')
          expect(CATEGORY_STATUS_MAP['external_service']).toBe(502)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError should return 400 status code for file_system category', () => {
    fc.assert(
      fc.property(
        messageArb,
        fileErrorTypeArb,
        (message, fileErrorType) => {
          const error = new FileOperationError(message, { fileErrorType })
          
          expect(error.statusCode).toBe(400)
          expect(error.category).toBe('file_system')
          expect(CATEGORY_STATUS_MAP['file_system']).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('WorkflowExecutionError should return 500 status code for workflow category', () => {
    fc.assert(
      fc.property(
        messageArb,
        nodeIdArb,
        nodeTypeArb,
        executionIdArb,
        (message, nodeId, nodeType, executionId) => {
          const error = new WorkflowExecutionError(message, { nodeId, nodeType, executionId })
          
          expect(error.statusCode).toBe(500)
          expect(error.category).toBe('workflow')
          expect(CATEGORY_STATUS_MAP['workflow']).toBe(500)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getStatusCodeForCategory should return correct status for all categories', () => {
    const categoryStatusPairs: Array<[ErrorCategory, number]> = [
      ['validation', 400],
      ['authentication', 401],
      ['authorization', 403],
      ['network', 503],
      ['database', 500],
      ['file_system', 400],
      ['external_service', 502],
      ['workflow', 500],
      ['internal', 500],
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...categoryStatusPairs),
        ([category, expectedStatus]) => {
          expect(getStatusCodeForCategory(category)).toBe(expectedStatus)
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ============================================================================
// Property 5: Workflow Error Context
// **Validates: Requirements 5.1, 5.2**
// ============================================================================

describe('Property 5: Workflow Error Context', () => {
  /**
   * For any workflow execution error, the error response context SHALL include 
   * nodeId, nodeType, and executionId fields with non-empty values.
   */

  it('WorkflowExecutionError should always include nodeId, nodeType, and executionId in context', () => {
    fc.assert(
      fc.property(
        messageArb,
        nodeIdArb,
        nodeTypeArb,
        executionIdArb,
        (message, nodeId, nodeType, executionId) => {
          const error = new WorkflowExecutionError(message, { nodeId, nodeType, executionId })
          
          // Check direct properties
          expect(error.nodeId).toBe(nodeId)
          expect(error.nodeType).toBe(nodeType)
          expect(error.executionId).toBe(executionId)
          
          // Check context
          expect(error.context).toBeDefined()
          expect(error.context?.nodeId).toBe(nodeId)
          expect(error.context?.nodeType).toBe(nodeType)
          expect(error.context?.executionId).toBe(executionId)
          
          // Verify non-empty
          expect(error.nodeId.length).toBeGreaterThan(0)
          expect(error.nodeType.length).toBeGreaterThan(0)
          expect(error.executionId.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('WorkflowExecutionError.configurationError should include all required context', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeTypeArb,
        executionIdArb,
        workflowIdArb,
        (nodeId, nodeType, executionId, workflowId) => {
          const error = WorkflowExecutionError.configurationError(
            nodeId, nodeType, executionId, undefined, workflowId
          )
          
          expect(error.context?.nodeId).toBe(nodeId)
          expect(error.context?.nodeType).toBe(nodeType)
          expect(error.context?.executionId).toBe(executionId)
          expect(error.context?.workflowId).toBe(workflowId)
          
          // Should have causes and solutions
          expect(error.causes.length).toBeGreaterThan(0)
          expect(error.solutions.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('WorkflowExecutionError.inputError should include inputField in context', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeTypeArb,
        executionIdArb,
        fieldNameArb,
        (nodeId, nodeType, executionId, inputField) => {
          const error = WorkflowExecutionError.inputError(
            nodeId, nodeType, executionId, inputField
          )
          
          expect(error.inputField).toBe(inputField)
          expect(error.context?.nodeId).toBe(nodeId)
          expect(error.context?.nodeType).toBe(nodeType)
          expect(error.context?.executionId).toBe(executionId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('toEnhancedJSON should include workflow context in response', () => {
    fc.assert(
      fc.property(
        messageArb,
        nodeIdArb,
        nodeTypeArb,
        executionIdArb,
        (message, nodeId, nodeType, executionId) => {
          const error = new WorkflowExecutionError(message, { nodeId, nodeType, executionId })
          const response = error.toEnhancedJSON('test-request-id')
          
          expect(response.success).toBe(false)
          expect(response.error.context?.nodeId).toBe(nodeId)
          expect(response.error.context?.nodeType).toBe(nodeType)
          expect(response.error.context?.executionId).toBe(executionId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 6: Database Error Type Identification
// **Validates: Requirements 6.1**
// ============================================================================

describe('Property 6: Database Error Type Identification', () => {
  /**
   * For any database error, the error response SHALL correctly identify the 
   * error type (connection, constraint, timeout, query) based on the underlying 
   * database error.
   */

  it('DatabaseError should correctly identify error type', () => {
    fc.assert(
      fc.property(
        messageArb,
        dbErrorTypeArb,
        (message, dbErrorType) => {
          const error = new DatabaseError(message, { dbErrorType })
          
          expect(error.dbErrorType).toBe(dbErrorType)
          expect(error.context?.dbErrorType).toBe(dbErrorType)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('DatabaseError.connection should create connection type error', () => {
    fc.assert(
      fc.property(
        messageArb,
        (message) => {
          const error = DatabaseError.connection(message)
          
          expect(error.dbErrorType).toBe('connection')
          expect(error.context?.dbErrorType).toBe('connection')
          expect(error.severity).toBe('critical') // Connection errors are critical
        }
      ),
      { numRuns: 100 }
    )
  })

  it('DatabaseError.uniqueConstraint should create constraint type with unique subtype', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        (field) => {
          const error = DatabaseError.uniqueConstraint(field)
          
          expect(error.dbErrorType).toBe('constraint')
          expect(error.constraintType).toBe('unique')
          expect(error.affectedField).toBe(field)
          expect(error.context?.constraintType).toBe('unique')
          expect(error.context?.affectedField).toBe(field)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('DatabaseError.foreignKeyConstraint should create constraint type with foreign_key subtype', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        (field) => {
          const error = DatabaseError.foreignKeyConstraint(field)
          
          expect(error.dbErrorType).toBe('constraint')
          expect(error.constraintType).toBe('foreign_key')
          expect(error.affectedField).toBe(field)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('DatabaseError.timeout should create timeout type error', () => {
    fc.assert(
      fc.property(
        messageArb,
        (message) => {
          const error = DatabaseError.timeout(message)
          
          expect(error.dbErrorType).toBe('timeout')
          expect(error.context?.dbErrorType).toBe('timeout')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('DatabaseError.query should create query type error', () => {
    fc.assert(
      fc.property(
        messageArb,
        (message) => {
          const error = DatabaseError.query(message)
          
          expect(error.dbErrorType).toBe('query')
          expect(error.context?.dbErrorType).toBe('query')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 7: External Service Error Handling
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
// ============================================================================

describe('Property 7: External Service Error Handling', () => {
  /**
   * For any external service error, the error response SHALL include serviceName 
   * (non-empty), isTemporary (boolean), and if isTemporary is true, SHALL include 
   * retryAfter suggestion.
   */

  it('ExternalServiceError should always include serviceName', () => {
    fc.assert(
      fc.property(
        messageArb,
        serviceNameArb,
        (message, serviceName) => {
          const error = new ExternalServiceError(message, { serviceName })
          
          expect(error.serviceName).toBe(serviceName)
          expect(error.serviceName.length).toBeGreaterThan(0)
          expect(error.context?.serviceName).toBe(serviceName)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ExternalServiceError should always include isTemporary boolean', () => {
    fc.assert(
      fc.property(
        messageArb,
        serviceNameArb,
        fc.boolean(),
        (message, serviceName, isTemporary) => {
          const error = new ExternalServiceError(message, { serviceName, isTemporary })
          
          expect(typeof error.isTemporary).toBe('boolean')
          expect(error.isTemporary).toBe(isTemporary)
          expect(error.context?.isTemporary).toBe(isTemporary)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ExternalServiceError.temporary should include retryAfter', () => {
    fc.assert(
      fc.property(
        serviceNameArb,
        fc.integer({ min: 1, max: 3600 }),
        (serviceName, retryAfter) => {
          const error = ExternalServiceError.temporary(serviceName, retryAfter)
          
          expect(error.isTemporary).toBe(true)
          expect(error.retryAfter).toBe(retryAfter)
          expect(error.context?.retryAfter).toBe(retryAfter)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ExternalServiceError.permanent should not include retryAfter', () => {
    fc.assert(
      fc.property(
        serviceNameArb,
        (serviceName) => {
          const error = ExternalServiceError.permanent(serviceName)
          
          expect(error.isTemporary).toBe(false)
          expect(error.retryAfter).toBeUndefined()
          expect(error.severity).toBe('critical')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ExternalServiceError.apiError should set isTemporary based on status code', () => {
    // 5xx and 429 should be temporary
    const temporaryStatusCodes = [500, 502, 503, 504, 429]
    // 4xx (except 429) should be permanent
    const permanentStatusCodes = [400, 401, 403, 404, 422]

    fc.assert(
      fc.property(
        serviceNameArb,
        fc.constantFrom(...temporaryStatusCodes),
        (serviceName, statusCode) => {
          const error = ExternalServiceError.apiError(serviceName, statusCode)
          
          expect(error.isTemporary).toBe(true)
          expect(error.retryAfter).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )

    fc.assert(
      fc.property(
        serviceNameArb,
        fc.constantFrom(...permanentStatusCodes),
        (serviceName, statusCode) => {
          const error = ExternalServiceError.apiError(serviceName, statusCode)
          
          expect(error.isTemporary).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 8: File Error Details
// **Validates: Requirements 8.1, 8.2, 8.3**
// ============================================================================

describe('Property 8: File Error Details', () => {
  /**
   * For any file operation error, the error response SHALL include the specific 
   * error type and relevant limits (maxSize for size errors, allowedTypes for 
   * type errors).
   */

  it('FileOperationError should always include fileErrorType', () => {
    fc.assert(
      fc.property(
        messageArb,
        fileErrorTypeArb,
        (message, fileErrorType) => {
          const error = new FileOperationError(message, { fileErrorType })
          
          expect(error.fileErrorType).toBe(fileErrorType)
          expect(error.context?.fileErrorType).toBe(fileErrorType)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.sizeExceeded should include maxSize', () => {
    fc.assert(
      fc.property(
        fileSizeArb,
        (maxSize) => {
          const error = FileOperationError.sizeExceeded(maxSize)
          
          expect(error.fileErrorType).toBe('size')
          expect(error.maxSize).toBe(maxSize)
          expect(error.context?.maxSize).toBe(maxSize)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.sizeExceeded should include actualSize when provided', () => {
    fc.assert(
      fc.property(
        fileSizeArb,
        fileSizeArb,
        (maxSize, actualSize) => {
          const error = FileOperationError.sizeExceeded(maxSize, actualSize)
          
          expect(error.maxSize).toBe(maxSize)
          expect(error.actualSize).toBe(actualSize)
          expect(error.context?.actualSize).toBe(actualSize)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.invalidType should include allowedTypes', () => {
    fc.assert(
      fc.property(
        fileTypesArb,
        (allowedTypes) => {
          const error = FileOperationError.invalidType(allowedTypes)
          
          expect(error.fileErrorType).toBe('type')
          expect(error.allowedTypes).toEqual(allowedTypes)
          expect(error.context?.allowedTypes).toEqual(allowedTypes)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.invalidType should include actualType when provided', () => {
    fc.assert(
      fc.property(
        fileTypesArb,
        fc.constantFrom('.exe', '.bat', '.sh', '.dll'),
        (allowedTypes, actualType) => {
          const error = FileOperationError.invalidType(allowedTypes, actualType)
          
          expect(error.allowedTypes).toEqual(allowedTypes)
          expect(error.actualType).toBe(actualType)
          expect(error.context?.actualType).toBe(actualType)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.notFound should have not_found type', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        (filename) => {
          const error = FileOperationError.notFound(filename ?? undefined)
          
          expect(error.fileErrorType).toBe('not_found')
          expect(error.context?.fileErrorType).toBe('not_found')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.permissionDenied should have permission type', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        (filename) => {
          const error = FileOperationError.permissionDenied(filename ?? undefined)
          
          expect(error.fileErrorType).toBe('permission')
          expect(error.context?.fileErrorType).toBe('permission')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('FileOperationError.corrupted should have corrupted type', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        (filename) => {
          const error = FileOperationError.corrupted(filename ?? undefined)
          
          expect(error.fileErrorType).toBe('corrupted')
          expect(error.context?.fileErrorType).toBe('corrupted')
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Additional Tests: toEnhancedJSON Response Structure
// ============================================================================

describe('toEnhancedJSON Response Structure', () => {
  it('should always return success: false', () => {
    fc.assert(
      fc.property(
        messageArb,
        dbErrorTypeArb,
        (message, dbErrorType) => {
          const error = new DatabaseError(message, { dbErrorType })
          const response = error.toEnhancedJSON()
          
          expect(response.success).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include requestId and timestamp', () => {
    fc.assert(
      fc.property(
        messageArb,
        serviceNameArb,
        fc.uuid(),
        (message, serviceName, requestId) => {
          const error = new ExternalServiceError(message, { serviceName })
          const response = error.toEnhancedJSON(requestId)
          
          expect(response.error.requestId).toBe(requestId)
          expect(response.error.timestamp).toBeDefined()
          // Verify timestamp is valid ISO string
          expect(() => new Date(response.error.timestamp)).not.toThrow()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should include causes and solutions arrays', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeTypeArb,
        executionIdArb,
        (nodeId, nodeType, executionId) => {
          const error = WorkflowExecutionError.configurationError(nodeId, nodeType, executionId)
          const response = error.toEnhancedJSON()
          
          expect(Array.isArray(response.error.causes)).toBe(true)
          expect(Array.isArray(response.error.solutions)).toBe(true)
          expect(response.error.causes.length).toBeGreaterThan(0)
          expect(response.error.solutions.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})
