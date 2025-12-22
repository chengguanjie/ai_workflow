import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { safeDecryptApiKey } from '@/lib/crypto'
import { aiService } from '@/lib/ai'

const NODE_TYPE_DESCRIPTIONS = `
## 可用节点类型详解

### 1. TRIGGER - 触发器节点
- 作用：定义工作流的触发方式
- 配置项：
  - triggerType: 'MANUAL' | 'WEBHOOK' | 'SCHEDULE'
  - cronExpression: 定时表达式(当triggerType为SCHEDULE时)
  - webhookPath: webhook路径(当triggerType为WEBHOOK时)
  - inputTemplate: 默认输入模板

### 2. INPUT - 输入节点
- 作用：定义用户输入的字段
- 配置项：
  - fields: 输入字段数组，每个字段包含：
    - id: 唯一ID
    - name: 字段名称（用于其他节点引用，格式：{{节点名.字段名}}）
    - value: 默认值
    - fieldType: 'text' | 'image' | 'pdf' | 'word' | 'excel' | 'audio' | 'video' | 'select' | 'multiselect'
    - placeholder: 占位文本
    - required: 是否必填
    - description: 字段描述
    - options: 选项列表(当fieldType为select/multiselect时)

### 3. PROCESS - AI文本处理节点（最重要的节点）
- 作用：使用AI模型处理文本，支持知识库
- 配置项：
  - systemPrompt: 系统提示词（定义AI的角色和行为）
  - userPrompt: 用户提示词（支持变量引用，如{{输入.问题}}）
  - model: 模型名称
  - temperature: 温度(0-2，默认0.7)
  - maxTokens: 最大token数
  - knowledgeItems: 静态知识库数组
  - knowledgeBaseId: 外部知识库ID
  - ragConfig: RAG配置

### 4. CODE - 代码执行节点
- 作用：执行JavaScript/Python代码
- 配置项：
  - language: 'javascript' | 'python'
  - code: 要执行的代码
  - prompt: AI生成代码的提示词

### 5. OUTPUT - 输出节点
- 作用：格式化和输出最终结果
- 配置项：
  - prompt: 输出格式提示词
  - format: 'text' | 'json' | 'markdown' | 'html' | 'word' | 'excel' | 'pdf'
  - fileName: 输出文件名

### 6. CONDITION - 条件分支节点
- 作用：根据条件进行分支
- 配置项：
  - conditions: 条件数组，每个条件包含：
    - variable: 要检查的变量（如{{处理结果.分类}}）
    - operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' 等
    - value: 比较值
  - evaluationMode: 'all' | 'any'
- 输出：两个分支（true分支和false分支），使用sourceHandle: 'true' 或 'false'

### 7. SWITCH - 多路分支节点
- 作用：根据变量值选择多个分支之一
- 配置项：
  - switchVariable: 要判断的变量
  - cases: 分支数组，每个分支包含：
    - id: 分支ID
    - label: 分支标签
    - value: 匹配值
    - isDefault: 是否为默认分支
  - matchType: 'exact' | 'contains' | 'regex'

### 8. LOOP - 循环节点
- 作用：对数组进行循环处理
- 配置项：
  - loopType: 'FOR' | 'WHILE'
  - forConfig: FOR循环配置
    - arrayVariable: 要遍历的数组变量
    - itemName: 当前项变量名（在循环体中使用{{loop.item}}）
  - whileConfig: WHILE循环配置
  - maxIterations: 最大迭代次数

### 9. HTTP - HTTP请求节点
- 作用：调用外部API
- 配置项：
  - method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  - url: 请求URL（支持变量）
  - headers: 请求头
  - queryParams: 查询参数
  - body: 请求体配置
    - type: 'json' | 'form' | 'text'
    - content: 内容
  - auth: 认证配置
  - timeout: 超时时间

### 10. MERGE - 合并节点
- 作用：合并多个并行分支的结果
- 配置项：
  - mergeStrategy: 'all' | 'any' | 'race'
  - errorStrategy: 'fail_fast' | 'continue' | 'collect'
  - outputMode: 'merge' | 'array' | 'first'

### 11. IMAGE_GEN - 图片生成节点
- 作用：使用AI生成图片
- 配置项：
  - prompt: 图片生成提示词
  - negativePrompt: 负面提示词
  - size: '256x256' | '512x512' | '1024x1024' 等
  - quality: 'standard' | 'hd'
  - n: 生成数量

### 12. NOTIFICATION - 通知节点
- 作用：发送飞书/钉钉/企业微信通知
- 配置项：
  - platform: 'feishu' | 'dingtalk' | 'wecom'
  - webhookUrl: webhook地址
  - messageType: 'text' | 'markdown' | 'card'
  - content: 消息内容（支持变量）
  - title: 标题

### 13. DATA - 数据导入节点
- 作用：导入Excel/CSV数据
- 配置项：
  - files: 文件列表
  - prompt: 数据处理提示词

### 14. IMAGE/VIDEO/AUDIO - 媒体节点
- 作用：处理图片/视频/音频文件
- 配置项：
  - files: 文件列表
  - prompt: 处理提示词
  - processingOptions: 处理选项
`

