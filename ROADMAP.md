# AI Workflow 功能迭代路线图

> **项目目标**: 将 AI Workflow 打造成功能完善、企业级的工作流自动化平台  
> **总周期**: 约 8-12 周  
> **当前状态**: 核心功能已完成，即将进入增强阶段

---

## 📋 总体规划

### 阶段概览

| 阶段 | 核心目标 | 预计周期 | 优先级 |
|------|---------|---------|--------|
| **阶段一** | 核心工作流节点（条件/循环/HTTP） | 2-3 周 | ⭐⭐⭐⭐⭐ |
| **阶段二** | 节点调试与模板系统 | 1-2 周 | ⭐⭐⭐⭐ |
| **阶段三** | 知识库RAG与AI增强 | 2-3 周 | ⭐⭐⭐⭐ |
| **阶段四** | 企业功能（Webhook/定时任务） | 2 周 | ⭐⭐⭐ |
| **阶段五** | 性能优化与测试 | 1-2 周 | ⭐⭐⭐ |

---

## 🚀 阶段一：核心工作流节点增强

**目标**: 完善基础工作流逻辑控制能力  
**周期**: 2-3 周  
**状态**: 📝 计划中

### 1.1 条件分支节点 (CONDITION)

**功能描述**:
- 根据条件判断执行不同分支（IF-ELSE）
- 支持多个条件组合（AND/OR）
- 支持常见运算符：`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startsWith`, `isEmpty`

**技术方案**:
```typescript
// 节点配置
interface ConditionConfig {
  conditions: {
    variable: string      // 变量名（支持 {{node.output}} 语法）
    operator: ConditionOperator
    value: string | number | boolean
    logic?: 'AND' | 'OR'  // 与下一个条件的逻辑关系
  }[]
  trueBranch: string[]    // 满足条件时执行的节点ID
  falseBranch: string[]   // 不满足条件时执行的节点ID
}
```

**实施步骤**:
1. [ ] 创建 `src/types/workflow.ts` 中添加 `CONDITION` 节点类型
2. [ ] 实现 `src/lib/workflow/processors/condition.ts` 处理器
3. [ ] 在工作流引擎中支持分支执行逻辑
4. [ ] 创建前端配置组件 `ConditionNodeConfig.tsx`
5. [ ] 添加单元测试和集成测试
6. [ ] 更新文档和示例

**数据库变更**:
```sql
-- 无需数据库变更，使用现有 config JSON 字段
```

**验收标准**:
- [ ] 支持至少 3 种运算符组合
- [ ] 分支执行正确，无死循环
- [ ] UI 配置界面友好，支持可视化添加条件
- [ ] 测试覆盖率 > 80%

---

### 1.2 循环节点 (LOOP)

**功能描述**:
- FOR 循环：遍历数组/列表
- WHILE 循环：根据条件重复执行
- 支持嵌套循环（最多 3 层）
- 循环内变量作用域隔离

**技术方案**:
```typescript
interface LoopConfig {
  type: 'FOR' | 'WHILE'
  
  // FOR 循环配置
  forEach?: {
    array: string          // 数组变量 {{data.items}}
    itemName: string       // 当前项变量名 item
    indexName?: string     // 索引变量名 index
  }
  
  // WHILE 循环配置
  whileCondition?: {
    maxIterations: number  // 最大迭代次数（防止死循环）
    condition: ConditionConfig
  }
  
  loopBody: string[]       // 循环内执行的节点ID
}
```

**实施步骤**:
1. [ ] 添加 `LOOP` 节点类型定义
2. [ ] 实现 `src/lib/workflow/processors/loop.ts`
3. [ ] 引擎支持迭代执行和变量作用域
4. [ ] 添加防死循环保护（超时 + 最大迭代次数）
5. [ ] 前端配置组件 `LoopNodeConfig.tsx`
6. [ ] 测试用例：数组遍历、嵌套循环、边界条件

