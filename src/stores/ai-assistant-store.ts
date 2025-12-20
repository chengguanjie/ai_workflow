import { create } from 'zustand'

export interface QuestionOption {
  id: string
  label: string
  description?: string
  allowInput?: boolean
}

export interface Question {
  id: string
  question: string
  options: QuestionOption[]
}

export interface QuestionOptions {
  phase: string
  questions: Question[]
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  nodeActions?: NodeAction[]
  testResult?: TestResult
  optimizationSuggestion?: OptimizationSuggestion
  aesReport?: AESReport
  questionOptions?: QuestionOptions
  messageType?: 'normal' | 'requirement' | 'workflow_generated' | 'test_result' | 'optimization' | 'aes_evaluation'
}

export interface AESReport {
  scores: {
    L: number
    A: number
    C: number
    P: number
    R: number
    total: number
  }
  report: string
  diagnosis: Array<{
    dimension: string
    issue: string
    severity: string
    suggestion: string
  }>
  needOptimization: boolean
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

export interface TestResult {
  success: boolean
  executionId?: string
  duration?: number
  output?: Record<string, unknown>
  error?: string
  nodeResults?: Array<{
    nodeId: string
    nodeName: string
    status: 'success' | 'error' | 'skipped'
    error?: string
    output?: unknown
  }>
  analysis?: string
}

export interface OptimizationSuggestion {
  issues: Array<{
    nodeId: string
    nodeName: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  proposedActions?: NodeAction[]
  summary: string
}

export interface RequirementAnalysis {
  understood: boolean
  summary: string
  clarifications?: string[]
  suggestedWorkflow?: {
    name: string
    description: string
    nodeTypes: string[]
    dataFlow: string
  }
}

export type ConversationPhase = 
  | 'requirement_gathering'
  | 'requirement_clarification'
  | 'workflow_design'
  | 'workflow_generation'
  | 'testing'
  | 'optimization'
  | 'completed'

export interface AutoOptimizationState {
  isRunning: boolean
  currentIteration: number
  maxIterations: number
  targetCriteria: string
  history: Array<{
    iteration: number
    testResult: TestResult
    optimization?: OptimizationSuggestion
    applied: boolean
  }>
}

export interface Conversation {
  id: string
  title: string
  workflowId: string
  messages: AIMessage[]
  createdAt: number
  updatedAt: number
  phase: ConversationPhase
  requirementAnalysis?: RequirementAnalysis
  autoOptimization?: AutoOptimizationState
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
  currentPhase: ConversationPhase
  autoOptimization: AutoOptimizationState | null
  isAutoMode: boolean
  testInput: Record<string, unknown>

  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  toggleHistory: () => void

  createConversation: (workflowId: string) => string
  selectConversation: (conversationId: string) => void
  deleteConversation: (conversationId: string) => void
  setConversations: (conversations: Conversation[]) => void
  updateConversationTitle: (conversationId: string, title: string) => void

  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  clearMessages: () => void
  setLoading: (loading: boolean) => void

  setSelectedModel: (modelId: string) => void
  setAvailableModels: (models: { id: string; name: string; provider: string; configId: string }[]) => void

  setPhase: (phase: ConversationPhase) => void
  setRequirementAnalysis: (analysis: RequirementAnalysis) => void
  startAutoOptimization: (targetCriteria: string, maxIterations?: number) => void
  stopAutoOptimization: () => void
  addOptimizationIteration: (testResult: TestResult, optimization?: OptimizationSuggestion, applied?: boolean) => void
  setAutoMode: (enabled: boolean) => void
  setTestInput: (input: Record<string, unknown>) => void
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
  currentPhase: 'requirement_gathering',
  autoOptimization: null,
  isAutoMode: false,
  testInput: {},

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  createConversation: (workflowId: string) => {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const newConversation: Conversation = {
      id,
      title: '新对话',
      workflowId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      phase: 'requirement_gathering',
    }

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      currentConversationId: id,
      messages: [],
      showHistory: false,
      currentPhase: 'requirement_gathering',
      autoOptimization: null,
    }))

