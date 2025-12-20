# 知识库系统优化计划

> 创建时间：2024-12-20
> 状态：执行中
> 目标：对标 Dify / MaxKB 级别的知识库检索效果

## 竞品功能对标分析

### Dify 核心检索能力

| 功能 | 当前状态 | 优先级 |
|------|----------|--------|
| 向量检索 | ✅ 已实现 | - |
| 混合检索（向量+全文） | ✅ 已增强（可配置权重） | - |
| Reranking 重排序 | ✅ 已实现（Jina API） | - |
| 多知识库查询 | ❌ 未实现 | 中 |
| 检索配置（TopK/Score/权重） | ✅ 已实现 | - |
| 分块策略配置 | ⚠️ 基础实现 | 中 |
| 父子分块（Parent-Child） | ❌ 未实现 | 低 |

### MaxKB 核心检索能力

| 功能 | 当前状态 | 优先级 |
|------|----------|--------|
| 向量检索 | ✅ 已实现 | - |
| 全文检索（BM25） | ❌ 未实现 | 高 |
| 混合检索 | ✅ 已增强 | - |
| 问题优化（Query Rewrite） | ✅ 已实现 | - |
| 查询扩展（Query Expansion） | ✅ 已实现 | - |
| HyDE 假设文档嵌入 | ✅ 已实现 | - |
| 段落窗口扩展 | ❌ 未实现 | 中 |
| 多知识库关联 | ❌ 未实现 | 中 |
| 分段自动摘要 | ❌ 未实现 | 低 |

---

## 一、现状评估摘要

### 1.1 核心代码分布

| 模块 | 文件位置 | 行数 | 功能 |
|------|----------|------|------|
| 数据模型 | `prisma/schema.prisma` | - | KnowledgeBase、KnowledgeDocument、DocumentChunk、KnowledgeBasePermission |
| 文档解析 | `src/lib/knowledge/parser.ts` | 170 | PDF/DOCX/TXT/MD 文档解析 |
| 文本分块 | `src/lib/knowledge/chunker.ts` | 208 | 递归字符分割算法 |
| 向量嵌入 | `src/lib/knowledge/embedding.ts` | 192 | OpenAI/胜算云 嵌入生成 |
| 向量检索 | `src/lib/knowledge/search.ts` | 296 | 向量搜索、混合搜索、RAG 上下文 |
| 文档处理 | `src/lib/knowledge/processor.ts` | 275 | 文档处理流水线 |
| API 路由 | `src/app/api/knowledge-bases/` | ~1100 | REST API 实现 |
| 前端界面 | `src/app/(dashboard)/knowledge-bases/` | ~1000+ | 知识库管理界面 |
| 工作流集成 | `src/lib/workflow/processors/process.ts` | 275 | RAG 与工作流节点集成 |

### 1.2 已发现的问题分类

#### 高优先级问题（影响生产可用性）

| 问题 | 位置 | 影响 |
|------|------|------|
| 向量搜索内存加载全量数据 | `search.ts` | 大规模知识库性能崩溃 |
| 向量数据库仅支持 MEMORY | schema.prisma | 生产环境不可用 |
| 存储文件未清理 | `documents/[docId]/route.ts` | 存储空间浪费 |
| 文档处理串行化 | `processor.ts` | 批量处理效率极低 |
| 错误恢复不完整 | `processor.ts` | 部分处理失败数据不一致 |

#### 中优先级问题（影响用户体验）

| 问题 | 位置 | 影响 |
|------|------|------|
| 无 API 重试机制 | `embedding.ts` | 临时网络问题导致失败 |
| 关键词搜索过于简陋 | `search.ts` | 搜索质量差 |
| 缺少使用量统计 | `embedding.ts` | 无法追踪成本 |
| Token 估算不准确 | `search.ts` | 可能超出上下文限制 |
| 无实时处理进度 | 前端 | 用户不知道处理状态 |
| 搜索结果无高亮 | 前端 | 用户体验差 |

#### 低优先级问题（优化增强）

| 问题 | 位置 | 影响 |
|------|------|------|
| Markdown 解析丢失代码块 | `parser.ts` | 信息丢失 |
| 分块分隔符硬编码 | `chunker.ts` | 不够灵活 |
| 缺少文档去重 | `processor.ts` | 重复处理 |
| 权限检查不完整 | `search/route.ts` | 安全风险 |

---

## 二、优化计划

### 阶段一：核心问题修复（高优先级）

#### 1.1 实现向量数据库支持（pgvector）

**目标**：使用 PostgreSQL pgvector 扩展替代内存向量搜索

**任务清单**：
- [ ] 添加 pgvector 扩展到数据库
- [ ] 修改 DocumentChunk 模型，使用 vector 类型存储 embedding
- [ ] 实现基于 pgvector 的相似度搜索
- [ ] 添加 HNSW 或 IVFFlat 索引加速搜索
- [ ] 保留内存搜索作为降级方案

