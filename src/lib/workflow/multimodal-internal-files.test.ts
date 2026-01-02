import { describe, expect, it } from 'vitest'
import { createContentPartsFromText } from './utils'

describe('multimodal: internal file download URLs', () => {
  it('should detect image extension inside /api/files/{encoded}/download and emit image_url part', () => {
    const fileKey = 'org/2026/01/exe/node_123_test.png'
    const url = `/api/files/${encodeURIComponent(fileKey)}/download`

    const context: any = {
      executionId: 'exe',
      workflowId: 'wf',
      organizationId: 'org',
      userId: 'user',
      nodeOutputs: new Map([
        [
          'n1',
          {
            nodeId: 'n1',
            nodeName: 'User Input',
            nodeType: 'INPUT',
            status: 'success',
            data: {
              image: { url },
            },
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
      ]),
      globalVariables: {},
      aiConfigs: new Map(),
    }

    const parts = createContentPartsFromText('看这张图：{{User Input.image}}', context)
    expect(parts.some((p) => p.type === 'image_url')).toBe(true)
  })

  it('should emit audio_url part for audio download link', () => {
    const fileKey = 'org/2026/01/exe/node_123_test.mp3'
    const url = `/api/files/${encodeURIComponent(fileKey)}/download`

    const context: any = {
      executionId: 'exe',
      workflowId: 'wf',
      organizationId: 'org',
      userId: 'user',
      nodeOutputs: new Map([
        [
          'n1',
          {
            nodeId: 'n1',
            nodeName: 'User Input',
            nodeType: 'INPUT',
            status: 'success',
            data: {
              audio: { url },
            },
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
      ]),
      globalVariables: {},
      aiConfigs: new Map(),
    }

    const parts = createContentPartsFromText('听这个：{{User Input.audio}}', context)
    expect(parts.some((p) => p.type === 'audio_url')).toBe(true)
  })
})
