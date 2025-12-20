# 工作流统计分析与 AI 自动优化系统设计文档

## 一、功能概述

本功能为企业生产环境下的工作流提供完整的统计分析和 AI 自动优化能力，包括：

1. **执行反馈系统**：用户对每次执行结果进行准确度评分和反馈
2. **AI 诊断分析**：自动分析问题原因（知识库、提示词、模型配置等）
3. **AI 优化建议**：提供具体的优化建议并支持自动优化
4. **版本管理系统**：工作流版本控制，支持提交、对比、回滚

---

## 二、数据模型设计

### 2.1 执行反馈表 (ExecutionFeedback)

```prisma
// 执行反馈记录
model ExecutionFeedback {
  id          String   @id @default(cuid())

  // 准确度评分 (1-5星，或者百分比)
  rating      Int      // 1-5 星评分
  isAccurate  Boolean  // 结果是否准确

  // 反馈详情
  expectedOutput   String?  @db.Text  // 期望的正确答案
  actualOutput     String?  @db.Text  // 实际输出（快照）
  feedbackComment  String?  @db.Text  // 用户反馈说明

  // 问题分类（用户选择或AI识别）
  issueCategories  Json     @default("[]")  // ["KNOWLEDGE_BASE", "PROMPT", "MODEL", "INPUT", "OTHER"]

  // AI 诊断结果
  aiDiagnosis      Json?    // AI 分析的诊断结果
  diagnosedAt      DateTime?

  // 优化状态
  optimizationStatus OptimizationStatus @default(PENDING)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 关联
  executionId String
  execution   Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  userId      String   // 反馈提交者

  // 一个执行可以有多次反馈（不同用户）
  @@index([executionId])
  @@index([userId])
  @@index([rating])
  @@index([isAccurate])
  @@index([createdAt])
  @@map("execution_feedbacks")
}

enum OptimizationStatus {
  PENDING      // 待处理
  ANALYZING    // AI 分析中
  SUGGESTED    // 已生成建议
  APPLIED      // 已应用优化
  REJECTED     // 已拒绝
  INEFFECTIVE  // 优化无效
}
```

### 2.2 问题分类枚举

```prisma
enum IssueCategory {
  KNOWLEDGE_BASE    // 知识库内容不足或不准确
  PROMPT_UNCLEAR    // 提示词不够具体/清晰
  PROMPT_WRONG      // 提示词逻辑错误
  MODEL_CAPABILITY  // 模型能力不足
  MODEL_CONFIG      // 模型配置不当（temperature等）
  INPUT_QUALITY     // 输入数据质量问题
  CONTEXT_MISSING   // 上下文信息缺失
  LOGIC_ERROR       // 工作流逻辑错误
  OTHER             // 其他原因
}
```

### 2.3 AI 优化建议表 (OptimizationSuggestion)

```prisma
// AI 优化建议
model OptimizationSuggestion {
  id          String   @id @default(cuid())

  // 问题诊断
  issueType        IssueCategory
  issueDescription String   @db.Text  // 问题描述
  rootCause        String   @db.Text  // 根因分析

  // 优化建议
  suggestionType   SuggestionType
  suggestionTitle  String            // 建议标题
  suggestionDetail String   @db.Text // 详细说明

  // 具体修改内容（JSON格式）
  suggestedChanges Json     // { nodeId, field, oldValue, newValue, explanation }

  // 置信度和优先级
  confidence      Float    @default(0.5)  // 0-1 置信度
  priority        Int      @default(0)    // 优先级排序

  // 应用状态
  status          SuggestionStatus @default(PENDING)
  appliedAt       DateTime?
  appliedById     String?

  // 效果追踪
  effectivenessScore Float?  // 应用后的效果评分

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // 关联到反馈
  feedbackId      String
  feedback        ExecutionFeedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)

  // 关联到工作流
  workflowId      String

  @@index([feedbackId])
  @@index([workflowId])
  @@index([status])
  @@index([suggestionType])
  @@map("optimization_suggestions")
}

enum SuggestionType {
  PROMPT_OPTIMIZATION     // 提示词优化
  KNOWLEDGE_UPDATE        // 知识库更新
  MODEL_CHANGE            // 更换模型
  MODEL_CONFIG_ADJUST     // 调整模型参数
  ADD_NODE                // 添加节点
  REMOVE_NODE             // 移除节点
  MODIFY_FLOW             // 修改流程
  INPUT_VALIDATION        // 增加输入校验
  OTHER                   // 其他
}

enum SuggestionStatus {
  PENDING   // 待处理
  APPROVED  // 已批准
  APPLIED   // 已应用
  REJECTED  // 已拒绝
  REVERTED  // 已撤销
}
```

