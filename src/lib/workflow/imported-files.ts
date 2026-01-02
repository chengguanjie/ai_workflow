import { prisma } from '@/lib/db'
import { localStorageProvider } from '@/lib/storage/providers/local'
import type { ExecutionContext } from './types'
import { extractTextFromFile } from '@/lib/files/extract-text'

function tryParseFileKeyFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'http://localhost')
    const match = parsed.pathname.match(/^\/api\/files\/([^/]+)\/download$/)
    if (!match?.[1]) return null
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function shouldTreatAsMedia(mimeType: string): boolean {
  const m = (mimeType || '').toLowerCase()
  return m.startsWith('image/') || m.startsWith('audio/') || m.startsWith('video/')
}

export async function ensureImportedFilesFromContext(context: ExecutionContext): Promise<void> {
  if (context.importedFiles && context.importedFiles.length > 0) return

  const urls: Array<{ name: string; url: string }> = []
  for (const output of context.nodeOutputs.values()) {
    const data = output.data || {}
    for (const value of Object.values(data)) {
      if (!value || typeof value !== 'object') continue
      const val = value as any
      const file = val.file && val.file.url ? val.file : null
      const url = typeof val.url === 'string' ? val.url : null
      const name = typeof (file?.name || val.fileName || val.name) === 'string' ? (file?.name || val.fileName || val.name) : 'file'
      const resolvedUrl = (file?.url as string | undefined) || url
      if (resolvedUrl && typeof resolvedUrl === 'string') {
        urls.push({ name, url: resolvedUrl })
      }
    }
  }

  if (urls.length === 0) return

  const imported: Array<{ name: string; content: string; type: string }> = []
  for (const item of urls) {
    const fileKey = tryParseFileKeyFromDownloadUrl(item.url)
    if (!fileKey) {
      imported.push({ name: item.name, content: item.url, type: 'url' })
      continue
    }

    const record = await prisma.outputFile.findUnique({
      where: { fileKey },
      select: {
        organizationId: true,
        storageType: true,
        mimeType: true,
        fileName: true,
        expiresAt: true,
      },
    })

    if (!record) continue
    if (record.organizationId !== context.organizationId) continue
    if (record.expiresAt && record.expiresAt < new Date()) continue

    if (record.storageType !== 'LOCAL') {
      imported.push({ name: record.fileName || item.name, content: item.url, type: record.mimeType || 'url' })
      continue
    }

    if (record.mimeType && shouldTreatAsMedia(record.mimeType)) {
      imported.push({ name: record.fileName || item.name, content: item.url, type: record.mimeType })
      continue
    }

    const buffer = await localStorageProvider.readFile(fileKey)
    const extracted = await extractTextFromFile({
      buffer,
      mimeType: record.mimeType || undefined,
      fileName: record.fileName || item.name,
      maxChars: 80_000,
    })
    imported.push({
      name: record.fileName || item.name,
      content: extracted.content,
      type: record.mimeType || extracted.detectedType,
    })
  }

  if (imported.length > 0) {
    context.importedFiles = imported
  }
}

