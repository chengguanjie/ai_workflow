import { create } from 'zustand'

export interface NodeResultData {
  nodeId: string
  nodeName: string
  nodeType: string
  status: 'success' | 'error' | 'pending' | 'running'
  error?: string
  output?: Record<string, unknown>
  duration?: number
  promptTokens?: number
  completionTokens?: number
}

export interface TestResultData {
  success: boolean
  executionId?: string
  status?: string
  duration?: number
  totalTokens?: number
  error?: string
  output?: Record<string, unknown>
  nodeResults?: NodeResultData[]
  analysis?: string
  missingInputs?: string[]
}

export type TaskPhase = 
  | 'idle'
  | 'requirement_confirmation'
  | 'creating'
  | 'test_data_selection'
  | 'testing'
  | 'planning'
  | 'node_selection'
  | 'node_config'
  | 'node_diagnosis'
  | 'request_node_config'
  | 'completed'

export interface TaskStep {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  description?: string
}

export interface RequirementConfirmation {
  workflowName: string
  goal: string
  inputFields: Array<{ name: string; type: string; required: boolean; description?: string }>
  processSteps: Array<{ name: string; description: string }>
}

export interface InteractiveOption {
  id: string
  label: string
  description?: string
  icon?: string
  allowInput?: boolean
}

export interface InteractiveQuestion {
  id: string
  question: string
  type: 'single' | 'multiple' | 'text'
  options?: InteractiveOption[]
  required?: boolean
}

export interface NodeSelectionInfo {
  nodeId: string
  nodeName: string
  nodeType: string
  configSummary?: string
}

export interface DiagnosisProblem {
  type: 'prompt' | 'config' | 'connection' | 'tool' | 'other'
  issue: string
  severity: 'high' | 'medium' | 'low'
}

export interface DiagnosisResult {
  nodeName: string
  nodeId: string
  problems: DiagnosisProblem[]
  summary: string
}

export interface DiagnosisSuggestion {
  description: string
  priority: 'high' | 'medium' | 'low'
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  nodeActions?: NodeAction[]
  testResult?: TestResultData
  pendingFix?: boolean
  fixStatus?: 'pending' | 'applied' | 'rejected'
  phase?: TaskPhase
  requirementConfirmation?: RequirementConfirmation
  interactiveQuestions?: InteractiveQuestion[]
  nodeSelection?: NodeSelectionInfo[]
  layoutPreview?: NodeAction[]
  diagnosis?: DiagnosisResult
  suggestions?: DiagnosisSuggestion[]
}

export interface NodeAction {
  action: 'add' | 'update' | 'delete' | 'connect'
  nodeId?: string
  nodeType?: string
  nodeName?: string
  position?: { x: number; y: number }
  config?: Record<string, unknown>
  source?: string
  target?: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface Conversation {
  id: string
  title: string
  workflowId: string
  messages: AIMessage[]
  createdAt: number
  updatedAt: number
}

interface AIAssistantState {
  isOpen: boolean
  showHistory: boolean
  currentConversationId: string | null
  conversations: Conversation[]
  messages: AIMessage[]
  isLoading: boolean
  selectedModel: string
  availableModels: { id: string; name: string; provider: string; configId: string }[]

  panelPosition: { x: number; y: number } | null
  panelSize: { width: number; height: number }
  isMinimized: boolean

  currentPhase: TaskPhase
  taskProgress: number
  taskSteps: TaskStep[]
  pendingConfirmation: RequirementConfirmation | null
  testDataMode: 'real' | 'simulated' | null

  currentExecutionId: string | null
  testingNodes: NodeResultData[]
  isTestRunning: boolean

  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  toggleHistory: () => void

  setPanelPosition: (pos: { x: number; y: number } | null) => void
  setPanelSize: (size: { width: number; height: number }) => void
  toggleMinimize: () => void

  loadConversations: (workflowId: string) => Promise<void>
  createConversation: (workflowId: string) => string
  createConversationAsync: (workflowId: string) => Promise<string>
  selectConversation: (conversationId: string) => void
  deleteConversation: (conversationId: string) => void
  deleteConversationAsync: (conversationId: string) => Promise<void>

  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  addMessageAsync: (message: Omit<AIMessage, 'id' | 'timestamp'>) => Promise<void>
  updateMessageFixStatus: (messageId: string, status: 'applied' | 'rejected') => void
  clearMessages: () => void
  clearMessagesAsync: () => Promise<void>
  setLoading: (loading: boolean) => void

  setSelectedModel: (modelId: string) => void
  setAvailableModels: (models: { id: string; name: string; provider: string; configId: string }[]) => void

  setCurrentPhase: (phase: TaskPhase) => void
  setTaskProgress: (progress: number) => void
  setTaskSteps: (steps: TaskStep[]) => void
  updateTaskStep: (stepId: string, status: TaskStep['status']) => void
  setPendingConfirmation: (confirmation: RequirementConfirmation | null) => void
  setTestDataMode: (mode: 'real' | 'simulated' | null) => void
  resetTaskState: () => void

  setCurrentExecutionId: (id: string | null) => void
  setTestingNodes: (nodes: NodeResultData[]) => void
  updateTestingNode: (nodeId: string, data: Partial<NodeResultData>) => void
  setTestRunning: (running: boolean) => void
  clearTestState: () => void
}

function generateTitle(messages: AIMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (firstUserMessage) {
    const content = firstUserMessage.content
    return content.length > 20 ? content.slice(0, 20) + '...' : content
  }
  return '新对话'
}

export const useAIAssistantStore = create<AIAssistantState>()((set, get) => ({
  isOpen: false,
  showHistory: false,
  currentConversationId: null,
  conversations: [],
  messages: [],
  isLoading: false,
  selectedModel: '',
  availableModels: [],

  panelPosition: null,
  panelSize: { width: 420, height: 700 },
  isMinimized: false,

  currentPhase: 'idle' as TaskPhase,
  taskProgress: 0,
  taskSteps: [],
  pendingConfirmation: null,
  testDataMode: null,

  currentExecutionId: null,
  testingNodes: [],
  isTestRunning: false,

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  setPanelPosition: (pos) => set({ panelPosition: pos }),
  setPanelSize: (size) => set({ panelSize: size }),
  toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized })),

  setCurrentPhase: (phase) => set({ currentPhase: phase }),
  setTaskProgress: (progress) => set({ taskProgress: progress }),
  setTaskSteps: (steps) => set({ taskSteps: steps }),
  updateTaskStep: (stepId, status) => set((state) => ({
    taskSteps: state.taskSteps.map(step =>
      step.id === stepId ? { ...step, status } : step
    )
  })),
  setPendingConfirmation: (confirmation) => set({ pendingConfirmation: confirmation }),
  setTestDataMode: (mode) => set({ testDataMode: mode }),
  resetTaskState: () => set({
    currentPhase: 'idle',
    taskProgress: 0,
    taskSteps: [],
    pendingConfirmation: null,
    testDataMode: null,
  }),

  setCurrentExecutionId: (id) => set({ currentExecutionId: id }),
  setTestingNodes: (nodes) => set({ testingNodes: nodes }),
  updateTestingNode: (nodeId, data) => set((state) => ({
    testingNodes: state.testingNodes.map(node =>
      node.nodeId === nodeId ? { ...node, ...data } : node
    )
  })),
  setTestRunning: (running) => set({ isTestRunning: running }),
  clearTestState: () => set({
    currentExecutionId: null,
    testingNodes: [],
    isTestRunning: false,
  }),

  loadConversations: async (workflowId: string) => {
    try {
      const response = await fetch(`/api/ai-assistant/conversations?workflowId=${workflowId}`)
      if (!response.ok) {
        console.error('加载对话失败:', response.statusText)
        return
      }
      const result = await response.json()
      if (result.success && result.data) {
        set({ conversations: result.data })
      }
    } catch (error) {
      console.error('加载对话异常:', error)
    }
  },

  createConversation: (workflowId: string) => {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const newConversation: Conversation = {
      id,
      title: '新对话',
      workflowId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      currentConversationId: id,
      messages: [],
      showHistory: false,
    }))

    return id
  },

  createConversationAsync: async (workflowId: string) => {
    try {
      const response = await fetch('/api/ai-assistant/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      })
      
      if (!response.ok) {
        console.error('创建对话失败:', response.statusText)
        return get().createConversation(workflowId)
      }
      
      const result = await response.json()
      if (result.success && result.data) {
        const newConversation: Conversation = {
          id: result.data.id,
          title: result.data.title,
          workflowId: result.data.workflowId,
          messages: [],
          createdAt: result.data.createdAt,
          updatedAt: result.data.updatedAt,
        }
        
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: newConversation.id,
          messages: [],
          showHistory: false,
        }))
        
        return newConversation.id
      }
      
      return get().createConversation(workflowId)
    } catch (error) {
      console.error('创建对话异常:', error)
      return get().createConversation(workflowId)
    }
  },

  selectConversation: (conversationId: string) => {
    const conversation = get().conversations.find(c => c.id === conversationId)
    if (conversation) {
      set({
        currentConversationId: conversationId,
        messages: conversation.messages,
        showHistory: false,
      })
    }
  },

  deleteConversation: (conversationId: string) => {
    set((state) => {
      const newConversations = state.conversations.filter(c => c.id !== conversationId)
      const isCurrentDeleted = state.currentConversationId === conversationId

      return {
        conversations: newConversations,
        currentConversationId: isCurrentDeleted ? null : state.currentConversationId,
        messages: isCurrentDeleted ? [] : state.messages,
      }
    })
  },

  deleteConversationAsync: async (conversationId: string) => {
    get().deleteConversation(conversationId)
    
    try {
      await fetch(`/api/ai-assistant/conversations/${conversationId}`, {
        method: 'DELETE',
      })
    } catch (error) {
      console.error('删除对话异常:', error)
    }
  },

  addMessage: (message) => set((state) => {
    const newMessage: AIMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    }

    const newMessages = [...state.messages, newMessage]

    let updatedConversations = state.conversations
    if (state.currentConversationId) {
      updatedConversations = state.conversations.map(c => {
        if (c.id === state.currentConversationId) {
          const title = c.messages.length === 0 && message.role === 'user'
            ? generateTitle([newMessage])
            : c.title
          return {
            ...c,
            title,
            messages: newMessages,
            updatedAt: Date.now(),
          }
        }
        return c
      })
    }

    return {
      messages: newMessages,
      conversations: updatedConversations,
    }
  }),

  addMessageAsync: async (message) => {
    const state = get()
    const conversationId = state.currentConversationId
    
    const newMessage: AIMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    }
    
    const newMessages = [...state.messages, newMessage]
    
    let updatedConversations = state.conversations
    if (conversationId) {
      updatedConversations = state.conversations.map(c => {
        if (c.id === conversationId) {
          const title = c.messages.length === 0 && message.role === 'user'
            ? generateTitle([newMessage])
            : c.title
          return {
            ...c,
            title,
            messages: newMessages,
            updatedAt: Date.now(),
          }
        }
        return c
      })
    }
    
    set({
      messages: newMessages,
      conversations: updatedConversations,
    })
    
    if (conversationId) {
      try {
        await fetch(`/api/ai-assistant/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: message.role,
            content: message.content,
            phase: message.phase,
            nodeActions: message.nodeActions,
            testResult: message.testResult,
            pendingFix: message.pendingFix,
            fixStatus: message.fixStatus,
            diagnosis: message.diagnosis,
            suggestions: message.suggestions,
            interactiveQuestions: message.interactiveQuestions,
            nodeSelection: message.nodeSelection,
            layoutPreview: message.layoutPreview,
            requirementConfirmation: message.requirementConfirmation,
          }),
        })
      } catch (error) {
        console.error('保存消息异常:', error)
      }
    }
  },

  updateMessageFixStatus: (messageId: string, status: 'applied' | 'rejected') => set((state) => {
    const updateMessages = (msgs: AIMessage[]) => msgs.map(m =>
      m.id === messageId ? { ...m, fixStatus: status, pendingFix: false } : m
    )

    const newMessages = updateMessages(state.messages)
    const updatedConversations = state.conversations.map(c => {
      if (c.id === state.currentConversationId) {
        return { ...c, messages: updateMessages(c.messages), updatedAt: Date.now() }
      }
      return c
    })

    return { messages: newMessages, conversations: updatedConversations }
  }),

  clearMessages: () => set((state) => {
    if (state.currentConversationId) {
      return {
        messages: [],
        conversations: state.conversations.map(c =>
          c.id === state.currentConversationId
            ? { ...c, messages: [], title: '新对话', updatedAt: Date.now() }
            : c
        ),
      }
    }
    return { messages: [] }
  }),

  clearMessagesAsync: async () => {
    const conversationId = get().currentConversationId
    
    set((state) => {
      if (state.currentConversationId) {
        return {
          messages: [],
          conversations: state.conversations.map(c =>
            c.id === state.currentConversationId
              ? { ...c, messages: [], title: '新对话', updatedAt: Date.now() }
              : c
          ),
        }
      }
      return { messages: [] }
    })
    
    if (conversationId) {
      try {
        await fetch(`/api/ai-assistant/conversations/${conversationId}/messages`, {
          method: 'DELETE',
        })
      } catch (error) {
        console.error('清空消息异常:', error)
      }
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setSelectedModel: (modelId) => set({ selectedModel: modelId }),
  setAvailableModels: (models) => set({ availableModels: models }),
}))