### 2.4 工作流版本表 (WorkflowVersion)

```prisma
// 工作流版本管理
model WorkflowVersion {
  id          String   @id @default(cuid())

  // 版本信息
  versionNumber    Int              // 版本号（递增）
  versionTag       String?          // 版本标签 (如 "v1.0.0")
  commitMessage    String  @db.Text // 提交说明

  // 完整配置快照
  config           Json             // 工作流配置快照

  // 版本类型
  versionType      VersionType      @default(MANUAL)

  // 版本状态
  isPublished      Boolean          @default(false)  // 是否发布
  isActive         Boolean          @default(false)  // 是否为当前活跃版本

  // 变更摘要
  changesSummary   Json?            // { nodesAdded: [], nodesRemoved: [], nodesModified: [] }

  // 统计信息（该版本的执行统计）
  executionCount   Int              @default(0)
  successRate      Float?           // 成功率
  avgRating        Float?           // 平均评分

  // 来源追踪
  sourceVersionId  String?          // 从哪个版本分叉
  optimizationIds  Json?            // 关联的优化建议IDs

  createdAt        DateTime         @default(now())

  // 关联
  workflowId       String
  workflow         Workflow         @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  createdById      String           // 创建者

  @@unique([workflowId, versionNumber])
  @@index([workflowId])
  @@index([isActive])
  @@index([createdAt])
  @@map("workflow_versions")
}

enum VersionType {
  MANUAL           // 手动提交
  AUTO_SAVE        // 自动保存
  OPTIMIZATION     // AI 优化生成
  ROLLBACK         // 回滚生成
}
```

### 2.5 工作流统计聚合表 (WorkflowAnalytics)

```prisma
// 工作流统计分析（按时间周期聚合）
model WorkflowAnalytics {
  id          String   @id @default(cuid())

  // 时间周期
  periodType       AnalyticsPeriod  // DAILY, WEEKLY, MONTHLY
  periodStart      DateTime
  periodEnd        DateTime

  // 执行统计
  totalExecutions  Int      @default(0)
  successCount     Int      @default(0)
  failureCount     Int      @default(0)
  cancelledCount   Int      @default(0)

  // 反馈统计
  feedbackCount    Int      @default(0)
  accurateCount    Int      @default(0)  // isAccurate = true
  inaccurateCount  Int      @default(0)  // isAccurate = false
  avgRating        Float?               // 平均评分

  // 问题分类统计
  issueBreakdown   Json?    // { "KNOWLEDGE_BASE": 10, "PROMPT": 5, ... }

  // 性能统计
  avgDuration      Int?     // 平均执行时长(ms)
  avgTokens        Int?     // 平均 Token 消耗

  // 优化统计
  suggestionsCount Int      @default(0)
  appliedCount     Int      @default(0)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // 关联
  workflowId       String

  @@unique([workflowId, periodType, periodStart])
  @@index([workflowId])
  @@index([periodType])
  @@index([periodStart])
  @@map("workflow_analytics")
}

enum AnalyticsPeriod {
  DAILY
  WEEKLY
  MONTHLY
}
```

