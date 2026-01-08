# AI Workflow（Web）现有功能实用性评估报告（30天口径｜按页面/路由）

> 生成时间：2026-01-08
>
> 说明：本报告以“现有功能/页面”为对象，从实用性角度建立评估体系，并给出逐路由的评分与建议动作。本项目未发现常见前端埋点（PostHog/Mixpanel/Sentry 等），但数据库已具备丰富的业务事实数据（Execution/TriggerLog/Feedback/Audit 等），因此本报告以**业务事实数据**为主要证据来源，并给出可直接落地的指标口径。
>
> 下一步（数据版）：补充每个页面的 SQL/Prisma 口径与可执行的数据抽取脚本后，可在任意环境跑出“近30天页面实用性排名（含真实数值）”。

---

## 1. 评估体系（PUE：Practical Utility Evaluation）

### 1.1 评估维度与权重（适配企业级工作流平台）
- **V 价值有效性（30%）**：是否处于核心价值链（编排→执行→优化→治理），对关键指标（成功执行/效率/成本/质量）是否有直接贡献。
- **U 可发现/可用性（10%）**：是否属于主导航/高频入口、信息架构是否清晰（本次以路由分组做近似）。
- **E 任务效率/闭环（20%）**：该页面是否能推动用户完成关键任务闭环（例如编辑→测试→发布→触发→查看结果→反馈→优化）。
- **R 可靠性/可运营性（20%）**：是否有日志/审计/错误可诊断与可恢复（与 ExecutionLog/AuditLog/SystemLog 等强相关）。
- **C 成本复杂度（5%）**：功能复杂度与维护面（本次以模块复杂度近似，不做代码级精算）。
- **F 战略/合规匹配（15%）**：多租户、权限、审计、计费、Token 等企业特性匹配度。

综合分（1~5）：`Score = Σ(维度分 × 权重)`

### 1.2 一票否决（Gate）
若触发以下任一项，即使综合分高也必须优先整改：
- 越权/权限绕过导致数据泄露（多租户场景）
- 核心执行链路不可追溯（无执行日志/审计）
- 对外能力（API Token/Webhook/Form）存在严重安全风险（密钥泄露、重放、无审计）

---

## 2. 数据证据（30天口径可直接计算）

### 2.1 已确认可用的数据表（Prisma）
- 执行与节点日志：`Execution` / `ExecutionLog`
- 输出与下载：`OutputFile`
- 触发器与日志：`WorkflowTrigger` / `TriggerLog`
- 审批：`ApprovalRequest` / `ApprovalDecision` / `ApprovalNotification`
- 知识库：`KnowledgeBase` / `KnowledgeDocument` / `EmbeddingUsage`
- 模板：`WorkflowTemplate` / `TemplateRating`
- 反馈：`ExecutionFeedback` / `NodeTestFeedback` / `PlatformFeedback`
- 审计与系统日志：`AuditLog` / `PlatformAuditLog` / `SystemLog`
- 组织与成员：`Organization` / `User` / `Department` / `Invitation` / `ApiToken`

### 2.2 已确认的统计 API（可直接给分析页提供证据）
- `GET /api/workflows/[id]/analytics?period=month`（近30天）：执行量/成功率/耗时/tokens/评分/准确率/问题分类/趋势/建议统计
- `GET /api/workflows/[id]/analytics/data`（默认近30天）：AnalyticsConfig + AnalyticsDataPoint 聚合
- `GET /api/executions?startDate&endDate&statusIn&executionType`：执行列表（支持时间筛选）

---

## 3. 路由清单与实用性评估表（逐条打分+排名）

> 评分说明：当前为“数据底座充分、页面级访问缺失”的情况下的**可复现评分**。
> - 对执行/触发/知识库/审批等核心能力：可直接用业务事实数据做量化（执行量、成功率、耗时、失败原因）。
> - 对 Auth/落地页/Console 等：缺少转化/访问数据时，评分以“必要性与风险”保守估计，建议后续补充访问/漏斗。

