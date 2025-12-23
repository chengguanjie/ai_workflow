import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from '@/app/api/workflows/[id]/publish/route'
import { workflowService } from '@/server/services/workflow.service'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/server/services/workflow.service', () => ({
        workflowService: {
                publish: vi.fn(),
                discardDraft: vi.fn(),
                hasUnpublishedChanges: vi.fn(),
                getById: vi.fn(),
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

describe('Workflow Publish API', () => {
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

        describe('GET /api/workflows/[id]/publish', () => {
                it('should return publish status', async () => {
                        vi.mocked(workflowService.hasUnpublishedChanges).mockResolvedValue(true)
                        vi.mocked(workflowService.getById).mockResolvedValue({
                                id: 'wf-1',
                                publishStatus: 'DRAFT_MODIFIED',
                                publishedAt: null,
                        } as never)

                        const request = new NextRequest('http://localhost/api/workflows/wf-1/publish')
                        const response = await GET(request, mockContext)
                        const data = await response.json()

                        expect(response.status).toBe(200)
                        expect(data.success).toBe(true)
                        expect(data.data.hasUnpublishedChanges).toBe(true)
                })
        })

        describe('POST /api/workflows/[id]/publish', () => {
                it('should publish workflow', async () => {
                        const publishedWorkflow = {
                                id: 'wf-1',
                                publishStatus: 'PUBLISHED',
                                publishedAt: new Date(),
                        }
                        vi.mocked(workflowService.publish).mockResolvedValue(publishedWorkflow as never)

                        const request = new NextRequest('http://localhost/api/workflows/wf-1/publish', {
                                method: 'POST',
                        })
                        const response = await POST(request, mockContext)
                        const data = await response.json()

                        expect(response.status).toBe(200)
                        expect(data.success).toBe(true)
                        // 验证 publish 被调用，使用更灵活的断言
                        expect(workflowService.publish).toHaveBeenCalled()
                        expect(vi.mocked(workflowService.publish).mock.calls[0][0]).toBe('wf-1')
                        expect(vi.mocked(workflowService.publish).mock.calls[0][1]).toBe('org-1')
                })
        })

        describe('DELETE /api/workflows/[id]/publish', () => {
                it('should discard draft changes', async () => {
                        vi.mocked(workflowService.discardDraft).mockResolvedValue(undefined as never)

                        const request = new NextRequest('http://localhost/api/workflows/wf-1/publish', {
                                method: 'DELETE',
                        })
                        const response = await DELETE(request, mockContext)
                        const data = await response.json()

                        expect(response.status).toBe(200)
                        expect(data.success).toBe(true)
                        // 验证 discardDraft 被调用，使用更灵活的断言
                        expect(workflowService.discardDraft).toHaveBeenCalled()
                        expect(vi.mocked(workflowService.discardDraft).mock.calls[0][0]).toBe('wf-1')
                        expect(vi.mocked(workflowService.discardDraft).mock.calls[0][1]).toBe('org-1')
                })
        })
})
