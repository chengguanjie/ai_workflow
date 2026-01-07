# Implementation Plan: MCP Tool Integration

## Overview

本实现计划将 MCP（Model Context Protocol）工具集成到工作流节点配置面板中，以魔搭平台 MCP 服务为主要集成目标。实现将分为后端 MCP 客户端服务、前端配置组件、工具执行器集成三个主要部分。

## Tasks

- [x] 1. 设置 MCP 客户端基础设施
  - [x] 1.1 安装 @modelcontextprotocol/sdk 依赖包
    - 运行 `pnpm add @modelcontextprotocol/sdk`
    - _Requirements: 1.5, 4.1_

  - [x] 1.2 创建 MCP 类型定义文件 `src/lib/mcp/types.ts`
    - 定义 MCPServerConfig、MCPConnection、MCPTool、MCPToolResult 等接口
    - 定义 JSON-RPC 请求响应类型
    - _Requirements: 1.3, 4.2_

  - [x] 1.3 创建 MCP 客户端服务 `src/lib/mcp/client.ts`
    - 实现 connect、disconnect、listTools、callTool 方法
    - 支持 SSE 和 HTTP 传输协议
    - 实现连接状态管理
    - _Requirements: 1.5, 2.1, 3.1, 4.1_

  - [x] 1.4 编写 MCP 客户端属性测试
    - **Property 2: URL 格式验证**
    - **Validates: Requirements 1.4**

- [x] 2. 实现 MCP 服务器管理 API
  - [x] 2.1 创建 MCP 服务器配置 API `src/app/api/mcp/servers/route.ts`
    - 实现 POST 添加服务器配置
    - 实现 GET 获取服务器列表
    - _Requirements: 1.6, 6.1_

  - [x] 2.2 创建 MCP 服务器测试连接 API `src/app/api/mcp/servers/[id]/test/route.ts`
    - 实现连接测试逻辑
    - 返回服务器能力和工具列表
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.3 创建 MCP 工具列表 API `src/app/api/mcp/servers/[id]/tools/route.ts`
    - 获取指定服务器的工具列表
    - 返回工具名称、描述、输入 Schema
    - _Requirements: 3.1, 3.2_

  - [x] 2.4 编写 MCP API 属性测试
    - **Property 1: MCP 配置结构完整性**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.6**

- [x] 3. Checkpoint - 确保后端 API 测试通过
  - 运行测试确保所有 MCP API 正常工作
  - 如有问题请询问用户

- [x] 4. 实现 MCP 工具执行器
  - [x] 4.1 创建 MCP 工具执行器 `src/lib/ai/function-calling/executors/mcp.ts`
    - 实现 ToolExecutor 接口
    - 实现工具调用逻辑
    - 处理工具调用结果
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 4.2 在工具注册表中注册 MCP 执行器
    - 修改 `src/lib/ai/function-calling/index.ts`
    - 添加 MCP 工具执行器初始化
    - _Requirements: 4.1_

  - [x] 4.3 实现变量引用解析
    - 支持 {{variable}} 语法
    - 在执行前解析变量值
    - _Requirements: 7.1, 7.4_

  - [x] 4.4 编写 MCP 执行器属性测试
    - **Property 5: MCP 工具执行流程**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**


- [x] 5. 实现前端 MCP 配置组件
  - [x] 5.1 创建 MCP 工具配置组件 `src/components/workflow/node-config-panel/shared/mcp-tool-config.tsx`
    - 实现服务器 URL 输入
    - 实现认证配置（API Key、Bearer Token）
    - 实现传输协议选择
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 5.2 实现 MCP 服务器连接测试 UI
    - 添加"测试连接"按钮
    - 显示连接状态和加载指示器
    - 显示成功/失败消息
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 5.3 实现 MCP 工具选择器
    - 显示可用工具列表
    - 支持工具启用/禁用切换
    - 显示工具描述和参数 Schema
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 5.4 实现 JSON Schema 表单渲染
    - 根据 Schema 类型渲染对应输入控件
    - 支持嵌套对象和数组
    - 支持变量引用输入
    - _Requirements: 3.5, 7.1, 7.2_

  - [x] 5.5 编写 MCP 配置组件属性测试
    - **Property 4: JSON Schema 表单渲染**
    - **Validates: Requirements 3.5**

- [x] 6. 集成 MCP 工具到工具配置面板
  - [x] 6.1 扩展工具类型定义
    - 在 `tools-section.tsx` 中添加 "mcp-server" 和 "mcp-modelscope" 类型
    - 添加工具元数据（图标、描述、颜色）
    - _Requirements: 1.1_

  - [x] 6.2 添加 MCP 工具到工具选择列表
    - 在 TOOL_ORDER 中添加 MCP 工具类型
    - 实现 handleAddTool 对 MCP 类型的处理
    - _Requirements: 1.1, 1.2_

  - [x] 6.3 实现魔搭 MCP 预设配置
    - 添加魔搭 MCP 预设选项
    - 预填充服务器 URL 和常用工具
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 6.4 编写工具配置集成测试
    - **Property 3: MCP 工具发现与选择**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 7. Checkpoint - 确保前端组件测试通过
  - 运行测试确保所有 MCP 组件正常工作
  - 如有问题请询问用户

- [x] 8. 实现错误处理和日志
  - [x] 8.1 实现 MCP 错误处理
    - 定义错误类型和错误码
    - 实现用户友好的错误消息
    - _Requirements: 2.3, 4.5, 8.1, 8.3_

  - [x] 8.2 实现重试逻辑
    - 配置重试策略（最大重试次数、退避算法）
    - 识别可重试的错误类型
    - _Requirements: 8.4_

  - [x] 8.3 实现请求响应日志
    - 记录所有 MCP 请求和响应
    - 集成到调试面板
    - _Requirements: 8.2_

  - [x] 8.4 实现超时处理
    - 配置可调整的超时时间
    - 超时后报告失败
    - _Requirements: 8.5_

  - [x] 8.5 编写错误处理属性测试
    - **Property 8: MCP 错误处理与重试**
    - **Validates: Requirements 4.5, 8.4, 8.5**

- [x] 9. 实现配置持久化
  - [x] 9.1 实现 MCP 配置保存
    - 将 MCP 配置保存到节点 config 对象
    - 加密存储 API Key
    - _Requirements: 1.6, 6.1_

  - [x] 9.2 实现 MCP 配置恢复
    - 从节点 config 恢复 MCP 配置
    - 验证配置有效性
    - _Requirements: 6.2, 6.3_

  - [x] 9.3 实现配置导入导出
    - 支持导出 MCP 服务器配置
    - 支持导入配置（不含敏感信息）
    - _Requirements: 6.5_

  - [x] 9.4 编写配置持久化属性测试
    - **Property 6: MCP 配置持久化往返**
    - **Validates: Requirements 6.1, 6.2, 6.5**

- [x] 10. 实现变量引用功能
  - [x] 10.1 实现变量引用验证
    - 验证引用的变量存在于工作流上下文
    - 显示验证错误提示
    - _Requirements: 7.3_

  - [x] 10.2 实现变量自动完成
    - 在参数输入中提供变量建议
    - 显示可用变量列表
    - _Requirements: 7.2_

  - [x] 10.3 编写变量引用属性测试
    - **Property 7: 变量引用处理**
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5**

- [x] 11. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 验证所有功能正常工作
  - 如有问题请询问用户

## Notes

- All tasks are required for complete test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 使用 TypeScript 作为实现语言
- 使用 fast-check 进行属性测试
- 使用 vitest 作为测试框架