### 2.6 更新 Execution 模型（添加关联）

```prisma
model Execution {
  // ... 现有字段 ...

  // 添加关联
  feedbacks   ExecutionFeedback[]

  // 添加版本关联
  workflowVersionId String?  // 执行时的工作流版本
}
```

### 2.7 更新 Workflow 模型（添加关联）

```prisma
model Workflow {
  // ... 现有字段 ...

  // 添加版本关联
  versions           WorkflowVersion[]
  currentVersionId   String?           // 当前活跃版本ID

  // 添加统计开关
  analyticsEnabled   Boolean @default(true)  // 是否启用统计分析
}
```

---

## 三、AI 诊断分析系统设计

### 3.1 诊断流程

```
用户提交反馈
      ↓
  收集执行上下文
  (输入、输出、节点日志、知识库检索结果)
      ↓
  AI 分析诊断
  (使用专门的诊断 Prompt)
      ↓
  生成问题分类和根因分析
      ↓
  生成优化建议
      ↓
  用户审核/应用
      ↓
  创建新版本
```

### 3.2 诊断 Prompt 设计

```typescript
interface DiagnosisContext {
  // 工作流信息
  workflow: {
    id: string;
    name: string;
    config: WorkflowConfig;
  };

  // 执行信息
  execution: {
    id: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    nodeLogs: ExecutionLog[];
    duration: number;
    tokenUsage: TokenUsage;
  };

  // 反馈信息
  feedback: {
    rating: number;
    isAccurate: boolean;
    expectedOutput: string;
    comment: string;
  };

  // 知识库检索结果（如果有）
  ragResults?: {
    query: string;
    retrievedChunks: string[];
    scores: number[];
  };

  // 历史反馈模式（相似问题的历史反馈）
  historicalPatterns?: {
    similarFeedbacks: ExecutionFeedback[];
    commonIssues: string[];
  };
}
```

### 3.3 AI 诊断服务

```typescript
// src/lib/services/diagnosis.service.ts

interface DiagnosisResult {
  // 问题分类
  issueCategories: IssueCategory[];

  // 根因分析
  rootCauseAnalysis: {
    summary: string;
    details: string[];
    confidence: number;
  };

  // 优化建议列表
  suggestions: OptimizationSuggestion[];
}

class DiagnosisService {
  async analyzeFeedback(context: DiagnosisContext): Promise<DiagnosisResult>;
  async generateSuggestions(diagnosis: DiagnosisResult): Promise<OptimizationSuggestion[]>;
  async applySuggestion(suggestionId: string, userId: string): Promise<WorkflowVersion>;
}
```

---

## 四、前端界面设计

### 4.1 工作流编辑器顶部工具栏（版本管理）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [← 返回]   工作流名称                    [保存草稿] [提交版本 ▼] [运行] │
│                                                                          │
│  当前版本: v1.2.0 (已发布)    最后修改: 2分钟前                          │
└──────────────────────────────────────────────────────────────────────────┘

