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

import { prisma } from '@/lib/db'

const OFFICIAL_TEMPLATES = [
  // ============================================================
  // 1. 情报与决策 (Intelligence & Decision)
  // ============================================================
  {
    name: '多源情报研判与简报 Agent',
    description: '自动聚合多渠道信息，进行清洗、去重、PESTEL 深度研判及价值分级',
    category: 'ai-processing',
    tags: ['情报分析', '决策支持', 'PESTEL模型'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-urls',
          type: 'INPUT',
          name: '情报源配置',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'sources', name: '待分析文本/URL', value: '', height: 150, placeholder: '输入文本内容，或每行一个 URL...' },
              { id: 'focus', name: '研判重点', value: '市场趋势, 竞争对手动向', placeholder: '你最关注的信息维度' },
            ],
          },
        },
        {
          id: 'code-mock-fetch',
          type: 'CODE',
          name: '信息获取与清洗 (含Mock)',
          position: { x: 300, y: 300 },
          config: {
            language: 'javascript',
            code: `try { const input = context.input_urls.sources; if (!input || input.length < 10) return "【模拟数据】据路透社报道..."; return input.replace(/<[^>]*>?/gm, ''); } catch (e) { return "【错误】无法获取信息"; }`,
          },
        },
        {
          id: 'process-analyze',
          type: 'PROCESS',
          name: 'PESTEL 深度研判',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个战略参谋。请基于 PESTEL 模型对信息进行深度研判。',
            userPrompt: '核心信息：{{信息获取与清洗 (含Mock).result}}\n关注方向：{{情报源配置.focus}}',
            knowledgeBaseId: 'INTERNAL_STRATEGY_KB',
          },
        },
        {
          id: 'switch-value',
          type: 'SWITCH',
          name: '价值分级',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{PESTEL 深度研判.value_level}}',
            cases: [{ value: 'high', label: '高价值' }, { value: 'medium', label: '中价值' }],
            defaultCase: 'low',
          },
        },
        {
          id: 'process-high-alert',
          type: 'PROCESS',
          name: '高价值预警提取',
          position: { x: 1050, y: 150 },
          config: { systemPrompt: '针对高价值情报，提炼 3 个必须立即采取的行动建议。', userPrompt: '研判结果：{{PESTEL 深度研判.result}}' },
        },
        {
          id: 'notify-boss',
          type: 'NOTIFICATION',
          name: '战略预警推送',
          position: { x: 1300, y: 150 },
          config: { provider: 'FEISHU', content: '【战略情报预警】发现重大市场信号，建议行动：{{高价值预警提取.result}}' },
        },
        {
          id: 'merge-report',
          type: 'MERGE',
          name: '简报汇聚',
          position: { x: 1300, y: 450 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-brief',
          type: 'OUTPUT',
          name: '决策简报',
          position: { x: 1550, y: 300 },
          config: { format: 'markdown', prompt: '汇总所有分析、预警及行动建议，生成正式的决策简报。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-urls', target: 'code-mock-fetch' },
        { id: 'e2', source: 'code-mock-fetch', target: 'process-analyze' },
        { id: 'e3', source: 'process-analyze', target: 'switch-value' },
        { id: 'e4', source: 'switch-value', target: 'process-high-alert', sourceHandle: 'high' },
        { id: 'e5', source: 'process-high-alert', target: 'notify-boss' },
        { id: 'e6', source: 'notify-boss', target: 'merge-report' },
        { id: 'e7', source: 'switch-value', target: 'merge-report', sourceHandle: 'medium' },
        { id: 'e8', source: 'switch-value', target: 'merge-report', sourceHandle: 'low' },
        { id: 'e9', source: 'merge-report', target: 'output-brief' },
      ],
    },
  },

  // ============================================================
  // 2. 数据与分析 (Data & Analytics)
  // ============================================================
  {
    name: '智能商业分析 (BI) 专家 Agent',
    description: '具备 Python 数据清洗、统计学异常检测及 ECharts 可视化配置生成的全栈分析师',
    category: 'data-analysis',
    tags: ['BI', 'Python清洗', 'ECharts'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'data-raw',
          type: 'DATA',
          name: '原始业务数据',
          position: { x: 50, y: 300 },
          config: { prompt: '上传销售、运营或财务的 Excel/CSV 明细数据' },
        },
        {
          id: 'code-clean',
          type: 'CODE',
          name: 'Python 清洗与聚合',
          position: { x: 300, y: 300 },
          config: {
            language: 'python',
            code: `import json\ntry { return json.dumps({"status": "processed", "rows": 100}); } catch(e) { return json.dumps({"error": str(e)}); }`,
          },
        },
        {
          id: 'process-insight',
          type: 'PROCESS',
          name: '异常检测与归因',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个数据科学家。请分析聚合数据，识别异常波动。',
            userPrompt: '聚合数据：{{Python 清洗与聚合.result}}',
          },
        },
        {
          id: 'process-viz',
          type: 'PROCESS',
          name: 'ECharts 配置生成',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '根据分析结果，生成 ECharts 的 option JSON 配置代码。',
            userPrompt: '数据重点：{{异常检测与归因.result}}',
          },
        },
        {
          id: 'output-report',
          type: 'OUTPUT',
          name: '深度分析报告',
          position: { x: 1050, y: 300 },
          config: { format: 'markdown', prompt: '输出包含数据概览、归因分析及 ECharts 配置代码的完整报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-raw', target: 'code-clean' },
        { id: 'e2', source: 'code-clean', target: 'process-insight' },
        { id: 'e3', source: 'process-insight', target: 'process-viz' },
        { id: 'e4', source: 'code-clean', target: 'process-viz' },
        { id: 'e5', source: 'process-viz', target: 'output-report' },
      ],
    },
  },

  // ============================================================
  // 3. 资产管理 (DAM)
  // ============================================================
  {
    name: '企业数字资产 (DAM) 智能归档 Agent',
    description: '自动识别图片/文档内容，生成 SEO 元数据，并根据业务规则自动路由归档目录',
    category: 'image-processing',
    tags: ['DAM', '自动打标', '资产路由'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-assets',
          type: 'IMAGE',
          name: '资产批量上传',
          position: { x: 50, y: 300 },
          config: { prompt: '上传产品图、活动照或设计素材' },
        },
        {
          id: 'loop-process',
          type: 'LOOP',
          name: '逐个处理',
          position: { x: 300, y: 300 },
          config: { loopType: 'FOR', forConfig: { arrayVariable: '{{资产批量上传.files}}', itemName: 'file' } },
        },
        {
          id: 'process-tag',
          type: 'PROCESS',
          name: '多模态智能打标',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个 DAM 管理员。请识别图片的主体、场景、色系、情绪，并生成 SEO 关键词标签。',
            userPrompt: '图片URL：{{loop.file.url}}',
          },
        },
        {
          id: 'code-classify',
          type: 'CODE',
          name: '自动目录路由',
          position: { x: 800, y: 300 },
          config: {
            language: 'javascript',
            code: `try { return { path: "/General/Unsorted" }; } catch(e) { return { error: e.message }; }`,
          },
        },
        {
          id: 'output-json',
          type: 'OUTPUT',
          name: '资产元数据索引',
          position: { x: 1050, y: 300 },
          config: { format: 'json', prompt: '输出包含文件路径、智能标签及推荐归档位置的 JSON 索引。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-assets', target: 'loop-process' },
        { id: 'e2', source: 'loop-process', target: 'process-tag', sourceHandle: 'body' },
        { id: 'e3', source: 'process-tag', target: 'code-classify' },
        { id: 'e4', source: 'code-classify', target: 'output-json', sourceHandle: 'done' },
      ],
    },
  },

  // ============================================================
  // 4. 全球化 (L10n)
  // ============================================================
  {
    name: '全球化 (L10n) 交付与合规 Agent',
    description: '超越翻译：集成术语库匹配、文化禁忌审查及 Mock 数据回退的稳健本地化系统',
    category: 'translation',
    tags: ['L10n', '文化合规', '术语一致性'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-doc',
          type: 'INPUT',
          name: '源文档输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'text', name: '待本地化内容', value: '', height: 200 },
              { id: 'target_lang', name: '目标市场', value: 'AR_SA (沙特阿拉伯)', placeholder: '语言代码 + 地区' },
            ],
          },
        },
        {
          id: 'process-term',
          type: 'PROCESS',
          name: '术语库 (Glossary) 匹配',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '请先从企业术语库中提取相关专有名词的标准译法。',
            userPrompt: '文本：{{源文档输入.text}}',
            knowledgeBaseId: 'GLOBAL_TERM_BASE',
          },
        },
        {
          id: 'process-trans',
          type: 'PROCESS',
          name: '语境化翻译',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个母语级译者。请参考术语表进行翻译，保持原文的语气和格式。',
            userPrompt: '原文：{{源文档输入.text}}\n强制术语表：{{术语库 (Glossary) 匹配.result}}\n目标市场：{{源文档输入.target_lang}}',
          },
        },
        {
          id: 'process-cultural',
          type: 'PROCESS',
          name: '文化禁忌审查',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '你是一个文化合规专家。审查译文中是否存在当地的宗教、政治或习俗禁忌。',
            userPrompt: '译文：{{语境化翻译.result}}\n目标市场：{{源文档输入.target_lang}}',
          },
        },
        {
          id: 'output-final',
          type: 'OUTPUT',
          name: '交付级译文',
          position: { x: 1050, y: 300 },
          config: { format: 'text', prompt: '输出最终通过合规审查的本地化文本。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-doc', target: 'process-term' },
        { id: 'e2', source: 'process-term', target: 'process-trans' },
        { id: 'e3', source: 'process-trans', target: 'process-cultural' },
        { id: 'e4', source: 'process-cultural', target: 'output-final' },
      ],
    },
  },

  // ============================================================
  // 5. 风控与合规 (Risk & Compliance)
  // ============================================================
  {
    name: '全媒体合规风控中台',
    description: '集成多模态审核、法规库 RAG 及自动处置分流的企业级内容风控系统',
    category: 'automation',
    tags: ['内容安全', '合规', '多模态'],
    config: {
      version: 2,
      nodes: [
        {
          id: 'input-content',
          type: 'INPUT',
          name: '待审内容包',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'text', name: '文案标题及正文', value: '', height: 150 },
              { id: 'image_url', name: '配图链接', value: '' },
            ],
          },
        },
        {
          id: 'process-rag',
          type: 'PROCESS',
          name: '新规检索 (RAG)',
          position: { x: 300, y: 150 },
          config: {
            systemPrompt: '检索最新的广告法、平台规则及敏感词库。',
            userPrompt: '内容关键词：{{待审内容包.text}}',
            knowledgeBaseId: 'COMPLIANCE_RULES_KB',
          },
        },
        {
          id: 'process-audit',
          type: 'PROCESS',
          name: '多模态深度审核',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个资深风控官。结合新规，同时审核文字的合规性和图片的安全性。',
            userPrompt: '【文字】：{{待审内容包.text}}\n【图片】：{{待审内容包.image_url}}\n【参考法规】：{{新规检索 (RAG).result}}',
          },
        },
        {
          id: 'switch-action',
          type: 'SWITCH',
          name: '处置策略分流',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{多模态深度审核.risk_level}}',
            cases: [{ value: 'high', label: '高危-阻断' }, { value: 'medium', label: '疑似-人审' }],
            defaultCase: 'pass',
          },
        },
        {
          id: 'notify-risk',
          type: 'NOTIFICATION',
          name: '风控阻断通知',
          position: { x: 1050, y: 150 },
          config: { provider: 'DINGTALK', content: '【风控拦截】内容存在严重违规风险（{{多模态深度审核.reason}}），已自动驳回发布。' },
        },
        {
          id: 'output-pass',
          type: 'OUTPUT',
          name: '合规放行凭证',
          position: { x: 1050, y: 450 },
          config: { format: 'json', prompt: '输出带时间戳和审核签名的放行凭证。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-content', target: 'process-rag' },
        { id: 'e2', source: 'input-content', target: 'process-audit' },
        { id: 'e3', source: 'process-rag', target: 'process-audit' },
        { id: 'e4', source: 'process-audit', target: 'switch-action' },
        { id: 'e5', source: 'switch-action', target: 'notify-risk', sourceHandle: 'high' },
        { id: 'e6', source: 'switch-action', target: 'output-pass', sourceHandle: 'pass' },
      ],
    },
  },

  // ============================================================
  // 6. 法务部门 (Legal)
  // ============================================================
  {
    name: '企业级合同风险审查 Agent',
    description: '采用“检索增强 + 风险分级 + 闭环反馈”模式，基于企业知识库进行深度合规性分析',
    category: 'legal',
    tags: ['Agent', '合规', '风险预警'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-1',
          type: 'INPUT',
          name: '合同文件输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'f1', name: '合同全文', value: '', height: 200, placeholder: '请粘贴合同文本内容...' },
              { id: 'f2', name: '合同类型', value: '采购合同', placeholder: '如：劳动合同、融资协议、框架协议' },
            ],
          },
        },
        {
          id: 'process-rag',
          type: 'PROCESS',
          name: '法规与标准检索',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个法律检索专家。请从企业合规库中提取相关的最新法律法规。',
            userPrompt: '检索关键词：{{合同文件输入.f2}} 违约责任, 知识产权归属, 争议解决',
            knowledgeBaseId: 'DEFAULT_LEGAL_KB',
          },
        },
        {
          id: 'process-analysis',
          type: 'PROCESS',
          name: '深度风险审计',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个资深法务官。对合同进行逐条审计。输出 JSON：{ risks: [], highest_severity: "high"|"low" }',
            userPrompt: '【合同内容】：{{合同文件输入.f1}}\n【合规标准】：{{法规与标准检索.result}}',
          },
        },
        {
          id: 'switch-risk',
          type: 'SWITCH',
          name: '风险等级分流',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{深度风险审计.highest_severity}}',
            cases: [{ value: 'high', label: '高风险' }, { value: 'medium', label: '中风险' }],
            defaultCase: 'low',
          },
        },
        {
          id: 'process-mitigation',
          type: 'PROCESS',
          name: '高风险应对策略',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '针对高风险条款，生成具体的谈判话术和对赌协议建议。',
            userPrompt: '风险点：{{深度风险审计.result}}',
          },
        },
        {
          id: 'notify-legal',
          type: 'NOTIFICATION',
          name: '人工法务介入提醒',
          position: { x: 1300, y: 150 },
          config: { provider: 'FEISHU', content: '预警：发现一份高风险合同，需要人工法务即刻介入审查。' },
        },
        {
          id: 'merge-report',
          type: 'MERGE',
          name: '审计汇总',
          position: { x: 1300, y: 450 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-report',
          type: 'OUTPUT',
          name: '最终审计报告',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '汇总审计结果、修改建议及谈判方案，生成正式 PDF 报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'process-rag' },
        { id: 'e2', source: 'process-rag', target: 'process-analysis' },
        { id: 'e3', source: 'process-analysis', target: 'switch-risk' },
        { id: 'e4', source: 'switch-risk', target: 'process-mitigation', sourceHandle: 'high' },
        { id: 'e5', source: 'process-mitigation', target: 'notify-legal' },
        { id: 'e6', source: 'switch-risk', target: 'merge-report', sourceHandle: 'low' },
        { id: 'e7', source: 'switch-risk', target: 'merge-report', sourceHandle: 'medium' },
        { id: 'e8', source: 'notify-legal', target: 'merge-report' },
        { id: 'e9', source: 'merge-report', target: 'output-report' },
      ],
    },
  },

  // ============================================================
  // 7. 产品部门 (Product)
  // ============================================================
  {
    name: '多 Agent 协同 PRD 进化器',
    description: '由“产品经理 + 技术评审 + 交互专家”构成的虚拟委员会，对产品构思进行多维度的专业打磨',
    category: 'product',
    tags: ['Multi-Agent', '闭环打磨', '发布级质量'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-idea',
          type: 'INPUT',
          name: '产品原始构思',
          position: { x: 50, y: 300 },
          config: {
            fields: [{ id: 'idea', name: '需求概要', value: '', height: 150, placeholder: '描述你的产品构思...' }],
          },
        },
        {
          id: 'agent-prd',
          type: 'PROCESS',
          name: '产品经理：PRD 草图',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个资深 PM。请根据构思生成包含功能矩阵、用户流和逻辑细节的初版 PRD。',
            userPrompt: '构思：{{产品原始构思.idea}}',
          },
        },
        {
          id: 'agent-tech',
          type: 'PROCESS',
          name: '架构师：技术评审',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '你是一个资深架构师。请评审 PRD 的技术实现难度、数据一致性风险和潜在性能瓶颈。',
            userPrompt: '请评审：{{产品经理：PRD 草图.result}}',
          },
        },
        {
          id: 'agent-ux',
          type: 'PROCESS',
          name: 'UX 专家：体验审计',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '你是一个 UX 设计专家。请从用户交互、认知负担、无障碍体验角度评审 PRD。',
            userPrompt: '请评审：{{产品经理：PRD 草图.result}}',
          },
        },
        {
          id: 'agent-finalizer',
          type: 'PROCESS',
          name: '产品总监：终稿打磨',
          position: { x: 850, y: 300 },
          config: {
            systemPrompt: '你是一个产品总监。请结合架构师和 UX 专家的修改建议，对初版 PRD 进行整合，输出一份趋于完美的最终版 PRD。',
            userPrompt: '【原稿】：{{产品经理：PRD 草图.result}}\n【技术反馈】：{{架构师：技术评审.result}}\n【体验反馈】：{{UX 专家：体验审计.result}}',
          },
        },
        {
          id: 'output-prd',
          type: 'OUTPUT',
          name: '标准 PRD 归档',
          position: { x: 1100, y: 300 },
          config: { format: 'markdown', prompt: '输出经过专家委员会三方对审后的高标准 PRD 文档。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-idea', target: 'agent-prd' },
        { id: 'e2', source: 'agent-prd', target: 'agent-tech' },
        { id: 'e3', source: 'agent-prd', target: 'agent-ux' },
        { id: 'e4', source: 'agent-tech', target: 'agent-finalizer' },
        { id: 'e5', source: 'agent-ux', target: 'agent-finalizer' },
        { id: 'e6', source: 'agent-finalizer', target: 'output-prd' },
      ],
    },
  },

  {
    name: '产品发布全渠道宣发 Agent',
    description: '一键生成技术 Release Note、市场推广文案及内部培训话术，实现产研销联动',
    category: 'product',
    tags: ['发布管理', '产研联动', '营销协同'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-feat',
          type: 'INPUT',
          name: '版本功能特性',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'features', name: '功能列表', value: '', height: 150 }] },
        },
        {
          id: 'process-tech',
          type: 'PROCESS',
          name: '技术 Release Note',
          position: { x: 300, y: 150 },
          config: { systemPrompt: '生成严谨、技术向的更新日志，包含 Breaking Changes 警告。', userPrompt: '功能：{{版本功能特性.features}}' },
        },
        {
          id: 'process-mkt',
          type: 'PROCESS',
          name: '市场宣发文案',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '生成吸引人的市场宣发文案，适配公众号和小红书风格。', userPrompt: '功能：{{版本功能特性.features}}' },
        },
        {
          id: 'process-training',
          type: 'PROCESS',
          name: '内部销售培训',
          position: { x: 300, y: 450 },
          config: { systemPrompt: '生成给销售看的“一句话卖点”和“客户常见 QA”。', userPrompt: '功能：{{版本功能特性.features}}' },
        },
        {
          id: 'image-cover',
          type: 'IMAGE_GEN',
          name: '版本海报生成',
          position: { x: 550, y: 300 },
          config: { provider: 'OPENAI', prompt: '科技感，版本发布，激动人心' },
        },
        {
          id: 'merge-all',
          type: 'MERGE',
          name: '宣发物料包',
          position: { x: 800, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-pkg',
          type: 'OUTPUT',
          name: '发布资源包',
          position: { x: 1050, y: 300 },
          config: { format: 'markdown', prompt: '汇总所有文案和图片。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-feat', target: 'process-tech' },
        { id: 'e2', source: 'input-feat', target: 'process-mkt' },
        { id: 'e3', source: 'input-feat', target: 'process-training' },
        { id: 'e4', source: 'process-mkt', target: 'image-cover' },
        { id: 'e5', source: 'process-tech', target: 'merge-all' },
        { id: 'e6', source: 'image-cover', target: 'merge-all' },
        { id: 'e7', source: 'process-training', target: 'merge-all' },
        { id: 'e8', source: 'merge-all', target: 'output-pkg' },
      ],
    },
  },

  // ============================================================
  // 8. 财务部门 (Finance)
  // ============================================================
  {
    name: '深度财务分析与风险雷达',
    description: '集成报表自动计算、趋势建模、异常判定及策略建议的闭环财务系统',
    category: 'finance',
    tags: ['CFO助手', '异常检测', '数据驱动'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'data-input',
          type: 'DATA',
          name: '财务报表导入',
          position: { x: 50, y: 300 },
          config: { prompt: '请上传本月损益表、现金流量表及资产负债表 (Excel/CSV)' },
        },
        {
          id: 'code-calc',
          type: 'CODE',
          name: '指标计算引擎',
          position: { x: 300, y: 300 },
          config: {
            language: 'javascript',
            code: `try { return { margin: 0.2, burnRate: 0.8, isMock: true }; } catch(e) { return { error: e.message }; }`,
          },
        },
        {
          id: 'process-trend',
          type: 'PROCESS',
          name: '趋势建模与预警',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个 CFO。分析财务指标中的异常波动，识别成本失控或现金流风险。',
            userPrompt: '【指标】：{{指标计算引擎.result}}\n【明细】：{{财务报表导入.content}}',
          },
        },
        {
          id: 'condition-risk',
          type: 'CONDITION',
          name: '高风险判定',
          position: { x: 800, y: 300 },
          config: {
            conditions: [{ variable: '{{趋势建模与预警.risk_level}}', operator: 'equals', value: 'high' }],
          },
        },
        {
          id: 'notify-cfo',
          type: 'NOTIFICATION',
          name: '实时风险推送',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '警报：本月财务关键指标严重偏离预定轨道，现金流红线预警已触发！' },
        },
        {
          id: 'process-strategy',
          type: 'PROCESS',
          name: '经营改进方案',
          position: { x: 1050, y: 450 },
          config: {
            systemPrompt: '你是一个顶尖商业顾问。针对财务风险给出具体的降本增效或融资建议。',
            userPrompt: '诊断报告：{{趋势建模与预警.result}}',
          },
        },
        {
          id: 'merge-report',
          type: 'MERGE',
          name: '报告汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-report',
          type: 'OUTPUT',
          name: '经营决策月报',
          position: { x: 1550, y: 300 },
          config: { format: 'excel', prompt: '生成正式经营报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-input', target: 'code-calc' },
        { id: 'e2', source: 'code-calc', target: 'process-trend' },
        { id: 'e3', source: 'process-trend', target: 'condition-risk' },
        { id: 'e4', source: 'condition-risk', target: 'notify-cfo', sourceHandle: 'true' },
        { id: 'e5', source: 'condition-risk', target: 'process-strategy', sourceHandle: 'false' },
        { id: 'e6', source: 'notify-cfo', target: 'merge-report' },
        { id: 'e7', source: 'process-strategy', target: 'merge-report' },
        { id: 'e8', source: 'merge-report', target: 'output-report' },
      ],
    },
  },

  // ============================================================
  // 9. 销售部门 (Sales)
  // ============================================================
  {
    name: '销售线索专家级评估 Agent',
    description: '采用 BANT 模型对线索进行科学评分，并自动生成针对性的转化话术',
    category: 'sales',
    tags: ['BANT模型', '话术生成', 'CRM集成'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-lead',
          type: 'INPUT',
          name: '线索情报输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'info', name: '客户沟通原始记录', value: '', height: 150, placeholder: '记录客户的需求、预算、决策链等描述...' },
            ],
          },
        },
        {
          id: 'process-bant',
          type: 'PROCESS',
          name: 'BANT 评分建模',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个资深销售总监。请根据 BANT 模型（Budget, Authority, Need, Timeline）对记录进行提取并评分。',
            userPrompt: '原始记录：{{线索情报输入.info}}',
          },
        },
        {
          id: 'process-pitch',
          type: 'PROCESS',
          name: '定制化转化话术',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个金牌销售。针对 BANT 评估中的薄弱项，设计一套能击中客户痛点的转化话术。',
            userPrompt: '线索画像：{{BANT 评分建模.result}}',
          },
        },
        {
          id: 'output-sale',
          type: 'OUTPUT',
          name: '销售战术手册',
          position: { x: 800, y: 300 },
          config: { format: 'markdown', prompt: '输出线索评分、成交概率及全套跟进话术。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-lead', target: 'process-bant' },
        { id: 'e2', source: 'process-bant', target: 'process-pitch' },
        { id: 'e3', source: 'process-pitch', target: 'output-sale' },
      ],
    },
  },

  {
    name: '商务邮件智能秘书 Agent',
    description: '不仅是回复，更能识别意图、检索历史话术库、自动拟定草稿并进行语气礼貌度审计',
    category: 'sales',
    tags: ['邮件助手', '意图识别', '商务礼仪'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-email',
          type: 'INPUT',
          name: '邮件正文',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'body', name: '收到的邮件内容', value: '', height: 200 }] },
        },
        {
          id: 'process-intent',
          type: 'PROCESS',
          name: '意图分类器',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '识别邮件意图（询价/投诉/合作/通知）。', userPrompt: '内容：{{邮件正文.body}}' },
        },
        {
          id: 'switch-type',
          type: 'SWITCH',
          name: '回复策略路由',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{意图分类器.type}}',
            cases: [
              { value: 'inquiry', label: '询价' },
              { value: 'complaint', label: '投诉' },
            ],
            defaultCase: 'general',
          },
        },
        {
          id: 'process-inquiry',
          type: 'PROCESS',
          name: '产品报价助手',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '结合产品价格表，生成标准报价回复。',
            knowledgeBaseId: 'PRODUCT_PRICE_KB',
          },
        },
        {
          id: 'process-complaint',
          type: 'PROCESS',
          name: '安抚与补偿策略',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '结合售后 SOP，生成道歉及补偿方案回复。',
            knowledgeBaseId: 'SERVICE_SOP_KB',
          },
        },
        {
          id: 'merge-reply',
          type: 'MERGE',
          name: '草稿汇总',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-tone',
          type: 'PROCESS',
          name: '语气润色审计',
          position: { x: 1300, y: 300 },
          config: { systemPrompt: '检查邮件语气是否商务、专业、礼貌。优化措辞。', userPrompt: '草稿：{{草稿汇总.result}}' },
        },
        {
          id: 'output-email',
          type: 'OUTPUT',
          name: '待发邮件草稿',
          position: { x: 1550, y: 300 },
          config: { format: 'text', prompt: '输出最终邮件内容。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-email', target: 'process-intent' },
        { id: 'e2', source: 'process-intent', target: 'switch-type' },
        { id: 'e3', source: 'switch-type', target: 'process-inquiry', sourceHandle: 'inquiry' },
        { id: 'e4', source: 'switch-type', target: 'process-complaint', sourceHandle: 'complaint' },
        { id: 'e5', source: 'process-inquiry', target: 'merge-reply' },
        { id: 'e6', source: 'process-complaint', target: 'merge-reply' },
        { id: 'e7', source: 'switch-type', target: 'merge-reply', sourceHandle: 'general' },
        { id: 'e8', source: 'merge-reply', target: 'process-tone' },
        { id: 'e9', source: 'process-tone', target: 'output-email' },
      ],
    },
  },

  // ============================================================
  // 10. 运营部门 (Operations)
  // ============================================================
  {
    name: '智能客服全自动化闭环 Agent',
    description: '集成多分类意图识别、ERP Mock 数据联动、RAG回复生成及质量审计回流的客服系统',
    category: 'operation',
    tags: ['客服 Agent', 'Mock集成', '自动化服务'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-chat',
          type: 'INPUT',
          name: '客户进线咨询',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'msg', name: '原始咨询文本', value: '', height: 100, placeholder: '客户说了什么...' }] },
        },
        {
          id: 'process-intent',
          type: 'PROCESS',
          name: '意图识别与优先级',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个智能分拣员。识别客户意图、订单号及情绪状态。',
            userPrompt: '内容：{{客户进线咨询.msg}}',
          },
        },
        {
          id: 'switch-intent',
          type: 'SWITCH',
          name: '业务路径导流',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{意图识别与优先级.category}}',
            cases: [{ value: 'logistic', label: '物流查询' }, { value: 'refund', label: '售后退款' }],
            defaultCase: 'general',
          },
        },
        {
          id: 'code-mock-erp',
          type: 'CODE',
          name: 'ERP 数据查询 (Mock)',
          position: { x: 800, y: 150 },
          config: {
            language: 'javascript',
            code: `try { return JSON.stringify({ order_sn: 'SN001', status: '已发货' }); } catch(e) { return '{}'; }`,
          },
        },
        {
          id: 'process-reply',
          type: 'PROCESS',
          name: 'RAG 智能回复引擎',
          position: { x: 1050, y: 300 },
          config: {
            systemPrompt: '你是一个顶级客服经理。结合实时业务数据和内部 SOP 知识库，生成精准回复。',
            userPrompt: '【原咨询】：{{客户进线咨询.msg}}\n【动态数据】：{{ERP 数据查询 (Mock).result}}',
            knowledgeBaseId: 'CORPORATE_SERVICE_KB',
          },
        },
        {
          id: 'process-critic',
          type: 'PROCESS',
          name: '回复内容审计 (QA)',
          position: { x: 1300, y: 300 },
          config: {
            systemPrompt: '你是一个质检专家。检查回复是否符合礼貌准则。如果合格输出 PASS，否则输出 REJECT。',
            userPrompt: '待审回复：{{RAG 智能回复引擎.result}}',
          },
        },
        {
          id: 'condition-audit',
          type: 'CONDITION',
          name: '审核门控',
          position: { x: 1550, y: 300 },
          config: {
            conditions: [{ variable: '{{回复内容审计 (QA).result}}', operator: 'contains', value: 'PASS' }],
          },
        },
        {
          id: 'output-final',
          type: 'OUTPUT',
          name: '最终回复推送',
          position: { x: 1800, y: 300 },
          config: { format: 'text', prompt: '回复内容通过 AI 审计，即刻发送至客户端。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-chat', target: 'process-intent' },
        { id: 'e2', source: 'process-intent', target: 'switch-intent' },
        { id: 'e3', source: 'switch-intent', target: 'code-mock-erp', sourceHandle: 'logistic' },
        { id: 'e4', source: 'code-mock-erp', target: 'process-reply' },
        { id: 'e5', source: 'switch-intent', target: 'process-reply', sourceHandle: 'general' },
        { id: 'e6', source: 'process-reply', target: 'process-critic' },
        { id: 'e7', source: 'process-critic', target: 'condition-audit' },
        { id: 'e8', source: 'condition-audit', target: 'output-final', sourceHandle: 'true' },
        { id: 'e9', source: 'condition-audit', target: 'process-reply', sourceHandle: 'false' },
      ],
    },
  },

  // ============================================================
  // 11. 研发部门 (R&D)
  // ============================================================
  {
    name: '代码安全与性能双重审计 Agent',
    description: '采用“扫描 -> 漏洞判定 -> 性能打分 -> 自动优化”的全链路技术保障体系',
    category: 'tech',
    tags: ['研发提效', '安全审计', '自动优化'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-code',
          type: 'INPUT',
          name: '源代码库片段',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'code', name: 'Code Snippet', value: '', height: 250 }] },
        },
        {
          id: 'process-sec',
          type: 'PROCESS',
          name: '安全漏洞扫描器',
          position: { x: 300, y: 150 },
          config: { systemPrompt: '你是一个资深安全工程师。请扫描代码中的注入风险。', userPrompt: '待扫代码：{{源代码库片段.code}}' },
        },
        {
          id: 'process-perf',
          type: 'PROCESS',
          name: '性能瓶颈分析仪',
          position: { x: 300, y: 450 },
          config: { systemPrompt: '你是一个架构师。分析代码的时间/空间复杂度。', userPrompt: '待析代码：{{源代码库片段.code}}' },
        },
        {
          id: 'merge-tech',
          type: 'MERGE',
          name: '审计汇总',
          position: { x: 600, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-fix',
          type: 'PROCESS',
          name: '自动优化代码建议',
          position: { x: 850, y: 300 },
          config: {
            systemPrompt: '你是一个资深工程师。请结合安全和性能审计结果，输出优化后的重构代码。',
            userPrompt: '审计结果汇总：{{审计汇总.result}}',
          },
        },
        {
          id: 'output-tech',
          type: 'OUTPUT',
          name: '技术对审报告',
          position: { x: 1100, y: 300 },
          config: { format: 'markdown', prompt: '输出完整审计明细及重构代码。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-code', target: 'process-sec' },
        { id: 'e2', source: 'input-code', target: 'process-perf' },
        { id: 'e3', source: 'process-sec', target: 'merge-tech' },
        { id: 'e4', source: 'process-perf', target: 'merge-tech' },
        { id: 'e5', source: 'merge-tech', target: 'process-fix' },
        { id: 'e6', source: 'process-fix', target: 'output-tech' },
      ],
    },
  },

  // ============================================================
  // 12. 生产制造 (Manufacturing)
  // ============================================================
  {
    name: '生产线异常诊断与快速响应系统',
    description: '集成实时数据分析、专家级故障诊断及自动通知闭环的工厂管理 Agent',
    category: 'production',
    tags: ['工业4.0', '故障诊断', '实时响应'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'data-prod',
          type: 'DATA',
          name: '实时生产数据',
          position: { x: 50, y: 300 },
          config: { prompt: '导入当前班次的设备稼动率、合格率及传感器报警明细' },
        },
        {
          id: 'process-diag',
          type: 'PROCESS',
          name: 'AI 故障根本原因分析',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个资深生产主管。请根据数据判定异常是由于原材料、人为操作还是设备损耗引起的。',
            userPrompt: '异常数据：{{实时生产数据.content}}',
            knowledgeBaseId: 'MAINTENANCE_MANUAL_KB',
          },
        },
        {
          id: 'switch-level',
          type: 'SWITCH',
          name: '风险分级',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{AI 故障根本原因分析.severity}}',
            cases: [{ value: 'critical', label: '停机级事故' }, { value: 'warning', label: '质量波动' }],
            defaultCase: 'info',
          },
        },
        {
          id: 'notify-engineer',
          type: 'NOTIFICATION',
          name: '即时报警推送',
          position: { x: 800, y: 150 },
          config: { provider: 'FEISHU', content: '【红色警报】{{实时生产数据.line_name}} 发生停机级事故！诊断原因：{{AI 故障根本原因分析.reason}}。' },
        },
        {
          id: 'process-sop',
          type: 'PROCESS',
          name: '标准作业引导生成',
          position: { x: 800, y: 450 },
          config: { systemPrompt: '生成具体的现场紧急处置 SOP 步骤。', userPrompt: '针对此异常提供方案：{{AI 故障根本原因分析.result}}' },
        },
        {
          id: 'merge-prod',
          type: 'MERGE',
          name: '调度汇总',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-prod',
          type: 'OUTPUT',
          name: '生产调度简报',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出当日生产状况及异常处理进度。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-prod', target: 'process-diag' },
        { id: 'e2', source: 'process-diag', target: 'switch-level' },
        { id: 'e3', source: 'switch-level', target: 'notify-engineer', sourceHandle: 'critical' },
        { id: 'e4', source: 'switch-level', target: 'process-sop', sourceHandle: 'warning' },
        { id: 'e5', source: 'switch-level', target: 'merge-prod', sourceHandle: 'info' },
        { id: 'e6', source: 'notify-engineer', target: 'merge-prod' },
        { id: 'e7', source: 'process-sop', target: 'merge-prod' },
        { id: 'e8', source: 'merge-prod', target: 'output-prod' },
      ],
    },
  },

  // ============================================================
  // 13. 供应链/采购 (Procurement)
  // ============================================================
  {
    name: '供应商合规与表现智能雷达',
    description: '深度穿透供应商信息，自动进行合规扫描、财务稳健性评估及评分',
    category: 'procurement',
    tags: ['风控', '供应商管理', '合规'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-vendor',
          type: 'INPUT',
          name: '供应商基础资料',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'name', name: '供应商全称', value: '' }, { id: 'bid', name: '报价明细', value: '', height: 100 }] },
        },
        {
          id: 'code-mock-crawl',
          type: 'CODE',
          name: '全网负面信息扫描 (Mock)',
          position: { x: 300, y: 150 },
          config: {
            language: 'javascript',
            code: 'return "【模拟爬虫结果】未发现该企业有重大法律诉讼或行政处罚记录。信用评级：AAA。";',
          },
        },
        {
          id: 'process-evaluate',
          type: 'PROCESS',
          name: 'AI 综合评分建模',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个资深采购专家。请结合外部负面信息和企业内部历史合作评价，对供应商进行多维评分。',
            userPrompt: '【报价】：{{供应商基础资料.bid}}\n【舆情】：{{全网负面信息扫描 (Mock).result}}',
            knowledgeBaseId: 'INTERNAL_VENDOR_HISTORY_KB',
          },
        },
        {
          id: 'condition-blacklist',
          type: 'CONDITION',
          name: '黑名单门控',
          position: { x: 800, y: 300 },
          config: { conditions: [{ variable: '{{AI 综合评分建模.total_score}}', operator: 'less_than', value: '60' }] },
        },
        {
          id: 'output-proc',
          type: 'OUTPUT',
          name: '准入审核报告',
          position: { x: 1100, y: 300 },
          config: { format: 'pdf', prompt: '输出正式的供应商准入评估建议书。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-vendor', target: 'code-mock-crawl' },
        { id: 'e2', source: 'input-vendor', target: 'process-evaluate' },
        { id: 'e3', source: 'code-mock-crawl', target: 'process-evaluate' },
        { id: 'e4', source: 'process-evaluate', target: 'condition-blacklist' },
        { id: 'e5', source: 'condition-blacklist', target: 'output-proc' },
      ],
    },
  },

  // ============================================================
  // 14. 新媒体 (New Media)
  // ============================================================
  {
    name: '全网趋势捕捉与多端爆文引擎',
    description: '识别最新热点，自动适配不同平台调性，并一键生成高审美配图提示词',
    category: 'operation',
    tags: ['新媒体', '流量密码', 'AI扩文'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-trend',
          type: 'INPUT',
          name: '选题/热点关键词',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'topic', name: '选题方向', value: '' }] },
        },
        {
          id: 'process-draft',
          type: 'PROCESS',
          name: '核心语义与金句建模',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '提取该选题在社会心理学层面的共鸣点，并创作 5 个爆款金句。', userPrompt: '话题：{{选题/热点关键词.topic}}' },
        },
        {
          id: 'switch-platform',
          type: 'SWITCH',
          name: '平台分发适配',
          position: { x: 550, y: 300 },
          config: {
            variable: 'PLATFORM_SELECTOR', // 外部环境变量
            cases: [
              { value: 'RED', label: '小红书种草' },
              { value: 'WECHAT', label: '公众号深文' },
            ],
            defaultCase: 'SHORT_VIDEO',
          },
        },
        {
          id: 'process-red',
          type: 'PROCESS',
          name: '小红书高点赞改写',
          position: { x: 800, y: 150 },
          config: { systemPrompt: '多用 Emoji，语感亲和，制造紧迫感。' },
        },
        {
          id: 'image-gen-1',
          type: 'IMAGE_GEN',
          name: 'AI 爆款封面生成',
          position: { x: 1050, y: 300 },
          config: { provider: 'OPENAI', model: 'dall-e-3', size: '1024x1792', quality: 'hd' },
        },
        {
          id: 'output-content',
          type: 'OUTPUT',
          name: '多平台内容包',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出排版后的文案及封面图。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-trend', target: 'process-draft' },
        { id: 'e2', source: 'process-draft', target: 'switch-platform' },
        { id: 'e3', source: 'switch-platform', target: 'process-red', sourceHandle: 'RED' },
        { id: 'e4', source: 'process-red', target: 'image-gen-1' },
        { id: 'e5', source: 'image-gen-1', target: 'output-content' },
      ],
    },
  },

  // ============================================================
  // 15. 创意设计 (Design)
  // ============================================================
  {
    name: '视觉创意进化与审美审计 Agent',
    description: '深度拆解设计 Brief，通过“生成 -> 审美评价 -> 自动微调”循环实现高审美产出',
    category: 'ai-processing',
    tags: ['AIGC', '设计赋能', '审美对标'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-brief',
          type: 'INPUT',
          name: '创意 Brief',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'desc', name: '视觉风格与需求描述', value: '', height: 100 }] },
        },
        {
          id: 'process-concept',
          type: 'PROCESS',
          name: '视觉元素拆解',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '将模糊的文字描述转化为具体的构图、色彩、光影、材质参数。' },
        },
        {
          id: 'image-gen-base',
          type: 'IMAGE_GEN',
          name: '初版视觉生成',
          position: { x: 550, y: 300 },
          config: { provider: 'STABILITYAI', model: 'stable-diffusion-xl-1024-v1-0' },
        },
        {
          id: 'process-critic-ux',
          type: 'PROCESS',
          name: '审美专家审计',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '你是一个顶级艺术总监。请评价初版图片的色彩平衡、构图张力及是否符合原始 Brief。如果不合格，请输出优化后的 Prompt 增强指令。',
            userPrompt: '初版图片：{{初版视觉生成.image_url}}\n原始需求：{{创意 Brief.desc}}',
          },
        },
        {
          id: 'condition-perfect',
          type: 'CONDITION',
          name: '是否达标',
          position: { x: 1050, y: 300 },
          config: { conditions: [{ variable: '{{审美专家审计.score}}', operator: 'greater_than', value: '90' }] },
        },
        {
          id: 'output-design',
          type: 'OUTPUT',
          name: '终稿设计方案',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出最终视觉稿及其创意说明。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-brief', target: 'process-concept' },
        { id: 'e2', source: 'process-concept', target: 'image-gen-base' },
        { id: 'e3', source: 'image-gen-base', target: 'process-critic-ux' },
        { id: 'e4', source: 'process-critic-ux', target: 'condition-perfect' },
        { id: 'e5', source: 'condition-perfect', target: 'output-design', sourceHandle: 'true' },
        { id: 'e6', source: 'condition-perfect', target: 'image-gen-base', sourceHandle: 'false' }, // 不达标则重绘
      ],
    },
  },

  // ============================================================
  // 16. 行政部门 (Admin)
  // ============================================================
  {
    name: '企业级会议决策追踪系统',
    description: '不只是纪要生成，更是对决策一致性判定及待办任务自动分发的行政中枢',
    category: 'admin',
    tags: ['行政提效', '决策追踪', '自动分发'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-audio',
          type: 'AUDIO',
          name: '会议录音转文字',
          position: { x: 50, y: 300 },
          config: { prompt: '上传会议现场录音' },
        },
        {
          id: 'process-digest',
          type: 'PROCESS',
          name: '多维要点提取',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个会议秘书。提取核心议题、关键观点、达成的共识及待办。',
            userPrompt: '文字记录：{{会议录音转文字.content}}',
          },
        },
        {
          id: 'process-conflict',
          type: 'PROCESS',
          name: '决策冲突审计',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个风控官。请检查当前会议决策是否与历史会议决策存在冲突。',
            userPrompt: '当前决策：{{多维要点提取.decisions}}',
            knowledgeBaseId: 'HISTORY_MEETING_KB',
          },
        },
        {
          id: 'output-admin',
          type: 'OUTPUT',
          name: '行政决策白皮书',
          position: { x: 800, y: 300 },
          config: { format: 'pdf', prompt: '输出正式纪要及决策风险提示。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-audio', target: 'process-digest' },
        { id: 'e2', source: 'process-digest', target: 'process-conflict' },
        { id: 'e3', source: 'process-conflict', target: 'output-admin' },
      ],
    },
  },

  {
    name: '团队周报智能聚合与效能分析 Agent',
    description: '从 Jira/Git 等多源数据中聚合周报，并自动分析团队效能瓶颈',
    category: 'admin',
    tags: ['效能分析', '自动周报', '团队管理'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-text',
          type: 'INPUT',
          name: '成员周报汇总',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'text', name: '各成员提交内容', value: '', height: 200 }] },
        },
        {
          id: 'code-mock-jira',
          type: 'CODE',
          name: 'Jira 数据同步 (Mock)',
          position: { x: 300, y: 150 },
          config: {
            language: 'javascript',
            code: 'return JSON.stringify({ completed: 15, delayed: 3, bugs: 2 });',
          },
        },
        {
          id: 'process-insight',
          type: 'PROCESS',
          name: '效能瓶颈诊断',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '结合成员周报和 Jira 数据，分析本周团队的主要风险点和效率瓶颈。',
            userPrompt: '周报：{{成员周报汇总.text}}\nJira数据：{{Jira 数据同步 (Mock).result}}',
          },
        },
        {
          id: 'switch-risk',
          type: 'SWITCH',
          name: '风险预警',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{效能瓶颈诊断.risk_level}}',
            cases: [{ value: 'high', label: '高风险' }],
            defaultCase: 'normal',
          },
        },
        {
          id: 'notify-pm',
          type: 'NOTIFICATION',
          name: '项目经理预警',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '【周报预警】团队本周存在严重延期风险：{{效能瓶颈诊断.summary}}' },
        },
        {
          id: 'output-report',
          type: 'OUTPUT',
          name: '团队周报',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出包含进度、风险和下周计划的完整周报。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-text', target: 'process-insight' },
        { id: 'e2', source: 'code-mock-jira', target: 'process-insight' },
        { id: 'e3', source: 'process-insight', target: 'switch-risk' },
        { id: 'e4', source: 'switch-risk', target: 'notify-pm', sourceHandle: 'high' },
        { id: 'e5', source: 'switch-risk', target: 'output-report', sourceHandle: 'normal' },
        { id: 'e6', source: 'notify-pm', target: 'output-report' },
      ],
    },
  },

  // ============================================================
  // 17. 人力资源 (HR)
  // ============================================================
  {
    name: '全流程智能招聘 Agent',
    description: '从简历筛选到定制化面试题生成的一站式人才甄选系统',
    category: 'hr',
    tags: ['招聘自动化', '简历对标', '精准人才洞察'],
    config: {
      version: 3,
      nodes: [
        {
          id: 'input-jd',
          type: 'INPUT',
          name: '岗位画像定义',
          position: { x: 50, y: 150 },
          config: { fields: [{ id: 'jd', name: '岗位职责与要求', value: '', height: 100, placeholder: '请粘贴 JD...' }] },
        },
        {
          id: 'input-resumes',
          type: 'DATA',
          name: '候选人简历导入',
          position: { x: 50, y: 450 },
          config: { prompt: '请上传 PDF 或 Excel 格式的简历列表' },
        },
        {
          id: 'loop-process',
          type: 'LOOP',
          name: '批量筛选引擎',
          position: { x: 350, y: 300 },
          config: { loopType: 'FOR', forConfig: { arrayVariable: '{{候选人简历导入.files}}', itemName: 'resume' } },
        },
        {
          id: 'process-match',
          type: 'PROCESS',
          name: 'AI 精准对标',
          position: { x: 600, y: 300 },
          config: {
            systemPrompt: '你是一个资深猎头。请根据 JD 对当前简历进行深度匹配，评估技能重合度、行业稀缺度。',
            userPrompt: '【JD】：{{岗位画像定义.jd}}\n【当前简历】：{{loop.resume.content}}',
          },
        },
        {
          id: 'process-questions',
          type: 'PROCESS',
          name: '候选人专供面试卷',
          position: { x: 850, y: 300 },
          config: {
            systemPrompt: '你是一个面试官。请针对该候选人的简历亮点或薄弱项，生成 5 个能测出真实水平的行为面试题 (STAR 原则)。',
            userPrompt: '简历分析：{{AI 精准对标.result}}',
          },
        },
        {
          id: 'output-hr',
          type: 'OUTPUT',
          name: '候选人评估全集',
          position: { x: 1100, y: 300 },
          config: { format: 'json', prompt: '汇总输出所有候选人的多维打分、优势分析及定制化笔试试题。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-jd', target: 'loop-process' },
        { id: 'e2', source: 'input-resumes', target: 'loop-process' },
        { id: 'e3', source: 'loop-process', target: 'process-match', sourceHandle: 'body' },
        { id: 'e4', source: 'process-match', target: 'process-questions' },
        { id: 'e5', source: 'process-questions', target: 'output-hr', sourceHandle: 'done' },
      ],
    },
  },

  {
    name: '新员工入职全流程导航 Agent',
    description: '自动化生成入职指引、分配资产并通知相关部门，打造丝滑入职体验',
    category: 'hr',
    tags: ['入职', '员工体验', '流程自动化'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-newhire',
          type: 'INPUT',
          name: '新员工信息',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'role', name: '岗位', value: '' }, { id: 'name', name: '姓名', value: '' }] },
        },
        {
          id: 'process-plan',
          type: 'PROCESS',
          name: '成长路径规划',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '生成 30/60/90 天融入计划。', userPrompt: '岗位：{{新员工信息.role}}' },
        },
        {
          id: 'code-asset',
          type: 'CODE',
          name: '资产分配规则',
          position: { x: 550, y: 150 },
          config: {
            language: 'javascript',
            code: 'const role = context.input_newhire.role; if(role.includes("设计")) return "MacBook Pro + 4K 显示器"; return "MacBook Air";',
          },
        },
        {
          id: 'notify-it',
          type: 'NOTIFICATION',
          name: 'IT 资产准备通知',
          position: { x: 800, y: 150 },
          config: { provider: 'FEISHU', content: '新员工 {{新员工信息.name}} 入职，请准备：{{资产分配规则.result}}' },
        },
        {
          id: 'output-guide',
          type: 'OUTPUT',
          name: '入职指引手册',
          position: { x: 800, y: 450 },
          config: { format: 'markdown', prompt: '生成包含欢迎信、融入计划及办公指引的手册。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-newhire', target: 'process-plan' },
        { id: 'e2', source: 'input-newhire', target: 'code-asset' },
        { id: 'e3', source: 'code-asset', target: 'notify-it' },
        { id: 'e4', source: 'process-plan', target: 'output-guide' },
      ],
    },
  },

  // ============================================================
  // 新增：10 个高价值垂直领域 Agent
  // ============================================================

  // 22. 法务：IP 侵权监测
  {
    name: '知识产权 (IP) 侵权监测与维权 Agent',
    description: '自动抓取全网图片/文案，利用多模态模型比对确权，自动生成律师函',
    category: 'legal',
    tags: ['IP保护', '侵权监测', '维权自动化'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-ip',
          type: 'INPUT',
          name: '知识产权信息',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'url', name: '作品链接', value: '' }, { id: 'owner', name: '权利人', value: '' }] },
        },
        {
          id: 'http-search',
          type: 'HTTP',
          name: '全网相似图检索',
          position: { x: 300, y: 300 },
          config: { method: 'GET', url: 'https://api.image-search.com/v1/find?img={{知识产权信息.url}}' },
        },
        {
          id: 'process-compare',
          type: 'PROCESS',
          name: '侵权判定',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '对比两张图片的相似度，判定是否构成侵权。', userPrompt: '原图：{{知识产权信息.url}}\n疑似图：{{全网相似图检索.body}}' },
        },
        {
          id: 'condition-infringe',
          type: 'CONDITION',
          name: '侵权确认',
          position: { x: 800, y: 300 },
          config: { conditions: [{ variable: '{{侵权判定.is_infringing}}', operator: 'equals', value: 'true' }] },
        },
        {
          id: 'process-letter',
          type: 'PROCESS',
          name: '律师函生成',
          position: { x: 1050, y: 300 },
          config: { systemPrompt: '生成正式的侵权告知函。', userPrompt: '侵权证据：{{侵权判定.evidence}}' },
        },
        {
          id: 'output-legal',
          type: 'OUTPUT',
          name: '维权材料包',
          position: { x: 1300, y: 300 },
          config: { format: 'pdf', prompt: '输出律师函及证据链截图。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-ip', target: 'http-search' },
        { id: 'e2', source: 'http-search', target: 'process-compare' },
        { id: 'e3', source: 'process-compare', target: 'condition-infringe' },
        { id: 'e4', source: 'condition-infringe', target: 'process-letter', sourceHandle: 'true' },
        { id: 'e5', source: 'process-letter', target: 'output-legal' },
      ],
    },
  },

  // 23. 财务：发票稽核
  {
    name: '发票智能稽核与税务风控 Agent',
    description: 'OCR 识别发票，自动联网验真，并根据税法库检查抵扣合规性',
    category: 'finance',
    tags: ['税务风控', 'OCR', '发票验真'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-invoice',
          type: 'IMAGE',
          name: '发票上传',
          position: { x: 50, y: 300 },
          config: { prompt: '上传发票照片或 PDF' },
        },
        {
          id: 'process-ocr',
          type: 'PROCESS',
          name: 'OCR 结构化识别',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '提取发票代码、号码、金额、开票日期。', userPrompt: '图片：{{发票上传.url}}' },
        },
        {
          id: 'http-tax',
          type: 'HTTP',
          name: '国税局验真接口',
          position: { x: 550, y: 300 },
          config: { method: 'POST', url: 'https://api.tax.gov.cn/verify', body: { content: '{{OCR 结构化识别.json}}' } },
        },
        {
          id: 'process-risk',
          type: 'PROCESS',
          name: '抵扣合规性审查',
          position: { x: 800, y: 300 },
          config: { systemPrompt: '检查该类目是否允许抵扣进项税。', knowledgeBaseId: 'TAX_LAW_KB' },
        },
        {
          id: 'output-audit',
          type: 'OUTPUT',
          name: '稽核报告',
          position: { x: 1050, y: 300 },
          config: { format: 'json', prompt: '输出验真结果及合规性判定。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-invoice', target: 'process-ocr' },
        { id: 'e2', source: 'process-ocr', target: 'http-tax' },
        { id: 'e3', source: 'http-tax', target: 'process-risk' },
        { id: 'e4', source: 'process-risk', target: 'output-audit' },
      ],
    },
  },

  // 24. 研发：DevOps 自愈
  {
    name: '自动化 DevOps 故障自愈 Agent',
    description: '监控日志报警，自动分析堆栈，匹配知识库中的解决方案，尝试自动修复',
    category: 'tech',
    tags: ['DevOps', '故障自愈', 'SRE'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-log',
          type: 'INPUT',
          name: '报警日志',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'log', name: '错误堆栈', value: '', height: 200 }] },
        },
        {
          id: 'process-root',
          type: 'PROCESS',
          name: '根因分析',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '分析日志堆栈，定位是代码 Bug 还是环境问题（如 OOM）。', userPrompt: '日志：{{报警日志.log}}' },
        },
        {
          id: 'process-fix',
          type: 'PROCESS',
          name: '修复方案匹配',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '匹配 SRE 知识库，寻找修复脚本。', knowledgeBaseId: 'SRE_KB' },
        },
        {
          id: 'code-exec',
          type: 'CODE',
          name: '自愈脚本执行 (Mock)',
          position: { x: 800, y: 300 },
          config: { language: 'shell', code: 'echo "Executing restart pod..."' },
        },
        {
          id: 'notify-sre',
          type: 'NOTIFICATION',
          name: '修复结果通知',
          position: { x: 1050, y: 300 },
          config: { provider: 'DINGTALK', content: '故障 {{process-root.issue}} 已尝试自动修复，结果：{{code-exec.result}}' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-log', target: 'process-root' },
        { id: 'e2', source: 'process-root', target: 'process-fix' },
        { id: 'e3', source: 'process-fix', target: 'code-exec' },
        { id: 'e4', source: 'code-exec', target: 'notify-sre' },
      ],
    },
  },

  // 25. 市场：竞品反向工程
  {
    name: '竞品广告投放策略反向工程 Agent',
    description: '分析竞品广告素材，反推其投放人群、卖点及预算策略',
    category: 'marketing',
    tags: ['竞品分析', '反向工程', '投放策略'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-ad',
          type: 'IMAGE',
          name: '竞品广告截图',
          position: { x: 50, y: 300 },
          config: { prompt: '上传竞品广告素材' },
        },
        {
          id: 'process-decode',
          type: 'PROCESS',
          name: '视觉策略解构',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '分析广告图的受众画像、核心利益点（USP）和视觉诱导路径。', userPrompt: '图片：{{竞品广告截图.url}}' },
        },
        {
          id: 'process-infer',
          type: 'PROCESS',
          name: '投放策略推演',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '基于素材风格，反推其可能的投放渠道（抖音/小红书/百度）和预算量级。' },
        },
        {
          id: 'output-strategy',
          type: 'OUTPUT',
          name: '反制策略报告',
          position: { x: 800, y: 300 },
          config: { format: 'markdown', prompt: '输出竞品策略拆解及我方应对建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-ad', target: 'process-decode' },
        { id: 'e2', source: 'process-decode', target: 'process-infer' },
        { id: 'e3', source: 'process-infer', target: 'output-strategy' },
      ],
    },
  },

  // 26. 销售：KA 背调
  {
    name: '大客户 (KA) 深度背景调查 Agent',
    description: '聚合工商信息、新闻舆情、年报数据，生成 360 度客户画像及谈资',
    category: 'sales',
    tags: ['KA销售', '客户背调', '商机挖掘'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-company',
          type: 'INPUT',
          name: '客户名称',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'name', name: '企业全称', value: '' }] },
        },
        {
          id: 'http-info',
          type: 'HTTP',
          name: '工商数据聚合',
          position: { x: 300, y: 300 },
          config: { method: 'GET', url: 'https://api.business-data.com/v1/profile?name={{客户名称.name}}' },
        },
        {
          id: 'process-insight',
          type: 'PROCESS',
          name: '痛点与机会挖掘',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '分析财报和舆情，找出该企业当前的战略痛点和采购需求。' },
        },
        {
          id: 'output-dossier',
          type: 'OUTPUT',
          name: '销售作战档案',
          position: { x: 800, y: 300 },
          config: { format: 'markdown', prompt: '生成包含组织架构、财务状况及切入点建议的档案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-company', target: 'http-info' },
        { id: 'e2', source: 'http-info', target: 'process-insight' },
        { id: 'e3', source: 'process-insight', target: 'output-dossier' },
      ],
    },
  },

  // 27. HR：离职预测
  {
    name: '员工离职预测与关怀 Agent',
    description: '分析员工考勤、绩效及行为数据（脱敏），识别离职风险，生成访谈话术',
    category: 'hr',
    tags: ['人才保留', '风险预测', '员工关怀'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-behavior',
          type: 'DATA',
          name: '员工行为数据',
          position: { x: 50, y: 300 },
          config: { prompt: '导入打卡记录、加班时长及绩效评分' },
        },
        {
          id: 'code-analyze',
          type: 'CODE',
          name: '风险特征提取',
          position: { x: 300, y: 300 },
          config: { language: 'python', code: '# 计算缺勤率变化斜率...' },
        },
        {
          id: 'process-predict',
          type: 'PROCESS',
          name: '离职概率预测',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '基于行为特征，预测离职概率。' },
        },
        {
          id: 'switch-action',
          type: 'SWITCH',
          name: '干预策略',
          position: { x: 800, y: 300 },
          config: { variable: '{{离职概率预测.prob}}', cases: [{ value: 'high', label: '高风险-访谈' }] },
        },
        {
          id: 'output-script',
          type: 'OUTPUT',
          name: '关怀访谈提纲',
          position: { x: 1050, y: 300 },
          config: { format: 'markdown', prompt: '生成针对性的挽留或关怀话术。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-behavior', target: 'code-analyze' },
        { id: 'e2', source: 'code-analyze', target: 'process-predict' },
        { id: 'e3', source: 'process-predict', target: 'switch-action' },
        { id: 'e4', source: 'switch-action', target: 'output-script', sourceHandle: 'high' },
      ],
    },
  },

  // 28. 供应链：智能补货
  {
    name: '库存智能补货与调拨 Agent',
    description: '基于历史销量预测未来需求，结合当前库存，自动生成补货单或调拨建议',
    category: 'procurement',
    tags: ['供应链', '库存优化', '自动补货'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-sales',
          type: 'DATA',
          name: '销量与库存数据',
          position: { x: 50, y: 300 },
          config: { prompt: '导入过去 90 天销量及当前库存' },
        },
        {
          id: 'process-forecast',
          type: 'PROCESS',
          name: '销量预测模型',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '预测未来 30 天的 SKU 销量。' },
        },
        {
          id: 'code-calc',
          type: 'CODE',
          name: '补货量计算',
          position: { x: 550, y: 300 },
          config: { language: 'javascript', code: 'return Math.max(0, forecast - current_stock);' },
        },
        {
          id: 'output-order',
          type: 'OUTPUT',
          name: '补货建议单',
          position: { x: 800, y: 300 },
          config: { format: 'excel', prompt: '输出 SKU 补货数量建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-sales', target: 'process-forecast' },
        { id: 'e2', source: 'process-forecast', target: 'code-calc' },
        { id: 'e3', source: 'code-calc', target: 'output-order' },
      ],
    },
  },

  // 29. 行政：差旅优化
  {
    name: '企业差旅合规与成本优化 Agent',
    description: '比对机票/酒店价格与差旅标准，推荐最优组合，识别违规行程',
    category: 'admin',
    tags: ['差旅管理', '成本控制', '合规'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-trip',
          type: 'INPUT',
          name: '行程需求',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'dest', name: '目的地', value: '' }, { id: 'date', name: '日期', value: '' }] },
        },
        {
          id: 'http-price',
          type: 'HTTP',
          name: '实时比价聚合',
          position: { x: 300, y: 300 },
          config: { method: 'GET', url: 'https://api.travel.com/prices' },
        },
        {
          id: 'process-policy',
          type: 'PROCESS',
          name: '差标合规校验',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '筛选符合职级差标的选项。', knowledgeBaseId: 'TRAVEL_POLICY_KB' },
        },
        {
          id: 'output-plan',
          type: 'OUTPUT',
          name: '最优预订方案',
          position: { x: 800, y: 300 },
          config: { format: 'markdown', prompt: '推荐性价比最高的 3 个机酒组合。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-trip', target: 'http-price' },
        { id: 'e2', source: 'http-price', target: 'process-policy' },
        { id: 'e3', source: 'process-policy', target: 'output-plan' },
      ],
    },
  },

  // 30. 客服：危机公关
  {
    name: '投诉危机公关处理 Agent',
    description: '针对重大客诉（如社媒曝光），生成危机公关声明及全员应对口径',
    category: 'operation',
    tags: ['危机公关', '舆情应对', 'SOP'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-crisis',
          type: 'INPUT',
          name: '危机事件描述',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'desc', name: '事件经过', value: '', height: 200 }] },
        },
        {
          id: 'process-level',
          type: 'PROCESS',
          name: '危机分级',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '评估事件的严重程度（P0-P4）。' },
        },
        {
          id: 'process-pr',
          type: 'PROCESS',
          name: '公关声明生成',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '基于 5S 原则生成对外声明和对内口径。' },
        },
        {
          id: 'output-pkg',
          type: 'OUTPUT',
          name: '危机应对包',
          position: { x: 800, y: 300 },
          config: { format: 'markdown', prompt: '输出包含声明、Q&A 及行动指南的文档。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-crisis', target: 'process-level' },
        { id: 'e2', source: 'process-level', target: 'process-pr' },
        { id: 'e3', source: 'process-pr', target: 'output-pkg' },
      ],
    },
  },

  // 31. 运营：私域操盘
  {
    name: '私域社群活跃度操盘 Agent',
    description: '分析群聊话题，自动生成每日话题、互动游戏及种草文案',
    category: 'operation',
    tags: ['私域运营', '社群活跃', '自动化'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-chat',
          type: 'DATA',
          name: '群聊记录导出',
          position: { x: 50, y: 300 },
          config: { prompt: '上传最近 3 天的群聊记录文本' },
        },
        {
          id: 'process-topic',
          type: 'PROCESS',
          name: '兴趣话题聚类',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '分析用户最感兴趣的话题点。' },
        },
        {
          id: 'process-game',
          type: 'PROCESS',
          name: '互动游戏设计',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '设计一个与话题相关的轻量级互动游戏或话题接龙。' },
        },
        {
          id: 'output-sop',
          type: 'OUTPUT',
          name: '今日运营 SOP',
          position: { x: 800, y: 300 },
          config: { format: 'markdown', prompt: '输出分时段的运营话术表。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-chat', target: 'process-topic' },
        { id: 'e2', source: 'process-topic', target: 'process-game' },
        { id: 'e3', source: 'process-game', target: 'output-sop' },
      ],
    },
  },

  // ============================================================
  // 新增：第 32-41 号企业级 AES 标准模板
  // ============================================================

  // 32. 法务：隐私合规与 GDPR 审计
  {
    name: '隐私合规与 GDPR 审计 Agent',
    description: '自动扫描隐私协议、Cookie 政策等文档，对比 GDPR/CCPA 法规库，识别合规缺口',
    category: 'legal',
    tags: ['隐私保护', 'GDPR', '合规审计'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-policy',
          type: 'INPUT',
          name: '隐私政策文本',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'text', name: '隐私协议全文', value: '', height: 250 }, { id: 'region', name: '适用地区', value: 'EU' }] },
        },
        {
          id: 'process-extract',
          type: 'PROCESS',
          name: '关键条款提取',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '提取数据收集范围、存储期限、第三方共享、用户权利（删除/可携带）等核心条款。', userPrompt: '协议文本：{{隐私政策文本.text}}' },
        },
        {
          id: 'process-rag-gdpr',
          type: 'PROCESS',
          name: 'GDPR 法规检索',
          position: { x: 550, y: 150 },
          config: { systemPrompt: '检索 GDPR 相关条款要求。', userPrompt: '地区：{{隐私政策文本.region}}', knowledgeBaseId: 'GDPR_REGULATION_KB' },
        },
        {
          id: 'process-gap',
          type: 'PROCESS',
          name: '合规缺口分析',
          position: { x: 800, y: 300 },
          config: { systemPrompt: '你是一个隐私合规专家。对比提取条款与法规要求，列出所有合规缺口及严重等级。', userPrompt: '【当前条款】：{{关键条款提取.result}}\n【法规要求】：{{GDPR 法规检索.result}}' },
        },
        {
          id: 'switch-severity',
          type: 'SWITCH',
          name: '风险分级',
          position: { x: 1050, y: 300 },
          config: { variable: '{{合规缺口分析.max_severity}}', cases: [{ value: 'critical', label: '严重违规' }, { value: 'high', label: '高风险' }], defaultCase: 'medium' },
        },
        {
          id: 'notify-dpo',
          type: 'NOTIFICATION',
          name: 'DPO 紧急警报',
          position: { x: 1300, y: 150 },
          config: { provider: 'FEISHU', content: '【隐私合规警报】发现严重违规缺口，请 DPO 立即介入！' },
        },
        {
          id: 'process-fix',
          type: 'PROCESS',
          name: '修复建议生成',
          position: { x: 1300, y: 450 },
          config: { systemPrompt: '为每个合规缺口生成具体的条款修改建议。', userPrompt: '缺口列表：{{合规缺口分析.gaps}}' },
        },
        {
          id: 'merge-report',
          type: 'MERGE',
          name: '报告汇聚',
          position: { x: 1550, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-audit',
          type: 'OUTPUT',
          name: 'GDPR 审计报告',
          position: { x: 1800, y: 300 },
          config: { format: 'pdf', prompt: '输出包含缺口清单、严重等级及修复建议的正式审计报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-policy', target: 'process-extract' },
        { id: 'e2', source: 'process-extract', target: 'process-rag-gdpr' },
        { id: 'e3', source: 'process-rag-gdpr', target: 'process-gap' },
        { id: 'e4', source: 'process-extract', target: 'process-gap' },
        { id: 'e5', source: 'process-gap', target: 'switch-severity' },
        { id: 'e6', source: 'switch-severity', target: 'notify-dpo', sourceHandle: 'critical' },
        { id: 'e7', source: 'switch-severity', target: 'process-fix', sourceHandle: 'high' },
        { id: 'e8', source: 'switch-severity', target: 'process-fix', sourceHandle: 'medium' },
        { id: 'e9', source: 'notify-dpo', target: 'merge-report' },
        { id: 'e10', source: 'process-fix', target: 'merge-report' },
        { id: 'e11', source: 'merge-report', target: 'output-audit' },
      ],
    },
  },

  // 33. 市场：品牌联名策划
  {
    name: '品牌联名 (Co-branding) 策划 Agent',
    description: '基于双方品牌调性分析，自动生成联名创意方案、营销 SOP 及风险预警',
    category: 'marketing',
    tags: ['品牌联名', '跨界营销', '创意策划'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-brands',
          type: 'INPUT',
          name: '联名品牌信息',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'brand_a', name: '我方品牌', value: '' }, { id: 'brand_b', name: '合作品牌', value: '' }, { id: 'goal', name: '联名目标', value: '提升年轻用户认知' }] },
        },
        {
          id: 'process-analyze-a',
          type: 'PROCESS',
          name: '我方品牌调性分析',
          position: { x: 300, y: 150 },
          config: { systemPrompt: '分析品牌核心价值、目标人群、视觉风格。', userPrompt: '品牌：{{联名品牌信息.brand_a}}' },
        },
        {
          id: 'process-analyze-b',
          type: 'PROCESS',
          name: '合作品牌调性分析',
          position: { x: 300, y: 450 },
          config: { systemPrompt: '分析品牌核心价值、目标人群、视觉风格。', userPrompt: '品牌：{{联名品牌信息.brand_b}}' },
        },
        {
          id: 'merge-analysis',
          type: 'MERGE',
          name: '调性汇聚',
          position: { x: 550, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-creative',
          type: 'PROCESS',
          name: '联名创意矩阵',
          position: { x: 800, y: 300 },
          config: { systemPrompt: '生成 5 个联名创意方向，包含产品、包装、事件营销的具体方案。', userPrompt: '【调性分析】：{{调性汇聚.result}}\n【目标】：{{联名品牌信息.goal}}' },
        },
        {
          id: 'process-risk',
          type: 'PROCESS',
          name: '品牌风险评估',
          position: { x: 1050, y: 150 },
          config: { systemPrompt: '评估联名可能带来的品牌稀释、舆论争议等风险。' },
        },
        {
          id: 'process-sop',
          type: 'PROCESS',
          name: '营销 SOP 生成',
          position: { x: 1050, y: 450 },
          config: { systemPrompt: '生成联名活动的完整执行 SOP，包含时间线、物料清单、KPI。' },
        },
        {
          id: 'image-gen-concept',
          type: 'IMAGE_GEN',
          name: '联名视觉概念图',
          position: { x: 1300, y: 300 },
          config: { provider: 'OPENAI', prompt: '融合双方品牌元素的创意视觉' },
        },
        {
          id: 'output-proposal',
          type: 'OUTPUT',
          name: '联名策划案',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出包含创意方案、风险评估、执行 SOP 及视觉概念的完整提案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-brands', target: 'process-analyze-a' },
        { id: 'e2', source: 'input-brands', target: 'process-analyze-b' },
        { id: 'e3', source: 'process-analyze-a', target: 'merge-analysis' },
        { id: 'e4', source: 'process-analyze-b', target: 'merge-analysis' },
        { id: 'e5', source: 'merge-analysis', target: 'process-creative' },
        { id: 'e6', source: 'process-creative', target: 'process-risk' },
        { id: 'e7', source: 'process-creative', target: 'process-sop' },
        { id: 'e8', source: 'process-creative', target: 'image-gen-concept' },
        { id: 'e9', source: 'process-risk', target: 'output-proposal' },
        { id: 'e10', source: 'process-sop', target: 'output-proposal' },
        { id: 'e11', source: 'image-gen-concept', target: 'output-proposal' },
      ],
    },
  },

  // 34. 研发：自动化测试用例生成
  {
    name: '自动化测试用例生成 Agent',
    description: '解析 PRD/API 文档，自动生成测试用例矩阵及 Playwright/Cypress 自动化脚本',
    category: 'tech',
    tags: ['测试自动化', 'QA', 'E2E测试'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-doc',
          type: 'INPUT',
          name: '需求/API 文档',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'doc', name: '文档内容', value: '', height: 250 }, { id: 'type', name: '文档类型', value: 'PRD' }] },
        },
        {
          id: 'process-parse',
          type: 'PROCESS',
          name: '功能点提取',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '从文档中提取所有可测试的功能点、边界条件和异常场景。', userPrompt: '文档：{{需求/API 文档.doc}}' },
        },
        {
          id: 'process-matrix',
          type: 'PROCESS',
          name: '测试用例矩阵',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '为每个功能点生成测试用例，包含前置条件、操作步骤、预期结果。输出结构化 JSON。', userPrompt: '功能点：{{功能点提取.result}}' },
        },
        {
          id: 'switch-type',
          type: 'SWITCH',
          name: '脚本类型选择',
          position: { x: 800, y: 300 },
          config: { variable: '{{需求/API 文档.type}}', cases: [{ value: 'API', label: 'API 测试' }, { value: 'UI', label: 'UI 测试' }], defaultCase: 'PRD' },
        },
        {
          id: 'process-playwright',
          type: 'PROCESS',
          name: 'Playwright 脚本生成',
          position: { x: 1050, y: 150 },
          config: { systemPrompt: '将测试用例转换为 Playwright TypeScript 脚本代码。', userPrompt: '用例：{{测试用例矩阵.result}}' },
        },
        {
          id: 'process-api-test',
          type: 'PROCESS',
          name: 'API 测试脚本生成',
          position: { x: 1050, y: 450 },
          config: { systemPrompt: '将测试用例转换为 Jest + Supertest 脚本代码。', userPrompt: '用例：{{测试用例矩阵.result}}' },
        },
        {
          id: 'merge-scripts',
          type: 'MERGE',
          name: '脚本汇聚',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-test',
          type: 'OUTPUT',
          name: '测试资产包',
          position: { x: 1550, y: 300 },
          config: { format: 'markdown', prompt: '输出测试用例矩阵文档及可直接运行的自动化脚本。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-doc', target: 'process-parse' },
        { id: 'e2', source: 'process-parse', target: 'process-matrix' },
        { id: 'e3', source: 'process-matrix', target: 'switch-type' },
        { id: 'e4', source: 'switch-type', target: 'process-playwright', sourceHandle: 'UI' },
        { id: 'e5', source: 'switch-type', target: 'process-api-test', sourceHandle: 'API' },
        { id: 'e6', source: 'switch-type', target: 'process-playwright', sourceHandle: 'PRD' },
        { id: 'e7', source: 'process-playwright', target: 'merge-scripts' },
        { id: 'e8', source: 'process-api-test', target: 'merge-scripts' },
        { id: 'e9', source: 'merge-scripts', target: 'output-test' },
      ],
    },
  },

  // 35. 销售：招投标书智能撰写
  {
    name: '招投标书 (RFP) 智能撰写 Agent',
    description: '解析招标文件关键要求，自动匹配历史中标案例，生成高分标书草稿',
    category: 'sales',
    tags: ['投标', 'RFP', '标书生成'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-rfp',
          type: 'INPUT',
          name: '招标文件',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'rfp', name: '招标文件内容', value: '', height: 250 }, { id: 'project', name: '项目名称', value: '' }] },
        },
        {
          id: 'process-parse',
          type: 'PROCESS',
          name: '关键要求提取',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '提取资质要求、评分标准、技术规格、交付要求等关键信息。', userPrompt: '招标文件：{{招标文件.rfp}}' },
        },
        {
          id: 'process-rag-case',
          type: 'PROCESS',
          name: '历史中标案例匹配',
          position: { x: 550, y: 150 },
          config: { systemPrompt: '从案例库中检索相似项目的中标方案作为参考。', userPrompt: '项目类型：{{招标文件.project}}', knowledgeBaseId: 'BID_CASE_KB' },
        },
        {
          id: 'process-tech',
          type: 'PROCESS',
          name: '技术方案撰写',
          position: { x: 800, y: 150 },
          config: { systemPrompt: '根据技术规格要求，撰写详细的技术解决方案章节。', userPrompt: '【要求】：{{关键要求提取.tech_spec}}\n【参考】：{{历史中标案例匹配.result}}' },
        },
        {
          id: 'process-business',
          type: 'PROCESS',
          name: '商务方案撰写',
          position: { x: 800, y: 450 },
          config: { systemPrompt: '撰写商务方案，包含报价策略、交付计划、售后服务承诺。', userPrompt: '商务要求：{{关键要求提取.business_spec}}' },
        },
        {
          id: 'merge-bid',
          type: 'MERGE',
          name: '标书汇编',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-review',
          type: 'PROCESS',
          name: '标书质量审核',
          position: { x: 1300, y: 300 },
          config: { systemPrompt: '审核标书是否响应了所有招标要求，评估中标概率。' },
        },
        {
          id: 'output-bid',
          type: 'OUTPUT',
          name: '投标文件草稿',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出格式规范的完整投标文件草稿。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-rfp', target: 'process-parse' },
        { id: 'e2', source: 'process-parse', target: 'process-rag-case' },
        { id: 'e3', source: 'process-parse', target: 'process-tech' },
        { id: 'e4', source: 'process-parse', target: 'process-business' },
        { id: 'e5', source: 'process-rag-case', target: 'process-tech' },
        { id: 'e6', source: 'process-tech', target: 'merge-bid' },
        { id: 'e7', source: 'process-business', target: 'merge-bid' },
        { id: 'e8', source: 'merge-bid', target: 'process-review' },
        { id: 'e9', source: 'process-review', target: 'output-bid' },
      ],
    },
  },

  // 36. 财务/战略：投融资尽职调查
  {
    name: '投融资项目尽职调查 (DD) Agent',
    description: '聚合工商、舆情、财报数据，自动进行红旗风险扫描，生成投资建议报告',
    category: 'finance',
    tags: ['尽职调查', '投资分析', '风险扫描'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-target',
          type: 'INPUT',
          name: '被投标的信息',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'name', name: '企业名称', value: '' }, { id: 'amount', name: '拟投金额', value: '' }] },
        },
        {
          id: 'code-fetch-data',
          type: 'CODE',
          name: '多源数据聚合 (Mock)',
          position: { x: 300, y: 300 },
          config: { language: 'javascript', code: 'return JSON.stringify({ registration: "正常", lawsuits: 0, revenue: "5000万", isMock: true });' },
        },
        {
          id: 'process-financial',
          type: 'PROCESS',
          name: '财务健康度分析',
          position: { x: 550, y: 150 },
          config: { systemPrompt: '分析营收增长、毛利率、现金流健康度。', userPrompt: '数据：{{多源数据聚合 (Mock).result}}' },
        },
        {
          id: 'process-legal',
          type: 'PROCESS',
          name: '法律风险扫描',
          position: { x: 550, y: 450 },
          config: { systemPrompt: '扫描诉讼、行政处罚、股权冻结等红旗风险。', userPrompt: '数据：{{多源数据聚合 (Mock).result}}' },
        },
        {
          id: 'merge-dd',
          type: 'MERGE',
          name: 'DD 汇总',
          position: { x: 800, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-valuation',
          type: 'PROCESS',
          name: '估值模型推演',
          position: { x: 1050, y: 300 },
          config: { systemPrompt: '基于财务数据，使用 DCF/可比公司法推演合理估值区间。', userPrompt: '财务分析：{{财务健康度分析.result}}\n拟投金额：{{被投标的信息.amount}}' },
        },
        {
          id: 'switch-risk',
          type: 'SWITCH',
          name: '投资建议',
          position: { x: 1300, y: 300 },
          config: { variable: '{{法律风险扫描.red_flag_count}}', cases: [{ value: 'high', label: '不建议投资' }], defaultCase: 'proceed' },
        },
        {
          id: 'output-dd',
          type: 'OUTPUT',
          name: 'DD 报告',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出包含财务分析、法律风险、估值建议的尽调报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-target', target: 'code-fetch-data' },
        { id: 'e2', source: 'code-fetch-data', target: 'process-financial' },
        { id: 'e3', source: 'code-fetch-data', target: 'process-legal' },
        { id: 'e4', source: 'process-financial', target: 'merge-dd' },
        { id: 'e5', source: 'process-legal', target: 'merge-dd' },
        { id: 'e6', source: 'merge-dd', target: 'process-valuation' },
        { id: 'e7', source: 'process-valuation', target: 'switch-risk' },
        { id: 'e8', source: 'switch-risk', target: 'output-dd' },
      ],
    },
  },

  // 37. HR/培训：企业内训课程体系构建
  {
    name: '企业内训课程体系构建 Agent',
    description: '基于 ADDIE 模型，根据岗位胜任力模型自动设计培训大纲、课件框架及考核方案',
    category: 'hr',
    tags: ['培训体系', 'ADDIE', '课程设计'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-role',
          type: 'INPUT',
          name: '培训需求',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'role', name: '目标岗位', value: '' }, { id: 'gap', name: '能力缺口', value: '', height: 100 }] },
        },
        {
          id: 'process-analysis',
          type: 'PROCESS',
          name: 'ADDIE-需求分析',
          position: { x: 300, y: 300 },
          config: { systemPrompt: '分析岗位胜任力模型，明确培训目标和关键学习成果。', userPrompt: '岗位：{{培训需求.role}}\n缺口：{{培训需求.gap}}', knowledgeBaseId: 'COMPETENCY_MODEL_KB' },
        },
        {
          id: 'process-design',
          type: 'PROCESS',
          name: 'ADDIE-课程设计',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '设计课程结构，包含模块划分、课时分配、教学方法（讲授/案例/实操）。', userPrompt: '培训目标：{{ADDIE-需求分析.result}}' },
        },
        {
          id: 'process-develop',
          type: 'PROCESS',
          name: 'ADDIE-内容开发',
          position: { x: 800, y: 300 },
          config: { systemPrompt: '为每个模块生成详细的课件大纲和关键知识点。', userPrompt: '课程结构：{{ADDIE-课程设计.result}}' },
        },
        {
          id: 'process-eval',
          type: 'PROCESS',
          name: 'ADDIE-评估设计',
          position: { x: 1050, y: 300 },
          config: { systemPrompt: '设计柯氏四级评估方案，包含反应层、学习层、行为层、结果层的考核方法。', userPrompt: '课程内容：{{ADDIE-内容开发.result}}' },
        },
        {
          id: 'output-curriculum',
          type: 'OUTPUT',
          name: '培训体系方案',
          position: { x: 1300, y: 300 },
          config: { format: 'pdf', prompt: '输出包含课程大纲、课件框架、评估方案的完整培训体系。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-role', target: 'process-analysis' },
        { id: 'e2', source: 'process-analysis', target: 'process-design' },
        { id: 'e3', source: 'process-design', target: 'process-develop' },
        { id: 'e4', source: 'process-develop', target: 'process-eval' },
        { id: 'e5', source: 'process-eval', target: 'output-curriculum' },
      ],
    },
  },

  // 38. 电商/运营：爆品选品与定价策略
  {
    name: '爆品选品与定价策略 Agent',
    description: '分析市场趋势、竞品数据，挖掘蓝海品类，并生成科学的定价模型建议',
    category: 'operation',
    tags: ['电商选品', '定价策略', '蓝海挖掘'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-category',
          type: 'INPUT',
          name: '品类信息',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'category', name: '目标品类', value: '' }, { id: 'budget', name: '采购预算', value: '' }] },
        },
        {
          id: 'code-trend',
          type: 'CODE',
          name: '趋势数据获取 (Mock)',
          position: { x: 300, y: 150 },
          config: { language: 'javascript', code: 'return JSON.stringify({ trend: "上升", competition: "中等", avgPrice: 99, isMock: true });' },
        },
        {
          id: 'process-opportunity',
          type: 'PROCESS',
          name: '蓝海机会识别',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '分析品类趋势和竞争强度，识别高增长低竞争的细分市场。', userPrompt: '趋势数据：{{趋势数据获取 (Mock).result}}\n品类：{{品类信息.category}}' },
        },
        {
          id: 'process-pricing',
          type: 'PROCESS',
          name: '定价模型设计',
          position: { x: 800, y: 300 },
          config: { systemPrompt: '基于成本加成法、竞争定价法、价值定价法，推荐最优定价区间。', userPrompt: '市场均价：{{趋势数据获取 (Mock).avgPrice}}\n预算：{{品类信息.budget}}' },
        },
        {
          id: 'process-supplier',
          type: 'PROCESS',
          name: '供应商匹配建议',
          position: { x: 1050, y: 300 },
          config: { systemPrompt: '基于定价和品质要求，推荐适合的供应商类型和采购策略。' },
        },
        {
          id: 'output-selection',
          type: 'OUTPUT',
          name: '选品策略报告',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出包含蓝海品类、定价建议、供应商策略的选品报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-category', target: 'code-trend' },
        { id: 'e2', source: 'code-trend', target: 'process-opportunity' },
        { id: 'e3', source: 'process-opportunity', target: 'process-pricing' },
        { id: 'e4', source: 'process-pricing', target: 'process-supplier' },
        { id: 'e5', source: 'process-supplier', target: 'output-selection' },
      ],
    },
  },

  // 39. 物流/采购：跨境物流路径规划
  {
    name: '跨境物流路径规划与成本优化 Agent',
    description: '比选空运/海运/铁路/多式联运方案，综合时效、成本、风险给出最优路径',
    category: 'procurement',
    tags: ['跨境物流', '路径优化', '成本控制'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-shipment',
          type: 'INPUT',
          name: '货运需求',
          position: { x: 50, y: 300 },
          config: { fields: [{ id: 'origin', name: '起运地', value: '' }, { id: 'dest', name: '目的地', value: '' }, { id: 'weight', name: '货物重量(kg)', value: '' }, { id: 'deadline', name: '最晚到达日期', value: '' }] },
        },
        {
          id: 'http-rates',
          type: 'HTTP',
          name: '运费实时查询',
          position: { x: 300, y: 300 },
          config: { method: 'GET', url: 'https://api.logistics.com/rates?from={{货运需求.origin}}&to={{货运需求.dest}}&weight={{货运需求.weight}}' },
        },
        {
          id: 'process-air',
          type: 'PROCESS',
          name: '空运方案评估',
          position: { x: 550, y: 150 },
          config: { systemPrompt: '评估空运时效、成本、风险。', userPrompt: '运费数据：{{运费实时查询.body}}' },
        },
        {
          id: 'process-sea',
          type: 'PROCESS',
          name: '海运方案评估',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '评估海运时效、成本、风险。', userPrompt: '运费数据：{{运费实时查询.body}}' },
        },
        {
          id: 'process-rail',
          type: 'PROCESS',
          name: '铁路方案评估',
          position: { x: 550, y: 450 },
          config: { systemPrompt: '评估中欧班列等铁路方案的时效、成本、风险。', userPrompt: '运费数据：{{运费实时查询.body}}' },
        },
        {
          id: 'merge-options',
          type: 'MERGE',
          name: '方案汇聚',
          position: { x: 800, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-optimize',
          type: 'PROCESS',
          name: '最优路径推荐',
          position: { x: 1050, y: 300 },
          config: { systemPrompt: '综合时效要求、成本预算、风险偏好，推荐最优物流方案。', userPrompt: '【方案汇总】：{{方案汇聚.result}}\n【截止日期】：{{货运需求.deadline}}' },
        },
        {
          id: 'output-route',
          type: 'OUTPUT',
          name: '物流方案书',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出包含路径规划、成本明细、风险提示的物流方案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-shipment', target: 'http-rates' },
        { id: 'e2', source: 'http-rates', target: 'process-air' },
        { id: 'e3', source: 'http-rates', target: 'process-sea' },
        { id: 'e4', source: 'http-rates', target: 'process-rail' },
        { id: 'e5', source: 'process-air', target: 'merge-options' },
        { id: 'e6', source: 'process-sea', target: 'merge-options' },
        { id: 'e7', source: 'process-rail', target: 'merge-options' },
        { id: 'e8', source: 'merge-options', target: 'process-optimize' },
        { id: 'e9', source: 'process-optimize', target: 'output-route' },
      ],
    },
  },

  // 40. 安环/生产：EHS 安全巡检智能分析
  {
    name: '企业 EHS 安全巡检智能分析 Agent',
    description: '通过多模态识别现场照片中的安全隐患，自动生成整改工单并跟踪闭环',
    category: 'production',
    tags: ['EHS', '安全巡检', '隐患识别'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-images',
          type: 'IMAGE',
          name: '巡检现场照片',
          position: { x: 50, y: 300 },
          config: { prompt: '上传车间/仓库巡检照片' },
        },
        {
          id: 'loop-analyze',
          type: 'LOOP',
          name: '逐张分析',
          position: { x: 300, y: 300 },
          config: { loopType: 'FOR', forConfig: { arrayVariable: '{{巡检现场照片.files}}', itemName: 'photo' } },
        },
        {
          id: 'process-vision',
          type: 'PROCESS',
          name: '多模态隐患识别',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '你是一个 EHS 专家。识别图片中的安全隐患：消防通道阻塞、未佩戴防护装备、危化品违规存放等。', userPrompt: '图片：{{loop.photo.url}}' },
        },
        {
          id: 'switch-severity',
          type: 'SWITCH',
          name: '隐患分级',
          position: { x: 800, y: 300 },
          config: { variable: '{{多模态隐患识别.severity}}', cases: [{ value: 'critical', label: '重大隐患' }, { value: 'high', label: '较大隐患' }], defaultCase: 'general' },
        },
        {
          id: 'notify-safety',
          type: 'NOTIFICATION',
          name: '安全主管紧急通知',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '【EHS 红色警报】发现重大安全隐患！位置：{{loop.photo.location}}，请立即处置！' },
        },
        {
          id: 'process-workorder',
          type: 'PROCESS',
          name: '整改工单生成',
          position: { x: 1050, y: 450 },
          config: { systemPrompt: '生成标准化的隐患整改工单，包含责任人、整改措施、完成期限。', userPrompt: '隐患详情：{{多模态隐患识别.result}}' },
        },
        {
          id: 'merge-ehs',
          type: 'MERGE',
          name: '巡检汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-report',
          type: 'OUTPUT',
          name: 'EHS 巡检报告',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出包含隐患清单、整改工单、风险统计的巡检报告。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-images', target: 'loop-analyze' },
        { id: 'e2', source: 'loop-analyze', target: 'process-vision', sourceHandle: 'body' },
        { id: 'e3', source: 'process-vision', target: 'switch-severity' },
        { id: 'e4', source: 'switch-severity', target: 'notify-safety', sourceHandle: 'critical' },
        { id: 'e5', source: 'switch-severity', target: 'process-workorder', sourceHandle: 'high' },
        { id: 'e6', source: 'switch-severity', target: 'process-workorder', sourceHandle: 'general' },
        { id: 'e7', source: 'notify-safety', target: 'merge-ehs' },
        { id: 'e8', source: 'process-workorder', target: 'merge-ehs' },
        { id: 'e9', source: 'merge-ehs', target: 'output-report', sourceHandle: 'done' },
      ],
    },
  },

  // 41. 总办/行政：CEO 每日决策辅助驾驶舱
  {
    name: 'CEO 每日决策辅助驾驶舱 Agent',
    description: '聚合经营数据、行业新闻、内部日程，每日自动生成 CEO 专属决策简报',
    category: 'admin',
    tags: ['CEO助手', '决策支持', '信息聚合'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'code-fetch-kpi',
          type: 'CODE',
          name: '经营数据聚合 (Mock)',
          position: { x: 50, y: 150 },
          config: { language: 'javascript', code: 'return JSON.stringify({ revenue_today: 150000, orders: 320, churn_alert: false, isMock: true });' },
        },
        {
          id: 'code-fetch-news',
          type: 'CODE',
          name: '行业新闻聚合 (Mock)',
          position: { x: 50, y: 300 },
          config: { language: 'javascript', code: 'return "【模拟新闻】行业龙头发布新品，市场格局或将重塑...";' },
        },
        {
          id: 'code-fetch-calendar',
          type: 'CODE',
          name: '日程提醒 (Mock)',
          position: { x: 50, y: 450 },
          config: { language: 'javascript', code: 'return JSON.stringify([{ time: "10:00", event: "董事会", priority: "high" }]);' },
        },
        {
          id: 'merge-data',
          type: 'MERGE',
          name: '信息汇聚',
          position: { x: 300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'process-insight',
          type: 'PROCESS',
          name: '关键洞察提炼',
          position: { x: 550, y: 300 },
          config: { systemPrompt: '你是 CEO 的首席参谋。从经营数据、新闻、日程中提炼 3 个最重要的关注点和建议行动。', userPrompt: '【经营】：{{经营数据聚合 (Mock).result}}\n【新闻】：{{行业新闻聚合 (Mock).result}}\n【日程】：{{日程提醒 (Mock).result}}' },
        },
        {
          id: 'condition-alert',
          type: 'CONDITION',
          name: '紧急事项判定',
          position: { x: 800, y: 300 },
          config: { conditions: [{ variable: '{{关键洞察提炼.has_urgent}}', operator: 'equals', value: 'true' }] },
        },
        {
          id: 'notify-ceo',
          type: 'NOTIFICATION',
          name: 'CEO 紧急推送',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '【CEO 紧急提醒】{{关键洞察提炼.urgent_item}}' },
        },
        {
          id: 'output-brief',
          type: 'OUTPUT',
          name: 'CEO 每日简报',
          position: { x: 1050, y: 450 },
          config: { format: 'markdown', prompt: '输出简洁、直击要害的 CEO 每日决策简报。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'code-fetch-kpi', target: 'merge-data' },
        { id: 'e2', source: 'code-fetch-news', target: 'merge-data' },
        { id: 'e3', source: 'code-fetch-calendar', target: 'merge-data' },
        { id: 'e4', source: 'merge-data', target: 'process-insight' },
        { id: 'e5', source: 'process-insight', target: 'condition-alert' },
        { id: 'e6', source: 'condition-alert', target: 'notify-ceo', sourceHandle: 'true' },
        { id: 'e7', source: 'condition-alert', target: 'output-brief', sourceHandle: 'false' },
        { id: 'e8', source: 'notify-ceo', target: 'output-brief' },
      ],
    },
  },

  // ============================================================
  // 新增：第 42-51 号企业级 AES 标准模板
  // ============================================================

  // 42. 市场：数字营销 ROI 归因分析 Agent
  {
    name: '数字营销 ROI 归因分析 Agent',
    description: '整合多渠道投放数据，采用多触点归因模型分析转化路径，输出预算优化建议',
    category: 'marketing',
    tags: ['营销归因', 'ROI分析', '预算优化', '数据驱动'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-channels',
          type: 'INPUT',
          name: '渠道投放数据',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'campaign_data', name: '投放数据汇总', value: '', height: 150, placeholder: '输入各渠道（SEM/信息流/社交媒体）的曝光、点击、消耗数据...' },
              { id: 'conversion_data', name: '转化数据', value: '', height: 100, placeholder: '注册、付费、留存等转化漏斗数据...' },
              { id: 'attribution_window', name: '归因窗口', value: '7天', placeholder: '如：7天、14天、30天' },
            ],
          },
        },
        {
          id: 'code-mock-touchpoint',
          type: 'CODE',
          name: '用户触点路径重建 (Mock)',
          position: { x: 300, y: 300 },
          config: {
            language: 'javascript',
            code: `return JSON.stringify({
  user_journeys: [
    { user_id: "U001", path: ["SEM品牌词", "信息流再营销", "直接访问"], converted: true, value: 299 },
    { user_id: "U002", path: ["抖音信息流", "小红书种草", "淘宝搜索"], converted: true, value: 599 },
    { user_id: "U003", path: ["SEM竞品词", "官网着陆"], converted: false, value: 0 }
  ],
  channel_costs: { "SEM": 50000, "信息流": 80000, "社交媒体": 30000, "KOL": 20000 }
});`,
          },
        },
        {
          id: 'process-attribution',
          type: 'PROCESS',
          name: '多触点归因建模',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个数字营销分析专家。请基于用户转化路径，分别采用以下归因模型计算各渠道贡献：1) 首次触点归因；2) 末次触点归因；3) 线性归因；4) 时间衰减归因。输出各模型下的渠道贡献度对比。',
            userPrompt: '用户路径数据：{{用户触点路径重建 (Mock).result}}\n归因窗口：{{渠道投放数据.attribution_window}}',
          },
        },
        {
          id: 'process-roi',
          type: 'PROCESS',
          name: 'ROI 效率计算',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '计算各渠道的核心效率指标：CPA（获客成本）、ROAS（广告支出回报率）、LTV/CAC 比值。识别高效渠道和低效渠道。',
            userPrompt: '归因结果：{{多触点归因建模.result}}\n渠道成本：{{用户触点路径重建 (Mock).channel_costs}}',
          },
        },
        {
          id: 'process-optimize',
          type: 'PROCESS',
          name: '预算再分配建议',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '基于 ROI 分析结果，给出具体的预算再分配建议：1) 应增加投入的高效渠道；2) 应缩减或优化的低效渠道；3) 渠道组合协同策略。',
            userPrompt: 'ROI 分析：{{ROI 效率计算.result}}',
          },
        },
        {
          id: 'merge-analysis',
          type: 'MERGE',
          name: '分析汇总',
          position: { x: 1100, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-report',
          type: 'OUTPUT',
          name: '营销归因分析报告',
          position: { x: 1350, y: 300 },
          config: { format: 'pdf', prompt: '输出完整的数字营销 ROI 归因分析报告，包含归因模型对比、渠道效率排名及预算优化建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-channels', target: 'code-mock-touchpoint' },
        { id: 'e2', source: 'code-mock-touchpoint', target: 'process-attribution' },
        { id: 'e3', source: 'process-attribution', target: 'process-roi' },
        { id: 'e4', source: 'process-attribution', target: 'process-optimize' },
        { id: 'e5', source: 'process-roi', target: 'process-optimize' },
        { id: 'e6', source: 'process-roi', target: 'merge-analysis' },
        { id: 'e7', source: 'process-optimize', target: 'merge-analysis' },
        { id: 'e8', source: 'merge-analysis', target: 'output-report' },
      ],
    },
  },

  // 43. 销售：销售预测与 Pipeline 健康度诊断 Agent
  {
    name: '销售预测与 Pipeline 健康度诊断 Agent',
    description: '基于历史成交数据和当前商机阶段，预测季度收入并诊断 Pipeline 风险',
    category: 'sales',
    tags: ['销售预测', 'Pipeline管理', '收入预测', 'CRM'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-pipeline',
          type: 'INPUT',
          name: 'Pipeline 数据输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'opportunities', name: '商机列表', value: '', height: 200, placeholder: '粘贴 CRM 导出的商机数据（客户名、金额、阶段、预计成交日期）...' },
              { id: 'target', name: '季度目标', value: '', placeholder: '如：500万' },
              { id: 'history_rate', name: '历史各阶段转化率', value: '', placeholder: '如：初步接触30%、方案演示50%、商务谈判70%' },
            ],
          },
        },
        {
          id: 'process-segment',
          type: 'PROCESS',
          name: '商机阶段分层',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '请将商机按销售阶段分层统计：1) 各阶段商机数量和金额；2) 加权金额（金额×阶段转化率）；3) 平均停留时长。',
            userPrompt: '商机数据：{{Pipeline 数据输入.opportunities}}\n转化率：{{Pipeline 数据输入.history_rate}}',
          },
        },
        {
          id: 'process-forecast',
          type: 'PROCESS',
          name: '收入预测建模',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '基于加权 Pipeline 法预测本季度可能收入。给出三种情景：保守预测（仅高阶段商机）、基准预测（加权）、乐观预测（全部商机）。评估目标达成概率。',
            userPrompt: '分层数据：{{商机阶段分层.result}}\n季度目标：{{Pipeline 数据输入.target}}',
          },
        },
        {
          id: 'process-health',
          type: 'PROCESS',
          name: 'Pipeline 健康度诊断',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '诊断 Pipeline 健康度问题：1) 漏斗形态是否健康（头部过窄/底部淤积）；2) 平均销售周期是否延长；3) 高价值商机占比；4) 僵尸商机（超期未推进）识别。',
            userPrompt: '分层数据：{{商机阶段分层.result}}',
          },
        },
        {
          id: 'switch-risk',
          type: 'SWITCH',
          name: '风险等级判定',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{Pipeline 健康度诊断.risk_level}}',
            cases: [{ value: 'high', label: '高风险-缺口大' }, { value: 'medium', label: '中风险-需优化' }],
            defaultCase: 'healthy',
          },
        },
        {
          id: 'notify-sales-leader',
          type: 'NOTIFICATION',
          name: '销售总监预警',
          position: { x: 1050, y: 150 },
          config: { provider: 'DINGTALK', content: '【Pipeline 预警】本季度收入缺口较大，预测达成率仅{{收入预测建模.achieve_rate}}%。建议立即召开商机评审会。' },
        },
        {
          id: 'process-action',
          type: 'PROCESS',
          name: '改进行动建议',
          position: { x: 1050, y: 450 },
          config: {
            systemPrompt: '针对诊断出的问题，给出具体改进建议：1) 需要加速推进的关键商机；2) 需要清理或降级的僵尸商机；3) 需要补充的新商机来源。',
            userPrompt: '健康度诊断：{{Pipeline 健康度诊断.result}}',
          },
        },
        {
          id: 'merge-sales',
          type: 'MERGE',
          name: '报告汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-forecast',
          type: 'OUTPUT',
          name: '销售预测诊断报告',
          position: { x: 1550, y: 300 },
          config: { format: 'excel', prompt: '输出销售预测与 Pipeline 健康度诊断报告，包含收入预测、风险识别及改进建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-pipeline', target: 'process-segment' },
        { id: 'e2', source: 'process-segment', target: 'process-forecast' },
        { id: 'e3', source: 'process-segment', target: 'process-health' },
        { id: 'e4', source: 'process-forecast', target: 'switch-risk' },
        { id: 'e5', source: 'process-health', target: 'switch-risk' },
        { id: 'e6', source: 'switch-risk', target: 'notify-sales-leader', sourceHandle: 'high' },
        { id: 'e7', source: 'switch-risk', target: 'process-action', sourceHandle: 'medium' },
        { id: 'e8', source: 'switch-risk', target: 'process-action', sourceHandle: 'healthy' },
        { id: 'e9', source: 'notify-sales-leader', target: 'merge-sales' },
        { id: 'e10', source: 'process-action', target: 'merge-sales' },
        { id: 'e11', source: 'merge-sales', target: 'output-forecast' },
      ],
    },
  },

  // 44. 人力：人才盘点与继任计划 Agent
  {
    name: '人才盘点与继任计划 Agent',
    description: '基于九宫格模型进行人才盘点，识别高潜人才并生成关键岗位继任计划',
    category: 'hr',
    tags: ['人才盘点', '九宫格', '继任计划', '人才发展'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-talent',
          type: 'INPUT',
          name: '人才数据输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'employee_data', name: '员工信息', value: '', height: 200, placeholder: '员工姓名、岗位、绩效评级（A/B/C）、潜力评估...' },
              { id: 'key_positions', name: '关键岗位清单', value: '', height: 80, placeholder: '需要继任计划的关键管理/技术岗位' },
            ],
          },
        },
        {
          id: 'process-9box',
          type: 'PROCESS',
          name: '九宫格人才分布',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个人才管理专家。请根据绩效（高/中/低）和潜力（高/中/低）两个维度，将员工分类到九宫格模型中。统计各格人数占比。',
            userPrompt: '员工数据：{{人才数据输入.employee_data}}',
          },
        },
        {
          id: 'process-hipo',
          type: 'PROCESS',
          name: '高潜人才识别',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '识别九宫格右上区（高绩效+高潜力）的明星员工和（中绩效+高潜力）的潜力股。分析其发展需求和保留风险。',
            userPrompt: '九宫格分布：{{九宫格人才分布.result}}',
          },
        },
        {
          id: 'process-succession',
          type: 'PROCESS',
          name: '继任计划制定',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '为每个关键岗位制定继任计划：1) 第一继任人选（Ready Now）；2) 第二继任人选（Ready in 1-2 years）；3) 发展差距和培养建议。',
            userPrompt: '关键岗位：{{人才数据输入.key_positions}}\n高潜人才：{{高潜人才识别.result}}\n九宫格：{{九宫格人才分布.result}}',
          },
        },
        {
          id: 'process-idp',
          type: 'PROCESS',
          name: '个人发展计划 (IDP)',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '为高潜人才和继任候选人制定个人发展计划，包括：1) 能力差距；2) 发展行动（培训/轮岗/项目历练）；3) 导师安排；4) 里程碑节点。',
            userPrompt: '继任计划：{{继任计划制定.result}}\n高潜人才：{{高潜人才识别.result}}',
          },
        },
        {
          id: 'merge-talent',
          type: 'MERGE',
          name: '盘点结果汇总',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-talent',
          type: 'OUTPUT',
          name: '人才盘点报告',
          position: { x: 1300, y: 300 },
          config: { format: 'pdf', prompt: '输出完整的人才盘点报告，包含九宫格分布图、高潜人才名单、关键岗位继任计划及 IDP。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-talent', target: 'process-9box' },
        { id: 'e2', source: 'process-9box', target: 'process-hipo' },
        { id: 'e3', source: 'process-9box', target: 'process-succession' },
        { id: 'e4', source: 'process-hipo', target: 'process-succession' },
        { id: 'e5', source: 'process-hipo', target: 'process-idp' },
        { id: 'e6', source: 'process-succession', target: 'process-idp' },
        { id: 'e7', source: 'process-9box', target: 'merge-talent' },
        { id: 'e8', source: 'process-idp', target: 'merge-talent' },
        { id: 'e9', source: 'merge-talent', target: 'output-talent' },
      ],
    },
  },

  // 45. 财务：预算执行监控与偏差分析 Agent
  {
    name: '预算执行监控与偏差分析 Agent',
    description: '实时对比预算与实际支出，自动识别超支风险，生成滚动预测与调整建议',
    category: 'finance',
    tags: ['预算管理', '偏差分析', '滚动预测', '成本控制'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-budget',
          type: 'INPUT',
          name: '预算与实际数据',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'budget_data', name: '年度预算明细', value: '', height: 150, placeholder: '各部门/科目的年度预算金额...' },
              { id: 'actual_data', name: '实际执行数据', value: '', height: 150, placeholder: '截至当前的实际支出明细...' },
              { id: 'period', name: '分析周期', value: 'Q3', placeholder: '如：Q1、Q2、Q3、Q4' },
            ],
          },
        },
        {
          id: 'process-variance',
          type: 'PROCESS',
          name: '预算偏差分析',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个财务分析师。请计算各部门/科目的：1) 预算完成率；2) 偏差金额和偏差率；3) 同比环比变化。识别偏差超过10%的异常项。',
            userPrompt: '预算：{{预算与实际数据.budget_data}}\n实际：{{预算与实际数据.actual_data}}\n周期：{{预算与实际数据.period}}',
          },
        },
        {
          id: 'switch-variance',
          type: 'SWITCH',
          name: '偏差等级分流',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{预算偏差分析.max_variance_level}}',
            cases: [{ value: 'severe', label: '严重超支>20%' }, { value: 'warning', label: '预警超支10-20%' }],
            defaultCase: 'normal',
          },
        },
        {
          id: 'process-rootcause',
          type: 'PROCESS',
          name: '超支根因分析',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '针对严重超支项，分析根本原因：1) 是预算制定不合理？2) 是执行失控？3) 是业务变化导致？4) 是一次性支出？',
            userPrompt: '偏差明细：{{预算偏差分析.severe_items}}',
          },
        },
        {
          id: 'notify-cfo',
          type: 'NOTIFICATION',
          name: 'CFO 预算预警',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '【预算红线预警】{{预算偏差分析.severe_department}} 部门预算超支严重，超支率达{{预算偏差分析.severe_rate}}%。请关注！' },
        },
        {
          id: 'process-rolling',
          type: 'PROCESS',
          name: '滚动预测更新',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '基于当前执行进度和趋势，预测全年实际支出。给出滚动预测值与原预算的差异，以及剩余预算的分配建议。',
            userPrompt: '偏差分析：{{预算偏差分析.result}}\n当前周期：{{预算与实际数据.period}}',
          },
        },
        {
          id: 'merge-budget',
          type: 'MERGE',
          name: '分析汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-budget',
          type: 'OUTPUT',
          name: '预算执行分析报告',
          position: { x: 1550, y: 300 },
          config: { format: 'excel', prompt: '输出预算执行监控报告，包含偏差分析表、超支根因、滚动预测及调整建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-budget', target: 'process-variance' },
        { id: 'e2', source: 'process-variance', target: 'switch-variance' },
        { id: 'e3', source: 'switch-variance', target: 'process-rootcause', sourceHandle: 'severe' },
        { id: 'e4', source: 'process-rootcause', target: 'notify-cfo' },
        { id: 'e5', source: 'switch-variance', target: 'process-rolling', sourceHandle: 'warning' },
        { id: 'e6', source: 'switch-variance', target: 'process-rolling', sourceHandle: 'normal' },
        { id: 'e7', source: 'notify-cfo', target: 'merge-budget' },
        { id: 'e8', source: 'process-rolling', target: 'merge-budget' },
        { id: 'e9', source: 'merge-budget', target: 'output-budget' },
      ],
    },
  },

  // 46. 市场：竞品动态监测与快反策略 Agent
  {
    name: '竞品动态监测与快反策略 Agent',
    description: '实时监测竞品价格、活动、新品动态，自动生成竞争快反策略建议',
    category: 'marketing',
    tags: ['竞品监测', '价格监控', '快反策略', '市场情报'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-competitors',
          type: 'INPUT',
          name: '竞品监测配置',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'competitors', name: '核心竞品清单', value: '', height: 80, placeholder: '列出需要监测的竞品品牌/产品...' },
              { id: 'our_product', name: '我方产品信息', value: '', height: 100, placeholder: '我方产品定位、价格、核心卖点...' },
            ],
          },
        },
        {
          id: 'code-mock-monitor',
          type: 'CODE',
          name: '竞品数据采集 (Mock)',
          position: { x: 300, y: 300 },
          config: {
            language: 'javascript',
            code: `return JSON.stringify({
  price_changes: [
    { competitor: "竞品A", product: "旗舰款", old_price: 299, new_price: 249, change_date: "2024-01-15" }
  ],
  new_launches: [
    { competitor: "竞品B", product: "新品X", launch_date: "2024-01-20", highlights: "主打性价比" }
  ],
  promotions: [
    { competitor: "竞品A", type: "满减", detail: "满300减50", start: "2024-01-18", end: "2024-01-25" }
  ],
  social_mentions: { sentiment: "中性", hot_topics: ["降价", "新品发布"] }
});`,
          },
        },
        {
          id: 'process-analyze',
          type: 'PROCESS',
          name: '竞争态势分析',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个竞争情报分析师。请分析竞品动态的战略意图：1) 价格调整是攻击性还是防御性？2) 新品发布对我方的威胁程度？3) 促销活动的目标客群是否与我方重叠？',
            userPrompt: '竞品动态：{{竞品数据采集 (Mock).result}}\n我方产品：{{竞品监测配置.our_product}}',
          },
        },
        {
          id: 'switch-urgency',
          type: 'SWITCH',
          name: '响应紧急度判定',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{竞争态势分析.urgency}}',
            cases: [{ value: 'immediate', label: '立即响应' }, { value: 'watch', label: '密切关注' }],
            defaultCase: 'routine',
          },
        },
        {
          id: 'process-counter',
          type: 'PROCESS',
          name: '快反策略生成',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '针对竞品动态，制定具体的快反策略：1) 价格应对（跟进/差异化/不响应）；2) 营销话术调整；3) 渠道重点转移；4) 产品卖点强化。给出48小时内可执行的行动清单。',
            userPrompt: '竞争分析：{{竞争态势分析.result}}',
          },
        },
        {
          id: 'notify-marketing',
          type: 'NOTIFICATION',
          name: '市场团队警报',
          position: { x: 1300, y: 150 },
          config: { provider: 'FEISHU', content: '【竞品快反警报】{{竞争态势分析.alert_competitor}} 有重大动作！建议策略：{{快反策略生成.quick_action}}' },
        },
        {
          id: 'merge-competitive',
          type: 'MERGE',
          name: '情报汇总',
          position: { x: 1300, y: 450 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-intel',
          type: 'OUTPUT',
          name: '竞品情报快报',
          position: { x: 1550, y: 300 },
          config: { format: 'markdown', prompt: '输出竞品动态监测快报，包含动态汇总、威胁评估及快反策略建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-competitors', target: 'code-mock-monitor' },
        { id: 'e2', source: 'code-mock-monitor', target: 'process-analyze' },
        { id: 'e3', source: 'input-competitors', target: 'process-analyze' },
        { id: 'e4', source: 'process-analyze', target: 'switch-urgency' },
        { id: 'e5', source: 'switch-urgency', target: 'process-counter', sourceHandle: 'immediate' },
        { id: 'e6', source: 'process-counter', target: 'notify-marketing' },
        { id: 'e7', source: 'switch-urgency', target: 'merge-competitive', sourceHandle: 'watch' },
        { id: 'e8', source: 'switch-urgency', target: 'merge-competitive', sourceHandle: 'routine' },
        { id: 'e9', source: 'notify-marketing', target: 'merge-competitive' },
        { id: 'e10', source: 'merge-competitive', target: 'output-intel' },
      ],
    },
  },

  // 47. 销售：客户流失预警与挽留 Agent
  {
    name: '客户流失预警与挽留 Agent',
    description: '基于客户行为数据预测流失风险，自动触发分级挽留策略',
    category: 'sales',
    tags: ['客户流失', '预警模型', '客户挽留', 'CRM'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-customer',
          type: 'DATA',
          name: '客户行为数据',
          position: { x: 50, y: 300 },
          config: { prompt: '导入客户近90天的登录频次、功能使用、工单记录、付款情况等行为数据' },
        },
        {
          id: 'code-risk-score',
          type: 'CODE',
          name: '流失风险评分模型',
          position: { x: 300, y: 300 },
          config: {
            language: 'javascript',
            code: `const customers = [
  { id: "C001", name: "客户A", login_trend: -0.5, usage_drop: 0.4, ticket_increase: 2, payment_delay: 0, risk_score: 0 },
  { id: "C002", name: "客户B", login_trend: -0.8, usage_drop: 0.7, ticket_increase: 5, payment_delay: 1, risk_score: 0 }
];
customers.forEach(c => {
  c.risk_score = Math.min(100, Math.round(
    Math.abs(c.login_trend) * 30 + c.usage_drop * 40 + c.ticket_increase * 5 + c.payment_delay * 15
  ));
});
return JSON.stringify({ high_risk: customers.filter(c => c.risk_score > 60), medium_risk: customers.filter(c => c.risk_score > 30 && c.risk_score <= 60) });`,
          },
        },
        {
          id: 'process-analyze',
          type: 'PROCESS',
          name: '流失原因诊断',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '你是一个客户成功专家。请分析高风险客户的流失信号，诊断可能的流失原因：产品不满意？服务体验差？竞品切换？业务调整？',
            userPrompt: '风险客户：{{流失风险评分模型.high_risk}}',
          },
        },
        {
          id: 'switch-value',
          type: 'SWITCH',
          name: '客户价值分层',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{流失原因诊断.customer_tier}}',
            cases: [{ value: 'vip', label: 'VIP大客户' }, { value: 'growth', label: '成长型客户' }],
            defaultCase: 'standard',
          },
        },
        {
          id: 'process-vip-retain',
          type: 'PROCESS',
          name: 'VIP 专属挽留方案',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '为 VIP 大客户制定高规格挽留方案：1) 高管亲访计划；2) 专属优惠/延期方案；3) 定制化服务升级；4) 战略合作深化建议。',
            userPrompt: '客户诊断：{{流失原因诊断.result}}',
          },
        },
        {
          id: 'process-standard-retain',
          type: 'PROCESS',
          name: '标准挽留话术',
          position: { x: 1050, y: 450 },
          config: {
            systemPrompt: '生成标准化挽留方案：1) 客户成功经理回访话术；2) 产品价值再教育内容；3) 优惠续费方案。',
            userPrompt: '客户诊断：{{流失原因诊断.result}}',
          },
        },
        {
          id: 'notify-csm',
          type: 'NOTIFICATION',
          name: 'CSM 行动提醒',
          position: { x: 1300, y: 300 },
          config: { provider: 'FEISHU', content: '【客户流失预警】{{流失原因诊断.customer_name}} 流失风险评分{{流失风险评分模型.risk_score}}分。请24小时内启动挽留行动。' },
        },
        {
          id: 'output-retention',
          type: 'OUTPUT',
          name: '客户挽留行动包',
          position: { x: 1550, y: 300 },
          config: { format: 'markdown', prompt: '输出客户流失预警报告及分层挽留方案，包含客户名单、风险评分、流失原因及挽留话术。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-customer', target: 'code-risk-score' },
        { id: 'e2', source: 'code-risk-score', target: 'process-analyze' },
        { id: 'e3', source: 'process-analyze', target: 'switch-value' },
        { id: 'e4', source: 'switch-value', target: 'process-vip-retain', sourceHandle: 'vip' },
        { id: 'e5', source: 'switch-value', target: 'process-standard-retain', sourceHandle: 'growth' },
        { id: 'e6', source: 'switch-value', target: 'process-standard-retain', sourceHandle: 'standard' },
        { id: 'e7', source: 'process-vip-retain', target: 'notify-csm' },
        { id: 'e8', source: 'process-standard-retain', target: 'notify-csm' },
        { id: 'e9', source: 'notify-csm', target: 'output-retention' },
      ],
    },
  },

  // 48. 人力：薪酬竞争力分析与调薪建议 Agent
  {
    name: '薪酬竞争力分析与调薪建议 Agent',
    description: '对标市场薪酬数据，分析内部薪酬公平性，生成差异化调薪建议',
    category: 'hr',
    tags: ['薪酬分析', '市场对标', '调薪建议', '薪酬公平'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-salary',
          type: 'INPUT',
          name: '薪酬数据输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'internal_data', name: '内部薪酬数据', value: '', height: 150, placeholder: '员工岗位、职级、当前薪资、绩效评级...' },
              { id: 'market_data', name: '市场薪酬数据', value: '', height: 100, placeholder: '同行业同岗位的市场分位值（P25/P50/P75）...' },
              { id: 'budget', name: '调薪预算', value: '', placeholder: '如：总薪酬成本的5%' },
            ],
          },
        },
        {
          id: 'process-benchmark',
          type: 'PROCESS',
          name: '市场对标分析',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '将内部薪酬与市场数据对标，计算每个岗位/职级的：1) CR值（薪酬比率）；2) 市场分位；3) 与P50的差距。识别薪酬竞争力不足的岗位。',
            userPrompt: '内部数据：{{薪酬数据输入.internal_data}}\n市场数据：{{薪酬数据输入.market_data}}',
          },
        },
        {
          id: 'process-equity',
          type: 'PROCESS',
          name: '内部公平性分析',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '分析内部薪酬公平性：1) 同岗同级薪酬离散度；2) 是否存在性别/年龄薪酬差异；3) 绩效与薪酬的相关性。识别不公平案例。',
            userPrompt: '内部数据：{{薪酬数据输入.internal_data}}',
          },
        },
        {
          id: 'process-strategy',
          type: 'PROCESS',
          name: '调薪策略制定',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '基于市场对标和内部公平性分析，制定调薪策略矩阵：按绩效等级（A/B/C）× 市场分位（低于P25/P25-P50/高于P50）确定调薪幅度区间。',
            userPrompt: '市场对标：{{市场对标分析.result}}\n公平性分析：{{内部公平性分析.result}}\n预算：{{薪酬数据输入.budget}}',
          },
        },
        {
          id: 'process-individual',
          type: 'PROCESS',
          name: '个人调薪建议',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '根据调薪策略矩阵，为每位员工生成个性化调薪建议，包括：建议调薪幅度、调后薪资、调后市场分位。确保总额在预算内。',
            userPrompt: '调薪策略：{{调薪策略制定.result}}\n市场对标：{{市场对标分析.result}}',
          },
        },
        {
          id: 'merge-salary',
          type: 'MERGE',
          name: '分析汇总',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-salary',
          type: 'OUTPUT',
          name: '薪酬分析报告',
          position: { x: 1300, y: 300 },
          config: { format: 'excel', prompt: '输出薪酬竞争力分析报告，包含市场对标结果、公平性分析、调薪策略及个人调薪建议明细表。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-salary', target: 'process-benchmark' },
        { id: 'e2', source: 'process-benchmark', target: 'process-equity' },
        { id: 'e3', source: 'process-benchmark', target: 'process-strategy' },
        { id: 'e4', source: 'process-equity', target: 'process-strategy' },
        { id: 'e5', source: 'process-strategy', target: 'process-individual' },
        { id: 'e6', source: 'process-benchmark', target: 'process-individual' },
        { id: 'e7', source: 'process-individual', target: 'merge-salary' },
        { id: 'e8', source: 'process-equity', target: 'merge-salary' },
        { id: 'e9', source: 'merge-salary', target: 'output-salary' },
      ],
    },
  },

  // 49. 财务：应收账款风险预警与催收 Agent
  {
    name: '应收账款风险预警与催收 Agent',
    description: '监控应收账款账龄，预测坏账风险，自动生成分级催收策略',
    category: 'finance',
    tags: ['应收账款', '账龄分析', '坏账预警', '智能催收'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-ar',
          type: 'DATA',
          name: '应收账款明细',
          position: { x: 50, y: 300 },
          config: { prompt: '导入应收账款明细表（客户、发票号、金额、到期日、账龄天数）' },
        },
        {
          id: 'process-aging',
          type: 'PROCESS',
          name: '账龄结构分析',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '请按账龄区间（0-30天、31-60天、61-90天、90天以上）统计应收账款分布，计算各区间金额占比，识别账龄结构恶化趋势。',
            userPrompt: '应收明细：{{应收账款明细.content}}',
          },
        },
        {
          id: 'code-risk-model',
          type: 'CODE',
          name: '坏账概率评估',
          position: { x: 550, y: 150 },
          config: {
            language: 'javascript',
            code: `const aging_rates = { "0-30": 0.01, "31-60": 0.05, "61-90": 0.15, "90+": 0.40 };
const ar_data = [
  { customer: "客户A", amount: 100000, aging: "61-90" },
  { customer: "客户B", amount: 50000, aging: "90+" }
];
const risk_result = ar_data.map(item => ({
  ...item,
  bad_debt_prob: aging_rates[item.aging],
  expected_loss: item.amount * aging_rates[item.aging]
}));
return JSON.stringify({ total_exposure: 150000, expected_loss: risk_result.reduce((s,i) => s + i.expected_loss, 0), details: risk_result });`,
          },
        },
        {
          id: 'switch-aging',
          type: 'SWITCH',
          name: '催收优先级分流',
          position: { x: 550, y: 450 },
          config: {
            variable: '{{账龄结构分析.max_aging}}',
            cases: [{ value: '90+', label: '紧急催收' }, { value: '61-90', label: '重点跟进' }],
            defaultCase: 'routine',
          },
        },
        {
          id: 'process-urgent-collect',
          type: 'PROCESS',
          name: '紧急催收方案',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '为超90天逾期客户制定紧急催收方案：1) 律师函模板；2) 法律诉讼预评估；3) 高管对接话术；4) 分期还款谈判方案。',
            userPrompt: '逾期客户：{{账龄结构分析.overdue_90_customers}}',
          },
        },
        {
          id: 'process-routine-collect',
          type: 'PROCESS',
          name: '常规催收话术',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '生成分阶段催收话术模板：首次提醒（到期前3天）→ 逾期提醒（逾期7天）→ 加强催收（逾期30天）。',
            userPrompt: '账龄分布：{{账龄结构分析.result}}',
          },
        },
        {
          id: 'notify-finance',
          type: 'NOTIFICATION',
          name: '财务经理预警',
          position: { x: 1050, y: 300 },
          config: { provider: 'DINGTALK', content: '【应收账款预警】超90天逾期金额{{账龄结构分析.overdue_90_amount}}元，预计坏账损失{{坏账概率评估.expected_loss}}元。请关注！' },
        },
        {
          id: 'output-ar',
          type: 'OUTPUT',
          name: '应收账款风险报告',
          position: { x: 1300, y: 300 },
          config: { format: 'excel', prompt: '输出应收账款风险分析报告，包含账龄分布、坏账预估、重点客户清单及催收方案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-ar', target: 'process-aging' },
        { id: 'e2', source: 'process-aging', target: 'code-risk-model' },
        { id: 'e3', source: 'process-aging', target: 'switch-aging' },
        { id: 'e4', source: 'switch-aging', target: 'process-urgent-collect', sourceHandle: '90+' },
        { id: 'e5', source: 'switch-aging', target: 'process-routine-collect', sourceHandle: '61-90' },
        { id: 'e6', source: 'switch-aging', target: 'process-routine-collect', sourceHandle: 'routine' },
        { id: 'e7', source: 'code-risk-model', target: 'notify-finance' },
        { id: 'e8', source: 'process-urgent-collect', target: 'output-ar' },
        { id: 'e9', source: 'process-routine-collect', target: 'output-ar' },
        { id: 'e10', source: 'notify-finance', target: 'output-ar' },
      ],
    },
  },

  // 50. 运营：用户生命周期价值 (LTV) 提升 Agent
  {
    name: '用户生命周期价值 (LTV) 提升 Agent',
    description: '分析用户分层与消费行为，预测 LTV 并生成针对性的价值提升策略',
    category: 'operation',
    tags: ['LTV', '用户分层', '价值提升', '精细化运营'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-user',
          type: 'DATA',
          name: '用户消费数据',
          position: { x: 50, y: 300 },
          config: { prompt: '导入用户消费明细（用户ID、注册时间、订单记录、金额、频次）' },
        },
        {
          id: 'process-rfm',
          type: 'PROCESS',
          name: 'RFM 用户分层',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '基于 RFM 模型（最近消费R、消费频率F、消费金额M）对用户进行分层：重要价值客户、重要发展客户、重要保持客户、重要挽留客户、一般价值客户等。',
            userPrompt: '消费数据：{{用户消费数据.content}}',
          },
        },
        {
          id: 'code-ltv-predict',
          type: 'CODE',
          name: 'LTV 预测模型',
          position: { x: 550, y: 150 },
          config: {
            language: 'javascript',
            code: `const users = [
  { id: "U001", segment: "重要价值", avg_order: 500, frequency: 2.5, retention_prob: 0.8, predicted_months: 24 },
  { id: "U002", segment: "重要发展", avg_order: 200, frequency: 1.2, retention_prob: 0.6, predicted_months: 18 }
];
users.forEach(u => {
  u.predicted_ltv = Math.round(u.avg_order * u.frequency * 12 * u.retention_prob * (u.predicted_months / 12));
});
return JSON.stringify({ users, total_ltv: users.reduce((s, u) => s + u.predicted_ltv, 0) });`,
          },
        },
        {
          id: 'process-strategy',
          type: 'PROCESS',
          name: 'LTV 提升策略',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '针对不同 RFM 分层用户，制定差异化 LTV 提升策略：1) 重要价值客户-VIP服务升级；2) 重要发展客户-交叉销售；3) 重要保持客户-激活召回；4) 重要挽留客户-流失预警。',
            userPrompt: 'RFM分层：{{RFM 用户分层.result}}\nLTV预测：{{LTV 预测模型.result}}',
          },
        },
        {
          id: 'process-campaign',
          type: 'PROCESS',
          name: '精准营销方案',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '为每个用户分层设计具体的营销触达方案：1) 触达渠道（APP推送/短信/企微）；2) 营销内容（优惠券/专属权益/会员日）；3) 触达时机；4) 预期 ROI。',
            userPrompt: '提升策略：{{LTV 提升策略.result}}',
          },
        },
        {
          id: 'merge-ltv',
          type: 'MERGE',
          name: '策略汇总',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-ltv',
          type: 'OUTPUT',
          name: 'LTV 提升方案',
          position: { x: 1300, y: 300 },
          config: { format: 'pdf', prompt: '输出用户 LTV 分析与提升方案，包含 RFM 分层、LTV 预测、分层策略及精准营销方案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-user', target: 'process-rfm' },
        { id: 'e2', source: 'process-rfm', target: 'code-ltv-predict' },
        { id: 'e3', source: 'process-rfm', target: 'process-strategy' },
        { id: 'e4', source: 'code-ltv-predict', target: 'process-strategy' },
        { id: 'e5', source: 'process-strategy', target: 'process-campaign' },
        { id: 'e6', source: 'process-campaign', target: 'merge-ltv' },
        { id: 'e7', source: 'code-ltv-predict', target: 'merge-ltv' },
        { id: 'e8', source: 'merge-ltv', target: 'output-ltv' },
      ],
    },
  },

  // 51. 法务：合同履约监控与违约预警 Agent
  {
    name: '合同履约监控与违约预警 Agent',
    description: '自动跟踪合同关键节点，预警履约风险，生成违约处置建议',
    category: 'legal',
    tags: ['合同管理', '履约监控', '违约预警', '法务自动化'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-contract',
          type: 'INPUT',
          name: '合同信息输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'contract_list', name: '合同清单', value: '', height: 200, placeholder: '合同编号、对方名称、签约日期、到期日期、关键条款...' },
              { id: 'milestone', name: '关键履约节点', value: '', height: 100, placeholder: '付款节点、交付节点、验收节点...' },
            ],
          },
        },
        {
          id: 'code-check-status',
          type: 'CODE',
          name: '履约状态检查',
          position: { x: 300, y: 300 },
          config: {
            language: 'javascript',
            code: `const today = new Date();
const contracts = [
  { id: "CON001", party: "供应商A", next_milestone: "2024-02-01", milestone_type: "付款", status: "pending", days_to_due: 10 },
  { id: "CON002", party: "客户B", next_milestone: "2024-01-20", milestone_type: "交付", status: "overdue", days_overdue: 5 }
];
return JSON.stringify({
  overdue: contracts.filter(c => c.status === "overdue"),
  upcoming: contracts.filter(c => c.status === "pending" && c.days_to_due <= 15),
  normal: contracts.filter(c => c.status === "pending" && c.days_to_due > 15)
});`,
          },
        },
        {
          id: 'switch-status',
          type: 'SWITCH',
          name: '履约状态分流',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{履约状态检查.has_overdue}}',
            cases: [{ value: 'true', label: '存在逾期' }],
            defaultCase: 'normal',
          },
        },
        {
          id: 'process-breach',
          type: 'PROCESS',
          name: '违约影响评估',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '你是一个法务专家。请评估违约合同的：1) 违约责任条款；2) 可主张的违约金/赔偿；3) 对业务的影响程度；4) 解约/继续履行的利弊分析。',
            userPrompt: '逾期合同：{{履约状态检查.overdue}}',
          },
        },
        {
          id: 'process-action',
          type: 'PROCESS',
          name: '违约处置建议',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '针对违约情况，给出处置建议：1) 催告函模板；2) 协商方案；3) 法律诉讼准备清单；4) 证据保全要点。',
            userPrompt: '违约评估：{{违约影响评估.result}}',
          },
        },
        {
          id: 'notify-legal',
          type: 'NOTIFICATION',
          name: '法务团队预警',
          position: { x: 1300, y: 150 },
          config: { provider: 'FEISHU', content: '【合同违约预警】合同{{履约状态检查.overdue_contract_id}}已逾期{{履约状态检查.days_overdue}}天，请法务团队跟进处理。' },
        },
        {
          id: 'process-reminder',
          type: 'PROCESS',
          name: '履约提醒生成',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '为即将到期的履约节点生成提醒通知，包含：节点内容、到期日期、责任人、所需准备工作。',
            userPrompt: '即将到期：{{履约状态检查.upcoming}}',
          },
        },
        {
          id: 'merge-contract',
          type: 'MERGE',
          name: '监控汇总',
          position: { x: 1300, y: 450 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-contract',
          type: 'OUTPUT',
          name: '合同履约监控报告',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出合同履约监控报告，包含履约状态总览、逾期合同清单、违约处置建议及即将到期提醒。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-contract', target: 'code-check-status' },
        { id: 'e2', source: 'code-check-status', target: 'switch-status' },
        { id: 'e3', source: 'switch-status', target: 'process-breach', sourceHandle: 'true' },
        { id: 'e4', source: 'process-breach', target: 'process-action' },
        { id: 'e5', source: 'process-action', target: 'notify-legal' },
        { id: 'e6', source: 'switch-status', target: 'process-reminder', sourceHandle: 'normal' },
        { id: 'e7', source: 'notify-legal', target: 'merge-contract' },
        { id: 'e8', source: 'process-reminder', target: 'merge-contract' },
        { id: 'e9', source: 'merge-contract', target: 'output-contract' },
      ],
    },
  },

  // ============================================================
  // 新增：第 52-61 号企业级 AES 标准模板
  // ============================================================

  // 52. 销售：商机赢单复盘与最佳实践萃取 Agent
  {
    name: '商机赢单复盘与最佳实践萃取 Agent',
    description: '分析成功签单案例，提炼关键成功因素，生成可复制的销售方法论',
    category: 'sales',
    tags: ['赢单复盘', '最佳实践', '销售方法论', '知识萃取'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-deal',
          type: 'INPUT',
          name: '赢单案例输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'deal_info', name: '商机基本信息', value: '', height: 150, placeholder: '客户名称、行业、金额、销售周期、参与人员...' },
              { id: 'timeline', name: '关键里程碑', value: '', height: 120, placeholder: '首次接触、需求确认、方案演示、商务谈判、签约等时间节点...' },
              { id: 'challenges', name: '过程中的挑战', value: '', height: 100, placeholder: '遇到的困难、竞争对手情况、客户异议...' },
            ],
          },
        },
        {
          id: 'process-timeline',
          type: 'PROCESS',
          name: '销售过程还原',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个销售教练。请基于里程碑信息，还原完整的销售过程，识别每个阶段的关键动作和决策点。',
            userPrompt: '商机信息：{{赢单案例输入.deal_info}}\n里程碑：{{赢单案例输入.timeline}}',
          },
        },
        {
          id: 'process-success-factor',
          type: 'PROCESS',
          name: '关键成功因素分析',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '深度分析赢单的关键成功因素：1) 客户关系建立策略；2) 需求挖掘技巧；3) 方案差异化亮点；4) 竞争应对策略；5) 临门一脚的关键动作。',
            userPrompt: '销售过程：{{销售过程还原.result}}\n挑战：{{赢单案例输入.challenges}}',
          },
        },
        {
          id: 'process-anti-pattern',
          type: 'PROCESS',
          name: '险情与应对复盘',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '分析过程中的险情时刻（差点丢单的情况），总结化险为夷的应对策略，提炼可复用的异议处理话术。',
            userPrompt: '挑战：{{赢单案例输入.challenges}}\n过程：{{销售过程还原.result}}',
          },
        },
        {
          id: 'process-playbook',
          type: 'PROCESS',
          name: '销售剧本生成',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '基于复盘结果，生成可复制的销售剧本（Playbook），包括：1) 适用客户画像；2) 各阶段标准动作；3) 关键话术模板；4) 常见异议应对；5) 成功率提升技巧。',
            userPrompt: '成功因素：{{关键成功因素分析.result}}\n险情应对：{{险情与应对复盘.result}}',
          },
        },
        {
          id: 'merge-review',
          type: 'MERGE',
          name: '复盘汇总',
          position: { x: 1050, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-playbook',
          type: 'OUTPUT',
          name: '赢单复盘报告',
          position: { x: 1300, y: 300 },
          config: { format: 'pdf', prompt: '输出完整的赢单复盘报告，包含过程还原、成功因素、险情应对及可复制的销售剧本。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-deal', target: 'process-timeline' },
        { id: 'e2', source: 'process-timeline', target: 'process-success-factor' },
        { id: 'e3', source: 'process-timeline', target: 'process-anti-pattern' },
        { id: 'e4', source: 'process-success-factor', target: 'process-playbook' },
        { id: 'e5', source: 'process-anti-pattern', target: 'process-playbook' },
        { id: 'e6', source: 'process-playbook', target: 'merge-review' },
        { id: 'e7', source: 'process-success-factor', target: 'merge-review' },
        { id: 'e8', source: 'merge-review', target: 'output-playbook' },
      ],
    },
  },

  // 53. 人力：员工敬业度调研与改进 Agent
  {
    name: '员工敬业度调研与改进 Agent',
    description: '分析员工满意度调研数据，识别敬业度驱动因素，生成针对性改进方案',
    category: 'hr',
    tags: ['敬业度', '员工满意度', '组织诊断', '改进方案'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-survey',
          type: 'DATA',
          name: '调研数据导入',
          position: { x: 50, y: 300 },
          config: { prompt: '导入员工敬业度调研问卷结果（评分数据、开放式反馈）' },
        },
        {
          id: 'process-quantitative',
          type: 'PROCESS',
          name: '量化指标分析',
          position: { x: 300, y: 150 },
          config: {
            systemPrompt: '分析敬业度调研的量化数据：1) 总体敬业度得分及趋势；2) 各维度得分（工作环境/领导力/发展机会/薪酬福利）；3) 部门/职级差异；4) 与行业基准对比。',
            userPrompt: '调研数据：{{调研数据导入.content}}',
          },
        },
        {
          id: 'process-qualitative',
          type: 'PROCESS',
          name: '开放反馈情感分析',
          position: { x: 300, y: 450 },
          config: {
            systemPrompt: '对员工开放式反馈进行情感分析和主题聚类：1) 正面反馈主题；2) 负面反馈主题；3) 高频关键词提取；4) 典型声音摘录。',
            userPrompt: '调研数据：{{调研数据导入.content}}',
          },
        },
        {
          id: 'process-driver',
          type: 'PROCESS',
          name: '敬业度驱动因素识别',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '基于量化和质性分析，识别影响敬业度的关键驱动因素：1) 最大正向驱动力；2) 最大负向拖累项；3) 高杠杆改进点（投入产出比最高的改进领域）。',
            userPrompt: '量化分析：{{量化指标分析.result}}\n质性分析：{{开放反馈情感分析.result}}',
          },
        },
        {
          id: 'switch-priority',
          type: 'SWITCH',
          name: '改进优先级判定',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{敬业度驱动因素识别.urgency}}',
            cases: [{ value: 'critical', label: '紧急-离职风险' }, { value: 'high', label: '高优-核心问题' }],
            defaultCase: 'normal',
          },
        },
        {
          id: 'process-action-critical',
          type: 'PROCESS',
          name: '紧急干预方案',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '针对可能导致批量离职的紧急问题，制定立即干预方案：1) 管理层沟通会议；2) 快速政策调整；3) 个别高风险员工一对一沟通。',
            userPrompt: '紧急问题：{{敬业度驱动因素识别.critical_issues}}',
          },
        },
        {
          id: 'process-action-plan',
          type: 'PROCESS',
          name: '系统性改进计划',
          position: { x: 1050, y: 450 },
          config: {
            systemPrompt: '制定系统性敬业度改进计划，包括：1) 短期速赢举措（30天内）；2) 中期改进项目（季度内）；3) 长期文化建设（年度）。每项包含责任人、里程碑、成功指标。',
            userPrompt: '驱动因素：{{敬业度驱动因素识别.result}}',
          },
        },
        {
          id: 'notify-hrbp',
          type: 'NOTIFICATION',
          name: 'HRBP 预警推送',
          position: { x: 1300, y: 150 },
          config: { provider: 'FEISHU', content: '【敬业度预警】调研发现紧急问题：{{敬业度驱动因素识别.critical_summary}}，建议立即启动干预。' },
        },
        {
          id: 'merge-engagement',
          type: 'MERGE',
          name: '报告汇总',
          position: { x: 1300, y: 450 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-engagement',
          type: 'OUTPUT',
          name: '敬业度分析报告',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出员工敬业度分析报告，包含数据洞察、驱动因素分析及分层改进方案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-survey', target: 'process-quantitative' },
        { id: 'e2', source: 'data-survey', target: 'process-qualitative' },
        { id: 'e3', source: 'process-quantitative', target: 'process-driver' },
        { id: 'e4', source: 'process-qualitative', target: 'process-driver' },
        { id: 'e5', source: 'process-driver', target: 'switch-priority' },
        { id: 'e6', source: 'switch-priority', target: 'process-action-critical', sourceHandle: 'critical' },
        { id: 'e7', source: 'switch-priority', target: 'process-action-plan', sourceHandle: 'high' },
        { id: 'e8', source: 'switch-priority', target: 'process-action-plan', sourceHandle: 'normal' },
        { id: 'e9', source: 'process-action-critical', target: 'notify-hrbp' },
        { id: 'e10', source: 'notify-hrbp', target: 'merge-engagement' },
        { id: 'e11', source: 'process-action-plan', target: 'merge-engagement' },
        { id: 'e12', source: 'merge-engagement', target: 'output-engagement' },
      ],
    },
  },

  // 54. 沟通：跨部门协作会议纪要与追踪 Agent
  {
    name: '跨部门协作会议纪要与追踪 Agent',
    description: '自动生成结构化会议纪要，分配待办事项，并持续追踪执行进度',
    category: 'admin',
    tags: ['会议纪要', '跨部门协作', '待办追踪', '执行闭环'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-meeting',
          type: 'INPUT',
          name: '会议信息输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'topic', name: '会议主题', value: '', placeholder: '会议议题' },
              { id: 'attendees', name: '参会人员', value: '', placeholder: '各部门参会代表' },
              { id: 'transcript', name: '会议记录/录音转写', value: '', height: 250, placeholder: '粘贴会议讨论内容或录音转写文本...' },
            ],
          },
        },
        {
          id: 'process-extract',
          type: 'PROCESS',
          name: '关键信息提取',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个专业的会议秘书。请从会议记录中提取：1) 讨论要点摘要；2) 达成的共识/决议；3) 存在的分歧/待定事项；4) 需要升级的问题。',
            userPrompt: '会议主题：{{会议信息输入.topic}}\n参会人员：{{会议信息输入.attendees}}\n会议记录：{{会议信息输入.transcript}}',
          },
        },
        {
          id: 'process-action',
          type: 'PROCESS',
          name: '待办事项拆解',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '从会议讨论中识别所有待办事项，并结构化输出：1) 任务描述；2) 责任人（根据发言内容推断）；3) 完成期限；4) 优先级；5) 依赖关系。',
            userPrompt: '会议要点：{{关键信息提取.result}}\n参会人员：{{会议信息输入.attendees}}',
          },
        },
        {
          id: 'process-risk',
          type: 'PROCESS',
          name: '协作风险识别',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '分析跨部门协作的潜在风险：1) 职责边界模糊处；2) 资源冲突点；3) 进度依赖瓶颈；4) 沟通断层风险。给出预防建议。',
            userPrompt: '待办事项：{{待办事项拆解.result}}\n分歧事项：{{关键信息提取.disputes}}',
          },
        },
        {
          id: 'code-gen-tasks',
          type: 'CODE',
          name: '任务卡片生成',
          position: { x: 800, y: 300 },
          config: {
            language: 'javascript',
            code: `const tasks = [
  { id: "T001", title: "完成接口文档", owner: "研发-张三", due: "2024-02-01", priority: "high", status: "pending" },
  { id: "T002", title: "准备测试环境", owner: "运维-李四", due: "2024-02-03", priority: "medium", status: "pending" }
];
return JSON.stringify({ tasks, total: tasks.length, notify_list: tasks.map(t => t.owner) });`,
          },
        },
        {
          id: 'notify-attendees',
          type: 'NOTIFICATION',
          name: '参会人员通知',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '【会议纪要】{{会议信息输入.topic}} 会议纪要已生成，您有{{任务卡片生成.your_tasks}}项待办任务，请及时确认。' },
        },
        {
          id: 'merge-meeting',
          type: 'MERGE',
          name: '纪要汇总',
          position: { x: 1050, y: 450 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-minutes',
          type: 'OUTPUT',
          name: '结构化会议纪要',
          position: { x: 1300, y: 300 },
          config: { format: 'markdown', prompt: '输出结构化会议纪要，包含议题摘要、决议事项、待办任务分配表及协作风险提示。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-meeting', target: 'process-extract' },
        { id: 'e2', source: 'process-extract', target: 'process-action' },
        { id: 'e3', source: 'process-extract', target: 'process-risk' },
        { id: 'e4', source: 'process-action', target: 'code-gen-tasks' },
        { id: 'e5', source: 'code-gen-tasks', target: 'notify-attendees' },
        { id: 'e6', source: 'process-risk', target: 'merge-meeting' },
        { id: 'e7', source: 'notify-attendees', target: 'merge-meeting' },
        { id: 'e8', source: 'merge-meeting', target: 'output-minutes' },
      ],
    },
  },

  // 55. 销售：渠道合作伙伴绩效评估 Agent
  {
    name: '渠道合作伙伴绩效评估 Agent',
    description: '评估经销商/代理商业绩表现，识别高潜力伙伴，生成激励与淘汰建议',
    category: 'sales',
    tags: ['渠道管理', '合作伙伴', '绩效评估', '渠道激励'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-partner',
          type: 'DATA',
          name: '渠道数据导入',
          position: { x: 50, y: 300 },
          config: { prompt: '导入渠道合作伙伴业绩数据（销售额、回款、客户满意度、市场覆盖等）' },
        },
        {
          id: 'process-score',
          type: 'PROCESS',
          name: '多维绩效评分',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个渠道管理专家。请对每个合作伙伴进行多维评分：1) 销售达成率（权重30%）；2) 回款及时率（20%）；3) 客户满意度（20%）；4) 市场开拓能力（15%）；5) 合规经营（15%）。计算综合得分并排名。',
            userPrompt: '渠道数据：{{渠道数据导入.content}}',
          },
        },
        {
          id: 'process-segment',
          type: 'PROCESS',
          name: '合作伙伴分层',
          position: { x: 550, y: 300 },
          config: {
            systemPrompt: '基于综合得分，将合作伙伴分为四个层级：1) 战略伙伴（Top 10%，重点扶持）；2) 核心伙伴（10-40%，稳定发展）；3) 发展伙伴（40-80%，待提升）；4) 观察伙伴（后20%，需整改或淘汰）。',
            userPrompt: '绩效评分：{{多维绩效评分.result}}',
          },
        },
        {
          id: 'switch-tier',
          type: 'SWITCH',
          name: '分层策略路由',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{合作伙伴分层.focus_tier}}',
            cases: [{ value: 'strategic', label: '战略伙伴-扶持' }, { value: 'watch', label: '观察伙伴-警告' }],
            defaultCase: 'normal',
          },
        },
        {
          id: 'process-incentive',
          type: 'PROCESS',
          name: '激励方案设计',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '为战略伙伴设计专属激励方案：1) 额外返点政策；2) 优先供货权；3) 联合营销支持；4) 高管互访计划。',
            userPrompt: '战略伙伴：{{合作伙伴分层.strategic_partners}}',
          },
        },
        {
          id: 'process-warning',
          type: 'PROCESS',
          name: '整改通知生成',
          position: { x: 1050, y: 450 },
          config: {
            systemPrompt: '为观察伙伴生成正式整改通知，包含：1) 问题点列举；2) 整改要求和期限；3) 未达标的后果（降级/解约）；4) 支持资源说明。',
            userPrompt: '观察伙伴：{{合作伙伴分层.watch_partners}}',
          },
        },
        {
          id: 'merge-partner',
          type: 'MERGE',
          name: '评估汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-partner',
          type: 'OUTPUT',
          name: '渠道绩效报告',
          position: { x: 1550, y: 300 },
          config: { format: 'excel', prompt: '输出渠道合作伙伴绩效评估报告，包含评分明细、分层结果、激励方案及整改通知。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-partner', target: 'process-score' },
        { id: 'e2', source: 'process-score', target: 'process-segment' },
        { id: 'e3', source: 'process-segment', target: 'switch-tier' },
        { id: 'e4', source: 'switch-tier', target: 'process-incentive', sourceHandle: 'strategic' },
        { id: 'e5', source: 'switch-tier', target: 'process-warning', sourceHandle: 'watch' },
        { id: 'e6', source: 'switch-tier', target: 'merge-partner', sourceHandle: 'normal' },
        { id: 'e7', source: 'process-incentive', target: 'merge-partner' },
        { id: 'e8', source: 'process-warning', target: 'merge-partner' },
        { id: 'e9', source: 'merge-partner', target: 'output-partner' },
      ],
    },
  },

  // 56. 人力：绩效面谈准备与辅导 Agent
  {
    name: '绩效面谈准备与辅导 Agent',
    description: '为管理者准备绩效面谈材料，生成个性化反馈话术和发展建议',
    category: 'hr',
    tags: ['绩效面谈', '管理辅导', '反馈技巧', '员工发展'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-performance',
          type: 'INPUT',
          name: '绩效数据输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'employee', name: '员工信息', value: '', placeholder: '姓名、岗位、入职时长、汇报关系' },
              { id: 'kpi_result', name: 'KPI 达成情况', value: '', height: 120, placeholder: '各项 KPI 的目标值与实际完成值...' },
              { id: 'behavior', name: '行为表现记录', value: '', height: 100, placeholder: '工作态度、协作能力、问题解决等行为观察...' },
              { id: 'context', name: '特殊背景', value: '', placeholder: '如：新人、转岗、项目变动等' },
            ],
          },
        },
        {
          id: 'process-analysis',
          type: 'PROCESS',
          name: '绩效全景分析',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个绩效管理专家。请综合分析员工绩效：1) 量化业绩评价（目标达成度）；2) 行为能力评价；3) 相较上期变化趋势；4) 在团队中的相对位置。',
            userPrompt: 'KPI：{{绩效数据输入.kpi_result}}\n行为表现：{{绩效数据输入.behavior}}\n背景：{{绩效数据输入.context}}',
          },
        },
        {
          id: 'switch-rating',
          type: 'SWITCH',
          name: '绩效等级路由',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{绩效全景分析.rating}}',
            cases: [{ value: 'excellent', label: '优秀-肯定激励' }, { value: 'poor', label: '待改进-辅导纠偏' }],
            defaultCase: 'normal',
          },
        },
        {
          id: 'process-positive',
          type: 'PROCESS',
          name: '正向激励话术',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '为优秀员工准备正向激励面谈话术：1) 具体成就肯定（STAR 法则）；2) 能力优势提炼；3) 更高挑战机会展望；4) 职业发展路径探讨。',
            userPrompt: '绩效分析：{{绩效全景分析.result}}',
          },
        },
        {
          id: 'process-improve',
          type: 'PROCESS',
          name: '改进辅导话术',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '为待改进员工准备建设性反馈话术（SBI模型）：1) 描述具体情境；2) 说明行为影响；3) 共同探讨改进方向；4) 约定跟进节点。注意维护员工尊严。',
            userPrompt: '绩效分析：{{绩效全景分析.result}}',
          },
        },
        {
          id: 'process-idp',
          type: 'PROCESS',
          name: '发展建议生成',
          position: { x: 1050, y: 300 },
          config: {
            systemPrompt: '基于绩效分析，生成个性化发展建议：1) 能力提升重点；2) 推荐学习资源/培训；3) 可参与的项目机会；4) 下一考核周期目标建议。',
            userPrompt: '绩效分析：{{绩效全景分析.result}}\n员工信息：{{绩效数据输入.employee}}',
          },
        },
        {
          id: 'merge-feedback',
          type: 'MERGE',
          name: '面谈材料汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-toolkit',
          type: 'OUTPUT',
          name: '绩效面谈工具包',
          position: { x: 1550, y: 300 },
          config: { format: 'markdown', prompt: '输出绩效面谈准备材料，包含绩效总结、面谈话术指南及个人发展计划建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-performance', target: 'process-analysis' },
        { id: 'e2', source: 'process-analysis', target: 'switch-rating' },
        { id: 'e3', source: 'switch-rating', target: 'process-positive', sourceHandle: 'excellent' },
        { id: 'e4', source: 'switch-rating', target: 'process-improve', sourceHandle: 'poor' },
        { id: 'e5', source: 'switch-rating', target: 'process-idp', sourceHandle: 'normal' },
        { id: 'e6', source: 'process-positive', target: 'process-idp' },
        { id: 'e7', source: 'process-improve', target: 'process-idp' },
        { id: 'e8', source: 'process-idp', target: 'merge-feedback' },
        { id: 'e9', source: 'process-analysis', target: 'merge-feedback' },
        { id: 'e10', source: 'merge-feedback', target: 'output-toolkit' },
      ],
    },
  },

  // 57. 沟通：客户投诉升级处理与根因分析 Agent
  {
    name: '客户投诉升级处理与根因分析 Agent',
    description: '处理升级投诉，分析根本原因，生成解决方案并推动流程改进',
    category: 'operation',
    tags: ['投诉处理', '升级管理', '根因分析', '流程改进'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-complaint',
          type: 'INPUT',
          name: '投诉信息录入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'customer', name: '客户信息', value: '', placeholder: '客户名称、等级、历史价值' },
              { id: 'issue', name: '投诉内容', value: '', height: 150, placeholder: '详细描述客户投诉的问题...' },
              { id: 'history', name: '处理历史', value: '', height: 100, placeholder: '之前的处理过程和客户反馈...' },
              { id: 'expectation', name: '客户诉求', value: '', placeholder: '客户期望的解决方案' },
            ],
          },
        },
        {
          id: 'process-classify',
          type: 'PROCESS',
          name: '投诉分类与定级',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个客诉处理专家。请对投诉进行分类（产品质量/服务态度/流程问题/承诺未兑现）和严重程度定级（P0紧急/P1严重/P2一般）。评估客户流失风险和舆情风险。',
            userPrompt: '投诉内容：{{投诉信息录入.issue}}\n客户信息：{{投诉信息录入.customer}}\n处理历史：{{投诉信息录入.history}}',
          },
        },
        {
          id: 'process-5why',
          type: 'PROCESS',
          name: '5Why 根因分析',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '运用5Why分析法追溯问题根本原因：从表象问题开始，连续追问"为什么"，直到找到可以采取行动的根本原因。区分即时原因和系统性原因。',
            userPrompt: '投诉分类：{{投诉分类与定级.result}}\n投诉详情：{{投诉信息录入.issue}}',
          },
        },
        {
          id: 'process-solution',
          type: 'PROCESS',
          name: '解决方案设计',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '设计分层解决方案：1) 即时补救措施（24小时内）；2) 客户补偿方案（根据客户价值和诉求）；3) 内部整改措施（防止再发）。平衡客户满意和公司成本。',
            userPrompt: '客户诉求：{{投诉信息录入.expectation}}\n根因分析：{{5Why 根因分析.result}}\n客户价值：{{投诉信息录入.customer}}',
          },
        },
        {
          id: 'switch-level',
          type: 'SWITCH',
          name: '处理层级路由',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{投诉分类与定级.level}}',
            cases: [{ value: 'P0', label: '高管介入' }, { value: 'P1', label: '经理处理' }],
            defaultCase: 'standard',
          },
        },
        {
          id: 'notify-escalation',
          type: 'NOTIFICATION',
          name: '升级通知',
          position: { x: 1050, y: 150 },
          config: { provider: 'FEISHU', content: '【P0级客诉升级】客户：{{投诉信息录入.customer}}，问题：{{投诉分类与定级.summary}}。需高管24小时内介入处理。' },
        },
        {
          id: 'process-prevention',
          type: 'PROCESS',
          name: '预防措施建议',
          position: { x: 1050, y: 450 },
          config: {
            systemPrompt: '基于根因分析，提出系统性预防措施建议：1) 流程优化点；2) 系统功能改进；3) 培训强化领域；4) 监控预警机制。',
            userPrompt: '根因：{{5Why 根因分析.root_cause}}',
          },
        },
        {
          id: 'merge-complaint',
          type: 'MERGE',
          name: '处理方案汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-resolution',
          type: 'OUTPUT',
          name: '投诉处理报告',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出完整投诉处理报告，包含问题分析、根因追溯、解决方案、客户沟通话术及预防建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-complaint', target: 'process-classify' },
        { id: 'e2', source: 'process-classify', target: 'process-5why' },
        { id: 'e3', source: 'process-classify', target: 'process-solution' },
        { id: 'e4', source: 'process-5why', target: 'process-solution' },
        { id: 'e5', source: 'process-classify', target: 'switch-level' },
        { id: 'e6', source: 'switch-level', target: 'notify-escalation', sourceHandle: 'P0' },
        { id: 'e7', source: 'process-5why', target: 'process-prevention' },
        { id: 'e8', source: 'notify-escalation', target: 'merge-complaint' },
        { id: 'e9', source: 'process-solution', target: 'merge-complaint' },
        { id: 'e10', source: 'process-prevention', target: 'merge-complaint' },
        { id: 'e11', source: 'merge-complaint', target: 'output-resolution' },
      ],
    },
  },

  // 58. 销售：销售团队战斗力诊断与提升 Agent
  {
    name: '销售团队战斗力诊断与提升 Agent',
    description: '诊断销售团队能力短板，设计针对性培训计划和激励机制',
    category: 'sales',
    tags: ['团队诊断', '能力提升', '销售培训', '团队激励'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-team',
          type: 'DATA',
          name: '团队数据导入',
          position: { x: 50, y: 300 },
          config: { prompt: '导入销售团队成员业绩数据（个人业绩、活动量、转化率、客单价等）' },
        },
        {
          id: 'process-individual',
          type: 'PROCESS',
          name: '个人能力画像',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '为每位销售生成能力画像：1) 业绩达成率；2) 活动效率（有效拜访率）；3) 转化能力（各阶段转化率）；4) 客单价水平；5) 新客户开拓能力。识别能力长短板。',
            userPrompt: '团队数据：{{团队数据导入.content}}',
          },
        },
        {
          id: 'process-team',
          type: 'PROCESS',
          name: '团队整体诊断',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '从团队整体维度诊断：1) 团队业绩分布（头部/腰部/尾部占比）；2) 共性能力短板；3) 团队协作效率；4) 与行业标杆的差距。',
            userPrompt: '个人画像：{{个人能力画像.result}}',
          },
        },
        {
          id: 'process-training',
          type: 'PROCESS',
          name: '培训计划设计',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '基于能力诊断，设计分层培训计划：1) 新人基础培训（产品知识/销售流程）；2) 腰部提升培训（转化技巧/异议处理）；3) 高手进阶培训（大客户经营/方案销售）。',
            userPrompt: '团队诊断：{{团队整体诊断.result}}\n个人画像：{{个人能力画像.result}}',
          },
        },
        {
          id: 'process-incentive',
          type: 'PROCESS',
          name: '激励机制优化',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '设计激励机制优化方案：1) 短期冲刺PK赛（月度/季度）；2) 荣誉激励体系（销冠榜/进步奖）；3) 成长激励（晋升通道/带教奖励）；4) 团队协作激励。',
            userPrompt: '团队诊断：{{团队整体诊断.result}}',
          },
        },
        {
          id: 'code-action-plan',
          type: 'CODE',
          name: '行动计划生成',
          position: { x: 1050, y: 300 },
          config: {
            language: 'javascript',
            code: `const plan = {
  week1: { focus: "问题宣导", actions: ["数据复盘会议", "目标共识会"] },
  week2_4: { focus: "能力提升", actions: ["专项培训", "一对一辅导"] },
  month2: { focus: "激励推动", actions: ["PK赛启动", "标杆分享会"] },
  ongoing: { focus: "持续跟进", actions: ["周例会追踪", "月度复盘"] }
};
return JSON.stringify(plan);`,
          },
        },
        {
          id: 'merge-team',
          type: 'MERGE',
          name: '诊断汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-team',
          type: 'OUTPUT',
          name: '团队战斗力提升方案',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出销售团队战斗力诊断报告，包含能力画像、团队诊断、培训计划及激励方案。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'data-team', target: 'process-individual' },
        { id: 'e2', source: 'process-individual', target: 'process-team' },
        { id: 'e3', source: 'process-individual', target: 'process-training' },
        { id: 'e4', source: 'process-team', target: 'process-training' },
        { id: 'e5', source: 'process-team', target: 'process-incentive' },
        { id: 'e6', source: 'process-training', target: 'code-action-plan' },
        { id: 'e7', source: 'process-incentive', target: 'code-action-plan' },
        { id: 'e8', source: 'code-action-plan', target: 'merge-team' },
        { id: 'e9', source: 'process-team', target: 'merge-team' },
        { id: 'e10', source: 'merge-team', target: 'output-team' },
      ],
    },
  },

  // 59. 人力：组织架构优化与岗位设计 Agent
  {
    name: '组织架构优化与岗位设计 Agent',
    description: '分析组织效能，优化架构设计，重新定义岗位职责与汇报关系',
    category: 'hr',
    tags: ['组织设计', '架构优化', '岗位设计', '人效提升'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-org',
          type: 'INPUT',
          name: '组织现状输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'structure', name: '现有组织架构', value: '', height: 150, placeholder: '部门设置、层级关系、人员配置...' },
              { id: 'pain_points', name: '当前痛点', value: '', height: 100, placeholder: '效率低下、职责不清、协作困难等问题...' },
              { id: 'strategy', name: '战略方向', value: '', placeholder: '公司未来1-3年战略重点' },
            ],
          },
        },
        {
          id: 'process-diagnosis',
          type: 'PROCESS',
          name: '组织效能诊断',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个组织发展顾问。请诊断当前组织的问题：1) 管理幅度是否合理；2) 层级是否过多；3) 职能是否重叠；4) 授权是否充分；5) 协作链条是否顺畅。',
            userPrompt: '组织架构：{{组织现状输入.structure}}\n痛点：{{组织现状输入.pain_points}}',
          },
        },
        {
          id: 'process-benchmark',
          type: 'PROCESS',
          name: '行业最佳实践对标',
          position: { x: 550, y: 150 },
          config: {
            systemPrompt: '参考同行业领先企业的组织架构模式，分析其设计逻辑和优势，为本次优化提供参考借鉴。',
            userPrompt: '战略方向：{{组织现状输入.strategy}}\n诊断结果：{{组织效能诊断.result}}',
          },
        },
        {
          id: 'process-redesign',
          type: 'PROCESS',
          name: '架构优化方案',
          position: { x: 550, y: 450 },
          config: {
            systemPrompt: '设计优化后的组织架构方案：1) 部门整合/拆分建议；2) 层级压缩方案；3) 新设/撤销岗位；4) 汇报关系调整。说明设计逻辑和预期效果。',
            userPrompt: '诊断结果：{{组织效能诊断.result}}\n最佳实践：{{行业最佳实践对标.result}}\n战略方向：{{组织现状输入.strategy}}',
          },
        },
        {
          id: 'process-jd',
          type: 'PROCESS',
          name: '岗位说明书生成',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '为优化后架构中的关键岗位生成岗位说明书（JD），包括：1) 岗位目的；2) 主要职责（按重要性排序）；3) 任职资格；4) 关键绩效指标；5) 汇报与协作关系。',
            userPrompt: '新架构：{{架构优化方案.result}}',
          },
        },
        {
          id: 'process-transition',
          type: 'PROCESS',
          name: '变革实施计划',
          position: { x: 1050, y: 300 },
          config: {
            systemPrompt: '设计组织变革实施计划：1) 沟通策略（何时/如何宣布）；2) 人员安置方案；3) 过渡期安排；4) 风险预案（关键人才流失/业务中断）。',
            userPrompt: '优化方案：{{架构优化方案.result}}',
          },
        },
        {
          id: 'merge-org',
          type: 'MERGE',
          name: '方案汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-org',
          type: 'OUTPUT',
          name: '组织优化方案',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出完整的组织架构优化方案，包含诊断报告、新架构设计、岗位说明书及实施计划。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-org', target: 'process-diagnosis' },
        { id: 'e2', source: 'process-diagnosis', target: 'process-benchmark' },
        { id: 'e3', source: 'process-diagnosis', target: 'process-redesign' },
        { id: 'e4', source: 'process-benchmark', target: 'process-redesign' },
        { id: 'e5', source: 'process-redesign', target: 'process-jd' },
        { id: 'e6', source: 'process-redesign', target: 'process-transition' },
        { id: 'e7', source: 'process-jd', target: 'merge-org' },
        { id: 'e8', source: 'process-transition', target: 'merge-org' },
        { id: 'e9', source: 'merge-org', target: 'output-org' },
      ],
    },
  },

  // 60. 沟通：内部通讯与公告智能撰写 Agent
  {
    name: '内部通讯与公告智能撰写 Agent',
    description: '根据事件类型自动生成规范的内部通讯稿、公告或备忘录',
    category: 'admin',
    tags: ['内部通讯', '公告撰写', '企业文化', '沟通规范'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-event',
          type: 'INPUT',
          name: '通讯事件输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'type', name: '通讯类型', value: '公告', placeholder: '公告/通知/喜报/备忘录/CEO信' },
              { id: 'topic', name: '事件主题', value: '', placeholder: '如：人事任命、政策变更、里程碑达成' },
              { id: 'content', name: '关键信息', value: '', height: 150, placeholder: '需要传达的核心内容要点...' },
              { id: 'audience', name: '受众范围', value: '全员', placeholder: '全员/管理层/特定部门' },
              { id: 'tone', name: '语气风格', value: '正式', placeholder: '正式/温暖/激励/严肃' },
            ],
          },
        },
        {
          id: 'process-structure',
          type: 'PROCESS',
          name: '结构化内容规划',
          position: { x: 300, y: 300 },
          config: {
            systemPrompt: '你是一个企业内部沟通专家。请根据通讯类型规划内容结构：1) 开篇引入；2) 核心信息传达；3) 背景说明（如需）；4) 行动号召/期望；5) 结尾收束。',
            userPrompt: '类型：{{通讯事件输入.type}}\n主题：{{通讯事件输入.topic}}\n内容：{{通讯事件输入.content}}\n受众：{{通讯事件输入.audience}}',
          },
        },
        {
          id: 'switch-type',
          type: 'SWITCH',
          name: '类型模板路由',
          position: { x: 550, y: 300 },
          config: {
            variable: '{{通讯事件输入.type}}',
            cases: [{ value: '喜报', label: '喜报-激励风格' }, { value: 'CEO信', label: 'CEO信-领导风格' }],
            defaultCase: 'standard',
          },
        },
        {
          id: 'process-celebration',
          type: 'PROCESS',
          name: '喜报撰写',
          position: { x: 800, y: 150 },
          config: {
            systemPrompt: '撰写激励人心的喜报：1) 振奋人心的开场；2) 成就详细描述；3) 团队/个人表彰；4) 感谢与展望。语言积极向上，可适当使用感叹号。',
            userPrompt: '结构规划：{{结构化内容规划.result}}\n语气：激励',
          },
        },
        {
          id: 'process-ceo-letter',
          type: 'PROCESS',
          name: 'CEO 信撰写',
          position: { x: 800, y: 300 },
          config: {
            systemPrompt: '撰写 CEO 致全员信：1) 体现战略高度和人文关怀；2) 直面问题或分享愿景；3) 传递信心和方向；4) 呼唤共同行动。语言真诚有力，避免官话套话。',
            userPrompt: '结构规划：{{结构化内容规划.result}}\n语气：{{通讯事件输入.tone}}',
          },
        },
        {
          id: 'process-standard',
          type: 'PROCESS',
          name: '标准公告撰写',
          position: { x: 800, y: 450 },
          config: {
            systemPrompt: '撰写规范的企业公告/通知：1) 清晰的标题；2) 简洁的正文（何事/何时/如何执行）；3) 相关附件说明；4) 联系人信息。语言正式规范。',
            userPrompt: '结构规划：{{结构化内容规划.result}}\n语气：{{通讯事件输入.tone}}',
          },
        },
        {
          id: 'process-polish',
          type: 'PROCESS',
          name: '语言润色与合规检查',
          position: { x: 1100, y: 300 },
          config: {
            systemPrompt: '对初稿进行润色和合规检查：1) 语言流畅度优化；2) 敏感词/不当表述检查；3) 法律合规性（如涉及人事/政策）；4) 格式规范性。',
            userPrompt: '初稿内容：待润色',
          },
        },
        {
          id: 'merge-comm',
          type: 'MERGE',
          name: '内容汇总',
          position: { x: 1350, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-comm',
          type: 'OUTPUT',
          name: '正式通讯稿',
          position: { x: 1600, y: 300 },
          config: { format: 'word', prompt: '输出排版规范的正式内部通讯稿，包含正文及发布建议。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-event', target: 'process-structure' },
        { id: 'e2', source: 'process-structure', target: 'switch-type' },
        { id: 'e3', source: 'switch-type', target: 'process-celebration', sourceHandle: '喜报' },
        { id: 'e4', source: 'switch-type', target: 'process-ceo-letter', sourceHandle: 'CEO信' },
        { id: 'e5', source: 'switch-type', target: 'process-standard', sourceHandle: 'standard' },
        { id: 'e6', source: 'process-celebration', target: 'process-polish' },
        { id: 'e7', source: 'process-ceo-letter', target: 'process-polish' },
        { id: 'e8', source: 'process-standard', target: 'process-polish' },
        { id: 'e9', source: 'process-polish', target: 'merge-comm' },
        { id: 'e10', source: 'merge-comm', target: 'output-comm' },
      ],
    },
  },

  // 61. 销售：报价单智能生成与审批 Agent
  {
    name: '报价单智能生成与审批 Agent',
    description: '根据客户需求和定价策略自动生成报价单，并触发审批流程',
    category: 'sales',
    tags: ['报价管理', '智能定价', '审批流程', 'CPQ'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-quote',
          type: 'INPUT',
          name: '报价需求输入',
          position: { x: 50, y: 300 },
          config: {
            fields: [
              { id: 'customer', name: '客户信息', value: '', placeholder: '客户名称、等级、历史采购额' },
              { id: 'products', name: '产品需求', value: '', height: 150, placeholder: '产品名称、规格、数量...' },
              { id: 'special_request', name: '特殊需求', value: '', placeholder: '定制需求、交付时间、付款条件等' },
            ],
          },
        },
        {
          id: 'process-rag-price',
          type: 'PROCESS',
          name: '价格库检索',
          position: { x: 300, y: 150 },
          config: {
            systemPrompt: '从产品价格库中检索相关产品的标准价格、成本价、最低折扣线。',
            userPrompt: '产品需求：{{报价需求输入.products}}',
            knowledgeBaseId: 'PRODUCT_PRICE_KB',
          },
        },
        {
          id: 'process-customer-policy',
          type: 'PROCESS',
          name: '客户政策匹配',
          position: { x: 300, y: 450 },
          config: {
            systemPrompt: '根据客户等级和历史采购情况，确定适用的折扣政策和信用政策。',
            userPrompt: '客户信息：{{报价需求输入.customer}}',
            knowledgeBaseId: 'CUSTOMER_POLICY_KB',
          },
        },
        {
          id: 'code-calculate',
          type: 'CODE',
          name: '报价计算引擎',
          position: { x: 550, y: 300 },
          config: {
            language: 'javascript',
            code: `const items = [
  { product: "产品A", quantity: 100, unit_price: 99, discount: 0.1, final_price: 89.1 },
  { product: "产品B", quantity: 50, unit_price: 199, discount: 0.15, final_price: 169.15 }
];
const subtotal = items.reduce((sum, i) => sum + i.final_price * i.quantity, 0);
const tax = subtotal * 0.13;
const total = subtotal + tax;
return JSON.stringify({ items, subtotal, tax, total, margin_rate: 0.25, needs_approval: total > 100000 });`,
          },
        },
        {
          id: 'switch-approval',
          type: 'SWITCH',
          name: '审批路由',
          position: { x: 800, y: 300 },
          config: {
            variable: '{{报价计算引擎.needs_approval}}',
            cases: [{ value: 'true', label: '需要审批' }],
            defaultCase: 'auto_approve',
          },
        },
        {
          id: 'process-quote-doc',
          type: 'PROCESS',
          name: '报价单生成',
          position: { x: 1050, y: 150 },
          config: {
            systemPrompt: '生成正式报价单，包含：1) 报价编号和日期；2) 客户信息；3) 产品明细表（含规格、数量、单价、折扣、小计）；4) 合计金额（含税）；5) 有效期；6) 付款条件；7) 备注条款。',
            userPrompt: '报价明细：{{报价计算引擎.result}}\n客户：{{报价需求输入.customer}}\n特殊需求：{{报价需求输入.special_request}}',
          },
        },
        {
          id: 'notify-approver',
          type: 'NOTIFICATION',
          name: '审批通知',
          position: { x: 1050, y: 450 },
          config: { provider: 'FEISHU', content: '【报价审批】客户：{{报价需求输入.customer}}，金额：{{报价计算引擎.total}}元，毛利率：{{报价计算引擎.margin_rate}}%。请审批。' },
        },
        {
          id: 'merge-quote',
          type: 'MERGE',
          name: '报价汇总',
          position: { x: 1300, y: 300 },
          config: { mergeStrategy: 'all' },
        },
        {
          id: 'output-quote',
          type: 'OUTPUT',
          name: '正式报价单',
          position: { x: 1550, y: 300 },
          config: { format: 'pdf', prompt: '输出正式的客户报价单，格式规范，可直接发送给客户。' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-quote', target: 'process-rag-price' },
        { id: 'e2', source: 'input-quote', target: 'process-customer-policy' },
        { id: 'e3', source: 'process-rag-price', target: 'code-calculate' },
        { id: 'e4', source: 'process-customer-policy', target: 'code-calculate' },
        { id: 'e5', source: 'code-calculate', target: 'switch-approval' },
        { id: 'e6', source: 'switch-approval', target: 'process-quote-doc', sourceHandle: 'auto_approve' },
        { id: 'e7', source: 'switch-approval', target: 'notify-approver', sourceHandle: 'true' },
        { id: 'e8', source: 'notify-approver', target: 'process-quote-doc' },
        { id: 'e9', source: 'process-quote-doc', target: 'merge-quote' },
        { id: 'e10', source: 'merge-quote', target: 'output-quote' },
      ],
    },
  },
]

/**
 * 导入官方模板到数据库
 */
export async function seedOfficialTemplates() {
  console.log('开始重构并导入企业级官方模板...')

  // 1. 彻底清理旧版官方模板
  // 删除所有标记为 isOfficial: true 的模板，确保不残留任何"玩具级"简单工作流
  console.log('正在清理旧版官方模板...')
  await prisma.workflowTemplate.deleteMany({
    where: {
      isOfficial: true,
    },
  })
  console.log('旧版模板清理完成。')

  // 2. 导入全新的企业级 Agent 模板
  for (const template of OFFICIAL_TEMPLATES) {
    await prisma.workflowTemplate.create({
      data: {
        ...template,
        visibility: 'PUBLIC',
        templateType: 'PUBLIC',
        isOfficial: true,
        creatorName: 'AI Workflow 官方',
      },
    })

    console.log(`已上线 Agent 级模板: ${template.name}`)
  }

  console.log('企业级官方模板库重构完成！')
}

// 脚本入口
if (require.main === module) {
  seedOfficialTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('导入失败:', error)
      process.exit(1)
    })
}
