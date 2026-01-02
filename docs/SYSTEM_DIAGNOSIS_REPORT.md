# AI Workflow 项目系统诊断报告（聚焦 7 大能力）

更新时间：2025-12-31  
诊断范围（按需求）：  
1) 调用工具：飞书多维表格、抖音、公众号、视频号、小红书、HTTP 请求  
2) AI 规划功能：一键创建工作流，降低学习成本  
3) 多模态：图片、视频、音频、代码  
4) 工作流：统计分析与优化  
5) 核心模板：新媒体、销售（10 大模板）、人力资源  
6) 账号登录与管理  
7) 知识库检索

---

## 0. 现状速写（便于对齐期望）

- 技术架构：Next.js + NextAuth + Prisma（MySQL），多租户（Organization/User/Department）模型齐全。
- 工作流引擎：当前是“简化版”，核心节点类型以 `INPUT` + `PROCESS` 为主（`src/types/workflow.ts`、`src/lib/workflow/processors/index.ts`）。
- 工具调用：后端目前只实现了 **HTTP 工具** + **通知工具（飞书/钉钉/企微 Webhook）**（`src/lib/ai/function-calling/executors/http.ts`、`src/lib/ai/function-calling/executors/notification.ts`）。

---

## 1) 调用工具能力诊断（飞书多维表格/抖音/公众号/视频号/小红书/HTTP）

### 1.1 覆盖情况（UI vs 后端）

| 工具 | UI 配置面板 | 后端执行器 | 运行时可用性（在工作流“执行”中） |
|---|---|---|---|
| HTTP 请求 | ✅ | ✅ `http_request` | ⚠️ 需看 1.2（运行时路由问题） |
| 飞书通知 | ✅ | ✅ `send_notification` | ⚠️ 需看 1.2 |
| 钉钉通知 | ✅ | ✅ `send_notification` | ⚠️ 需看 1.2 |
| 企微通知 | ✅ | ✅ `send_notification` | ⚠️ 需看 1.2 |
| 飞书多维表格 | ✅ | ❌（仅映射名，无执行器实现） | ❌ |
| 小红书 | ✅ | ❌（仅映射名，无执行器实现） | ❌ |
| 抖音 | ✅ | ❌（仅映射名，无执行器实现） | ❌ |
| 微信公众号 | ✅ | ❌（仅映射名，无执行器实现） | ❌ |
| 视频号 | ❌（未发现工具类型/后端代码） | ❌ | ❌ |

关键文件：
- UI 工具类型：`src/components/workflow/node-config-panel/shared/tools-section.tsx`
- 工具类型映射/实现标记：`src/lib/ai/function-calling/tool-name-mapper.ts`
- 已实现执行器：`src/lib/ai/function-calling/executors/http.ts`、`src/lib/ai/function-calling/executors/notification.ts`

### 1.2 阻塞问题：工作流执行链路未“自动启用工具处理器”

- 引擎执行节点时按 `node.type` 直接取处理器（`src/lib/workflow/engine/executor.ts`），不会因为 `PROCESS.config.enableToolCalling/tools[]` 自动切换到 `PROCESS_WITH_TOOLS`。
- “自动切换到工具处理器”的逻辑目前只出现在单节点调试（`src/lib/workflow/debug.ts`），而非工作流执行引擎。

**结果**：即使在 UI 为 PROCESS 配置了工具，工作流真正执行时也可能仍走普通 `PROCESS` 处理器，工具调用无法发生。

### 1.3 风险点（建议纳入安全/合规）

- SSRF 风险：HTTP 工具未见域名/IP allowlist/denylist 等限制（`src/lib/ai/function-calling/executors/http.ts`）。
- 敏感信息泄露风险：创建/调试/日志中可能输出包含工具参数的内容（例如 webhookUrl、headers、Authorization 等），建议统一做日志脱敏与存储策略约束。

---

## 2) AI 规划功能诊断（一键创建工作流）

### 2.1 已具备能力

- 工作流列表页提供 “AI 帮我建” 入口（`src/components/workflow/create-workflow-dialog.tsx`）。
- 具备“生成详细规格说明 + 创建工作流”的后端 API：
  - `/api/ai-assistant/generate-workflow-prompt`：把用户需求扩写成结构化规格（`src/app/api/ai-assistant/generate-workflow-prompt/route.ts`）
  - `/api/ai-assistant/create-workflow`：基于规格/简述生成节点 actions 并落库（`src/app/api/ai-assistant/create-workflow/route.ts`）
- 支持模板推荐（`src/app/api/templates/recommend/route.ts`）。

### 2.2 主要问题

- 节点类型能力受限：生成器系统提示词明确只允许 `INPUT/PROCESS`，复杂工作流（条件、循环、并行、审批等）当前无法“一键”生成到可运行形态。
- 工具配置“可生成但不可运行”：创建 API 允许 AI 生成如 `feishu-bitable` 等工具配置（`src/app/api/ai-assistant/create-workflow/route.ts` 中 `enrichToolConfig`），但后端执行器未实现且运行时工具处理器未启用（见 1.1/1.2）。
- 校验告警被忽略：`validateWorkflowActions()` 的结果不会阻止落库，容易生成“结构合法性/连通性/命名冲突”问题的工作流（`src/app/api/ai-assistant/create-workflow/route.ts`）。
- 变量引用脆弱：变量替换主要依赖“节点名称”匹配（`src/lib/workflow/utils.ts` 的 `findNodeOutputByName`），改名/同名/多语言命名会导致引用失效或取错值。

---

## 3) 多模态诊断（图片/视频/音频/代码）

