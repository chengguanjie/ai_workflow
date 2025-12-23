import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/workflows/route'
import { workflowService } from '@/server/services/workflow.service'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/server/services/workflow.service', () => ({
        workflowService: {
                list: vi.fn(),
                create: vi.fn(),
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

describe('Workflows API', () => {
        const mockUser = {
                id: 'user-1',
                organizationId: 'org-1',
                email: 'test@example.com',
                role: 'USER',
        }

        beforeEach(() => {
                vi.clearAllMocks()
                vi.mocked(auth).mockResolvedValue({
                        user: mockUser,
                        expires: '2099-01-01',
                } as never)
        })

        describe('GET /api/workflows', () => {
                it('should list workflows with default parameters', async () => {
                        const mockResult = {
                                data: [{ id: 'wf-1', name: 'Workflow 1' }],
                                pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
                        }
                        vi.mocked(workflowService.list).mockResolvedValue(mockResult as never)

                        const request = new NextRequest('http://localhost/api/workflows')
                        const response = await GET(request, { params: Promise.resolve({}) })
                        const data = await response.json()

                        expect(response.status).toBe(200)
                        expect(data).toEqual({ ...mockResult, success: true })
                        expect(workflowService.list).toHaveBeenCalledWith(expect.objectContaining({
                                organizationId: 'org-1',
                                userId: 'user-1',
                                page: 1,
                                pageSize: 20,
                        }))
                })

                it('should filter by category and search term', async () => {
                        vi.mocked(workflowService.list).mockResolvedValue({
                                data: [],
                                pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
                        })

                        const request = new NextRequest('http://localhost/api/workflows?category=HR&search=onboard')
                        await GET(request, { params: Promise.resolve({}) })

                        expect(workflowService.list).toHaveBeenCalledWith(expect.objectContaining({
                                organizationId: 'org-1',
                                userId: 'user-1',
                                category: 'HR',
                                search: 'onboard',
                        }))
                })
        })

        describe('POST /api/workflows', () => {
                it('should create a new workflow', async () => {
                        const newWorkflow = {
                                id: 'wf-new',
                                name: 'New Workflow',
                                description: 'Test Description',
                                config: { nodes: [], edges: [] },
                        }
                        vi.mocked(workflowService.create).mockResolvedValue(newWorkflow as never)

                        const body = {
                                name: 'New Workflow',
                                description: 'Test Description',
                                config: { nodes: [], edges: [] },
                        }
                        const request = new NextRequest('http://localhost/api/workflows', {
                                method: 'POST',
                                headers: {
                                        'Content-Type': 'application/json',
                                },
                                body: JSON.stringify(body),
                        })

                        const response = await POST(request, { params: Promise.resolve({}) })
                        const data = await response.json()

                        expect(response.status).toBe(201)
                        expect(data).toEqual(expect.objectContaining({
                                data: newWorkflow
                        }))
                        expect(workflowService.create).toHaveBeenCalledWith(expect.objectContaining({
                                name: 'New Workflow',
                                description: 'Test Description',
                                config: body.config,
                                organizationId: 'org-1',
                                creatorId: 'user-1',
                        }))
                })

                it('should return 400 validation error for missing required fields', async () => {
                        const request = new NextRequest('http://localhost/api/workflows', {
                                method: 'POST',
                                headers: {
                                        'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                        // Missing name and config
                                        description: 'Invalid'
                                }),
                        })

                        const response = await POST(request, { params: Promise.resolve({}) })
                        expect(response.status).toBe(400)
                })
        })
})
