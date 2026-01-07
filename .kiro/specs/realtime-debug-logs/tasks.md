# Implementation Plan: 实时调试日志

## Overview

实现节点调试面板的实时日志流功能，使用 SSE 技术在执行过程中实时显示调试日志。

## Tasks

- [x] 1. 创建调试事件类型定义
  - [x] 1.1 创建 `src/lib/workflow/debug-events.ts` 文件
    - 定义 `DebugLogEvent`、`DebugLogData`、`DebugStatusData`、`DebugCompleteData` 类型
    - 定义日志级别枚举和样式映射
    - _Requirements: 4.1, 4.2_

- [x] 2. 实现流式调试 API
  - [x] 2.1 创建 `src/app/api/workflows/[id]/nodes/[nodeId]/debug/stream/route.ts`
    - 实现 POST 端点，创建 SSE 响应流
    - 复用现有的 `debugNode` 函数，但改为流式输出日志
    - 实现心跳机制保持连接
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 2.2 修改 `src/lib/workflow/debug.ts` 支持流式日志回调
    - 添加 `onLog` 回调参数
    - 在 `addLog` 函数中调用回调实时推送日志
    - _Requirements: 2.2_

- [x] 3. 创建前端 Hook
  - [x] 3.1 创建 `src/hooks/use-debug-stream.ts`
    - 实现 SSE 连接管理
    - 实现日志状态管理
    - 实现自动重连机制
    - _Requirements: 1.1, 1.2, 2.3_
  - [x] 3.2 编写 Hook 单元测试
    - 测试连接建立和断开
    - 测试日志追加
    - 测试状态转换
    - _Requirements: 1.1, 1.4_

- [x] 4. 创建日志显示组件
  - [x] 4.1 创建 `src/components/workflow/debug-panel/debug-log-viewer.tsx`
    - 实现日志列表渲染
    - 实现日志级别颜色区分
    - 实现时间戳显示
    - 实现 JSON 数据格式化
    - 实现自动滚动功能
    - _Requirements: 1.3, 4.1, 4.2, 4.3_
  - [x] 4.2 编写组件单元测试
    - 测试日志渲染
    - 测试颜色样式
    - 测试 JSON 格式化
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. 集成到调试面板
  - [x] 5.1 修改 `src/components/workflow/node-debug-panel.tsx`
    - 替换现有的调试执行逻辑，使用 `useDebugStream`
    - 替换日志显示区域，使用 `DebugLogViewer`
    - 更新执行状态指示
    - _Requirements: 1.1, 1.4, 3.1, 3.3, 3.4_

- [x] 6. Checkpoint - 确保所有测试通过
  - 运行单元测试和集成测试
  - 验证实时日志功能正常工作
  - 如有问题，询问用户

- [x] 7. 属性测试
  - [x] 7.1 编写日志格式完整性属性测试
    - **Property 3: 日志格式完整性**
    - **Validates: Requirements 4.1, 4.2**
  - [x] 7.2 编写 JSON 格式化属性测试
    - **Property 4: JSON 数据格式化**
    - **Validates: Requirements 4.3**
  - [x] 7.3 编写状态一致性属性测试
    - **Property 2: 执行状态一致性**
    - **Validates: Requirements 1.1, 1.4, 3.1, 3.3, 3.4**

- [x] 8. 最终检查点
  - 确保所有测试通过
  - 验证端到端功能
  - 如有问题，询问用户

## Notes

- 本实现复用项目中已有的 SSE 基础设施
- 日志格式与现有的 `debug.ts` 保持兼容
- 属性测试使用 fast-check 库