### 3.1 已具备能力

- PROCESS 节点支持多模态输出路由：text / image-gen / video-gen / audio-tts / embedding / ocr（`src/lib/workflow/processors/modality-router.ts`）。
- 图片/视频可以通过变量替换转成 `image_url` / `video_url` 传给模型（`src/lib/workflow/utils.ts` 的 `createContentPartsFromText` 与 `convertValueToContentParts`）。

### 3.2 核心缺口

- **音频转录链路不可达**：转录要求传入 `audioInput`（`src/lib/workflow/processors/modality-router.ts`），但当前 PROCESS 调用方未传该参数（`src/lib/workflow/processors/process.ts`），导致“音频输入→转录→输出”无法真正跑通。
- “代码”目前是“生成/对话”，不是“执行”：没有工作流层的 `CODE` 节点；且 `/api/code/execute` 已禁用（`src/app/api/code/execute/route.ts`）。

---

## 4) 工作流统计分析与优化诊断

### 4.1 已具备能力

- 分析接口/页面较齐：工作流统计、节点统计、成本统计（`src/app/api/workflows/[id]/analytics/*`）。
- 有用户反馈→诊断→建议的链路（`src/app/api/executions/[id]/feedback/route.ts`、`src/lib/services/diagnosis.service.ts`）。

### 4.2 关键问题（会直接导致统计“看起来没数据/数据不准”）

- 执行引擎没有把 `duration / totalTokens / promptTokens / completionTokens / estimatedCost` 写回 executions 表（`src/lib/workflow/engine.ts`），但统计 API 依赖这些字段（例如成本趋势）。
- 节点日志 `ExecutionLog` 未写入 `aiModel / aiProvider`（`src/lib/workflow/engine/logger.ts`），但成本统计依赖按模型聚合（`src/app/api/workflows/[id]/analytics/cost/route.ts`）。
- token 统计丢失：文本 chat 返回的 usage 没有向上透传到节点输出与引擎汇总（`src/lib/workflow/processors/modality-router.ts` 返回的 TextOutput 只有 content/model；`src/lib/workflow/processors/process.ts` 甚至把 tokenUsage 写成 0）。

---

## 5) 核心模板诊断（新媒体 / 销售 10 大模板 / HR）

### 5.1 已具备能力

- 官方模板库存在且大多适配当前 INPUT/PROCESS（`src/lib/templates/official-templates.ts`）。
- 销售类模板数量满足“10 大模板”（通过 `category: "sales"` 可统计到 10 条）。

### 5.2 主要问题

- 新媒体模板分类不匹配：示例新媒体模板被标为 `category: "operation"`（`src/lib/templates/official-templates.ts`），而前端分类里新媒体是 `new-media`（`src/lib/constants/template-categories.ts`），会导致“按新媒体筛选为空/不准”。
- 模板内容涉及多平台发布，但对应平台工具执行器缺失（见 1.1），落地只停留在“生成文案”而非“发布/写表/分发”。

---

## 6) 账号登录与管理诊断

### 6.1 已具备能力

- 登录、注册、忘记密码/重置密码、改密（`src/app/api/auth/*`）。
- 登录失败次数与锁定、企业状态校验（`src/lib/auth/index.ts`）。
- 多租户组织/部门/权限模型与相关 API 基础齐全（Prisma schema 与 `src/lib/permissions/*`）。

### 6.2 主要问题

- 口径不一致：UI 文案“邮箱/手机号登录”，但实现按 `email` 字段查用户（`src/lib/auth/index.ts`），手机号登录未落地。
- 密码策略/安全设置不统一：注册强校验（12 位+复杂度），但 `Organization.securitySettings` 写入的是弱策略且未见贯穿使用（`src/app/api/auth/register/route.ts`）。

---

## 7) 知识库检索诊断

### 7.1 已具备能力

- RAG 检索 API + 权限校验 + 可选查询重写（`src/app/api/knowledge-bases/[id]/search/route.ts`）。
- 向量存储抽象：支持 Supabase/pgvector/内存降级（`src/lib/knowledge/vector-store/factory.ts`）。

### 7.2 主要问题/风险

- 降级路径的规模风险：当向量库不可用/为空时，会从数据库取全量 chunks 并在内存里做相似度计算（`src/lib/knowledge/search.ts`），数据量增大后会出现明显性能问题。

---

## 建议优先级（P0/P1/P2）

### P0（先让“能跑起来、数据可信”）

1. **让工具调用在“工作流执行”中真正生效**：把 debug 里的“切换到 `PROCESS_WITH_TOOLS`”逻辑下沉到执行器/引擎执行链路（见 1.2）。
2. **把执行指标写回数据库并补齐日志字段**：写回 executions 的 duration/tokens 等；ExecutionLog 写入 aiModel/aiProvider；并把 chat usage 真正透传出来（见 4.2）。
3. **收敛风险面**：HTTP 工具加 SSRF 防护与日志脱敏；工具参数敏感字段不入库/不打印。

### P1（补齐产品卖点）

1. 实现飞书多维表格（读写）、并补齐抖音/小红书/公众号/视频号的“可用工具执行器 + 授权体系 + 可观测日志”。
2. 打通音频输入→转录（补齐 audioInput 注入/文件处理链路）。
3. 修正模板分类与模板落地动作（新媒体分类、发布类能力依赖工具闭环）。

### P2（体验与长期演进）

1. 变量引用从“按节点名”升级为“按 nodeId/输出字段规范”，减少改名导致的工作流脆弱性。
2. 知识库向量存储强制生产化（Supabase/pgvector）并对降级路径加硬限制与报警。

