# Demo：AI 配方生成工作流（含知识库全链路验证）

目标：验证“知识库建立 → 工作流引用 → 执行时真实检索 → 输出可追溯 → 诊断报告”的全流程可跑通。

本 Demo 默认不依赖任何外部 AI / Embedding API：通过本地 Mock 模式完成端到端联调。

## 运行方式

1) 确保数据库已初始化（MySQL + Prisma）

- `pnpm db:generate`
- `pnpm db:push`

2) 运行 Demo 脚本

- `pnpm demo:recipe`

## 你会得到什么

- 自动创建（或复用）：
  - 组织：`Demo - AI Recipe Workflow`
  - 用户：`demo.recipe@local`（仅用于 demo 数据归属）
  - 默认 AI 配置（ApiKey）：使用 `mock`，并启用 `AI_MOCK`
  - 知识库：`Demo Recipe KB`（文档来自 `docs/demo/recipe-kb/`）
  - 工作流：`AI 配方生成（Demo）`（PROCESS 节点引用该知识库）

- 自动执行一次工作流，并写出：
  - `tmp/demo-recipe/report.json`：全链路跟踪与诊断结果

## 如何确认“知识库真的被检索并被用上”

在 `tmp/demo-recipe/report.json` 中检查：

- `diagnostics.kbChunkCount > 0`（知识库已分块入库）
- `diagnostics.ragDetected === true`
- `diagnostics.ragSources` 含 `docs/demo/recipe-kb/` 对应文档名

同时脚本会读取执行日志（execution_logs）中 PROCESS 节点的 `input.runtime.systemPrompt`，
检查其中包含 `## 知识库检索结果` 与 `[来源: ...]` 片段。