提交版本下拉菜单:
┌─────────────────────────────────┐
│ ✏️ 提交新版本                    │
│ 📋 版本历史                      │
│ ↩️ 回滚到上一版本                │
│ 📊 版本对比                      │
└─────────────────────────────────┘
```

### 4.2 版本提交对话框

```
┌────────────────────────────────────────────────┐
│              提交新版本                         │
├────────────────────────────────────────────────┤
│                                                │
│  版本标签: [v____.____.____]                   │
│                                                │
│  提交说明:                                      │
│  ┌──────────────────────────────────────────┐  │
│  │ 请输入本次修改的说明...                    │  │
│  │                                          │  │
│  │                                          │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  变更摘要（自动生成）:                          │
│  • 修改了 "AI处理" 节点的提示词                 │
│  • 更新了知识库引用                             │
│  • 调整了模型参数                               │
│                                                │
│  ☐ 发布此版本（使其成为活跃版本）               │
│                                                │
│           [取消]          [提交]               │
└────────────────────────────────────────────────┘
```

### 4.3 版本历史面板

```
┌────────────────────────────────────────────────┐
│  版本历史                              [关闭 ✕] │
├────────────────────────────────────────────────┤
│                                                │
│  🟢 v1.2.0 (当前)           2024-01-15 14:30  │
│     优化提示词，提升回答准确率                   │
│     执行: 156次  成功率: 94%  评分: 4.2⭐       │
│     [对比] [回滚到此版本]                       │
│                                                │
│  ⚪ v1.1.0                  2024-01-10 09:15  │
│     添加知识库检索功能                          │
│     执行: 89次  成功率: 87%  评分: 3.8⭐        │
│     [对比] [回滚到此版本]                       │
│                                                │
│  🔵 v1.0.0 (AI优化)         2024-01-05 16:45  │
│     应用AI建议优化提示词                        │
│     执行: 234次  成功率: 82%  评分: 3.5⭐       │
│     [对比] [回滚到此版本]                       │
│                                                │
│              [加载更多...]                      │
└────────────────────────────────────────────────┘
```

### 4.4 执行结果反馈面板

```
┌────────────────────────────────────────────────────────────────┐
│  执行完成                                                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  输出结果:                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 根据分析，该产品的市场定位应该是...                         │  │
│  │ [完整内容]                                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                │
│  这个结果对您有帮助吗？                                         │
│                                                                │
│  [⭐][⭐][⭐][⭐][☆]  4/5                                       │
│                                                                │
│  ○ 结果准确，符合预期                                          │
│  ● 结果不够准确                                                 │
│                                                                │
│  期望的正确答案（可选）:                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 我期望的答案应该是...                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  问题可能出在哪里？（可多选）:                                   │
│  ☐ 知识库内容不完整                                            │
│  ☐ 提示词不够具体                                              │
│  ☐ 模型理解能力不足                                            │
│  ☐ 输入信息不清晰                                              │
│  ☐ 其他                                                        │
│                                                                │
│  补充说明（可选）:                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│          [跳过]              [提交反馈并请求AI诊断]              │
└────────────────────────────────────────────────────────────────┘
```

### 4.5 AI 诊断结果与优化建议面板

```
┌────────────────────────────────────────────────────────────────┐
│  🔍 AI 诊断分析                                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  📋 问题诊断                                                    │
│  ──────────────────────────────────────────────────────────────│
│  根据您的反馈和执行日志分析，主要问题如下：                        │
│                                                                │
│  1. 🎯 提示词不够具体 (置信度: 85%)                              │
│     当前提示词缺少对输出格式的具体要求，导致回答结构不一致         │
│                                                                │
│  2. 📚 知识库检索相关性不足 (置信度: 72%)                        │
│     检索到的内容与问题相关性较低（平均相似度: 0.65）              │
│                                                                │
│  ──────────────────────────────────────────────────────────────│
│                                                                │
│  💡 优化建议                                                    │
│  ──────────────────────────────────────────────────────────────│
│                                                                │
│  建议 1: 优化 "AI处理" 节点的提示词                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 当前:                                                     │  │
│  │ "分析用户提供的产品信息，给出市场定位建议"                  │  │
│  │                                                          │  │
│  │ 建议修改为:                                               │  │
│  │ "分析用户提供的产品信息，按以下结构给出市场定位建议：       │  │
│  │  1. 目标用户群体（具体描述）                               │  │
│  │  2. 市场定位语句（一句话）                                 │  │
│  │  3. 竞争优势分析（列举3点）                                │  │
│  │  4. 建议的营销策略"                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [预览效果]  [应用此建议]  [稍后处理]                            │
│                                                                │
│  ──────────────────────────────────────────────────────────────│
│                                                                │
│  建议 2: 调整知识库检索参数                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • 将 Top-K 从 3 调整为 5                                  │  │
│  │ • 将相似度阈值从 0.7 降低为 0.6                           │  │
│  │ • 建议补充以下知识库内容：                                 │  │
│  │   - 市场定位案例分析                                       │  │
│  │   - 行业竞品对比资料                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  [应用此建议]  [稍后处理]                                       │
│                                                                │
│           [一键应用全部建议并创建新版本]                         │
└────────────────────────────────────────────────────────────────┘
```

### 4.6 工作流统计分析页面

```
┌──────────────────────────────────────────────────────────────────────────┐
│  📊 工作流分析 - 产品市场分析助手                                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  时间范围: [最近7天 ▼]    版本: [全部版本 ▼]                              │
│                                                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐          │
│  │  总执行次数       │ │  成功率          │ │  平均评分        │          │
│  │     1,234        │ │    92.5%         │ │    4.2 ⭐        │          │
│  │  ↑ 12% vs 上周   │ │  ↑ 5.2% vs 上周  │ │  ↑ 0.3 vs 上周   │          │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘          │
│                                                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐          │
│  │  反馈收集数       │ │  准确率          │ │  平均Token消耗    │          │
│  │      89          │ │    78.5%         │ │     2,450        │          │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘          │
│                                                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                          │
│  执行趋势                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │     📈 [执行次数和成功率趋势图]                                       ││
│  │                                                                      ││
│  │                                                                      ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  问题分类分布                          评分分布                           │
│  ┌─────────────────────────┐          ┌─────────────────────────┐        │
│  │  📊 [饼图]               │          │  📊 [柱状图]             │        │
│  │                         │          │                         │        │
│  │  提示词问题: 35%        │          │  5⭐: 45%               │        │
│  │  知识库问题: 28%        │          │  4⭐: 30%               │        │
│  │  模型问题: 18%          │          │  3⭐: 15%               │        │
│  │  其他: 19%              │          │  2⭐: 7%                │        │
│  │                         │          │  1⭐: 3%                │        │
│  └─────────────────────────┘          └─────────────────────────┘        │
│                                                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                          │
│  🔔 待处理优化建议 (3)                                                    │
│  ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  1. 优化提示词结构 - 置信度 85% - 来自 5 条反馈        [查看] [应用]      │
│  2. 补充知识库内容 - 置信度 72% - 来自 3 条反馈        [查看] [应用]      │
│  3. 调整模型参数   - 置信度 68% - 来自 2 条反馈        [查看] [应用]      │
│                                                                          │
│                              [查看全部优化建议]                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 五、API 接口设计

