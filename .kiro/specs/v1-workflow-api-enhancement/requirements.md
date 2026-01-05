# Requirements Document

## Introduction

扩展 V1 公开 API 的工作流管理能力，补充节点级别的操作（更新、删除、测试、诊断、优化建议）、工作流复制、版本管理、触发器管理、执行历史查询等功能，使外部系统能够通过 API Token 完整地管理和操作工作流。

## Glossary

- **V1_API**: 使用 API Token 认证的公开 API，路径前缀为 `/api/v1/`
- **Workflow**: 工作流，由节点(Nodes)和连接(Edges)组成的自动化流程
- **Node**: 工作流中的节点，包括 INPUT、PROCESS、CODE、OUTPUT、LOGIC 等类型
- **Edge**: 节点之间的连接关系
- **API_Token**: 用于 V1 API 认证的令牌，具有特定的作用域(scope)
- **Trigger**: 触发器，用于自动触发工作流执行，包括 Webhook 和定时任务
- **Version**: 工作流版本，记录工作流配置的历史快照
- **Execution**: 工作流执行记录，包含输入、输出、状态等信息
- **Node_Diagnosis**: 节点诊断，分析节点配置的问题和潜在风险
- **Node_Optimization**: 节点优化建议，基于 AI 分析提供配置改进建议

## Requirements

### Requirement 1: 节点更新

**User Story:** As an API consumer, I want to update a specific node's configuration, so that I can modify node settings without replacing the entire workflow config.

#### Acceptance Criteria

1. WHEN a PUT request is sent to `/api/v1/workflows/[id]/nodes/[nodeId]` with valid node configuration, THE V1_API SHALL update the specified node and return the updated node data
2. WHEN the specified node does not exist, THE V1_API SHALL return a 404 error with message "节点不存在"
3. WHEN the node type is changed, THE V1_API SHALL validate the new type is valid and update the default config accordingly
4. WHEN the node is updated, THE V1_API SHALL increment the workflow version and update publishStatus to DRAFT_MODIFIED if previously PUBLISHED
5. IF the API Token lacks 'workflows' scope, THEN THE V1_API SHALL return a 401 error

### Requirement 2: 节点删除

**User Story:** As an API consumer, I want to delete a specific node from a workflow, so that I can remove unnecessary nodes without rebuilding the entire workflow.

#### Acceptance Criteria

1. WHEN a DELETE request is sent to `/api/v1/workflows/[id]/nodes/[nodeId]`, THE V1_API SHALL remove the node and all connected edges
2. WHEN the specified node does not exist, THE V1_API SHALL return a 404 error
3. WHEN the node is deleted, THE V1_API SHALL return the deleted node and removed edges in the response
4. WHEN the node is deleted, THE V1_API SHALL increment the workflow version
5. IF deleting the node would leave the workflow without an INPUT node, THEN THE V1_API SHALL return a 400 error with appropriate message

### Requirement 3: 节点测试

**User Story:** As an API consumer, I want to test a specific node with sample input, so that I can verify the node configuration works correctly before publishing.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/api/v1/workflows/[id]/nodes/[nodeId]/test` with test input, THE V1_API SHALL execute only that node and return the output
2. WHEN the node type is PROCESS, THE V1_API SHALL execute the AI prompt with the provided input and return the generated response
3. WHEN the node type is CODE, THE V1_API SHALL execute the code with the provided input and return the result
4. WHEN the node execution fails, THE V1_API SHALL return error details including error message and stack trace if available
5. THE V1_API SHALL return execution metrics including duration and token usage (for PROCESS nodes)
6. WHEN the node type is INPUT or OUTPUT, THE V1_API SHALL return a 400 error indicating these node types cannot be tested independently

### Requirement 4: 节点诊断

**User Story:** As an API consumer, I want to diagnose a node's configuration, so that I can identify potential issues before execution.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/workflows/[id]/nodes/[nodeId]/diagnose`, THE V1_API SHALL analyze the node configuration and return diagnostic results
2. THE V1_API SHALL check for missing required fields and return warnings for each
3. THE V1_API SHALL check for invalid variable references (referencing non-existent nodes or fields)
4. THE V1_API SHALL check for potential performance issues (e.g., very long prompts, complex code)
5. THE V1_API SHALL return a severity level (error, warning, info) for each diagnostic issue
6. WHEN no issues are found, THE V1_API SHALL return an empty issues array with status "healthy"

### Requirement 5: 节点优化建议