**代码修改位置**：
- `prisma/schema.prisma`
- `src/lib/knowledge/search.ts`
- `src/lib/knowledge/processor.ts`

#### 1.2 文件清理功能实现

**目标**：删除文档时同步清理存储文件

**任务清单**：
- [ ] 实现 `deleteFile` 工具函数
- [ ] 在文档删除 API 中调用文件清理
- [ ] 添加定期清理孤立文件的后台任务

**代码修改位置**：
- `src/lib/storage/index.ts`（新建）
- `src/app/api/knowledge-bases/[id]/documents/[docId]/route.ts`

#### 1.3 文档处理并发优化

**目标**：支持并发文档处理，提升批量上传效率

**任务清单**：
- [ ] 使用 `p-limit` 或 `p-queue` 库控制并发
- [ ] 实现文档处理队列
- [ ] 添加处理进度记录

**代码修改位置**：
- `src/lib/knowledge/processor.ts`

#### 1.4 错误恢复机制

**目标**：确保失败时数据一致性

**任务清单**：
- [ ] 处理前清理该文档的旧分块
- [ ] 使用数据库事务包裹整个处理流程
- [ ] 实现失败重试逻辑

**代码修改位置**：
- `src/lib/knowledge/processor.ts`

---

### 阶段二：用户体验优化（中优先级）

#### 2.1 API 调用增强

**任务清单**：
- [ ] 添加指数退避重试机制到嵌入 API 调用
- [ ] 实现请求超时控制
- [ ] 添加详细的错误日志

**代码修改位置**：
- `src/lib/knowledge/embedding.ts`

#### 2.2 使用量统计

**任务清单**：
- [ ] 创建 EmbeddingUsage 数据模型
- [ ] 记录每次嵌入的 token 使用量
- [ ] 提供使用量查询 API
- [ ] 在前端显示使用统计

**代码修改位置**：
- `prisma/schema.prisma`
- `src/lib/knowledge/embedding.ts`
- `src/app/api/knowledge-bases/[id]/stats/route.ts`（新建）

#### 2.3 Token 估算优化

**任务清单**：
- [ ] 集成 `tiktoken` 或 `gpt-tokenizer` 库
- [ ] 实现准确的 token 计数函数
- [ ] 在 RAG 上下文构建时使用准确计数

**代码修改位置**：
- `src/lib/knowledge/search.ts`
- `src/lib/utils/tokenizer.ts`（新建）

#### 2.4 实时处理进度

**任务清单**：
- [ ] 实现 Server-Sent Events (SSE) 端点
- [ ] 在文档处理各阶段发送进度事件
- [ ] 前端接收并显示实时进度
- [ ] 添加处理完成通知

**代码修改位置**：
- `src/app/api/knowledge-bases/[id]/documents/stream/route.ts`（新建）
- `src/lib/knowledge/processor.ts`
- 前端组件

#### 2.5 搜索体验增强

**任务清单**：
- [ ] 实现搜索结果关键词高亮
- [ ] 添加搜索建议/自动补全
- [ ] 优化搜索结果排序算法
- [ ] 显示更多来源信息（页码、段落等）

**代码修改位置**：
- `src/lib/knowledge/search.ts`
- 前端搜索组件

---

### 阶段三：功能增强（低优先级）

#### 3.1 关键词搜索增强

**任务清单**：
- [ ] 实现中文分词（使用 `nodejieba`）
- [ ] 添加同义词扩展
- [ ] 支持模糊匹配
- [ ] 实现全文搜索索引

**代码修改位置**：
- `src/lib/knowledge/search.ts`

#### 3.2 文档解析增强

**任务清单**：
- [ ] 保留 Markdown 代码块内容
- [ ] 添加 HTML 文件支持
- [ ] 添加 Excel/CSV 文件支持
- [ ] 添加 JSON 结构化数据支持

**代码修改位置**：
- `src/lib/knowledge/parser.ts`

#### 3.3 文档去重

**任务清单**：
- [ ] 实现文档指纹（SimHash 或 MinHash）
- [ ] 在上传时检测重复文档
- [ ] 提供去重策略配置

**代码修改位置**：
- `src/lib/knowledge/processor.ts`
- `src/lib/knowledge/dedup.ts`（新建）

#### 3.4 权限系统完善

**任务清单**：
- [ ] 在搜索 API 添加权限验证
- [ ] 创建知识库时自动赋予创建者 MANAGER 权限
- [ ] 实现部门权限级联删除

**代码修改位置**：
- `src/app/api/knowledge-bases/[id]/search/route.ts`
- `src/app/api/knowledge-bases/route.ts`

---

## 三、执行计划

### 本次执行范围（第一阶段 - 核心检索优化）

