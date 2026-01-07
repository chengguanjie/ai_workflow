/**
 * MCP Configuration Persistence Module
 * 
 * Handles saving, loading, and validating MCP configurations.
 * Provides encryption for sensitive data like API keys.
 */

import type {
  MCPServerConfig,
  MCPSelectedTool,
  MCPToolNodeConfig,
  MCPTransportType,
  MCPAuthType,
} from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * Serialized MCP configuration for storage
 * API keys are encrypted before storage
 */
export interface SerializedMCPConfig {
  /** Server configuration with encrypted API key */
  mcpServer: {
    id: string
    name: string
    url: string
    transport: MCPTransportType
    authType: MCPAuthType
    /** Encrypted API key (if present) */
    apiKeyEncrypted?: string
    /** Indicates if API key is encrypted */
    isApiKeyEncrypted?: boolean
    headers?: Record<string, string>
    timeout?: number
    isPreset?: boolean
    presetType?: string
  }
  /** Selected tools configuration */
  selectedTools: MCPSelectedTool[]
  /** Retry configuration */
  retryOnError?: boolean
  maxRetries?: number
  timeoutMs?: number
}

/**
 * Export format for MCP configuration (without sensitive data)
 */
export interface ExportedMCPConfig {
  /** Server configuration without API key */
  mcpServer: {
    id: string
    name: string
    url: string
    transport: MCPTransportType
    authType: MCPAuthType
    headers?: Record<string, string>
    timeout?: number
    isPreset?: boolean
    presetType?: string
  }
  /** Selected tools configuration */
  selectedTools: MCPSelectedTool[]
  /** Retry configuration */
  retryOnError?: boolean
  maxRetries?: number
  timeoutMs?: number
  /** Export metadata */
  exportedAt: string
  exportVersion: string
}

/**
 * Validation result for MCP configuration
 */
export interface MCPConfigValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// ============================================================================
// Encryption Helpers (Server-side only)
// ============================================================================

/**
 * Encrypts an API key for storage
 * This function should only be called on the server side
 */
export async function encryptMCPApiKey(apiKey: string): Promise<string> {
  if (!apiKey) return ''
  
  // Dynamic import to avoid client-side issues
  try {
    const { encryptApiKey } = await import('@/lib/crypto')
    return encryptApiKey(apiKey)
  } catch {
    // If encryption fails (e.g., missing env vars), return empty
    console.warn('MCP API key encryption failed - encryption may not be configured')
    return ''
  }
}

/**
 * Decrypts an API key from storage
 * This function should only be called on the server side
 */
export async function decryptMCPApiKey(encryptedKey: string): Promise<string> {
  if (!encryptedKey) return ''
  
  try {
    const { safeDecryptApiKey } = await import('@/lib/crypto')
    return safeDecryptApiKey(encryptedKey)
  } catch {
    console.warn('MCP API key decryption failed')
    return ''
  }
}

// ============================================================================
// Configuration Serialization
// ============================================================================

/**
 * Serializes MCP configuration for storage in node config
 * Encrypts API key if present
 * 
 * @param config - The MCP tool node configuration
 * @param encryptApiKey - Whether to encrypt the API key (server-side only)
 * @returns Serialized configuration ready for storage
 */
export async function serializeMCPConfig(
  config: MCPToolNodeConfig,
  encryptApiKey = true
): Promise<SerializedMCPConfig> {
  const { mcpServer, selectedTools, retryOnError, maxRetries, timeoutMs } = config
  
  let apiKeyEncrypted: string | undefined
  let isApiKeyEncrypted = false
  
  if (mcpServer.apiKey && encryptApiKey) {
    try {
      apiKeyEncrypted = await encryptMCPApiKey(mcpServer.apiKey)
      isApiKeyEncrypted = !!apiKeyEncrypted
    } catch {
      // If encryption fails, don't store the API key
      console.warn('Failed to encrypt MCP API key')
    }
  } else if (mcpServer.apiKey && !encryptApiKey) {
    // Store unencrypted (for client-side temporary storage)
    apiKeyEncrypted = mcpServer.apiKey
    isApiKeyEncrypted = false
  }
  
  return {
    mcpServer: {
      id: mcpServer.id,
      name: mcpServer.name,
      url: mcpServer.url,
      transport: mcpServer.transport,
      authType: mcpServer.authType,
      apiKeyEncrypted,
      isApiKeyEncrypted,
      headers: mcpServer.headers,
      timeout: mcpServer.timeout,
      isPreset: mcpServer.isPreset,
      presetType: mcpServer.presetType,
    },
    selectedTools: selectedTools.map(tool => ({
      name: tool.name,
      enabled: tool.enabled,
      parameterMappings: { ...tool.parameterMappings },
    })),
    retryOnError,
    maxRetries,
    timeoutMs,
  }
}