const REQUIREMENT_GATHERING_PROMPT = `你是一个专业的AI工作流设计专家。你的首要任务是通过**交互式选项**来引导用户明确需求。

## 核心交互原则

为了提供更好的用户体验，当你需要向用户提问时，必须提供**可点击的选项**让用户选择，而不是让用户自己输入。

## 响应格式

### 提问时必须使用选项格式

当需要收集需求时，在回答末尾使用以下JSON格式提供选项：

\`\`\`json:options
{
  "phase": "requirement_gathering",
  "questions": [
    {
      "id": "q1",
      "question": "这个工作流的主要用途是什么？",
      "options": [
        {"id": "a", "label": "客服/问答系统", "description": "自动回复用户问题"},
        {"id": "b", "label": "内容/文档生成", "description": "自动生成报告、文章等"},
        {"id": "c", "label": "数据处理/分析", "description": "处理Excel、分析数据"},
        {"id": "d", "label": "流程自动化", "description": "审批、通知等业务流程"},
        {"id": "other", "label": "其他", "description": "自定义描述", "allowInput": true}
      ]
    },
    {
      "id": "q2", 
      "question": "主要用户是谁？",
      "options": [
        {"id": "a", "label": "内部员工"},
        {"id": "b", "label": "外部客户"},
        {"id": "c", "label": "两者都有"},
        {"id": "other", "label": "其他", "allowInput": true}
      ]
    }
  ]
}
\`\`\`

### 选项格式说明
- 每个问题最多提供4-6个常见选项
- 最后一个选项必须是"其他"，设置 \`allowInput: true\` 让用户自由输入
- 选项要简洁明了，可以附带简短描述
- 一次最多问2-3个问题

### 需求收集流程

根据用户的回答，逐步深入以下方面：

**第1轮：基础场景**
- 工作流用途（问答、生成、分析、自动化等）
- 目标用户（内部/外部）

**第2轮：输入输出**
- 输入方式（手动输入、文件上传、API调用等）
- 输入数据类型（文本、图片、文档、数据表等）
- 输出格式（文本、Markdown、Word、Excel、PDF等）

**第3轮：处理逻辑**
- 是否需要AI处理（是/否）
- 是否需要条件分支（是/否）
- 是否需要调用外部API（是/否）
- 是否需要发送通知（飞书/钉钉/企业微信/不需要）

**第4轮：确认方案**
总结需求，展示设计方案，询问是否确认

### 当用户确认方案后，生成工作流

${NODE_TYPE_DESCRIPTIONS}

\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    {
      "action": "add",
      "nodeType": "TRIGGER",
      "nodeName": "触发器",
      "position": {"x": 100, "y": 200},
      "config": {
        "triggerType": "MANUAL",
        "enabled": true
      }
    },
    {
      "action": "add",
      "nodeType": "INPUT",
      "nodeName": "用户输入",
      "position": {"x": 300, "y": 200},
      "config": {
        "fields": [
          {
            "id": "field_1",
            "name": "问题",
            "value": "",
            "fieldType": "text",
            "placeholder": "请输入您的问题",
            "required": true
          }
        ]
      }
    },
    {
      "action": "add", 
      "nodeType": "PROCESS",
      "nodeName": "AI处理",
      "position": {"x": 500, "y": 200},
      "config": {
        "systemPrompt": "你是一个专业的助手...",
        "userPrompt": "{{用户输入.问题}}",
        "temperature": 0.7,
        "maxTokens": 2048
      }
    },
    {
      "action": "add",
      "nodeType": "OUTPUT", 
      "nodeName": "输出结果",
      "position": {"x": 700, "y": 200},
      "config": {
        "prompt": "{{AI处理.output}}",
        "format": "markdown"
      }
    },
    {
      "action": "connect",
      "source": "new_1",
      "target": "new_2"
    },
    {
      "action": "connect",
      "source": "new_2",
      "target": "new_3"
    },
    {
      "action": "connect",
      "source": "new_3",
      "target": "new_4"
    }
  ]
}
\`\`\`

### 条件分支连接
当使用CONDITION节点时，使用sourceHandle指定分支：
- \`"sourceHandle": "true"\` - 条件满足时的分支
- \`"sourceHandle": "false"\` - 条件不满足时的分支

## 重要说明
- 使用 "new_1", "new_2" 等表示新添加的节点（按添加顺序编号）
- position建议：x间隔200，y间隔150
- 为PROCESS节点编写专业的系统提示词和用户提示词
- 变量引用格式：{{节点名.字段名}}

请用中文与用户交流。`

