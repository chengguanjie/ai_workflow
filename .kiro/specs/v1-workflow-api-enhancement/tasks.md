# Implementation Plan: V1 Workflow API Enhancement

## Overview

实现 V1 公开 API 的工作流管理能力扩展，包括节点级别操作、工作流复制、版本管理、触发器管理和执行历史查询。采用增量开发方式，每个功能模块独立实现并测试。

## Tasks

- [x] 1. 节点更新和删除 API
  - [x] 1.1 实现 PUT /api/v1/workflows/[id]/nodes/[nodeId] 路由
    - 创建 `src/app/api/v1/workflows/[id]/nodes/[nodeId]/route.ts`
    - 实现节点查找、配置更新、版本递增逻辑
    - 处理节点类型变更时的默认配置更新
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [x] 1.2 实现 DELETE /api/v1/workflows/[id]/nodes/[nodeId] 路由
    - 在同一文件中添加 DELETE 方法
    - 实现节点删除和关联边清理
    - 添加 INPUT 节点保护逻辑
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.3 编写节点更新属性测试
    - **Property 1: Node Update Preserves Workflow Integrity**
    - **Validates: Requirements 1.1, 1.3, 1.4**
  - [x] 1.4 编写节点删除属性测试
    - **Property 2: Node Deletion Removes Connected Edges**
    - **Validates: Requirements 2.1, 2.3, 2.4**

- [x] 2. 节点测试 API
  - [x] 2.1 创建 NodeTestService 服务
    - 创建 `src/lib/services/node-test.service.ts`
    - 实现 PROCESS 节点的 AI 执行逻辑
    - 实现 CODE 节点的代码执行逻辑
    - 实现执行指标收集（duration, tokens）
    - _Requirements: 3.2, 3.3, 3.5_
  - [x] 2.2 实现 POST /api/v1/workflows/[id]/nodes/[nodeId]/test 路由
    - 创建 `src/app/api/v1/workflows/[id]/nodes/[nodeId]/test/route.ts`
    - 调用 NodeTestService 执行测试
    - 处理 INPUT/OUTPUT 节点的错误响应
    - _Requirements: 3.1, 3.4, 3.6_
  - [x] 2.3 编写节点测试属性测试
    - **Property 3: Node Test Returns Consistent Structure**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**

- [x] 3. 节点诊断 API
  - [x] 3.1 创建 NodeDiagnosisService 服务
    - 创建 `src/lib/services/node-diagnosis.service.ts`
    - 实现必填字段检查
    - 实现变量引用验证
    - 实现性能问题检测
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 3.2 实现 GET /api/v1/workflows/[id]/nodes/[nodeId]/diagnose 路由
    - 创建 `src/app/api/v1/workflows/[id]/nodes/[nodeId]/diagnose/route.ts`
    - 调用 NodeDiagnosisService 进行诊断
    - 返回结构化的诊断结果
    - _Requirements: 4.1, 4.5, 4.6_
  - [x] 3.3 编写节点诊断属性测试
    - **Property 4: Node Diagnosis Detects Invalid References**
    - **Validates: Requirements 4.2, 4.3, 4.5**

- [x] 4. Checkpoint - 节点操作功能验证
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 节点优化建议 API
  - [x] 5.1 创建 NodeOptimizationService 服务
    - 创建 `src/lib/services/node-optimization.service.ts`
    - 实现 AI 分析调用逻辑
    - 实现建议生成和格式化
    - _Requirements: 5.2, 5.3_
  - [x] 5.2 实现 POST /api/v1/workflows/[id]/nodes/[nodeId]/optimize 路由
    - 创建 `src/app/api/v1/workflows/[id]/nodes/[nodeId]/optimize/route.ts`
    - 调用 NodeOptimizationService 获取建议
    - 实现 apply 参数的自动应用逻辑
    - _Requirements: 5.1, 5.4, 5.5, 5.6_
  - [x] 5.3 编写优化建议属性测试
    - **Property 5: Optimization Response Structure**
    - **Validates: Requirements 5.4, 5.6**

