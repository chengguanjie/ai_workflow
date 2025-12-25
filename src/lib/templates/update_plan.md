# 工作流模板更新计划：移除旧版节点

## 目标

将 `src/lib/templates/official-templates.ts` 中的所有官方模板更新为仅使用 **用户输入节点 (INPUT)** 和 **AI 处理节点 (PROCESS)** 的现代化架构。移除所有旧版节点（Switch, Merge, Code, Condition, Output, Notification, Data），并将原有逻辑迁移至 System Prompt 或多节点串行流程中。

## 现状分析

当前模板库（`OFFICIAL_TEMPLATES`）中包含 61 个模板。大部分已符合标准，但仍有部分包含旧版节点，主要集中在早期的复杂示例（如客服）和最新的复杂业务场景（如 HR、销售、行政的高级流程）。

### 待重构模板清单

经过代码扫描，以下模板包含旧版节点，需要重构：

**第一批：早期遗留 (Priority: High)**

1. **#10 智能客服全自动化闭环 Agent**
    * 旧节点：Switch, Code, Condition, Notification, Output
    * 策略：将意图识别、分支逻辑、回复生成和审计合并为串行的 AI 处理链。ERP Mock 数据改为 Prompt 上下文预设或由 AI 模拟。
2. **#11 代码安全与性能双重审计 Agent**
    * 旧节点：Merge, Output
    * 策略：使用 PROCESS 节点接收上游多个输入，移除显式的 Merge 节点。

**第二批：HR 与销售复杂场景 (Priority: Medium)**
3.  **#56 绩效面谈准备与辅导 Agent**
    *旧节点：Switch, Merge, Output
    *   策略：移除 Switch 分支，改为单一直线流程，AI 在最后生成包含不同评级话术的综合工具包，或由用户在 Input 中指定评级。
4.  **#57 客户投诉升级处理与根因分析 Agent**
    *旧节点：Switch, Notification, Merge, Output
    *   策略：移除自动通知和路由，将“升级建议”作为 AI 分析报告的一部分输出。
5.  **#58 销售团队战斗力诊断与提升 Agent**
    *旧节点：Data, Code, Merge, Output
    *   策略：Data 节点合并入 Input 节点提示，Code 节点（行动计划生成）改为 AI 生成 JSON/Markdown。

**第三批：组织与行政复杂场景 (Priority: Low)**
6.  **#59 组织架构优化与岗位设计 Agent**
    *旧节点：Merge, Output
    *   策略：简化合并逻辑，移除 Output 节点。
7.  **#60 内部通讯与公告智能撰写 Agent**
    *旧节点：Switch, Merge, Output
    *   策略：移除类型路由，改为 AI 根据输入类型自动调整输出语气和结构。
8.  **#61 报价单智能生成与审批 Agent**
    *旧节点：Code, Switch, Notification, Merge, Output
    *   策略：Code 计算逻辑由 AI 进行估算或提示“需接入外部系统计算”，移除审批流路由，专注于生成报价单草稿和审批建议。

## 执行策略

### 1. 节点类型转换

| 旧节点类型 | 迁移方案 |
| :--- | :--- |
| **Switch (分支)** | 移除。将分支逻辑写入 System Prompt（例如：“如果情况A，则输出...；如果情况B，则输出...”），或简化为通用流程。 |
| **Merge (合并)** | 移除。在下游 PROCESS 节点的 `userPrompt` 中直接引用上游多个节点的 `{{node.result}}`。 |
| **Code (代码)** | 移除。简单逻辑由 LLM 执行；复杂逻辑转化为生成“计算步骤”或“伪代码”。 |
| **Condition (条件)** | 移除。逻辑合并入 AI Prompt。 |
| **Notification (通知)** | 移除。将“通知内容”作为 AI 的输出一部分展示给用户。 |
| **Output (输出)** | 移除。最后一个 PROCESS 节点的输出即为最终结果。 |
| **Data (数据)** | 移除。合并至 INPUT 节点的默认值或 Prompt 上下文中。 |

### 2. 验证标准

* **结构合规**：所有 `nodes` 数组中仅包含 type 为 `'INPUT'` 或 `'PROCESS'` 的节点。
* **逻辑完整**：原有的业务价值（如意图判断、多维分析）不丢失，体现在 Prompt 中。
* **无 TypeScript 错误**：更新后的配置文件符合类型定义。

## 后续步骤

1. 按批次执行代码修改。
2. 保存文件。
3. (可选) 运行脚本重新 Seed 数据库以应用更改。
