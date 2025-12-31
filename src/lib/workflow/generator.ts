import { NodeConfig, EdgeConfig } from '@/types/workflow'

export const NODE_TYPE_DESCRIPTIONS = `
## 可用节点类型详解

系统目前只支持以下2种节点类型：

### 1. INPUT - 用户输入节点
- 作用：定义用户输入的字段，是工作流的起点
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

### 2. PROCESS - AI处理节点
- 作用：使用AI模型处理文本，支持知识库、工具调用等
- 配置项：
  - systemPrompt: 系统提示词（定义AI的角色和行为）
  - userPrompt: 用户提示词（支持变量引用，如{{输入.问题}}）
  - model: 模型名称
  - temperature: 温度(0-2，默认0.7)
  - maxTokens: 最大token数
  - knowledgeItems: 静态知识库数组
  - knowledgeBaseId: 外部知识库ID
  - ragConfig: RAG配置
  - tools: 工具配置（可选，支持HTTP请求、代码执行等）

## 重要说明
- 每个工作流必须以一个 INPUT 节点开始
- 可以有多个 PROCESS 节点串联处理
- 最后一个 PROCESS 节点的输出即为工作流的最终结果
- 通过 PROCESS 节点的 tools 配置可以实现HTTP请求、代码执行、图片生成等功能
`

const REQUIREMENT_GATHERING_PART = `
## 交互式需求收集阶段

你是一个专业的AI工作流设计专家。你的首要任务是通过**交互式选项**来引导用户明确需求，只有在需求明确后才生成工作流。

### 核心交互原则(必须遵守)
1. **使用选项提问**: 为了提供更好的用户体验，当你需要向用户提问时，必须使用 \`json:options\` 格式提供**可点击的选项**，而不是让用户自己输入。
2. **分阶段引导**: 
   - 第1轮：基础场景（客服/内容生成/数据处理等）和目标用户
   - 第2轮：输入输出（输入方式、数据类型、输出格式）
   - 第3轮：处理逻辑（是否需要AI/条件分支/API调用/通知）
   - 第4轮：确认方案

### 响应格式: 提问时 (json:options)

当需要收集需求时，在回答末尾使用以下JSON格式（确保JSON合法）：

\`\`\`json:options
{
  "phase": "requirement_gathering",
  "questions": [
    {
      "id": "q1",
      "question": "这个工作流的主要用途是什么？",
      "options": [
        {"id": "a", "label": "客服/问答", "description": "自动回复用户"},
        {"id": "b", "label": "内容生成", "description": "生成文章/报告"},
        {"id": "other", "label": "其他", "allowInput": true}
      ]
    }
  ]
}
\`\`\`
`

