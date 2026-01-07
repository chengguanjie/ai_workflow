/**
 * MCP (Model Context Protocol) Client Service
 * 
 * This module provides a client service for connecting to MCP servers,
 * discovering tools, and executing tool calls.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  type MCPServerConfig,
  type MCPConnection,
  type MCPTool,
  type MCPToolResult,
  type MCPCapabilities,
  type MCPServerInfo,
} from './types'
import {
  MCPErrorCode,
  MCPError,
  createMCPError,
  isRetryableError,
} from './errors'

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validates if a string is a valid HTTP/HTTPS URL
 * @param url - The URL string to validate
 * @returns true if valid HTTP/HTTPS URL, false otherwise
 */
export function isValidMCPUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }
  
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ============================================================================
// Connection Management
// ============================================================================

/** Active connections map */
const connections = new Map<string, {
  client: Client
  transport: Transport
  config: MCPServerConfig
}>()

/** Generate a unique connection ID */
function generateConnectionId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Creates a transport based on the server configuration
 */
function createTransport(config: MCPServerConfig): Transport {
  const url = new URL(config.url)
  
  // Build request headers
  const headers: Record<string, string> = {
    ...config.headers,
  }
  
  // Add authentication headers
  if (config.authType === 'api-key' && config.apiKey) {
    headers['X-API-Key'] = config.apiKey
  } else if (config.authType === 'bearer' && config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  
  const requestInit: RequestInit = {
    headers,
  }
  
  if (config.transport === 'sse') {
    // Use SSE transport (deprecated but still supported by some servers)
    return new SSEClientTransport(url, {
      requestInit,
      eventSourceInit: {
        fetch: (input, init) => {
          return fetch(input, {
            ...init,
            headers: {
              ...init?.headers,
              ...headers,
            },
          })
        },
      },
    })
  } else {
    // Use Streamable HTTP transport (recommended)
    return new StreamableHTTPClientTransport(url, {
      requestInit,
      reconnectionOptions: {
        maxReconnectionDelay: 30000,
        initialReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 3,
      },
    })
  }
}

/**
 * Connects to an MCP server
 * @param config - Server configuration
 * @returns Connection object with server info and capabilities
 */
export async function connect(config: MCPServerConfig): Promise<MCPConnection> {
  // Validate URL
  if (!isValidMCPUrl(config.url)) {
    throw new MCPError(
      MCPErrorCode.INVALID_URL,
      `Invalid MCP server URL: ${config.url}`,
      { details: { url: config.url } }
    )
  }
  
  const connectionId = config.id || generateConnectionId()
  
  // Check if already connected
  if (connections.has(connectionId)) {
    const existing = connections.get(connectionId)!
    return {
      id: connectionId,
      config: existing.config,
      status: 'connected',
      connectedAt: new Date(),
    }
  }
  
  try {
    // Create client
    const client = new Client(
      {
        name: 'workflow-mcp-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    )
    
    // Create transport
    const transport = createTransport(config)
    
    // Set up timeout
    const timeout = config.timeout || 30000
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new MCPError(
          MCPErrorCode.TIMEOUT,
          `Connection timeout after ${timeout}ms`,
          { details: { timeout } }
        ))
      }, timeout)
    })
    
    // Connect with timeout
    await Promise.race([
      client.connect(transport),
      timeoutPromise,
    ])
    
    // Get server info
    const serverVersion = client.getServerVersion()
    const serverCapabilities = client.getServerCapabilities()
    
    const serverInfo: MCPServerInfo = {
      name: serverVersion?.name || 'Unknown',
      version: serverVersion?.version || 'Unknown',
    }
    
    const capabilities: MCPCapabilities = {
      tools: serverCapabilities?.tools,
      resources: serverCapabilities?.resources,
      prompts: serverCapabilities?.prompts,
      logging: serverCapabilities?.logging as Record<string, unknown> | undefined,
      experimental: serverCapabilities?.experimental as Record<string, unknown> | undefined,
    }
    
    // Store connection
    connections.set(connectionId, {
      client,
      transport,
      config: { ...config, id: connectionId },
    })
    
    return {
      id: connectionId,
      config: { ...config, id: connectionId },
      serverInfo,
      capabilities,
      status: 'connected',
      connectedAt: new Date(),
    }
  } catch (error) {
    // Handle specific error types
    if (error instanceof MCPError) {
      throw error
    }
    
    // Use createMCPError to classify and wrap the error
    throw createMCPError(error)
  }
}

/**
 * Disconnects from an MCP server
 * @param connectionId - The connection ID to disconnect
 */
export async function disconnect(connectionId: string): Promise<void> {
  const connection = connections.get(connectionId)
  if (!connection) {
    return // Already disconnected
  }
  
  try {
    await connection.transport.close()
  } catch {
    // Ignore close errors
  } finally {
    connections.delete(connectionId)
  }
}

/**
 * Gets the current connection status
 * @param connectionId - The connection ID to check
 * @returns Connection object or null if not connected
 */
export function getConnection(connectionId: string): MCPConnection | null {
  const connection = connections.get(connectionId)
  if (!connection) {
    return null
  }
  
  return {
    id: connectionId,
    config: connection.config,
    status: 'connected',
  }
}

/**
 * Lists all active connections
 * @returns Array of connection IDs
 */
export function listConnections(): string[] {
  return Array.from(connections.keys())
}

// ============================================================================
// Tool Operations
// ============================================================================