**验收标准**:
- [ ] FOR 循环正确遍历数组（支持 10000+ 元素）
- [ ] WHILE 循环有死循环保护
- [ ] 循环变量不污染全局作用域
- [ ] 性能测试：1000 次迭代 < 5 秒

---

### 1.3 HTTP 请求节点 (HTTP)

**功能描述**:
- 支持 GET、POST、PUT、DELETE、PATCH
- 支持请求头、查询参数、请求体
- 支持认证：Basic Auth、Bearer Token、API Key
- 响应处理：JSON 解析、错误重试

**技术方案**:
```typescript
interface HttpConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string              // 支持变量 {{baseUrl}}/api/users
  headers?: Record<string, string>
  queryParams?: Record<string, string>
  body?: {
    type: 'json' | 'form' | 'text' | 'file'
    content: string | Record<string, unknown>
  }
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'apikey'
    username?: string
    password?: string
    token?: string
    apiKey?: { key: string; value: string; addTo: 'header' | 'query' }
  }
  timeout?: number         // 默认 30000ms
  retry?: {
    maxRetries: number     // 默认 3
    retryDelay: number     // 默认 1000ms
  }
}
```

**实施步骤**:
1. [ ] 添加 `HTTP` 节点类型
2. [ ] 实现 `src/lib/workflow/processors/http.ts`（使用 `node-fetch` 或 `axios`）
3. [ ] 实现重试逻辑和超时控制
4. [ ] 安全：URL 白名单、敏感头部过滤
5. [ ] 前端配置组件 `HttpNodeConfig.tsx`（Postman 风格）
6. [ ] 测试：模拟 HTTP 服务器、各种认证方式

**数据库变更**: 无

**验收标准**:
- [ ] 支持所有 5 种 HTTP 方法
- [ ] 正确处理 2xx/4xx/5xx 响应
- [ ] 重试机制有效（失败自动重试）
- [ ] 敏感信息不记录在日志中

---

### 1.4 并行执行支持

**功能描述**:
- 支持多分支并行执行
- 合并节点等待所有分支完成
- 超时控制：任一分支超时则整体失败

**技术方案**:
```typescript
// 在引擎层面支持，无需新节点类型
// 当节点有多个出边时，自动并行执行
interface ParallelExecution {
  branches: {
    nodeId: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    result?: unknown
  }[]
  mergeStrategy: 'all' | 'any' | 'race'  // 全部完成/任一完成/竞速
}
```

**实施步骤**:
1. [ ] 修改执行引擎 `src/lib/workflow/engine.ts`
2. [ ] 添加并行执行调度逻辑
3. [ ] 实现合并节点（MERGE）等待逻辑
4. [ ] 错误传播和终止机制
5. [ ] 前端显示并行分支（虚线连接）
6. [ ] 压力测试：10+ 并行分支

**验收标准**:
- [ ] 并行分支真正并发执行（非串行）
- [ ] 合并节点正确等待所有分支
- [ ] 任一分支失败时，其他分支可配置是否继续

---

## 🎨 阶段二：节点调试与模板系统

**目标**: 提升开发体验和工作流复用能力  
**周期**: 1-2 周  
**状态**: 📝 计划中

### 2.1 节点调试功能

**功能描述**:
- 单节点独立运行
- 模拟上游输入数据
- 查看节点输出和日志
- 断点执行工作流

**技术方案**:
```typescript
// API: POST /api/workflows/[id]/nodes/[nodeId]/debug
interface DebugRequest {
  nodeId: string
  mockInputs: Record<string, unknown>  // 模拟的上游输出
  breakpoints?: string[]               // 断点节点ID
}
```

**实施步骤**:
1. [ ] 创建调试 API 路由
2. [ ] 引擎支持单节点执行模式
3. [ ] 前端：节点右键菜单 "调试此节点"
4. [ ] 调试面板：输入编辑器 + 输出查看器
5. [ ] 保存调试输入到本地（LocalStorage）

**验收标准**:
- [ ] 可以独立运行任意节点
- [ ] 调试结果实时显示
- [ ] 不影响工作流正式执行

---

### 2.2 工作流模板库

**功能描述**:
- 官方模板：预置 20+ 常用场景
- 企业模板：企业内部共享
- 公开市场：用户发布和下载（后期）

**数据库设计**:
```prisma
model WorkflowTemplate {
  id            String   @id @default(cuid())
  name          String
  description   String?  @db.Text
  category      String   // AI处理/数据分析/文档生成等
  tags          String[] // 搜索标签
  thumbnail     String?  // 缩略图
  
  config        Json     // 工作流配置（节点+边）
  
  visibility    TemplateVisibility @default(PRIVATE)
  organizationId String? // 企业模板归属
  creatorId     String
  
  usageCount    Int      @default(0)
  rating        Float?   @default(0)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([category])
  @@index([visibility, organizationId])
}

enum TemplateVisibility {
  PRIVATE      // 仅自己可见
  ORGANIZATION // 企业内可见
  PUBLIC       // 公开
}
```

**官方模板列表**:
1. **文本摘要生成器** - INPUT → PROCESS(摘要提示词) → OUTPUT(TEXT)
2. **Excel 数据分析** - DATA(导入) → PROCESS(分析) → OUTPUT(MARKDOWN)
3. **批量图片处理** - IMAGE(导入) → LOOP → IMAGE(处理) → OUTPUT
4. **问答机器人** - INPUT → PROCESS(知识库) → OUTPUT
5. **PDF 报告生成** - INPUT → PROCESS → OUTPUT(PDF)
6. **视频字幕生成** - VIDEO → AUDIO(提取) → PROCESS(转录) → OUTPUT(SRT)
7. **邮件自动分类** - INPUT → PROCESS(分类) → CONDITION → OUTPUT
8. **数据清洗流程** - DATA → CODE(清洗) → OUTPUT(EXCEL)
9. **多语言翻译** - INPUT → LOOP → PROCESS(翻译) → OUTPUT
10. **图像描述生成** - IMAGE → PROCESS(描述) → OUTPUT

**实施步骤**:
1. [ ] 创建数据库模型
2. [ ] 实现模板 CRUD API
3. [ ] 前端：模板库页面（卡片展示 + 搜索）
4. [ ] "从模板创建" 功能
5. [ ] 编写 10 个官方模板的配置 JSON
6. [ ] 数据迁移：导入官方模板

**验收标准**:
- [ ] 模板库有至少 10 个可用模板
- [ ] 用户可以一键创建基于模板的工作流
- [ ] 模板搜索和筛选功能完善

---

### 2.3 执行可视化

**功能描述**:
- 实时显示当前执行的节点
- 节点状态指示器（等待/运行中/完成/失败）
- 执行进度百分比

**技术方案**:
```typescript
// WebSocket 实时推送执行状态
interface ExecutionProgress {
  executionId: string
  currentNodeId: string
  completedNodes: string[]
  failedNodes: string[]
  progress: number  // 0-100
  estimatedTimeRemaining?: number  // 秒
}
```

**实施步骤**:
1. [ ] 添加 WebSocket 支持（使用 Socket.io 或 Server-Sent Events）
2. [ ] 引擎执行时推送进度事件
3. [ ] 前端：节点添加状态样式（边框颜色/图标）
4. [ ] 顶部进度条组件
5. [ ] 执行详情面板实时更新

**验收标准**:
- [ ] 执行进度实时更新（延迟 < 500ms）
- [ ] 节点状态准确显示
- [ ] 支持长时间执行（> 10 分钟）

---

## 🧠 阶段三：知识库RAG与AI增强

**目标**: 提升 AI 处理能力和智能化水平  
**周期**: 2-3 周  
**状态**: 📝 计划中

### 3.1 知识库 RAG 系统

**功能描述**:
- 上传文档（PDF、Word、Markdown、TXT）
- 自动分块和向量化
- 在 PROCESS 节点中检索相关知识
- 支持多个知识库切换

