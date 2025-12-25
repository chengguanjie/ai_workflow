/**
 * Property-based tests for Knowledge Base Permission Cache
 * 
 * **Feature: permission-system-enhancement**
 * **Property 3: Knowledge Base Permission Cache Behavior**
 * **Property 4: Cache Invalidation on Permission Change**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * 
 * Property 3: For any knowledge base permission query, if the cache contains 
 * the permission data, the result should match the cached value without database 
 * query; if the cache is empty, the result should be stored in cache after database query.
 * 
 * Property 4: For any knowledge base permission modification (add, update, delete), 
 * all related permission cache entries for that knowledge base should be invalidated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { ResourcePermission } from '@prisma/client'

// Mock Redis
const mockRedisGet = vi.fn()
const mockRedisSetex = vi.fn()
const mockRedisScan = vi.fn()
const mockRedisDel = vi.fn()

vi.mock('@/lib/redis', () => ({
  getRedisConnection: vi.fn(() => ({
    get: mockRedisGet,
    setex: mockRedisSetex,
    scan: mockRedisScan,
    del: mockRedisDel,
  })),
}))

// Mock Prisma
const mockUserFindUnique = vi.fn()
const mockKnowledgeBaseFindUnique = vi.fn()
const mockKnowledgeBasePermissionFindMany = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    knowledgeBase: {
      findUnique: (...args: unknown[]) => mockKnowledgeBaseFindUnique(...args),
    },
    knowledgeBasePermission: {
      findMany: (...args: unknown[]) => mockKnowledgeBasePermissionFindMany(...args),
    },
  },
}))

// Import after mocks are set up
import {
  getKnowledgeBasePermissionLevel,
  checkKnowledgeBasePermission,
  invalidateKnowledgeBasePermissionCache,
} from './knowledge-base'

describe('Property 3: Knowledge Base Permission Cache Behavior', () => {
  // Arbitrary for generating valid user IDs
  const userIdArb = fc.uuid()
  
  // Arbitrary for generating valid knowledge base IDs
  const knowledgeBaseIdArb = fc.uuid()
  
  // Arbitrary for generating valid permission levels
  const permissionArb = fc.constantFrom<ResourcePermission>('VIEWER', 'EDITOR', 'MANAGER')
  
  // Arbitrary for generating organization IDs
  const orgIdArb = fc.uuid()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: Cache hit returns cached value without database query
   * 
   * Requirements 2.1, 2.2: When cache contains permission data, 
   * the result should match the cached value without database query.
   */
  it('should return cached permission without database query when cache hits', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        knowledgeBaseIdArb,
        permissionArb,
        async (userId, knowledgeBaseId, cachedPermission) => {
          // Setup: Cache returns the permission
          mockRedisGet.mockResolvedValueOnce(cachedPermission)
          
          // Execute
          const result = await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)
          
          // Verify: Result matches cached value
          expect(result).toBe(cachedPermission)
          
          // Verify: Database was NOT queried
          expect(mockUserFindUnique).not.toHaveBeenCalled()
          expect(mockKnowledgeBaseFindUnique).not.toHaveBeenCalled()
          expect(mockKnowledgeBasePermissionFindMany).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cache hit with null permission returns null without database query
   * 
   * Requirements 2.2: Cached "no permission" result should be returned directly.
   */
  it('should return null without database query when cache contains null permission', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        knowledgeBaseIdArb,
        async (userId, knowledgeBaseId) => {
          // Setup: Cache returns 'null' string (representing no permission)
          mockRedisGet.mockResolvedValueOnce('null')
          
          // Execute
          const result = await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)
          
          // Verify: Result is null
          expect(result).toBeNull()
          
          // Verify: Database was NOT queried
          expect(mockUserFindUnique).not.toHaveBeenCalled()
          expect(mockKnowledgeBaseFindUnique).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cache miss triggers database query and caches result
   * 
   * Requirements 2.3: When cache is empty, query database and store result in cache.
   */
  it('should query database and cache result when cache misses', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        knowledgeBaseIdArb,
        orgIdArb,
        async (userId, knowledgeBaseId, orgId) => {
          // Setup: Cache miss (returns null)
          mockRedisGet.mockResolvedValueOnce(null)
          
          // Setup: User exists and is ADMIN (gets MANAGER permission)
          mockUserFindUnique.mockResolvedValueOnce({
            id: userId,
            role: 'ADMIN',
            organizationId: orgId,
            departmentId: null,
          })
          
          // Setup: Knowledge base exists in same org
          mockKnowledgeBaseFindUnique.mockResolvedValueOnce({
            id: knowledgeBaseId,
            organizationId: orgId,
            creatorId: 'other-user',
          })
          
          // Execute
          const result = await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)
          
          // Verify: Result is MANAGER (ADMIN role)
          expect(result).toBe('MANAGER')
          
          // Verify: Database was queried
          expect(mockUserFindUnique).toHaveBeenCalled()
          expect(mockKnowledgeBaseFindUnique).toHaveBeenCalled()
          
          // Verify: Result was cached with correct key format
          expect(mockRedisSetex).toHaveBeenCalledWith(
            `kb:permission:${knowledgeBaseId}:${userId}`,
            300, // TTL = 5 minutes
            'MANAGER'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cache stores null when user has no permission
   * 
   * Requirements 2.3: Cache should store null results to avoid repeated DB queries.
   */
  it('should cache null when user has no permission', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        knowledgeBaseIdArb,
        orgIdArb,
        async (userId, knowledgeBaseId, orgId) => {
          // Setup: Cache miss
          mockRedisGet.mockResolvedValueOnce(null)
          
          // Setup: User exists as MEMBER with no department
          mockUserFindUnique.mockResolvedValueOnce({
            id: userId,
            role: 'MEMBER',
            organizationId: orgId,
            departmentId: null,
          })
          
          // Setup: Knowledge base exists, user is not creator
          mockKnowledgeBaseFindUnique.mockResolvedValueOnce({
            id: knowledgeBaseId,
            organizationId: orgId,
            creatorId: 'other-user',
          })
          
          // Setup: No permissions set for this user
          mockKnowledgeBasePermissionFindMany.mockResolvedValueOnce([])
          
          // Execute
          const result = await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)
          
          // Verify: Result is null (no permission)
          expect(result).toBeNull()
          
          // Verify: Null was cached
          expect(mockRedisSetex).toHaveBeenCalledWith(
            `kb:permission:${knowledgeBaseId}:${userId}`,
            300,
            'null'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: checkKnowledgeBasePermission uses cached permission level
   * 
   * Requirements 2.1, 2.2: Permission check should use cached data.
   */
  it('should use cached permission for permission checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        knowledgeBaseIdArb,
        permissionArb,
        permissionArb,
        async (userId, knowledgeBaseId, cachedPermission, requiredPermission) => {
          // Setup: Cache returns the permission
          mockRedisGet.mockResolvedValueOnce(cachedPermission)
          
          // Execute
          const result = await checkKnowledgeBasePermission(userId, knowledgeBaseId, requiredPermission)
          
          // Verify: Result is based on permission priority
          const permissionPriority: Record<ResourcePermission, number> = {
            VIEWER: 1,
            EDITOR: 2,
            MANAGER: 3,
          }
          const expected = permissionPriority[cachedPermission] >= permissionPriority[requiredPermission]
          expect(result).toBe(expected)
          
          // Verify: Database was NOT queried
          expect(mockUserFindUnique).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 4: Cache Invalidation on Permission Change', () => {
  const knowledgeBaseIdArb = fc.uuid()
  const userIdArb = fc.uuid()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: invalidateKnowledgeBasePermissionCache clears all related cache entries
   * 
   * Requirements 2.4: When knowledge base permission is modified, 
   * all related permission cache entries should be invalidated.
   */
  it('should clear all cache entries for a knowledge base', async () => {
    await fc.assert(
      fc.asyncProperty(
        knowledgeBaseIdArb,
        fc.array(userIdArb, { minLength: 1, maxLength: 10 }),
        async (knowledgeBaseId, userIds) => {
          // Setup: SCAN returns cache keys for multiple users
          const cacheKeys = userIds.map(uid => `kb:permission:${knowledgeBaseId}:${uid}`)
          
          // First SCAN returns keys, second SCAN returns empty (cursor = '0')
          mockRedisScan
            .mockResolvedValueOnce(['0', cacheKeys])
          
          mockRedisDel.mockResolvedValueOnce(cacheKeys.length)
          
          // Execute
          await invalidateKnowledgeBasePermissionCache(knowledgeBaseId)
          
          // Verify: SCAN was called with correct pattern
          expect(mockRedisScan).toHaveBeenCalledWith(
            '0',
            'MATCH',
            `kb:permission:${knowledgeBaseId}:*`,
            'COUNT',
            100
          )
          
          // Verify: DEL was called with all found keys
          expect(mockRedisDel).toHaveBeenCalledWith(...cacheKeys)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cache invalidation handles empty results gracefully
   * 
   * Requirements 2.4: Invalidation should work even when no cache entries exist.
   */
  it('should handle empty cache gracefully during invalidation', async () => {
    await fc.assert(
      fc.asyncProperty(
        knowledgeBaseIdArb,
        async (knowledgeBaseId) => {
          // Setup: SCAN returns no keys
          mockRedisScan.mockResolvedValueOnce(['0', []])
          
          // Execute - should not throw
          await expect(
            invalidateKnowledgeBasePermissionCache(knowledgeBaseId)
          ).resolves.not.toThrow()
          
          // Verify: DEL was NOT called (no keys to delete)
          expect(mockRedisDel).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cache invalidation uses SCAN for safe iteration
   * 
   * Requirements 2.4: Use SCAN instead of KEYS to avoid blocking Redis.
   */
  it('should use SCAN for iterating cache keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        knowledgeBaseIdArb,
        async (knowledgeBaseId) => {
          // Reset mocks for each iteration
          mockRedisScan.mockReset()
          mockRedisDel.mockReset()
          
          // Setup: Multiple SCAN iterations
          mockRedisScan
            .mockResolvedValueOnce(['123', [`kb:permission:${knowledgeBaseId}:user1`]])
            .mockResolvedValueOnce(['456', [`kb:permission:${knowledgeBaseId}:user2`]])
            .mockResolvedValueOnce(['0', [`kb:permission:${knowledgeBaseId}:user3`]])
          
          mockRedisDel.mockResolvedValue(1)
          
          // Execute
          await invalidateKnowledgeBasePermissionCache(knowledgeBaseId)
          
          // Verify: SCAN was called multiple times with cursor continuation
          expect(mockRedisScan).toHaveBeenCalledTimes(3)
          expect(mockRedisScan).toHaveBeenNthCalledWith(1, '0', 'MATCH', expect.any(String), 'COUNT', 100)
          expect(mockRedisScan).toHaveBeenNthCalledWith(2, '123', 'MATCH', expect.any(String), 'COUNT', 100)
          expect(mockRedisScan).toHaveBeenNthCalledWith(3, '456', 'MATCH', expect.any(String), 'COUNT', 100)
          
          // Verify: DEL was called for each batch
          expect(mockRedisDel).toHaveBeenCalledTimes(3)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Cache key format enables efficient invalidation
   * 
   * The cache key format kb:permission:{knowledgeBaseId}:{userId} allows
   * efficient pattern matching for invalidation by knowledge base ID.
   */
  it('should use correct cache key pattern for invalidation', async () => {
    await fc.assert(
      fc.asyncProperty(
        knowledgeBaseIdArb,
        async (knowledgeBaseId) => {
          mockRedisScan.mockResolvedValueOnce(['0', []])
          
          await invalidateKnowledgeBasePermissionCache(knowledgeBaseId)
          
          // Verify: Pattern matches the expected format
          expect(mockRedisScan).toHaveBeenCalledWith(
            '0',
            'MATCH',
            `kb:permission:${knowledgeBaseId}:*`,
            'COUNT',
            100
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Cache TTL Configuration', () => {
  const userIdArb = fc.uuid()
  const knowledgeBaseIdArb = fc.uuid()
  const orgIdArb = fc.uuid()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Property: Cache TTL is set to 5 minutes (300 seconds)
   * 
   * Requirements 2.5: Permission cache TTL should be 5 minutes.
   */
  it('should set cache TTL to 300 seconds (5 minutes)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        knowledgeBaseIdArb,
        orgIdArb,
        async (userId, knowledgeBaseId, orgId) => {
          // Setup: Cache miss
          mockRedisGet.mockResolvedValueOnce(null)
          
          // Setup: User is OWNER
          mockUserFindUnique.mockResolvedValueOnce({
            id: userId,
            role: 'OWNER',
            organizationId: orgId,
            departmentId: null,
          })
          
          // Setup: Knowledge base exists
          mockKnowledgeBaseFindUnique.mockResolvedValueOnce({
            id: knowledgeBaseId,
            organizationId: orgId,
            creatorId: 'other-user',
          })
          
          // Execute
          await getKnowledgeBasePermissionLevel(userId, knowledgeBaseId)
          
          // Verify: TTL is 300 seconds
          expect(mockRedisSetex).toHaveBeenCalledWith(
            expect.any(String),
            300, // 5 minutes
            expect.any(String)
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