const GENERATION_GUIDELINES = `
## 工作流生成阶段

当用户确认方案后，或者是用户直接描述了完整需求时，你需要生成工作流配置。

### 设计原则
1. **完整性**: 必须有一个INPUT节点作为起点，流必须连通，不能有孤立节点。
2. **简洁性**: 只使用 INPUT 和 PROCESS 两种节点类型。
3. **可维护性**: 节点命名要清晰表达功能，变量引用必须准确，格式例如 \`{{输入.问题}}\`。

### 节点配置最佳实践

#### INPUT节点
- 作为工作流的入口，定义用户需要输入的字段。
- 每个字段需要明确的名称和类型。

#### PROCESS节点
- systemPrompt: 必须详尽，定义AI角色、任务、输出格式。
- userPrompt: 清晰引用上游变量，如 \`{{输入.问题}}\`。
- temperature: 创意任务0.7-1.0，严谨任务0.1-0.3。
- 如需调用外部API或执行代码，通过 tools 配置实现。

### 布局规范
- 节点水平间距: 250px
- 节点垂直间距: 150px
- 尽量保持从左到右的流向。

## 节点操作指令

### 支持的操作类型

1. **add**: 添加新节点
2. **update**: 更新现有节点的配置
3. **delete**: 删除节点
4. **connect**: 连接两个节点

### 操作示例

#### 添加节点 (add)
\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    {
      "action": "add",
      "nodeType": "PROCESS",
      "nodeName": "AI处理",
      "position": {"x": 400, "y": 200},
      "config": {
        "systemPrompt": "你是专业助手...",
        "userPrompt": "请处理：{{用户输入.问题}}"
      }
    }
  ]
}
\`\`\`

#### 更新节点 (update)
当用户要求修改现有节点的配置时使用：
\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    {
      "action": "update",
      "nodeId": "process_xxx",
      "nodeName": "AI处理",
      "config": {
        "systemPrompt": "新的系统提示词...",
        "temperature": 0.5
      }
    }
  ]
}
\`\`\`

#### 删除节点 (delete)
当用户要求删除节点时使用：
\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    {
      "action": "delete",
      "nodeId": "process_xxx",
      "nodeName": "要删除的节点名称"
    }
  ]
}
\`\`\`

#### 连接节点 (connect)
\`\`\`json:actions
{
  "phase": "workflow_generation",
  "nodeActions": [
    {
      "action": "connect",
      "source": "input_xxx",
      "target": "process_xxx"
    }
  ]
}
\`\`\`

## 工具配置详解

PROCESS节点支持配置tools来调用外部服务或执行代码。

### HTTP工具配置
\`\`\`json
{
  "tools": [
    {
      "id": "http_1",
      "name": "查询天气",
      "type": "HTTP",
      "enabled": true,
      "config": {
        "url": "https://api.example.com/weather",
        "method": "GET",
        "headers": {
          "Authorization": "Bearer xxx"
        },
        "queryParams": [
          {"key": "city", "value": "{{用户输入.城市}}"}
        ],
        "timeout": 30000
      }
    }
  ]
}
\`\`\`

### 代码执行工具配置
\`\`\`json
{
  "tools": [
    {
      "id": "code_1",
      "name": "数据处理",
      "type": "CODE",
      "enabled": true,
      "config": {
        "language": "javascript",
        "code": "return input.data.map(item => item.name);"
      }
    }
  ]
}
\`\`\`

## 知识库配置

PROCESS节点可以配置知识库用于RAG检索：

\`\`\`json
{
  "config": {
    "systemPrompt": "你是专业助手...",
    "userPrompt": "请回答：{{用户输入.问题}}",
    "knowledgeBaseId": "kb_xxx",
    "ragConfig": {
      "topK": 5,
      "scoreThreshold": 0.7,
      "includeMetadata": true
    }
  }
}
\`\`\`

## 引用规则
- 使用 "new_1", "new_2" ... 引用本次 \`nodeActions\` 数组中第1个、第2个添加的节点。
- 如果需要连接到画布上**已有**的节点（参考Working Context），请使用其真实ID。
- 更新或删除操作必须使用画布上已有节点的真实ID。

## 响应原则
1. 用户说"添加"、"新增"时，使用 add 操作
2. 用户说"修改"、"更新"、"改成"时，使用 update 操作
3. 用户说"删除"、"移除"、"去掉"时，使用 delete 操作
4. 多个操作可以在同一个 nodeActions 数组中组合使用
`

export const ENHANCED_SYSTEM_PROMPT = `
${REQUIREMENT_GATHERING_PART}

${GENERATION_GUIDELINES}

${NODE_TYPE_DESCRIPTIONS}

请用中文与用户交流。
`

export interface WorkflowValidationResult {
                  valid: boolean
                  errors: string[]
}

interface AddNodeAction {
                  action: 'add'
                  nodeType: string
                  nodeName: string
                  config?: Record<string, unknown>
                  position?: { x: number, y: number }
                  _virtualId?: string
}

interface ConnectAction {
                  action: 'connect'
                  source: string
                  target: string
                  sourceHandle?: string
                  targetHandle?: string
}

export function validateWorkflowActions(actions: any[]): WorkflowValidationResult {
                  const errors: string[] = []

                  const addActions = actions.filter(a => a.action === 'add') as AddNodeAction[]
                  const connectActions = actions.filter(a => a.action === 'connect') as ConnectAction[]

                  // Assign virtual IDs based on order
                  addActions.forEach((action, index) => {
                                    action._virtualId = `new_${index + 1}`
                  })

                  // 1. Check for isolated nodes (only if multiple nodes are being added)
                  // If we are adding just 1 node, it might be connected to existing nodes later or manually. 
                  // But generally AI generates a set.
                  if (addActions.length > 1) {
                                    const connectedNodeIds = new Set<string>()
                                    connectActions.forEach(edge => {
                                                      connectedNodeIds.add(edge.source)
                                                      connectedNodeIds.add(edge.target)
                                    })

                                    addActions.forEach(node => {
                                                      const id = node._virtualId!
                                                      // If a node is not in any connection source/target, it's isolated.
                                                      // Exception: If the user explicitly asked for "add a node" without connection. 
                                                      // But usually in "workflow_generation" phase, we expect completeness.
                                                      if (!connectedNodeIds.has(id)) {
                                                                        // Relaxed check: Maybe it connects to an EXISTING node? 
                                                                        // Usually connectActions in generation phase are internal to the new nodes or link new to existing.
                                                                        // If it links to existing, it should show up in connectActions.
                                                                        // So if it's not in connectActions, it is truly isolated.
                                                                        errors.push(`Node '${node.nodeName}' (index ${id}) is isolated.`)
                                                      }
                                    })
                  }

                  const hasInput = addActions.some(n => n.nodeType === 'INPUT')

                  if (!hasInput && addActions.length > 1) {
                                    errors.push("工作流缺少INPUT节点作为起点。")
                  }

                  return {
                                    valid: errors.length === 0,
                                    errors
                  }
}
