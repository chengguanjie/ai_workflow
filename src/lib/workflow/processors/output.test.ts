import { beforeEach, describe, expect, it, vi } from 'vitest'

const { uploadAndSave, getDownloadInfoByKey } = vi.hoisted(() => ({
  uploadAndSave: vi.fn(),
  getDownloadInfoByKey: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  storageService: {
    uploadAndSave,
    getDownloadInfoByKey,
  },
  FORMAT_MIME_TYPES: {
    text: 'text/plain',
    image: 'image/png',
    audio: 'audio/mpeg',
    video: 'video/mp4',
    pdf: 'application/pdf',
    word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  FORMAT_EXTENSIONS: {
    text: '.txt',
    image: '.png',
    audio: '.mp3',
    video: '.mp4',
    pdf: '.pdf',
    word: '.docx',
    excel: '.xlsx',
  },
}))

const { readFile } = vi.hoisted(() => ({
  readFile: vi.fn(),
}))
vi.mock('fs/promises', () => ({ readFile }))

import { outputNodeProcessor } from './output'

function makeContext(): any {
  return {
    executionId: 'exe',
    workflowId: 'wf',
    organizationId: 'org',
    userId: 'user',
    nodeOutputs: new Map(),
    globalVariables: {},
    aiConfigs: new Map(),
  }
}

describe('OutputNodeProcessor (multimodal media output)', () => {
  beforeEach(() => {
    uploadAndSave.mockReset()
    getDownloadInfoByKey.mockReset()
    readFile.mockReset()
  })

  it('uploads file from data:*;base64 URL for image format', async () => {
    uploadAndSave.mockImplementation(async (params: any) => ({
      id: 'file_1',
      fileKey: 'key_1',
      url: '/api/files/key_1/download',
      size: (params.file as Buffer).length,
    }))

    const node: any = {
      id: 'n1',
      name: 'Output',
      type: 'OUTPUT',
      config: {
        format: 'image',
        fileName: 'result',
        prompt: 'data:image/png;base64,SGVsbG8=',
      },
    }

    const res: any = await outputNodeProcessor.process(node, makeContext())

    expect(res.status).toBe('success')
    expect(uploadAndSave).toHaveBeenCalledTimes(1)
    expect(uploadAndSave.mock.calls[0][0].mimeType).toBe('image/png')
    expect(uploadAndSave.mock.calls[0][0].format).toBe('image')
    expect((uploadAndSave.mock.calls[0][0].file as Buffer).toString('utf8')).toBe('Hello')
    expect(res.data.file.mimeType).toBe('image/png')
    expect(res.data.file.format).toBe('image')
  })

  it('uploads file from internal /api/files/{encoded}/download URL for audio format', async () => {
    getDownloadInfoByKey.mockResolvedValue({
      localPath: '/tmp/test.mp3',
      file: { mimeType: 'audio/mpeg' },
    })
    readFile.mockResolvedValue(Buffer.from([1, 2, 3, 4]))
    uploadAndSave.mockImplementation(async (params: any) => ({
      id: 'file_2',
      fileKey: 'key_2',
      url: '/api/files/key_2/download',
      size: (params.file as Buffer).length,
    }))

    const fileKey = 'org/2026/01/exe/node_123_test.mp3'
    const node: any = {
      id: 'n2',
      name: 'Output',
      type: 'OUTPUT',
      config: {
        format: 'audio',
        fileName: 'result',
        prompt: `/api/files/${encodeURIComponent(fileKey)}/download`,
      },
    }

    const res: any = await outputNodeProcessor.process(node, makeContext())

    expect(res.status).toBe('success')
    expect(getDownloadInfoByKey).toHaveBeenCalledWith(fileKey)
    expect(readFile).toHaveBeenCalledWith('/tmp/test.mp3')
    expect(uploadAndSave).toHaveBeenCalledTimes(1)
    expect(uploadAndSave.mock.calls[0][0].mimeType).toBe('audio/mpeg')
    expect(uploadAndSave.mock.calls[0][0].format).toBe('audio')
    expect((uploadAndSave.mock.calls[0][0].file as Buffer).equals(Buffer.from([1, 2, 3, 4]))).toBe(true)
    expect(res.data.file.mimeType).toBe('audio/mpeg')
    expect(res.data.file.format).toBe('audio')
  })

  it('creates Word document from plain text', async () => {
    uploadAndSave.mockImplementation(async (params: any) => ({
      id: 'file_3',
      fileKey: 'key_3',
      url: '/api/files/key_3/download',
      size: (params.file as Buffer).length,
    }))

    const node: any = {
      id: 'n3',
      name: '文章输出',
      type: 'OUTPUT',
      config: {
        format: 'word',
        fileName: '微信公众号文章',
        prompt: '这是一篇测试文章\n\n第一段内容\n第二段内容',
      },
    }

    const res: any = await outputNodeProcessor.process(node, makeContext())

    expect(res.status).toBe('success')
    expect(uploadAndSave).toHaveBeenCalledTimes(1)
    expect(uploadAndSave.mock.calls[0][0].mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(uploadAndSave.mock.calls[0][0].format).toBe('word')
    expect(res.data.file.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(res.data.file.format).toBe('word')
    expect(res.data.file.fileName).toBe('微信公众号文章.docx')
  })

  it('creates Word document with markdown headings', async () => {
    uploadAndSave.mockImplementation(async (params: any) => ({
      id: 'file_4',
      fileKey: 'key_4',
      url: '/api/files/key_4/download',
      size: (params.file as Buffer).length,
    }))

    const node: any = {
      id: 'n4',
      name: '文章输出',
      type: 'OUTPUT',
      config: {
        format: 'word',
        fileName: '带标题文章',
        prompt: `# 主标题
        
## 二级标题

这是正文内容

### 三级标题

更多内容`,
      },
    }

    const res: any = await outputNodeProcessor.process(node, makeContext())

    expect(res.status).toBe('success')
    expect(uploadAndSave).toHaveBeenCalledTimes(1)
    expect(res.data.file.format).toBe('word')
  })

  it('detects image markdown syntax for rich Word document', async () => {
    uploadAndSave.mockImplementation(async (params: any) => ({
      id: 'file_5',
      fileKey: 'key_5',
      url: '/api/files/key_5/download',
      size: (params.file as Buffer).length,
    }))

    const node: any = {
      id: 'n5',
      name: '图文输出',
      type: 'OUTPUT',
      config: {
        format: 'word',
        fileName: '图文文章',
        prompt: `# 微信公众号文章

这是一篇图文并茂的文章。

![配图说明](https://example.com/image.png)

更多文字内容...`,
      },
    }

    const res: any = await outputNodeProcessor.process(node, makeContext())

    expect(res.status).toBe('success')
    expect(uploadAndSave).toHaveBeenCalledTimes(1)
    expect(res.data.file.format).toBe('word')
  })
})
