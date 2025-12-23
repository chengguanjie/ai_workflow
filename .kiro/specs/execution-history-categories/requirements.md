# Requirements Document

## Introduction

本功能旨在优化执行历史页面的用户体验，将执行记录分为两类展示：正在执行的工作流（Running）和过往执行的工作流（History）。这样用户可以更清晰地监控当前运行状态，同时方便查看历史执行记录。

## Glossary

- **Execution_History_Page**: 执行历史页面，展示所有工作流执行记录的主页面
- **Running_Section**: 正在执行区域，展示状态为 RUNNING 或 PENDING 的执行记录
- **History_Section**: 历史记录区域，展示状态为 COMPLETED、FAILED 或 CANCELLED 的执行记录
- **Execution_Record**: 单条执行记录，包含状态、工作流名称、执行时间、耗时等信息
- **Auto_Refresh**: 自动刷新功能，定时更新执行记录状态

## Requirements

### Requirement 1: 执行历史分类展示

**User Story:** As a user, I want to see running workflows separated from completed ones, so that I can quickly monitor active executions and review past results.

#### Acceptance Criteria

1. WHEN the Execution_History_Page loads, THE Execution_History_Page SHALL display two distinct sections: Running_Section and History_Section
2. WHEN there are executions with status RUNNING or PENDING, THE Running_Section SHALL display these records at the top of the page
3. WHEN there are executions with status COMPLETED, FAILED, or CANCELLED, THE History_Section SHALL display these records below the Running_Section
4. WHEN the Running_Section has no records, THE Execution_History_Page SHALL hide the Running_Section or display an empty state message
5. THE Running_Section SHALL display a visual indicator showing the count of currently running executions

### Requirement 2: 正在执行区域功能

**User Story:** As a user, I want to monitor running workflows in real-time, so that I can track their progress and identify issues quickly.

#### Acceptance Criteria

1. THE Running_Section SHALL auto-refresh every 5 seconds when there are running executions
2. WHEN a running execution completes, THE Execution_Record SHALL move from Running_Section to History_Section
3. THE Running_Section SHALL display execution progress or elapsed time for each running record
4. WHEN a user clicks on a running execution, THE Execution_History_Page SHALL navigate to the execution detail page

### Requirement 3: 历史记录区域功能

**User Story:** As a user, I want to browse and filter past executions, so that I can analyze workflow performance and troubleshoot issues.

#### Acceptance Criteria

1. THE History_Section SHALL support pagination for browsing large numbers of records
2. THE History_Section SHALL support filtering by workflow, status, and date range
3. WHEN filters are applied, THE History_Section SHALL only display matching records
4. THE History_Section SHALL display execution summary including status, duration, and token usage

### Requirement 4: 视觉区分

**User Story:** As a user, I want clear visual distinction between running and completed executions, so that I can quickly identify the current state.

#### Acceptance Criteria

1. THE Running_Section SHALL have a distinct visual style (e.g., highlighted background or border) to differentiate from History_Section
2. THE Running_Section SHALL display animated status indicators for running executions
3. THE History_Section SHALL use static status icons based on completion status (success/failure/cancelled)