const OPTIMIZATION_PROMPT = `你是一个工作流优化专家。你的任务是分析工作流的执行结果，找出问题并提出优化建议。

## 分析要点

1. **执行结果分析**
   - 哪些节点执行成功？
   - 哪些节点执行失败？失败原因是什么？
   - 输出结果是否符合预期？

2. **问题诊断**
   - 提示词是否有问题？需要如何优化？
   - 变量引用是否正确？
   - 节点配置是否合理？
   - 数据流是否顺畅？

3. **优化建议**
   - 提出具体的修改建议
   - 给出优化后的配置
   - 解释为什么这样优化

## 响应格式

分析完成后，如果需要修改节点配置，请使用以下格式：

\`\`\`json:actions
{
  "phase": "optimization",
  "analysis": {
    "issues": [
      {
        "nodeId": "节点ID",
        "nodeName": "节点名称",
        "issue": "问题描述",
        "suggestion": "建议的解决方案",
        "priority": "high"
      }
    ],
    "summary": "总体分析总结"
  },
  "nodeActions": [
    {
      "action": "update",
      "nodeId": "process_xxx",
      "nodeName": "AI处理",
      "config": {
        "systemPrompt": "优化后的系统提示词...",
        "userPrompt": "优化后的用户提示词..."
      }
    }
  ]
}
\`\`\`

请用中文回答。`

interface QuestionOption {
  id: string
  label: string
  description?: string
  allowInput?: boolean
}

interface Question {
  id: string
  question: string
  options: QuestionOption[]
}

interface ParsedResponse {
  cleanContent: string
  nodeActions: unknown[] | null
  phase?: string
  analysis?: unknown
  questionOptions?: {
    phase: string
    questions: Question[]
  }
}

