/**
 * MCP Server Connection Test API (Direct)
 * 
 * Provides endpoint for testing MCP server connections without saving.
 * This is a convenience endpoint for testing new configurations.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { testConnection, isValidMCPUrl } from '@/lib/mcp/client'
import type { MCPServerConfig, MCPTransportType, MCPAuthType } from '@/lib/mcp/types'

/**
 * POST /api/mcp/servers/test - 测试 MCP 服务器连接
 * 
 * Tests connection to an MCP server using provided configuration.
 * Does not save the configuration.
 * 
 * Request Body:
 * - url: Server URL endpoint (required)
 * - transport: Transport protocol ('sse' | 'http', default: 'http')
 * - authType: Authentication type ('none' | 'api-key' | 'bearer', default: 'none')
 * - apiKey: API key for authentication (optional)
 * - headers: Custom HTTP headers (optional)
 * - timeout: Connection timeout in ms (optional, default: 30000)
 * 
 * Response:
 * - success: Whether the connection test succeeded
 * - serverInfo: Server name and version
 * - capabilities: Server capabilities (tools, resources, prompts)
 * - tools: List of available tools with their schemas
 * - error: Error message if connection failed
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export const POST = withAuth(async (request: NextRequest, _context: AuthContext): Promise<NextResponse> => {
  const body = await request.json()

  // Validate required fields
  if (!body.url) {
    return ApiResponse.error('缺少服务器 URL', 400)
  }

  if (!isValidMCPUrl(body.url)) {
    return ApiResponse.error('服务器 URL 格式无效，必须是有效的 HTTP/HTTPS URL', 400)
  }

  // Build server configuration
  const serverConfig: MCPServerConfig = {
    id: `test_${Date.now()}`,
    name: body.name || 'Test Server',
    url: body.url,
    transport: (body.transport || 'http') as MCPTransportType,
    authType: (body.authType || 'none') as MCPAuthType,
    apiKey: body.apiKey,
    headers: body.headers,
    timeout: body.timeout || 30000,
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
