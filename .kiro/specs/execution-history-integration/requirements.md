# Requirements Document

## Introduction

本功能将工作流执行历史从独立的侧边栏面板整合到统计分析页面中，作为一个新的 Tab 页展示。同时移除工作流编辑器左下角"工作流工具"菜单中的"执行历史"按钮，简化界面并集中管理执行相关信息。

## Glossary

- **Analytics_Page**: 统计分析页面，位于 `/workflows/[id]/analytics`，展示工作流的执行统计、节点分析、测试反馈等数据
- **Execution_History_Tab**: 执行历史标签页，在统计分析页面中展示工作流的执行记录列表
- **Workflow_Editor**: 工作流编辑器页面，位于 `/workflows/[id]`，用于编辑工作流节点和连接
- **Workflow_Tools_Menu**: 工作流工具菜单，位于编辑器左下角，包含执行历史、复制 API 链接、导入/导出等功能

## Requirements

### Requirement 1: 统计分析页面新增执行历史 Tab

**User Story:** As a 工作流管理者, I want to 在统计分析页面查看执行历史, so that 我可以在一个页面集中查看所有执行相关的数据和分析。

#### Acceptance Criteria

1. WHEN 用户访问统计分析页面 THEN THE Analytics_Page SHALL 显示一个"执行历史"标签页
2. THE Execution_History_Tab SHALL 展示与原执行历史面板相同的执行记录列表
3. WHEN 用户点击执行历史 Tab THEN THE System SHALL 加载并显示该工作流的执行记录
4. THE Execution_History_Tab SHALL 支持按状态筛选执行记录（全部、成功、失败、运行中）
5. THE Execution_History_Tab SHALL 显示每条执行记录的状态、耗时、Token 消耗和创建时间
6. WHEN 有执行正在运行 THEN THE Execution_History_Tab SHALL 自动刷新以显示最新状态
7. THE Execution_History_Tab SHALL 提供跳转到执行详情页面的链接

### Requirement 2: 移除工作流工具菜单中的执行历史按钮

**User Story:** As a 用户, I want to 通过统计分析页面访问执行历史, so that 界面更简洁且功能更集中。

#### Acceptance Criteria

1. WHEN 用户打开工作流工具菜单 THEN THE Workflow_Tools_Menu SHALL NOT 显示"执行历史"选项
2. THE Workflow_Editor SHALL 移除 ExecutionHistoryPanel 组件的引用和相关状态
3. THE System SHALL 保留统计分析按钮作为访问执行历史的入口

### Requirement 3: 执行历史列表功能

**User Story:** As a 工作流管理者, I want to 在执行历史列表中查看详细信息, so that 我可以快速了解每次执行的情况。

#### Acceptance Criteria

1. THE Execution_History_Tab SHALL 以列表形式展示执行记录
2. WHEN 用户点击某条执行记录 THEN THE System SHALL 展开显示该记录的详细信息
3. THE System SHALL 显示执行记录的错误信息（如果有）
4. THE Execution_History_Tab SHALL 支持分页或无限滚动加载更多记录
5. WHEN 执行列表为空 THEN THE System SHALL 显示友好的空状态提示

### Requirement 4: 执行历史与其他统计数据的关联

**User Story:** As a 工作流管理者, I want to 在统计分析页面中关联查看执行历史和统计数据, so that 我可以更好地分析工作流性能。

#### Acceptance Criteria

1. THE Analytics_Page SHALL 在执行统计 Tab 中保留执行次数、成功率等汇总数据
2. THE Execution_History_Tab SHALL 与时间周期选择器联动，支持按时间范围筛选
3. WHEN 用户从执行统计 Tab 切换到执行历史 Tab THEN THE System SHALL 保持相同的时间周期筛选条件
