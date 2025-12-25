/**
 * 官方工作流模板种子数据 - 企业级 Agentic Workflow 最终完整版 (v8.0)
 *
 * 包含 61 个经过 AES 标准严苛审查的高价值 Agent。
 * 覆盖全业务链：情报、BI、资产、全球化、风控、法务、产品、财务、销售、客服、研发、生产、采购、新媒体、设计、行政、HR、
 * 隐私合规、投融资、培训、电商、跨境物流、EHS安环、CEO决策、营销归因、Pipeline诊断、人才盘点、预算监控、竞品快反、客户挽留、薪酬分析、应收账款、LTV提升、合同履约、
 * 赢单复盘、敬业度调研、会议追踪、渠道绩效、绩效面谈、投诉升级、团队诊断、组织架构、内部通讯、报价审批。
 *
 * AES 评估体系 (Agentic Evaluation System):
 * - L - Logic (逻辑闭环) 30%：异常处理、分支覆盖、死循环规避
 * - A - Agentic (智能深度) 25%：工具使用率、多步推理、反思机制
 * - C - Context (落地语境) 20%：知识库依赖、API 真实性、参数配置
 * - P - Prompt (指令质量) 15%：角色沉浸度、CoT 思维链、输出规范
 * - R - Robustness (鲁棒性) 10%：代码健壮性、数据类型安全
 */

import { prisma } from "@/lib/db";