**技术方案**:
```typescript
// 使用向量数据库：Pinecone / Qdrant / Milvus
// 或使用 PostgreSQL + pgvector 扩展

interface KnowledgeBase {
  id: string
  name: string
  description?: string
  organizationId: string
  
  documents: KnowledgeDocument[]
  embeddingModel: string  // text-embedding-ada-002
  chunkSize: number       // 默认 1000
  chunkOverlap: number    // 默认 200
  
  vectorStore: {
    type: 'pinecone' | 'qdrant' | 'pgvector'
    config: Record<string, unknown>
  }
}

interface KnowledgeDocument {
  id: string
  fileName: string
  fileType: string
  content: string
  chunks: DocumentChunk[]
  uploadedAt: Date
}

interface DocumentChunk {
  id: string
  content: string
  embedding: number[]  // 向量（1536维）
  metadata: {
    page?: number
    section?: string
  }
}
```

**数据库设计**:
```prisma
model KnowledgeBase {
  id            String   @id @default(cuid())
  name          String
  description   String?  @db.Text
  organizationId String
  
  embeddingModel String  @default("text-embedding-ada-002")
  chunkSize     Int      @default(1000)
  chunkOverlap  Int      @default(200)
  
  vectorStoreType   String  // pinecone/qdrant/pgvector
  vectorStoreConfig Json
  
  documents     KnowledgeDocument[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([organizationId])
}

model KnowledgeDocument {
  id              String   @id @default(cuid())
  knowledgeBaseId String
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  
  fileName        String
  fileType        String
  fileSize        Int
  fileUrl         String
  
  status          DocStatus @default(PROCESSING)
  errorMessage    String?   @db.Text
  
  chunkCount      Int       @default(0)
  
  createdAt       DateTime  @default(now())
  
  @@index([knowledgeBaseId])
}

enum DocStatus {
  PROCESSING  // 处理中
  COMPLETED   // 已完成
  FAILED      // 失败
}
```

**实施步骤**:
1. [ ] 选择向量数据库方案（建议 pgvector 简化部署）
2. [ ] 实现文档解析（`pdf-parse`、`mammoth`）
3. [ ] 实现文本分块算法（RecursiveCharacterTextSplitter）
4. [ ] 集成 OpenAI Embedding API
5. [ ] 实现检索逻辑（相似度搜索）
6. [ ] 修改 PROCESS 节点支持知识库查询
7. [ ] 前端：知识库管理页面
8. [ ] 前端：PROCESS 节点配置选择知识库

**验收标准**:
- [ ] 支持至少 3 种文档格式
- [ ] 检索准确率 > 80%（人工评估）
- [ ] 单次查询响应 < 2 秒
- [ ] 支持 1000+ 文档的知识库

---

### 3.2 图像生成节点 (IMAGE_GEN)

**功能描述**:
- 接入 DALL-E 3、Stable Diffusion
- 文本生成图像
- 支持尺寸、风格配置

**技术方案**:
```typescript
interface ImageGenConfig {
  provider: 'dalle3' | 'stabilityai'
  prompt: string
  negativePrompt?: string
  size: '1024x1024' | '1792x1024' | '1024x1792'
  quality: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
  n: number  // 生成数量
}
```

**实施步骤**:
1. [ ] 添加 `IMAGE_GEN` 节点类型
2. [ ] 实现 `src/lib/ai/providers/dalle.ts`
3. [ ] 实现 `src/lib/ai/providers/stabilityai.ts`
4. [ ] 图像保存到文件存储
5. [ ] 前端配置组件
6. [ ] 测试和文档

**验收标准**:
- [ ] 成功生成图像并返回 URL
- [ ] 图像质量符合预期
- [ ] 费用统计准确

---

### 3.3 更多 AI 提供商

**实施列表**:
1. [ ] OpenAI（官方）
2. [ ] Anthropic Claude
3. [ ] 百度文心一言
4. [ ] 阿里通义千问
5. [ ] 讯飞星火

