import { describe, expect, it, vi } from 'vitest'
import { createFileDownloadToken, verifyFileDownloadToken } from './file-download-token'

describe('file-download-token', () => {
  it('should roundtrip sign/verify', () => {
    vi.stubEnv('FILE_DOWNLOAD_TOKEN_SECRET', 'test-secret')
    const token = createFileDownloadToken({
      fileKey: 'org/2026/01/exe/node_file.mp4',
      organizationId: 'org',
      ttlSeconds: 60,
      purpose: 'media',
    })
    const payload = verifyFileDownloadToken(token, { fileKey: 'org/2026/01/exe/node_file.mp4' })
    expect(payload.organizationId).toBe('org')
    expect(payload.fileKey).toBe('org/2026/01/exe/node_file.mp4')
    expect(payload.purpose).toBe('media')
  })
})