字段含义：
- **核心30天指标（建议）**：该页面在30天口径下最应统计的指标
- **数据源（表/接口）**：建议从哪些表/接口计算
- **评分（V/U/E/R/C/F）**：1~5
- **综合分**：按权重计算后的近似值（用于排序）
- **动作建议**：保留强化 / 优化体验 / 补数据 / 收敛合并 / 风险整改

### 3.1 排名表

> 注：为实现“评分 + 数据证据”的最终融合，本表新增一列 **30天关键数据（证据）**。其数值来自 `docs/PUE_30D_DATA_REPORT.md`。

| 排名 | 路由 | 功能/页面 | 核心30天指标（建议） | 数据源（表/接口） | 30天关键数据（证据） | V | U | E | R | C | F | 综合分(≈) | 动作建议 |
|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | /(editor)/workflows/[id] | 工作流编辑器 | 版本新增数、测试执行量/正式执行量、发布次数、执行成功率（关联） | Workflow/WorkflowVersion/Execution | 版本新增：20（30天）；测试执行：26；编辑过的工作流：7；整体成功率：26.9% | 5 | 4 | 5 | 4 | 3 | 4 | 4.55 | 继续强化：版本/发布/权限/测试一体化；把“变量引用校验/模型能力约束/凭据连通性测试”做成发布前阻断 |
| 2 | /(dashboard)/executions/[id] | 执行详情 | 节点失败Top、错误分类、可恢复率、输出文件下载、反馈覆盖率 | Execution/ExecutionLog/OutputFile/ExecutionFeedback | 5 | 3 | 4 | 5 | 3 | 4 | 4.35 | 强化诊断中心：错误分类标准化、从节点继续/一键重试、输出可追溯 |
| 3 | /(dashboard)/executions | 执行列表 | 执行总量、成功率、P95耗时、失败原因Top、成本（如有） | Execution（/api/executions） | 执行总量：186；成功率：26.9%；失败：136；P95耗时：535,667ms（≈8.9min） | 5 | 4 | 4 | 4 | 3 | 4 | 4.30 | 强化可运营：默认按失败率/耗时排序；提供失败原因Top与一键定位到问题工作流/节点 |
| 4 | /(dashboard)/workflows | 工作流列表 | 活跃工作流数（30天有执行）、发布占比、执行量分布、版本增量 | Workflow/Execution/WorkflowVersion | 活跃工作流：11；30天新建工作流：56；整体成功率：26.9%（提示需做“问题工作流榜单”入口） | 5 | 4 | 4 | 3 | 3 | 4 | 4.10 | 优化治理：提供“问题工作流榜单/失败原因Top/慢工作流Top”；按失败率/耗时排序默认展示 |
| 5 | /(editor)/workflows/[id]/analytics | 工作流分析 | totalExecutions、successRate、avgDuration、avgTokens、avgRating、accuracyRate、issueBreakdown、trend | /api/workflows/[id]/analytics?period=month | 4 | 3 | 4 | 4 | 3 | 4 | 3.85 | 把分析结论导回“可行动”：一键生成优化任务/建议落地 |
| 6 | /(dashboard)/knowledge-bases/[id] | 知识库详情 | 文档处理成功率、失败原因Top、embedding token/成本、卡死文档数 | KnowledgeDocument/EmbeddingUsage | 5 | 3 | 3 | 4 | 3 | 4 | 3.95 | 强化可靠性：失败重试/卡死恢复可视化；把命中/反馈接入分析 |
| 7 | /(dashboard)/knowledge-bases | 知识库列表 | 新建数、活跃KB数、处理失败率概览、成本概览 | KnowledgeBase/KnowledgeDocument/EmbeddingUsage | 30天文档处理量：2；成功率：50.0%；处理中：0（样本偏少，需关注后续增长与稳定性） | 5 | 3 | 3 | 3 | 3 | 4 | 3.75 | 优化可运营：提供“处理失败原因/重试/成本”概览；样本少时优先做可用性与入口曝光 |
| 8 | /(editor)/workflows/new | 新建工作流 | 新建数、新建→首次执行转化（<=7天）、新建后发布率 | Workflow/Execution | 4 | 4 | 4 | 3 | 3 | 4 | 3.85 | 强化上手：模板/向导、默认示例数据、一键测试 |
| 9 | /(dashboard)/triggers | 触发器 | 触发次数、成功率、触发→执行转化、失败原因Top、重试效果 | TriggerLog/WorkflowTrigger | 30天触发量：0（当前主要靠手动执行/测试执行？需验证）；成功率：0% | 4 | 3 | 3 | 4 | 3 | 4 | 3.65 | 优先确认产品策略：是否要主推自动触发；若要主推，需做入口曝光/示例/一键测试与日志诊断 |
| 10 | /(editor)/workflows/[id]/analytics/config | 分析配置 | active config 数、datapoint数、配置空跑占比 | AnalyticsConfig/AnalyticsDataPoint（/analytics/data） | 3 | 2 | 3 | 3 | 3 | 3 | 2.85 | 降低门槛：提供默认指标模板/口径说明；避免配置后无数据 |
| 11 | /(dashboard)/approvals | 审批 | 请求量、平均处理时长、超时率、通知失败率 | ApprovalRequest/Decision/Notification | 4 | 3 | 3 | 4 | 3 | 4 | 3.65 | 强化与执行联动：从审批直达执行/节点；完善超时策略与告警 |
| 12 | /(dashboard)/templates | 模板库 | usage（若可分时段）、30天新增评分/均分、使用→执行转化 | WorkflowTemplate/TemplateRating/Execution(间接) | 3 | 3 | 3 | 3 | 3 | 4 | 3.25 | 明确定位：上手/复用增长；补“使用事件时间维度”或审计事件 |
| 13 | /(dashboard)/settings/api | API Token | 新建token数、lastUsedAt活跃token数、usageCount增量 | ApiToken | 4 | 3 | 3 | 4 | 3 | 5 | 3.95 | 强化安全：最小权限scopes、轮换、审计；提供用量与异常检测 |
| 14 | /(dashboard)/settings/integrations | 集成中心 | 授权成功率、连接测试成功率、失败原因Top、凭据过期率 | IntegrationCredential + integrations API | 4 | 3 | 2 | 3 | 2 | 4 | 3.25 | 强化可用：统一授权/测试/诊断；凭据轮换与告警 |
| 15 | /(dashboard)/settings/ai-config | 模型/密钥配置 | 活跃provider数、默认模型使用占比、调用失败率（需关联 ExecutionLog） | ApiKey/ExecutionLog | 4 | 3 | 2 | 3 | 2 | 4 | 3.25 | 降低出错：配置校验、试跑、失败归因（provider/model） |
| 16 | /(dashboard)/settings/members | 成员管理 | 邀请发送/接受率、活跃成员数（lastLoginAt）、权限变更审计 | User/Invitation/AuditLog | 3 | 3 | 2 | 3 | 3 | 5 | 3.30 | 增强治理：角色/部门权限可视化；关键操作审计与导出 |
| 17 | /(dashboard)/settings/departments | 部门管理 | 部门结构变更频度、部门活跃用户数、权限配置覆盖 | Department/User/Permission tables | 3 | 2 | 2 | 3 | 3 | 5 | 3.10 | 控制复杂度：部门/权限联动校验；避免“配置正确但不生效” |
| 18 | /(dashboard)/settings/organization | 组织设置 | 组织信息维护频度、关键设置变更审计 | Organization/AuditLog | 3 | 2 | 2 | 3 | 3 | 5 | 3.10 | 强化合规：关键字段修改审计；与计费/安全设置联动 |
| 19 | /(dashboard)/settings/profile | 个人资料 | 活跃用户维护、头像/名称更新量（低优先） | User | 2 | 2 | 2 | 3 | 4 | 3 | 2.35 | 维持可用即可；避免投入过多 |
| 20 | /(dashboard)/settings/billing | 计费 | 计划变更、用量/配额消耗（apiUsed/apiQuota）、欠费/限制事件 | Organization(plan/apiUsed) + billing API | 4 | 2 | 2 | 3 | 3 | 5 | 3.35 | 商业化关键：补用量口径与告警；变更/发票/对账链路 |
| 21 | /(dashboard)/feedback | 用户反馈（企业侧） | 反馈量、处理时长、与 execution/workflow 关联率 | PlatformFeedback/ExecutionFeedback | 3 | 2 | 2 | 3 | 3 | 4 | 2.75 | 做闭环：反馈必须可回溯到执行/版本；否则会沦为信息黑洞 |
| 22 | /(public)/form/[token] | 公开表单 | 提交量、成功率、失败原因Top、平均耗时、重复提交 | WorkflowForm/Submission/Execution | 4 | 2 | 3 | 3 | 3 | 4 | 3.35 | 强化对外交付：防滥用/限流/审计；失败重试与结果展示策略 |
| 23 | /(landing)/pricing | 定价页 | 访问→注册/申请转化（缺口）、咨询/试用转化 | （需前端访问/漏斗）+ OrgApplication | 3 | 3 | 2 | 2 | 4 | 4 | 2.80 | 必须补转化数据；否则无法评估实用性与商业化贡献 |
| 24 | /page.tsx | 首页/落地页 | 访问→注册/登录/申请转化（缺口） | （需前端访问/漏斗） | 3 | 3 | 2 | 2 | 4 | 3 | 2.70 | 补转化漏斗；明确首页定位（营销/入口/文档） |
| 25 | /(auth)/login | 登录 | 登录成功率、失败原因Top、平均耗时（缺口） | User.lastLoginAt + AuditLog（若有） | 4 | 4 | 3 | 3 | 4 | 4 | 3.65 | 补可观测：失败原因/锁定策略；安全与体验平衡 |
| 26 | /(auth)/register | 注册 | 注册成功率/流失（缺口）、注册→首次执行转化 | User.createdAt + Execution | 3 | 4 | 3 | 3 | 4 | 3 | 3.25 | 明确 ToB 注册策略：走申请/邀请优先？避免路径冲突 |
| 27 | /(auth)/forgot-password | 忘记密码 | 请求量、完成率（缺口） | PasswordResetToken | 2 | 3 | 2 | 3 | 4 | 3 | 2.55 | 保持可用；补邮件送达/失败观测 |
| 28 | /(auth)/reset-password | 重置密码 | 成功率、token过期率 | PasswordResetToken | 2 | 3 | 2 | 3 | 4 | 3 | 2.55 | 同上 |
| 29 | /(auth)/change-password | 修改密码 | 修改量、失败原因（缺口） | AuditLog（若记录） | 2 | 2 | 2 | 3 | 4 | 4 | 2.55 | 关键在安全：审计与策略（强密码/轮换） |
| 30 | /(auth)/invite/[token] | 邀请加入 | 接受率、过期率、重复使用 | Invitation | 3 | 2 | 3 | 3 | 4 | 5 | 3.30 | 强化：邀请权限范围、过期策略、审计 |
| 31 | /(auth)/apply | 企业申请 | 申请量、审批通过率、处理时长 | OrgApplication | 3 | 2 | 2 | 3 | 4 | 4 | 2.95 | 与 Console applications 形成闭环；补漏斗数据 |
| 32 | /(console-auth)/console/login | 平台后台登录 | 登录成功率（缺口）、安全事件 | PlatformAdmin/PlatformAuditLog | 3 | 2 | 2 | 4 | 4 | 5 | 3.30 | 安全优先：审计、锁定、IP限制 |
| 33 | /(console)/console/organizations | 平台组织管理 | 组织创建/停用/状态变更、处理时长 | Organization/PlatformAuditLog | 3 | 2 | 2 | 4 | 3 | 5 | 3.25 | 控制范围：只保留运营必需；所有操作必须审计 |
| 34 | /(console)/console/organizations/[id] | 组织详情 | 同上 + 配额/用量排障 | Organization/SystemLog/PlatformAuditLog | 3 | 2 | 2 | 4 | 3 | 5 | 3.25 | 同上 |
| 35 | /(console)/console/organizations/create | 新建组织 | 创建成功率、后续活跃（缺口） | Organization/PlatformAuditLog | 2 | 2 | 2 | 4 | 3 | 5 | 3.00 | 仅在确有运营场景时保留 |
| 36 | /(console)/console/applications | 申请管理 | 30天申请量、通过率、处理时长 | OrgApplication | 3 | 2 | 3 | 4 | 3 | 5 | 3.45 | 建议与 /apply、/register 的策略统一 |
| 37 | /(console)/console/audit-logs | 平台审计日志 | 审计覆盖率（应100%）、查询性能 | PlatformAuditLog | 4 | 2 | 3 | 5 | 3 | 5 | 4.05 | 合规核心：优先保证完整性/可检索/留存策略 |
| 38 | /(console)/console/system-logs | 系统日志 | 30天错误率、错误分类、traceId关联率 | SystemLog | 3 | 2 | 2 | 5 | 3 | 4 | 3.55 | 与告警/排障流程绑定：否则价值难释放 |
| 39 | /(console)/console/admins | 平台管理员 | 管理员变更频率、权限审计 | PlatformAdmin/PlatformAuditLog | 3 | 2 | 2 | 4 | 3 | 5 | 3.20 | 严控权限；操作留痕 |
| 40 | /(console)/console/templates | 平台模板管理 | 模板上架/下架、官方模板命中率（缺口） | WorkflowTemplate + PlatformAuditLog | 2 | 2 | 2 | 3 | 3 | 4 | 2.75 | 若与用户侧重复，建议合并职责与入口 |
| 41 | /(console)/console/feedback | 平台反馈 | 30天反馈量、处理时长、关联率 | PlatformFeedback | 3 | 2 | 2 | 3 | 3 | 4 | 2.75 | 关键是闭环与 SLA；否则低实用 |
| 42 | /(console)/console/accuracy | 平台准确性 | 准确性口径明确性（缺口）、样本量、与优化建议关联 | ExecutionFeedback/NodeTestFeedback/WorkflowAnalytics | 3 | 2 | 2 | 3 | 3 | 4 | 2.90 | 明确“评估对象/指标/动作”：否则容易变维护负担 |
| 43 | /(console)/console/dashboard | 平台仪表盘 | 运营关键指标（缺口） | 多表汇总 | 2 | 2 | 2 | 3 | 3 | 4 | 2.65 | 必须明确“决策用途”再做 |
| 44 | /(console)/console/settings | 平台设置 | 变更频度（低）+ 风险高 | PlatformAuditLog | 2 | 2 | 2 | 4 | 3 | 5 | 3.00 | 所有关键设置必须审计 |