**统一接口**:
```typescript
interface AIProvider {
  name: string
  chat(request: ChatRequest): Promise<ChatResponse>
  listModels(): Promise<Model[]>
  validateApiKey(apiKey: string): Promise<boolean>
}
```

---

## 🔗 阶段四：企业功能（Webhook/定时任务）

**目标**: 增强工作流触发方式和集成能力  
**周期**: 2 周  
**状态**: 📝 计划中

### 4.1 Webhook 触发器

**功能描述**:
- 每个工作流生成唯一 Webhook URL
- 外部系统 POST 数据触发执行
- 支持签名验证（HMAC-SHA256）

**数据库设计**:
```prisma
model WorkflowTrigger {
  id          String       @id @default(cuid())
  workflowId  String
  workflow    Workflow     @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  
  type        TriggerType  // WEBHOOK / SCHEDULE / MANUAL
  
  // Webhook 配置
  webhookUrl  String?      @unique
  webhookSecret String?    // 签名密钥
  
  // 定时任务配置
  cronExpression String?   // 0 0 * * *
  timezone       String?   // Asia/Shanghai
  
  enabled     Boolean      @default(true)
  lastTriggeredAt DateTime?
  
  createdAt   DateTime     @default(now())
  
  @@index([workflowId])
}

enum TriggerType {
  MANUAL    // 手动执行
  WEBHOOK   // Webhook 触发
  SCHEDULE  // 定时任务
}
```

**API 端点**:
```typescript
// POST /api/webhooks/:workflowId/:secret
// 接收外部 POST 请求，触发工作流执行
```

**实施步骤**:
1. [ ] 创建触发器数据模型
2. [ ] 实现 Webhook API 路由
3. [ ] 签名验证逻辑
4. [ ] 前端：触发器管理页面
5. [ ] 生成 Webhook URL 和密钥
6. [ ] 测试：使用 curl/Postman 触发

**验收标准**:
- [ ] Webhook 成功触发工作流
- [ ] 签名验证有效防止伪造请求
- [ ] 触发记录可查询

---

### 4.2 定时任务（Cron）

**功能描述**:
- 支持 Cron 表达式配置
- 支持时区设置
- 任务失败重试

**技术方案**:
- 使用 `node-cron` 或 `agenda` 库
- 或使用外部调度系统（如 BullMQ + Redis）

**实施步骤**:
1. [ ] 安装任务调度库
2. [ ] 实现任务调度服务 `src/lib/scheduler/index.ts`
3. [ ] 启动时加载所有定时触发器
4. [ ] 前端：Cron 表达式编辑器（可视化）
5. [ ] 任务执行日志

**验收标准**:
- [ ] Cron 表达式正确解析
- [ ] 定时任务准时执行（误差 < 1 分钟）
- [ ] 支持暂停/恢复

---

### 4.3 第三方集成（飞书/钉钉）

**功能描述**:
- 添加通知节点（NOTIFICATION）
- 支持发送消息到飞书/钉钉群

**配置示例**:
```typescript
interface NotificationConfig {
  platform: 'feishu' | 'dingtalk' | 'wecom'
  webhookUrl: string
  messageType: 'text' | 'markdown' | 'card'
  content: string  // 支持变量替换
}
```

**实施步骤**:
1. [ ] 添加 `NOTIFICATION` 节点类型
2. [ ] 实现飞书机器人 API 调用
3. [ ] 实现钉钉机器人 API 调用
4. [ ] 前端配置组件
5. [ ] 测试发送消息

---

## ⚡ 阶段五：性能优化与测试

**目标**: 确保系统稳定可靠  
**周期**: 1-2 周  
**状态**: 📝 计划中

### 5.1 执行队列优化

**技术方案**:
- 使用 BullMQ + Redis 实现分布式队列
- 支持任务优先级
- 支持任务重试和死信队列

