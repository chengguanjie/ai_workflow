/**
 * MCP Server Connection Test API
 * 
 * Provides endpoint for testing MCP server connections.
 * Returns server capabilities and available tools on success.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { testConnection, isValidMCPUrl } from '@/lib/mcp/client'
import type { MCPServerConfig, MCPTransportType, MCPAuthType } from '@/lib/mcp/types'
import { getOrgConfigs } from '@/lib/mcp/server-config-store'

/**
 * POST /api/mcp/servers/[id]/test - 测试 MCP 服务器连接
 * 
 * Tests connection to an MCP server and returns its capabilities and tools.
 * Can test either a saved server configuration (by ID) or a new configuration
 * provided in the request body.
 * 
 * Path Parameters:
 * - id: Server configuration ID (use 'new' for testing unsaved configurations)
 * 
 * Request Body (optional, required when id='new'):
 * - url: Server URL endpoint
 * - transport: Transport protocol ('sse' | 'http')
 * - authType: Authentication type ('none' | 'api-key' | 'bearer')
 * - apiKey: API key for authentication
 * - headers: Custom HTTP headers
 * - timeout: Connection timeout in ms
 * 
 * Response:
 * - success: Whether the connection test succeeded
 * - serverInfo: Server name and version
 * - capabilities: Server capabilities (tools, resources, prompts)
 * - tools: List of available tools with their schemas
 * - error: Error message if connection failed
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext): Promise<NextResponse> => {
  const serverId = params?.id

  if (!serverId) {
    return ApiResponse.error('缺少服务器 ID', 400)
  }

  let serverConfig: MCPServerConfig

  if (serverId === 'new') {
    // Test a new configuration from request body
    const body = await request.json()

    if (!body.url) {
      return ApiResponse.error('缺少服务器 URL', 400)
    }

    if (!isValidMCPUrl(body.url)) {
      return ApiResponse.error('服务器 URL 格式无效，必须是有效的 HTTP/HTTPS URL', 400)
    }

    serverConfig = {
      id: `test_${Date.now()}`,
      name: body.name || 'Test Server',
      url: body.url,
      transport: (body.transport || 'http') as MCPTransportType,
      authType: (body.authType || 'none') as MCPAuthType,
      apiKey: body.apiKey,
      headers: body.headers,
      timeout: body.timeout || 30000,
    }
  } else {
    // Test an existing saved configuration
    const orgConfigs = getOrgConfigs(user.organizationId)
    const savedConfig = orgConfigs.get(serverId)

    if (!savedConfig) {
      return ApiResponse.error('服务器配置不存在', 404)
    }

    serverConfig = savedConfig
  }

  // Perform connection test
  const result = await testConnection(serverConfig)

  if (result.success) {
    // Connection successful - return server info, capabilities, and tools
    return ApiResponse.success({
      success: true,
      serverInfo: result.serverInfo,
      capabilities: result.capabilities,
      tools: result.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })) || [],
      message: `成功连接到 MCP 服务器: ${result.serverInfo?.name || serverConfig.name}`,
    })
  } else {
    // Connection failed - return error details
    return ApiResponse.success({
      success: false,
      error: result.error || '连接失败',
      message: getErrorMessage(result.error),
    })
  }
})

/**
 * Get user-friendly error message based on error type
 */
function getErrorMessage(error?: string): string {
  if (!error) {
    return '连接到 MCP 服务器失败，请检查配置'
  }

  // Check for common error patterns
  if (error.includes('UNREACHABLE') || error.includes('Cannot reach')) {
    return '无法连接到服务器，请检查 URL 是否正确'
  }

  if (error.includes('AUTH_FAILED') || error.includes('Authentication')) {
    return '认证失败，请检查 API Key 是否正确'
  }

  if (error.includes('TIMEOUT') || error.includes('timeout')) {
    return '连接超时，请检查网络或增加超时时间'
  }

  if (error.includes('PROTOCOL') || error.includes('protocol')) {
    return '协议错误，请检查服务器是否支持 MCP 协议'
  }

  return error
}

/**
 * GET /api/mcp/servers/[id]/test - 获取上次测试结果
 * 
 * Returns cached test results if available.
 * This is a convenience endpoint for checking connection status.
 * 
 * Requirements: 2.5
 */
export const GET = withAuth(async (_request: NextRequest, { user, params }: AuthContext): Promise<NextResponse> => {
  const serverId = params?.id

  if (!serverId || serverId === 'new') {
    return ApiResponse.error('无效的服务器 ID', 400)
  }

  // Check if server exists
  const orgConfigs = getOrgConfigs(user.organizationId)
  const savedConfig = orgConfigs.get(serverId)

  if (!savedConfig) {
    return ApiResponse.error('服务器配置不存在', 404)
  }

  // Return server info without testing
  return ApiResponse.success({
    id: savedConfig.id,
    name: savedConfig.name,
    url: savedConfig.url,
    transport: savedConfig.transport,
    authType: savedConfig.authType,
    hasApiKey: !!savedConfig.apiKey,
    message: '使用 POST 请求测试连接',
  })
})
