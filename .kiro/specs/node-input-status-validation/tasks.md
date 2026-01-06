# Implementation Plan: Node Input/Output Status Validation

## Overview

本实现计划将输入/输出状态验证功能分解为可执行的编码任务。采用增量开发方式，每个任务都能独立验证，确保功能逐步完善。

## Tasks

- [x] 1. 创建验证模块基础结构
  - 创建 `src/lib/workflow/validation/` 目录
  - 定义核心类型和接口
  - _Requirements: 5.1, 5.2, 8.1, 8.2_

- [x] 1.1 创建类型定义文件
  - 创建 `src/lib/workflow/validation/types.ts`
  - 定义 `InputValidationResult`、`OutputValidationResult` 接口
  - 定义 `InputValidatorOptions`、`OutputValidatorOptions` 接口
  - _Requirements: 5.1, 5.2, 8.1, 8.2_

- [x] 1.2 创建验证模块入口文件
  - 创建 `src/lib/workflow/validation/index.ts`
  - 导出所有验证函数和类型
  - _Requirements: 5.1, 8.1_

- [x] 2. 实现输入验证功能
  - 实现前置节点验证、变量引用验证、必填字段验证
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [x] 2.1 实现前置节点验证
  - 创建 `src/lib/workflow/validation/input-validator.ts`
  - 实现 `validatePredecessors` 函数
  - 检查所有前置节点是否成功完成
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2.2 编写前置节点验证的属性测试
  - **Property 1: Predecessor Validation Consistency**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2.3 实现变量引用验证
  - 实现 `validateVariableReferences` 函数
  - 提取提示词中的变量引用并验证可解析性
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2.4 编写变量引用验证的属性测试
  - **Property 2: Variable Reference Resolution**
  - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 2.5 实现 INPUT 节点字段验证
  - 实现 `validateInputNodeFields` 函数
  - 检查必填字段是否有值
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 2.6 编写 INPUT 节点字段验证的属性测试
  - **Property 3: INPUT Node Field Validation**
  - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 2.7 整合输入验证函数
  - 实现 `validateNodeInput` 主函数
  - 根据节点类型调用相应的验证逻辑
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 3. Checkpoint - 输入验证完成
  - 确保所有输入验证测试通过
  - 如有问题请询问用户

- [x] 4. 实现输出验证功能
  - 实现类型匹配验证、完整性检查
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3_

- [x] 4.1 实现类型特定验证器
  - 创建 `src/lib/workflow/validation/type-validators.ts`
  - 实现 `jsonValidator`：验证 JSON 格式
  - 实现 `htmlValidator`：验证 HTML 结构
  - 实现 `csvValidator`：验证 CSV 格式
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 4.2 编写 JSON 验证的属性测试
  - **Property 7: JSON Validation Round-Trip**
  - **Validates: Requirements 6.2**

- [x] 4.3 实现输出完整性检查
  - 创建 `src/lib/workflow/validation/completeness-checker.ts`
  - 实现 `isOutputComplete` 函数
  - 检测截断模式：未闭合括号、句子中断等
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 4.4 编写输出完整性检查的属性测试
  - **Property 5: Output Completeness Detection**
  - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 4.5 实现输出验证主函数
  - 创建 `src/lib/workflow/validation/output-validator.ts`
  - 实现 `validateNodeOutput` 函数
  - 整合类型验证和完整性检查
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 4.6 编写输出类型匹配的属性测试
  - **Property 4: Output Type Matching**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 5. Checkpoint - 输出验证完成
  - 确保所有输出验证测试通过
  - 如有问题请询问用户

- [x] 6. 集成到工作流引擎
  - 将验证函数集成到执行流程中
  - _Requirements: 4.1, 4.2, 5.3_

- [x] 6.1 修改 engine.ts 集成输入验证
  - 在 `nodeStart` 调用前执行 `validateNodeInput`
  - 将验证结果传递给 `executionEvents.nodeStart`
  - 同时修改顺序执行和并行执行路径
  - _Requirements: 4.1, 4.2, 5.3_

- [x] 6.2 修改 engine.ts 集成输出验证
  - 在 `nodeComplete` 调用前执行 `validateNodeOutput`
  - 替换现有的 `isOutputValid` 调用
  - _Requirements: 8.4_

- [x] 6.3 更新 execution-events.ts 支持新状态
  - 扩展 `OutputStatus` 类型支持 'invalid' 和 'incomplete'
  - 更新事件接口支持详细错误信息
  - _Requirements: 4.1, 4.2_

- [x] 7. 更新前端显示
  - 更新节点组件支持新的状态类型
  - _Requirements: 4.3_

- [x] 7.1 更新节点组件状态显示
  - 修改 `src/components/workflow/nodes/index.tsx`
  - 添加 'invalid' 和 'incomplete' 状态的视觉样式
  - 更新 Tooltip 显示详细错误信息
  - _Requirements: 4.3_

- [x] 8. Final Checkpoint - 全部完成
  - 确保所有测试通过
  - 验证端到端功能正常
  - 如有问题请询问用户

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