    return id
  },

  selectConversation: (conversationId: string) => {
    const conversation = get().conversations.find(c => c.id === conversationId)
    if (conversation) {
      set({
        currentConversationId: conversationId,
        messages: conversation.messages,
        showHistory: false,
        currentPhase: conversation.phase,
        autoOptimization: conversation.autoOptimization || null,
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
        currentPhase: isCurrentDeleted ? 'requirement_gathering' : state.currentPhase,
        autoOptimization: isCurrentDeleted ? null : state.autoOptimization,
      }
    })
  },

  setConversations: (conversations: Conversation[]) => set({ conversations }),

  updateConversationTitle: (conversationId: string, title: string) => {
    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId ? { ...c, title } : c
      ),
    }))
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
            phase: state.currentPhase,
            autoOptimization: state.autoOptimization || undefined,
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

  clearMessages: () => set((state) => {
    if (state.currentConversationId) {
      return {
        messages: [],
        currentPhase: 'requirement_gathering',
        autoOptimization: null,
        conversations: state.conversations.map(c =>
          c.id === state.currentConversationId
            ? { ...c, messages: [], title: '新对话', updatedAt: Date.now(), phase: 'requirement_gathering' as ConversationPhase, autoOptimization: undefined }
            : c
        ),
      }
    }
    return { messages: [], currentPhase: 'requirement_gathering', autoOptimization: null }
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  setSelectedModel: (modelId) => set({ selectedModel: modelId }),
  setAvailableModels: (models) => set({ availableModels: models }),

  setPhase: (phase) => set((state) => {
    const updatedConversations = state.currentConversationId
      ? state.conversations.map(c =>
          c.id === state.currentConversationId ? { ...c, phase, updatedAt: Date.now() } : c
        )
      : state.conversations

    return { currentPhase: phase, conversations: updatedConversations }
  }),

  setRequirementAnalysis: (analysis) => set((state) => {
    if (!state.currentConversationId) return state

    return {
      conversations: state.conversations.map(c =>
        c.id === state.currentConversationId
          ? { ...c, requirementAnalysis: analysis, updatedAt: Date.now() }
          : c
      ),
    }
  }),

  startAutoOptimization: (targetCriteria, maxIterations = 5) => set((state) => {
    const autoOptimization: AutoOptimizationState = {
      isRunning: true,
      currentIteration: 0,
      maxIterations,
      targetCriteria,
      history: [],
    }

    const updatedConversations = state.currentConversationId
      ? state.conversations.map(c =>
          c.id === state.currentConversationId
            ? { ...c, autoOptimization, updatedAt: Date.now() }
            : c
        )
      : state.conversations

    return {
      autoOptimization,
      currentPhase: 'optimization',
      conversations: updatedConversations,
    }
  }),

  stopAutoOptimization: () => set((state) => {
    if (!state.autoOptimization) return state

    const stoppedOptimization = { ...state.autoOptimization, isRunning: false }

    const updatedConversations = state.currentConversationId
      ? state.conversations.map(c =>
          c.id === state.currentConversationId
            ? { ...c, autoOptimization: stoppedOptimization, updatedAt: Date.now() }
            : c
        )
      : state.conversations

    return {
      autoOptimization: stoppedOptimization,
      conversations: updatedConversations,
    }
  }),

  addOptimizationIteration: (testResult, optimization, applied = false) => set((state) => {
    if (!state.autoOptimization) return state

    const newIteration = {
      iteration: state.autoOptimization.currentIteration + 1,
      testResult,
      optimization,
      applied,
    }

    const updatedOptimization: AutoOptimizationState = {
      ...state.autoOptimization,
      currentIteration: newIteration.iteration,
      history: [...state.autoOptimization.history, newIteration],
    }

    const updatedConversations = state.currentConversationId
      ? state.conversations.map(c =>
          c.id === state.currentConversationId
            ? { ...c, autoOptimization: updatedOptimization, updatedAt: Date.now() }
            : c
        )
      : state.conversations

    return {
      autoOptimization: updatedOptimization,
      conversations: updatedConversations,
    }
  }),

  setAutoMode: (enabled) => set({ isAutoMode: enabled }),

  setTestInput: (input) => set({ testInput: input }),
}))
