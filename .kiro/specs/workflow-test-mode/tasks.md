# Implementation Plan: Workflow Test Mode

## Overview

本实现计划将工作流执行面板改造为支持"执行模式"和"测试模式"，包括数据库模型扩展、API 开发、前端组件改造和统计分析集成。

## Tasks

- [x] 1. 数据库模型扩展
  - [x] 1.1 扩展 Execution 模型，添加 executionType 和 isAIGeneratedInput 字段
    - 在 prisma/schema.prisma 中添加 ExecutionType 枚举
    - 在 Execution 模型中添加新字段
    - _Requirements: 4.1, 4.3_
  - [x] 1.2 创建 NodeTestFeedback 模型
    - 定义模型字段：id, executionId, nodeId, nodeName, nodeType, isCorrect, errorReason, errorCategory, nodeOutput, createdAt, updatedAt, userId
    - 添加 ErrorCategory 枚举
    - 创建必要的索引
    - _Requirements: 3.4, 4.2_
  - [x] 1.3 运行数据库迁移
    - 执行 prisma migrate dev 创建迁移文件
    - 验证迁移成功
    - _Requirements: 4.1, 4.2_

- [x] 2. 节点反馈 API 开发
  - [x] 2.1 创建节点反馈提交 API
    - 创建 POST /api/executions/[id]/node-feedback 路由
    - 实现参数验证和数据保存逻辑
    - _Requirements: 3.3, 3.4_
  - [x] 2.2 编写节点反馈 API 属性测试
    - **Property 1: 反馈数据完整性和持久化**
    - **Validates: Requirements 3.3, 3.4**
  - [x] 2.3 创建节点反馈查询 API
    - 创建 GET /api/executions/[id]/node-feedbacks 路由
    - 支持按节点 ID 筛选
    - _Requirements: 4.5_
  - [x] 2.4 编写多维度查询属性测试
    - **Property 4: 多维度查询正确性**
    - **Validates: Requirements 4.5**

- [-] 3. 执行 API 扩展
  - [x] 3.1 扩展工作流执行 API 支持测试模式
    - 修改 POST /api/workflows/[id]/execute 接口
    - 添加 executionType 和 isAIGeneratedInput 参数处理
    - 保存测试执行记录时设置正确的类型
    - _Requirements: 4.1, 4.3_
  - [x] 3.2 编写测试执行记录属性测试
    - **Property 2: 测试执行记录完整性**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  - [x] 3.3 扩展执行历史查询 API 支持类型筛选
    - 修改执行历史查询接口支持 executionType 筛选
    - _Requirements: 4.4_
  - [x] 3.4 编写执行类型区分属性测试
    - **Property 3: 执行类型区分**
    - **Validates: Requirements 4.4**

- [x] 4. AI 测试数据生成 API
  - [x] 4.1 创建 AI 测试数据生成 API
    - 创建 POST /api/workflows/[id]/generate-test-data 路由
    - 实现基于字段定义的 AI 提示词构建
    - 调用 AI 服务生成测试数据
    - _Requirements: 5.1, 5.2_
  - [x] 4.2 编写 AI 生成数据类型属性测试
    - **Property 5: AI 生成数据类型正确性**
    - **Validates: Requirements 5.2, 5.5**
    - **Note: 使用 describe.each 替代 fast-check PBT 以避免 shrinking 问题**
  - [x] 4.3 实现错误处理和降级逻辑
    - AI 调用失败时返回友好错误信息
    - 实现降级逻辑：当 AI 不可用时返回占位测试数据
    - _Requirements: 5.4_

- [x] 5. Checkpoint - 后端 API 完成
  - 确保所有 API 测试通过
  - 验证数据库操作正确性
  - 如有问题请询问用户

- [x] 6. 测试统计 API 开发
  - [x] 6.1 创建测试统计 API
    - 创建 GET /api/workflows/[id]/test-statistics 路由
    - 实现节点正确率统计
    - 实现错误分类统计
    - 实现时间范围筛选
    - _Requirements: 6.2, 6.3, 6.4_
  - [x] 6.2 编写统计计算属性测试
    - **Property 6: 统计计算正确性**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**
  - [x] 6.3 实现趋势数据计算
    - 按日期聚合计算正确率趋势
    - _Requirements: 6.5_

- [x] 7. ExecutionPanel 组件改造
  - [x] 7.1 重构执行模式切换 UI
    - 将"普通执行"改为"执行模式"
    - 将"实时监控"改为"测试模式"
    - 更新模式切换按钮样式和图标
    - _Requirements: 1.1_
  - [x] 7.2 实现执行模式功能
    - 保持原有执行功能
    - 添加弹窗最小化按钮
    - 实现后台执行状态跟踪
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
  - [x] 7.3 编写执行模式组件单元测试
    - 测试模式切换
    - 测试最小化功能
    - _Requirements: 1.1, 1.4_

- [x] 8. TestMode 组件开发
  - [x] 8.1 创建 TestMode 组件基础结构
    - 创建 src/components/workflow/test-mode.tsx
    - 实现测试数据输入表单
    - 添加 AI 生成测试数据按钮
    - _Requirements: 2.1_
  - [x] 8.2 实现 AI 测试数据生成功能
    - 调用 AI 生成 API
    - 自动填充生成的数据到表单
    - 处理生成失败情况
    - _Requirements: 2.2, 5.3, 5.4_
  - [x] 8.3 实现逐节点执行和结果展示
    - 显示每个节点的执行状态
    - 展示节点输出数据
    - 实时更新执行进度
    - _Requirements: 2.3, 2.4, 2.5_
  - [x] 8.4 编写 TestMode 组件单元测试
    - 测试 AI 生成按钮交互
    - 测试节点结果展示
    - _Requirements: 2.1, 2.2_

- [x] 9. NodeFeedback 组件开发
  - [x] 9.1 创建 NodeFeedback 组件
    - 创建 src/components/workflow/node-feedback.tsx
    - 实现正确/错误选项按钮
    - 实现错误原因输入框
    - 实现错误分类选择
    - _Requirements: 3.1, 3.2_
  - [x] 9.2 集成反馈提交功能
    - 调用节点反馈 API
    - 显示提交状态和结果
    - _Requirements: 3.3_
  - [x] 9.3 实现测试完成摘要
    - 统计各节点反馈情况
    - 显示测试完成摘要信息
    - _Requirements: 3.5_
  - [x] 9.4 编写 NodeFeedback 组件单元测试
    - 测试反馈选项交互
    - 测试错误原因输入
    - _Requirements: 3.1, 3.2_

- [x] 10. Checkpoint - 前端组件完成
  - 确保所有组件测试通过
  - 验证 UI 交互正确性
  - 如有问题请询问用户

- [x] 11. 统计分析页面集成
  - [x] 11.1 扩展统计分析页面显示测试反馈数据
    - 添加测试反馈统计卡片
    - 显示节点正确率
    - 显示错误分类分布
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 11.2 实现时间范围筛选
    - 添加日期选择器
    - 实现筛选逻辑
    - _Requirements: 6.4_
  - [x] 11.3 实现趋势图表
    - 使用图表库展示正确率趋势
    - 支持按节点筛选
    - _Requirements: 6.5_
  - [x] 11.4 编写统计页面集成测试
    - 测试数据加载和展示
    - 测试筛选功能
    - _Requirements: 6.1, 6.4_

- [x] 12. Final Checkpoint - 功能完成
  - 确保所有测试通过
  - 验证端到端流程
  - 如有问题请询问用户

## Notes

- All tasks are required for complete implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases

