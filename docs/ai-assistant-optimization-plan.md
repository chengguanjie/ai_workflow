# AI助手功能优化计划

## 一、优化概述

本优化计划针对AI工作流助手的4个核心功能进行增强，提升用户交互体验和功能完整性。

## 二、核心功能优化

### 功能1：帮我创建新的工作流

**优化内容：**
- 新增互动式需求确认流程（`requirement_confirmation` phase）
- AI返回结构化确认信息：工作流名称、目标、输入字段、处理步骤
- 用户可在确认卡片中编辑后确认
- 确认后AI生成完整工作流配置

**涉及文件：**
- `src/lib/workflow/generator.ts` - 添加 `REQUIREMENT_CONFIRMATION_PROMPT`
- `src/app/api/ai-assistant/chat/route.ts` - 解析新字段
- `src/components/workflow/ai-assistant/confirmation-card.tsx` - 新建确认卡片组件

### 功能2：帮我测试现有的工作流

**优化内容：**
- 新增测试数据选择提示（`test_data_selection` phase）
- 支持选择真实数据输入或系统模拟数据
- 测试执行进度显示
- 分类展示测试结果

**涉及文件：**
- `src/lib/workflow/generator.ts` - 添加 `TEST_DATA_SELECTION_PROMPT`
- `src/components/workflow/ai-assistant/test-progress.tsx` - 新建测试进度组件

### 功能3：帮我规划工作流的逻辑

**优化内容：**
- 新增互动式逻辑规划流程（`planning` phase）
- 分步骤引导用户确认：目标、输入、处理、输出
- 支持单选、多选、文本输入三种交互模式
- 最终输出节点布局预览

**涉及文件：**
- `src/lib/workflow/generator.ts` - 添加 `LOGIC_PLANNING_PROMPT`
- `src/components/workflow/ai-assistant/interactive-options.tsx` - 新建互动选项组件
- `src/components/workflow/ai-assistant/layout-preview.tsx` - 新建布局预览组件

### 功能4：帮我配置单个节点

**优化内容：**
- 新增节点选择引导流程（`node_selection` phase）
- 列出当前工作流所有节点供选择
- 展示选中节点的当前配置详情
- AI给出修改建议，用户确认后执行

**涉及文件：**
- `src/lib/workflow/generator.ts` - 添加 `NODE_CONFIG_PROMPT`
- `src/components/workflow/ai-assistant/node-config-display.tsx` - 新建节点配置展示组件

## 三、新增组件清单

| 组件名称 | 文件路径 | 用途 |
|---------|---------|------|
| ProgressIndicator | `ai-assistant/progress-indicator.tsx` | 通用任务进度指示器 |
| ConfirmationCard | `ai-assistant/confirmation-card.tsx` | 需求确认卡片，支持编辑 |
| InteractiveOptions | `ai-assistant/interactive-options.tsx` | 互动式问答选项 |
| CreationProgress | `ai-assistant/creation-progress.tsx` | 工作流创建进度 |
| TestProgress | `ai-assistant/test-progress.tsx` | 测试执行进度 |
| NodeConfigDisplay | `ai-assistant/node-config-display.tsx` | 节点配置展示 |
| LayoutPreview | `ai-assistant/layout-preview.tsx` | 工作流布局预览 |

## 四、状态管理扩展

**新增类型定义（`ai-assistant-store.ts`）：**

```typescript
// 任务阶段
type TaskPhase = 
  | 'idle'
  | 'requirement_confirmation'
  | 'creating'
  | 'test_data_selection'
  | 'testing'
  | 'planning'
  | 'node_selection'
  | 'node_config'
  | 'completed'

// 任务步骤
interface TaskStep {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  description?: string
}

// 需求确认信息
interface RequirementConfirmation {
  workflowName: string
  goal: string
  inputFields: Array<{ name: string; type: string; required: boolean; description?: string }>
  processSteps: Array<{ name: string; description: string }>
}

// 互动问题
interface InteractiveQuestion {
  id: string
  question: string
  type: 'single' | 'multiple' | 'text'
  options?: InteractiveOption[]
  required?: boolean
}

// 节点选择信息
interface NodeSelectionInfo {
  nodeId: string
  nodeName: string
  nodeType: string
  configSummary?: string
}
```

## 五、API响应格式扩展

**chat/route.ts 响应新增字段：**

```typescript
{
  content: string,
  nodeActions?: NodeAction[],
  phase?: string,
  // 新增字段
  requirementConfirmation?: RequirementConfirmation,
  interactiveQuestions?: InteractiveQuestion[],
  nodeSelection?: NodeSelectionInfo[],
  layoutPreview?: NodeAction[],
  planningStep?: number,
}
```

## 六、Prompt模板更新

**generator.ts 新增的Prompt模板：**

1. `REQUIREMENT_CONFIRMATION_PROMPT` - 需求确认阶段指令
2. `TEST_DATA_SELECTION_PROMPT` - 测试数据选择指令
3. `LOGIC_PLANNING_PROMPT` - 逻辑规划阶段指令
4. `NODE_CONFIG_PROMPT` - 节点配置阶段指令

## 七、文件修改清单

| 操作 | 文件路径 | 修改内容 |
|-----|---------|---------|
| 修改 | `src/stores/ai-assistant-store.ts` | 添加新类型定义和状态 |
| 修改 | `src/lib/workflow/generator.ts` | 添加4个新的Prompt模板 |
| 修改 | `src/app/api/ai-assistant/chat/route.ts` | 解析和返回新字段 |
| 修改 | `src/components/workflow/ai-assistant-panel.tsx` | 集成新组件 |
| 新建 | `src/components/workflow/ai-assistant/progress-indicator.tsx` | 进度指示器 |
| 新建 | `src/components/workflow/ai-assistant/confirmation-card.tsx` | 确认卡片 |
| 新建 | `src/components/workflow/ai-assistant/interactive-options.tsx` | 互动选项 |
| 新建 | `src/components/workflow/ai-assistant/creation-progress.tsx` | 创建进度 |
| 新建 | `src/components/workflow/ai-assistant/test-progress.tsx` | 测试进度 |
| 新建 | `src/components/workflow/ai-assistant/node-config-display.tsx` | 节点配置展示 |
| 新建 | `src/components/workflow/ai-assistant/layout-preview.tsx` | 布局预览 |
| 新建 | `src/components/workflow/ai-assistant/index.ts` | 组件导出索引 |

## 八、验证标准

### 功能1验证
- [ ] 用户输入需求后，AI返回确认卡片
- [ ] 确认卡片可编辑并提交
- [ ] 确认后工作流正确生成

### 功能2验证
- [ ] 触发测试后显示数据选择选项
- [ ] 测试执行时显示节点进度
- [ ] 测试结果分类清晰展示

### 功能3验证
- [ ] 识别规划意图并进入规划模式
- [ ] 分步骤互动确认
- [ ] 显示节点布局预览
- [ ] 确认后正确应用到画布

### 功能4验证
- [ ] 识别节点配置意图
- [ ] 列出节点供选择
- [ ] 展示当前配置详情
- [ ] 确认后正确应用更新

## 九、后续优化建议

1. **流式进度返回**：修改 `test/route.ts` 支持SSE流式返回测试进度
2. **创建进度追踪**：在工作流创建过程中实时更新进度条
3. **错误恢复机制**：在任意阶段支持回退到上一步
4. **历史记录优化**：保存用户的确认选择，便于下次快速选择
