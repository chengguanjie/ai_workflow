# AI Workflow 优化计划（执行中）

本计划基于 `NODE_PROCESSORS_ANALYSIS.md` 的诊断结论，并结合当前仓库实际实现状态（部分问题已修复/已实现），整理后续优化与验收清单。

## 目标
- `pnpm tsc -p tsconfig.json --noEmit` 通过
- 多模态变量解析、媒体输出（data URL / 内部文件下载）具备单测覆盖
- 知识库检索（RAG）在不同 embedding provider 场景下更稳健（正确选择凭证、可观测、可降级）

## 现状核对（与诊断报告对齐）
- `src/lib/workflow/processors/output.ts`：已支持 `pdf/word/excel/text` 落盘；媒体输出已支持 `data:*` 与内部 `/api/files/{key}/download` 复用存储读取（不再是占位符）。
- `src/lib/workflow/utils.ts`：已存在更完整的变量替换/多模态 parts 解析相关测试与实现（见 `src/lib/workflow/variable-replacement.test.ts`、`src/lib/workflow/multimodal-internal-files.test.ts`）。
- 目前 `tsc` 阻塞点：`src/lib/files/extract-text.ts` 与 `exceljs` Buffer 类型不兼容。

## 待办与验收标准
### 1) TypeScript 构建修复（阻塞）
- 修复 `src/lib/files/extract-text.ts` 中 `ExcelJS` 的 `workbook.xlsx.load(...)` Buffer 类型兼容问题。
- 验收：`pnpm tsc -p tsconfig.json --noEmit` 通过。

### 2) 多模态 import/output 单测补齐
- 新增 `OutputNodeProcessor` 单测：
  - `format=image|audio|video` + `prompt=data:*;base64,...`：应上传并返回 `file.mimeType` 与 `format` 正确。
  - `format=image|audio|video` + `prompt=/api/files/.../download`：应读取存储并上传。
- 验收：`pnpm test` 通过，且覆盖上述分支。

### 3) 知识库检索集成加固（RAG）
- 统一 `PROCESS` 与 `PROCESS_WITH_TOOLS` 的 RAG query 构建策略：
  - 使用 `src/lib/workflow/rag.ts#buildRagQuery`（合并提示词文本 + 导入文件，剔除多模态占位）。
  - query 为空时跳过检索并记录日志（避免无意义调用）。
- embedding 凭证选择策略：
  - 优先使用与知识库 `embeddingProvider` 匹配的组织级 `ApiKey`（默认优先，找不到再降级任意可用 key）。
  - 若 `embeddingProvider` 与当前 AI 调用配置一致且已提供 `apiKey/baseUrl`，可直接复用。
- 验收：知识库 provider 与节点 AI provider 不一致时仍可正常检索或明确降级（日志可诊断）。

## 执行顺序（建议）
1. 修复 `tsc`（最小补丁，确保构建绿）
2. 增补 `OutputNodeProcessor` 单测（重点覆盖媒体输出路径）
3. 加固 RAG（凭证选择 + query 构建一致性）
4. 运行 `pnpm tsc` + `pnpm test` 验证