---

## 4. 30天数据证据（自动生成）

> 数据来源：`pnpm -s pue:30d` 生成的 `docs/PUE_30D_DATA_REPORT.md`（数据库业务事实数据）。

### 4.1 组织级概览（近30天）
- 执行总量：186
- 执行成功率：26.9%（成功 50 / 失败 136）
- 执行 P95 耗时：535,667 ms（约 8.9 分钟）
- 活跃工作流数（30天有执行）：11
- 30天测试执行量（TEST）：26
- 30天新建工作流数：56
- 30天新增版本数：20（涉及工作流数 7）
- 触发器触发量：0
- 知识库文档处理量：2（成功率 50.0%）
- 审批请求量：0

### 4.2 失败问题分类看板（近30天，基于 error 文本规则分类）
> 失败执行总数（纳入分析）：133
- 其他/未分类：41（30.8%）
- API Key 解密/加密密钥问题（ENCRYPTION_KEY）：32（24.1%）
- 变量引用/输入校验失败：22（16.5%）
- 系统重启/中断导致执行失败：11（8.3%）
- 第三方鉴权失败（401/无效 token）：8（6.0%）
- 文件/存储配置问题（OSS/S3/本地）：8（6.0%）
- 未配置 AI 服务商/模型配置缺失：6（4.5%）
- 模型/能力选择错误（例如视频模型用于文本）：5（3.8%）

