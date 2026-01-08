# AI Workflow｜PUE 30天数据版报告（页面排名 + 问题工作流榜单 + 问题分类看板）

数据范围：2025-12-09T14:29:48.779Z ~ 2026-01-08T14:29:48.779Z

## 1) 组织级概览

- 执行总量：186
- 执行成功率：26.9%（成功 50 / 失败 136）
- 执行 P95 耗时（ms）：535667
- 活跃工作流数（30天有执行）：11
- 30天测试执行量（executionType=TEST）：26
- 30天新建工作流数：56
- 30天新增版本数：20（涉及工作流数 7）
- 触发器触发量：0，成功率 0.0%
- 知识库文档处理量：2，成功率 50.0%，处理中 0
- 审批请求量：0，待处理 0，超时 0
- 30天模板新增评分：0
- 30天新增 API Token：1，活跃 Token：1

## 2) 页面排名（增强：加入编辑器相关使用代理）

> 注：当前缺少 pageview 埋点，因此页面访问量无法直接统计。本排名以业务事实（执行/版本/测试执行/触发/知识库处理/审批等）作为“页面使用强度”代理。

| 排名 | 路由 | 页面 | 模块 | 使用强度（Proxy） | 健康度（Proxy） |
|---:|---|---|---|---|---|
| 1 | /(dashboard)/executions | 执行列表 | Execution | execTotal=186 | successRate=26.9%, p95(ms)=535667 |
| 2 | /(dashboard)/workflows | 工作流列表 | Workflow | activeWorkflowCount=11, newWorkflows=56 | execSuccessRate=26.9% |
| 3 | /(editor)/workflows/[id] | 工作流编辑器（代理） | Editor | versionNew=20, testExec=26, editedWorkflows=7 | 整体成功率=26.9% |
| 4 | /(dashboard)/knowledge-bases | 知识库 | KnowledgeBase | kbDocTotal=2 | kbDocSuccessRate=50.0%, processing=0 |
| 5 | /(dashboard)/settings/api | API Token | IAM | new=1, active=1 | - |
| 6 | /(dashboard)/triggers | 触发器 | Trigger | triggerLogsTotal=0 | triggerSuccessRate=0.0% |
| 7 | /(dashboard)/approvals | 审批 | Approval | approvalTotal=0 | pending=0, timeout=0 |
| 8 | /(dashboard)/templates | 模板库 | Template | newRatings=0 | - |

## 3) 问题分类看板（基于失败执行 error 文本规则分类）

失败执行总数（纳入分析）：133

| 问题类型 | 失败数 | 占比 |
|---|---:|---:|
| 其他/未分类 | 41 | 30.8% |
| API Key 解密/加密密钥问题（ENCRYPTION_KEY） | 32 | 24.1% |
| 变量引用/输入校验失败（节点不存在、字段缺失等） | 22 | 16.5% |
| 系统重启/中断导致执行失败 | 11 | 8.3% |
| 第三方鉴权失败（401/无效 token） | 8 | 6.0% |
| 文件/存储配置问题（OSS/S3/本地） | 8 | 6.0% |
| 未配置 AI 服务商/模型配置缺失 | 6 | 4.5% |
| 模型/能力选择错误（例如视频模型用于文本） | 5 | 3.8% |

### 3.1 节点类型失败 Top 10（ExecutionLog）

| nodeType | 失败数 | 总数 | 失败率 |
|---|---:|---:|---:|
| PROCESS | 91 | 642 | 14.2% |
| OUTPUT | 8 | 25 | 32.0% |

### 3.2 节点类型慢 Top 10（ExecutionLog duration P95）

| nodeType | P95耗时(ms) | 样本数 |
|---|---:|---:|
| PROCESS | 70379 | 642 |
| OUTPUT | 18218 | 25 |
| INPUT | 1 | 181 |

## 4) 问题工作流榜单（Top 15｜近30天）

筛选条件：近30天执行次数 ≥ 3