### 5.1 执行反馈 API

```typescript
// POST /api/executions/[id]/feedback
// 提交执行反馈
interface CreateFeedbackRequest {
  rating: number;           // 1-5
  isAccurate: boolean;
  expectedOutput?: string;
  feedbackComment?: string;
  issueCategories?: IssueCategory[];
  requestDiagnosis?: boolean;  // 是否请求AI诊断
}

interface CreateFeedbackResponse {
  feedback: ExecutionFeedback;
  diagnosisJobId?: string;  // 如果请求诊断，返回任务ID
}

// GET /api/executions/[id]/feedback
// 获取执行的反馈列表

// GET /api/feedback/[id]/diagnosis
// 获取反馈的诊断结果
interface DiagnosisResponse {
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  result?: DiagnosisResult;
  suggestions?: OptimizationSuggestion[];
}
```

### 5.2 优化建议 API

```typescript
// GET /api/workflows/[id]/suggestions
// 获取工作流的优化建议列表
interface GetSuggestionsQuery {
  status?: SuggestionStatus;
  page?: number;
  limit?: number;
}

// POST /api/suggestions/[id]/apply
// 应用优化建议
interface ApplySuggestionRequest {
  createNewVersion?: boolean;  // 是否创建新版本
  versionTag?: string;
  commitMessage?: string;
}

interface ApplySuggestionResponse {
  success: boolean;
  workflowVersion?: WorkflowVersion;
  appliedChanges: SuggestedChange[];
}

// POST /api/suggestions/[id]/reject
// 拒绝优化建议
interface RejectSuggestionRequest {
  reason?: string;
}

// POST /api/suggestions/batch-apply
// 批量应用优化建议
interface BatchApplyRequest {
  suggestionIds: string[];
  createNewVersion: boolean;
  versionTag?: string;
  commitMessage?: string;
}
```