### 4.3 节点类型失败/慢节点（ExecutionLog）
- 失败 Top：PROCESS（失败 91 / 总 642，失败率 14.2%）、OUTPUT（失败 8 / 总 25，失败率 32.0%）
- 慢 Top（P95）：PROCESS 70,379ms；OUTPUT 18,218ms

### 4.4 问题工作流 Top（摘录）
- 凤韩研发AI工作流（DRAFT_MODIFIED）：42 次执行，成功率 9.5%，失败率 90.5%，P95 191,677ms；主要问题：变量引用/输入校验、模型能力选择错误、未配置服务商
- 微信公众号文章智能二创助手（DRAFT_MODIFIED）：91 次执行，成功率 26.4%，失败率 73.6%，P95 836,029ms；主要问题：API Key 解密（ENCRYPTION_KEY）、系统重启中断、OpenAI 401

---

## 5. 关键结论与优先级建议（30天）

### 4.1 必保与应强化（S/A级）
- **工作流编辑器、执行列表/详情、工作流管理、知识库、触发器、分析页**：这是产品价值主干。
- 优先投入方向建议：
  1) **可诊断与可恢复**（Execution/ExecutionLog 已具备，重点在前台呈现与标准化错误）
  2) **闭环能力**（分析/反馈/建议 → 可直接生成可执行的优化任务/版本变更）
  3) **对外能力的安全与审计**（API Token / Webhook / Public Form）

