# 知识库增强与执行计划

> 创建时间：2024-12-24
> 目标：通过深度优化 RAG 流程，进一步提升检索的准确性和召回率。

## 一、核心优化方向

基于现有代码架构，我们将从以下四个维度进行提升：

### 1. P0 - 对话历史感知的查询重写 (History-Aware Query Rewriting)

**现状问题**：当前的查询重写仅针对单次 Query，无法理解多轮对话中的指代（如"它有哪些功能"）。
**解决方案**：

- 修改 `query-enhance.ts`，在 `rewriteQuery` 中引入 `chatHistory`。
- 让 LLM 结合历史上下文消解指代，生成完整的独立查询。

### 2. P1 - 父子索引策略 (Parent-Child Indexing)

**现状问题**：固定大小分块可能切断语义；小分块易于检索但缺乏上下文，大分块包含丰富上下文但噪音多。
**解决方案**：

- **Index Small, Retrieve Big**：将文档切分为“父块”（大）和“子块”（小）。
- 仅对“子块”进行向量化索引。
- 检索命中“子块”时，返回其对应的“父块”内容作为 RAG 上下文。
- **实现方式**：利用 `metadata` 存储父块引用，避免 Schema 变更。

### 3. P2 - 自动化评估闭环 (Automated Evaluation)

**现状问题**：缺乏量化指标，优化效果依赖主观判断。
**解决方案**：

- 创建评估脚本 `scripts/evaluate-rag.ts`。
- 自动生成测试集（问题-答案-来源）。
- 计算 Context Precision, Recall, Faithfulness。

### 4. P3 - 结构化元数据增强 (Structured Metadata)

**现状问题**：元数据利用率低，缺乏基于属性的过滤。
**解决方案**：

- 在解析阶段引入 LLM 提取结构化信息（年份、类型、实体）。
- 支持基于元数据的预过滤 (Pre-filtering)。

---

## 二、执行步骤

### 阶段一：核心交互与检索增强（本次执行）

#### 步骤 1.1：实现历史感知重写

- **文件**: `src/lib/knowledge/query-enhance.ts`
- **动作**:
  - 更新 `QueryEnhanceOptions` 接口，增加 `chatHistory` 字段。
  - 更新 `rewriteQuery` Prompt，使其能够处理对话历史和指代消解。

#### 步骤 1.2：实现父子分块策略

- **文件**: `src/lib/knowledge/chunker.ts`
  - 新增 `splitTextWithParentChild` 函数。
  - 生成父块（e.g., 1000 tokens）和子块（e.g., 200 tokens）。
- **文件**: `src/lib/knowledge/processor.ts`
  - 修改保存逻辑，将父块和子块都存入数据库。
  - 父块标记为 `isParent: true`，不生成 Embedding（或仅存 DB）。
  - 子块在 `metadata` 中记录 `parentId`。
- **文件**: `src/lib/knowledge/search.ts`
  - 在获取搜索结果详细信息时，检查 `parentId`。
  - 如果存在 `parentId`，优先获取父块内容作为 `content` 返回。

---

## 三、后续规划

- **阶段二**：自动化评估体系建设。
- **阶段三**：元数据驱动的高级检索。
