import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { AuthenticationError } from '@/lib/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Debug endpoint for checking encryption configuration
 * 
 * SECURITY: This endpoint requires admin authentication to prevent
 * information disclosure. Only returns configuration status, not
 * any hash values or sensitive data.
 */
export async function GET() {
  // Require admin authentication
  const session = await auth()
  if (!session?.user) {
    throw new AuthenticationError('未登录')
  }

  // Only allow admins and owners
  if (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER') {
    throw new AuthenticationError('需要管理员权限')
  }

  const key = process.env.ENCRYPTION_KEY
  const salt = process.env.ENCRYPTION_SALT

  // Only return configuration status, not hash values
  // This prevents information disclosure while still allowing
  // debugging of configuration issues
  return NextResponse.json({
    pid: process.pid,
    hasEncryptionKey: Boolean(key),
    encryptionKeyLength: key?.length ?? null,
    encryptionKeyStartsWithQuote: key ? key.startsWith('"') || key.startsWith("'") : null,
    hasEncryptionSalt: Boolean(salt),
    encryptionSaltLength: salt?.length ?? null,
    encryptionSaltStartsWithQuote: salt ? salt.startsWith('"') || salt.startsWith("'") : null,
    // Removed hash values to prevent information disclosure
    // If you need to verify key/salt, use the decrypt-api-key endpoint instead
  })
}