/**
 * Lists available tools from a connected MCP server
 * @param connectionId - The connection ID
 * @returns Array of available tools
 */
export async function listTools(connectionId: string): Promise<MCPTool[]> {
  const connection = connections.get(connectionId)
  if (!connection) {
    throw new MCPError(
      MCPErrorCode.CONNECTION_CLOSED,
      'Not connected to MCP server',
      { details: { connectionId } }
    )
  }
  
  try {
    const result = await connection.client.listTools()
    
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object' as const,
        properties: tool.inputSchema.properties as Record<string, import('./types').JSONSchema> | undefined,
        required: tool.inputSchema.required,
        additionalProperties: tool.inputSchema.additionalProperties as boolean | undefined,
      },
    }))
  } catch (error) {
    throw createMCPError(error, { defaultCode: MCPErrorCode.PROTOCOL_ERROR })
  }
}

/**
 * Calls a tool on a connected MCP server
 * @param connectionId - The connection ID
 * @param toolName - Name of the tool to call
 * @param args - Arguments to pass to the tool
 * @returns Tool execution result
 */
export async function callTool(
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const connection = connections.get(connectionId)
  if (!connection) {
    throw new MCPError(
      MCPErrorCode.CONNECTION_CLOSED,
      'Not connected to MCP server',
      { details: { connectionId } }
    )
  }
  
  try {
    const result = await connection.client.callTool({
      name: toolName,
      arguments: args,
    })
    
    // Handle the result - check if it's the standard format or compatibility format
    if ('content' in result && Array.isArray(result.content)) {
      return {
        content: result.content.map((item) => {
          if (item.type === 'text') {
            return {
              type: 'text' as const,
              text: item.text,
            }
          } else if (item.type === 'image') {
            return {
              type: 'image' as const,
              data: item.data,
              mimeType: item.mimeType,
            }
          } else if (item.type === 'resource') {
            const resource = item.resource
            return {
              type: 'resource' as const,
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: 'text' in resource ? resource.text : undefined,
              data: 'blob' in resource ? resource.blob : undefined,
            }
          }
          // Default to text for unknown types
          return {
            type: 'text' as const,
            text: JSON.stringify(item),
          }
        }),
        isError: result.isError === true,
      }
    }
    
    // Handle compatibility format (toolResult)
    if ('toolResult' in result) {
      return {
        content: [{
          type: 'text',
          text: typeof result.toolResult === 'string' 
            ? result.toolResult 
            : JSON.stringify(result.toolResult),
        }],
        isError: false,
      }
    }
    
    // Fallback - wrap result as text
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result),
      }],
      isError: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    // Check for tool not found
    if (message.includes('not found') || message.includes('unknown tool')) {
      throw new MCPError(
        MCPErrorCode.TOOL_NOT_FOUND,
        `Tool '${toolName}' not found on server`,
        { details: { toolName, originalError: message } }
      )
    }
    
    // Check for invalid parameters
    if (message.includes('invalid') || message.includes('validation')) {
      throw new MCPError(
        MCPErrorCode.INVALID_PARAMS,
        `Invalid parameters for tool '${toolName}': ${message}`,
        { details: { toolName, args, originalError: message } }
      )
    }
    
    throw new MCPError(
      MCPErrorCode.EXECUTION_ERROR,
      `Tool execution failed: ${message}`,
      { details: { toolName, args, originalError: message } }
    )
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Tests connection to an MCP server without maintaining the connection
 * @param config - Server configuration to test
 * @returns Connection info if successful
 */
export async function testConnection(config: MCPServerConfig): Promise<{
  success: boolean
  serverInfo?: MCPServerInfo
  capabilities?: MCPCapabilities
  tools?: MCPTool[]
  error?: string
  errorCode?: MCPErrorCode
  suggestions?: string[]
}> {
  const testConfig = { ...config, id: `test_${Date.now()}` }
  
  try {
    const connection = await connect(testConfig)
    const tools = await listTools(connection.id)
    
    // Disconnect after test
    await disconnect(connection.id)
    
    return {
      success: true,
      serverInfo: connection.serverInfo,
      capabilities: connection.capabilities,
      tools,
    }
  } catch (error) {
    // Make sure to clean up
    try {
      await disconnect(testConfig.id)
    } catch {
      // Ignore cleanup errors
    }
    
    if (error instanceof MCPError) {
      return {
        success: false,
        error: error.getUserMessage(),
        errorCode: error.code,
        suggestions: error.getSuggestions(),
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Creates a one-shot tool call (connect, call, disconnect)
 * @param config - Server configuration
 * @param toolName - Tool to call
 * @param args - Tool arguments
 * @returns Tool result
 */
export async function callToolOneShot(
  config: MCPServerConfig,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const connection = await connect(config)
  
  try {
    return await callTool(connection.id, toolName, args)
  } finally {
    await disconnect(connection.id)
  }
}

// ============================================================================
// Export MCP Client Interface
// ============================================================================

export interface MCPClient {
  connect: typeof connect
  disconnect: typeof disconnect
  listTools: typeof listTools
  callTool: typeof callTool
  testConnection: typeof testConnection
  callToolOneShot: typeof callToolOneShot
  getConnection: typeof getConnection
  listConnections: typeof listConnections
  isValidMCPUrl: typeof isValidMCPUrl
}

export const mcpClient: MCPClient = {
  connect,
  disconnect,
  listTools,
  callTool,
  testConnection,
  callToolOneShot,
  getConnection,
  listConnections,
  isValidMCPUrl,
}

export default mcpClient