对标 Dify/MaxKB 效果，本次将执行以下优化：

1. **API 重试机制** - ✅ 已完成
   - 在 `embedding.ts` 添加指数退避重试
   - 支持网络错误、限流等可重试错误自动恢复
   - 30秒请求超时控制

2. **Token 估算优化** - ✅ 已完成
   - 集成 `gpt-tokenizer` 库准确计数
   - 新建 `tokenizer.ts` 模块
   - 支持聊天消息 token 计算
   - 支持文本截断到 token 限制

3. **混合检索增强** - ✅ 已完成
   - 实现可配置的向量+关键词权重
   - 默认 70% 向量 + 30% 关键词
   - 自动归一化权重配置

4. **Reranking 重排序** - ✅ 已完成
   - 集成 Jina Reranker API
   - 支持自定义重排序模型
   - 优雅降级：API 不可用时保留原排序

5. **搜索结果高亮** - ✅ 已完成
   - 实现关键词 `**高亮**` 标记
   - 返回匹配的关键词列表

6. **错误处理增强** - ✅ 已完成
   - 分阶段错误处理（解析/分块/嵌入/保存）
   - 使用事务确保数据一致性
   - 详细的错误日志和恢复信息

7. **Query 增强** - ✅ 已完成
   - 新建 `query-enhance.ts` 模块
   - 查询重写（Query Rewrite）
   - 查询扩展（Query Expansion）
   - HyDE（假设文档嵌入）支持

### 新增功能清单

| 功能 | 文件 | 状态 |
|------|------|------|
| 指数退避重试 | `embedding.ts` | ✅ |
| Token 准确计数 | `tokenizer.ts` | ✅ |
| 混合检索权重配置 | `search.ts` | ✅ |
| Reranking 重排序 | `search.ts` | ✅ |
| 搜索高亮 | `search.ts` | ✅ |
| 高级 RAG 上下文 | `search.ts` | ✅ |
| 查询重写 | `query-enhance.ts` | ✅ |
| 查询扩展 | `query-enhance.ts` | ✅ |
| HyDE 支持 | `query-enhance.ts` | ✅ |
| 分阶段错误处理 | `processor.ts` | ✅ |
| 事务数据一致性 | `processor.ts` | ✅ |

### 后续迭代

- **第二次迭代**：pgvector 向量数据库集成 + BM25 全文检索
- **第三次迭代**：多知识库查询 + 段落窗口扩展
- **第四次迭代**：父子分块 + 使用量统计
- **第五次迭代**：Query Rewrite + 实时处理进度

---

## 四、技术方案详解

### 4.1 指数退避重试机制

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
```

### 4.2 准确 Token 计数

使用 `gpt-tokenizer` 库进行准确计数：

```typescript
import { encode } from 'gpt-tokenizer';

function countTokens(text: string): number {
  return encode(text).length;
}
```

### 4.3 搜索结果高亮

```typescript
function highlightKeywords(text: string, keywords: string[]): string {
  let result = text;
  for (const keyword of keywords) {
    const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  }
  return result;
}
```

### 4.4 pgvector 集成方案

```sql
-- 启用扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 添加向量列
ALTER TABLE "DocumentChunk"
ADD COLUMN embedding_vector vector(1536);

-- 创建索引
CREATE INDEX ON "DocumentChunk"
USING hnsw (embedding_vector vector_cosine_ops);
```

---

## 五、验收标准

### 阶段一验收

- [ ] 向量搜索在 10000+ 分块时响应时间 < 500ms
- [ ] 删除文档后存储文件同步删除
- [ ] 批量上传 10 个文档的处理时间 < 原来的 50%
- [ ] 处理失败后数据库状态一致

### 阶段二验收

- [ ] 嵌入 API 临时失败自动重试成功
- [ ] Token 计数误差 < 5%
- [ ] 文档上传后实时显示处理进度
- [ ] 搜索结果正确高亮关键词

### 阶段三验收

- [ ] 中文分词后搜索准确率提升
- [ ] 支持 Excel/CSV 文件上传和解析
- [ ] 重复文档能够被检测和提示
- [ ] 无权限用户无法搜索知识库

---

## 六、风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| pgvector 迁移导致数据丢失 | 中 | 高 | 先备份，双写过渡 |
| Token 计数库体积过大 | 低 | 中 | 评估轻量级替代方案 |
| SSE 在某些环境不支持 | 低 | 中 | 提供轮询降级方案 |
| 并发处理导致 API 限流 | 中 | 中 | 实现请求限流控制 |

---

## 七、参考资料

- [pgvector 官方文档](https://github.com/pgvector/pgvector)
- [gpt-tokenizer npm](https://www.npmjs.com/package/gpt-tokenizer)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [p-limit 并发控制](https://www.npmjs.com/package/p-limit)
