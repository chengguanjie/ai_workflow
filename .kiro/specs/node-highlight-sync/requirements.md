# Requirements Document

## Introduction

修复工作流执行时节点高亮显示与实际执行节点不同步的问题。当前存在两个节点同时高亮闪烁的情况，这是由于多个事件源（SSE、轮询、执行可视化组件）同时更新节点执行状态导致的竞态条件。

## Glossary

- **Node_Execution_Status**: 节点执行状态，包括 pending（等待）、running（执行中）、completed（完成）、failed（失败）、skipped（跳过）
- **SSE**: Server-Sent Events，服务器推送事件，用于实时更新执行进度
- **Execution_Visualizer**: 执行可视化组件，显示工作流执行的实时进度
- **Workflow_Store**: 工作流状态存储，管理节点执行状态的全局状态

## Requirements

### Requirement 1: 单一事件源控制节点状态

**User Story:** 作为用户，我希望在工作流执行时只有一个节点显示为"执行中"状态，以便清楚地了解当前正在执行哪个节点。

#### Acceptance Criteria

1. WHILE 工作流正在执行, THE Workflow_Store SHALL 确保同一时刻最多只有一个节点处于 running 状态
2. WHEN 一个新节点开始执行, THE Workflow_Store SHALL 先将之前的 running 节点状态更新为 completed 或 failed，再将新节点设置为 running
3. WHEN 收到 node_start 事件, THE Workflow_Store SHALL 自动清除其他节点的 running 状态

### Requirement 2: 事件源优先级管理

**User Story:** 作为开发者，我希望系统能够正确处理来自不同事件源的状态更新，避免竞态条件。

#### Acceptance Criteria

1. WHEN 执行可视化组件打开时, THE Workflow_Editor_Page SHALL 禁用其自身的 SSE 订阅和轮询，由执行可视化组件统一管理
2. WHEN 执行可视化组件关闭时, THE Workflow_Editor_Page SHALL 恢复其 SSE 订阅和轮询功能
3. THE Workflow_Store SHALL 提供一个标志位来指示当前是否有组件正在管理执行状态更新

### Requirement 3: 状态更新去重

**User Story:** 作为用户，我希望节点状态更新是平滑的，不会出现闪烁或跳动。

#### Acceptance Criteria

1. WHEN 收到与当前状态相同的状态更新, THE Workflow_Store SHALL 忽略该更新，避免不必要的重新渲染
2. WHEN 收到过时的状态更新（如节点已完成但收到 running 状态）, THE Workflow_Store SHALL 忽略该更新
3. THE Workflow_Store SHALL 维护状态更新的时间戳，用于判断更新是否过时

### Requirement 4: 执行状态一致性

**User Story:** 作为用户，我希望节点的高亮状态与实际执行进度保持一致。

#### Acceptance Criteria

1. WHEN 工作流执行完成, THE Workflow_Store SHALL 确保没有节点仍处于 running 状态
2. WHEN 工作流执行失败, THE Workflow_Store SHALL 将当前 running 节点标记为 failed
3. IF 执行被取消, THEN THE Workflow_Store SHALL 将所有 running 和 pending 节点重置为初始状态
