# Implementation Plan: Node Highlight Sync

## Overview

修复工作流执行时节点高亮显示与实际执行节点不同步的问题。通过在 Workflow Store 中实现单一 running 节点的不变量，并协调多个事件源来避免竞态条件。

## Tasks

- [x] 1. 扩展 Workflow Store 状态和方法
  - [x] 1.1 添加新的状态字段到 workflow-store.ts
    - 添加 `executionManagerActive: boolean` 标志位
    - 添加 `currentRunningNodeId: string | null` 跟踪当前执行节点
    - 添加 `statusUpdateTimestamps: Record<string, number>` 记录更新时间戳
    - _Requirements: 2.3, 3.3_
  - [x] 1.2 实现 `updateNodeExecutionStatusSafe` 方法
    - 实现相同状态去重逻辑
    - 实现时间戳验证逻辑
    - 实现状态机验证（终态不能回退到 running）
    - 实现单一 running 节点保证
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2_
  - [x] 1.3 实现辅助方法
    - 实现 `setExecutionManagerActive(active: boolean)` 方法
    - 实现 `clearRunningNodes()` 方法
    - 实现 `finalizeExecution(success: boolean)` 方法
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 1.4 编写属性测试：单一 running 节点不变量
    - **Property 1: Single Running Node Invariant**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [ ] 2. 更新执行可视化组件
  - [ ] 2.1 修改 execution-visualizer.tsx 使用新的状态管理
    - 在组件挂载时调用 `setExecutionManagerActive(true)`
    - 在组件卸载时调用 `setExecutionManagerActive(false)`
    - 使用 `updateNodeExecutionStatusSafe` 替代 `updateNodeExecutionStatus`
    - _Requirements: 2.1, 2.2_
  - [ ] 2.2 在执行完成/失败时调用 `finalizeExecution`
    - 在 `handleSSEComplete` 中调用 `finalizeExecution(true)`
    - 在 `handleSSEError` 中调用 `finalizeExecution(false)`
    - _Requirements: 4.1, 4.2_

- [x] 3. 更新工作流编辑器页面
  - [x] 3.1 修改 page.tsx 中的 SSE 订阅逻辑
    - 添加 `executionManagerActive` 状态订阅
    - 当 `executionManagerActive` 为 true 时禁用 SSE 订阅
    - 使用 `updateNodeExecutionStatusSafe` 替代 `updateNodeExecutionStatus`
    - _Requirements: 2.1_
  - [x] 3.2 修改 page.tsx 中的轮询逻辑
    - 当 `executionManagerActive` 为 true 时跳过轮询
    - 使用 `updateNodeExecutionStatusSafe` 替代 `updateNodeExecutionStatus`
    - _Requirements: 2.1_
  - [x] 3.3 编写属性测试：状态更新幂等性和有效性
    - **Property 2: Status Update Idempotence and Validity**
    - **Validates: Requirements 3.1, 3.2**

- [x] 4. 更新其他相关组件
  - [x] 4.1 修改 execution-panel.tsx 使用新的状态管理
    - 使用 `updateNodeExecutionStatusSafe` 替代 `updateNodeExecutionStatus`
    - _Requirements: 1.1_
  - [x] 4.2 修改 node-debug-panel.tsx 使用新的状态管理
    - 使用 `updateNodeExecutionStatusSafe` 替代 `updateNodeExecutionStatus`
    - _Requirements: 1.1_
  - [x] 4.3 编写属性测试：执行终态一致性
    - **Property 3: Execution Finalization Consistency**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 5. Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 验证节点高亮同步问题已修复
  - 如有问题请询问用户

## Notes

- 所有任务都是必须完成的，包括属性测试
- 每个任务都引用了具体的需求以便追溯
- 属性测试验证核心正确性属性
