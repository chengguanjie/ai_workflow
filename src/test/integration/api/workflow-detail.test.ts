import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PUT, DELETE } from '@/app/api/workflows/[id]/route'
import { workflowService } from '@/server/services/workflow.service'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/server/services/workflow.service', () => ({
        workflowService: {
                getById: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

describe('Workflow Detail API', () => {
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

        describe('GET /api/workflows/[id]', () => {
                it('should return workflow details', async () => {
                        const mockWorkflow = { id: 'wf-1', name: 'Workflow 1', creator: {} }
                        vi.mocked(workflowService.getById).mockResolvedValue(mockWorkflow as never)

                        const request = new NextRequest('http://localhost/api/workflows/wf-1')
                        const response = await GET(request, mockContext)
                        const data = await response.json()

                        expect(response.status).toBe(200)
                        expect(data).toEqual({ data: mockWorkflow, success: true })
                })

                it('should return 404 for non-existent workflow', async () => {
                        vi.mocked(workflowService.getById).mockResolvedValue(null)

                        const request = new NextRequest('http://localhost/api/workflows/wf-999')
                        const response = await GET(request, mockContext)

                        expect(response.status).toBe(404)
                })
        })

        describe('PUT /api/workflows/[id]', () => {
                it('should update workflow', async () => {
                        const updatedWorkflow = { id: 'wf-1', name: 'Updated Workflow' }
                        vi.mocked(workflowService.update).mockResolvedValue(updatedWorkflow as never)

                        const body = { name: 'Updated Workflow' }
                        const request = new NextRequest('http://localhost/api/workflows/wf-1', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body),
                        })
                        const response = await PUT(request, mockContext)
                        const data = await response.json()

                        expect(response.status).toBe(200)
                        expect(data.data).toEqual(updatedWorkflow)
                })
        })

        describe('DELETE /api/workflows/[id]', () => {
                it('should delete workflow', async () => {
                        vi.mocked(workflowService.delete).mockResolvedValue(undefined)

                        const request = new NextRequest('http://localhost/api/workflows/wf-1', {
                                method: 'DELETE',
                        })
                        const response = await DELETE(request, mockContext)

                        expect(response.status).toBe(204)
                })
        })
})
