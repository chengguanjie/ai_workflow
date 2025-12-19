import { create } from 'zustand'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 如果是生成节点的响应，包含节点配置 */
  nodeActions?: NodeAction[]
}

export interface NodeAction {
  action: 'add' | 'update' | 'delete' | 'connect'
  nodeId?: string
  nodeType?: string
  nodeName?: string
  position?: { x: number; y: number }
  config?: Record<string, unknown>
  /** 连接操作的源和目标 */
  source?: string
  target?: string
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
  // 面板状态
  isOpen: boolean
  showHistory: boolean

  // 当前会话
  currentConversationId: string | null
  conversations: Conversation[]

  // 对话状态
  messages: AIMessage[]
  isLoading: boolean

  // 模型选择
  selectedModel: string
  availableModels: { id: string; name: string; provider: string; configId: string }[]

  // 操作方法
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  toggleHistory: () => void

  // 会话操作
  createConversation: (workflowId: string) => string
  selectConversation: (conversationId: string) => void
  deleteConversation: (conversationId: string) => void
  setConversations: (conversations: Conversation[]) => void
  updateConversationTitle: (conversationId: string, title: string) => void

  // 消息操作
  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => void
  clearMessages: () => void
  setLoading: (loading: boolean) => void

  // 模型操作
  setSelectedModel: (modelId: string) => void
  setAvailableModels: (models: { id: string; name: string; provider: string; configId: string }[]) => void
}

// 从消息生成对话标题
function generateTitle(messages: AIMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (firstUserMessage) {
    const content = firstUserMessage.content
    return content.length > 20 ? content.slice(0, 20) + '...' : content
  }
  return '新对话'
}

export const useAIAssistantStore = create<AIAssistantState>()((set, get) => ({
  // 初始状态
  isOpen: false,
  showHistory: false,
  currentConversationId: null,
  conversations: [],
  messages: [],
  isLoading: false,
  selectedModel: '',
  availableModels: [],

  // 面板操作
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),

  // 会话操作
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

  setConversations: (conversations: Conversation[]) => set({ conversations }),

  updateConversationTitle: (conversationId: string, title: string) => {
    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId ? { ...c, title } : c
      ),
    }))
  },

  // 消息操作
  addMessage: (message) => set((state) => {
    const newMessage: AIMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    }

    const newMessages = [...state.messages, newMessage]

    // 更新当前会话
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

  clearMessages: () => set((state) => {
    // 清空当前会话的消息
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

  setLoading: (loading) => set({ isLoading: loading }),

  // 模型操作
  setSelectedModel: (modelId) => set({ selectedModel: modelId }),
  setAvailableModels: (models) => set({ availableModels: models }),
}))