### 5.3 版本管理 API

```typescript
// GET /api/workflows/[id]/versions
// 获取版本列表
interface GetVersionsQuery {
  page?: number;
  limit?: number;
  includeStats?: boolean;
}

// POST /api/workflows/[id]/versions
// 创建新版本
interface CreateVersionRequest {
  versionTag?: string;
  commitMessage: string;
  publish?: boolean;
}

// GET /api/workflows/[id]/versions/[versionId]
// 获取特定版本详情

// POST /api/workflows/[id]/versions/[versionId]/publish
// 发布版本（设为活跃版本）

// POST /api/workflows/[id]/versions/[versionId]/rollback
// 回滚到指定版本
interface RollbackRequest {
  commitMessage?: string;
}

// GET /api/workflows/[id]/versions/compare
// 版本对比
interface CompareVersionsQuery {
  fromVersion: string;
  toVersion: string;
}

interface CompareVersionsResponse {
  nodesAdded: NodeConfig[];
  nodesRemoved: NodeConfig[];
  nodesModified: {
    nodeId: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  edgesAdded: EdgeConfig[];
  edgesRemoved: EdgeConfig[];
}
```

### 5.4 统计分析 API

```typescript
// GET /api/workflows/[id]/analytics
// 获取工作流统计数据
interface GetAnalyticsQuery {
  period: 'day' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
  versionId?: string;
}

interface AnalyticsResponse {
  summary: {
    totalExecutions: number;
    successRate: number;
    avgRating: number;
    feedbackCount: number;
    accuracyRate: number;
  };
  trend: {
    date: string;
    executions: number;
    successRate: number;
    avgRating: number;
  }[];
  issueBreakdown: {
    category: IssueCategory;
    count: number;
    percentage: number;
  }[];
  ratingDistribution: {
    rating: number;
    count: number;
    percentage: number;
  }[];
  topSuggestions: OptimizationSuggestion[];
}

// GET /api/workflows/[id]/analytics/compare
// 版本间统计对比
interface CompareAnalyticsQuery {
  versionIds: string[];
}
```

---

## 六、技术实现要点

### 6.1 AI 诊断服务实现

```typescript
// src/lib/services/diagnosis.service.ts

import { prisma } from '@/lib/prisma';
import { createAIClient } from '@/lib/ai';

export class DiagnosisService {
  private async buildDiagnosisPrompt(context: DiagnosisContext): Promise<string> {
    return `你是一个专业的 AI 工作流优化顾问。请分析以下工作流执行的问题并提供优化建议。

## 工作流信息
名称: ${context.workflow.name}
配置: ${JSON.stringify(context.workflow.config, null, 2)}

## 执行详情
输入: ${JSON.stringify(context.execution.input, null, 2)}
输出: ${JSON.stringify(context.execution.output, null, 2)}
执行时长: ${context.execution.duration}ms
Token消耗: ${context.execution.tokenUsage.totalTokens}

## 用户反馈
评分: ${context.feedback.rating}/5
准确性: ${context.feedback.isAccurate ? '准确' : '不准确'}
期望输出: ${context.feedback.expectedOutput || '未提供'}
用户说明: ${context.feedback.comment || '无'}

${context.ragResults ? `
## 知识库检索结果
查询: ${context.ragResults.query}
检索到的内容:
${context.ragResults.retrievedChunks.map((chunk, i) =>
  `[相似度: ${context.ragResults!.scores[i].toFixed(2)}] ${chunk}`
).join('\n')}
` : ''}

