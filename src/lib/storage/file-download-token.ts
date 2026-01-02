import { createHmac, timingSafeEqual } from 'crypto'

type FileDownloadTokenPayload = {
  v: 1
  fileKey: string
  organizationId: string
  exp: number
  purpose: 'media' | 'generic'
}

function getSigningSecret(): string {
  const secret =
    process.env.FILE_DOWNLOAD_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('缺少 FILE_DOWNLOAD_TOKEN_SECRET（或 AUTH_SECRET/ENCRYPTION_KEY 兜底）')
  }
  return secret
}

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function sign(payloadB64: string): string {
  return createHmac('sha256', getSigningSecret()).update(payloadB64).digest('base64url')
}

export function createFileDownloadToken(params: {
  fileKey: string
  organizationId: string
  ttlSeconds?: number
  purpose?: FileDownloadTokenPayload['purpose']
}): string {
  const ttlSeconds = Math.max(10, Math.min(params.ttlSeconds ?? 10 * 60, 24 * 60 * 60))
  const payload: FileDownloadTokenPayload = {
    v: 1,
    fileKey: params.fileKey,
    organizationId: params.organizationId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    purpose: params.purpose ?? 'media',
  }

  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const sig = sign(payloadB64)
  return `${payloadB64}.${sig}`
}

export function verifyFileDownloadToken(token: string, expected: { fileKey: string }): FileDownloadTokenPayload {
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('无效下载 token')
  const [payloadB64, sig] = parts
  if (!payloadB64 || !sig) throw new Error('无效下载 token')

  const expectedSig = sign(payloadB64)
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('无效下载 token')

  const payload = JSON.parse(b64urlDecode(payloadB64)) as FileDownloadTokenPayload
  if (!payload || payload.v !== 1) throw new Error('无效下载 token')
  if (payload.fileKey !== expected.fileKey) throw new Error('下载 token 不匹配')
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('下载 token 已过期')
  return payload
}

export function getAppBaseUrlForDownload(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

export function buildSignedDownloadUrl(params: {
  fileKey: string
  organizationId: string
  ttlSeconds?: number
}): string {
  const base = getAppBaseUrlForDownload()
  const url = new URL(`/api/files/${encodeURIComponent(params.fileKey)}/download`, base)
  const token = createFileDownloadToken({
    fileKey: params.fileKey,
    organizationId: params.organizationId,
    ttlSeconds: params.ttlSeconds,
    purpose: 'media',
  })
  url.searchParams.set('token', token)
  return url.toString()
}