| 排名 | workflowId | 名称 | 发布状态 | 30天执行次数 | 成功率 | 失败率 | P95耗时(ms) | Top问题类型（最多3条） | Top失败原因（最多3条） |
|---:|---|---|---|---:|---:|---:|---:|---|---|
| 1 | cmjdz1u9m0018efn2020ozh90 | 凤韩研发AI工作流 | DRAFT_MODIFIED | 42 | 9.5% | 90.5% | 191677 | 18× 变量引用/输入校验失败（节点不存在、字段缺失等）<br/>7× 其他/未分类<br/>5× 模型/能力选择错误（例如视频模型用于文本） | 6× 节点 "AI致敏物质提示生成" 输入验证失败: 变量引用 "{{输入.供应商致敏物质提示}}" 无法解析：节点不存在; 变量引用 "{{输入.配方}}" 无法解析：节点不存在; 变量引用 "{{输入.配方}}" 无法解析：节点不存在<br/>5× 节点 "AI致敏物质提示生成" 执行失败: 模型配置错误：模型 'google/veo3.1-fast-preview' 是媒体生成模型（视频），不支持文本对话/处理任务。请在节点配置中选择文本或对话模型（如 Claude, GPT, Gemini Pro 等）。<br/>4× 节点 "替代" 执行失败: 未配置 AI 服务商 |
| 2 | cmjsmsfjn0001efk73lpkohga | 微信公众号文章智能二创助手 | DRAFT_MODIFIED | 91 | 26.4% | 73.6% | 836029 | 29× API Key 解密/加密密钥问题（ENCRYPTION_KEY）<br/>22× 其他/未分类<br/>10× 系统重启/中断导致执行失败 | 29× 节点 "文章内容抓取" 执行失败: 无法解密 API Key：加密密钥可能已更改或数据损坏。请检查以下项目：
1. 确保 ENCRYPTION_KEY 环境变量设置正确且未更改
2. 如果您更改了 ENCRYPTION_KEY，需要重新配置所有 API Key
3. 在设置页面重新输入并保存 AI 配置<br/>6× 服务器重启：执行被中断。请重新执行工作流。<br/>6× 节点 "文章内容抓取" 执行失败: OpenAI API error: 401 - Incorrect API key provided: sk-lv9IN*******************************************************SYV7. You can find your API key at https://platform.openai.com/acco |
| 3 | cmjf9mgsd000c051z4729y0ah | 内部通讯与公告智能撰写 Agent - 副本 | DRAFT | 5 | 0.0% | 100.0% | 3044 | 5× 其他/未分类 | 5× 节点 "结构化内容规划" 执行失败: Unsupported state or unable to authenticate data |
| 4 | cmj9ymsba0009ef8yqeld11tp | 凤韩研发AI工作流 | DRAFT | 31 | 25.8% | 74.2% | 24796 | 8× 文件/存储配置问题（OSS/S3/本地）<br/>7× 其他/未分类<br/>4× 变量引用/输入校验失败（节点不存在、字段缺失等） | 8× 节点 "输出" 执行失败: 阿里云 OSS 未配置或 ali-oss 包未安装<br/>3× 节点 "AI致敏物质提示生成" 输入验证失败: 变量引用 "{{输入.供应商致敏物质提示}}" 无法解析：节点不存在; 变量引用 "{{输入.配方}}" 无法解析：节点不存在; 变量引用 "{{输入.配方}}" 无法解析：节点不存在<br/>2× 节点 "AI致敏物质提示生成" 执行失败: Shensuan API error: 401 - "Invalid token" |
| 5 | cmjdp32qn0001efadfxuy1d2w | 凤韩研发AI工作流 (副本) | DRAFT | 9 | 100.0% | 0.0% | 10602 |  |  |

## 5) 建议动作（面向平台级改进，按问题类型）

- **API Key 解密/密钥问题**：将 ENCRYPTION_KEY 纳入运维变更流程；检测到解密失败时给出“重新配置密钥/迁移密钥”的明确指引，并提供批量检查工具。
- **401/Invalid token**：在模型/服务商配置页增加“即时连通性测试”；执行失败时提示具体 provider/model/key 前缀与 scope（注意脱敏）。
- **模型能力选择错误**：在节点配置时引入“能力约束校验”（文本节点禁止选择视频/图像生成模型），并在发布前做静态检查。
- **变量引用/输入校验失败**：在编辑器提供“变量引用校验器”（检查节点是否存在、字段是否可达）；发布时阻断。
- **存储/OSS 未配置**：输出节点在保存/执行前做依赖检查；在组织设置中提供存储连接测试与告警。
- **系统重启中断**：完善执行的 checkpoint/resume（你们 schema 已有 canResume/checkpoint），并在重启后自动恢复队列/标记可重试。