**User Story:** As an API consumer, I want to get AI-powered optimization suggestions for a node, so that I can improve the node's effectiveness and efficiency.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/api/v1/workflows/[id]/nodes/[nodeId]/optimize`, THE V1_API SHALL analyze the node and return optimization suggestions
2. FOR PROCESS nodes, THE V1_API SHALL suggest prompt improvements for clarity, specificity, and effectiveness
3. FOR CODE nodes, THE V1_API SHALL suggest code improvements for performance and error handling
4. THE V1_API SHALL return each suggestion with a description, rationale, and suggested new configuration
5. WHEN the `apply` parameter is true, THE V1_API SHALL apply the first suggestion automatically and return the updated node
6. THE V1_API SHALL return token usage for the AI analysis

### Requirement 6: 工作流复制

**User Story:** As an API consumer, I want to duplicate an existing workflow, so that I can create variations without starting from scratch.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/api/v1/workflows/[id]/duplicate`, THE V1_API SHALL create a new workflow as a copy of the source
2. THE V1_API SHALL append "(副本)" to the new workflow's name
3. THE V1_API SHALL copy all nodes, edges, and configuration from the source workflow
4. THE V1_API SHALL set the new workflow's publishStatus to DRAFT and version to 1
5. THE V1_API SHALL return the newly created workflow with its new ID
6. WHEN an optional `name` parameter is provided, THE V1_API SHALL use that name instead of appending "(副本)"

### Requirement 7: 版本管理

**User Story:** As an API consumer, I want to manage workflow versions, so that I can track changes and rollback if needed.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/workflows/[id]/versions`, THE V1_API SHALL return a paginated list of versions
2. WHEN a POST request is sent to `/api/v1/workflows/[id]/versions` with commitMessage, THE V1_API SHALL create a new version snapshot
3. WHEN a GET request is sent to `/api/v1/workflows/[id]/versions/[versionId]`, THE V1_API SHALL return the specific version's configuration
4. WHEN a POST request is sent to `/api/v1/workflows/[id]/versions/[versionId]/restore`, THE V1_API SHALL restore the workflow to that version's configuration
5. THE V1_API SHALL include version metadata: versionNumber, commitMessage, createdAt, createdBy, isPublished

### Requirement 8: 触发器管理

**User Story:** As an API consumer, I want to manage workflow triggers via API, so that I can automate workflow execution through webhooks or schedules.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/workflows/[id]/triggers`, THE V1_API SHALL return all triggers for the workflow
2. WHEN a POST request is sent to `/api/v1/workflows/[id]/triggers`, THE V1_API SHALL create a new trigger (WEBHOOK or SCHEDULE type)
3. WHEN a PUT request is sent to `/api/v1/workflows/[id]/triggers/[triggerId]`, THE V1_API SHALL update the trigger configuration
4. WHEN a DELETE request is sent to `/api/v1/workflows/[id]/triggers/[triggerId]`, THE V1_API SHALL delete the trigger
5. FOR WEBHOOK triggers, THE V1_API SHALL generate and return the webhook URL and secret
6. FOR SCHEDULE triggers, THE V1_API SHALL validate the cron expression format
7. THE V1_API SHALL support enabling/disabling triggers via the `enabled` field

### Requirement 9: 执行历史查询

**User Story:** As an API consumer, I want to query workflow execution history, so that I can monitor and analyze workflow performance.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/workflows/[id]/executions`, THE V1_API SHALL return a paginated list of executions
2. THE V1_API SHALL support filtering by status (PENDING, RUNNING, COMPLETED, FAILED)
3. THE V1_API SHALL support filtering by date range (startDate, endDate)
4. THE V1_API SHALL return execution summary: id, status, duration, totalTokens, createdAt
5. WHEN a GET request is sent to `/api/v1/workflows/[id]/executions/[executionId]`, THE V1_API SHALL return full execution details including input, output, and node-level results
6. THE V1_API SHALL require 'executions' scope for these endpoints

### Requirement 10: 工作流创建增强

**User Story:** As an API consumer, I want enhanced workflow creation options, so that I can create workflows from templates or with pre-configured nodes.

#### Acceptance Criteria

1. WHEN creating a workflow with `templateId` parameter, THE V1_API SHALL copy the template's configuration to the new workflow
2. WHEN creating a workflow with `nodes` array but no `config`, THE V1_API SHALL build the config from the provided nodes
3. THE V1_API SHALL auto-generate edges when `autoConnect` parameter is true, connecting nodes in sequence
4. WHEN `validateOnCreate` is true, THE V1_API SHALL validate the workflow configuration and return warnings
5. THE V1_API SHALL support creating workflows with initial triggers in a single request via `triggers` array
