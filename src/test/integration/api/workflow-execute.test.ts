import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/workflows/[id]/execute/route'
import { executeWorkflow } from '@/lib/workflow/engine'
import { executionQueue } from '@/lib/workflow/queue'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

// Mock dependencies
vi.mock('@/lib/workflow/engine', () => ({
        executeWorkflow: vi.fn(),
}))

vi.mock('@/lib/workflow/queue', () => ({
        executionQueue: {
                enqueue: vi.fn(),
        },
}))

vi.mock('@/lib/db', () => ({
        prisma: {
                workflow: {
                        findFirst: vi.fn(),
                },
        },
}))

vi.mock('@/lib/auth', () => ({
        auth: vi.fn(),
}))

describe('Workflow Execute API', () => {
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

        it('should execute workflow synchronously', async () => {
                const mockWorkflow = {
                        id: 'wf-1',
                        name: 'Test Workflow',
                        config: { nodes: [], edges: [] },
                        organizationId: 'org-1',
                }
                vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
                vi.mocked(executeWorkflow).mockResolvedValue({
                        success: true,
                        executionId: 'exec-1',
                        output: { result: 'success' },
                } as never)

                const body = { inputs: { test: 'value' } }
                const request = new NextRequest('http://localhost/api/workflows/wf-1/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                })

                const response = await POST(request, mockContext)
                const data = await response.json()

                expect(response.status).toBe(200)
                expect(data.success).toBe(true)
        })

        it('should return 404 for non-existent workflow', async () => {
                vi.mocked(prisma.workflow.findFirst).mockResolvedValue(null)

                const request = new NextRequest('http://localhost/api/workflows/wf-999/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ inputs: {} }),
                })

                const response = await POST(request, mockContext)
                expect(response.status).toBe(404)
        })

        it('should enqueue workflow for async execution', async () => {
                const mockWorkflow = {
                        id: 'wf-1',
                        name: 'Test Workflow',
                        config: { nodes: [], edges: [] },
                        organizationId: 'org-1',
                }
                vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
                vi.mocked(executionQueue.enqueue).mockResolvedValue({ id: 'exec-1' } as never)

                const body = { inputs: { test: 'value' }, async: true }
                const request = new NextRequest('http://localhost/api/workflows/wf-1/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                })

                const response = await POST(request, mockContext)
                const data = await response.json()

                expect(response.status).toBe(200)
                expect(data.success).toBe(true)
                expect(executionQueue.enqueue).toHaveBeenCalled()
        })
})
