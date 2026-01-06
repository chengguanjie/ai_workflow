# Requirements Document

## Introduction

本功能旨在修复工作流节点执行时输入状态（inputStatus）和输出状态（outputStatus）的验证逻辑。

当前存在的问题：
1. **输入状态**：总是被硬编码为 `'valid'`，没有实际验证输入数据的有效性
2. **输出状态**：只是简单检查"是否有非空数据"，没有验证输出类型匹配性和内容完整性

这导致用户无法准确了解节点输入输出是否正常，影响问题诊断和调试体验。

## Glossary

- **Workflow_Engine**: 工作流执行引擎，负责按顺序或并行执行工作流中的节点
- **Node**: 工作流中的单个处理单元，包括 INPUT、PROCESS、LOGIC、OUTPUT 等类型
- **Input_Status**: 节点输入状态，可能的值包括 'pending'、'valid'、'invalid'、'missing'
- **Output_Status**: 节点输出状态，可能的值包括 'pending'、'valid'、'error'、'empty'
- **Predecessor_Node**: 前置节点，即在工作流图中指向当前节点的节点
- **Variable_Reference**: 变量引用，格式为 `{{节点名.字段名}}` 或 `{{节点名}}`
- **Execution_Context**: 执行上下文，包含所有已执行节点的输出数据
- **Expected_Output_Type**: 期望的输出类型，如 'text'、'json'、'html'、'csv'、'image'、'audio'、'video' 等
- **Output_Validation**: 输出验证，检查实际输出是否符合期望的类型和格式

## Requirements

### Requirement 1: 前置节点输出验证

**User Story:** As a workflow developer, I want the system to validate that all predecessor nodes have valid outputs before executing a node, so that I can identify missing dependencies early.

#### Acceptance Criteria

1. WHEN a node is about to execute, THE Workflow_Engine SHALL check if all predecessor nodes have completed successfully
2. WHEN any predecessor node has failed or been skipped, THE Workflow_Engine SHALL set the input status to 'missing' and include the missing node names in the error message
3. WHEN all predecessor nodes have valid outputs, THE Workflow_Engine SHALL set the input status to 'valid'

### Requirement 2: 变量引用验证

**User Story:** As a workflow developer, I want the system to validate that all variable references in the node configuration can be resolved, so that I can catch configuration errors before execution.

#### Acceptance Criteria

1. WHEN a PROCESS node is about to execute, THE Workflow_Engine SHALL extract all variable references from the user prompt and system prompt
2. WHEN a variable reference cannot be resolved (referenced node not found or field not found), THE Workflow_Engine SHALL set the input status to 'invalid' and include the unresolved variable in the error message
3. WHEN all variable references can be resolved, THE Workflow_Engine SHALL proceed with execution

### Requirement 3: INPUT 节点特殊处理

**User Story:** As a workflow developer, I want INPUT nodes to validate their required fields, so that I can ensure all necessary inputs are provided.

#### Acceptance Criteria

1. WHEN an INPUT node is about to execute, THE Workflow_Engine SHALL check if all required fields have non-empty values
2. WHEN a required field is empty, THE Workflow_Engine SHALL set the input status to 'missing' and include the field name in the error message
3. WHEN all required fields have values, THE Workflow_Engine SHALL set the input status to 'valid'

### Requirement 4: 输入状态实时更新

**User Story:** As a workflow developer, I want to see the input validation status in real-time during execution, so that I can quickly identify which node has input problems.

#### Acceptance Criteria

1. WHEN a node starts execution, THE Workflow_Engine SHALL emit the validated input status via the execution events system
2. WHEN input validation fails, THE Workflow_Engine SHALL include a descriptive error message explaining what is missing or invalid
3. THE UI SHALL display the input status with appropriate visual indicators (green for valid, red for invalid, yellow for missing)

### Requirement 5: 输入验证函数

**User Story:** As a developer, I want a reusable input validation function, so that the validation logic is consistent across sequential and parallel execution modes.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL provide a `validateNodeInput` function that takes a node and execution context as parameters
2. THE `validateNodeInput` function SHALL return an object containing `status` ('valid' | 'invalid' | 'missing') and optional `error` message
3. THE `validateNodeInput` function SHALL be used in both sequential and parallel execution paths

### Requirement 6: 输出类型匹配验证

**User Story:** As a workflow developer, I want the system to validate that the actual output matches the expected output type, so that I can ensure downstream nodes receive the correct data format.

#### Acceptance Criteria

1. WHEN a PROCESS node has `expectedOutputType` configured, THE Workflow_Engine SHALL validate the actual output against this type
2. WHEN `expectedOutputType` is 'json', THE Workflow_Engine SHALL verify the output is valid JSON and set output status to 'invalid' if parsing fails
3. WHEN `expectedOutputType` is 'html', THE Workflow_Engine SHALL verify the output contains valid HTML structure
4. WHEN `expectedOutputType` is 'csv', THE Workflow_Engine SHALL verify the output follows CSV format
5. WHEN the output type does not match the expected type, THE Workflow_Engine SHALL set output status to 'invalid' with a descriptive error message
6. WHEN no `expectedOutputType` is configured, THE Workflow_Engine SHALL only check for non-empty output (current behavior)

### Requirement 7: 输出内容完整性验证

**User Story:** As a workflow developer, I want the system to detect when AI output appears incomplete or truncated, so that I can identify potential issues with token limits or model responses.

#### Acceptance Criteria

1. WHEN the AI response ends abruptly (e.g., mid-sentence, unclosed brackets), THE Workflow_Engine SHALL set output status to 'incomplete' and include a warning message
2. WHEN `expectedOutputType` is 'json' and the JSON is incomplete (unclosed braces/brackets), THE Workflow_Engine SHALL set output status to 'invalid'
3. THE Workflow_Engine SHALL provide an `isOutputComplete` function to check for common truncation patterns

### Requirement 8: 输出验证函数

**User Story:** As a developer, I want a reusable output validation function, so that the validation logic is consistent and extensible.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL provide a `validateNodeOutput` function that takes node config and actual output as parameters
2. THE `validateNodeOutput` function SHALL return an object containing `status` ('valid' | 'empty' | 'invalid' | 'incomplete') and optional `error` message
3. THE `validateNodeOutput` function SHALL support custom validators for different output types
4. THE `validateNodeOutput` function SHALL replace the current simple `isOutputValid` function
