# AI Function Calling 实现文档

## 概述

本模块实现了完整的 AI Function Calling 功能，允许 AI 在对话中调用预定义的工具来执行实际操作，如发送通知、调用 HTTP API 等。

## 架构

```
src/lib/ai/function-calling/
├── types.ts              # 类型定义
├── converter.ts          # 工具格式转换器
├── service.ts            # Function Calling 服务
├── index.ts              # 模块入口
├── workflow-integration.ts # 工作流集成
└── executors/
    ├── index.ts          # 执行器注册表
    ├── notification.ts   # 通知工具执行器
    └── http.ts           # HTTP 工具执行器
```

## 核心组件

### 1. 类型定义 (types.ts)

定义了所有相关类型：

- `ToolDefinition` - 内部工具定义格式
- `OpenAITool` - OpenAI 格式的工具定义
- `ClaudeTool` - Claude 格式的工具定义
- `ToolCall` - AI 返回的工具调用
- `ToolCallResult` - 工具执行结果
- `ToolExecutor` - 工具执行器接口

### 2. 格式转换器 (converter.ts)

提供工具定义在不同格式之间的转换：

```typescript
import { toOpenAIFormat, toClaudeFormat, convertTools } from '@/lib/ai/function-calling'

// 转换为 OpenAI 格式
const openaiTool = toOpenAIFormat(toolDefinition)

// 转换为 Claude 格式
const claudeTool = toClaudeFormat(toolDefinition)

// 批量转换
const tools = convertTools(definitions, 'openai') // 或 'claude'
```

### 3. 工具执行器 (executors/)

预置的工具执行器：

#### 通知工具 (notification.ts)
```typescript
import { NotificationToolExecutor } from '@/lib/ai/function-calling'

// 通用通知工具
const notifier = new NotificationToolExecutor()

// 指定平台的通知工具
const feishuNotifier = createFeishuNotificationTool('webhook_url')
const dingtalkNotifier = createDingtalkNotificationTool('webhook_url')
const wecomNotifier = createWecomNotificationTool('webhook_url')
```

#### HTTP 工具 (http.ts)
```typescript
import { HttpToolExecutor, createHttpTool } from '@/lib/ai/function-calling'

// 通用 HTTP 工具
const httpTool = new HttpToolExecutor()

// 自定义 HTTP 工具
const apiTool = createHttpTool({
  name: 'call_my_api',
  baseUrl: 'https://api.example.com',
  defaultHeaders: { 'Authorization': 'Bearer xxx' },
})
```

### 4. 工具注册表 (executors/index.ts)

管理所有已注册的工具：

```typescript
import { toolRegistry } from '@/lib/ai/function-calling'

// 注册工具
toolRegistry.register(myExecutor)

// 获取工具
const executor = toolRegistry.get('tool_name')

// 执行工具
const result = await toolRegistry.execute('tool_name', args, context)

// 获取所有工具定义
const definitions = toolRegistry.getAllDefinitions()
```

### 5. Function Calling 服务 (service.ts)

处理 AI 工具调用的核心服务：

```typescript
import { functionCallingService } from '@/lib/ai/function-calling'

// 获取工具（转换为指定提供商格式）
const tools = functionCallingService.getToolsForProvider('openai')

// 解析工具调用
const toolCalls = functionCallingService.parseToolCalls(response, 'openai')

// 执行工具调用
const results = await functionCallingService.executeToolCalls(toolCalls, context)

// 完整的 Function Calling 循环
const { response, toolCalls, rounds } = await functionCallingService.runWithTools(
  chatFn,
  request,
  context,
  'openai'
)
```

## 使用方式

### 1. 初始化默认工具

```typescript
import { initializeDefaultTools } from '@/lib/ai/function-calling'

// 在应用启动时调用
initializeDefaultTools()
```

### 2. 在工作流中使用

使用增强版的处理节点处理器：

```typescript
import { processWithToolsNodeProcessor } from '@/lib/workflow/processors/process-with-tools'

// 节点配置
const nodeConfig = {
  type: 'PROCESS_WITH_TOOLS',
  config: {
    enableToolCalling: true,
    enabledTools: ['send_notification', 'http_request'],
    toolChoice: 'auto', // 'auto' | 'none' | 'required'
    maxToolCallRounds: 5,
    // ... 其他 AI 配置
  }
}
```

### 3. 通过 API 管理工具

```bash
# 获取所有工具
GET /api/tools

# 注册新工具
POST /api/tools
{
  "type": "notification",
  "name": "my_feishu_notifier",
  "description": "发送飞书通知",
  "config": {
    "webhookUrl": "https://...",
    "platform": "feishu"
  }
}

# 测试工具
POST /api/tools/test
{
  "toolName": "send_notification",
  "args": {
    "platform": "feishu",
    "webhook_url": "https://...",
    "content": "测试消息"
  }
}
```

## 自定义工具

### 创建自定义执行器

```typescript
import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '@/lib/ai/function-calling'

class MyCustomToolExecutor implements ToolExecutor {
  name = 'my_custom_tool'
  description = '我的自定义工具'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'param1',
          type: 'string',
          description: '参数1',
          required: true,
        },
      ],
    }
  }

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    // 实现工具逻辑
    return {
      toolCallId: '',
      toolName: this.name,
      success: true,
      result: { /* ... */ },
    }
  }
}

// 注册
toolRegistry.register(new MyCustomToolExecutor())
```

## AI 提供商支持

### OpenAI 兼容

支持所有 OpenAI 兼容的提供商（OpenAI、胜算云、OpenRouter 等）：

```typescript
// 工具格式
{
  type: 'function',
  function: {
    name: 'tool_name',
    description: '工具描述',
    parameters: {
      type: 'object',
      properties: { /* ... */ },
      required: ['param1']
    }
  }
}
```

### Claude/Anthropic

支持 Claude 的工具格式：

```typescript
// 工具格式
{
  name: 'tool_name',
  description: '工具描述',
  input_schema: {
    type: 'object',
    properties: { /* ... */ },
    required: ['param1']
  }
}
```

## 测试模式

所有工具执行器都支持测试模式，在测试模式下不会实际执行操作：

```typescript
const result = await toolRegistry.execute('send_notification', args, {
  ...context,
  testMode: true,
})
// result.result 会包含测试模式标记和模拟的执行信息
```

## 错误处理

工具执行失败时，结果会包含错误信息：

```typescript
const result = await toolRegistry.execute('tool_name', args, context)

if (!result.success) {
  console.error(`工具执行失败: ${result.error}`)
}
```

## 最佳实践

1. **工具命名**：使用 snake_case，如 `send_notification`
2. **参数描述**：提供清晰的描述，帮助 AI 正确使用工具
3. **错误处理**：在执行器中妥善处理异常
4. **超时设置**：为 HTTP 请求等操作设置合理的超时
5. **测试**：使用测试模式验证工具调用逻辑
6. **日志**：记录工具调用和执行结果，便于调试