- [x] 6. 工作流复制 API
  - [x] 6.1 实现 POST /api/v1/workflows/[id]/duplicate 路由
    - 创建 `src/app/api/v1/workflows/[id]/duplicate/route.ts`
    - 复用 workflowService.copy 方法
    - 支持自定义名称参数
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 6.2 编写工作流复制属性测试
    - **Property 6: Workflow Duplicate Creates Independent Copy**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 7. 版本管理 API
  - [x] 7.1 实现 GET/POST /api/v1/workflows/[id]/versions 路由
    - 创建 `src/app/api/v1/workflows/[id]/versions/route.ts`
    - 复用 versionService 的方法
    - 实现分页和版本创建
    - _Requirements: 7.1, 7.2, 7.5_
  - [x] 7.2 实现 GET /api/v1/workflows/[id]/versions/[versionId] 路由
    - 创建 `src/app/api/v1/workflows/[id]/versions/[versionId]/route.ts`
    - 返回特定版本的完整配置
    - _Requirements: 7.3_
  - [x] 7.3 实现 POST /api/v1/workflows/[id]/versions/[versionId]/restore 路由
    - 创建 `src/app/api/v1/workflows/[id]/versions/[versionId]/restore/route.ts`
    - 实现版本恢复逻辑
    - _Requirements: 7.4_
  - [x] 7.4 编写版本管理属性测试
    - **Property 7: Version Creation and Retrieval Round-Trip**
    - **Property 8: Version Restore Recovers Configuration**
    - **Validates: Requirements 7.2, 7.3, 7.4**

- [x] 8. Checkpoint - 版本和复制功能验证
  - 确保所有测试通过，如有问题请询问用户


- [x] 9. 触发器管理 API
  - [x] 9.1 实现 GET/POST /api/v1/workflows/[id]/triggers 路由
    - 创建 `src/app/api/v1/workflows/[id]/triggers/route.ts`
    - 参考内部 API 的触发器实现
    - 实现 Webhook URL 和 Secret 生成
    - 实现 Cron 表达式验证
    - _Requirements: 8.1, 8.2, 8.5, 8.6_
  - [x] 9.2 实现 PUT/DELETE /api/v1/workflows/[id]/triggers/[triggerId] 路由
    - 创建 `src/app/api/v1/workflows/[id]/triggers/[triggerId]/route.ts`
    - 实现触发器更新和删除
    - 支持 enabled 字段切换
    - _Requirements: 8.3, 8.4, 8.7_
  - [x] 9.3 编写触发器管理属性测试
    - **Property 9: Trigger CRUD Operations**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**

- [x] 10. 执行历史查询 API
  - [x] 10.1 实现 GET /api/v1/workflows/[id]/executions 路由
    - 创建 `src/app/api/v1/workflows/[id]/executions/route.ts`
    - 实现分页和过滤（status, startDate, endDate）
    - 使用 'executions' scope 验证
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_
  - [x] 10.2 实现 GET /api/v1/workflows/[id]/executions/[executionId] 路由
    - 创建 `src/app/api/v1/workflows/[id]/executions/[executionId]/route.ts`
    - 返回完整执行详情
    - _Requirements: 9.5_
  - [x] 10.3 编写执行历史属性测试
    - **Property 10: Execution History Filtering**
    - **Validates: Requirements 9.2, 9.3**

- [x] 11. 工作流创建增强
  - [x] 11.1 扩展 POST /api/v1/workflows 路由
    - 修改 `src/app/api/v1/workflows/route.ts`
    - 添加 templateId 参数支持
    - 添加 nodes + autoConnect 参数支持
    - 添加 validateOnCreate 参数支持
    - 添加 triggers 数组参数支持
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 11.2 编写模板创建属性测试
    - **Property 11: Template-Based Workflow Creation**
    - **Validates: Requirements 10.1**
  - [x] 11.3 编写自动连接属性测试
    - **Property 12: Auto-Connect Node Sequencing**
    - **Validates: Requirements 10.3**

- [x] 12. Final Checkpoint - 完整功能验证
  - 确保所有测试通过
  - 验证 API 文档完整性
  - 如有问题请询问用户

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个任务引用具体的需求以便追溯
- Checkpoint 任务用于阶段性验证
- 属性测试使用 `fast-check` 库，每个测试至少运行 100 次迭代
