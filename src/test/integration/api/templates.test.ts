import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/templates/route'
import { prisma } from '@/lib/db'
import { CacheService } from '@/services/cache-service'

// Mock dependencies
vi.mock('@/lib/db', () => ({
        prisma: {
                workflowTemplate: {
                        findMany: vi.fn(),
                        count: vi.fn(),
                },
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

vi.mock('@/services/cache-service', () => ({
        CacheService: {
                generateKey: vi.fn((prefix, key) => `${prefix}:${key}`),
                getOrSet: vi.fn(),
        },
}))

import { auth } from '@/lib/auth'

describe('GET /api/templates', () => {
        const mockUser = {
                id: 'user-1',
                email: 'test@example.com',
                name: 'Test User',
                role: 'MEMBER',
                organizationId: 'org-1',
                organizationName: 'Test Org',
        }

        beforeEach(() => {
                vi.clearAllMocks()
                // Mock authenticated session
                vi.mocked(auth).mockResolvedValue({
                        user: mockUser,
                        expires: '2099-01-01',
                } as unknown as Awaited<ReturnType<typeof auth>>)
        })

        it('should return templates from cache if available', async () => {
                const cachedTemplates = [
                        { id: 't1', name: 'Cached Template', templateType: 'INTERNAL' },
                ]
                const cachedTotal = 1

                // Mock CacheService.getOrSet to return cached data
                vi.mocked(CacheService.getOrSet).mockResolvedValue({
                        templates: cachedTemplates,
                        total: cachedTotal,
                })

                const request = new NextRequest('http://localhost/api/templates?page=1&limit=20')
                const response = await GET(request, { params: Promise.resolve({}) })
                const json = await response.json()

                expect(response.status).toBe(200)
                expect(json.success).toBe(true)
                expect(json.data.templates).toEqual(cachedTemplates)
                expect(CacheService.getOrSet).toHaveBeenCalled()
                // Prisma should NOT be called because getOrSet handles the logic (mocked here)
                // In strict unit test of the route, we test that it CALLS getOrSet correctly.
        })

        it('should fetch from database and cache if not in cache', async () => {
                const dbTemplates = [
                        { id: 't2', name: 'DB Template', templateType: 'INTERNAL', creatorId: 'user-1', organizationId: 'org-1' },
                ]
                const dbTotal = 1

                // Setup CacheService to execute the fetch function (simulate cache miss)
                vi.mocked(CacheService.getOrSet).mockImplementation(async (key, fetchFn) => {
                        // Execute the fetch function passed by the route handler
                        return await fetchFn()
                })

                // Mock Prisma responses
                vi.mocked(prisma.workflowTemplate.findMany).mockResolvedValue(dbTemplates as never)
                vi.mocked(prisma.workflowTemplate.count).mockResolvedValue(dbTotal)

                const request = new NextRequest('http://localhost/api/templates?page=1&limit=20')
                const response = await GET(request, { params: Promise.resolve({}) })
                const json = await response.json()

                expect(response.status).toBe(200)
                expect(json.success).toBe(true)
                expect(json.data.templates).toEqual(dbTemplates)

                // Verify Prisma was called with correct parameters
                expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
                        where: expect.objectContaining({
                                OR: expect.arrayContaining([
                                        { creatorId: mockUser.id, visibility: 'PRIVATE', templateType: 'INTERNAL' },
                                        { organizationId: mockUser.organizationId, visibility: 'ORGANIZATION', templateType: 'INTERNAL' },
                                ]),
                        }),
                        take: 20,
                        skip: 0,
                }))
        })

        it('should handle search filtering correctly', async () => {
                const searchTerm = 'report'

                vi.mocked(CacheService.getOrSet).mockImplementation(async (key, fetchFn) => {
                        return await fetchFn()
                })

                vi.mocked(prisma.workflowTemplate.findMany).mockResolvedValue([])
                vi.mocked(prisma.workflowTemplate.count).mockResolvedValue(0)

                const request = new NextRequest(`http://localhost/api/templates?search=${searchTerm}`)
                await GET(request, { params: Promise.resolve({}) })

                // Verify search filter logic
                expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
                        where: expect.objectContaining({
                                AND: expect.arrayContaining([
                                        expect.objectContaining({
                                                OR: [
                                                        { name: { contains: searchTerm } },
                                                        { description: { contains: searchTerm } },
                                                ],
                                        }),
                                ]),
                        }),
                }))
        })
})
