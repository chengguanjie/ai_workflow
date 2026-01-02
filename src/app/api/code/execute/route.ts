import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/api/api-response'
import { withAuth, type AuthContext, isAdminOrOwner } from '@/lib/api/with-auth'
import { ValidationError, AuthorizationError } from '@/lib/errors'
import { executeSandboxedCode, type CodeLanguage } from '@/lib/code-execution/execute'

export const POST = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  if (!isAdminOrOwner(user)) {
    throw new AuthorizationError('无权执行代码')
  }

  if (process.env.CODE_EXECUTION_ENABLED !== 'true') {
    throw new ValidationError('代码执行未启用（设置 CODE_EXECUTION_ENABLED=true）')
  }

  const body = await request.json().catch(() => ({}))
  const language = (body?.language || 'javascript') as CodeLanguage
  const code = typeof body?.code === 'string' ? body.code : ''
  if (!code.trim()) throw new ValidationError('缺少 code')

  const input = typeof body?.input === 'object' && body.input ? (body.input as Record<string, unknown>) : {}

  const result = await executeSandboxedCode({
    enabled: true,
    language,
    code,
    input,
    timeoutMs: typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined,
    maxOutputSize: typeof body?.maxOutputSize === 'number' ? body.maxOutputSize : undefined,
  })

  return ApiResponse.success(result)
})
