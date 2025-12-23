import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/executions/route'
import { prisma } from '@/lib/db'

// Mock dependencies
vi.mock('@/lib/db', () => ({
        prisma: {
                execution: {
                        findMany: vi.fn(),
                        count: vi.fn(),
                },
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

import { auth } from '@/lib/auth'

describe('GET /api/executions', () => {
        const mockUser = {
                id: 'user-1',
                organizationId: 'org-1',
        }

        beforeEach(() => {
                vi.clearAllMocks()
                vi.mocked(auth).mockResolvedValue({
                        user: mockUser,
                        expires: '2099-01-01',
                } as never)
        })

        it('should filter by organizationId', async () => {
                vi.mocked(prisma.execution.findMany).mockResolvedValue([])
                vi.mocked(prisma.execution.count).mockResolvedValue(0)

                const request = new NextRequest('http://localhost/api/executions')
                const response = await GET(request)

                expect(response.status).toBe(200)

                expect(prisma.execution.findMany).toHaveBeenCalledWith(expect.objectContaining({
                        where: expect.objectContaining({
                                organizationId: 'org-1',
                        }),
                }))
        })

        it('should filter by status', async () => {
                vi.mocked(prisma.execution.findMany).mockResolvedValue([])
                vi.mocked(prisma.execution.count).mockResolvedValue(0)

                const request = new NextRequest('http://localhost/api/executions?status=COMPLETED')
                await GET(request)

                expect(prisma.execution.findMany).toHaveBeenCalledWith(expect.objectContaining({
                        where: expect.objectContaining({
                                organizationId: 'org-1',
                                status: 'COMPLETED',
                        }),
                }))
        })

        it('should filter by date range', async () => {
                vi.mocked(prisma.execution.findMany).mockResolvedValue([])
                vi.mocked(prisma.execution.count).mockResolvedValue(0)

                const startDate = '2023-01-01'
                const endDate = '2023-01-31'
                const request = new NextRequest(`http://localhost/api/executions?startDate=${startDate}&endDate=${endDate}`)
                await GET(request)

                expect(prisma.execution.findMany).toHaveBeenCalledWith(expect.objectContaining({
                        where: expect.objectContaining({
                                organizationId: 'org-1',
                                createdAt: expect.objectContaining({
                                        gte: new Date(startDate),
                                        lte: expect.any(Date), // Checking if it set the end of day
                                }),
                        }),
                }))
        })
})
