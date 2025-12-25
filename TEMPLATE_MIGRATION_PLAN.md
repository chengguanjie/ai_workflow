# Template Migration Plan

Target: Update all 41 official templates in `src/lib/templates/official-templates.ts`.
Goal: Replace disjointed node types (CODE, SWITCH, MERGE, NOTIFICATION, OUTPUT, ETC.) with only `INPUT` and `PROCESS` nodes, while preserving the logical flow using AI instructions.

## Transformation Rules

1. **INPUT Nodes**: Retain as is. Consolidate file inputs if necessary.
2. **CODE Nodes**: Convert to `PROCESS` nodes.
    * *Prompt*: "You are a calculation/logic engine. Please perform the following data processing..."
3. **SWITCH / CONDITION Nodes**: Remove explicit branching.
    * *Strategy*: Merge the conditional logic into the subsequent `PROCESS` node.
    * *Prompt Addition*: "Analyze the previous result. If condition A is met, generate X. If condition B is met, generate Y."
4. **MERGE Nodes**: Remove. Connect all predecessors to the next node.
5. **NOTIFICATION Nodes**: Convert to `PROCESS` nodes.
    * *Prompt*: "Generate a notification message for [Platform] with the following content..."
6. **OUTPUT Nodes**: Convert to `PROCESS` nodes.
    * *Prompt*: "Format the final result as [Format]..."
7. **Loop Nodes**: Convert to `PROCESS` nodes.
    * *Prompt*: "Process the following list of items..." (Simulate loop in one go).

## Execution Batches

### Batch 1: Intelligence, Data, DAM, L10n, Risk (Templates 1-5)

1. 多源情报研判与简报 Agent
2. 智能商业分析 (BI) 专家 Agent
3. 企业数字资产 (DAM) 智能归档 Agent
4. 全球化 (L10n) 交付与合规 Agent
5. 全媒体合规风控中台

### Batch 2: Legal, Product, Finance, Sales (Templates 6-11)

6. 企业级合同风险审查 Agent
2. 多 Agent 协同 PRD 进化器
3. 产品发布全渠道宣发 Agent
4. 深度财务分析与风险雷达
5. 销售线索专家级评估 Agent
6. 商务邮件智能秘书 Agent

### Batch 3: Customer Service, Code Audit, Production, Supplier, Marketing (Templates 12-16)

12. 智能客服全自动化闭环 Agent
2. 代码安全与性能双重审计 Agent
3. 生产线异常诊断与快速响应系统
4. 供应商合规与表现智能雷达
5. 全网趋势捕捉与多端爆文引擎

### Batch 4: Design, Meeting, Team, HR, Legal (Templates 17-21)

17. 视觉创意进化与审美审计 Agent
2. 企业级会议决策追踪系统
3. 团队周报智能聚合与效能分析 Agent
4. 全流程智能招聘 Agent
5. 新员工入职全流程导航 Agent

### Batch 5: IP, Finance, DevOps, Competitor, KA (Templates 22-26)

22. 知识产权 (IP) 侵权监测与维权 Agent
2. 发票智能稽核与税务风控 Agent
3. 自动化 DevOps 故障自愈 Agent
4. 竞品广告投放策略反向工程 Agent
5. 大客户 (KA) 深度背景调查 Agent

### Batch 6: HR, Stock, Travel, PR, Community (Templates 27-31)

27. 员工离职预测与关怀 Agent
2. 库存智能补货与调拨 Agent
3. 企业差旅合规与成本优化 Agent
4. 投诉危机公关处理 Agent
5. 私域社群活跃度操盘 Agent

### Batch 7: Compliance, Branding, Testing, RFP, Investment (Templates 32-36)

32. 隐私合规与 GDPR 审计 Agent
2. 品牌联名 (Co-branding) 策划 Agent
3. 自动化测试用例生成 Agent
4. 招投标书 (RFP) 智能撰写 Agent
5. 投融资项目尽职调查 (DD) Agent

### Batch 8: Training, Product, Logistics, EHS, CEO (Templates 37-41)

37. 企业内训课程体系构建 Agent
2. 爆品选品与定价策略 Agent
3. 跨境物流路径规划与成本优化 Agent
4. 企业 EHS 安全巡检智能分析 Agent
5. CEO 每日决策辅助驾驶舱 Agent
... (And remaining templates if any)

*(Self-Correction: The user listed 41 templates. I'll process them in chunks.)*

## Implementation

I will use `multi_replace_file_content` to essentially rewrite the `nodes` and `edges` arrays for each template.