请按以下格式输出分析结果:

### 问题分类
(从以下类别中选择适用的: KNOWLEDGE_BASE, PROMPT_UNCLEAR, PROMPT_WRONG, MODEL_CAPABILITY, MODEL_CONFIG, INPUT_QUALITY, CONTEXT_MISSING, LOGIC_ERROR, OTHER)

### 根因分析
(详细说明问题的根本原因)

### 优化建议
(提供具体的、可执行的优化建议，包括具体的修改内容)

请以JSON格式输出。`;
  }

  async analyzeFeedback(feedbackId: string): Promise<DiagnosisResult> {
    // 1. 获取反馈和执行上下文
    const feedback = await prisma.executionFeedback.findUnique({
      where: { id: feedbackId },
      include: {
        execution: {
          include: {
            logs: true,
            workflow: true,
          }
        }
      }
    });

    // 2. 构建诊断上下文
    const context = await this.buildContext(feedback);

    // 3. 调用 AI 进行诊断
    const aiClient = await createAIClient(feedback.execution.workflow.organizationId);
    const diagnosisPrompt = await this.buildDiagnosisPrompt(context);

    const response = await aiClient.chat({
      messages: [{ role: 'user', content: diagnosisPrompt }],
      model: 'gpt-4',
      temperature: 0.3,
    });

    // 4. 解析诊断结果
    const result = this.parseDiagnosisResponse(response);

    // 5. 保存诊断结果
    await prisma.executionFeedback.update({
      where: { id: feedbackId },
      data: {
        aiDiagnosis: result,
        diagnosedAt: new Date(),
        optimizationStatus: 'SUGGESTED',
      }
    });

    // 6. 创建优化建议
    await this.createSuggestions(feedbackId, result);

    return result;
  }

  async applySuggestion(
    suggestionId: string,
    userId: string,
    options: { createNewVersion?: boolean; versionTag?: string; commitMessage?: string }
  ): Promise<WorkflowVersion | null> {
    const suggestion = await prisma.optimizationSuggestion.findUnique({
      where: { id: suggestionId },
      include: { feedback: { include: { execution: { include: { workflow: true } } } } }
    });

    if (!suggestion) throw new Error('Suggestion not found');

    const workflow = suggestion.feedback.execution.workflow;
    const changes = suggestion.suggestedChanges as SuggestedChange[];

    // 应用修改到工作流配置
    const updatedConfig = this.applyChangesToConfig(
      workflow.config as WorkflowConfig,
      changes
    );

    // 更新工作流
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { config: updatedConfig }
    });

    // 更新建议状态
    await prisma.optimizationSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'APPLIED',
        appliedAt: new Date(),
        appliedById: userId,
      }
    });

    // 可选：创建新版本
    if (options.createNewVersion) {
      return this.createVersion(workflow.id, userId, {
        versionTag: options.versionTag,
        commitMessage: options.commitMessage || `应用AI优化建议: ${suggestion.suggestionTitle}`,
        versionType: 'OPTIMIZATION',
        optimizationIds: [suggestionId],
      });
    }

    return null;
  }
}
```

### 6.2 版本管理服务

