# Implementation Plan: 执行历史整合到统计分析

## Overview

将工作流执行历史从独立的侧边栏面板整合到统计分析页面中，作为新的 Tab 页展示，并移除工作流编辑器中的执行历史按钮。

## Tasks

- [x] 1. 创建执行历史列表组件
  - [x] 1.1 创建 `src/components/workflow/analytics/execution-history-list.tsx`
    - 实现执行记录列表展示
    - 实现状态筛选功能（全部、成功、失败、运行中、等待中）
    - 实现记录展开/收起详情
    - 实现自动刷新逻辑（当有运行中的执行时）
    - 实现加载更多/分页功能
    - 实现空状态提示
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 1.2 编写执行历史列表组件单元测试
    - 测试组件渲染
    - 测试状态筛选交互
    - 测试展开/收起功能
    - _Requirements: 1.2, 1.4, 3.2_

- [x] 2. 整合到统计分析页面
  - [x] 2.1 修改 `src/app/(editor)/workflows/[id]/analytics/page.tsx`
    - 新增"执行历史"Tab
    - 导入并渲染 ExecutionHistoryList 组件
    - 传递 workflowId 和 period 参数
    - _Requirements: 1.1, 1.3, 4.2, 4.3_
  - [x] 2.2 编写属性测试：状态筛选正确性
    - **Property 2: 状态筛选正确性**
    - **Validates: Requirements 1.4**
  - [x] 2.3 编写属性测试：时间范围筛选正确性
    - **Property 3: 时间范围筛选正确性**
    - **Validates: Requirements 4.2**

- [x] 3. 移除工作流编辑器中的执行历史功能
  - [x] 3.1 修改 `src/app/(editor)/workflows/[id]/page.tsx`
    - 移除 ExecutionHistoryPanel 的动态导入
    - 移除 showHistoryPanel 状态
    - 移除工作流工具菜单中的"执行历史"选项
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Checkpoint - 验证功能完整性
  - 确保统计分析页面执行历史 Tab 正常工作
  - 确保工作流编辑器中已移除执行历史按钮
  - 确保所有测试通过
  - 如有问题请询问用户

## Notes

- 所有任务均为必需，包括测试任务
- 使用现有的 `/api/executions` API，无需修改后端
- 复用 `execution-history-panel.tsx` 中的样式和逻辑
