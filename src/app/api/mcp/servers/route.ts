/**
 * MCP Server Configuration API
 * 
 * Provides endpoints for managing MCP server configurations.
 * Supports adding new servers and listing existing configurations.
 * 
 * Requirements: 1.6, 6.1
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { ValidationError } from '@/lib/errors'
import { getOrgConfigs, generateServerId, validateServerConfig } from '@/lib/mcp/server-config-store'
import type { MCPServerConfig, MCPTransportType, MCPAuthType } from '@/lib/mcp/types'

/**
 * GET /api/mcp/servers - 获取 MCP 服务器配置列表
 * 
 * Returns all MCP server configurations for the user's organization.
 * 
 * Requirements: 6.1
 */
export const GET = withAuth(async (_request: NextRequest, { user }: AuthContext) => {
  const orgConfigs = getOrgConfigs(user.organizationId)
  
  // Convert to array and remove sensitive data
  const servers = Array.from(orgConfigs.values()).map(config => ({
    id: config.id,
    name: config.name,
    url: config.url,
    transport: config.transport,
    authType: config.authType,
    hasApiKey: !!config.apiKey,
    headers: config.headers,
    timeout: config.timeout,
    isPreset: config.isPreset,
    presetType: config.presetType,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }))

  return ApiResponse.success({
    servers,
    total: servers.length,
  }) as ReturnType<typeof ApiResponse.success>
})

/**
 * POST /api/mcp/servers - 添加 MCP 服务器配置
 * 
 * Creates a new MCP server configuration.
 * 
 * Request Body:
 * - name: Server display name (required)
 * - url: Server URL endpoint (required)
 * - transport: Transport protocol ('sse' | 'http', default: 'http')
 * - authType: Authentication type ('none' | 'api-key' | 'bearer', default: 'none')
 * - apiKey: API key for authentication (optional)
 * - headers: Custom HTTP headers (optional)
 * - timeout: Connection timeout in ms (optional, default: 30000)
 * 
 * Requirements: 1.6, 6.1
 */
export const POST = withAuth(async (request: NextRequest, { user }: AuthContext) => {
  const body = await request.json()

  // Build configuration with defaults
  const config: Partial<MCPServerConfig> = {
    name: body.name,
    url: body.url,
    transport: body.transport || 'http',
    authType: body.authType || 'none',
    apiKey: body.apiKey,
    headers: body.headers,
    timeout: body.timeout || 30000,
    isPreset: body.isPreset || false,
    presetType: body.presetType,
  }

  // Validate configuration
  const validation = validateServerConfig(config)
  if (!validation.valid) {
    throw new ValidationError('配置验证失败', { errors: validation.errors })
  }

  // Generate ID and timestamps
  const serverId = generateServerId()
  const now = new Date()

  const serverConfig: MCPServerConfig = {
    id: serverId,
    name: config.name!,
    url: config.url!,
    transport: config.transport as MCPTransportType,
    authType: config.authType as MCPAuthType,
    apiKey: config.apiKey,
    headers: config.headers,
    timeout: config.timeout,
    isPreset: config.isPreset,
    presetType: config.presetType,
    createdAt: now,
    updatedAt: now,
  }

  // Store configuration
  const orgConfigs = getOrgConfigs(user.organizationId)
  orgConfigs.set(serverId, serverConfig)

  // Return created config (without sensitive data)
  return ApiResponse.created({
    id: serverConfig.id,
    name: serverConfig.name,
    url: serverConfig.url,
    transport: serverConfig.transport,
    authType: serverConfig.authType,
    hasApiKey: !!serverConfig.apiKey,
    headers: serverConfig.headers,
    timeout: serverConfig.timeout,
    isPreset: serverConfig.isPreset,
    presetType: serverConfig.presetType,
    createdAt: serverConfig.createdAt,
    updatedAt: serverConfig.updatedAt,
  }) as ReturnType<typeof ApiResponse.created>
})