```typescript
// src/lib/services/version.service.ts

export class VersionService {
  async createVersion(
    workflowId: string,
    userId: string,
    options: CreateVersionOptions
  ): Promise<WorkflowVersion> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    // 获取最新版本号
    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { versionNumber: 'desc' }
    });

    const newVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    // 计算变更摘要
    const changesSummary = latestVersion
      ? await this.calculateChanges(latestVersion.config, workflow.config)
      : null;

    // 创建版本
    const version = await prisma.workflowVersion.create({
      data: {
        workflowId,
        versionNumber: newVersionNumber,
        versionTag: options.versionTag,
        commitMessage: options.commitMessage,
        config: workflow.config,
        versionType: options.versionType || 'MANUAL',
        isPublished: options.publish || false,
        isActive: options.publish || false,
        changesSummary,
        sourceVersionId: latestVersion?.id,
        optimizationIds: options.optimizationIds,
        createdById: userId,
      }
    });

    // 如果发布，更新工作流的当前版本
    if (options.publish) {
      await this.setActiveVersion(workflowId, version.id);
    }

    return version;
  }

  async rollback(
    workflowId: string,
    targetVersionId: string,
    userId: string
  ): Promise<WorkflowVersion> {
    const targetVersion = await prisma.workflowVersion.findUnique({
      where: { id: targetVersionId }
    });

    if (!targetVersion || targetVersion.workflowId !== workflowId) {
      throw new Error('Version not found');
    }

    // 更新工作流配置为目标版本
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { config: targetVersion.config }
    });

    // 创建回滚版本记录
    return this.createVersion(workflowId, userId, {
      commitMessage: `回滚到版本 ${targetVersion.versionTag || `v${targetVersion.versionNumber}`}`,
      versionType: 'ROLLBACK',
      publish: true,
    });
  }

  async compareVersions(
    versionId1: string,
    versionId2: string
  ): Promise<VersionComparison> {
    const [v1, v2] = await Promise.all([
      prisma.workflowVersion.findUnique({ where: { id: versionId1 } }),
      prisma.workflowVersion.findUnique({ where: { id: versionId2 } }),
    ]);

    return this.calculateChanges(v1.config, v2.config);
  }

  private calculateChanges(
    oldConfig: WorkflowConfig,
    newConfig: WorkflowConfig
  ): VersionComparison {
    // 实现配置对比逻辑
    const oldNodes = new Map(oldConfig.nodes.map(n => [n.id, n]));
    const newNodes = new Map(newConfig.nodes.map(n => [n.id, n]));

    const nodesAdded = newConfig.nodes.filter(n => !oldNodes.has(n.id));
    const nodesRemoved = oldConfig.nodes.filter(n => !newNodes.has(n.id));
    const nodesModified = [];

    for (const [id, newNode] of newNodes) {
      const oldNode = oldNodes.get(id);
      if (oldNode) {
        const changes = this.diffNodes(oldNode, newNode);
        if (changes.length > 0) {
          nodesModified.push({ nodeId: id, changes });
        }
      }
    }

    // 同样处理 edges
    // ...

    return { nodesAdded, nodesRemoved, nodesModified, edgesAdded: [], edgesRemoved: [] };
  }
}
```

---

## 七、实施计划

### 阶段一：数据模型和基础API（1-2周）
1. 创建 Prisma 数据模型
2. 运行数据库迁移
3. 实现反馈提交 API
4. 实现版本创建 API

### 阶段二：前端反馈组件（1周）
1. 执行结果反馈表单
2. 版本提交对话框
3. 版本历史面板

### 阶段三：AI 诊断系统（1-2周）
1. 诊断服务实现
2. Prompt 工程优化
3. 优化建议生成

### 阶段四：优化应用和版本管理（1周）
1. 优化建议预览
2. 一键应用功能
3. 版本对比功能
4. 回滚功能

### 阶段五：统计分析面板（1周）
1. 统计数据聚合
2. 可视化图表
3. 分析报告导出

---

## 八、扩展考虑

### 8.1 未来增强
- 基于历史数据的自动优化推荐
- 多版本 A/B 测试
- 优化效果自动追踪
- 跨工作流的模式识别
- 优化建议的协作审批流程

### 8.2 性能考虑
- 统计数据定时聚合（避免实时计算）
- 版本配置压缩存储
- 诊断任务异步队列处理
- 大量反馈时的批量分析

### 8.3 安全考虑
- 反馈内容敏感信息过滤
- 版本访问权限控制
- 优化应用操作审计
