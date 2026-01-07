'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Server,
  Key,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Settings,
  RefreshCw,
  AlertCircle,
  Download,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { VariableInput } from './variable-input'
import type {
  MCPTransportType,
  MCPAuthType,
  MCPTool,
  MCPSelectedTool,
  JSONSchema,
  MCPToolNodeConfig,
} from '@/lib/mcp/types'
import { MODELSCOPE_MCP_PRESETS } from '@/lib/mcp/types'
import {
  validateMCPConfig,
  exportMCPConfigToJSON,
  importMCPConfigFromJSON,
  type MCPConfigValidationResult,
  type SerializedMCPConfig,
} from '@/lib/mcp/config-persistence'

// ============================================================================
// Types
// ============================================================================

export interface MCPToolConfigProps {
  config: Record<string, unknown>
  onConfigChange: (updates: Record<string, unknown>) => void
}

interface ConnectionTestResult {
  success: boolean
  serverInfo?: {
    name: string
    version: string
  }
  tools?: MCPTool[]
  error?: string
}

// ============================================================================
// Main Component
// ============================================================================

export function MCPToolConfig({ config, onConfigChange }: MCPToolConfigProps) {
  // Handle both flat config format (from UI) and serialized format (from storage)
  const isSerializedFormat = !!config.mcpServer
  
  // Extract configuration values - support both formats
  const serverUrl = isSerializedFormat 
    ? ((config.mcpServer as SerializedMCPConfig['mcpServer'])?.url || '')
    : (config.serverUrl as string) || ''
  const serverName = isSerializedFormat
    ? ((config.mcpServer as SerializedMCPConfig['mcpServer'])?.name || '')
    : (config.serverName as string) || ''
  const transport = isSerializedFormat
    ? ((config.mcpServer as SerializedMCPConfig['mcpServer'])?.transport || 'http')
    : (config.transport as MCPTransportType) || 'http'
  const authType = isSerializedFormat
    ? ((config.mcpServer as SerializedMCPConfig['mcpServer'])?.authType || 'none')
    : (config.authType as MCPAuthType) || 'none'
  const apiKey = isSerializedFormat
    ? '' // API key is encrypted in serialized format, don't show
    : (config.apiKey as string) || ''
  const timeout = isSerializedFormat
    ? ((config.mcpServer as SerializedMCPConfig['mcpServer'])?.timeout || 30000)
    : (config.timeout as number) || 30000
  const selectedTools = (config.selectedTools as MCPSelectedTool[]) || []
  const presetType = isSerializedFormat
    ? ((config.mcpServer as SerializedMCPConfig['mcpServer'])?.presetType || '')
    : (config.presetType as string) || ''
  
  // Check if API key is encrypted (from storage)
  const hasEncryptedApiKey = isSerializedFormat && 
    !!(config.mcpServer as SerializedMCPConfig['mcpServer'])?.apiKeyEncrypted

  // UI state
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null)
  const [availableTools, setAvailableTools] = useState<MCPTool[]>([])
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [validationResult, setValidationResult] = useState<MCPConfigValidationResult | null>(null)
  
  // Validate configuration on mount and when config changes
  useEffect(() => {
    if (serverUrl) {
      const result = validateMCPConfig({
        mcpServer: {
          id: (config.serverId as string) || 'temp',
          name: serverName,
          url: serverUrl,
          transport,
          authType,
          apiKey: apiKey || undefined,
          timeout,
          presetType: presetType || undefined,
        },
        selectedTools,
      })
      setValidationResult(result)
    } else {
      setValidationResult(null)
    }
  }, [serverUrl, serverName, transport, authType, apiKey, timeout, selectedTools, presetType, config.serverId])
  
  // Convert serialized format to flat format on initial load
  useEffect(() => {
    if (isSerializedFormat) {
      const mcpServer = config.mcpServer as SerializedMCPConfig['mcpServer']
      // Convert to flat format for UI editing
      onConfigChange({
        serverUrl: mcpServer.url,
        serverName: mcpServer.name,
        transport: mcpServer.transport,
        authType: mcpServer.authType,
        timeout: mcpServer.timeout,
        presetType: mcpServer.presetType,
        selectedTools: config.selectedTools,
        retryOnError: config.retryOnError,
        maxRetries: config.maxRetries,
        timeoutMs: config.timeoutMs,
        // Keep encrypted key reference for server-side use
        _hasEncryptedApiKey: !!mcpServer.apiKeyEncrypted,
        // Clear serialized format
        mcpServer: undefined,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Handle export configuration
  const handleExportConfig = useCallback(() => {
    if (!serverUrl) return
    
    const configToExport: MCPToolNodeConfig = {
      mcpServer: {
        id: (config.serverId as string) || `mcp_${Date.now()}`,
        name: serverName,
        url: serverUrl,
        transport,
        authType,
        // API key is NOT included in export for security
        timeout,
        presetType: presetType || undefined,
      },
      selectedTools,
    }
    
    const json = exportMCPConfigToJSON(configToExport)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `mcp-config-${serverName || 'export'}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [serverUrl, serverName, transport, authType, timeout, presetType, selectedTools, config.serverId])

  // Handle import configuration
  const handleImportConfig = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setImportError(null)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const { config: importedConfig, validation } = importMCPConfigFromJSON(content)
      
      if (!importedConfig) {
        setImportError(validation.errors[0] || '导入失败')
        return
      }
      
      // Apply imported configuration
      onConfigChange({
        serverUrl: importedConfig.mcpServer.url,
        serverName: importedConfig.mcpServer.name,
        transport: importedConfig.mcpServer.transport,
        authType: importedConfig.mcpServer.authType,
        timeout: importedConfig.mcpServer.timeout,
        presetType: importedConfig.mcpServer.presetType,
        selectedTools: importedConfig.selectedTools,
        retryOnError: importedConfig.retryOnError,
        maxRetries: importedConfig.maxRetries,
        timeoutMs: importedConfig.timeoutMs,
        // Clear API key - user needs to re-enter
        apiKey: '',
      })
      
      // Show warning if there are validation warnings
      if (validation.warnings.length > 0) {
        setImportError(`导入成功，但有警告: ${validation.warnings.join(', ')}`)
      }
    }
    
    reader.onerror = () => {
      setImportError('读取文件失败')
    }
    
    reader.readAsText(file)
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onConfigChange])

  // Handle preset selection
  const handlePresetSelect = useCallback((presetId: string) => {
    if (presetId === 'custom') {
      onConfigChange({
        presetType: '',
        serverUrl: '',
        serverName: '',
      })
      return
    }

    const preset = MODELSCOPE_MCP_PRESETS[presetId]
    if (preset) {
      onConfigChange({
        presetType: presetId,
        serverUrl: preset.url,
        serverName: preset.name,
        transport: 'http',
        authType: 'api-key',
      })
    }
  }, [onConfigChange])

  // Test connection to MCP server
  const handleTestConnection = useCallback(async () => {
    if (!serverUrl) {
      setConnectionResult({
        success: false,
        error: '请输入服务器 URL',
      })
      return
    }

    setIsTestingConnection(true)
    setConnectionResult(null)

    try {
      const response = await fetch('/api/mcp/servers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: serverUrl,
          transport,
          authType,
          apiKey: apiKey || undefined,
          timeout,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setConnectionResult({
          success: true,
          serverInfo: data.data?.serverInfo,
          tools: data.data?.tools || [],
        })
        setAvailableTools(data.data?.tools || [])
      } else {
        setConnectionResult({
          success: false,
          error: data.error?.message || '连接失败',
        })
      }
    } catch (error) {
      setConnectionResult({
        success: false,
        error: error instanceof Error ? error.message : '连接测试失败',
      })
    } finally {
      setIsTestingConnection(false)
    }
  }, [serverUrl, transport, authType, apiKey, timeout])

  // Toggle tool selection
  const handleToggleTool = useCallback((tool: MCPTool, enabled: boolean) => {
    const existingIndex = selectedTools.findIndex(t => t.name === tool.name)
    
    if (enabled) {
      if (existingIndex === -1) {
        // Add new tool
        const newTool: MCPSelectedTool = {
          name: tool.name,
          enabled: true,
          parameterMappings: {},
        }
        onConfigChange({
          selectedTools: [...selectedTools, newTool],
        })
      } else {
        // Enable existing tool
        const updated = [...selectedTools]
        updated[existingIndex] = { ...updated[existingIndex], enabled: true }
        onConfigChange({ selectedTools: updated })
      }
    } else {
      if (existingIndex !== -1) {
        // Disable tool
        const updated = [...selectedTools]
        updated[existingIndex] = { ...updated[existingIndex], enabled: false }
        onConfigChange({ selectedTools: updated })
      }
    }
  }, [selectedTools, onConfigChange])

  // Update tool parameter mapping
  const handleUpdateToolParameter = useCallback((
    toolName: string,
    paramName: string,
    value: string
  ) => {
    const toolIndex = selectedTools.findIndex(t => t.name === toolName)
    if (toolIndex === -1) return

    const updated = [...selectedTools]
    updated[toolIndex] = {
      ...updated[toolIndex],
      parameterMappings: {
        ...updated[toolIndex].parameterMappings,
        [paramName]: value,
      },
    }
    onConfigChange({ selectedTools: updated })
  }, [selectedTools, onConfigChange])

  return (
    <div className="space-y-4">
      {/* Preset Selection */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">MCP 服务预设</Label>
          <a
            href="https://modelscope.cn/docs/mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-500 hover:text-blue-600 hover:underline"
          >
            查看魔搭 MCP 文档 →
          </a>
        </div>
        <Select
          value={presetType || 'custom'}
          onValueChange={handlePresetSelect}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="选择预设或自定义" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">
              <div className="flex items-center gap-2">
                <Settings className="h-3 w-3 text-gray-500" />
                <span>自定义 MCP 服务器</span>
              </div>
            </SelectItem>
            {/* 数据获取类 */}
            {Object.entries(MODELSCOPE_MCP_PRESETS)
              .filter(([, preset]) => preset.category === 'data')
              .map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-blue-500" />
                    <span>{preset.name}</span>
                  </div>
                </SelectItem>
              ))}
            {/* 搜索类 */}
            {Object.entries(MODELSCOPE_MCP_PRESETS)
              .filter(([, preset]) => preset.category === 'search')
              .map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-green-500" />
                    <span>{preset.name}</span>
                  </div>
                </SelectItem>
              ))}
            {/* 工具类 */}
            {Object.entries(MODELSCOPE_MCP_PRESETS)
              .filter(([, preset]) => preset.category === 'utility')
              .map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Settings className="h-3 w-3 text-orange-500" />
                    <span>{preset.name}</span>
                  </div>
                </SelectItem>
              ))}
            {/* AI 类 */}
            {Object.entries(MODELSCOPE_MCP_PRESETS)
              .filter(([, preset]) => preset.category === 'ai')
              .map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Server className="h-3 w-3 text-purple-500" />
                    <span>{preset.name}</span>
                  </div>
                </SelectItem>
              ))}
            {/* 未分类 */}
            {Object.entries(MODELSCOPE_MCP_PRESETS)
              .filter(([, preset]) => !preset.category)
              .map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Server className="h-3 w-3 text-gray-500" />
                    <span>{preset.name}</span>
                  </div>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {presetType && MODELSCOPE_MCP_PRESETS[presetType] && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">
              {MODELSCOPE_MCP_PRESETS[presetType].description}
            </p>
            <div className="flex flex-wrap gap-1">
              {MODELSCOPE_MCP_PRESETS[presetType].tools.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-[10px] h-4">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Server URL */}
      <div className="space-y-1.5">
        <Label className="text-xs">服务器 URL</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <VariableInput
              value={serverUrl}
              onChange={(value) => onConfigChange({ serverUrl: value })}
              placeholder="https://mcp.modelscope.cn/servers/..."
              type="url"
            />
          </div>
        </div>
      </div>

      {/* Server Name */}
      <div className="space-y-1.5">
        <Label className="text-xs">服务器名称</Label>
        <Input
          value={serverName}
          onChange={(e) => onConfigChange({ serverName: e.target.value })}
          placeholder="输入服务器显示名称"
          className="h-8 text-xs"
        />
      </div>

      {/* Transport Protocol */}
      <div className="space-y-1.5">
        <Label className="text-xs">传输协议</Label>
        <Select
          value={transport}
          onValueChange={(value) => onConfigChange({ transport: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">
              <div className="flex items-center gap-2">
                <Globe className="h-3 w-3" />
                <span>HTTP (推荐)</span>
              </div>
            </SelectItem>
            <SelectItem value="sse">
              <div className="flex items-center gap-2">
                <Server className="h-3 w-3" />
                <span>SSE (Server-Sent Events)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Authentication */}
      <div className="space-y-1.5">
        <Label className="text-xs">认证方式</Label>
        <Select
          value={authType}
          onValueChange={(value) => onConfigChange({ authType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">无需认证</SelectItem>
            <SelectItem value="api-key">API Key</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* API Key Input */}
      {(authType === 'api-key' || authType === 'bearer') && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {authType === 'api-key' ? 'API Key' : 'Bearer Token'}
          </Label>
          <div className="relative">
            <Key className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => onConfigChange({ apiKey: e.target.value })}
              placeholder={authType === 'api-key' ? '输入 API Key' : '输入 Bearer Token'}
              className="h-8 text-xs pl-7"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {authType === 'api-key' 
              ? '将作为 X-API-Key 请求头发送'
              : '将作为 Authorization: Bearer 请求头发送'
            }
          </p>
        </div>
      )}

      {/* Advanced Settings */}
      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {isAdvancedOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <Settings className="h-3 w-3" />
          <span>高级设置</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">超时时间 (毫秒)</Label>
            <Input
              type="number"
              min={1000}
              max={300000}
              value={timeout}
              onChange={(e) => onConfigChange({ timeout: parseInt(e.target.value) || 30000 })}
              className="h-8 text-xs"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Encrypted API Key Indicator */}
      {hasEncryptedApiKey && (authType === 'api-key' || authType === 'bearer') && !apiKey && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
          <Key className="h-3 w-3 text-blue-500" />
          <span className="text-[10px] text-blue-600 dark:text-blue-400">
            已保存加密的 API Key（如需更新请重新输入）
          </span>
        </div>
      )}

      {/* Validation Warnings */}
      {validationResult && validationResult.warnings.length > 0 && (
        <div className="space-y-1">
          {validationResult.warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800"
            >
              <AlertCircle className="h-3 w-3 text-yellow-500 flex-shrink-0 mt-0.5" />
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                {warning}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Validation Errors */}
      {validationResult && validationResult.errors.length > 0 && (
        <div className="space-y-1">
          {validationResult.errors.map((error, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"
            >
              <XCircle className="h-3 w-3 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-[10px] text-red-600 dark:text-red-400">
                {error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Test Connection Button */}
      <div className="pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={handleTestConnection}
          disabled={isTestingConnection || !serverUrl}
        >
          {isTestingConnection ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              测试连接中...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              测试连接
            </>
          )}
        </Button>
      </div>

      {/* Connection Result */}
      {connectionResult && (
        <ConnectionResultDisplay result={connectionResult} />
      )}

      {/* Tool Selection */}
      {availableTools.length > 0 && (
        <MCPToolSelector
          tools={availableTools}
          selectedTools={selectedTools}
          onToggleTool={handleToggleTool}
          onUpdateParameter={handleUpdateToolParameter}
        />
      )}

      {/* Import/Export Section */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2 border-t w-full">
          <ChevronRight className="h-3 w-3" />
          <Settings className="h-3 w-3" />
          <span>导入/导出配置</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={handleExportConfig}
              disabled={!serverUrl}
            >
              <Download className="h-3 w-3 mr-1" />
              导出配置
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3 w-3 mr-1" />
              导入配置
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportConfig}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            导出的配置不包含 API Key 等敏感信息
          </p>
          {importError && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800">
              <AlertCircle className="h-3 w-3 text-yellow-500 flex-shrink-0 mt-0.5" />
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                {importError}
              </span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}


// ============================================================================
// Connection Result Display Component
// ============================================================================

interface ConnectionResultDisplayProps {
  result: ConnectionTestResult
}

function ConnectionResultDisplay({ result }: ConnectionResultDisplayProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border text-xs',
        result.success
          ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
          : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
      )}
    >
      <div className="flex items-start gap-2">
        {result.success ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          {result.success ? (
            <>
              <p className="font-medium text-green-700 dark:text-green-300">
                连接成功
              </p>
              {result.serverInfo && (
                <p className="text-green-600 dark:text-green-400 mt-1">
                  服务器: {result.serverInfo.name} v{result.serverInfo.version}
                </p>
              )}
              {result.tools && result.tools.length > 0 && (
                <p className="text-green-600 dark:text-green-400">
                  发现 {result.tools.length} 个可用工具
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-medium text-red-700 dark:text-red-300">
                连接失败
              </p>
              <p className="text-red-600 dark:text-red-400 mt-1">
                {result.error}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MCP Tool Selector Component
// ============================================================================

interface MCPToolSelectorProps {
  tools: MCPTool[]
  selectedTools: MCPSelectedTool[]
  onToggleTool: (tool: MCPTool, enabled: boolean) => void
  onUpdateParameter: (toolName: string, paramName: string, value: string) => void
}

function MCPToolSelector({
  tools,
  selectedTools,
  onToggleTool,
  onUpdateParameter,
}: MCPToolSelectorProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())

  const toggleExpanded = (toolName: string) => {
    const newExpanded = new Set(expandedTools)
    if (newExpanded.has(toolName)) {
      newExpanded.delete(toolName)
    } else {
      newExpanded.add(toolName)
    }
    setExpandedTools(newExpanded)
  }

  const isToolEnabled = (toolName: string) => {
    const selected = selectedTools.find(t => t.name === toolName)
    return selected?.enabled ?? false
  }

  const getToolParameters = (toolName: string) => {
    const selected = selectedTools.find(t => t.name === toolName)
    return selected?.parameterMappings ?? {}
  }

  return (
    <div className="space-y-2 pt-2 border-t">
      <Label className="text-xs font-medium">可用工具</Label>
      <div className="space-y-1.5">
        {tools.map((tool) => {
          const isEnabled = isToolEnabled(tool.name)
          const isExpanded = expandedTools.has(tool.name)
          const parameters = getToolParameters(tool.name)
          const hasParams = tool.inputSchema.properties && 
            Object.keys(tool.inputSchema.properties).length > 0

          return (
            <Collapsible
              key={tool.name}
              open={isExpanded}
              onOpenChange={() => toggleExpanded(tool.name)}
            >
              <div className="border rounded-lg bg-background overflow-hidden">
                <div className="flex items-center gap-2 p-2">
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => onToggleTool(tool, checked)}
                    className="scale-75"
                  />
                  <CollapsibleTrigger className="flex-1 flex items-center gap-2 text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">
                          {tool.name}
                        </span>
                        {isEnabled && (
                          <Badge variant="default" className="text-[10px] h-4">
                            已启用
                          </Badge>
                        )}
                      </div>
                      {tool.description && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {tool.description}
                        </p>
                      )}
                    </div>
                    {hasParams && (
                      isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )
                    )}
                  </CollapsibleTrigger>
                </div>

                {hasParams && (
                  <CollapsibleContent>
                    <div className="px-2 pb-2 pt-1 border-t space-y-2">
                      <JSONSchemaForm
                        schema={tool.inputSchema}
                        values={parameters}
                        onChange={(paramName, value) => 
                          onUpdateParameter(tool.name, paramName, value)
                        }
                        disabled={!isEnabled}
                      />
                    </div>
                  </CollapsibleContent>
                )}
              </div>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// JSON Schema Form Component
// ============================================================================

interface JSONSchemaFormProps {
  schema: {
    type: 'object'
    properties?: Record<string, JSONSchema>
    required?: string[]
  }
  values: Record<string, unknown>
  onChange: (paramName: string, value: string) => void
  disabled?: boolean
  prefix?: string
}

function JSONSchemaForm({
  schema,
  values,
  onChange,
  disabled = false,
  prefix = '',
}: JSONSchemaFormProps) {
  if (!schema.properties) return null

  const properties = Object.entries(schema.properties)
  const required = schema.required || []

  return (
    <div className="space-y-2">
      {properties.map(([name, propSchema]) => {
        const fullPath = prefix ? `${prefix}.${name}` : name
        const isRequired = required.includes(name)
        const currentValue = (values[fullPath] as string) || ''

        return (
          <JSONSchemaField
            key={fullPath}
            name={name}
            fullPath={fullPath}
            schema={propSchema}
            value={currentValue}
            onChange={onChange}
            isRequired={isRequired}
            disabled={disabled}
            values={values}
          />
        )
      })}
    </div>
  )
}

// ============================================================================
// JSON Schema Field Component
// ============================================================================

interface JSONSchemaFieldProps {
  name: string
  fullPath: string
  schema: JSONSchema
  value: string
  onChange: (paramName: string, value: string) => void
  isRequired: boolean
  disabled: boolean
  values: Record<string, unknown>
}

function JSONSchemaField({
  name,
  fullPath,
  schema,
  value,
  onChange,
  isRequired,
  disabled,
  values,
}: JSONSchemaFieldProps) {
  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type

  // Handle nested objects
  if (schemaType === 'object' && schema.properties) {
    return (
      <div className="space-y-2 pl-2 border-l-2 border-muted">
        <Label className="text-[10px] font-medium text-muted-foreground">
          {name}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <JSONSchemaForm
          schema={{
            type: 'object',
            properties: schema.properties,
            required: schema.required,
          }}
          values={values}
          onChange={onChange}
          disabled={disabled}
          prefix={fullPath}
        />
      </div>
    )
  }

  // Handle arrays
  if (schemaType === 'array') {
    return (
      <div className="space-y-1">
        <Label className="text-[10px]">
          {name}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
          <span className="text-muted-foreground ml-1">(数组，用逗号分隔)</span>
        </Label>
        <VariableInput
          value={value}
          onChange={(v) => onChange(fullPath, v)}
          placeholder={schema.description || `输入 ${name}，多个值用逗号分隔`}
          disabled={disabled}
        />
      </div>
    )
  }

  // Handle enums
  if (schema.enum && schema.enum.length > 0) {
    return (
      <div className="space-y-1">
        <Label className="text-[10px]">
          {name}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Select
          value={value || ''}
          onValueChange={(v) => onChange(fullPath, v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={schema.description || `选择 ${name}`} />
          </SelectTrigger>
          <SelectContent>
            {schema.enum.map((option) => (
              <SelectItem key={String(option)} value={String(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // Handle boolean
  if (schemaType === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(fullPath, String(checked))}
          disabled={disabled}
          className="scale-75"
        />
        <Label className="text-[10px]">
          {name}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
          {schema.description && (
            <span className="text-muted-foreground ml-1">
              - {schema.description}
            </span>
          )}
        </Label>
      </div>
    )
  }

  // Handle number/integer
  if (schemaType === 'number' || schemaType === 'integer') {
    return (
      <div className="space-y-1">
        <Label className="text-[10px]">
          {name}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <VariableInput
          value={value}
          onChange={(v) => onChange(fullPath, v)}
          placeholder={schema.description || `输入 ${name}`}
          disabled={disabled}
        />
        {(schema.minimum !== undefined || schema.maximum !== undefined) && (
          <p className="text-[10px] text-muted-foreground">
            范围: {schema.minimum ?? '-∞'} ~ {schema.maximum ?? '∞'}
          </p>
        )}
      </div>
    )
  }

  // Default: string input
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">
        {name}
        {isRequired && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <VariableInput
        value={value}
        onChange={(v) => onChange(fullPath, v)}
        placeholder={schema.description || `输入 ${name}`}
        disabled={disabled}
      />
      {schema.description && (
        <p className="text-[10px] text-muted-foreground">{schema.description}</p>
      )}
    </div>
  )
}

export default MCPToolConfig
