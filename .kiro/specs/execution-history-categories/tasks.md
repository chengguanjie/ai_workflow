# Implementation Plan: Execution History Categories

## Overview

将执行历史页面重构为两个分类区域：正在执行（Running）和历史记录（History），提升用户监控和查看执行记录的体验。

## Tasks

- [x] 1. 创建执行分类工具函数
  - [x] 1.1 创建 `src/lib/execution/categorize.ts` 文件
    - 实现 `categorizeExecutions` 函数
    - 实现 `isRunningExecution` 函数
    - 实现 `calculateElapsedTime` 函数
    - 导出类型定义 `CategorizedExecutions`
    - _Requirements: 1.2, 1.3, 2.2_

  - [x] 1.2 编写属性测试：分类完整性
    - **Property 1: Execution Categorization Completeness**
    - **Validates: Requirements 1.2, 1.3, 2.2**

  - [x] 1.3 编写属性测试：运行区域状态过滤
    - **Property 2: Running Section Contains Only Active Executions**
    - **Validates: Requirements 1.2**

  - [x] 1.4 编写属性测试：历史区域状态过滤
    - **Property 3: History Section Contains Only Completed Executions**
    - **Validates: Requirements 1.3**

- [x] 2. 创建正在执行区域组件
  - [x] 2.1 创建 `src/components/execution/running-section.tsx`
    - 实现 RunningSection 组件
    - 显示运行中执行记录的卡片列表
    - 显示运行数量指示器
    - 显示已用时间（实时更新）
    - _Requirements: 1.2, 1.5, 2.3_

  - [x] 2.2 编写属性测试：运行数量准确性
    - **Property 4: Running Count Accuracy**
    - **Validates: Requirements 1.5**

- [x] 3. 创建历史记录区域组件
  - [x] 3.1 创建 `src/components/execution/history-section.tsx`
    - 实现 HistorySection 组件
    - 包含筛选栏（工作流、状态、日期范围）
    - 包含表格展示
    - 包含分页功能
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 编写属性测试：筛选正确性
    - **Property 5: Filter Correctness**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 3.3 编写属性测试：分页正确性
    - **Property 6: Pagination Correctness**
    - **Validates: Requirements 3.1**

- [x] 4. 重构执行历史页面
  - [x] 4.1 更新 `src/app/(dashboard)/executions/page.tsx`
    - 集成 RunningSection 和 HistorySection 组件
    - 实现运行区域自动刷新逻辑（5秒间隔）
    - 实现运行区域空状态处理
    - 应用视觉区分样式
    - _Requirements: 1.1, 1.4, 2.1, 4.1, 4.2, 4.3_

- [x] 5. Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 确保功能正常工作
  - 如有问题请询问用户

## Notes

- 所有任务都必须完成，包括属性测试
- 每个任务引用具体需求以便追溯
- 属性测试验证核心正确性属性
- 单元测试验证具体示例和边界情况
