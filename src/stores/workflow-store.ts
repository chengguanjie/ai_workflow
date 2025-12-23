import { create } from 'zustand'
import { persist, PersistStorage, StorageValue } from 'zustand/middleware'
import type { Node, Edge, OnNodesChange, OnEdgesChange, OnConnect, Viewport } from '@xyflow/react'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import type { NodeConfig, WorkflowConfig, GroupNodeConfigData, NodePosition } from '@/types/workflow'
import dagre from 'dagre'

function createThrottledStorage<T>(delay: number = 1000): PersistStorage<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let pendingValue: StorageValue<T> | null = null

  return {
    getItem: (name: string): StorageValue<T> | null => {
      const str = localStorage.getItem(name)
      if (!str) return null
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    },
    setItem: (name: string, value: StorageValue<T>): void => {
      pendingValue = value
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (pendingValue) {
            localStorage.setItem(name, JSON.stringify(pendingValue))
          }
          timeoutId = null
          pendingValue = null
        }, delay)
      }
    },
    removeItem: (name: string): void => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      pendingValue = null
      localStorage.removeItem(name)
    },
  }
}

interface WorkflowState {
  // 基本信息
  id: string | null
  name: string
  description: string
  manual: string

  // React Flow 状态
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport

  // 选中状态
  // 选中状态
  selectedNodeId: string | null
  connectedNodeIds: string[]
  connectedEdgeIds: string[]

  // 调试状态
  debugNodeId: string | null
  isDebugPanelOpen: boolean

  // 保存状态
  lastSavedAt: number | null
  isDirty: boolean

  // 节点执行状态
  nodeExecutionStatus: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused'>

  // 操作方法
  setWorkflow: (config: WorkflowConfig & { id?: string; name?: string; description?: string }) => void
  setName: (name: string) => void
  setDescription: (description: string) => void
  setManual: (manual: string) => void

  // React Flow 方法
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  // 节点操作
  addNode: (node: NodeConfig) => void
  updateNode: (nodeId: string, data: Partial<NodeConfig>) => void
  updateNodeComment: (nodeId: string, comment: string) => void
  deleteNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void

  // 字段引用更新
  renameInputField: (nodeName: string, oldFieldName: string, newFieldName: string) => void

  // 节点组合操作
  groupNodes: (nodeIds: string[]) => void
  ungroupNodes: (groupId: string) => void
  toggleGroupCollapse: (groupId: string) => void
  getSelectedNodeIds: () => string[]

  // 调试操作
  openDebugPanel: (nodeId: string) => void
  closeDebugPanel: () => void

  // Viewport 操作
  setViewport: (viewport: Viewport) => void