**实施步骤**:
1. [ ] 安装 Redis 和 BullMQ
2. [ ] 替换现有执行逻辑为队列模式
3. [ ] 实现任务监控面板
4. [ ] 压力测试：1000 并发执行

**验收标准**:
- [ ] 支持 100+ 并发执行
- [ ] 队列任务不丢失
- [ ] 失败任务自动重试

---

### 5.2 断点续执行

**功能描述**:
- 工作流执行失败后，从失败节点继续
- 保存中间结果到数据库

**数据库设计**:
```prisma
model ExecutionCheckpoint {
  id          String   @id @default(cuid())
  executionId String
  execution   Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  
  nodeId      String
  nodeOutput  Json
  
  createdAt   DateTime @default(now())
  
  @@index([executionId])
}
```

**实施步骤**:
1. [ ] 添加检查点模型
2. [ ] 引擎每个节点执行后保存检查点
3. [ ] 实现 "继续执行" API
4. [ ] 前端：失败执行显示 "继续执行" 按钮

---

### 5.3 综合测试

**测试计划**:
1. [ ] 单元测试覆盖率 > 80%
2. [ ] 集成测试：完整工作流执行
3. [ ] 压力测试：1000 并发用户
4. [ ] 安全测试：SQL 注入、XSS、CSRF
5. [ ] 性能测试：执行耗时 < 5秒（简单流程）

---

## 📊 项目管理

### 里程碑

| 里程碑 | 目标日期 | 交付物 |
|--------|---------|--------|
| M1: 核心节点完成 | Week 3 | CONDITION、LOOP、HTTP 节点可用 |
| M2: 调试与模板 | Week 5 | 节点调试功能 + 10 个模板 |
| M3: AI 增强 | Week 8 | 知识库 RAG + 图像生成 |
| M4: 企业功能 | Week 10 | Webhook + 定时任务 |
| M5: 优化上线 | Week 12 | 性能优化 + 全面测试 |

### 风险管理

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 向量数据库部署复杂 | 中 | 高 | 优先使用 pgvector（PostgreSQL 扩展） |
| WebSocket 并发问题 | 中 | 中 | 使用 Server-Sent Events 简化实现 |
| 第三方 API 稳定性 | 高 | 中 | 实现重试机制和降级方案 |
| 性能瓶颈 | 中 | 高 | 提前进行压力测试，使用 Redis 缓存 |

---

## 📝 开发规范

### Git 提交规范

```
feat: 添加条件分支节点
fix: 修复循环节点死循环问题
docs: 更新 API 文档
test: 添加 HTTP 节点测试用例
refactor: 重构执行引擎
perf: 优化向量检索性能
```

### 分支策略

- `main`: 生产分支
- `develop`: 开发分支
- `feature/*`: 功能分支
- `bugfix/*`: 修复分支
- `release/*`: 发布分支

### Code Review 要求

- 所有代码必须经过 Review
- 测试覆盖率不低于 80%
- 无 ESLint 错误
- 添加必要的注释和文档

---

## 🎯 成功指标

### 功能指标
- [ ] 工作流节点类型 > 15 种
- [ ] 官方模板库 > 10 个
- [ ] AI 提供商 > 5 个
- [ ] 知识库支持文档数 > 1000

### 性能指标
- [ ] 简单工作流执行时间 < 5 秒
- [ ] 复杂工作流（10+ 节点）< 30 秒
- [ ] 并发执行支持 > 100
- [ ] API 响应时间 P95 < 200ms

### 质量指标
- [ ] 测试覆盖率 > 80%
- [ ] 无严重安全漏洞
- [ ] 生产事故率 < 0.1%

---

## 📚 参考资料

- [N8N 工作流引擎](https://n8n.io/)
- [Langchain RAG 教程](https://python.langchain.com/docs/use_cases/question_answering/)
- [BullMQ 文档](https://docs.bullmq.io/)
- [pgvector 向量检索](https://github.com/pgvector/pgvector)

---

**最后更新**: 2025-12-19  
**维护者**: AI Workflow Team
