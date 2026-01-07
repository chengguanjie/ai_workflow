# Requirements Document

## Introduction

本功能为工作流节点配置面板中的"调用工具"部分增加 MCP（Model Context Protocol）服务器配置和调用能力。MCP 是一种开放标准协议，允许 AI 应用与外部数据源和工具进行标准化集成。本功能以魔搭平台（ModelScope）提供的 MCP 服务为主要集成目标，同时支持其他兼容 MCP 协议的服务器。

## Glossary

- **MCP**: Model Context Protocol，模型上下文协议，由 Anthropic 推出的开放标准协议
- **MCP_Server**: 提供工具和资源能力的 MCP 服务端点
- **MCP_Client**: 连接到 MCP 服务器并调用其工具的客户端
- **SSE**: Server-Sent Events，服务器发送事件，MCP 支持的传输协议之一
- **Tool_Config_Panel**: 节点配置面板中的工具配置区域
- **ModelScope_MCP**: 魔搭平台提供的 MCP 服务，地址为 mcp.modelscope.cn
- **JSON_RPC**: MCP 使用的消息格式标准（JSON-RPC 2.0）

## Requirements

### Requirement 1: MCP 服务器配置

**User Story:** As a workflow designer, I want to configure MCP servers in the tool section, so that I can connect to external MCP services like ModelScope.

#### Acceptance Criteria

1. WHEN a user clicks "添加工具" in the Tool_Config_Panel, THE System SHALL display "MCP 服务" as a tool type option
2. WHEN a user selects "MCP 服务" tool type, THE System SHALL create a new MCP tool configuration with default settings
3. THE MCP_Tool_Config SHALL include fields for server URL, authentication type, and API key
4. WHEN a user enters a ModelScope MCP server URL, THE System SHALL validate the URL format
5. THE System SHALL support both SSE and HTTP transport protocols for MCP connections
6. WHEN a user saves an MCP configuration, THE System SHALL persist the configuration to the node's config object

### Requirement 2: MCP 服务器连接测试

**User Story:** As a workflow designer, I want to test my MCP server connection, so that I can verify the configuration is correct before using it.

#### Acceptance Criteria

1. WHEN a user clicks the "测试连接" button, THE System SHALL attempt to connect to the configured MCP server
2. WHEN the connection test succeeds, THE System SHALL display a success message with the server's capabilities
3. IF the connection test fails, THEN THE System SHALL display an error message with the failure reason
4. WHEN the connection is established, THE System SHALL retrieve and display the list of available tools from the MCP server
5. THE System SHALL display a loading indicator while the connection test is in progress

### Requirement 3: MCP 工具发现与选择

**User Story:** As a workflow designer, I want to browse and select tools from connected MCP servers, so that I can use them in my workflow.

#### Acceptance Criteria

1. WHEN an MCP server connection is established, THE System SHALL fetch the list of available tools using the tools/list method
2. THE System SHALL display each tool with its name, description, and input schema
3. WHEN a user selects a tool from the list, THE System SHALL add it to the enabled tools for this node
4. THE System SHALL allow users to enable or disable individual MCP tools
5. WHEN displaying tool parameters, THE System SHALL render appropriate input fields based on the tool's JSON schema

### Requirement 4: MCP 工具调用执行

**User Story:** As a workflow user, I want the workflow to call MCP tools during execution, so that I can leverage external capabilities.

#### Acceptance Criteria

1. WHEN a workflow node with enabled MCP tools is executed, THE System SHALL establish a connection to the configured MCP server
2. WHEN the AI model decides to call an MCP tool, THE System SHALL send a tools/call request to the MCP server
3. THE System SHALL pass the tool arguments from the AI model to the MCP server
4. WHEN the MCP server returns a result, THE System SHALL pass the result back to the AI model
5. IF an MCP tool call fails, THEN THE System SHALL handle the error gracefully and report it to the user
6. THE System SHALL support streaming responses from MCP tools when available

### Requirement 5: 魔搭平台 MCP 预设配置

**User Story:** As a workflow designer, I want quick access to ModelScope MCP servers, so that I can easily integrate popular tools.

#### Acceptance Criteria

1. THE System SHALL provide a "魔搭 MCP" preset option when adding MCP tools
2. WHEN a user selects the ModelScope preset, THE System SHALL pre-fill the server URL with the ModelScope MCP endpoint
3. THE System SHALL display a curated list of popular ModelScope MCP tools for quick selection
4. WHEN a user has a ModelScope API key configured, THE System SHALL auto-fill the authentication credentials
5. THE System SHALL provide links to the ModelScope MCP documentation for reference

### Requirement 6: MCP 配置持久化与同步

**User Story:** As a workflow designer, I want my MCP configurations to be saved and synced, so that I can reuse them across sessions.

#### Acceptance Criteria

1. WHEN a user saves a workflow, THE System SHALL persist all MCP tool configurations
2. WHEN a workflow is loaded, THE System SHALL restore the MCP tool configurations
3. THE System SHALL validate MCP configurations on workflow load and warn about invalid configurations
4. WHEN an MCP server URL changes, THE System SHALL update all affected tool configurations
5. THE System SHALL support importing and exporting MCP server configurations

### Requirement 7: MCP 工具参数映射

**User Story:** As a workflow designer, I want to map workflow variables to MCP tool parameters, so that I can pass dynamic data to tools.

#### Acceptance Criteria

1. THE System SHALL allow users to reference workflow variables in MCP tool parameters using the {{variable}} syntax
2. WHEN rendering MCP tool parameter inputs, THE System SHALL provide variable autocomplete suggestions
3. THE System SHALL validate that referenced variables exist in the workflow context
4. WHEN executing an MCP tool, THE System SHALL resolve all variable references before calling the tool
5. THE System SHALL support both static values and variable references for each parameter

### Requirement 8: MCP 错误处理与日志

**User Story:** As a workflow designer, I want clear error messages and logs for MCP operations, so that I can troubleshoot issues.

#### Acceptance Criteria

1. WHEN an MCP connection error occurs, THE System SHALL display a user-friendly error message
2. THE System SHALL log all MCP requests and responses for debugging purposes
3. WHEN an MCP tool returns an error, THE System SHALL display the error details in the debug panel
4. THE System SHALL implement retry logic for transient MCP connection failures
5. IF an MCP server is unreachable, THEN THE System SHALL timeout after a configurable duration and report the failure