const OFFICIAL_TEMPLATES = [
  // ============================================================
  // 1. 情报与决策 (Intelligence & Decision)
  // ============================================================
  {
    name: "多源情报研判与简报 Agent",
    description:
      "自动聚合多渠道信息，进行清洗、去重、PESTEL 深度研判及价值分级",
    category: "ai-processing",
    tags: ["情报分析", "决策支持", "PESTEL模型"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["战略决策", "市场研究", "竞品监控"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "情报源配置",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "sources",
                name: "待分析文本/URL",
                value: "",
                height: 150,
                placeholder: "输入文本内容，或每行一个 URL...",
              },
              {
                id: "focus",
                name: "研判重点",
                value: "市场趋势, 竞争对手动向",
                placeholder: "你最关注的信息维度",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "信息清洗与PESTEL研判",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个战略情报分析专家。请完成以下任务：\n1. 清洗输入的文本内容（去除HTML标签、无效字符）\n2. 基于PESTEL模型（政治、经济、社会、技术、环境、法律）进行深度研判\n3. 评估情报的价值等级（高/中/低）\n4. 在输出中明确标注价值等级",
            userPrompt:
              '原始信息：{{情报源配置.sources}}\n关注方向：{{情报源配置.focus}}\n\n请输出JSON格式：{"cleaned_content": "清洗后的内容", "pestel_analysis": "分析结果", "value_level": "high/medium/low", "risk_signals": ["信号列表"]}',
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "决策简报生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              '你是一个决策简报撰写专家。请根据情报分析结果生成正式的决策简报：\n\n- 如果价值等级为"高"，请：1) 突出标注为【高价值情报】2) 提炼3个必须立即采取的行动建议 3) 生成紧急预警通知内容\n- 如果价值等级为"中"或"低"，请生成常规简报格式\n\n输出格式要求：Markdown格式，包含执行摘要、详细分析、行动建议、风险提示等章节',
            userPrompt:
              "分析结果：{{信息清洗与PESTEL研判.result}}\n\n请生成完整的决策简报",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 2. 数据与分析 (Data & Analytics)
  // ============================================================
  {
    name: "智能商业分析 (BI) 专家 Agent",
    description:
      "具备 Python 数据清洗、统计学异常检测及 ECharts 可视化配置生成的全栈分析师",
    category: "ai-processing",
    tags: ["BI", "Python清洗", "ECharts"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["数据分析", "异常检测", "可视化报告"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "业务数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "data",
                name: "业务数据",
                value: "",
                height: 200,
                placeholder:
                  "粘贴销售、运营或财务的数据（CSV格式或文本描述）...",
              },
              {
                id: "focus",
                name: "分析重点",
                value: "",
                placeholder: "如：销售趋势、成本异常、库存周转",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "数据清洗与异常检测",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个数据科学家。请完成以下任务：\n1. 解析并清洗输入的数据（处理缺失值、异常值）\n2. 计算关键统计指标（均值、方差、同比环比）\n3. 识别异常波动并进行根因分析\n4. 输出结构化的分析结果",
            userPrompt:
              '原始数据：{{业务数据输入.data}}\n分析重点：{{业务数据输入.focus}}\n\n请输出JSON格式的分析结果，包含：{"summary": "数据概览", "anomalies": ["异常列表"], "root_causes": ["归因分析"], "key_metrics": {"指标名": 值}}',
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "可视化报告生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个BI报告专家。请根据分析结果生成完整的深度分析报告：\n\n1. 数据概览：关键指标汇总\n2. 异常分析：识别的问题及根因\n3. 可视化建议：生成ECharts的option配置代码\n4. 行动建议：基于数据的决策建议\n\n输出格式：Markdown，包含ECharts代码块",
            userPrompt:
              "分析结果：{{数据清洗与异常检测.result}}\n\n请生成完整的BI分析报告",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 3. 资产管理 (DAM)
  // ============================================================
  {
    name: "企业数字资产 (DAM) 智能归档 Agent",
    description:
      "自动识别图片/文档内容，生成 SEO 元数据，并根据业务规则自动路由归档目录",
    category: "ai-processing",
    tags: ["DAM", "自动打标", "资产路由"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["资产管理", "智能归档", "元数据生成"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "资产信息输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "assets",
                name: "资产描述",
                value: "",
                height: 150,
                placeholder:
                  "描述要处理的图片/文档资产（文件名、URL或内容描述）...",
              },
              {
                id: "rules",
                name: "归档规则",
                value: "",
                placeholder: "如：产品图->/Products，活动照->/Events",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多模态智能打标",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个DAM资产管理专家。请对每个资产进行分析：\n1. 识别主体内容（人物、产品、场景等）\n2. 分析视觉元素（色系、风格、情绪）\n3. 生成SEO关键词标签\n4. 根据归档规则推荐存储目录",
            userPrompt:
              '资产信息：{{资产信息输入.assets}}\n归档规则：{{资产信息输入.rules}}\n\n请为每个资产输出JSON：{"file": "文件名", "tags": ["标签"], "category": "分类", "recommended_path": "推荐路径", "seo_keywords": ["关键词"]}',
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "资产元数据索引",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个数据索引专家。请根据打标结果生成完整的资产元数据索引：\n\n1. 汇总所有资产的标签和分类\n2. 生成结构化的JSON索引文件\n3. 包含文件路径、智能标签、推荐归档位置\n\n输出格式：JSON",
            userPrompt:
              "打标结果：{{多模态智能打标.result}}\n\n请生成完整的资产元数据索引",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 4. 全球化 (L10n)
  // ============================================================
  {
    name: "全球化 (L10n) 交付与合规 Agent",
    description:
      "超越翻译：集成术语库匹配、文化禁忌审查及 Mock 数据回退的稳健本地化系统",
    category: "operation",
    tags: ["L10n", "文化合规", "术语一致性"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["本地化", "文化合规", "多语言"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "本地化需求输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "text",
                name: "待本地化内容",
                value: "",
                height: 200,
                placeholder: "输入需要翻译的原始文本...",
              },
              {
                id: "target_lang",
                name: "目标市场",
                value: "AR_SA (沙特阿拉伯)",
                placeholder: "语言代码 + 地区",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "术语匹配与翻译",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个专业本地化专家。请执行以下步骤：\n1. 提取文本中的专业术语，匹配标准译法\n2. 结合目标市场的语言习惯进行信达雅的翻译\n3. 保持原文的格式和语气",
            userPrompt:
              '原文：{{本地化需求输入.text}}\n目标市场：{{本地化需求输入.target_lang}}\n\n请输出JSON：{"terms": ["术语表"], "draft_translation": "初稿"}',
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "文化合规审查与交付",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个文化合规专家。请对翻译初稿进行审查：\n1. 检查是否存在宗教、政治或习俗禁忌\n2. 修正不合规的表达\n3. 输出最终交付级的本地化文本",
            userPrompt:
              "初稿：{{术语匹配与翻译.draft_translation}}\n目标市场：{{本地化需求输入.target_lang}}\n\n请输出最终结果",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 5. 风控与合规 (Risk & Compliance)
  // ============================================================
  {
    name: "全媒体合规风控中台",
    description:
      "集成多模态审核、法规库 RAG 及自动处置分流的企业级内容风控系统",
    category: "operation",
    tags: ["内容安全", "合规", "多模态"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["内容审核", "风险控制", "合规管理"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "待审内容输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "text",
                name: "文案标题及正文",
                value: "",
                height: 150,
                placeholder: "输入待审核的文案...",
              },
              {
                id: "image_url",
                name: "配图链接",
                value: "",
                placeholder: "输入图片URL...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "智能合规审核",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深风控官。请结合法律法规库（RAG）对输入内容进行全方位审核：\n1. 审核文案是否包含违禁词、虚假宣传或敏感信息\n2. 审核图片链接（假设能看到图片内容）是否包含不安全元素\n3. 综合判断风险等级（高危/疑似/通过）\n4. 给出具体违规原因或放行理由",
            userPrompt:
              '文案：{{待审内容输入.text}}\n图片：{{待审内容输入.image_url}}\n\n请输出JSON：{"risk_level": "high/medium/pass", "reason": "审核详情", "action_suggestion": "block/manual/pass"}',
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "处置结果生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              '你是一个风控执行系统。根据审核结果执行相应操作：\n\n- 如果风险等级为"high"（高危）：生成一份严厉的阻断通知，说明具体违规点。\n- 如果风险等级为"medium"（疑似）：生成提交人工复审的申请单。\n- 如果风险等级为"pass"（通过）：生成带时间戳和签名的合规放行凭证。\n\n输出格式：Markdown',
            userPrompt: "审核结果：{{智能合规审核.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 6. 法务部门 (Legal)
  // ============================================================
  {
    name: "企业级合同风险审查 Agent",
    description:
      "采用“检索增强 + 风险分级 + 闭环反馈”模式，基于企业知识库进行深度合规性分析",
    category: "legal",
    tags: ["Agent", "合规", "风险预警"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["合同审查", "风险识别", "法务支持"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "合同审查输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "text",
                name: "合同全文",
                value: "",
                height: 200,
                placeholder: "粘贴合同文本...",
              },
              {
                id: "type",
                name: "合同类型",
                value: "采购合同",
                placeholder: "如：劳动合同、融资协议",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "智能风险审计",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深法务专家。请结合法规库（RAG）对合同进行深度审计：\n1. 审查条款是否符合最新《民法典》及行业法规\n2. 识别潜在的法律风险点（赔偿责任、解约条款等）\n3. 评估整体风险等级（高/中/低）",
            userPrompt:
              "合同类型：{{合同审查输入.type}}\n合同内容：{{合同审查输入.text}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "审计报告与建议",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              '你是一个法务顾问。根据审计结果生成最终报告：\n\n- 如果风险等级为"高"，提供具体的风险缓释措施和谈判话术，并生成"人工法务介入提醒"。\n- 生成一份完整的审计报告，包含修改建议。\n\n输出格式：Markdown',
            userPrompt: "审计结果：{{智能风险审计.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 7. 产品部门 (Product)
  // ============================================================
  {
    name: "多 Agent 协同 PRD 进化器",
    description:
      "由“产品经理 + 技术评审 + 交互专家”构成的虚拟委员会，对产品构思进行多维度的专业打磨",
    category: "product",
    tags: ["Multi-Agent", "闭环打磨", "发布级质量"],
    metadata: {
      estimatedTime: "5-8分钟",
      difficulty: "advanced",
      useCases: ["产品设计", "需求分析", "多角色协作"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "产品构思输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "idea",
                name: "需求概要",
                value: "",
                height: 150,
                placeholder: "描述你的产品构思...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "PRD 初稿生成",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深PM。请根据构思生成包含功能矩阵、用户流和逻辑细节的初版PRD。",
            userPrompt: "构思：{{产品构思输入.idea}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "技术与体验联合评审",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你代表一个评审委员会（包含架构师和UX专家）。请对PRD进行多维评审：\n1. 架构师视角：评估技术难度、性能瓶颈\n2. UX专家视角：评估交互体验、认知负担\n3. 汇总修改建议",
            userPrompt: "PRD草稿：{{PRD 初稿生成.result}}",
          },
        },
        {
          id: "process-3",
          type: "PROCESS",
          name: "PRD 终稿打磨",
          position: { x: 1000, y: 300 },
          config: {
            systemPrompt:
              "你是一个产品总监。请结合评审意见优化PRD，输出标准格式的最终文档。",
            userPrompt:
              "原稿：{{PRD 初稿生成.result}}\n评审意见：{{技术与体验联合评审.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
        { id: "e3", source: "process-2", target: "process-3" },
      ],
    },
  },

  {
    name: "产品发布全渠道宣发 Agent",
    description:
      "一键生成技术 Release Note、市场推广文案及内部培训话术，实现产研销联动",
    category: "product",
    tags: ["发布管理", "产研联动", "营销协同"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["产品发布", "营销推广", "内容创作"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "功能特性输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "features", name: "功能列表", value: "", height: 150 },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "全渠道文案生成",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个全能营销专家。请为新版本功能生成全套宣发文案：\n1. 技术 Release Note（严谨、包含 Breaking Changes）\n2. 市场宣发文案（公众号/小红书风格，吸引人）\n3. 内部销售培训话术（一句话卖点 + Q&A）\n\n请输出JSON：{"release_note": "...", "marketing_copy": "...", "sales_training": "..."}',
            userPrompt: "功能列表：{{功能特性输入.features}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "视觉创意与资源包",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个创意总监。请完成：\n1. 根据文案主题设计海报的 Prompt（提示词）\n2. 汇总前面的所有文案和创意信息，生成最终的发布资源包预览",
            userPrompt: "文案信息：{{全渠道文案生成.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 8. 财务部门 (Finance)
  // ============================================================
  {
    name: "深度财务分析与风险雷达",
    description: "集成报表自动计算、趋势建模、异常判定及策略建议的闭环财务系统",
    category: "finance",
    tags: ["CFO助手", "异常检测", "数据驱动"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["财务分析", "风险预警", "决策支持"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "财务报表输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "财务报表",
                value: "",
                height: 200,
                placeholder:
                  "请上传本月损益表、现金流量表及资产负债表 (Excel/CSV)",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "财务指标计算与预警",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个CFO。请执行以下分析：\n1. 计算关键财务指标（毛利率、净利率、烧钱率等）\n2. 识别异常波动和高风险项（如现金流紧张）\n3. 标记风险等级（High/Medium/Low）",
            userPrompt: "财务报表：{{财务报表输入.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "决策月报与建议",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个顶尖商业顾问。根据财务分析结果：\n1. 针对高风险项给出降本增效建议\n2. 生成正式的经营决策月报\n\n输出格式：Markdown",
            userPrompt: "分析结果：{{财务指标计算与预警.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 9. 销售部门 (Sales)
  // ============================================================
  {
    name: "销售线索专家级评估 Agent",
    description: "采用 BANT 模型对线索进行科学评分，并自动生成针对性的转化话术",
    category: "sales",
    tags: ["BANT模型", "话术生成", "CRM集成"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["线索评估", "销售赋能", "话术生成"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "线索信息输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "info",
                name: "客户沟通原始记录",
                value: "",
                height: 150,
                placeholder: "记录客户的需求、预算、决策链等描述...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "BANT 评分与话术生成",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个金牌销售专家。请对客户线索进行深度分析：\n1. 基于BANT模型（预算、权限、需求、时间）进行评分\n2. 识别评估中的薄弱项\n3. 生成点击客户痛点的定制化话术\n\n请输出JSON：{"bant_score": {}, "weaknesses": [], "pitch_script": "..."}',
            userPrompt: "线索信息：{{线索信息输入.info}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "销售战术手册生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请整理生成一份销售战术手册，包含线索评分、成交概率、下一步行动建议及完整话术。",
            userPrompt: "分析结果：{{BANT 评分与话术生成.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  {
    name: "商务邮件智能秘书 Agent",
    description:
      "不仅是回复，更能识别意图、检索历史话术库、自动拟定草稿并进行语气礼貌度审计",
    category: "sales",
    tags: ["邮件助手", "意图识别", "商务礼仪"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "beginner",
      useCases: ["邮件回复", "商务沟通", "意图识别"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "邮件内容输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "body", name: "收到的邮件内容", value: "", height: 200 },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "智能意图回复生成",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个商务邮件秘书。请执行以下步骤：\n1. 识别邮件意图（询价、投诉、合作等）\n2. 检索并调用相关知识库（报价表、售后SOP）\n3. 撰写专业、礼貌的回复草稿\n4. 自动优化语气\n\n请输出JSON：{"intent": "...", "draft_reply": "..."}',
            userPrompt: "邮件内容：{{邮件内容输入.body}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "邮件终稿输出",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "请输出最终的邮件内容，确保格式标准，可直接发送。",
            userPrompt: "草稿：{{智能意图回复生成.draft_reply}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 10. 运营部门 (Operations)
  // ============================================================
  {
    name: "智能客服全自动化闭环 Agent",
    description:
      "集成多分类意图识别、ERP Mock 数据联动、RAG回复生成及质量审计回流的客服系统",
    category: "operation",
    tags: ["客服 Agent", "Mock集成", "自动化服务"],
    metadata: {
      estimatedTime: "5-8分钟",
      difficulty: "advanced",
      useCases: ["智能客服", "自动回复", "服务质量"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-chat",
          type: "INPUT",
          name: "客户进线咨询",
          position: { x: 50, y: 300 },
          config: {
            fields: [
              {
                id: "msg",
                name: "原始咨询文本",
                value: "",
                height: 100,
                placeholder: "客户说了什么...",
              },
            ],
          },
        },
        {
          id: "process-intent",
          type: "PROCESS",
          name: "意图识别与数据模拟",
          position: { x: 300, y: 300 },
          config: {
            systemPrompt:
              '你是智能客服中枢。请识别客户意图（物流/售后/其他）。如果是物流查询，请模拟生成 ERP 订单状态（如"已发货 SN001"）；如果是售后，请提取退款金额。',
            userPrompt: "咨询内容：{{客户进线咨询.msg}}",
          },
        },
        {
          id: "process-reply",
          type: "PROCESS",
          name: "RAG 智能回复生成",
          position: { x: 600, y: 300 },
          config: {
            systemPrompt:
              "基于客户意图和模拟的业务数据，结合知识库生成专业回复。",
            userPrompt:
              "意图分析：{{意图识别与数据模拟.result}}\n原咨询：{{客户进线咨询.msg}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-final",
          type: "PROCESS",
          name: "回复审计与输出",
          position: { x: 900, y: 300 },
          config: {
            systemPrompt:
              "审查回复内容是否礼貌、准确。如果不合格请重写，否则按原样输出。",
            userPrompt: "待审回复：{{RAG 智能回复生成.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-chat", target: "process-intent" },
        { id: "e2", source: "process-intent", target: "process-reply" },
        { id: "e3", source: "process-reply", target: "process-final" },
      ],
    },
  },

  // ============================================================
  // 11. 研发部门 (R&D)
  // ============================================================
  {
    name: "代码安全与性能双重审计 Agent",
    description:
      "采用“扫描 -> 漏洞判定 -> 性能打分 -> 自动优化”的全链路技术保障体系",
    category: "tech",
    tags: ["研发提效", "安全审计", "自动优化"],
    metadata: {
      estimatedTime: "5-8分钟",
      difficulty: "advanced",
      useCases: ["代码审计", "安全检测", "性能优化"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-code",
          type: "INPUT",
          name: "源代码库片段",
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: "code", name: "Code Snippet", value: "", height: 250 },
            ],
          },
        },
        {
          id: "process-sec",
          type: "PROCESS",
          name: "安全漏洞扫描器",
          position: { x: 300, y: 150 },
          config: {
            systemPrompt:
              "你是一个资深安全工程师。请扫描代码中的注入风险和安全漏洞。",
            userPrompt: "待扫代码：{{源代码库片段.code}}",
          },
        },
        {
          id: "process-perf",
          type: "PROCESS",
          name: "性能瓶颈分析仪",
          position: { x: 300, y: 450 },
          config: {
            systemPrompt:
              "你是一个架构师。分析代码的时间/空间复杂度及性能瓶颈。",
            userPrompt: "待析代码：{{源代码库片段.code}}",
          },
        },
        {
          id: "process-fix",
          type: "PROCESS",
          name: "综合审计与代码优化",
          position: { x: 600, y: 300 },
          config: {
            systemPrompt:
              "结合安全和性能审计结果，输出优化后的重构代码及完整的技术审计报告。",
            userPrompt:
              "安全审计：{{安全漏洞扫描器.result}}\n性能分析：{{性能瓶颈分析仪.result}}\n源代码：{{源代码库片段.code}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-code", target: "process-sec" },
        { id: "e2", source: "input-code", target: "process-perf" },
        { id: "e3", source: "process-sec", target: "process-fix" },
        { id: "e4", source: "process-perf", target: "process-fix" },
      ],
    },
  },

  // ============================================================
  // 12. 生产制造 (Manufacturing)
  // ============================================================
  {
    name: "生产线异常诊断与快速响应系统",
    description:
      "集成实时数据分析、专家级故障诊断及自动通知闭环的工厂管理 Agent",
    category: "production",
    tags: ["工业4.0", "故障诊断", "实时响应"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["生产监控", "故障诊断", "应急响应"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "生产数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "data",
                name: "实时生产数据",
                value: "",
                height: 150,
                placeholder: "粘贴设备稼动率、报警明细等数据...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "智能故障诊断",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深生产主管。请分析生产数据：\n1. 判定异常原因（原材料/人为/设备）\n2. 评估严重等级（停机/波动/正常）\n3. 生成具体的对应措施（包括SOP步骤）",
            userPrompt: "生产数据：{{生产数据输入.data}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "调度指令与简报",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个生产调度中心。根据诊断结果：\n1. 如果是严重故障，生成红色警报推送内容\n2. 生成当日生产状况简报\n\n输出格式：Markdown",
            userPrompt: "诊断结果：{{智能故障诊断.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 13. 供应链/采购 (Procurement)
  // ============================================================
  {
    name: "供应商合规与表现智能雷达",
    description: "深度穿透供应商信息，自动进行合规扫描、财务稳健性评估及评分",
    category: "procurement",
    tags: ["风控", "供应商管理", "合规"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["供应商管理", "合规评估", "风险预警"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "供应商信息输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "name", name: "供应商全称", value: "" },
              { id: "bid", name: "报价明细", value: "", height: 100 },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "合规与风险评估",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个资深采购专家。请进行全方位评估：\n1. 模拟全网扫描（检查法律诉讼、行政处罚）\n2. 结合报价进行性价比评分\n3. 判断是否触犯黑名单规则\n\n请输出JSON：{"risk_score": 85, "scan_result": "...", "status": "Pass/Reject"}',
            userPrompt:
              "供应商：{{供应商信息输入.name}}\n报价：{{供应商信息输入.bid}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "准入建议报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "根据评估结果，生成正式的供应商准入评估建议书（包含风险提示和决策建议）。",
            userPrompt: "评估详情：{{合规与风险评估.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 14. 新媒体 (New Media)
  // ============================================================
  {
    name: "全网趋势捕捉与多端爆文引擎",
    description:
      "识别最新热点，自动适配不同平台调性，并一键生成高审美配图提示词",
    category: "operation",
    tags: ["新媒体", "流量密码", "AI扩文"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["新媒体运营", "内容创作", "多平台发布"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "选题方向输入",
          position: { x: 100, y: 300 },
          config: { fields: [{ id: "topic", name: "选题方向", value: "" }] },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多平台文案生成",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个新媒体运营专家。请围绕选题生成多平台文案：\n1. 核心金句（心理共鸣）\n2. 小红书种草文案（Emoji、亲和力）\n3. 公众号深度文稿（逻辑严密）\n\n请输出JSON格式。",
            userPrompt: "选题：{{选题方向输入.topic}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "视觉与发布包",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个视觉设计总监。根据文案主题：\n1. 生成高审美的封面图 Prompt\n2. 汇总所有文案和视觉信息，生成发布包",
            userPrompt: "文案内容：{{多平台文案生成.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 15. 创意设计 (Design)
  // ============================================================
  {
    name: "视觉创意进化与审美审计 Agent",
    description:
      "深度拆解设计 Brief，通过“生成 -> 审美评价 -> 自动微调”循环实现高审美产出",
    category: "ai-processing",
    tags: ["AIGC", "设计赋能", "审美对标"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["视觉设计", "创意生成", "审美评估"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "创意 Brief 输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "desc",
                name: "视觉风格与需求描述",
                value: "",
                height: 100,
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "视觉创意与生成",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个AI艺术专家。请执行：\n1. 拆解Brief中的视觉元素（构图、色彩、光影）\n2. 生成高质量的绘图 Prompt\n3. 模拟生成过程并描述预期效果",
            userPrompt: "需求描述：{{创意 Brief 输入.desc}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "审美审计与定稿",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个顶级艺术总监。请对生成的创意方案进行审计：\n1. 评价构图张力、色彩平衡\n2. 提出优化建议\n3. 输出最终设计方案说明书",
            userPrompt: "创意方案：{{视觉创意与生成.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 16. 行政部门 (Admin)
  // ============================================================
  {
    name: "企业级会议决策追踪系统",
    description:
      "不只是纪要生成，更是对决策一致性判定及待办任务自动分发的行政中枢",
    category: "admin",
    tags: ["行政提效", "决策追踪", "自动分发"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["会议纪要", "决策跟踪", "任务管理"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "会议内容输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "会议录音或文字",
                value: "",
                height: 200,
                placeholder: "上传会议录音转写的文字...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "会议要点与冲突审计",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个高级会议秘书。请执行：\n1. 提取核心议题、共识和待办\n2. 检查决策是否与历史记录冲突\n3. 生成最终纪要",
            userPrompt: "会议记录：{{会议内容输入.content}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "行政决策白皮书",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "请整理输出正式的行政决策白皮书，包含决策风险提示。",
            userPrompt: "分析结果：{{会议要点与冲突审计.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  {
    name: "团队周报智能聚合与效能分析 Agent",
    description: "从 Jira/Git 等多源数据中聚合周报，并自动分析团队效能瓶颈",
    category: "admin",
    tags: ["效能分析", "自动周报", "团队管理"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["周报汇总", "效能分析", "团队管理"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "周报数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "text",
                name: "成员周报汇总",
                value: "",
                height: 200,
                placeholder: "粘贴各成员提交的周报内容...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "效能诊断与风险分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个敏捷教练。请执行以下分析：\n1. 模拟同步Jira数据（假设有Completed/Delayed数据）\n2. 结合周报内容分析团队瓶颈\n3. 识别是否需要发出高风险预警\n\n请输出JSON：{"jira_mock": {}, "bottlenecks": [], "risk_alert": "..."}',
            userPrompt: "周报内容：{{周报数据输入.text}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "周报汇总与通知",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请生成包含进度同步、风险提示和下周计划的完整团队周报。如果有高风险预警，请在开头醒目提示。",
            userPrompt: "诊断结果：{{效能诊断与风险分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 17. 人力资源 (HR)
  // ============================================================
  {
    name: "全流程智能招聘 Agent",
    description: "从简历筛选到定制化面试题生成的一站式人才甄选系统",
    category: "hr",
    tags: ["招聘自动化", "简历对标", "精准人才洞察"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["招聘筛选", "人才匹配", "面试准备"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "招聘需求与简历",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "jd",
                name: "岗位JD",
                value: "",
                height: 150,
                placeholder: "粘贴岗位描述...",
              },
              {
                id: "resumes",
                name: "简历列表",
                value: "",
                height: 150,
                placeholder: "粘贴候选人简历内容...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "简历智能初筛",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深招聘专家。请根据JD批量筛选简历：\n1. 评估每份简历的匹配度（0-100分）\n2. 提取每位候选人的核心优势与不足\n3. 筛选出Top 3候选人",
            userPrompt:
              "JD：{{招聘需求与简历.jd}}\n简历列表：{{招聘需求与简历.resumes}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "面试题生成与报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "针对筛选出的Top候选人，生成定制化的行为面试题（STAR原则）及完整的评估报告。",
            userPrompt: "初筛结果：{{简历智能初筛.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  {
    name: "新员工入职全流程导航 Agent",
    description: "自动化生成入职指引、分配资产并通知相关部门，打造丝滑入职体验",
    category: "hr",
    tags: ["入职", "员工体验", "流程自动化"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "beginner",
      useCases: ["员工入职", "流程自动化", "体验优化"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "新员工信息",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "role", name: "岗位", value: "" },
              { id: "name", name: "姓名", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "入职资源规划",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个HRBP。请为新员工生成：\n1. 30/60/90天融入计划\n2. 根据岗位自动匹配IT资产（设计岗配MacBook Pro，其他配Air）\n3. 生成给IT部门的资产准备通知",
            userPrompt: "员工信息：{{新员工信息.name}} - {{新员工信息.role}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "入职指引手册",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请生成一份温馨的入职指引手册，包含欢迎信、融入计划及办公指引。",
            userPrompt: "规划信息：{{入职资源规划.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 新增：10 个高价值垂直领域 Agent
  // ============================================================

  // 22. 法务：IP 侵权监测
  {
    name: "知识产权 (IP) 侵权监测与维权 Agent",
    description:
      "自动抓取全网图片/文案，利用多模态模型比对确权，自动生成律师函",
    category: "legal",
    tags: ["IP保护", "侵权监测", "维权自动化"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["IP保护", "侵权监测", "维权支持"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "侵权监测信息",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "url", name: "作品链接", value: "" },
              { id: "owner", name: "权利人", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "全网比对与判定",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个IP维权专家。请执行：\n1. 模拟全网搜索相似图片\n2. 比对相似度并判定是否侵权\n3. 如果侵权，提取证据链",
            userPrompt:
              "作品信息：{{侵权监测信息.url}}\n权利人：{{侵权监测信息.owner}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "维权文书生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "根据侵权判定结果，生成正式的律师函和证据包。",
            userPrompt: "判定结果：{{全网比对与判定.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 23. 财务：发票稽核
  {
    name: "发票智能稽核与税务风控 Agent",
    description: "OCR 识别发票，自动联网验真，并根据税法库检查抵扣合规性",
    category: "finance",
    tags: ["税务风控", "OCR", "发票验真"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["发票验真", "税务合规", "风控管理"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "发票图片输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "image",
                name: "发票图片",
                value: "",
                height: 150,
                placeholder: "上传发票图片...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "发票识别与验真",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个税务稽核机器人。请执行：\n1. OCR识别发票关键信息（代码、号码、金额）\n2. 模拟调用国税局接口进行验真\n3. 检查抵扣合规性",
            userPrompt: "发票图片：{{发票图片输入.image}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "稽核报告生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "请生成正式的稽核报告，说明验真结果和合规性判定。",
            userPrompt: "稽核结果：{{发票识别与验真.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 24. 研发：DevOps 自愈
  {
    name: "自动化 DevOps 故障自愈 Agent",
    description:
      "监控日志报警，自动分析堆栈，匹配知识库中的解决方案，尝试自动修复",
    category: "tech",
    tags: ["DevOps", "故障自愈", "SRE"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "advanced",
      useCases: ["故障诊断", "自动修复", "运维自动化"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "报警日志输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "log",
                name: "错误堆栈",
                value: "",
                height: 200,
                placeholder: "粘贴系统报错日志...",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "故障根因分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个SRE专家。请执行：\n1. 分析日志堆栈，定位根因（代码Bug/环境问题）\n2. 匹配SRE知识库中的标准修复方案",
            userPrompt: "日志信息：{{报警日志输入.log}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "自愈执行与通知",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请模拟执行自愈脚本（如重启Pod、扩容等）并生成修复结果通知（可直接发送至钉钉/飞书）。",
            userPrompt: "分析结果：{{故障根因分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 25. 市场：竞品反向工程
  {
    name: "竞品广告投放策略反向工程 Agent",
    description: "分析竞品广告素材，反推其投放人群、卖点及预算策略",
    category: "marketing",
    tags: ["竞品分析", "反向工程", "投放策略"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["竞品分析", "投放策略", "市场洞察"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "竞品素材输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "竞品广告素材",
                value: "",
                height: 150,
                placeholder: "上传竞品广告素材或截图",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "策略解构与推演",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个营销专家。请执行：\n1. 分析广告素材的受众画像、核心利益点（USP）\n2. 反推其可能的投放渠道和预算量级",
            userPrompt: "素材信息：{{竞品素材输入.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "反制策略报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请基于竞品分析结果，生成我方的应对策略建议。输出格式：Markdown",
            userPrompt: "分析详情：{{策略解构与推演.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 26. 销售：KA 背调
  {
    name: "大客户 (KA) 深度背景调查 Agent",
    description: "聚合工商信息、新闻舆情、年报数据，生成 360 度客户画像及谈资",
    category: "sales",
    tags: ["KA销售", "客户背调", "商机挖掘"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["客户背调", "商机挖掘", "销售赋能"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "客户背景输入",
          position: { x: 100, y: 300 },
          config: { fields: [{ id: "name", name: "企业全称", value: "" }] },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "客户深度洞察",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深大客户经理。请执行：\n1. 模拟聚合工商数据与近期要闻\n2. 分析该企业的战略痛点和潜在采购需求信号\n3. 生成 360 度客户画像",
            userPrompt: "客户名称：{{客户背景输入.name}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "销售作战档案",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请基于洞察结果生成完整的销售作战档案，包含组织架构分析及针对性的切入谈资建议。",
            userPrompt: "洞察结果：{{客户深度洞察.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 27. HR：离职预测
  {
    name: "员工离职预测与关怀 Agent",
    description:
      "分析员工考勤、绩效及行为数据（脱敏），识别离职风险，生成访谈话术",
    category: "hr",
    tags: ["人才保留", "风险预测", "员工关怀"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["离职预测", "人才保留", "员工关怀"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "员工行为数据",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "员工数据",
                value: "",
                height: 200,
                placeholder: "导入脱敏后的员工打分、考勤及绩效记录",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "风险预测与预警",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个HR专家。请执行：\n1. 特征分析（缺勤率变化、绩效趋势）\n2. 预测离职概率等级（高/中/低）",
            userPrompt: "行为数据：{{员工行为数据.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "关怀策略与提纲",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "如果风险为高，请生成针对性的挽留话术或关怀谈话提纲。",
            userPrompt: "预测结果：{{风险预测与预警.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 28. 供应链：智能补货
  {
    name: "库存智能补货与调拨 Agent",
    description:
      "基于历史销量预测未来需求，结合当前库存，自动生成补货单或调拨建议",
    category: "procurement",
    tags: ["供应链", "库存优化", "自动补货"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["库存管理", "需求预测", "智能补货"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "销量与库存数据",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "库存销量数据",
                value: "",
                height: 200,
                placeholder: "导入过去 90 天销量及当前库存",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "需求预测与补货计算",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个供应链管理专家。请执行：\n1. 预测未来 30 天 SKU 销量\n2. 计算建议补货量 = max(0, 预测量 - 当前库存)",
            userPrompt: "历史数据：{{销量与库存数据.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "补货建议单生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "请整理输出 SKU 补货建议列表，按紧急程度排序。",
            userPrompt: "计算结果：{{需求预测与补货计算.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 29. 行政：差旅优化
  {
    name: "企业差旅合规与成本优化 Agent",
    description: "比对机票/酒店价格与差旅标准，推荐最优组合，识别违规行程",
    category: "admin",
    tags: ["差旅管理", "成本控制", "合规"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "beginner",
      useCases: ["差旅管理", "成本控制", "合规检查"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "行程需求输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "dest", name: "目的地", value: "" },
              { id: "date", name: "日期", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "比价与合规校验",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个行政助理。请执行：\n1. 模拟聚合实时机酒价格\n2. 对比差旅标准，筛选合规选项",
            userPrompt: "行程需求：{{行程需求输入.dest}} {{行程需求输入.date}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "最优方案推荐",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "请整理输出前 3 个性价比最高且合规的预订方案。",
            userPrompt: "筛选详情：{{比价与合规校验.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 30. 客服：危机公关
  {
    name: "投诉危机公关处理 Agent",
    description: "针对重大客诉（如社媒曝光），生成危机公关声明及全员应对口径",
    category: "operation",
    tags: ["危机公关", "舆情应对", "SOP"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["危机公关", "投诉处理", "舆情应对"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "危机事件说明",
          position: { x: 100, y: 300 },
          config: {
            fields: [{ id: "desc", name: "事件经过", value: "", height: 200 }],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "严重程度评估",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个危机公关专家。请执行：\n1. 评估事件级别（P0-P4）\n2. 识别舆情风险点",
            userPrompt: "事件详情：{{危机事件说明.desc}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "应对口径与声明",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "请基于 5S 原则生成对外声明、QA 话术及内部行动指南。",
            userPrompt: "评估结果：{{严重程度评估.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 31. 运营：私域操盘
  {
    name: "私域社群活跃度操盘 Agent",
    description: "分析群聊话题，自动生成每日话题、互动游戏及种草文案",
    category: "operation",
    tags: ["私域运营", "社群活跃", "自动化"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["私域运营", "社群管理", "用户活跃"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "群聊记录导入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "群聊记录",
                value: "",
                height: 200,
                placeholder: "上传最近 3 天的群聊记录文本",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "互动设计与话题聚类",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个社群操盘手。请执行：\n1. 分析用户利息话题点并聚类\n2. 设计配套的轻量级互动游戏或话题接龙",
            userPrompt: "记录文本：{{群聊记录导入.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "今日运营 SOP",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "生成包含分时段话术、种草文案及活动 SOP 的完整运营手册。",
            userPrompt: "设计详情：{{互动设计与话题聚类.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 新增：第 32-41 号企业级 AES 标准模板
  // ============================================================

  // 32. 法务：隐私合规与 GDPR 审计
  {
    name: "隐私合规与 GDPR 审计 Agent",
    description:
      "自动扫描隐私协议、Cookie 政策等文档，对比 GDPR/CCPA 法规库，识别合规缺口",
    category: "legal",
    tags: ["隐私保护", "GDPR", "合规审计"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "advanced",
      useCases: ["隐私保护", "GDPR合规", "法规审计"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "隐私政策输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "text", name: "隐私协议文本", value: "", height: 250 },
              { id: "region", name: "适用地区", value: "EU" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "GDPR 条款扫描与检索",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个隐私专家。请执行：\n1. 提取核心条款（收集、存储、权利）\n2. 检索并匹配 GDPR/CCPA 法规要求",
            userPrompt:
              "协议文本：{{隐私政策输入.text}}\n地区：{{隐私政策输入.region}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "合规审计与建议报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "识别所有合规缺口，评估风险等级，并为每个缺口生成具体的条款修改建议。包含 DPO 警报逻辑。",
            userPrompt: "扫描结果：{{GDPR 条款扫描与检索.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 33. 市场：品牌联名策划
  {
    name: "品牌联名 (Co-branding) 策划 Agent",
    description:
      "基于双方品牌调性分析，自动生成联名创意方案、营销 SOP 及风险预警",
    category: "marketing",
    tags: ["品牌联名", "跨界营销", "创意策划"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["品牌联名", "跨界营销", "创意策划"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "联名品牌信息",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "brand_a", name: "我方品牌", value: "" },
              { id: "brand_b", name: "合作品牌", value: "" },
              { id: "goal", name: "目标", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "品牌调性与创意矩阵",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个创意总监。请执行：\n1. 分析双方品牌调性契合度\n2. 生成 5 个涵盖产品、包装、事件的联名创意方向",
            userPrompt:
              "品牌 A：{{联名品牌信息.brand_a}}\n品牌 B：{{联名品牌信息.brand_b}}\n目标：{{联名品牌信息.goal}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "风险、SOP 与视觉概念",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请执行：\n1. 评估潜在品牌风险\n2. 生成执行 SOP 及视觉描述关键词（用于后续出图）\n3. 整理输出完整策划提案",
            userPrompt: "创意方案：{{品牌调性与创意矩阵.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 34. 研发：自动化测试用例生成
  {
    name: "自动化测试用例生成 Agent",
    description:
      "解析 PRD/API 文档，自动生成测试用例矩阵及 Playwright/Cypress 自动化脚本",
    category: "tech",
    tags: ["测试自动化", "QA", "E2E测试"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "advanced",
      useCases: ["测试自动化", "用例生成", "质量保障"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "需求/API 文档",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "doc", name: "文档内容", value: "", height: 250 },
              { id: "type", name: "类型", value: "UI" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "功能提取与用例矩阵",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个资深 QA。请执行：\n1. 提取可测试点、边界条件及异常场景\n2. 生成结构化测试用例矩阵（前置、步骤、预期）",
            userPrompt: "文档内容：{{需求/API 文档.doc}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "自动化脚本生成",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "根据用户选择的类型（UI->Playwright/Cypress, API->Jest/Supertest），将用例矩阵转换为自动化测试代码。",
            userPrompt:
              "用例矩阵：{{功能提取与用例矩阵.result}}\n类型：{{需求/API 文档.type}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 35. 销售：招投标书智能撰写
  {
    name: "招投标书 (RFP) 智能撰写 Agent",
    description: "解析招标文件关键要求，自动匹配历史中标案例，生成高分标书草稿",
    category: "sales",
    tags: ["投标", "RFP", "标书生成"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["投标管理", "标书撰写", "中标优化"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "招标文件输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "rfp", name: "招标文件内容", value: "", height: 250 },
              { id: "project", name: "项目名称", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "要求解析与案例匹配",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "请执行：\n1. 提取资质、评分、技术及商务条目\n2. 检索历史中标库，匹配最优参考方案",
            userPrompt:
              "招标文件：{{招标文件输入.rfp}}\n项目：{{招标文件输入.project}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "标书生成与审核",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请执行：\n1. 撰写完整的技术及商务方案章节\n2. 进行内部合规性审核并输出最终标书草稿",
            userPrompt: "解析与参考：{{要求解析与案例匹配.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 36. 财务/战略：投融资尽职调查
  {
    name: "投融资项目尽职调查 (DD) Agent",
    description:
      "聚合工商、舆情、财报数据，自动进行红旗风险扫描，生成投资建议报告",
    category: "finance",
    tags: ["尽职调查", "投资分析", "风险扫描"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "advanced",
      useCases: ["尽职调查", "投资分析", "风险评估"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "被投项目信息",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "name", name: "企业名称", value: "" },
              { id: "amount", name: "拟投金额", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "财务与风险全扫描",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "请执行：\n1. 模拟聚合多维财务、工商及法律数据\n2. 扫描财务健康度、法律诉讼红旗风险",
            userPrompt: "企业：{{被投项目信息.name}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "估值与投资决赛",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "请执行：\n1. 推演合理估值区间\n2. 给出最终投资建议（Proceed/Red Flag）并生成 DD 报告",
            userPrompt:
              "扫描结果：{{财务与风险全扫描.result}}\n拟投金额：{{被投项目信息.amount}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 37. HR/培训：企业内训课程体系构建
  {
    name: "企业内训课程体系构建 Agent",
    description:
      "基于 ADDIE 模型，根据岗位胜任力模型自动设计培训大纲、课件框架及考核方案",
    category: "hr",
    tags: ["培训体系", "ADDIE", "课程设计"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["培训体系", "课程设计", "人才发展"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "培训需求输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "role", name: "目标岗位", value: "" },
              { id: "skills", name: "缺口技能", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "体系设计与开发",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个培训与发展专家。请执行：\n1. 任务分析与课程大纲设计\n2. 编写核心课件框架及内训师手册",
            userPrompt:
              "岗位：{{培训需求输入.role}}\n技能：{{培训需求输入.skills}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "评估方案与报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "设计柯氏四级评估方案，并整理输出完整的培训体系方案。",
            userPrompt: "设计结果：{{体系设计与开发.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 38. 电商/运营：爆品选品与定价策略
  {
    name: "爆品选品与定价策略 Agent",
    description:
      "分析市场趋势、竞品数据，挖掘蓝海品类，并生成科学的定价模型建议",
    category: "operation",
    tags: ["电商选品", "定价策略", "蓝海挖掘"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["电商选品", "定价策略", "市场分析"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "品类信息输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "category", name: "目标品类", value: "" },
              { id: "budget", name: "采购预算", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "蓝海机会与定价模型",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个电商选品专家。请执行：\n1. 模拟分析市场趋势、竞争强度与均价\n2. 识别蓝海机会，并设计定价模型（成本加成/价值定价）",
            userPrompt:
              "品类：{{品类信息输入.category}}\n预算：{{品类信息输入.budget}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "选品策略报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "推荐适合的供应商类型、采购策略，并整理输出完整的选品策略报告。",
            userPrompt: "分析结果：{{蓝海机会与定价模型.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 39. 物流/采购：跨境物流路径规划
  {
    name: "跨境物流路径规划与成本优化 Agent",
    description:
      "比选空运/海运/铁路/多式联运方案，综合时效、成本、风险给出最优路径",
    category: "procurement",
    tags: ["跨境物流", "路径优化", "成本控制"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["跨境物流", "路径优化", "成本控制"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "货运需求输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "origin", name: "起运地", value: "" },
              { id: "dest", name: "目的地", value: "" },
              { id: "weight", name: "重量(kg)", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多式联运路径比选",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个跨境物流专家。请执行：\n1. 模拟聚合空/海/铁最新费率和时效\n2. 综合评估各方案成本、风险及交付可靠性",
            userPrompt:
              "需求详情：{{货运需求输入.origin}} to {{货运需求输入.dest}}, {{货运需求输入.weight}}kg",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "最优路径建议方案",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "根据评估结果，推荐最优路径组合，并生成完整的物流方案书。",
            userPrompt: "比选方案：{{多式联运路径比选.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 40. 安环/生产：EHS 安全巡检智能分析
  {
    name: "企业 EHS 安全巡检智能分析 Agent",
    description:
      "通过多模态识别现场照片中的安全隐患，自动生成整改工单并跟踪闭环",
    category: "production",
    tags: ["EHS", "安全巡检", "隐患识别"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["安全巡检", "隐患识别", "EHS管理"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "巡检现场照片",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "巡检照片",
                value: "",
                height: 150,
                placeholder: "上传多张车间/现场巡检照片",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多模态隐患识别分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个 EHS 专家。请批量分析图片：\n1. 识别消防、劳保、危化品等安全隐患\n2. 自动判定隐患等级（重大/较大/常规）",
            userPrompt: "巡检图片：{{巡检现场照片.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "整改工单与巡检报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "根据隐患分析，生成整改工单（责任人、措施、期限）并输出完整 EHS 巡检月报。",
            userPrompt: "解析详情：{{多模态隐患识别分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 41. 总办/行政：CEO 每日决策辅助驾驶舱
  {
    name: "CEO 每日决策辅助驾驶舱 Agent",
    description:
      "聚合经营数据、行业新闻、内部日程，每日自动生成 CEO 专属决策简报",
    category: "admin",
    tags: ["CEO助手", "决策支持", "信息聚合"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["决策支持", "信息聚合", "CEO助手"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "决策上下文输入",
          position: { x: 100, y: 300 },
          config: { fields: [{ id: "focus", name: "今日关注点", value: "" }] },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多维数据聚合与分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个 CEO 的首席参谋。请同步分析：\n1. 实时经营 KPI（营收、订单、流失）\n2. 行业新闻动态与竞争情报\n3. 今日核心会议日程与风险提示",
            userPrompt: "关注重点：{{决策上下文输入.focus}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "CEO 专属决策简报",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "生成简洁、直击要害的每日简报。如果有紧急事项，请在最开始显著推送警报。",
            userPrompt: "分析深度建议：{{多维数据聚合与分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 新增：第 42-51 号企业级 AES 标准模板
  // ============================================================

  // 42. 市场：数字营销 ROI 归因分析 Agent
  {
    name: "数字营销 ROI 归因分析 Agent",
    description:
      "整合多渠道投放数据，采用多触点归因模型分析转化路径，输出预算优化建议",
    category: "marketing",
    tags: ["营销归因", "ROI分析", "预算优化", "数据驱动"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["营销归因", "ROI分析", "预算优化"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "投放数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "campaign", name: "渠道消耗数据", value: "" },
              { id: "conversion", name: "转化数据", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "全链路归因建模",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个数字营销分析专家。请执行：\n1. 模拟归因模型（首次/末次/线性等）计算各渠道贡献\n2. 计算 CPA、ROAS 及 LTV/CAC 效率指标",
            userPrompt:
              "消耗：{{投放数据输入.campaign}}\n转化：{{投放数据输入.conversion}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "ROI 分析与优化报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "基于 ROI 效率，识别高/低效渠道，提供预算再分配建议并生成完整报告。",
            userPrompt: "归因结果：{{全链路归因建模.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 43. 销售：销售预测与 Pipeline 健康度诊断 Agent
  {
    name: "销售预测与 Pipeline 健康度诊断 Agent",
    description:
      "基于历史成交数据和当前商机阶段，预测季度收入并诊断 Pipeline 风险",
    category: "sales",
    tags: ["销售预测", "Pipeline管理", "收入预测", "CRM"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["销售预测", "Pipeline管理", "收入分析"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "CRM 数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "opportunities", name: "商机列表", value: "" },
              { id: "target", name: "季度目标", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "Pipeline 建模与诊断",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个销售运营专家。请执行：\n1. 商机阶段建模与收入预测（保守/基准/乐观）\n2. Pipeline 健康度诊断（漏斗形态、周期、僵尸商机）",
            userPrompt:
              "商机：{{CRM 数据输入.opportunities}}\n目标：{{CRM 数据输入.target}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "改进行动建议报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "针对风险项生成改进行动建议（加速推进/清理/补入），并输出销售预测诊断报告。",
            userPrompt: "分析结论：{{Pipeline 建模与诊断.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 44. 人力：人才盘点与继任计划 Agent
  {
    name: "人才盘点与继任计划 Agent",
    description:
      "基于九宫格模型进行人才盘点，识别高潜人才并生成关键岗位继任计划",
    category: "hr",
    tags: ["人才盘点", "九宫格", "继任计划", "人才发展"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["人才盘点", "继任规划", "组织发展"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "人才数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "employee_data", name: "员工绩效与潜力信息", value: "" },
              { id: "key_positions", name: "关键岗位清单", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "人才盘点与 9 宫格",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个人才管理专家。请执行：\n1. 建立 9 宫格模型并对人才进行盘点分布\n2. 识别高潜人才 (明星员工/潜力股) 并评估保留风险",
            userPrompt: "员工数据：{{人才数据输入.employee_data}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "继任计划与 IDP 报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "为关键岗位制定继任计划并为高潜人才生成个人发展计划 (IDP)，输出完整人才盘点报告。",
            userPrompt:
              "盘点结果：{{人才盘点与 9 宫格.result}}\n关键岗位：{{人才数据输入.key_positions}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 45. 财务：预算执行监控与偏差分析 Agent
  {
    name: "预算执行监控与偏差分析 Agent",
    description:
      "实时对比预算与实际支出，自动识别超支风险，生成滚动预测与调整建议",
    category: "finance",
    tags: ["预算管理", "偏差分析", "滚动预测", "成本控制"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["预算管理", "偏差分析", "成本控制"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "财务数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "budget", name: "年度预算明细", value: "" },
              { id: "actual", name: "实际支出明细", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "偏差与根因分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个财务分析师。请执行：\n1. 计算预算完成率、偏差率及同环比\n2. 识别异常超支项并分析可能的根因（预算失控/业务变化等）",
            userPrompt:
              "预算：{{财务数据输入.budget}}\n实际：{{财务数据输入.actual}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "滚动预测与预警报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "基于进度更新滚动预测，生成调整建议及大额超支预警，输出完整执行分析报告。",
            userPrompt: "分析明细：{{偏差与根因分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 46. 市场：竞品动态监测与快反策略 Agent
  {
    name: "竞品动态监测与快反策略 Agent",
    description: "实时监测竞品价格、活动、新品动态，自动生成竞争快反策略建议",
    category: "marketing",
    tags: ["竞品监测", "价格监控", "快反策略", "市场情报"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["竞品监测", "市场情报", "快速响应"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "竞品监测配置",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "competitors", name: "竞品清单", value: "" },
              { id: "our_product", name: "我方产信息", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "竞争态势分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个竞争情报分析师。请执行：\n1. 模拟归集竞品调价、新品及促销动态\n2. 分析其战略意图及对我方的威胁等级（紧急/ watch/ routine）",
            userPrompt:
              "竞品：{{竞品监测配置.competitors}}\n我方：{{竞品监测配置.our_product}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "快反策略与报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "制定 48 小时内的价格/营销快反策略，触发团队警报并输出情报快报。",
            userPrompt: "竞争分析：{{竞争态势分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 47. 销售：客户流失预警与挽留 Agent
  {
    name: "客户流失预警与挽留 Agent",
    description: "基于客户行为数据预测流失风险，自动触发分级挽留策略",
    category: "sales",
    tags: ["客户流失", "预警模型", "客户挽留", "CRM"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["流失预警", "客户挽留", "客户成功"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "客户行为数据",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "客户行为数据",
                value: "",
                height: 200,
                placeholder:
                  "导入客户近 90 天的登录、功能使用、工单、付款行为数据",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "流失风险评分与诊断",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个客户成功专家。请执行：\n1. 基于建模逻辑预测流失风险分值\n2. 诊断流失诱因（不满/体验差/竞品切换/业务调整）",
            userPrompt: "行为数据：{{客户行为数据.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "分层挽留方案包",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "针对 VIP 及普通客户自动生成分层挽留方案与话术，并触发 CSM 行动警报。",
            userPrompt: "风险诊断：{{流失风险评分与诊断.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 48. 人力：薪酬竞争力分析与调薪建议 Agent
  {
    name: "薪酬竞争力分析与调薪建议 Agent",
    description: "对标市场薪酬数据，分析内部薪酬公平性，生成差异化调薪建议",
    category: "hr",
    tags: ["薪酬分析", "市场对标", "调薪建议", "薪酬公平"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["薪酬分析", "市场对标", "调薪建议"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "薪酬数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "internal", name: "内部薪酬与绩效", value: "" },
              { id: "market", name: "市场对标数据", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "市场与公平性分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个 HR 薪酬专家。请执行：\n1. 市场对标分析（CR值、市场分位、P50差距）\n2. 内部公平性诊断（离散度、绩效相关性）",
            userPrompt:
              "内部：{{薪酬数据输入.internal}}\n市场：{{薪酬数据输入.market}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "调薪策略建议报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "制定调薪矩阵并生成个人差异化调薪建议明细，输出完整分析报告。",
            userPrompt: "分析结果：{{市场与公平性分析.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 49. 财务：应收账款风险预警与催收 Agent
  {
    name: "应收账款风险预警与催收 Agent",
    description: "监控应收账款账龄，预测坏账风险，自动生成分级催收策略",
    category: "finance",
    tags: ["应收账款", "账龄分析", "坏账预警", "智能催收"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["应收账款", "催收管理", "坏账预警"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "应收账款明细",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "应收账款明细",
                value: "",
                height: 200,
                placeholder: "导入应收账款明细表（客户、金额、账龄、到期日等）",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "账龄分析与坏账预警",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个财务风控专家。请执行：\n1. 账龄结构分析与趋势识别\n2. 基于建模逻辑预测坏账概率及预期损失",
            userPrompt: "应收明细：{{应收账款明细.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "分级催收建议报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "根据账龄严重程度制定分级催收方案（提醒/话术/律师函），触发预警并输出分析报告。",
            userPrompt: "分析结果：{{账龄分析与坏账预警.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 50. 运营：用户生命周期价值 (LTV) 提升 Agent
  {
    name: "用户生命周期价值 (LTV) 提升 Agent",
    description: "分析用户分层与消费行为，预测 LTV 并生成针对性的价值提升策略",
    category: "operation",
    tags: ["LTV", "用户分层", "价值提升", "精细化运营"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["LTV提升", "用户运营", "价值分层"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "用户消费数据",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "用户消费明细",
                value: "",
                height: 200,
                placeholder:
                  "导入用户消费明细（用户ID、注册时间、订单记录、金额、频次）",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "RFM 分层与 LTV 预测",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个运营专家。请执行：\n1. 基于 RFM 模型（R/F/M）对用户进行价值分层\n2. 模拟预测各层级用户的生命周期价值 (LTV) 及流失概率",
            userPrompt: "消费数据：{{用户消费数据.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "价值提升精准方案",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "针对不同分层制定差异化 LTV 提升策略（VIP/交叉销售/召回），并输出精准营销方案。",
            userPrompt: "分析结果：{{RFM 分层与 LTV 预测.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 51. 法务：合同履约监控与违约预警 Agent
  {
    name: "合同履约监控与违约预警 Agent",
    description: "自动跟踪合同关键节点，预警履约风险，生成违约处置建议",
    category: "legal",
    tags: ["合同管理", "履约监控", "违约预警", "法务自动化"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["合同管理", "履约监控", "违约预警"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "合同履约信息",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "contract_list", name: "合同清单", value: "" },
              { id: "milestones", name: "履约节点", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "履约扫描与风险评估",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个法务专家。请执行：\n1. 模拟扫描合同状态，识别逾期违约与即将到期节点\n2. 评估违约合同的法律责任（违约金/损失）与业务影响",
            userPrompt:
              "合同：{{合同履约信息.contract_list}}\n节点：{{合同履约信息.milestones}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "处置建议与监控报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "制定分级处置建议（催告函/协商/诉讼），生成履约提醒并输出监控报告。",
            userPrompt: "评估结果：{{履约扫描与风险评估.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // ============================================================
  // 新增：第 52-61 号企业级 AES 标准模板
  // ============================================================

  // 52. 销售：商机赢单复盘与最佳实践萃取 Agent
  {
    name: "商机赢单复盘与最佳实践萃取 Agent",
    description: "分析成功签单案例，提炼关键成功因素，生成可复制的销售方法论",
    category: "sales",
    tags: ["赢单复盘", "最佳实践", "销售方法论", "知识萃取"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["赢单复盘", "方法论提炼", "知识沉淀"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "赢单案例输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "deal_info", name: "商机信息", value: "" },
              { id: "timeline", name: "关键里程碑", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "过程复盘与因素提取",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个销售教练。请执行：\n1. 还原销售全过程并识别里程碑动作\n2. 提取关键成功因素（关系/需求/方案/应对）与险情应对技巧",
            userPrompt:
              "信息：{{赢单案例输入.deal_info}}\n时间线：{{赢单案例输入.timeline}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "销售剧本 (Playbook)",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "提炼可复制的销售剧本（含话术/动作/策略），输出完整的赢单复盘报告。",
            userPrompt: "复盘结论：{{过程复盘与因素提取.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 53. 人力：员工敬业度调研与改进 Agent
  {
    name: "员工敬业度调研与改进 Agent",
    description:
      "分析员工满意度调研数据，识别敬业度驱动因素，生成针对性改进方案",
    category: "hr",
    tags: ["敬业度", "员工满意度", "组织诊断", "改进方案"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["敬业度调研", "组织诊断", "改进方案"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "敬业度调研数据",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "敬业度调研数据",
                value: "",
                height: 200,
                placeholder:
                  "导入员工敬业度调研原始数据（量化评分 & 开放性建议）",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多维分析与驱动识别",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个组织发展专家。请执行：\n1. 量化指标统计与开放反馈情感聚类分析\n2. 识别影响敬业度的核心驱动因素与最大负向拖累项",
            userPrompt: "调研数据：{{敬业度调研数据.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "分层改进计划",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "针对核心问题制定系统性改进计划（短期/长期），生成 HRBP 预警并输出分析报告。",
            userPrompt: "分析结论：{{多维分析与驱动识别.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 54. 沟通：跨部门协作会议纪要与追踪 Agent
  {
    name: "跨部门协作会议纪要与追踪 Agent",
    description: "自动生成结构化会议纪要，分配待办事项，并持续追踪执行进度",
    category: "admin",
    tags: ["会议纪要", "跨部门协作", "待办追踪", "执行闭环"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "beginner",
      useCases: ["会议纪要", "协作管理", "任务追踪"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "会议录音与转写",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              { id: "topic", name: "会议主题", value: "" },
              { id: "transcript", name: "转写文本", value: "" },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "纪要提取与风险识别",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个专业的会议秘书。请执行：\n1. 提取讨论要点、决议及待办任务分配\n2. 识别协作风险（瓶颈/冲突）并提供预防性建议",
            userPrompt:
              "主题：{{会议录音与转写.topic}}\n转写：{{会议录音与转写.transcript}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "待办追踪与纪要",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt: "生成结构化会议纪要、任务卡片并触发相关人通知。",
            userPrompt: "提取结果：{{纪要提取与风险识别.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 55. 销售：渠道合作伙伴绩效评估 Agent
  {
    name: "渠道合作伙伴绩效评估 Agent",
    description:
      "评估经销商/代理商业绩表现，识别高潜力伙伴，生成激励与淘汰建议",
    category: "sales",
    tags: ["渠道管理", "合作伙伴", "绩效评估", "渠道激励"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["渠道管理", "绩效评估", "伙伴激励"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "渠道业绩数据",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "content",
                name: "渠道业绩数据",
                value: "",
                height: 200,
                placeholder:
                  "导入渠道合作伙伴业绩数据（销售额、回款、客户满意度、市场覆盖等）",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "多维评分与分层",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个渠道管理专家。请执行：\n1. 多维评分（销售达成率30%、回款20%、满意度20%、市场开拓15%、合规15%）\n2. 分层分级（战略/核心/发展/观察四层）",
            userPrompt: "渠道数据：{{渠道业绩数据.content}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "分层策略与报告",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "针对不同层级制定差异化策略（战略伙伴激励方案/观察伙伴整改通知），输出完整评估报告。",
            userPrompt: "评分分层：{{多维评分与分层.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 56. 人力：绩效面谈准备与辅导 Agent
  {
    name: "绩效面谈准备与辅导 Agent",
    description: "为管理者准备绩效面谈材料，生成个性化反馈话术和发展建议",
    category: "hr",
    tags: ["绩效面谈", "管理辅导", "反馈技巧", "员工发展"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["绩效面谈", "反馈技巧", "员工辅导"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "绩效数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "employee",
                name: "员工信息",
                value: "",
                placeholder: "姓名、岗位、入职时长、汇报关系",
              },
              {
                id: "kpi_result",
                name: "KPI 达成情况",
                value: "",
                height: 120,
                placeholder: "各项 KPI 的目标值与实际完成值...",
              },
              {
                id: "behavior",
                name: "行为表现记录",
                value: "",
                height: 100,
                placeholder: "工作态度、协作能力、问题解决等行为观察...",
              },
              {
                id: "context",
                name: "特殊背景",
                value: "",
                placeholder: "如：新人、转岗、项目变动等",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "绩效全景分析与等级评定",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个绩效管理专家。请综合分析员工绩效：\n1. 量化业绩评价（目标达成度）\n2. 行为能力评价\n3. 相较上期变化趋势\n4. 在团队中的相对位置\n5. 综合评定绩效等级（优秀/合格/待改进）\n\n请输出JSON格式：{"performance_summary": "绩效总结", "rating": "优秀/合格/待改进", "strengths": ["优势"], "areas_to_improve": ["待提升项"]}',
            userPrompt:
              "KPI：{{绩效数据输入.kpi_result}}\n行为表现：{{绩效数据输入.behavior}}\n背景：{{绩效数据输入.context}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "面谈话术与发展建议",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              '你是一个绩效辅导专家。请根据绩效分析结果，生成完整的面谈准备材料：\n\n**根据绩效等级选择相应策略：**\n\n- 如果是"优秀"员工：\n  1. 使用 STAR 法则肯定具体成就\n  2. 提炼能力优势\n  3. 展望更高挑战机会\n  4. 探讨职业发展路径\n\n- 如果是"待改进"员工：\n  1. 使用 SBI 模型（情境-行为-影响）提供建设性反馈\n  2. 共同探讨改进方向\n  3. 约定跟进节点\n  4. 注意维护员工尊严\n\n- 如果是"合格"员工：\n  1. 肯定现有表现\n  2. 明确提升方向\n  3. 设定下阶段目标\n\n**同时生成个性化发展建议（IDP）：**\n1. 能力提升重点\n2. 推荐学习资源/培训\n3. 可参与的项目机会\n4. 下一考核周期目标建议\n\n输出格式：Markdown，包含绩效总结、面谈话术指南及个人发展计划',
            userPrompt:
              "绩效分析：{{绩效全景分析与等级评定.result}}\n员工信息：{{绩效数据输入.employee}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 57. 沟通：客户投诉升级处理与根因分析 Agent
  {
    name: "客户投诉升级处理与根因分析 Agent",
    description: "处理升级投诉，分析根本原因，生成解决方案并推动流程改进",
    category: "operation",
    tags: ["投诉处理", "升级管理", "根因分析", "流程改进"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["投诉处理", "根因分析", "流程改进"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "投诉信息录入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "customer",
                name: "客户信息",
                value: "",
                placeholder: "客户名称、等级、历史价值",
              },
              {
                id: "issue",
                name: "投诉内容",
                value: "",
                height: 150,
                placeholder: "详细描述客户投诉的问题...",
              },
              {
                id: "history",
                name: "处理历史",
                value: "",
                height: 100,
                placeholder: "之前的处理过程和客户反馈...",
              },
              {
                id: "expectation",
                name: "客户诉求",
                value: "",
                placeholder: "客户期望的解决方案",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "投诉分类定级与根因分析",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个客诉处理专家。请执行以下任务：\n\n**1. 投诉分类与定级：**\n- 分类：产品质量/服务态度/流程问题/承诺未兑现\n- 严重程度：P0紧急/P1严重/P2一般\n- 评估客户流失风险和舆情风险\n\n**2. 5Why 根因分析：**\n- 从表象问题开始，连续追问"为什么"\n- 找到可以采取行动的根本原因\n- 区分即时原因和系统性原因\n\n请输出JSON格式：{"category": "分类", "level": "P0/P1/P2", "churn_risk": "高/中/低", "pr_risk": "高/中/低", "root_cause": "根本原因", "immediate_causes": ["即时原因"], "systemic_causes": ["系统性原因"]}',
            userPrompt:
              "投诉内容：{{投诉信息录入.issue}}\n客户信息：{{投诉信息录入.customer}}\n处理历史：{{投诉信息录入.history}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "解决方案与处置建议",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个客诉处理专家。请根据分析结果设计分层解决方案：\n\n**1. 即时补救措施（24小时内）：**\n- 具体补救行动\n- 客户沟通话术\n\n**2. 客户补偿方案：**\n- 根据客户价值和诉求设计合理补偿\n- 平衡客户满意和公司成本\n\n**3. 内部整改措施（防止再发）：**\n- 流程优化点\n- 系统功能改进\n- 培训强化领域\n- 监控预警机制\n\n**4. 根据投诉级别的特殊处理：**\n- 如果是P0级：生成高管介入提醒，说明需要24小时内高管介入处理\n- 如果是P1级：生成经理级处理提醒\n- 如果是P2级：按标准流程处理\n\n输出格式：Markdown，包含问题分析、根因追溯、解决方案、客户沟通话术及预防建议",
            userPrompt:
              "分析结果：{{投诉分类定级与根因分析.result}}\n客户诉求：{{投诉信息录入.expectation}}\n客户信息：{{投诉信息录入.customer}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 58. 销售：销售团队战斗力诊断与提升 Agent
  {
    name: "销售团队战斗力诊断与提升 Agent",
    description: "诊断销售团队能力短板，设计针对性培训计划和激励机制",
    category: "sales",
    tags: ["团队诊断", "能力提升", "销售培训", "团队激励"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["团队诊断", "能力提升", "销售培训"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "团队数据输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "team_data",
                name: "团队业绩数据",
                value: "",
                height: 200,
                placeholder:
                  "导入销售团队成员业绩数据（个人业绩、活动量、转化率、客单价等）",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "个人与团队能力诊断",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个销售管理专家。请执行以下分析：\n\n**1. 个人能力画像（为每位销售生成）：**\n- 业绩达成率\n- 活动效率（有效拜访率）\n- 转化能力（各阶段转化率）\n- 客单价水平\n- 新客户开拓能力\n- 识别能力长短板\n\n**2. 团队整体诊断：**\n- 团队业绩分布（头部/腰部/尾部占比）\n- 共性能力短板\n- 团队协作效率\n- 与行业标杆的差距\n\n请输出JSON格式：{"individual_profiles": [{"name": "姓名", "strengths": [], "weaknesses": []}], "team_diagnosis": {"distribution": {}, "common_gaps": [], "benchmark_gap": ""}}',
            userPrompt: "团队数据：{{团队数据输入.team_data}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "培训与激励方案",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个销售培训专家。请根据诊断结果设计完整提升方案：\n\n**1. 分层培训计划：**\n- 新人基础培训（产品知识/销售流程）\n- 腰部提升培训（转化技巧/异议处理）\n- 高手进阶培训（大客户经营/方案销售）\n\n**2. 激励机制优化：**\n- 短期冲刺PK赛（月度/季度）\n- 荣誉激励体系（销冠榜/进步奖）\n- 成长激励（晋升通道/带教奖励）\n- 团队协作激励\n\n**3. 行动计划：**\n- 第1周：问题宣导（数据复盘会议、目标共识会）\n- 第2-4周：能力提升（专项培训、一对一辅导）\n- 第2个月：激励推动（PK赛启动、标杆分享会）\n- 持续跟进：周例会追踪、月度复盘\n\n输出格式：Markdown，包含能力画像、团队诊断、培训计划及激励方案",
            userPrompt: "诊断结果：{{个人与团队能力诊断.result}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 59. 人力：组织架构优化与岗位设计 Agent
  {
    name: "组织架构优化与岗位设计 Agent",
    description: "分析组织效能，优化架构设计，重新定义岗位职责与汇报关系",
    category: "hr",
    tags: ["组织设计", "架构优化", "岗位设计", "人效提升"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "advanced",
      useCases: ["组织设计", "架构优化", "岗位设计"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "组织现状输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "structure",
                name: "现有组织架构",
                value: "",
                height: 150,
                placeholder: "部门设置、层级关系、人员配置...",
              },
              {
                id: "pain_points",
                name: "当前痛点",
                value: "",
                height: 100,
                placeholder: "效率低下、职责不清、协作困难等问题...",
              },
              {
                id: "strategy",
                name: "战略方向",
                value: "",
                placeholder: "公司未来1-3年战略重点",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "组织效能诊断与对标",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个组织发展顾问。请执行以下分析：\n\n**1. 组织效能诊断：**\n- 管理幅度是否合理\n- 层级是否过多\n- 职能是否重叠\n- 授权是否充分\n- 协作链条是否顺畅\n\n**2. 行业最佳实践对标：**\n- 参考同行业领先企业的组织架构模式\n- 分析其设计逻辑和优势\n- 为本次优化提供参考借鉴\n\n请输出JSON格式：{"diagnosis": {"issues": [], "severity": "高/中/低"}, "benchmark": {"best_practices": [], "applicable_insights": []}}',
            userPrompt:
              "组织架构：{{组织现状输入.structure}}\n痛点：{{组织现状输入.pain_points}}\n战略方向：{{组织现状输入.strategy}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "架构优化与岗位设计",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个组织设计专家。请根据诊断结果设计完整优化方案：\n\n**1. 架构优化方案：**\n- 部门整合/拆分建议\n- 层级压缩方案\n- 新设/撤销岗位\n- 汇报关系调整\n- 设计逻辑和预期效果\n\n**2. 岗位说明书（为关键岗位生成JD）：**\n- 岗位目的\n- 主要职责（按重要性排序）\n- 任职资格\n- 关键绩效指标\n- 汇报与协作关系\n\n**3. 变革实施计划：**\n- 沟通策略（何时/如何宣布）\n- 人员安置方案\n- 过渡期安排\n- 风险预案（关键人才流失/业务中断）\n\n输出格式：Markdown，包含诊断报告、新架构设计、岗位说明书及实施计划",
            userPrompt:
              "诊断结果：{{组织效能诊断与对标.result}}\n战略方向：{{组织现状输入.strategy}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 60. 沟通：内部通讯与公告智能撰写 Agent
  {
    name: "内部通讯与公告智能撰写 Agent",
    description: "根据事件类型自动生成规范的内部通讯稿、公告或备忘录",
    category: "admin",
    tags: ["内部通讯", "公告撰写", "企业文化", "沟通规范"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "beginner",
      useCases: ["内部通讯", "公告撰写", "企业传播"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "通讯事件输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "type",
                name: "通讯类型",
                value: "公告",
                placeholder: "公告/通知/喜报/备忘录/CEO信",
              },
              {
                id: "topic",
                name: "事件主题",
                value: "",
                placeholder: "如：人事任命、政策变更、里程碑达成",
              },
              {
                id: "content",
                name: "关键信息",
                value: "",
                height: 150,
                placeholder: "需要传达的核心内容要点...",
              },
              {
                id: "audience",
                name: "受众范围",
                value: "全员",
                placeholder: "全员/管理层/特定部门",
              },
              {
                id: "tone",
                name: "语气风格",
                value: "正式",
                placeholder: "正式/温暖/激励/严肃",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "结构规划与初稿撰写",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              "你是一个企业内部沟通专家。请根据通讯类型规划内容结构并撰写初稿：\n\n**内容结构规划：**\n1. 开篇引入\n2. 核心信息传达\n3. 背景说明（如需）\n4. 行动号召/期望\n5. 结尾收束\n\n**根据通讯类型选择相应风格：**\n\n- **喜报**：振奋人心的开场、成就详细描述、团队/个人表彰、感谢与展望。语言积极向上，可适当使用感叹号。\n\n- **CEO信**：体现战略高度和人文关怀、直面问题或分享愿景、传递信心和方向、呼唤共同行动。语言真诚有力，避免官话套话。\n\n- **公告/通知**：清晰的标题、简洁的正文（何事/何时/如何执行）、相关附件说明、联系人信息。语言正式规范。\n\n- **备忘录**：简洁明了、重点突出、行动导向。\n\n请输出初稿内容",
            userPrompt:
              "类型：{{通讯事件输入.type}}\n主题：{{通讯事件输入.topic}}\n内容：{{通讯事件输入.content}}\n受众：{{通讯事件输入.audience}}\n语气：{{通讯事件输入.tone}}",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "润色与合规检查",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个企业沟通审核专家。请对初稿进行润色和合规检查：\n\n**1. 语言润色：**\n- 语言流畅度优化\n- 确保语气与目标受众匹配\n- 增强可读性和感染力\n\n**2. 合规检查：**\n- 敏感词/不当表述检查\n- 法律合规性（如涉及人事/政策）\n- 格式规范性\n\n**3. 发布建议：**\n- 建议发布渠道\n- 最佳发布时间\n- 配套行动提醒\n\n输出格式：Markdown，包含正式通讯稿全文及发布建议",
            userPrompt:
              "初稿内容：{{结构规划与初稿撰写.result}}\n通讯类型：{{通讯事件输入.type}}\n受众范围：{{通讯事件输入.audience}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },

  // 61. 销售：报价单智能生成与审批 Agent
  {
    name: "报价单智能生成与审批 Agent",
    description: "根据客户需求和定价策略自动生成报价单，并触发审批流程",
    category: "sales",
    tags: ["报价管理", "智能定价", "审批流程", "CPQ"],
    metadata: {
      estimatedTime: "3-5分钟",
      difficulty: "intermediate",
      useCases: ["报价管理", "智能定价", "审批流程"],
    },
    config: {
      version: 3,
      nodes: [
        {
          id: "input-1",
          type: "INPUT",
          name: "报价需求输入",
          position: { x: 100, y: 300 },
          config: {
            fields: [
              {
                id: "customer",
                name: "客户信息",
                value: "",
                placeholder: "客户名称、等级、历史采购额",
              },
              {
                id: "products",
                name: "产品需求",
                value: "",
                height: 150,
                placeholder: "产品名称、规格、数量...",
              },
              {
                id: "special_request",
                name: "特殊需求",
                value: "",
                placeholder: "定制需求、交付时间、付款条件等",
              },
            ],
          },
        },
        {
          id: "process-1",
          type: "PROCESS",
          name: "价格计算与政策匹配",
          position: { x: 400, y: 300 },
          config: {
            systemPrompt:
              '你是一个报价专家。请执行以下任务：\n\n**1. 价格库检索：**\n- 根据产品需求检索标准价格、成本价、最低折扣线\n- 计算各产品的建议售价\n\n**2. 客户政策匹配：**\n- 根据客户等级确定适用的折扣政策\n- 确定信用政策和付款条件\n\n**3. 报价计算：**\n- 计算各产品的折扣后价格\n- 计算小计、税额、总计\n- 计算毛利率\n- 判断是否需要审批（如总金额超过10万或折扣超过标准）\n\n请输出JSON格式：{"items": [{"product": "", "quantity": 0, "unit_price": 0, "discount": 0, "final_price": 0}], "subtotal": 0, "tax": 0, "total": 0, "margin_rate": 0, "needs_approval": true/false, "approval_reason": ""}',
            userPrompt:
              "客户信息：{{报价需求输入.customer}}\n产品需求：{{报价需求输入.products}}\n特殊需求：{{报价需求输入.special_request}}",
            knowledgeBaseId: "",
          },
        },
        {
          id: "process-2",
          type: "PROCESS",
          name: "报价单生成与审批建议",
          position: { x: 700, y: 300 },
          config: {
            systemPrompt:
              "你是一个报价单生成专家。请根据计算结果生成完整的报价单：\n\n**1. 报价单内容：**\n- 报价编号和日期\n- 客户信息\n- 产品明细表（含规格、数量、单价、折扣、小计）\n- 合计金额（含税）\n- 有效期（默认30天）\n- 付款条件\n- 备注条款\n\n**2. 审批处理：**\n- 如果需要审批：生成审批申请说明，包含审批原因、金额、毛利率等关键信息\n- 如果无需审批：标注为自动审批通过\n\n**3. 发送准备：**\n- 生成可直接发送给客户的正式报价单\n- 生成内部审批/备案说明\n\n输出格式：Markdown，包含正式报价单及审批/备案说明",
            userPrompt:
              "报价计算结果：{{价格计算与政策匹配.result}}\n客户信息：{{报价需求输入.customer}}\n特殊需求：{{报价需求输入.special_request}}",
          },
        },
      ],
      edges: [
        { id: "e1", source: "input-1", target: "process-1" },
        { id: "e2", source: "process-1", target: "process-2" },
      ],
    },
  },
];

// Export the templates array for use in recommender.ts
export const officialTemplates = OFFICIAL_TEMPLATES;

/**
 * 导入官方模板到数据库
 */
export async function seedOfficialTemplates() {
  console.log("开始重构并导入企业级官方模板...");

  // 1. 彻底清理旧版官方模板
  // 删除所有标记为 isOfficial: true 的模板，确保不残留任何"玩具级"简单工作流
  console.log("正在清理旧版官方模板...");
  await prisma.workflowTemplate.deleteMany({
    where: {
      isOfficial: true,
    },
  });
  console.log("旧版模板清理完成。");

  // 2. 导入全新的企业级 Agent 模板
  for (const template of OFFICIAL_TEMPLATES) {
    // 排除 metadata 字段，因为数据库 schema 中没有该字段
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { metadata, ...templateData } = template;

    await prisma.workflowTemplate.create({
      data: {
        ...templateData,
        visibility: "PUBLIC",
        templateType: "PUBLIC",
        isOfficial: true,
        creatorName: "AI Workflow 官方",
      },
    });

    console.log(`已上线 Agent 级模板: ${template.name}`);
  }

  console.log("企业级官方模板库重构完成！");
}

// 脚本入口
if (require.main === module) {
  seedOfficialTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("导入失败:", error);
      process.exit(1);
    });
}
