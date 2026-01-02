/**
 * Property-based tests for Template Permission API
 * 
 * **Feature: permission-system-enhancement**
 * **Property 1: Template Permission CRUD Consistency**
 * **Property 2: Permission Management Authorization**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 * 
 * Property 1: For any template and any valid permission configuration, adding a permission 
 * then querying the permission list should include the added permission with correct 
 * target type, target ID, and permission level.
 * 
 * Property 2: For any user without MANAGER permission on a template, attempting to add, 
 * update, or delete permissions on that template should result in a 403 Forbidden response.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { ResourcePermission, PermissionTargetType } from '@prisma/client'

// Mock auth
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

// Mock prisma
const mockTemplateFindFirst = vi.fn()
const mockTemplateFindUnique = vi.fn()
const mockUserFindFirst = vi.fn()
const mockUserFindUnique = vi.fn()
const mockDepartmentFindFirst = vi.fn()
const mockDepartmentFindUnique = vi.fn()
const mockTemplatePermissionFindFirst = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    workflowTemplate: {
      findFirst: (...args: unknown[]) => mockTemplateFindFirst(...args),
      findUnique: (...args: unknown[]) => mockTemplateFindUnique(...args),
    },
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    department: {
      findFirst: (...args: unknown[]) => mockDepartmentFindFirst(...args),
      findUnique: (...args: unknown[]) => mockDepartmentFindUnique(...args),
    },
    templatePermission: {
      findFirst: (...args: unknown[]) => mockTemplatePermissionFindFirst(...args),
    },
  },
}))

// Mock resource permissions
const mockGetResourcePermissions = vi.fn()
const mockCheckResourcePermission = vi.fn()
const mockCanManagePermission = vi.fn()
const mockSetResourcePermission = vi.fn()
const mockRemoveResourcePermission = vi.fn()

vi.mock('@/lib/permissions/resource', () => ({
  getResourcePermissions: (...args: unknown[]) => mockGetResourcePermissions(...args),
  checkResourcePermission: (...args: unknown[]) => mockCheckResourcePermission(...args),
  canManagePermission: (...args: unknown[]) => mockCanManagePermission(...args),
  setResourcePermission: (...args: unknown[]) => mockSetResourcePermission(...args),
  removeResourcePermission: (...args: unknown[]) => mockRemoveResourcePermission(...args),
}))

// Mock audit log
const mockLogPermissionChange = vi.fn()
vi.mock('@/lib/audit', () => ({
  logPermissionChange: (...args: unknown[]) => mockLogPermissionChange(...args),
}))

// Import after mocks
import { GET, POST, DELETE } from './route'
import { NextRequest } from 'next/server'

// Helper to create mock request
function createMockRequest(method: string, body?: object): NextRequest {
  const url = 'http://localhost:3000/api/templates/test-id/permissions'
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(url, init)
}

// Helper to create route params
function createRouteParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('Property 1: Template Permission CRUD Consistency', () => {
  // Arbitraries for generating test data
  const templateIdArb = fc.uuid()
  const userIdArb = fc.uuid()
  const orgIdArb = fc.uuid()
  const permissionArb = fc.constantFrom<ResourcePermission>('VIEWER', 'EDITOR', 'MANAGER')
  const targetTypeArb = fc.constantFrom<PermissionTargetType>('USER', 'DEPARTMENT', 'ALL')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: GET returns permission list with correct structure
   * 
   * Requirements 1.1: When admin requests permission list, the system should return
   * all permissions with target type, target ID, permission level, and creator info.
   */
  it('should return permission list with correct structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        fc.array(
          fc.record({
            id: fc.uuid(),
            targetType: targetTypeArb,
            targetId: fc.option(fc.uuid(), { nil: null }),
            targetName: fc.string({ minLength: 1, maxLength: 50 }),
            permission: permissionArb,
            // Use integer timestamp to avoid invalid date issues (NaN)
            createdAt: fc.integer({ min: 946684800000, max: 1924905600000 }).map(ts => new Date(ts)),
            createdBy: fc.record({
              id: fc.uuid(),
              name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
            }),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (templateId, userId, orgId, permissions) => {
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: Template exists
          mockTemplateFindFirst.mockResolvedValueOnce({
            id: templateId,
            organizationId: orgId,
            templateType: 'INTERNAL',
          })

          // Setup: Return permissions
          mockGetResourcePermissions.mockResolvedValueOnce(permissions)

          // Setup: User has MANAGER permission
          mockCheckResourcePermission.mockResolvedValueOnce({
            allowed: true,
            permission: 'MANAGER',
          })

          // Execute
          const request = createMockRequest('GET')
          const response = await GET(request, createRouteParams(templateId))
          const data = await response.json()

          // Verify: Response structure is correct
          expect(data.success).toBe(true)
          expect(data.data).toHaveProperty('data')
          expect(data.data).toHaveProperty('currentUserPermission')
          expect(data.data).toHaveProperty('canManage')
          expect(Array.isArray(data.data.data)).toBe(true)

          // Verify: Permissions count matches
          expect(data.data.data.length).toBe(permissions.length)

          // Verify: Each permission has required fields
          for (let i = 0; i < permissions.length; i++) {
            const expected = permissions[i]
            const actual = data.data.data[i]
            expect(actual.id).toBe(expected.id)
            expect(actual.targetType).toBe(expected.targetType)
            expect(actual.targetId).toBe(expected.targetId)
            expect(actual.targetName).toBe(expected.targetName)
            expect(actual.permission).toBe(expected.permission)
            expect(actual.createdBy.id).toBe(expected.createdBy.id)
            expect(actual.createdBy.name).toBe(expected.createdBy.name)
            // Date is serialized to ISO string in JSON
            expect(actual.createdAt).toBe(expected.createdAt.toISOString())
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: POST creates permission and returns success
   * 
   * Requirements 1.2: When admin adds permission, the system should create
   * a new permission record and return success status.
   */
  it('should create permission when user has MANAGER permission', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        permissionArb,
        fc.constantFrom<PermissionTargetType>('USER', 'DEPARTMENT'),
        fc.uuid(),
        async (templateId, userId, orgId, permission, targetType, targetId) => {
          // Clear mocks before each property test iteration
          vi.clearAllMocks()
          
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: User has MANAGER permission
          mockCanManagePermission.mockResolvedValueOnce(true)

          // Setup: Template exists
          mockTemplateFindFirst.mockResolvedValueOnce({
            id: templateId,
            name: 'Test Template',
            organizationId: orgId,
            templateType: 'INTERNAL',
          })

          // Setup: Target exists
          if (targetType === 'USER') {
            mockUserFindFirst.mockResolvedValueOnce({ id: targetId, organizationId: orgId })
            mockUserFindUnique.mockResolvedValueOnce({ id: targetId, name: 'Test User', email: 'test@example.com' })
          } else {
            mockDepartmentFindFirst.mockResolvedValueOnce({ id: targetId, organizationId: orgId })
            mockDepartmentFindUnique.mockResolvedValueOnce({ id: targetId, name: 'Test Department' })
          }

          // Setup: No existing permission
          mockTemplatePermissionFindFirst.mockResolvedValueOnce(null)

          // Setup: Permission set succeeds
          mockSetResourcePermission.mockResolvedValueOnce(undefined)

          // Setup: Audit log succeeds
          mockLogPermissionChange.mockResolvedValueOnce(undefined)

          // Execute
          const request = createMockRequest('POST', { targetType, targetId, permission })
          const response = await POST(request, createRouteParams(templateId))
          const data = await response.json()

          // Verify: Success response
          expect(data.success).toBe(true)
          expect(data.data.success).toBe(true)

          // Verify: setResourcePermission was called with correct args
          expect(mockSetResourcePermission).toHaveBeenCalledWith(
            'TEMPLATE',
            templateId,
            targetType,
            targetId,
            permission,
            userId
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: POST with ALL target type works correctly
   * 
   * Requirements 1.2: Permission can be set for ALL (entire organization).
   */
  it('should create ALL permission correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        permissionArb,
        async (templateId, userId, orgId, permission) => {
          // Clear mocks before each property test iteration
          vi.clearAllMocks()
          
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: User has MANAGER permission
          mockCanManagePermission.mockResolvedValueOnce(true)

          // Setup: Template exists
          mockTemplateFindFirst.mockResolvedValueOnce({
            id: templateId,
            name: 'Test Template',
            organizationId: orgId,
            templateType: 'INTERNAL',
          })

          // Setup: No existing permission
          mockTemplatePermissionFindFirst.mockResolvedValueOnce(null)

          // Setup: Permission set succeeds
          mockSetResourcePermission.mockResolvedValueOnce(undefined)

          // Setup: Audit log succeeds
          mockLogPermissionChange.mockResolvedValueOnce(undefined)

          // Execute
          const request = createMockRequest('POST', { 
            targetType: 'ALL', 
            targetId: null, 
            permission 
          })
          const response = await POST(request, createRouteParams(templateId))
          const data = await response.json()

          // Verify: Success response
          expect(data.success).toBe(true)

          // Verify: setResourcePermission was called with null targetId
          expect(mockSetResourcePermission).toHaveBeenCalledWith(
            'TEMPLATE',
            templateId,
            'ALL',
            null,
            permission,
            userId
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: DELETE removes permission and returns success
   * 
   * Requirements 1.4: When admin deletes permission, the system should
   * remove the specified permission record.
   */
  it('should delete permission when user has MANAGER permission', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        targetTypeArb,
        fc.option(fc.uuid(), { nil: null }),
        async (templateId, userId, orgId, targetType, targetId) => {
          // Clear mocks before each property test iteration
          vi.clearAllMocks()
          
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: User has MANAGER permission
          mockCanManagePermission.mockResolvedValueOnce(true)

          // Setup: Existing permission for audit log
          const effectiveTargetId = targetType === 'ALL' ? null : targetId
          mockTemplatePermissionFindFirst.mockResolvedValueOnce({
            id: 'perm-id',
            permission: 'VIEWER',
            targetType,
            targetId: effectiveTargetId,
          })

          // Setup: Template for audit log
          mockTemplateFindUnique.mockResolvedValueOnce({
            id: templateId,
            name: 'Test Template',
          })

          // Setup: Target name for audit log
          if (targetType === 'USER' && effectiveTargetId) {
            mockUserFindUnique.mockResolvedValueOnce({ id: effectiveTargetId, name: 'Test User', email: 'test@example.com' })
          } else if (targetType === 'DEPARTMENT' && effectiveTargetId) {
            mockDepartmentFindUnique.mockResolvedValueOnce({ id: effectiveTargetId, name: 'Test Department' })
          }

          // Setup: Permission removal succeeds
          mockRemoveResourcePermission.mockResolvedValueOnce(undefined)

          // Setup: Audit log succeeds
          mockLogPermissionChange.mockResolvedValueOnce(undefined)

          // Execute
          const request = createMockRequest('DELETE', { targetType, targetId: effectiveTargetId })
          const response = await DELETE(request, createRouteParams(templateId))
          const data = await response.json()

          // Verify: Success response
          expect(data.success).toBe(true)

          // Verify: removeResourcePermission was called
          expect(mockRemoveResourcePermission).toHaveBeenCalledWith(
            'TEMPLATE',
            templateId,
            targetType,
            effectiveTargetId
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 2: Permission Management Authorization', () => {
  const templateIdArb = fc.uuid()
  const userIdArb = fc.uuid()
  const orgIdArb = fc.uuid()
  const permissionArb = fc.constantFrom<ResourcePermission>('VIEWER', 'EDITOR', 'MANAGER')
  const targetTypeArb = fc.constantFrom<PermissionTargetType>('USER', 'DEPARTMENT', 'ALL')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: POST returns 403 when user lacks MANAGER permission
   * 
   * Requirements 1.5: If user doesn't have MANAGER permission on template,
   * permission management operations should be rejected with 403.
   */
  it('should return 403 when user lacks MANAGER permission for POST', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        permissionArb,
        targetTypeArb,
        async (templateId, userId, orgId, permission, targetType) => {
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: User does NOT have MANAGER permission
          mockCanManagePermission.mockResolvedValueOnce(false)

          // Execute
          const request = createMockRequest('POST', { 
            targetType, 
            targetId: targetType === 'ALL' ? null : 'some-id', 
            permission 
          })
          const response = await POST(request, createRouteParams(templateId))

          // Verify: 403 Forbidden
          expect(response.status).toBe(403)

          // Verify: setResourcePermission was NOT called
          expect(mockSetResourcePermission).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: DELETE returns 403 when user lacks MANAGER permission
   * 
   * Requirements 1.5: If user doesn't have MANAGER permission on template,
   * permission management operations should be rejected with 403.
   */
  it('should return 403 when user lacks MANAGER permission for DELETE', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        targetTypeArb,
        async (templateId, userId, orgId, targetType) => {
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: User does NOT have MANAGER permission
          mockCanManagePermission.mockResolvedValueOnce(false)

          // Execute
          const request = createMockRequest('DELETE', { 
            targetType, 
            targetId: targetType === 'ALL' ? null : 'some-id' 
          })
          const response = await DELETE(request, createRouteParams(templateId))

          // Verify: 403 Forbidden
          expect(response.status).toBe(403)

          // Verify: removeResourcePermission was NOT called
          expect(mockRemoveResourcePermission).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Unauthenticated requests return 401
   * 
   * All permission operations require authentication.
   */
  it('should return 401 for unauthenticated requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        async (templateId) => {
          // Setup: No session
          mockAuth.mockResolvedValueOnce(null)

          // Execute GET
          const getRequest = createMockRequest('GET')
          const getResponse = await GET(getRequest, createRouteParams(templateId))
          expect(getResponse.status).toBe(401)

          // Setup: No session for POST
          mockAuth.mockResolvedValueOnce(null)
          const postRequest = createMockRequest('POST', { 
            targetType: 'ALL', 
            targetId: null, 
            permission: 'VIEWER' 
          })
          const postResponse = await POST(postRequest, createRouteParams(templateId))
          expect(postResponse.status).toBe(401)

          // Setup: No session for DELETE
          mockAuth.mockResolvedValueOnce(null)
          const deleteRequest = createMockRequest('DELETE', { 
            targetType: 'ALL', 
            targetId: null 
          })
          const deleteResponse = await DELETE(deleteRequest, createRouteParams(templateId))
          expect(deleteResponse.status).toBe(401)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Non-INTERNAL templates return 404 for permission management
   * 
   * Only INTERNAL templates support permission management.
   */
  it('should return 404 for non-INTERNAL templates', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        async (templateId, userId, orgId) => {
          // Setup: User is authenticated
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })

          // Setup: Template doesn't exist (or is not INTERNAL)
          mockTemplateFindFirst.mockResolvedValueOnce(null)

          // Execute
          const request = createMockRequest('GET')
          const response = await GET(request, createRouteParams(templateId))

          // Verify: 404 Not Found
          expect(response.status).toBe(404)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Input Validation', () => {
  const templateIdArb = fc.uuid()
  const userIdArb = fc.uuid()
  const orgIdArb = fc.uuid()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: Invalid target type returns 400
   */
  it('should return 400 for invalid target type', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        fc.string().filter(s => !['USER', 'DEPARTMENT', 'ALL'].includes(s)),
        async (templateId, userId, orgId, invalidTargetType) => {
          // Setup: User is authenticated with MANAGER permission
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })
          mockCanManagePermission.mockResolvedValueOnce(true)
          mockTemplateFindFirst.mockResolvedValueOnce({
            id: templateId,
            organizationId: orgId,
            templateType: 'INTERNAL',
          })

          // Execute
          const request = createMockRequest('POST', { 
            targetType: invalidTargetType, 
            targetId: 'some-id', 
            permission: 'VIEWER' 
          })
          const response = await POST(request, createRouteParams(templateId))

          // Verify: 400 Bad Request
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Invalid permission level returns 400
   */
  it('should return 400 for invalid permission level', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        fc.string().filter(s => !['VIEWER', 'EDITOR', 'MANAGER'].includes(s)),
        async (templateId, userId, orgId, invalidPermission) => {
          // Setup: User is authenticated with MANAGER permission
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })
          mockCanManagePermission.mockResolvedValueOnce(true)
          mockTemplateFindFirst.mockResolvedValueOnce({
            id: templateId,
            organizationId: orgId,
            templateType: 'INTERNAL',
          })

          // Execute
          const request = createMockRequest('POST', { 
            targetType: 'USER', 
            targetId: 'some-id', 
            permission: invalidPermission 
          })
          const response = await POST(request, createRouteParams(templateId))

          // Verify: 400 Bad Request
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Missing targetId for USER/DEPARTMENT returns 400
   */
  it('should return 400 when targetId is missing for USER or DEPARTMENT', async () => {
    await fc.assert(
      fc.asyncProperty(
        templateIdArb,
        userIdArb,
        orgIdArb,
        fc.constantFrom<PermissionTargetType>('USER', 'DEPARTMENT'),
        async (templateId, userId, orgId, targetType) => {
          // Setup: User is authenticated with MANAGER permission
          mockAuth.mockResolvedValueOnce({
            user: { id: userId, organizationId: orgId },
          })
          mockCanManagePermission.mockResolvedValueOnce(true)
          mockTemplateFindFirst.mockResolvedValueOnce({
            id: templateId,
            organizationId: orgId,
            templateType: 'INTERNAL',
          })

          // Execute - missing targetId
          const request = createMockRequest('POST', { 
            targetType, 
            targetId: null, 
            permission: 'VIEWER' 
          })
          const response = await POST(request, createRouteParams(templateId))

          // Verify: 400 Bad Request
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })
})
