import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/workflows/[id]/analytics/route'
import { workflowService } from '@/server/services/workflow.service'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/lib/db', () => ({
        prisma: {
                execution: {
                        findMany: vi.fn(),
                        aggregate: vi.fn(),
                        groupBy: vi.fn(),
                },
                executionFeedback: {
                        findMany: vi.fn(),
                },
                optimizationSuggestion: {
                        findMany: vi.fn(),
                },
        },
}))

vi.mock('@/server/services/workflow.service', () => ({
        workflowService: {
                getById: vi.fn(),
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

describe('Workflow Analytics API', () => {
        const mockUser = {
                id: 'user-1',
                organizationId: 'org-1',
                email: 'test@example.com',
                role: 'USER',
        }

        const mockContext = {
                params: Promise.resolve({ id: 'wf-1' }),
        }

        beforeEach(() => {
                vi.clearAllMocks()
                vi.mocked(auth).mockResolvedValue({
                        user: mockUser,
                        expires: '2099-01-01',
                } as never)
        })

        describe('GET /api/workflows/[id]/analytics', () => {
                it('should return 404 for non-existent workflow', async () => {
                        vi.mocked(workflowService.getById).mockResolvedValue(null)

                        const request = new NextRequest('http://localhost/api/workflows/wf-999/analytics')
                        const response = await GET(request, mockContext)

                        expect(response.status).toBe(404)
                })
        })
})
