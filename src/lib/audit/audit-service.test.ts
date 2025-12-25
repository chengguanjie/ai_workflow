/**
 * Property-based tests for Audit Log Service
 * 
 * **Feature: permission-system-enhancement, Property 9: Audit Log Completeness**
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 * 
 * For any permission, department, API token, or organization status change operation,
 * an audit log entry should be created containing operator ID, timestamp, event type,
 * target resource, and change details.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import {
  AuditService,
  AuditEventType,
  AuditLogEntry,
  PermissionChangeDetails,
  DepartmentChangeDetails,
  ApiTokenChangeDetails,
  OrganizationStatusChangeDetails,
} from './audit-service'

// Mock prisma
const mockCreate = vi.fn().mockResolvedValue({ id: 'test-id' })
const mockCreateMany = vi.fn().mockResolvedValue({ count: 1 })

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => mockCreate(...args),
      createMany: (...args: unknown[]) => mockCreateMany(...args),
    },
  },
}))

describe('Property 9: Audit Log Completeness', () => {
  let auditService: AuditService

  beforeEach(() => {
    auditService = new AuditService()
    mockCreate.mockClear()
    mockCreateMany.mockClear()
  })

  // Arbitraries for generating test data
  const userIdArb = fc.uuid()
  const organizationIdArb = fc.uuid()
  const resourceIdArb = fc.uuid()
  const resourceNameArb = fc.string({ minLength: 1, maxLength: 50 })
  
  const permissionLevelArb = fc.constantFrom('VIEWER', 'EDITOR', 'MANAGER')
  const targetTypeArb = fc.constantFrom('USER', 'DEPARTMENT', 'ALL')
  const resourceTypeArb = fc.constantFrom('WORKFLOW', 'KNOWLEDGE_BASE', 'TEMPLATE')
  const permissionActionArb = fc.constantFrom('added', 'updated', 'removed')
  const departmentActionArb = fc.constantFrom('created', 'updated', 'deleted')
  const tokenActionArb = fc.constantFrom('created', 'revoked')
  const orgStatusArb = fc.constantFrom('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED')

  /**
   * Property: Permission change logs contain all required fields
   * 
   * For any permission change operation, the audit log entry should contain:
   * - operatorId (who made the change)
   * - eventType (permission.added, permission.updated, or permission.removed)
   * - targetResource (WORKFLOW, KNOWLEDGE_BASE, or TEMPLATE)
   * - targetResourceId
   * - changes (old and new permission values)
   */
  it('should create complete audit log for permission changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        organizationIdArb,
        permissionActionArb,
        resourceTypeArb,
        resourceIdArb,
        resourceNameArb,
        targetTypeArb,
        fc.option(userIdArb),
        fc.option(permissionLevelArb),
        permissionLevelArb,
        async (
          operatorId,
          organizationId,
          action,
          resourceType,
          resourceId,
          resourceName,
          targetType,
          targetId,
          oldPermission,
          newPermission
        ) => {
          mockCreate.mockClear()
          
          const details: PermissionChangeDetails = {
            resourceType: resourceType as 'WORKFLOW' | 'KNOWLEDGE_BASE' | 'TEMPLATE',
            resourceId,
            resourceName,
            targetType: targetType as 'USER' | 'DEPARTMENT' | 'ALL',
            targetId: targetId ?? null,
            oldPermission: action === 'added' ? null : oldPermission,
            newPermission: action === 'removed' ? null : newPermission,
          }

          await auditService.logPermissionChange(
            operatorId,
            organizationId,
            action as 'added' | 'updated' | 'removed',
            details
          )

          // Verify prisma.auditLog.create was called
          expect(mockCreate).toHaveBeenCalledTimes(1)
          
          // Get the call arguments
          const callArgs = mockCreate.mock.calls[0][0]
          const data = callArgs.data

          // Verify required fields are present
          expect(data.action).toBe(`permission.${action}`)
          expect(data.resource).toBe(resourceType)
          expect(data.resourceId).toBe(resourceId)
          expect(data.userId).toBe(operatorId)
          expect(data.organizationId).toBe(organizationId)
          
          // Verify detail contains changes
          const detail = data.detail as Record<string, unknown>
          expect(detail).toHaveProperty('changes')
          const changes = detail.changes as Record<string, { old: unknown; new: unknown }>
          expect(changes).toHaveProperty('permission')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Department change logs contain all required fields
   */
  it('should create complete audit log for department changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        organizationIdArb,
        departmentActionArb,
        resourceIdArb,
        resourceNameArb,
        fc.option(resourceIdArb),
        fc.option(resourceNameArb),
        async (
          operatorId,
          organizationId,
          action,
          departmentId,
          departmentName,
          parentId,
          parentName
        ) => {
          mockCreate.mockClear()
          
          const details: DepartmentChangeDetails = {
            departmentId,
            departmentName,
            parentId: parentId ?? null,
            parentName: parentName ?? undefined,
            changes: action === 'updated' ? {
              name: { old: 'Old Name', new: departmentName },
            } : undefined,
          }

          await auditService.logDepartmentChange(
            operatorId,
            organizationId,
            action as 'created' | 'updated' | 'deleted',
            details
          )

          expect(mockCreate).toHaveBeenCalledTimes(1)
          
          const callArgs = mockCreate.mock.calls[0][0]
          const data = callArgs.data

          // Verify required fields
          expect(data.action).toBe(`department.${action}`)
          expect(data.resource).toBe('DEPARTMENT')
          expect(data.resourceId).toBe(departmentId)
          expect(data.userId).toBe(operatorId)
          expect(data.organizationId).toBe(organizationId)
          
          // Verify detail contains changes
          const detail = data.detail as Record<string, unknown>
          expect(detail).toHaveProperty('changes')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: API Token change logs contain all required fields
   */
  it('should create complete audit log for API token changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        organizationIdArb,
        tokenActionArb,
        resourceIdArb,
        resourceNameArb,
        fc.string({ minLength: 3, maxLength: 10 }),
        fc.array(fc.constantFrom('workflow:execute', 'workflow:read'), { minLength: 0, maxLength: 3 }),
        fc.option(fc.date()),
        async (
          operatorId,
          organizationId,
          action,
          tokenId,
          tokenName,
          tokenPrefix,
          scopes,
          expiresAt
        ) => {
          mockCreate.mockClear()
          
          const details: ApiTokenChangeDetails = {
            tokenId,
            tokenName,
            tokenPrefix,
            scopes,
            expiresAt: expiresAt ?? null,
          }

          await auditService.logApiTokenChange(
            operatorId,
            organizationId,
            action as 'created' | 'revoked',
            details
          )

          expect(mockCreate).toHaveBeenCalledTimes(1)
          
          const callArgs = mockCreate.mock.calls[0][0]
          const data = callArgs.data

          // Verify required fields
          const expectedEventType = action === 'created' ? 'api_token.created' : 'api_token.revoked'
          expect(data.action).toBe(expectedEventType)
          expect(data.resource).toBe('API_TOKEN')
          expect(data.resourceId).toBe(tokenId)
          expect(data.userId).toBe(operatorId)
          expect(data.organizationId).toBe(organizationId)
          
          // Verify detail contains changes and metadata
          const detail = data.detail as Record<string, unknown>
          expect(detail).toHaveProperty('changes')
          expect(detail).toHaveProperty('metadata')
          const metadata = detail.metadata as Record<string, unknown>
          expect(metadata.tokenName).toBe(tokenName)
          expect(metadata.tokenPrefix).toBe(tokenPrefix)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Organization status change logs contain all required fields
   */
  it('should create complete audit log for organization status changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        organizationIdArb,
        resourceNameArb,
        orgStatusArb,
        orgStatusArb,
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        async (
          operatorId,
          organizationId,
          organizationName,
          oldStatus,
          newStatus,
          reason
        ) => {
          mockCreate.mockClear()
          
          const details: OrganizationStatusChangeDetails = {
            organizationId,
            organizationName,
            oldStatus,
            newStatus,
            reason: reason ?? undefined,
          }

          await auditService.logOrganizationStatusChange(operatorId, details)

          expect(mockCreate).toHaveBeenCalledTimes(1)
          
          const callArgs = mockCreate.mock.calls[0][0]
          const data = callArgs.data

          // Verify required fields
          expect(data.action).toBe('organization.status_changed')
          expect(data.resource).toBe('ORGANIZATION')
          expect(data.resourceId).toBe(organizationId)
          expect(data.userId).toBe(operatorId)
          expect(data.organizationId).toBe(organizationId)
          
          // Verify detail contains changes with old and new status
          const detail = data.detail as Record<string, unknown>
          expect(detail).toHaveProperty('changes')
          const changes = detail.changes as Record<string, { old: unknown; new: unknown }>
          expect(changes.status.old).toBe(oldStatus)
          expect(changes.status.new).toBe(newStatus)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Batch logging creates entries for all items
   */
  it('should create all entries in batch logging', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            eventType: fc.constantFrom(
              'permission.added',
              'permission.updated',
              'permission.removed',
              'department.created',
              'department.updated',
              'department.deleted',
              'api_token.created',
              'api_token.revoked',
              'organization.status_changed'
            ) as fc.Arbitrary<AuditEventType>,
            operatorId: userIdArb,
            targetResource: fc.constantFrom('WORKFLOW', 'KNOWLEDGE_BASE', 'TEMPLATE', 'DEPARTMENT', 'API_TOKEN', 'ORGANIZATION'),
            targetResourceId: resourceIdArb,
            changes: fc.constant({ field: { old: 'old', new: 'new' } }),
            organizationId: organizationIdArb,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (entries) => {
          mockCreateMany.mockClear()
          
          const auditEntries: AuditLogEntry[] = entries.map(e => ({
            ...e,
            changes: e.changes as Record<string, { old: unknown; new: unknown }>,
          }))

          await auditService.logBatch(auditEntries)

          expect(mockCreateMany).toHaveBeenCalledTimes(1)
          
          const callArgs = mockCreateMany.mock.calls[0][0]
          expect(callArgs.data).toHaveLength(entries.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Empty batch does not call database
   */
  it('should not call database for empty batch', async () => {
    mockCreateMany.mockClear()
    await auditService.logBatch([])
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  /**
   * Property: Audit log entries preserve all metadata
   */
  it('should preserve metadata in audit log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        organizationIdArb,
        fc.constantFrom(
          'permission.added',
          'department.created',
          'api_token.created'
        ) as fc.Arbitrary<AuditEventType>,
        resourceIdArb,
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
        async (operatorId, organizationId, eventType, resourceId, metadata) => {
          mockCreate.mockClear()
          
          const entry: AuditLogEntry = {
            eventType,
            operatorId,
            targetResource: 'TEST',
            targetResourceId: resourceId,
            changes: { test: { old: null, new: 'value' } },
            metadata,
            organizationId,
          }

          await auditService.log(entry)

          expect(mockCreate).toHaveBeenCalledTimes(1)
          
          const callArgs = mockCreate.mock.calls[0][0]
          const detail = callArgs.data.detail as Record<string, unknown>
          expect(detail.metadata).toEqual(metadata)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Optional fields (ipAddress, userAgent) are preserved when provided
   */
  it('should preserve optional fields when provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        organizationIdArb,
        fc.option(fc.ipV4()),
        fc.option(fc.string({ minLength: 10, maxLength: 100 })),
        async (operatorId, organizationId, ipAddress, userAgent) => {
          mockCreate.mockClear()
          
          const entry: AuditLogEntry = {
            eventType: 'permission.added',
            operatorId,
            targetResource: 'TEST',
            targetResourceId: 'test-id',
            changes: { test: { old: null, new: 'value' } },
            organizationId,
            ipAddress: ipAddress ?? undefined,
            userAgent: userAgent ?? undefined,
          }

          await auditService.log(entry)

          expect(mockCreate).toHaveBeenCalledTimes(1)
          
          const callArgs = mockCreate.mock.calls[0][0]
          const data = callArgs.data
          
          if (ipAddress) {
            expect(data.ip).toBe(ipAddress)
          }
          if (userAgent) {
            expect(data.userAgent).toBe(userAgent)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
