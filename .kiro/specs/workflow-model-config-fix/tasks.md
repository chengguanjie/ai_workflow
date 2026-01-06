# Implementation Plan: Workflow Model Config Fix

## Overview

修复工作流节点调试中的模型配置不一致问题，确保用户选择的模型被正确保存和使用，并保证调试日志的完整性。

## Tasks

- [x] 1. 修复前端调试面板的模型配置同步
  - [x] 1.1 在 node-debug-panel.tsx 中添加模型类型验证函数
    - 创建 `validateAndFixModelConfig` 函数
    - 检测非文本模型（video-gen, image-gen等）
    - 自动替换为默认文本模型
    - _Requirements: 1.4_

  - [x] 1.2 在节点加载时调用模型验证
    - 在 useEffect 中调用验证函数
    - 如果模型被替换，更新节点配置
    - 在控制台记录替换信息
    - _Requirements: 1.4_

  - [x] 1.3 确保模型选择变更立即同步到节点配置
    - 检查 handleConfigUpdate 函数的调用时机
    - 确保模型选择后立即调用 updateNode
    - _Requirements: 1.1_

- [x] 2. 修复节点处理器的日志记录
  - [x] 2.1 在 process.ts 中添加模型信息日志
    - 在调用AI前记录配置的模型和实际使用的模型
    - 记录 aiConfigId 信息
    - _Requirements: 3.3_

  - [x] 2.2 确保错误情况下日志被正确返回
    - 检查 catch 块中的日志处理
    - 确保 logs 数组在错误时也被返回
    - _Requirements: 2.1, 2.2_

- [x] 3. 增强 AI 服务商的错误信息
  - [x] 3.1 在 shensuan.ts 中改进模型验证错误信息
    - 在错误信息中包含配置的模型ID
    - 提供更明确的修复建议
    - _Requirements: 3.1, 3.2_

- [x] 4. Checkpoint - 验证修复效果
  - 手动测试：在调试面板中选择模型并执行
  - 验证模型配置是否正确保存
  - 验证日志是否正确显示
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 添加单元测试
  - [x] 5.1 为模型验证函数添加测试
    - 测试非文本模型的检测
    - 测试自动替换逻辑
    - _Requirements: 1.4_

  - [x] 5.2 为日志完整性添加测试
    - 测试正常执行时的日志
    - 测试错误情况下的日志
    - _Requirements: 2.1, 2.2_

## Notes
- 主要修改集中在三个文件：node-debug-panel.tsx, process.ts, shensuan.ts
- 修复后需要手动测试验证效果
