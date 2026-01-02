import { NextRequest } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { prisma } from '@/lib/db'
import { isOAuthProviderId, OAUTH_PROVIDERS } from '@/lib/integrations/oauth/providers'
import { ValidationError } from '@/lib/errors'

export const POST = withAuth(async (_request: NextRequest, { user, params }: AuthContext) => {
  const providerRaw = params?.provider
  if (!providerRaw) throw new ValidationError('缺少 provider')

  if (!isOAuthProviderId(providerRaw)) {
    throw new ValidationError(`不支持的 OAuth provider: ${providerRaw}`)
  }

  const cfg = OAUTH_PROVIDERS[providerRaw]
  await prisma.integrationCredential.deleteMany({
    where: {
      organizationId: user.organizationId,
      provider: cfg.credentialProvider,
    },
  })

  return ApiResponse.success({ provider: cfg.credentialProvider, connected: false })
})
