# 剩余模板更新计划

## 目标
将剩余使用旧节点类型的模板更新为只使用 INPUT 和 PROCESS 节点，同时保留原有业务逻辑。

## 完成状态：全部完成 ✓

### 已更新模板（6个）

| 序号 | 模板名称 | 原节点类型 | 状态 |
|------|----------|------------|------|
| 56 | 绩效面谈准备与辅导 Agent | INPUT, PROCESS, SWITCH, MERGE, OUTPUT | ✓ 完成 |
| 57 | 客户投诉升级处理与根因分析 Agent | INPUT, PROCESS, SWITCH, NOTIFICATION, MERGE, OUTPUT | ✓ 完成 |
| 58 | 销售团队战斗力诊断与提升 Agent | DATA, PROCESS, CODE, MERGE, OUTPUT | ✓ 完成 |
| 59 | 组织架构优化与岗位设计 Agent | INPUT, PROCESS, MERGE, OUTPUT | ✓ 完成 |
| 60 | 内部通讯与公告智能撰写 Agent | INPUT, PROCESS, SWITCH, MERGE, OUTPUT | ✓ 完成 |
| 61 | 报价单智能生成与审批 Agent | INPUT, PROCESS, CODE, SWITCH, NOTIFICATION, MERGE, OUTPUT | ✓ 完成 |

## 转换策略说明

### 1. SWITCH 节点处理
- 将条件判断逻辑融入 PROCESS 节点的 systemPrompt 中
- 使用"如果...则..."的结构让 AI 根据条件生成不同内容

### 2. CODE 节点处理
- 将代码逻辑转换为 AI prompt 中的计算指令
- AI 可以执行简单的计算和逻辑判断

### 3. MERGE 节点处理
- 移除 MERGE 节点，将多路径输出整合到后续 PROCESS 节点

### 4. OUTPUT 节点处理
- 转换为 PROCESS 节点，在 prompt 中说明输出格式要求

### 5. NOTIFICATION 节点处理
- 转换为 PROCESS 节点的一部分，生成通知内容

### 6. DATA 节点处理
- 转换为 INPUT 节点，使用 fields 配置接收用户输入

## 最终结果
所有 61 个模板现在都只使用 INPUT + PROCESS 两种节点类型，保持了简洁统一的工作流结构。
