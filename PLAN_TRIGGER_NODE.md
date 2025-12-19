# 触发器节点改造计划

## 目标

将触发器集成到工作流画布中作为节点，同时保留触发器管理页面作为监控/总览功能。

## 设计方案

```
┌─────────────────────────────────────────────────────┐
│  工作流画布                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ 触发器   │───▶│ 输入     │───▶│ 处理...  │      │
│  │ (新节点) │    │          │    │          │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│  - Webhook / 定时 / 手动                            │
│  - 只允许一个触发器节点                              │
│  - 必须是工作流起点                                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  触发器管理页面（改为监控/总览）                      │
│  - 列出所有工作流的触发器                            │
│  - 统一查看状态、启用/禁用                           │
│  - 查看触发日志和统计                                │
│  - 点击跳转到工作流编辑                              │
└─────────────────────────────────────────────────────┘
```

## 实现步骤

### 阶段一：添加触发器节点类型

1. **类型定义** `src/types/workflow.ts`
   - 添加 `TRIGGER` 到 NodeType
   - 添加 TriggerNodeConfig 接口
   ```typescript
   export type TriggerType = 'MANUAL' | 'WEBHOOK' | 'SCHEDULE'

   export interface TriggerNodeConfig extends BaseNodeConfig {
     type: 'TRIGGER'
     config?: {
       triggerType: TriggerType
       // Webhook 配置
       webhookPath?: string
       webhookSecret?: string
       // 定时配置
       cronExpression?: string
       timezone?: string
       // 通用配置
       enabled?: boolean
       inputTemplate?: Record<string, unknown>
       retryOnFail?: boolean
       maxRetries?: number
     }
   }
   ```

2. **节点面板** `src/components/workflow/node-panel.tsx`
   - 在 primaryNodes 最前面添加触发器节点
   ```typescript
   {
     type: 'trigger',
     name: '触发器',
     description: '定义工作流触发方式',
     icon: Zap,
     color: 'text-amber-500',
     bgColor: 'bg-amber-500/10',
   }
   ```

3. **节点渲染组件** `src/components/workflow/nodes/index.tsx`
   - 添加 TriggerNode 组件
   - 特殊样式：没有输入连接点，只有输出
   - 显示触发器类型图标和状态

4. **节点配置面板** `src/components/workflow/node-config-panel/trigger-node-config.tsx`
   - 新建触发器配置组件
   - 复用 CronExpressionEditor
   - 支持三种触发类型切换
   - Webhook 配置（自动生成 URL、显示密钥）
   - 定时配置（Cron 表达式、时区）
   - 输入模板配置

5. **节点配置面板入口** `src/components/workflow/node-config-panel/index.tsx`
   - 添加 trigger case 分支

### 阶段二：触发器节点处理器

6. **处理器实现** `src/lib/workflow/processors/trigger.ts`
   - 新建 TriggerNodeProcessor
   - process 方法：将触发器输入数据传递给下游
   - 处理 inputTemplate 合并逻辑

7. **注册处理器** `src/lib/workflow/processors/index.ts`
   - 注册 TRIGGER 处理器

### 阶段三：工作流保存/执行逻辑

8. **工作流保存 API** `src/app/api/workflows/[id]/route.ts`
   - 保存时检测触发器节点
   - 自动同步到 WorkflowTrigger 表
   - 处理 Webhook 路径生成和密钥

9. **执行引擎适配** `src/lib/workflow/engine.ts`
   - 执行时识别触发器节点
   - 将触发输入注入到触发器节点输出

10. **调度器适配** `src/lib/scheduler/index.ts`
    - 读取工作流中的触发器节点配置
    - 创建/更新定时任务

### 阶段四：触发器管理页面改造

11. **页面改造** `src/app/(dashboard)/triggers/page.tsx`
    - 移除工作流选择器
    - 显示所有工作流的触发器
    - 添加工作流名称列
    - 添加"编辑工作流"跳转按钮
    - 保留启用/禁用、查看详情、日志功能
    - 移除创建/编辑触发器功能（改在画布中操作）

### 阶段五：验证约束

12. **画布约束**
    - 每个工作流只能有一个触发器节点
    - 触发器节点不能有输入连接
    - 触发器节点必须存在（可选：允许没有触发器）

## 数据库兼容性

- 现有 WorkflowTrigger 表保持不变
- 触发器数据同时存储在：
  - workflow.config.nodes 中（画布展示）
  - WorkflowTrigger 表中（调度器使用）
- 保存时自动同步两边数据

## 文件清单

| 操作 | 文件路径 |
|------|---------|
| 修改 | `src/types/workflow.ts` |
| 修改 | `src/components/workflow/node-panel.tsx` |
| 修改 | `src/components/workflow/nodes/index.tsx` |
| 新增 | `src/components/workflow/node-config-panel/trigger-node-config.tsx` |
| 修改 | `src/components/workflow/node-config-panel/index.tsx` |
| 新增 | `src/lib/workflow/processors/trigger.ts` |
| 修改 | `src/lib/workflow/processors/index.ts` |
| 修改 | `src/app/api/workflows/[id]/route.ts` |
| 修改 | `src/lib/workflow/engine.ts` |
| 修改 | `src/lib/scheduler/index.ts` |
| 修改 | `src/app/(dashboard)/triggers/page.tsx` |

## 预计工作量

- 阶段一：添加节点类型和 UI（核心）
- 阶段二：处理器实现（简单）
- 阶段三：保存/执行逻辑（中等复杂）
- 阶段四：页面改造（简单）
- 阶段五：约束验证（简单）

## 风险点

1. **数据同步**：画布节点和 WorkflowTrigger 表的数据同步需要仔细处理
2. **向后兼容**：现有工作流没有触发器节点，需要兼容处理
3. **Webhook 路径唯一性**：保存时需要检查路径冲突
