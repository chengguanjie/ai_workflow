# AI Workflow 开发优化计划（基于诊断报告）

更新时间：2025-12-31  
依据：`docs/SYSTEM_DIAGNOSIS_REPORT.md`

目标：先做 **P0（能跑 + 数据可信 + 风险可控）**，再做 **P1（补齐卖点）**，最后做 **P2（长期演进）**。本文档同时记录本次已落地的开发项与验收口径。

---

## 1. 优先级与里程碑

### Milestone P0（本轮优先）

#### P0-1 让“工作流执行”真正启用工具调用
- **问题**：引擎按 `node.type` 取处理器，未根据 `PROCESS.config.enableToolCalling/tools[]` 自动切换到 `PROCESS_WITH_TOOLS`，导致配置了工具但运行不生效。
- **改进**：在引擎执行单节点时做“工具处理器自动切换”。
- **验收**：
  - 在 UI 为 `PROCESS` 节点开启工具后，点击“执行工作流”，运行时可发生工具调用。
  - 不开启工具时，仍走普通 `PROCESS`，行为不变。

#### P0-2 让执行统计“可信可用”（duration/tokens/cost/model/provider）
- **问题**：
  - `executions` 表的 `duration/totalTokens/promptTokens/completionTokens/estimatedCost` 未回写，统计接口依赖这些字段会“没数据/不准”。
  - `execution_logs` 的 `aiModel/aiProvider` 未写入，成本统计按模型聚合失效。
  - 文本 chat usage 未透传到节点输出，导致 token 统计为 0。
- **改进**：
  - 透传 chat usage 到 `NodeOutput.tokenUsage`，并补齐 `aiProvider/aiModel`。
  - `saveNodeLog` 写入 `aiProvider/aiModel`。
  - 引擎完成/暂停/失败时回写 executions 的指标字段，并估算 `estimatedCost`。
- **验收**：
  - 任意运行一次工作流后，执行详情能看到 duration/tokens，成本趋势与模型分布有数据。
  - `execution_logs` 记录了 aiModel/aiProvider。

#### P0-3 收敛安全风险（HTTP 工具 SSRF + 日志脱敏）
- **问题**：HTTP 工具存在 SSRF 风险，且日志可能包含敏感 URL 参数。
- **改进**：
  - 限制协议（仅 `http/https`），默认阻止访问本机/内网/链路本地/云元数据网段。
  - 对日志输出的 URL 做脱敏（常见 token/key/signature 参数打码）。
- **验收**：
  - `http_request` 对 `127.0.0.1`、`169.254.169.254` 等返回明确拒绝原因。
  - 正常公网 URL 可用，日志不打印敏感 query 值。

#### P0-4 修正明显的模板分类问题（新媒体）
- **问题**：官方“新媒体”模板被标为 `operation`，前端分类为 `new-media`，导致筛选为空/不准。
- **改进**：将对应官方模板 `category` 改为 `new-media`。
- **验收**：模板页按“新媒体”筛选能命中官方模板。

## 1.5 开发环境约束（必看）

- Node.js：要求 `>=20.19.0`（本仓库提供 `.nvmrc=20.19.0`；建议 `nvm use` 后再跑 `pnpm test`）
- CODE 节点/`/api/code/execute`：默认关闭（高风险），需要显式设置 `CODE_EXECUTION_ENABLED=true`

---

### Milestone P1（卖点补齐，建议下一轮）
- 工具执行器闭环：飞书多维表格（读写）+ 抖音/小红书/公众号/视频号（授权 + 执行器 + 可观测）。
- 多模态链路补齐：音频输入 → 转录可运行（audioInput 注入、文件处理、存储/权限）。
- 模板落地动作：发布/写表/分发由工具驱动形成闭环，而非仅生成内容。

### Milestone P2（体验与长期演进）
- 变量引用从“节点名”升级为“nodeId/输出 schema”，降低改名导致的脆弱性。
- 知识库降级路径加硬限制与报警，生产环境强制向量库可用。

---

## 2. 本次开发落地清单（对应 P0）

- 引擎执行：`PROCESS` 在满足条件时自动使用 `PROCESS_WITH_TOOLS` 处理器。
- token/模型/成本：chat usage 透传；ExecutionLog 写入 aiModel/aiProvider；Execution 回写 duration/tokens/estimatedCost。
- HTTP 工具：加入 SSRF 防护与 URL 日志脱敏。
- 模板分类：新媒体模板归类修正为 `new-media`。

## 4. 已提前落地的 P1 子项（多模态：音频转录）

- 处理器支持为 `audio-transcription` 模态自动注入 `audioInput.url`（从用户提示词中提取音频 URL，并对 `/uploads/...` 解析为绝对 URL）。
- 支持内部文件下载链接：当音频 URL 为本系统上传文件（`/api/files/{fileKey}/download`）时，服务端会读取文件内容并走“二进制转录”（避免三方无法访问鉴权下载链接）。
- 视觉输入增强：当多模态消息中包含本系统上传图片（`/api/files/{fileKey}/download`）时，会自动内联为 `data:image/*;base64,...`，使 OCR/视觉模型可直接使用（单图默认最大 5MB）。
- 视频输入增强：当多模态消息包含本系统上传视频（`/api/files/{fileKey}/download`）时，会自动生成短期签名下载链接（`token` query）供模型拉取（需要 `FILE_DOWNLOAD_TOKEN_SECRET` 或 `AUTH_SECRET/ENCRYPTION_KEY` 兜底）。
- 依赖环境变量（用于相对 URL 解析）：`NEXT_PUBLIC_APP_URL`（或 `NEXTAUTH_URL` 兜底）。

