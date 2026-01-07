import type { MCPServerConfig, MCPTransportType, MCPAuthType } from '@/lib/mcp/types'
import { isValidMCPUrl } from '@/lib/mcp/client'

/**
 * In-memory storage for MCP server configurations
 *
 * In production, this should be persisted to database.
 * Keyed by organizationId -> serverId -> config.
 */
const mcpServerConfigs = new Map<string, Map<string, MCPServerConfig>>()

export function getOrgConfigs(organizationId: string): Map<string, MCPServerConfig> {
  if (!mcpServerConfigs.has(organizationId)) {
    mcpServerConfigs.set(organizationId, new Map())
  }
  return mcpServerConfigs.get(organizationId)!
}

export function generateServerId(): string {
  return `mcp_server_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function validateServerConfig(config: Partial<MCPServerConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Required fields
  if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
    errors.push('服务器名称不能为空')
  }

  if (!config.url || typeof config.url !== 'string') {
    errors.push('服务器 URL 不能为空')
  } else if (!isValidMCPUrl(config.url)) {
    errors.push('服务器 URL 格式无效，必须是有效的 HTTP/HTTPS URL')
  }

  // Transport type validation
  const validTransports: MCPTransportType[] = ['sse', 'http']
  if (config.transport && !validTransports.includes(config.transport)) {
    errors.push(`传输协议无效，必须是: ${validTransports.join(', ')}`)
  }

  // Auth type validation
  const validAuthTypes: MCPAuthType[] = ['none', 'api-key', 'bearer']
  if (config.authType && !validAuthTypes.includes(config.authType)) {
    errors.push(`认证类型无效，必须是: ${validAuthTypes.join(', ')}`)
  }

  // API key required for certain auth types
  if ((config.authType === 'api-key' || config.authType === 'bearer') && !config.apiKey) {
    errors.push('使用 API Key 或 Bearer Token 认证时，必须提供 API Key')
  }

  // Timeout validation
  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout < 1000 || config.timeout > 300000) {
      errors.push('超时时间必须在 1000ms 到 300000ms 之间')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