/**
 * Deserializes MCP configuration from storage
 * Decrypts API key if encrypted
 * 
 * @param serialized - The serialized configuration from storage
 * @param decryptApiKey - Whether to decrypt the API key (server-side only)
 * @returns Deserialized MCP tool node configuration
 */
export async function deserializeMCPConfig(
  serialized: SerializedMCPConfig,
  decryptApiKey = true
): Promise<MCPToolNodeConfig> {
  const { mcpServer, selectedTools, retryOnError, maxRetries, timeoutMs } = serialized
  
  let apiKey: string | undefined
  
  if (mcpServer.apiKeyEncrypted) {
    if (mcpServer.isApiKeyEncrypted && decryptApiKey) {
      try {
        apiKey = await decryptMCPApiKey(mcpServer.apiKeyEncrypted)
      } catch {
        console.warn('Failed to decrypt MCP API key')
      }
    } else if (!mcpServer.isApiKeyEncrypted) {
      // Not encrypted, use as-is
      apiKey = mcpServer.apiKeyEncrypted
    }
  }
  
  return {
    mcpServer: {
      id: mcpServer.id,
      name: mcpServer.name,
      url: mcpServer.url,
      transport: mcpServer.transport,
      authType: mcpServer.authType,
      apiKey,
      headers: mcpServer.headers,
      timeout: mcpServer.timeout,
      isPreset: mcpServer.isPreset,
      presetType: mcpServer.presetType,
    },
    selectedTools: selectedTools.map(tool => ({
      name: tool.name,
      enabled: tool.enabled,
      parameterMappings: { ...tool.parameterMappings },
    })),
    retryOnError,
    maxRetries,
    timeoutMs,
  }
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validates an MCP server URL
 */
export function isValidMCPServerUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates MCP configuration
 * 
 * @param config - Configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateMCPConfig(
  config: Partial<MCPToolNodeConfig> | SerializedMCPConfig | null | undefined
): MCPConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  if (!config) {
    errors.push('配置为空')
    return { valid: false, errors, warnings }
  }
  
  // Check mcpServer
  const mcpServer = config.mcpServer
  if (!mcpServer) {
    errors.push('缺少服务器配置')
    return { valid: false, errors, warnings }
  }
  
  // Validate URL
  if (!mcpServer.url) {
    errors.push('缺少服务器 URL')
  } else if (!isValidMCPServerUrl(mcpServer.url)) {
    errors.push('服务器 URL 格式无效，必须是 http:// 或 https:// 开头')
  }
  
  // Validate transport
  if (mcpServer.transport && !['sse', 'http'].includes(mcpServer.transport)) {
    errors.push(`无效的传输协议: ${mcpServer.transport}`)
  }
  
  // Validate authType
  if (mcpServer.authType && !['none', 'api-key', 'bearer'].includes(mcpServer.authType)) {
    errors.push(`无效的认证类型: ${mcpServer.authType}`)
  }
  
  // Check API key requirement
  if ((mcpServer.authType === 'api-key' || mcpServer.authType === 'bearer')) {
    const hasApiKey = 'apiKey' in mcpServer 
      ? !!mcpServer.apiKey 
      : !!(mcpServer as SerializedMCPConfig['mcpServer']).apiKeyEncrypted
    
    if (!hasApiKey) {
      warnings.push('认证类型需要 API Key，但未提供')
    }
  }
  
  // Validate timeout
  if (mcpServer.timeout !== undefined) {
    if (typeof mcpServer.timeout !== 'number' || mcpServer.timeout < 0) {
      errors.push('超时时间必须是非负数')
    } else if (mcpServer.timeout < 1000) {
      warnings.push('超时时间小于 1 秒，可能导致连接失败')
    } else if (mcpServer.timeout > 300000) {
      warnings.push('超时时间超过 5 分钟，可能导致长时间等待')
    }
  }
  
  // Validate selectedTools
  const selectedTools = config.selectedTools
  if (selectedTools && Array.isArray(selectedTools)) {
    for (const tool of selectedTools) {
      if (!tool.name) {
        errors.push('工具配置缺少名称')
      }
    }
  }
  
  // Validate retry configuration
  if (config.maxRetries !== undefined) {
    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
      errors.push('最大重试次数必须是非负整数')
    } else if (config.maxRetries > 10) {
      warnings.push('最大重试次数超过 10 次，可能导致长时间执行')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================================
// Import/Export Functions
// ============================================================================

/**
 * Exports MCP configuration without sensitive data
 * 
 * @param config - Configuration to export
 * @returns Exported configuration without API keys
 */
export function exportMCPConfig(
  config: MCPToolNodeConfig | SerializedMCPConfig
): ExportedMCPConfig {
  const mcpServer = config.mcpServer
  
  return {
    mcpServer: {
      id: mcpServer.id,
      name: mcpServer.name,
      url: mcpServer.url,
      transport: mcpServer.transport,
      authType: mcpServer.authType,
      headers: mcpServer.headers,
      timeout: mcpServer.timeout,
      isPreset: mcpServer.isPreset,
      presetType: mcpServer.presetType,
    },
    selectedTools: config.selectedTools.map(tool => ({
      name: tool.name,
      enabled: tool.enabled,
      parameterMappings: { ...tool.parameterMappings },
    })),
    retryOnError: config.retryOnError,
    maxRetries: config.maxRetries,
    timeoutMs: config.timeoutMs,
    exportedAt: new Date().toISOString(),
    exportVersion: '1.0.0',
  }
}

/**
 * Imports MCP configuration from exported format
 * 
 * @param exported - Exported configuration to import
 * @returns Imported configuration (API key will need to be set separately)
 */
export function importMCPConfig(exported: ExportedMCPConfig): MCPToolNodeConfig {
  const { mcpServer, selectedTools, retryOnError, maxRetries, timeoutMs } = exported
  
  return {
    mcpServer: {
      id: mcpServer.id || `mcp_${Date.now()}`,
      name: mcpServer.name,
      url: mcpServer.url,
      transport: mcpServer.transport,
      authType: mcpServer.authType,
      // API key is not included in export
      headers: mcpServer.headers,
      timeout: mcpServer.timeout,
      isPreset: mcpServer.isPreset,
      presetType: mcpServer.presetType,
    },
    selectedTools: selectedTools.map(tool => ({
      name: tool.name,
      enabled: tool.enabled,
      parameterMappings: { ...tool.parameterMappings },
    })),
    retryOnError,
    maxRetries,
    timeoutMs,
  }
}

/**
 * Converts exported config to JSON string for download
 */
export function exportMCPConfigToJSON(config: MCPToolNodeConfig | SerializedMCPConfig): string {
  const exported = exportMCPConfig(config)
  return JSON.stringify(exported, null, 2)
}

/**
 * Parses imported JSON and validates it
 */
export function importMCPConfigFromJSON(json: string): {
  config: MCPToolNodeConfig | null
  validation: MCPConfigValidationResult
} {
  try {
    const parsed = JSON.parse(json) as ExportedMCPConfig
    
    // Basic structure validation
    if (!parsed.mcpServer || !parsed.selectedTools) {
      return {
        config: null,
        validation: {
          valid: false,
          errors: ['无效的配置格式：缺少必要字段'],
          warnings: [],
        },
      }
    }
    
    const config = importMCPConfig(parsed)
    const validation = validateMCPConfig(config)
    
    // Add warning about missing API key
    if (config.mcpServer.authType !== 'none') {
      validation.warnings.push('导入的配置不包含 API Key，请手动配置')
    }
    
    return { config, validation }
  } catch (error) {
    return {
      config: null,
      validation: {
        valid: false,
        errors: [`JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`],
        warnings: [],
      },
    }
  }
}

// ============================================================================
// Node Config Integration
// ============================================================================

/**
 * Extracts MCP configuration from node config object
 */
export function extractMCPConfigFromNodeConfig(
  nodeConfig: Record<string, unknown>
): Partial<MCPToolNodeConfig> | null {
  // Check if this is an MCP tool configuration
  if (!nodeConfig.serverUrl && !nodeConfig.mcpServer) {
    return null
  }
  
  // Handle flat config format (from UI)
  if (nodeConfig.serverUrl) {
    return {
      mcpServer: {
        id: (nodeConfig.serverId as string) || `mcp_${Date.now()}`,
        name: (nodeConfig.serverName as string) || '',
        url: nodeConfig.serverUrl as string,
        transport: (nodeConfig.transport as MCPTransportType) || 'http',
        authType: (nodeConfig.authType as MCPAuthType) || 'none',
        apiKey: nodeConfig.apiKey as string | undefined,
        timeout: nodeConfig.timeout as number | undefined,
        isPreset: !!nodeConfig.presetType,
        presetType: nodeConfig.presetType as string | undefined,
      },
      selectedTools: (nodeConfig.selectedTools as MCPSelectedTool[]) || [],
      retryOnError: nodeConfig.retryOnError as boolean | undefined,
      maxRetries: nodeConfig.maxRetries as number | undefined,
      timeoutMs: nodeConfig.timeoutMs as number | undefined,
    }
  }
  
  // Handle nested config format (from storage)
  if (nodeConfig.mcpServer) {
    return nodeConfig as unknown as MCPToolNodeConfig
  }
  
  return null
}

/**
 * Converts MCP configuration to flat node config format for UI
 */
export function mcpConfigToNodeConfig(config: MCPToolNodeConfig): Record<string, unknown> {
  return {
    serverId: config.mcpServer.id,
    serverName: config.mcpServer.name,
    serverUrl: config.mcpServer.url,
    transport: config.mcpServer.transport,
    authType: config.mcpServer.authType,
    apiKey: config.mcpServer.apiKey,
    timeout: config.mcpServer.timeout,
    presetType: config.mcpServer.presetType,
    selectedTools: config.selectedTools,
    retryOnError: config.retryOnError,
    maxRetries: config.maxRetries,
    timeoutMs: config.timeoutMs,
  }
}

/**
 * Saves MCP configuration to node config with encryption
 * This is the main function to call when saving node configuration
 */
export async function saveMCPConfigToNode(
  nodeConfig: Record<string, unknown>,
  encrypt = true
): Promise<Record<string, unknown>> {
  const mcpConfig = extractMCPConfigFromNodeConfig(nodeConfig)
  
  if (!mcpConfig || !mcpConfig.mcpServer) {
    return nodeConfig
  }
  
  // Serialize with encryption
  const serialized = await serializeMCPConfig(
    mcpConfig as MCPToolNodeConfig,
    encrypt
  )
  
  // Return updated node config with serialized MCP config
  return {
    ...nodeConfig,
    mcpServer: serialized.mcpServer,
    selectedTools: serialized.selectedTools,
    retryOnError: serialized.retryOnError,
    maxRetries: serialized.maxRetries,
    timeoutMs: serialized.timeoutMs,
    // Remove flat format fields
    serverUrl: undefined,
    serverName: undefined,
    serverId: undefined,
    apiKey: undefined,
  }
}

/**
 * Loads MCP configuration from node config with decryption
 * This is the main function to call when loading node configuration
 */
export async function loadMCPConfigFromNode(
  nodeConfig: Record<string, unknown>,
  decrypt = true
): Promise<Record<string, unknown>> {
  // Check if this has serialized MCP config
  if (!nodeConfig.mcpServer) {
    return nodeConfig
  }
  
  const serialized = nodeConfig as unknown as SerializedMCPConfig
  
  // Deserialize with decryption
  const deserialized = await deserializeMCPConfig(serialized, decrypt)
  
  // Convert to flat format for UI
  return mcpConfigToNodeConfig(deserialized)
}
