import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { AuthenticationError, AuthorizationError } from '@/lib/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Debug endpoint for decrypting API keys
 * 
 * SECURITY: This endpoint requires admin authentication and organization
 * ownership to prevent unauthorized access to API keys.
 */
export async function GET(request: NextRequest) {
  // Require authentication
  const session = await auth()
  if (!session?.user) {
    throw new AuthenticationError('未登录')
  }

  // Only allow admins and owners
  if (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER') {
    throw new AuthorizationError('需要管理员权限')
  }

  const id = request.nextUrl.searchParams.get('id') || ''
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
  }

  const row = await prisma.apiKey.findUnique({
    where: { id },
    select: {
      id: true,
      provider: true,
      isActive: true,
      keyEncrypted: true,
      keyMasked: true,
      organizationId: true,
    },
  })

  if (!row) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  // Verify organization ownership
  if (row.organizationId !== session.user.organizationId) {
    throw new AuthorizationError('无权访问此API密钥')
  }

  try {
    const plain = safeDecryptApiKey(row.keyEncrypted)
    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        provider: row.provider,
        isActive: row.isActive,
        keyMasked: row.keyMasked,
        decryptedLength: plain.length,
        // Note: We don't return the actual decrypted key for security
        // If you need to see the key, use the settings page instead
      },
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      data: {
        id: row.id,
        provider: row.provider,
        isActive: row.isActive,
        keyMasked: row.keyMasked,
      },
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