  // 执行状态操作
  updateNodeExecutionStatus: (nodeId: string, status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused') => void
  clearNodeExecutionStatus: () => void

  // 自动布局
  autoLayout: (direction?: 'TB' | 'LR') => void

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
  manual: '',
  nodes: [] as Node[],
  edges: [] as Edge[],
  viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
  selectedNodeId: null as string | null,
  connectedNodeIds: [] as string[],
  connectedEdgeIds: [] as string[],
  debugNodeId: null as string | null,
  isDebugPanelOpen: false,
  lastSavedAt: null as number | null,
  isDirty: false,
  nodeExecutionStatus: {} as Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused'>,
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setWorkflow: (config) => {

        // 首先找出所有组节点及其子节点关系，以及折叠状态
        const groupChildMap = new Map<string, { groupId: string; relativePositions?: Record<string, NodePosition>; isCollapsed: boolean }>()
        config.nodes.forEach((node) => {
          if (node.type === 'GROUP') {
            const groupConfig = node.config as GroupNodeConfigData
            const childNodeIds = groupConfig?.childNodeIds || []
            const isCollapsed = groupConfig?.collapsed || false
            childNodeIds.forEach((childId) => {
              groupChildMap.set(childId, {
                groupId: node.id,
                relativePositions: groupConfig?.childRelativePositions,
                isCollapsed,
              })
            })
          }
        })

        const nodes: Node[] = config.nodes.map((node) => {
          const groupInfo = groupChildMap.get(node.id)
          const baseNode: Node = {
            id: node.id,
            type: node.type.toLowerCase(),
            position: node.position,
            data: node,
          }

          // 如果是组的子节点，恢复 parentId 和 extent
          if (groupInfo) {
            return {
              ...baseNode,
              parentId: groupInfo.groupId,
              extent: 'parent' as const,
              // 使用保存的相对位置（如果有的话）
              position: groupInfo.relativePositions?.[node.id] || node.position,
              // 如果组是折叠状态，隐藏子节点
              hidden: groupInfo.isCollapsed,
            }
          }

          // 如果是组节点，设置样式
          if (node.type === 'GROUP') {
            const groupConfig = node.config as GroupNodeConfigData
            const childNodeIds = groupConfig?.childNodeIds || []
            const isCollapsed = groupConfig?.collapsed || false
            // 根据折叠状态设置不同尺寸
            const childCount = childNodeIds.length
            const nodeWidth = 180
            const nodeGap = 20
            const padding = 20
            const headerHeight = 50
            return {
              ...baseNode,
              style: isCollapsed
                ? { width: 180, height: 60 }
                : {
                  width: childCount * nodeWidth + (childCount - 1) * nodeGap + padding * 2,
                  height: 100 + padding * 2 + headerHeight
                },
            }
          }

          return baseNode
        })

        // 收集所有折叠的组及其子节点
        const collapsedGroupChildMap = new Map<string, string>() // childId -> groupId
        config.nodes.forEach((node) => {
          if (node.type === 'GROUP') {
            const groupConfig = node.config as GroupNodeConfigData
            if (groupConfig?.collapsed) {
              const childNodeIds = groupConfig.childNodeIds || []
              childNodeIds.forEach((childId) => {
                collapsedGroupChildMap.set(childId, node.id)
              })
            }
          }
        })

        // Deduplicate edges by ID, appending suffix for duplicates
        const seenEdgeIds = new Set<string>()
        const edges: Edge[] = config.edges.map((edge, index) => {
          let edgeId = edge.id
          if (seenEdgeIds.has(edgeId)) {
            edgeId = `${edge.id}-dup-${index}`
          }
          seenEdgeIds.add(edgeId)

          const sourceGroupId = collapsedGroupChildMap.get(edge.source)
          const targetGroupId = collapsedGroupChildMap.get(edge.target)

          // 如果两端都是同一个折叠组的子节点，隐藏这条边
          if (sourceGroupId && targetGroupId && sourceGroupId === targetGroupId) {
            return {
              id: edgeId,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              hidden: true,
            }
          }

          // 如果 source 是折叠组的子节点，映射到组节点
          if (sourceGroupId && !targetGroupId) {
            return {
              id: edgeId,
              source: sourceGroupId,
              sourceHandle: null,
              target: edge.target,
              targetHandle: edge.targetHandle,
              data: {
                _originalSource: edge.source,
                _originalSourceHandle: edge.sourceHandle,
              },
            }
          }

          // 如果 target 是折叠组的子节点，映射到组节点
          if (targetGroupId && !sourceGroupId) {
            return {
              id: edgeId,
              source: edge.source,
              sourceHandle: edge.sourceHandle,
              target: targetGroupId,
              targetHandle: null,
              data: {
                _originalTarget: edge.target,
                _originalTargetHandle: edge.targetHandle,
              },
            }
          }

          return {
            id: edgeId,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          }
        })

        set({
          id: config.id || null,
          name: config.name || '未命名工作流',
          description: config.description || '',
          manual: config.manual || '',
          nodes,
          edges,
          isDirty: false,
          lastSavedAt: Date.now(),
        })
      },

      setName: (name) => set({ name, isDirty: true }),
      setDescription: (description) => set({ description, isDirty: true }),
      setManual: (manual) => set({ manual, isDirty: true }),

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
              id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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

      updateNodeComment: (nodeId, comment) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, comment } }
              : node
          ),
          isDirty: true,
        })
      },

      deleteNode: (nodeId) => {
        const nodes = get().nodes
        const nodeToDelete = nodes.find((n) => n.id === nodeId)

        // 如果删除的是组节点，需要先恢复子节点到绝对位置
        if (nodeToDelete?.type === 'group') {
          const config = nodeToDelete.data.config as GroupNodeConfigData
          const childNodeIds = config?.childNodeIds || []

          // 恢复子节点位置并移除组引用
          const updatedNodes = nodes
            .filter((n) => n.id !== nodeId) // 移除组节点
            .map((node) => {
              if (childNodeIds.includes(node.id)) {
                return {
                  ...node,
                  parentId: undefined,
                  extent: undefined,
                  position: {
                    x: nodeToDelete.position.x + node.position.x,
                    y: nodeToDelete.position.y + node.position.y,
                  },
                }
              }
              return node
            })

          set({
            nodes: updatedNodes,
            edges: get().edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
            isDirty: true,
          })
        } else {
          set({
            nodes: nodes.filter((node) => node.id !== nodeId),
            edges: get().edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            selectedNodeId:
              get().selectedNodeId === nodeId ? null : get().selectedNodeId,
            isDirty: true,
          })
        }
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

      selectNode: (nodeId) => {
        if (!nodeId) {
          set({ selectedNodeId: null, connectedNodeIds: [], connectedEdgeIds: [] })
          return
        }

        const edges = get().edges
        const connectedEdgeIds: string[] = []
        const connectedNodeIds = new Set<string>()

        // Include the selected node itself
        connectedNodeIds.add(nodeId)

        edges.forEach((edge) => {
          if (edge.source === nodeId || edge.target === nodeId) {
            connectedEdgeIds.push(edge.id)
            connectedNodeIds.add(edge.source)
            connectedNodeIds.add(edge.target)
          }
        })

        set({
          selectedNodeId: nodeId,
          connectedNodeIds: Array.from(connectedNodeIds),
          connectedEdgeIds,
        })
      },

      // 字段引用更新：当输入节点字段名称变更时，更新所有引用该字段的节点配置
      renameInputField: (nodeName, oldFieldName, newFieldName) => {
        if (oldFieldName === newFieldName) return

        const oldReference = `{{${nodeName}.${oldFieldName}}}`
        const newReference = `{{${nodeName}.${newFieldName}}}`

        // 递归替换对象中所有字符串值里的引用
        const replaceInValue = (value: unknown): unknown => {
          if (typeof value === 'string') {
            return value.split(oldReference).join(newReference)
          }
          if (Array.isArray(value)) {
            return value.map(replaceInValue)
          }
          if (value !== null && typeof value === 'object') {
            const newObj: Record<string, unknown> = {}
            for (const [key, val] of Object.entries(value)) {
              newObj[key] = replaceInValue(val)
            }
            return newObj
          }
          return value
        }

        const nodes = get().nodes
        let hasChanges = false

        const updatedNodes = nodes.map((node) => {
          const nodeData = node.data as { config?: Record<string, unknown> }
          if (!nodeData.config) return node

          const newConfig = replaceInValue(nodeData.config) as Record<string, unknown>
          const configChanged = JSON.stringify(newConfig) !== JSON.stringify(nodeData.config)

          if (configChanged) {
            hasChanges = true
            return {
              ...node,
              data: {
                ...node.data,
                config: newConfig,
              },
            }
          }
          return node
        })

        if (hasChanges) {
          set({ nodes: updatedNodes, isDirty: true })
        }
      },

      // 获取当前选中的节点 ID 列表
      getSelectedNodeIds: () => {
        return get().nodes.filter((node) => node.selected).map((node) => node.id)
      },

      // 将多个节点组合成一个组
      groupNodes: (nodeIds) => {
        if (nodeIds.length < 2) return

        const nodes = get().nodes
        const edges = get().edges
        const nodesToGroup = nodes.filter((n) => nodeIds.includes(n.id))
        if (nodesToGroup.length < 2) return

        // 按照连接顺序排序节点（拓扑排序）
        const nodeIdSet = new Set(nodeIds)
        const inDegree = new Map<string, number>()
        const adjacency = new Map<string, string[]>()

        nodeIds.forEach((id) => {
          inDegree.set(id, 0)
          adjacency.set(id, [])
        })

        // 构建入度和邻接表（只考虑组内的边）
        edges.forEach((edge) => {
          if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
            adjacency.get(edge.source)?.push(edge.target)
          }
        })

        // 拓扑排序
        const queue: string[] = []
        const sortedNodeIds: string[] = []

        nodeIds.forEach((id) => {
          if (inDegree.get(id) === 0) {
            queue.push(id)
          }
        })

        while (queue.length > 0) {
          const current = queue.shift()!
          sortedNodeIds.push(current)
          adjacency.get(current)?.forEach((neighbor) => {
            const newDegree = (inDegree.get(neighbor) || 1) - 1
            inDegree.set(neighbor, newDegree)
            if (newDegree === 0) {
              queue.push(neighbor)
            }
          })
        }

        // 如果有环或未连接的节点，将剩余节点按原顺序添加
        nodeIds.forEach((id) => {
          if (!sortedNodeIds.includes(id)) {
            sortedNodeIds.push(id)
          }
        })

        // 计算组的边界框（基于排列后的位置）
        const nodeWidth = 180
        const nodeHeight = 100
        const nodeGap = 20 // 节点间距
        const padding = 20
        const headerHeight = 50 // 标题栏高度

        // 计算组的起始位置（取第一个节点的位置作为参考）
        const firstNode = nodesToGroup[0]
        const groupX = firstNode.position.x - padding
        const groupY = firstNode.position.y - padding - headerHeight

        // 计算组的尺寸
        const groupWidth = sortedNodeIds.length * nodeWidth + (sortedNodeIds.length - 1) * nodeGap + padding * 2
        const groupHeight = nodeHeight + padding * 2 + headerHeight

        // 计算每个子节点在组内的整齐位置
        const childRelativePositions: Record<string, NodePosition> = {}
        sortedNodeIds.forEach((nodeId, index) => {
          childRelativePositions[nodeId] = {
            x: padding + index * (nodeWidth + nodeGap),
            y: padding + headerHeight,
          }
        })

        // 创建组节点
        const groupId = `group_${Date.now()}`
        const groupNode: Node = {
          id: groupId,
          type: 'group',
          position: { x: groupX, y: groupY },
          data: {
            id: groupId,
            type: 'GROUP',
            name: '节点组',
            position: { x: groupX, y: groupY },
            config: {
              childNodeIds: sortedNodeIds,
              label: '节点组',
              collapsed: false,
              childRelativePositions,
            } as GroupNodeConfigData,
          },
          style: {
            width: groupWidth,
            height: groupHeight,
          },
        }

        // 更新子节点的 parentId 并调整相对位置
        const updatedNodes = nodes.map((node) => {
          if (nodeIds.includes(node.id)) {
            return {
              ...node,
              parentId: groupId,
              position: childRelativePositions[node.id],
              extent: 'parent' as const,
              selected: false,
            }
          }
          return node
        })

        set({
          nodes: [groupNode, ...updatedNodes],
          selectedNodeId: groupId,
          isDirty: true,
        })
      },

      // 拆散组节点
      ungroupNodes: (groupId) => {
        const nodes = get().nodes
        const edges = get().edges
        const groupNode = nodes.find((n) => n.id === groupId)
        if (!groupNode || groupNode.type !== 'group') return

        const config = groupNode.data.config as GroupNodeConfigData
        const childNodeIds = config.childNodeIds || []

        // 计算子节点的绝对位置
        const updatedNodes = nodes
          .filter((n) => n.id !== groupId) // 移除组节点
          .map((node) => {
            if (childNodeIds.includes(node.id)) {
              // 恢复子节点到绝对位置
              return {
                ...node,
                parentId: undefined,
                extent: undefined,
                hidden: false, // 确保子节点可见
                position: {
                  x: groupNode.position.x + node.position.x,
                  y: groupNode.position.y + node.position.y,
                },
              }
            }
            return node
          })

        // 处理边：恢复指向组节点的边回原始子节点
        const updatedEdges = edges
          .filter((_edge) => {
            // 过滤掉组内部的隐藏边（如果组是折叠状态）
            // 这些边在展开后会显示
            return true
          })
          .map((edge) => {
            let newEdge = { ...edge, hidden: false }

            // 如果边的 source 是组节点，恢复到原始子节点
            if (edge.source === groupId && edge.data?._originalSource) {
              newEdge = {
                ...newEdge,
                source: edge.data._originalSource as string,
                sourceHandle: edge.data._originalSourceHandle as string | undefined,
                data: {
                  ...newEdge.data,
                  _originalSource: undefined,
                  _originalSourceHandle: undefined,
                },
              }
            }

            // 如果边的 target 是组节点，恢复到原始子节点
            if (edge.target === groupId && edge.data?._originalTarget) {
              newEdge = {
                ...newEdge,
                target: edge.data._originalTarget as string,
                targetHandle: edge.data._originalTargetHandle as string | undefined,
                data: {
                  ...newEdge.data,
                  _originalTarget: undefined,
                  _originalTargetHandle: undefined,
                },
              }
            }

            return newEdge
          })
          // 过滤掉仍然连接到已删除组节点的边
          .filter((edge) => edge.source !== groupId && edge.target !== groupId)

        set({
          nodes: updatedNodes,
          edges: updatedEdges,
          selectedNodeId: null,
          isDirty: true,
        })
      },

      // 切换组节点折叠/展开状态
      toggleGroupCollapse: (groupId) => {
        const nodes = get().nodes
        const edges = get().edges
        const groupNode = nodes.find((n) => n.id === groupId)
        if (!groupNode || groupNode.type !== 'group') return

        const config = groupNode.data.config as GroupNodeConfigData
        const childNodeIds = config.childNodeIds || []
        const isCurrentlyCollapsed = config.collapsed || false
        const newCollapsedState = !isCurrentlyCollapsed
        const childNodeIdSet = new Set(childNodeIds)

        // 更新组节点的折叠状态和尺寸
        const nodeWidth = 180
        const nodeGap = 20
        const padding = 20
        const headerHeight = 50
        const childCount = childNodeIds.length

        const updatedNodes = nodes.map((node) => {
          if (node.id === groupId) {
            // 更新组节点
            const newConfig = {
              ...config,
              collapsed: newCollapsedState,
            }
            return {
              ...node,
              data: {
                ...node.data,
                config: newConfig,
              },
              style: newCollapsedState
                ? { width: 180, height: 60 } // 折叠后的小尺寸
                : {
                  width: childCount * nodeWidth + (childCount - 1) * nodeGap + padding * 2,
                  height: 100 + padding * 2 + headerHeight
                }, // 展开后的尺寸
            }
          }

          // 隐藏/显示子节点
          if (childNodeIds.includes(node.id)) {
            // 如果展开，需要重新计算子节点的位置
            if (!newCollapsedState) {
              // 找到当前节点在子节点列表中的索引
              const nodeIndex = childNodeIds.indexOf(node.id)
              if (nodeIndex !== -1) {
                // 使用存储的相对位置，如果没有则计算新位置
                const relativePositions = config.childRelativePositions as Record<string, NodePosition> | undefined
                const position = relativePositions?.[node.id] || {
                  x: padding + nodeIndex * (nodeWidth + nodeGap),
                  y: padding + headerHeight,
                }

                return {
                  ...node,
                  position,
                  hidden: false,
                }
              }
            }

            // 折叠时只隐藏
            return {
              ...node,
              hidden: newCollapsedState,
            }
          }

          return node
        })

        // 处理边的重新映射
        const updatedEdges = edges.map((edge) => {
          const sourceIsChild = childNodeIdSet.has(edge.source)
          const targetIsChild = childNodeIdSet.has(edge.target)
          const sourceIsExternal = !sourceIsChild && edge.source !== groupId
          const targetIsExternal = !targetIsChild && edge.target !== groupId

          // 组内边：两端都是子节点，折叠时隐藏
          if (sourceIsChild && targetIsChild) {
            return {
              ...edge,
              hidden: newCollapsedState,
            }
          }

          // 外部到子节点的边（入边）
          if (sourceIsExternal && targetIsChild) {
            if (newCollapsedState) {
              // 折叠：将 target 改为组节点，保存原始信息
              return {
                ...edge,
                target: groupId,
                targetHandle: null,
                data: {
                  ...edge.data,
                  _originalTarget: edge.target,
                  _originalTargetHandle: edge.targetHandle,
                },
              }
            } else {
              // 展开：恢复原始 target
              const originalTarget = edge.data?._originalTarget as string | undefined
              const originalTargetHandle = edge.data?._originalTargetHandle as string | undefined
              if (originalTarget) {
                return {
                  ...edge,
                  target: originalTarget,
                  targetHandle: originalTargetHandle,
                  data: {
                    ...edge.data,
                    _originalTarget: undefined,
                    _originalTargetHandle: undefined,
                  },
                }
              }
            }
          }

          // 子节点到外部的边（出边）
          if (sourceIsChild && targetIsExternal) {
            if (newCollapsedState) {
              // 折叠：将 source 改为组节点，保存原始信息
              return {
                ...edge,
                source: groupId,
                sourceHandle: null,
                data: {
                  ...edge.data,
                  _originalSource: edge.source,
                  _originalSourceHandle: edge.sourceHandle,
                },
              }
            } else {
              // 展开：恢复原始 source
              const originalSource = edge.data?._originalSource as string | undefined
              const originalSourceHandle = edge.data?._originalSourceHandle as string | undefined
              if (originalSource) {
                return {
                  ...edge,
                  source: originalSource,
                  sourceHandle: originalSourceHandle,
                  data: {
                    ...edge.data,
                    _originalSource: undefined,
                    _originalSourceHandle: undefined,
                  },
                }
              }
            }
          }

          // 组节点与外部的边（已经是组级别的边）
          if (edge.source === groupId || edge.target === groupId) {
            // 检查是否需要恢复
            if (!newCollapsedState) {
              const originalSource = edge.data?._originalSource as string | undefined
              const originalTarget = edge.data?._originalTarget as string | undefined
              if (originalSource || originalTarget) {
                return {
                  ...edge,
                  source: originalSource || edge.source,
                  target: originalTarget || edge.target,
                  sourceHandle: originalSource ? (edge.data?._originalSourceHandle as string | undefined) : edge.sourceHandle,
                  targetHandle: originalTarget ? (edge.data?._originalTargetHandle as string | undefined) : edge.targetHandle,
                  data: {
                    ...edge.data,
                    _originalSource: undefined,
                    _originalSourceHandle: undefined,
                    _originalTarget: undefined,
                    _originalTargetHandle: undefined,
                  },
                }
              }
            }
          }

          return edge
        })

        set({
          nodes: updatedNodes,
          edges: updatedEdges,
          isDirty: true,
        })
      },

      openDebugPanel: (nodeId) => set({ debugNodeId: nodeId, isDebugPanelOpen: true }),

      closeDebugPanel: () => set({ debugNodeId: null, isDebugPanelOpen: false }),

      setViewport: (viewport) => set({ viewport }),

      // 执行状态操作
      updateNodeExecutionStatus: (nodeId, status) => {
        set({
          nodeExecutionStatus: {
            ...get().nodeExecutionStatus,
            [nodeId]: status,
          },
        })
      },

      clearNodeExecutionStatus: () => {
        set({ nodeExecutionStatus: {} })
      },

      // 自动布局 - 使用 dagre 算法
      autoLayout: (direction = 'LR') => {
        const { nodes, edges } = get()
        if (nodes.length === 0) return

        // 创建 dagre 图
        const dagreGraph = new dagre.graphlib.Graph()
        dagreGraph.setDefaultEdgeLabel(() => ({}))

        // 设置图的布局方向
        // LR = 从左到右, TB = 从上到下
        dagreGraph.setGraph({
          rankdir: direction,
          nodesep: 80,    // 同层节点间距
          ranksep: 120,   // 层与层之间的间距
          edgesep: 50,    // 边之间的最小间距
          marginx: 50,
          marginy: 50,
        })

        // 节点默认尺寸
        const nodeWidth = 200
        const nodeHeight = 80

        // 分离组节点和普通节点
        const groupNodes = nodes.filter((n) => n.type === 'group')
        const regularNodes = nodes.filter((n) => n.type !== 'group' && !n.parentId)
        const _childNodes = nodes.filter((n) => n.parentId)

        // 只对非组内节点进行布局
        regularNodes.forEach((node) => {
          dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
        })

        // 组节点也参与布局，但尺寸不同
        const groupNodeWidth = 180
        const groupNodeGap = 20
        const groupPadding = 20
        const groupHeaderHeight = 50
        groupNodes.forEach((node) => {
          const config = node.data.config as GroupNodeConfigData
          const childCount = config?.childNodeIds?.length || 1
          const isCollapsed = config?.collapsed || false
          const width = isCollapsed ? 180 : childCount * groupNodeWidth + (childCount - 1) * groupNodeGap + groupPadding * 2
          const height = isCollapsed ? 60 : 100 + groupPadding * 2 + groupHeaderHeight
          dagreGraph.setNode(node.id, { width, height })
        })

        // 添加边（只处理顶层节点之间的边）
        const topLevelNodeIds = new Set([...regularNodes, ...groupNodes].map((n) => n.id))
        edges.forEach((edge) => {
          // 如果源或目标是子节点，找到其父组
          let sourceId = edge.source
          let targetId = edge.target

          const sourceNode = nodes.find((n) => n.id === edge.source)
          const targetNode = nodes.find((n) => n.id === edge.target)

          if (sourceNode?.parentId) sourceId = sourceNode.parentId
          if (targetNode?.parentId) targetId = targetNode.parentId

          // 只添加顶层节点之间的边
          if (topLevelNodeIds.has(sourceId) && topLevelNodeIds.has(targetId) && sourceId !== targetId) {
            dagreGraph.setEdge(sourceId, targetId)
          }
        })

        // 执行布局
        dagre.layout(dagreGraph)

        // 应用新位置到节点
        const updatedNodes = nodes.map((node) => {
          // 子节点保持相对位置不变
          if (node.parentId) {
            return node
          }

          const nodeWithPosition = dagreGraph.node(node.id)
          if (!nodeWithPosition) return node

          // dagre 返回的是中心点，需要转换为左上角
          const width = node.type === 'group'
            ? (typeof node.style?.width === 'number' ? node.style.width : 200)
            : nodeWidth
          const height = node.type === 'group'
            ? (typeof node.style?.height === 'number' ? node.style.height : 80)
            : nodeHeight

          return {
            ...node,
            position: {
              x: nodeWithPosition.x - width / 2,
              y: nodeWithPosition.y - height / 2,
            },
          }
        })

        set({
          nodes: updatedNodes,
          isDirty: true,
        })
      },

      getWorkflowConfig: () => {
        const { nodes, edges, manual } = get()

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
          manual,
        }
      },

      markSaved: () => set({ isDirty: false, lastSavedAt: Date.now() }),

      reset: () => set(initialState),
    }),
    {
      name: 'workflow-draft',
      storage: createThrottledStorage(1000),
      partialize: (state) => ({
        id: state.id,
        name: state.name,
        description: state.description,
        manual: state.manual,
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        lastSavedAt: state.lastSavedAt,
      }),
    }
  )
)
