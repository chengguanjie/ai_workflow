import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect, Viewport } from '@xyflow/react'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import type { NodeConfig, WorkflowConfig } from '@/types/workflow'

interface WorkflowState {
  // 基本信息
  id: string | null
  name: string
  description: string

  // React Flow 状态
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport

  // 选中状态
  selectedNodeId: string | null

  // 保存状态
  lastSavedAt: number | null
  isDirty: boolean

  // 操作方法
  setWorkflow: (config: WorkflowConfig & { id?: string; name?: string; description?: string }) => void
  setName: (name: string) => void
  setDescription: (description: string) => void

  // React Flow 方法
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  // 节点操作
  addNode: (node: NodeConfig) => void
  updateNode: (nodeId: string, data: Partial<NodeConfig>) => void
  deleteNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void

  // Viewport 操作
  setViewport: (viewport: Viewport) => void

  // 获取配置
  getWorkflowConfig: () => WorkflowConfig

  // 保存相关
  markSaved: () => void

  // 重置
  reset: () => void
}

const initialState = {
  id: null as string | null,
  name: '未命名工作流',
  description: '',
  nodes: [] as Node[],
  edges: [] as Edge[],
  viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
  selectedNodeId: null as string | null,
  lastSavedAt: null as number | null,
  isDirty: false,
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setWorkflow: (config) => {
        const nodes: Node[] = config.nodes.map((node) => ({
          id: node.id,
          type: node.type.toLowerCase(),
          position: node.position,
          data: node,
        }))

        const edges: Edge[] = config.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        }))

        set({
          id: config.id || null,
          name: config.name || '未命名工作流',
          description: config.description || '',
          nodes,
          edges,
          isDirty: false,
          lastSavedAt: Date.now(),
        })
      },

      setName: (name) => set({ name, isDirty: true }),
      setDescription: (description) => set({ description, isDirty: true }),

      onNodesChange: (changes) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes),
          isDirty: true,
        })
      },

      onEdgesChange: (changes) => {
        set({
          edges: applyEdgeChanges(changes, get().edges),
          isDirty: true,
        })
      },

      onConnect: (connection) => {
        set({
          edges: addEdge(
            {
              ...connection,
              id: `edge-${Date.now()}`,
            },
            get().edges
          ),
          isDirty: true,
        })
      },

      addNode: (nodeConfig) => {
        const newNode: Node = {
          id: nodeConfig.id,
          type: nodeConfig.type.toLowerCase(),
          position: nodeConfig.position,
          data: nodeConfig,
        }

        set({
          nodes: [...get().nodes, newNode],
          isDirty: true,
        })
      },

      updateNode: (nodeId, data) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...data } }
              : node
          ),
          isDirty: true,
        })
      },

      deleteNode: (nodeId) => {
        set({
          nodes: get().nodes.filter((node) => node.id !== nodeId),
          edges: get().edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
          selectedNodeId:
            get().selectedNodeId === nodeId ? null : get().selectedNodeId,
          isDirty: true,
        })
      },

      duplicateNode: (nodeId) => {
        const node = get().nodes.find((n) => n.id === nodeId)
        if (!node) return

        const newId = `${node.type}_${Date.now()}`
        const newNode: Node = {
          ...node,
          id: newId,
          position: {
            x: node.position.x + 50,
            y: node.position.y + 50,
          },
          data: {
            ...node.data,
            id: newId,
            name: `${node.data.name} (副本)`,
          },
          selected: false,
        }

        set({
          nodes: [...get().nodes, newNode],
          selectedNodeId: newId,
          isDirty: true,
        })
      },

      selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

      setViewport: (viewport) => set({ viewport }),

      getWorkflowConfig: () => {
        const { nodes, edges } = get()

        return {
          version: 1,
          nodes: nodes.map((node) => ({
            ...(node.data as NodeConfig),
            position: node.position, // 确保使用最新的位置
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          })),
        }
      },

      markSaved: () => set({ isDirty: false, lastSavedAt: Date.now() }),

      reset: () => set(initialState),
    }),
    {
      name: 'workflow-draft',
      partialize: (state) => ({
        id: state.id,
        name: state.name,
        description: state.description,
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        lastSavedAt: state.lastSavedAt,
      }),
    }
  )
)
