# Design Document: Node Input/Output Status Validation

## Overview

本设计文档描述了工作流节点输入/输出状态验证功能的技术实现方案。该功能将替换当前简单的状态判断逻辑，提供更准确、更有意义的输入输出状态反馈。

### 核心目标

1. **输入验证**：在节点执行前验证前置节点输出、变量引用、必填字段
2. **输出验证**：在节点执行后验证输出类型匹配性、内容完整性
3. **实时反馈**：通过事件系统实时推送验证状态到前端

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Workflow Engine                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  validateNodeInput │    │ validateNodeOutput │                │
│  │                    │    │                    │                │
│  │  - Predecessor    │    │  - Type Matching   │                │
│  │  - Variables      │    │  - Completeness    │                │
│  │  - Required Fields│    │  - Format Valid    │                │
│  └────────┬─────────┘    └────────┬──────────┘                  │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌──────────────────────────────────────────┐                   │
│  │           Execution Events                │                   │
│  │  nodeStart(inputStatus, inputError)       │                   │
│  │  nodeComplete(outputStatus, outputError)  │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Input Validation Module

**文件**: `src/lib/workflow/validation/input-validator.ts`

```typescript
export interface InputValidationResult {
  status: 'valid' | 'invalid' | 'missing'
  error?: string
  details?: {
    missingPredecessors?: string[]
    unresolvedVariables?: string[]
    missingFields?: string[]
  }
}

export interface InputValidatorOptions {
  node: NodeConfig
  context: ExecutionContext
  edges: EdgeConfig[]
  nodes: NodeConfig[]
}

export function validateNodeInput(options: InputValidatorOptions): InputValidationResult
```

### 2. Output Validation Module

**文件**: `src/lib/workflow/validation/output-validator.ts`

```typescript
export type OutputValidationStatus = 'valid' | 'empty' | 'invalid' | 'incomplete'

export interface OutputValidationResult {
  status: OutputValidationStatus
  error?: string
  details?: {
    expectedType?: OutputType
    actualType?: OutputType
    truncationDetected?: boolean
    formatErrors?: string[]
  }
}

export interface OutputValidatorOptions {
  nodeConfig: NodeConfig
  output: Record<string, unknown>
  expectedOutputType?: OutputType
}

export function validateNodeOutput(options: OutputValidatorOptions): OutputValidationResult
```

### 3. Type-Specific Validators

**文件**: `src/lib/workflow/validation/type-validators.ts`

```typescript
export interface TypeValidator {
  type: OutputType
  validate(content: string): { valid: boolean; error?: string }
}

export const jsonValidator: TypeValidator
export const htmlValidator: TypeValidator
export const csvValidator: TypeValidator

export function registerValidator(validator: TypeValidator): void
export function getValidator(type: OutputType): TypeValidator | undefined
```

### 4. Completeness Checker

**文件**: `src/lib/workflow/validation/completeness-checker.ts`

```typescript
export interface CompletenessResult {
  complete: boolean
  reason?: string
  truncationPattern?: string
}

export function isOutputComplete(content: string, expectedType?: OutputType): CompletenessResult
```

## Data Models

### InputStatus 扩展

```typescript
// 现有类型保持不变
type InputStatus = 'pending' | 'valid' | 'invalid' | 'missing'

// 新增详细信息接口
interface InputStatusDetails {
  status: InputStatus
  error?: string
  missingPredecessors?: string[]
  unresolvedVariables?: string[]
  missingFields?: string[]
}
```

### OutputStatus 扩展

```typescript
// 扩展现有类型
type OutputStatus = 'pending' | 'valid' | 'error' | 'empty' | 'invalid' | 'incomplete'

// 新增详细信息接口
interface OutputStatusDetails {
  status: OutputStatus
  error?: string
  expectedType?: OutputType
  actualType?: OutputType
  truncationDetected?: boolean
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Predecessor Validation Consistency

*For any* node with predecessor nodes in a workflow, the input status SHALL reflect the completion status of all predecessors: if any predecessor has failed or been skipped, input status is 'missing'; if all predecessors completed successfully with valid outputs, input status is 'valid'.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Variable Reference Resolution

*For any* PROCESS node with variable references in its prompts, the input status SHALL be 'invalid' if any variable reference cannot be resolved (node not found or field not found), and 'valid' only when all references can be resolved.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: INPUT Node Field Validation

*For any* INPUT node with required fields, the input status SHALL be 'missing' if any required field has an empty value, and 'valid' only when all required fields have non-empty values.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Output Type Matching

*For any* node output with a configured `expectedOutputType`, the output status SHALL be 'invalid' if the actual output does not match the expected type format (e.g., invalid JSON for 'json' type, invalid HTML for 'html' type).

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 5: Output Completeness Detection

*For any* node output, if the content shows signs of truncation (unclosed brackets, mid-sentence ending), the output status SHALL be 'incomplete' with a descriptive warning.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 6: Validation Function Return Type

*For any* call to `validateNodeInput` or `validateNodeOutput`, the return value SHALL contain a `status` field with a valid status value and an optional `error` field with a descriptive message when status is not 'valid'.

**Validates: Requirements 5.2, 8.2**

### Property 7: JSON Validation Round-Trip

*For any* valid JSON string, `validateNodeOutput` with `expectedOutputType: 'json'` SHALL return status 'valid'; for any invalid JSON string, it SHALL return status 'invalid'.

**Validates: Requirements 6.2**

## Error Handling

### Input Validation Errors

| Error Type | Status | Error Message Template |
|------------|--------|----------------------|
| Predecessor failed | missing | `前置节点 "{nodeName}" 执行失败` |
| Predecessor skipped | missing | `前置节点 "{nodeName}" 被跳过` |
| Variable not found | invalid | `变量引用 "{{nodeName.field}}" 无法解析：节点不存在` |
| Field not found | invalid | `变量引用 "{{nodeName.field}}" 无法解析：字段不存在` |
| Required field empty | missing | `必填字段 "{fieldName}" 为空` |

### Output Validation Errors

| Error Type | Status | Error Message Template |
|------------|--------|----------------------|
| Empty output | empty | `节点输出为空` |
| Invalid JSON | invalid | `输出不是有效的 JSON 格式: {parseError}` |
| Invalid HTML | invalid | `输出不是有效的 HTML 格式` |
| Invalid CSV | invalid | `输出不是有效的 CSV 格式` |
| Truncated output | incomplete | `输出可能被截断: {reason}` |
| Type mismatch | invalid | `输出类型不匹配: 期望 {expected}, 实际 {actual}` |

## Testing Strategy

### Unit Tests

1. **Input Validator Tests**
   - Test predecessor validation with various graph structures
   - Test variable reference extraction and resolution
   - Test INPUT node field validation

2. **Output Validator Tests**
   - Test JSON validation with valid/invalid inputs
   - Test HTML validation with valid/invalid inputs
   - Test CSV validation with valid/invalid inputs
   - Test completeness detection with truncated outputs

3. **Integration Tests**
   - Test full workflow execution with validation
   - Test event emission with validation status

### Property-Based Tests

使用 `fast-check` 库进行属性测试：

1. **Property 1**: Generate random workflow graphs, partially execute, verify input status
2. **Property 4**: Generate random outputs with expected types, verify type matching
3. **Property 5**: Generate truncated strings, verify completeness detection
4. **Property 7**: Generate valid/invalid JSON, verify validation results

### Test Configuration

- Minimum 100 iterations per property test
- Each test tagged with: `Feature: node-input-status-validation, Property {N}: {description}`