## 5. 已提前落地的 P1 子项（工具：飞书多维表格最小可用）

- 新增后端工具执行器 `feishu_bitable`，支持 records 的 `read/create/update/delete/search`（CRUD）：`src/lib/ai/function-calling/executors/feishu-bitable.ts:1`
- 启用方式：在 PROCESS 节点开启工具调用并添加“飞书多维表格”工具；运行环境需配置 `FEISHU_TENANT_ACCESS_TOKEN`（避免将 token 持久化在工作流配置中）。

## 7. 已提前落地的 P1 子项（工具：公众号/小红书/抖音/视频号）

- 微信公众号工具（最小闭环：草稿/发布/状态）：`src/lib/ai/function-calling/executors/wechat-mp.ts:1`（依赖 `WECHAT_MP_APP_ID`、`WECHAT_MP_APP_SECRET`）
- 小红书/抖音/视频号工具（环境变量驱动的最小执行器）：`src/lib/ai/function-calling/executors/xiaohongshu.ts:1`、`src/lib/ai/function-calling/executors/douyin-video.ts:1`、`src/lib/ai/function-calling/executors/wechat-channels.ts:1`
  - 这些平台的 OAuth/上传流程较复杂；本项目已升级为“token 落库 + OAuth 回调”（仍允许 env 兜底），发布侧仍需你提供可用的 API 网关地址（或对接官方发布 API）：
    - `XHS_API_BASE_URL` / `XHS_PUBLISH_ENDPOINT` / `XHS_ACCESS_TOKEN`
    - `DOUYIN_API_BASE_URL` / `DOUYIN_PUBLISH_ENDPOINT` / `DOUYIN_ACCESS_TOKEN`
    - `WECHAT_CHANNELS_API_BASE_URL` / `WECHAT_CHANNELS_PUBLISH_ENDPOINT` / `WECHAT_CHANNELS_ACCESS_TOKEN`

### OAuth（token 落库 + 回调）配置

- 数据库存储：新增 `IntegrationCredential`
  - 推荐：执行 `pnpm db:ensure-integrations`（仅创建 `integration_credentials`，避免 `db:push` 触发“未纳入 Prisma 的旧表”被误删）
- 通用加密：需要 `ENCRYPTION_KEY` 与 `ENCRYPTION_SALT`
- 回调域名：`NEXT_PUBLIC_APP_URL`（或 `NEXTAUTH_URL` 兜底；默认 `http://localhost:3000`）
- 产品化入口：`/settings/integrations`（支持一键发起授权、查看连接状态、断开连接；授权回调默认重定向回该页面）
- OAuth 环境变量（按平台配置授权/换 token 端点与应用凭证）：
  - 小红书：`OAUTH_XHS_CLIENT_ID` / `OAUTH_XHS_CLIENT_SECRET` / `OAUTH_XHS_AUTHORIZATION_URL` / `OAUTH_XHS_TOKEN_URL` / `OAUTH_XHS_SCOPES`
  - 抖音：`OAUTH_DOUYIN_CLIENT_ID` / `OAUTH_DOUYIN_CLIENT_SECRET` / `OAUTH_DOUYIN_AUTHORIZATION_URL` / `OAUTH_DOUYIN_TOKEN_URL` / `OAUTH_DOUYIN_SCOPES`
  - 视频号：`OAUTH_WECHAT_CHANNELS_CLIENT_ID` / `OAUTH_WECHAT_CHANNELS_CLIENT_SECRET` / `OAUTH_WECHAT_CHANNELS_AUTHORIZATION_URL` / `OAUTH_WECHAT_CHANNELS_TOKEN_URL` / `OAUTH_WECHAT_CHANNELS_SCOPES`

## 8. 已提前落地的 P1 子项（模板：发布闭环示例）

- 新增官方模板“一键多平台发布（公众号/小红书/抖音/视频号）”，在 PROCESS 节点启用工具调用并直接触发发布：`src/lib/templates/official-templates.ts:1100`

---

## 3. 建议的发布与回滚
- 发布方式：按后端运行时逻辑变更为主（引擎/日志/工具），可灰度到单组织或内部环境先验证统计口径。
- 回滚策略：
  - 处理器自动切换可通过开关（后续建议加配置项）或回退单文件变更快速撤销。
  - SSRF 防护若影响内网场景，可通过环境变量显式放开（后续建议）。

## 6. 已提前落地的 P2 子项（知识库与变量引用）

- 知识库内存相似度降级加硬限制：当 chunks 数量过大时自动降级到关键词搜索，并支持开关/阈值：
  - `KNOWLEDGE_IN_MEMORY_MAX_CHUNKS`（默认 2000）
  - `KNOWLEDGE_IN_MEMORY_DISABLED=true`
- 可选强制向量检索开关：`KNOWLEDGE_REQUIRE_VECTOR_STORE=true` 时，向量库不可用/无结果将直接报错（用于生产环境防止隐式降级）。
- 变量引用支持按 `nodeId` 引用（兼容原按节点名引用），降低改名导致的脆弱性：`src/lib/workflow/utils.ts:133`