### 4.2 需要补证据后再决定投入（B/C级）
- Landing/首页、Auth、Console dashboard/settings/accuracy：缺少访问/转化/决策用途证据，建议先补最小观测与目标定义。

---

## 5. 证据缺口清单（补齐后可形成“全量数据版排名”）

1) 页面访问与转化（Landing/首页/Auth）
- 最小方案：服务端 middleware 记录 pageview（或接入任意轻量 analytics）
- 关键口径：访问 → 注册/申请 → 首次执行

2) 编辑器内关键动作（可选）
- 目前可用“版本新增 + 测试执行”做代理，但若要优化体验瓶颈，仍建议补：保存、节点增删改、调试、发布。

3) Console 各页面“决策用途”
- 每个 Console 页面需明确：谁用、用来做什么决策、对应哪些指标，否则容易膨胀。

---

## 6. 附录：本次识别到的页面路由清单

- /(auth)/apply
- /(auth)/change-password
- /(auth)/forgot-password
- /(auth)/invite/[token]
- /(auth)/login
- /(auth)/register
- /(auth)/reset-password
- /(console)/console/accuracy
- /(console)/console/admins
- /(console)/console/applications
- /(console)/console/audit-logs
- /(console)/console/dashboard
- /(console)/console/feedback
- /(console)/console/organizations
- /(console)/console/organizations/[id]
- /(console)/console/organizations/create
- /(console)/console/settings
- /(console)/console/system-logs
- /(console)/console/templates
- /(console-auth)/console/login
- /(dashboard)/approvals
- /(dashboard)/dashboard
- /(dashboard)/executions
- /(dashboard)/executions/[id]
- /(dashboard)/feedback
- /(dashboard)/knowledge-bases
- /(dashboard)/knowledge-bases/[id]
- /(dashboard)/settings/ai-config
- /(dashboard)/settings/api
- /(dashboard)/settings/billing
- /(dashboard)/settings/departments
- /(dashboard)/settings/integrations
- /(dashboard)/settings/members
- /(dashboard)/settings/organization
- /(dashboard)/settings/profile
- /(dashboard)/templates
- /(dashboard)/triggers
- /(dashboard)/workflows
- /(editor)/workflows/[id]
- /(editor)/workflows/[id]/analytics
- /(editor)/workflows/[id]/analytics/config
- /(editor)/workflows/new
- /(landing)/pricing
- /(public)/form/[token]
- /page.tsx
