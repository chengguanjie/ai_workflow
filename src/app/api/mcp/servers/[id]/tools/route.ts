/**
 * MCP Server Tools List API
 * 
 * Provides endpoint for fetching available tools from an MCP server.
 * Returns tool names, descriptions, and input schemas.
 * 
 * Requirements: 3.1, 3.2
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { connect, disconnect, listTools, isValidMCPUrl } from '@/lib/mcp/client'
import type { MCPServerConfig, MCPTransportType, MCPAuthType } from '@/lib/mcp/types'
import { getOrgConfigs } from '@/lib/mcp/server-config-store'

/**
 * GET /api/mcp/servers/[id]/tools - 获取 MCP 服务器的工具列表
 * 
 * Fetches the list of available tools from a connected MCP server.
 * Can fetch tools from either a saved server configuration (by ID) 
 * or a new configuration provided via query parameters.
 * 
 * Path Parameters:
 * - id: Server configuration ID (use 'new' for testing unsaved configurations)
 * 
 * Query Parameters (required when id='new'):
 * - url: Server URL endpoint
 * - transport: Transport protocol ('sse' | 'http')
 * - authType: Authentication type ('none' | 'api-key' | 'bearer')
 * - apiKey: API key for authentication
 * 
 * Response:
 * - tools: Array of available tools with:
 *   - name: Tool identifier
 *   - description: Human-readable description
 *   - inputSchema: JSON Schema for tool parameters
 * 
 * Requirements: 3.1, 3.2
 */
export const GET = withAuth(async (request: NextRequest, { user, params }: AuthContext): Promise<NextResponse> => {
  const serverId = params?.id

  if (!serverId) {
    return ApiResponse.error('缺少服务器 ID', 400)
  }

  let serverConfig: MCPServerConfig

  if (serverId === 'new') {
    // Get configuration from query parameters
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get('url')
    const transport = searchParams.get('transport') || 'http'
    const authType = searchParams.get('authType') || 'none'
    const apiKey = searchParams.get('apiKey')

    if (!url) {
      return ApiResponse.error('缺少服务器 URL', 400)
    }

    if (!isValidMCPUrl(url)) {
      return ApiResponse.error('服务器 URL 格式无效，必须是有效的 HTTP/HTTPS URL', 400)
    }

    serverConfig = {
      id: `temp_${Date.now()}`,
      name: 'Temporary Server',
      url,
      transport: transport as MCPTransportType,
      authType: authType as MCPAuthType,
      apiKey: apiKey || undefined,
      timeout: 30000,
    }
  } else {
    // Get saved configuration
    const orgConfigs = getOrgConfigs(user.organizationId)
    const savedConfig = orgConfigs.get(serverId)

    if (!savedConfig) {
      return ApiResponse.error('服务器配置不存在', 404)
    }

    serverConfig = savedConfig
  }

  // Connect to server and fetch tools
  let connectionId: string | null = null
  
  try {
    const connection = await connect(serverConfig)
    connectionId = connection.id
    
    const tools = await listTools(connectionId)
    
    // Disconnect after fetching tools
    await disconnect(connectionId)
    
    return ApiResponse.success({
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      })),
      count: tools.length,
      serverName: serverConfig.name,
    })
  } catch (error) {
    // Clean up connection on error
    if (connectionId) {
      try {
        await disconnect(connectionId)
      } catch {
        // Ignore cleanup errors
      }
    }
    
    const message = error instanceof Error ? error.message : String(error)
    return ApiResponse.error(`获取工具列表失败: ${message}`, 500)
  }
})

/**
 * POST /api/mcp/servers/[id]/tools - 获取 MCP 服务器的工具列表（支持请求体配置）
 * 
 * Alternative endpoint that accepts server configuration in request body.
 * Useful when configuration contains sensitive data that shouldn't be in URL.
 * 
 * Path Parameters:
 * - id: Server configuration ID (use 'new' for testing unsaved configurations)
 * 
 * Request Body (required when id='new'):
 * - url: Server URL endpoint
 * - transport: Transport protocol ('sse' | 'http')
 * - authType: Authentication type ('none' | 'api-key' | 'bearer')
 * - apiKey: API key for authentication
 * - headers: Custom HTTP headers
 * - timeout: Connection timeout in ms
 * 
 * Response:
 * - tools: Array of available tools
 * 
 * Requirements: 3.1, 3.2
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext): Promise<NextResponse> => {
  const serverId = params?.id

  if (!serverId) {
    return ApiResponse.error('缺少服务器 ID', 400)
  }

  let serverConfig: MCPServerConfig

  if (serverId === 'new') {
    // Get configuration from request body
    const body = await request.json()

    if (!body.url) {
      return ApiResponse.error('缺少服务器 URL', 400)
    }

    if (!isValidMCPUrl(body.url)) {
      return ApiResponse.error('服务器 URL 格式无效，必须是有效的 HTTP/HTTPS URL', 400)
    }

    serverConfig = {
      id: `temp_${Date.now()}`,
      name: body.name || 'Temporary Server',
      url: body.url,
      transport: (body.transport || 'http') as MCPTransportType,
      authType: (body.authType || 'none') as MCPAuthType,
      apiKey: body.apiKey,
      headers: body.headers,
      timeout: body.timeout || 30000,
    }
  } else {
    // Get saved configuration
    const orgConfigs = getOrgConfigs(user.organizationId)
    const savedConfig = orgConfigs.get(serverId)

    if (!savedConfig) {
      return ApiResponse.error('服务器配置不存在', 404)
    }

    serverConfig = savedConfig
  }

  // Connect to server and fetch tools
  let connectionId: string | null = null
  
  try {
    const connection = await connect(serverConfig)
    connectionId = connection.id
    
    const tools = await listTools(connectionId)
    
    // Disconnect after fetching tools
    await disconnect(connectionId)
    
    return ApiResponse.success({
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      })),
      count: tools.length,
      serverName: serverConfig.name,
    })
  } catch (error) {
    // Clean up connection on error
    if (connectionId) {
      try {
        await disconnect(connectionId)
      } catch {
        // Ignore cleanup errors
      }
    }
    
    const message = error instanceof Error ? error.message : String(error)
    return ApiResponse.error(`获取工具列表失败: ${message}`, 500)
  }
})
