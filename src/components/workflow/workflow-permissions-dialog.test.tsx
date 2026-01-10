import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-slot="select-trigger" type="button">
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-slot="select-content">{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => <div role="option">{children}</div>,
}))

import { WorkflowPermissionsDialog } from './workflow-permissions-dialog'

function okJson(body: unknown) {
  return new Response(JSON.stringify({ success: true, data: body }), { status: 200 })
}

describe('WorkflowPermissionsDialog', () => {
  it('loads departments and allows selecting a department', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/api/workflows/wf_1/permissions')) {
        return okJson({ permissions: [], canManage: true, currentUserPermission: 'EDIT' })
      }
      if (url.includes('/api/settings/departments')) {
        return okJson({ departments: [{ id: 'dept_1', name: '研发部' }] })
      }
      if (url.includes('/api/settings/members')) {
        return okJson({ members: [] })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowPermissionsDialog
        workflowId="wf_1"
        workflowName="W"
        open={true}
        onOpenChange={() => {}}
      />
    )

    await screen.findByText('添加权限')
    expect(await screen.findByText('研发部')).toBeTruthy()
  })
})