function parseAIResponse(content: string): ParsedResponse {
  let cleanContent = content
  let nodeActions: unknown[] | null = null
  let phase: string | undefined
  let analysis: unknown
  let questionOptions: ParsedResponse['questionOptions']

  const actionMatch = content.match(/```json:actions\s*([\s\S]*?)```/)
  if (actionMatch) {
    try {
      const actionsJson = JSON.parse(actionMatch[1])
      cleanContent = cleanContent.replace(/```json:actions\s*[\s\S]*?```/, '').trim()
      nodeActions = actionsJson.nodeActions || null
      phase = actionsJson.phase
      analysis = actionsJson.analysis
    } catch {
    }
  }

  const optionsMatch = content.match(/```json:options\s*([\s\S]*?)```/)
  if (optionsMatch) {
    try {
      const optionsJson = JSON.parse(optionsMatch[1])
      cleanContent = cleanContent.replace(/```json:options\s*[\s\S]*?```/, '').trim()
      questionOptions = {
        phase: optionsJson.phase || 'requirement_gathering',
        questions: optionsJson.questions || [],
      }
      if (!phase) {
        phase = optionsJson.phase
      }
    } catch {
    }
  }

  return {
    cleanContent,
    nodeActions,
    phase,
    analysis,
    questionOptions,
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      message, 
      model, 
      workflowContext, 
      history,
      mode = 'normal',
      testResult,
      targetCriteria,
    } = body

    if (!message && mode !== 'optimization') {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 })
    }

    let configId: string | null = null
    let modelName: string | null = null

    if (model && model.includes(':')) {
      const parts = model.split(':')
      configId = parts[0]
      modelName = parts.slice(1).join(':')
    } else {
      modelName = model || null
    }

    let apiKey
    if (configId) {
      apiKey = await prisma.apiKey.findFirst({
        where: {
          id: configId,
          organizationId: session.user.organizationId,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      apiKey = await prisma.apiKey.findFirst({
        where: {
          organizationId: session.user.organizationId,
          isDefault: true,
          isActive: true,
        },
      })
    }

    if (!apiKey) {
      return NextResponse.json({ error: '未配置AI服务，请先在设置中配置AI服务商' }, { status: 400 })
    }

    let systemPrompt = REQUIREMENT_GATHERING_PROMPT
    
    if (mode === 'optimization') {
      systemPrompt = OPTIMIZATION_PROMPT
    }

    let systemContent = systemPrompt
    if (workflowContext) {
      systemContent += `\n\n---\n\n## 当前工作流画布状态\n${workflowContext}`
    }

    if (mode === 'optimization' && testResult) {
      systemContent += `\n\n## 测试执行结果\n\`\`\`json\n${JSON.stringify(testResult, null, 2)}\n\`\`\``
      if (targetCriteria) {
        systemContent += `\n\n## 用户期望的目标\n${targetCriteria}`
      }
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent },
    ]

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }
    }

    if (mode === 'optimization') {
      messages.push({ 
        role: 'user', 
        content: `请分析上面的测试执行结果，找出问题并提出具体的优化建议。如果有需要修改的节点配置，请直接给出修改方案。${targetCriteria ? `\n\n用户期望达到的目标：${targetCriteria}` : ''}` 
      })
    } else {
      messages.push({ role: 'user', content: message })
    }

    const selectedModel = modelName || apiKey.defaultModel || 'deepseek/deepseek-chat'
    const response = await aiService.chat(
      apiKey.provider,
      {
        model: selectedModel,
        messages,
        temperature: 0.7,
        maxTokens: 8192,
      },
      safeDecryptApiKey(apiKey.keyEncrypted),
      apiKey.baseUrl || undefined
    )

    const { cleanContent, nodeActions, phase, analysis, questionOptions } = parseAIResponse(response.content)

    return NextResponse.json({
      content: cleanContent,
      nodeActions,
      phase,
      analysis,
      questionOptions,
      model: response.model,
      usage: response.usage,
    })
  } catch (error) {
    console.error('AI Assistant error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI请求失败' },
      { status: 500 }
    )
  }
}
