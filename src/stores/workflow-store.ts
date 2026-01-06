import { create } from "zustand";
import { persist, PersistStorage, StorageValue } from "zustand/middleware";
import type {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Viewport,
} from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import type {
  NodeConfig,
  WorkflowConfig,
  NodePosition,
  InputFieldType,
} from "@/types/workflow";
import dagre from "dagre";
import type { EnhancedDebugResult } from "@/lib/workflow/debug-panel/types";

interface GroupNodeConfigData {
  childNodeIds?: string[];
  label?: string;
  collapsed?: boolean;
  childRelativePositions?: Record<string, { x: number; y: number }>;
}

export interface NodeExecutionDetails {
  inputStatus: 'pending' | 'valid' | 'invalid' | 'missing';
  outputStatus: 'pending' | 'valid' | 'error' | 'empty' | 'invalid' | 'incomplete';
  inputError?: string;
  outputError?: string;
  triggered: boolean;
}

function createThrottledStorage<T>(delay: number = 1000): PersistStorage<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: StorageValue<T> | null = null;

  return {
    getItem: (name: string): StorageValue<T> | null => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: StorageValue<T>): void => {
      pendingValue = value;
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (pendingValue) {
            localStorage.setItem(name, JSON.stringify(pendingValue));
          }
          timeoutId = null;
          pendingValue = null;
        }, delay);
      }
    },
    removeItem: (name: string): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      pendingValue = null;
      localStorage.removeItem(name);
    },
  };
}

// 历史记录项
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
  timestamp: number;
}

interface WorkflowState {
  // 基本信息
  id: string | null;
  name: string;
  description: string;
  manual: string;

  // React Flow 状态
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;

  // 撤销/重做历史
  history: HistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;

  // 选中状态
  // 选中状态
  selectedNodeId: string | null;
  connectedNodeIds: string[];
  connectedEdgeIds: string[];

  // 调试状态
  debugNodeId: string | null;
  isDebugPanelOpen: boolean;

  // 保存状态
  lastSavedAt: number | null;
  isDirty: boolean;

  // 节点执行状态
  nodeExecutionStatus: Record<
    string,
    "pending" | "running" | "completed" | "failed" | "skipped" | "paused"
  >;

  // 节点执行结果
  nodeExecutionResults: Record<
    string,
    import("@/lib/workflow/debug-panel/types").EnhancedDebugResult | null
  >;

  // 节点执行详情（输入/输出状态）
  nodeExecutionDetails: Record<string, NodeExecutionDetails>;

  // 后台执行状态
  activeExecutionId: string | null;
  activeTaskId: string | null;
  // 最近一次执行（用于默认展示）
  latestExecutionId: string | null;

  // 操作方法
  setWorkflow: (
    config: WorkflowConfig & {
      id?: string;
      name?: string;
      description?: string;
    },
  ) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setManual: (manual: string) => void;

  // React Flow 方法
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // 节点操作
  addNode: (node: NodeConfig) => void;
  updateNode: (nodeId: string, data: Partial<NodeConfig>) => void;
  updateNodeComment: (nodeId: string, comment: string) => void;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // 字段引用更新
  renameInputField: (
    nodeName: string,
    oldFieldName: string,
    newFieldName: string,
  ) => void;

  // 节点组合操作
  groupNodes: (nodeIds: string[]) => void;
  ungroupNodes: (groupId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  getSelectedNodeIds: () => string[];

  // 撤销/重做操作
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;

  // 调试操作
  openDebugPanel: (nodeId: string) => void;
  closeDebugPanel: () => void;

  // Viewport 操作
  setViewport: (viewport: Viewport) => void;

  // 执行状态操作
  updateNodeExecutionStatus: (
    nodeId: string,
    status:
      | "pending"
      | "running"
      | "completed"
      | "failed"
      | "skipped"
      | "paused",
  ) => void;
  clearNodeExecutionStatus: () => void;

  // 节点执行结果操作
  updateNodeExecutionResult: (
    nodeId: string,
    result: EnhancedDebugResult | null,
  ) => void;
  clearNodeExecutionResult: (nodeId: string) => void;
  clearAllNodeExecutionResults: () => void;

  // 节点执行详情操作
  updateNodeExecutionDetails: (
    nodeId: string,
    details: Partial<NodeExecutionDetails>,
  ) => void;
  initNodeExecutionDetails: (nodeIds: string[]) => void;
  clearNodeExecutionDetails: () => void;

  // 后台执行操作
  setActiveExecution: (executionId: string, taskId?: string) => void;
  clearActiveExecution: () => void;
  setLatestExecutionId: (executionId: string | null) => void;

  // 自动布局
  autoLayout: (direction?: "TB" | "LR") => void;

  // 获取配置
  getWorkflowConfig: () => WorkflowConfig;

  // 保存相关
  markSaved: () => void;

  // 重置
  reset: () => void;
}

const initialState = {
  id: null as string | null,
  name: "未命名工作流",
  description: "",
  manual: "",
  nodes: [] as Node[],
  edges: [] as Edge[],
  viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
  history: [] as HistoryEntry[],
  historyIndex: -1,
  maxHistorySize: 50,
  selectedNodeId: null as string | null,
  connectedNodeIds: [] as string[],
  connectedEdgeIds: [] as string[],
  debugNodeId: null as string | null,
  isDebugPanelOpen: false,
  lastSavedAt: null as number | null,
  isDirty: false,
  nodeExecutionStatus: {} as Record<
    string,
    "pending" | "running" | "completed" | "failed" | "skipped" | "paused"
  >,
  nodeExecutionResults: {} as Record<
    string,
    import("@/lib/workflow/debug-panel/types").EnhancedDebugResult | null
  >,
  nodeExecutionDetails: {} as Record<string, NodeExecutionDetails>,
  activeExecutionId: null as string | null,
  activeTaskId: null as string | null,
  latestExecutionId: null as string | null,
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setWorkflow: (config) => {
        // 首先找出所有组节点，建立子节点到组节点的映射
        const groupNodeMap = new Map<string, string>(); // childId -> groupId

        config.nodes.forEach((node) => {
          if (node.type.toLowerCase() === "group") {
            const groupConfig = node.config as GroupNodeConfigData;
            const childNodeIds = groupConfig?.childNodeIds || [];
            childNodeIds.forEach((childId) => {
              groupNodeMap.set(childId, node.id);
            });
          }
        });

        const nodes: Node[] = config.nodes.map((node) => {
          const nodeType = node.type.toLowerCase();
          const parentGroupId = groupNodeMap.get(node.id);

          // 如果是组节点
          if (nodeType === "group") {
            const groupConfig = node.config as GroupNodeConfigData;
            const isCollapsed = groupConfig?.collapsed || false;
            const childCount = groupConfig?.childNodeIds?.length || 0;

            // 计算组节点尺寸
            const nodeWidth = 260;
            const nodeGap = 30;
            const padding = 30;
            const headerHeight = 60;
            const nodeHeight = 140;

            return {
              id: node.id,
              type: nodeType,
              position: node.position,
              data: node,
              style: isCollapsed
                ? { width: 280, height: 80 }
                : {
                    width:
                      childCount * nodeWidth +
                      (childCount - 1) * nodeGap +
                      padding * 2,
                    height: nodeHeight + padding * 2 + headerHeight,
                  },
            };
          }

          // 如果是子节点（属于某个组）
          if (parentGroupId) {
            const parentNode = config.nodes.find((n) => n.id === parentGroupId);
            const parentConfig = parentNode?.config as GroupNodeConfigData;
            const isCollapsed = parentConfig?.collapsed || false;

            return {
              id: node.id,
              type: nodeType,
              position: node.position,
              data: node,
              parentId: parentGroupId,
              extent: "parent" as const,
              hidden: isCollapsed,
            };
          }

          // 普通节点
          return {
            id: node.id,
            type: nodeType,
            position: node.position,
            data: node,
          };
        });

        const seenEdgeIds = new Set<string>();
        const edges: Edge[] = config.edges.map((edge, index) => {
          let edgeId = edge.id;
          if (seenEdgeIds.has(edgeId)) {
            edgeId = `${edge.id}-dup-${index}`;
          }
          seenEdgeIds.add(edgeId);

          return {
            id: edgeId,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          };
        });

        set({
          id: config.id || null,
          name: config.name || "未命名工作流",
          description: config.description || "",
          manual: config.manual || "",
          nodes,
          edges,
          isDirty: false,
          lastSavedAt: Date.now(),
          // 加载工作流时初始化历史记录
          history: [{ nodes, edges, timestamp: Date.now() }],
          historyIndex: 0,
        });
      },

      setName: (name) => set({ name, isDirty: true }),
      setDescription: (description) => set({ description, isDirty: true }),
      setManual: (manual) => set({ manual, isDirty: true }),

      // 撤销/重做功能
      pushHistory: () => {
        const { nodes, edges, history, historyIndex, maxHistorySize } = get();
        // 截断当前索引之后的历史（如果在撤销后进行了新操作）
        const newHistory = history.slice(0, historyIndex + 1);
        // 添加新的历史记录
        newHistory.push({
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
          timestamp: Date.now(),
        });
        // 限制历史记录大小
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
        }
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const entry = history[newIndex];
          set({
            nodes: JSON.parse(JSON.stringify(entry.nodes)),
            edges: JSON.parse(JSON.stringify(entry.edges)),
            historyIndex: newIndex,
            isDirty: true,
          });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          const entry = history[newIndex];
          set({
            nodes: JSON.parse(JSON.stringify(entry.nodes)),
            edges: JSON.parse(JSON.stringify(entry.edges)),
            historyIndex: newIndex,
            isDirty: true,
          });
        }
      },

      canUndo: () => {
        return get().historyIndex > 0;
      },

      canRedo: () => {
        const { history, historyIndex } = get();
        return historyIndex < history.length - 1;
      },

      onNodesChange: (changes) => {
        // 只有在位置变化结束时才记录历史（避免拖拽过程中产生大量历史记录）
        const hasPositionEnd = changes.some(
          (c) => c.type === "position" && !c.dragging,
        );
        const hasRemove = changes.some((c) => c.type === "remove");

        set({
          nodes: applyNodeChanges(changes, get().nodes),
          isDirty: true,
        });

        // 如果有位置变化结束或删除操作，记录历史
        if (hasPositionEnd || hasRemove) {
          get().pushHistory();
        }
      },

      onEdgesChange: (changes) => {
        const hasRemove = changes.some((c) => c.type === "remove");

        set({
          edges: applyEdgeChanges(changes, get().edges),
          isDirty: true,
        });

        // 如果有删除操作，记录历史
        if (hasRemove) {
          get().pushHistory();
        }
      },

      onConnect: (connection) => {
        set({
          edges: addEdge(
            {
              ...connection,
              id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            },
            get().edges,
          ),
          isDirty: true,
        });
        // 连接时记录历史
        get().pushHistory();
      },

      addNode: (nodeConfig) => {
        const newNode: Node = {
          id: nodeConfig.id,
          type: nodeConfig.type.toLowerCase(),
          position: nodeConfig.position,
          data: nodeConfig,
        };

        set({
          nodes: [...get().nodes, newNode],
          isDirty: true,
        });
        // 添加节点时记录历史
        get().pushHistory();
      },

      updateNode: (nodeId, data) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...data } }
              : node,
          ),
          isDirty: true,
        });
      },

      updateNodeComment: (nodeId, comment) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, comment } }
              : node,
          ),
          isDirty: true,
        });
      },

      deleteNode: (nodeId) => {
        const nodes = get().nodes;
        const nodeToDelete = nodes.find((n) => n.id === nodeId);

        // 如果删除的是组节点，需要先恢复子节点到绝对位置
        if (nodeToDelete?.type === "group") {
          const config = nodeToDelete.data.config as GroupNodeConfigData;
          const childNodeIds = config?.childNodeIds || [];

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
                };
              }
              return node;
            });

          set({
            nodes: updatedNodes,
            edges: get().edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId,
            ),
            selectedNodeId:
              get().selectedNodeId === nodeId ? null : get().selectedNodeId,
            isDirty: true,
          });
        } else {
          set({
            nodes: nodes.filter((node) => node.id !== nodeId),
            edges: get().edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId,
            ),
            selectedNodeId:
              get().selectedNodeId === nodeId ? null : get().selectedNodeId,
            isDirty: true,
          });
        }
      },

      duplicateNode: (nodeId) => {
        const node = get().nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const newId = `${node.type}_${Date.now()}`;
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
        };

        set({
          nodes: [...get().nodes, newNode],
          selectedNodeId: newId,
          isDirty: true,
        });
      },

      selectNode: (nodeId) => {
        if (!nodeId) {
          set({
            selectedNodeId: null,
            connectedNodeIds: [],
            connectedEdgeIds: [],
          });
          return;
        }

        const edges = get().edges;
        const connectedEdgeIds: string[] = [];
        const connectedNodeIds = new Set<string>();

        // Include the selected node itself
        connectedNodeIds.add(nodeId);

        edges.forEach((edge) => {
          if (edge.source === nodeId || edge.target === nodeId) {
            connectedEdgeIds.push(edge.id);
            connectedNodeIds.add(edge.source);
            connectedNodeIds.add(edge.target);
          }
        });

        set({
          selectedNodeId: nodeId,
          connectedNodeIds: Array.from(connectedNodeIds),
          connectedEdgeIds,
        });
      },

      // 字段引用更新：当输入节点字段名称变更时，更新所有引用该字段的节点配置
      renameInputField: (nodeName, oldFieldName, newFieldName) => {
        if (oldFieldName === newFieldName) return;

        const oldReference = `{{${nodeName}.${oldFieldName}}}`;
        const newReference = `{{${nodeName}.${newFieldName}}}`;

        // 递归替换对象中所有字符串值里的引用
        const replaceInValue = (value: unknown): unknown => {
          if (typeof value === "string") {
            return value.split(oldReference).join(newReference);
          }
          if (Array.isArray(value)) {
            return value.map(replaceInValue);
          }
          if (value !== null && typeof value === "object") {
            const newObj: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
              newObj[key] = replaceInValue(val);
            }
            return newObj;
          }
          return value;
        };

        const nodes = get().nodes;
        let hasChanges = false;

        const updatedNodes = nodes.map((node) => {
          const nodeData = node.data as { config?: Record<string, unknown> };
          if (!nodeData.config) return node;

          const newConfig = replaceInValue(nodeData.config) as Record<
            string,
            unknown
          >;
          const configChanged =
            JSON.stringify(newConfig) !== JSON.stringify(nodeData.config);

          if (configChanged) {
            hasChanges = true;
            return {
              ...node,
              data: {
                ...node.data,
                config: newConfig,
              },
            };
          }
          return node;
        });

        if (hasChanges) {
          set({ nodes: updatedNodes, isDirty: true });
        }
      },

      // 获取当前选中的节点 ID 列表
      getSelectedNodeIds: () => {
        return get()
          .nodes.filter((node) => node.selected)
          .map((node) => node.id);
      },

      // 将多个节点组合成一个组
      groupNodes: (nodeIds) => {
        if (nodeIds.length < 2) return;

        const nodes = get().nodes;
        const edges = get().edges;
        const nodesToGroup = nodes.filter((n) => nodeIds.includes(n.id));
        if (nodesToGroup.length < 2) return;

        // 按照连接顺序排序节点（拓扑排序）
        const nodeIdSet = new Set(nodeIds);
        const inDegree = new Map<string, number>();
        const adjacency = new Map<string, string[]>();

        nodeIds.forEach((id) => {
          inDegree.set(id, 0);
          adjacency.set(id, []);
        });

        // 构建入度和邻接表（只考虑组内的边）
        edges.forEach((edge) => {
          if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
            adjacency.get(edge.source)?.push(edge.target);
          }
        });

        // 拓扑排序
        const queue: string[] = [];
        const sortedNodeIds: string[] = [];

        nodeIds.forEach((id) => {
          if (inDegree.get(id) === 0) {
            queue.push(id);
          }
        });

        while (queue.length > 0) {
          const current = queue.shift()!;
          sortedNodeIds.push(current);
          adjacency.get(current)?.forEach((neighbor) => {
            const newDegree = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
              queue.push(neighbor);
            }
          });
        }

        // 如果有环或未连接的节点，将剩余节点按原顺序添加
        nodeIds.forEach((id) => {
          if (!sortedNodeIds.includes(id)) {
            sortedNodeIds.push(id);
          }
        });

        // 计算组的边界框（基于排列后的位置）
        const nodeWidth = 260; // 节点实际宽度约240px，增加一些余量
        const nodeHeight = 140; // 子节点高度
        const nodeGap = 30; // 节点间距
        const padding = 30; // 内边距
        const headerHeight = 60; // 标题栏高度

        // 计算组的起始位置（取第一个节点的位置作为参考）
        const firstNode = nodesToGroup[0];
        const groupX = firstNode.position.x - padding;
        const groupY = firstNode.position.y - padding - headerHeight;

        // 计算组的尺寸
        const groupWidth =
          sortedNodeIds.length * nodeWidth +
          (sortedNodeIds.length - 1) * nodeGap +
          padding * 2;
        const groupHeight = nodeHeight + padding * 2 + headerHeight;

        // 计算每个子节点在组内的整齐位置
        const childRelativePositions: Record<string, NodePosition> = {};
        sortedNodeIds.forEach((nodeId, index) => {
          childRelativePositions[nodeId] = {
            x: padding + index * (nodeWidth + nodeGap),
            y: padding + headerHeight,
          };
        });

        // 创建组节点
        const groupId = `group_${Date.now()}`;
        const groupNode: Node = {
          id: groupId,
          type: "group",
          position: { x: groupX, y: groupY },
          data: {
            id: groupId,
            type: "GROUP",
            name: "节点组",
            position: { x: groupX, y: groupY },
            config: {
              childNodeIds: sortedNodeIds,
              label: "节点组",
              collapsed: false,
              childRelativePositions,
            } as GroupNodeConfigData,
          },
          style: {
            width: groupWidth,
            height: groupHeight,
          },
        };

        // 更新子节点的 parentId 并调整相对位置
        const updatedNodes = nodes.map((node) => {
          if (nodeIds.includes(node.id)) {
            return {
              ...node,
              parentId: groupId,
              position: childRelativePositions[node.id],
              extent: "parent" as const,
              selected: false,
            };
          }
          return node;
        });

        set({
          nodes: [groupNode, ...updatedNodes],
          selectedNodeId: groupId,
          isDirty: true,
        });
      },

      // 拆散组节点
      ungroupNodes: (groupId) => {
        const nodes = get().nodes;
        const edges = get().edges;
        const groupNode = nodes.find((n) => n.id === groupId);
        if (!groupNode || groupNode.type !== "group") return;

        const config = groupNode.data.config as GroupNodeConfigData;
        const childNodeIds = config.childNodeIds || [];

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
              };
            }
            return node;
          });

        // 处理边：恢复指向组节点的边回原始子节点
        const updatedEdges = edges
          .filter((_edge) => {
            // 过滤掉组内部的隐藏边（如果组是折叠状态）
            // 这些边在展开后会显示
            return true;
          })
          .map((edge) => {
            let newEdge = { ...edge, hidden: false };

            // 如果边的 source 是组节点，恢复到原始子节点
            if (edge.source === groupId && edge.data?._originalSource) {
              newEdge = {
                ...newEdge,
                source: edge.data._originalSource as string,
                sourceHandle: edge.data._originalSourceHandle as
                  | string
                  | undefined,
                data: {
                  ...newEdge.data,
                  _originalSource: undefined,
                  _originalSourceHandle: undefined,
                },
              };
            }

            // 如果边的 target 是组节点，恢复到原始子节点
            if (edge.target === groupId && edge.data?._originalTarget) {
              newEdge = {
                ...newEdge,
                target: edge.data._originalTarget as string,
                targetHandle: edge.data._originalTargetHandle as
                  | string
                  | undefined,
                data: {
                  ...newEdge.data,
                  _originalTarget: undefined,
                  _originalTargetHandle: undefined,
                },
              };
            }

            return newEdge;
          })
          // 过滤掉仍然连接到已删除组节点的边
          .filter((edge) => edge.source !== groupId && edge.target !== groupId);

        set({
          nodes: updatedNodes,
          edges: updatedEdges,
          selectedNodeId: null,
          isDirty: true,
        });
      },

      // 切换组节点折叠/展开状态
      toggleGroupCollapse: (groupId) => {
        const nodes = get().nodes;
        const edges = get().edges;
        const groupNode = nodes.find((n) => n.id === groupId);
        if (!groupNode || groupNode.type !== "group") return;

        const config = groupNode.data.config as GroupNodeConfigData;
        const childNodeIds = config.childNodeIds || [];
        const isCurrentlyCollapsed = config.collapsed || false;
        const newCollapsedState = !isCurrentlyCollapsed;
        const childNodeIdSet = new Set(childNodeIds);

        // 更新组节点的折叠状态和尺寸
        const nodeWidth = 260; // 节点实际宽度约240px，增加一些余量
        const nodeGap = 30; // 增加节点间距
        const padding = 30; // 增加内边距
        const headerHeight = 60;
        const nodeHeight = 140; // 子节点高度
        const childCount = childNodeIds.length;

        const updatedNodes = nodes.map((node) => {
          if (node.id === groupId) {
            // 更新组节点
            const newConfig = {
              ...config,
              collapsed: newCollapsedState,
            };
            return {
              ...node,
              data: {
                ...node.data,
                config: newConfig,
              },
              style: newCollapsedState
                ? { width: 280, height: 80 } // 折叠后的小尺寸
                : {
                    width:
                      childCount * nodeWidth +
                      (childCount - 1) * nodeGap +
                      padding * 2,
                    height: nodeHeight + padding * 2 + headerHeight,
                  }, // 展开后的尺寸
            };
          }

          // 隐藏/显示子节点
          if (childNodeIds.includes(node.id)) {
            // 如果展开，强制重新计算子节点的位置
            if (!newCollapsedState) {
              // 找到当前节点在子节点列表中的索引
              const nodeIndex = childNodeIds.indexOf(node.id);
              if (nodeIndex !== -1) {
                // 强制使用新的尺寸参数计算位置，确保间距正确
                const position = {
                  x: padding + nodeIndex * (nodeWidth + nodeGap),
                  y: padding + headerHeight,
                };

                return {
                  ...node,
                  position,
                  hidden: false,
                  parentId: groupId, // 保持父节点关联
                  extent: "parent" as const, // 保持子节点限制在父节点内
                };
              }
            }

            // 折叠时只隐藏，但保持父节点关联
            return {
              ...node,
              hidden: newCollapsedState,
              parentId: groupId, // 保持父节点关联
              extent: "parent" as const, // 保持子节点限制在父节点内
            };
          }

          return node;
        });

        // 处理边的重新映射
        const updatedEdges = edges.map((edge) => {
          const sourceIsChild = childNodeIdSet.has(edge.source);
          const targetIsChild = childNodeIdSet.has(edge.target);
          const sourceIsExternal = !sourceIsChild && edge.source !== groupId;
          const targetIsExternal = !targetIsChild && edge.target !== groupId;

          // 组内边：两端都是子节点，折叠时隐藏
          if (sourceIsChild && targetIsChild) {
            return {
              ...edge,
              hidden: newCollapsedState,
            };
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
              };
            } else {
              // 展开：恢复原始 target
              const originalTarget = edge.data?._originalTarget as
                | string
                | undefined;
              const originalTargetHandle = edge.data?._originalTargetHandle as
                | string
                | undefined;
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
                };
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
              };
            } else {
              // 展开：恢复原始 source
              const originalSource = edge.data?._originalSource as
                | string
                | undefined;
              const originalSourceHandle = edge.data?._originalSourceHandle as
                | string
                | undefined;
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
                };
              }
            }
          }

          // 组节点与外部的边（已经是组级别的边）
          if (edge.source === groupId || edge.target === groupId) {
            // 检查是否需要恢复
            if (!newCollapsedState) {
              const originalSource = edge.data?._originalSource as
                | string
                | undefined;
              const originalTarget = edge.data?._originalTarget as
                | string
                | undefined;
              if (originalSource || originalTarget) {
                return {
                  ...edge,
                  source: originalSource || edge.source,
                  target: originalTarget || edge.target,
                  sourceHandle: originalSource
                    ? (edge.data?._originalSourceHandle as string | undefined)
                    : edge.sourceHandle,
                  targetHandle: originalTarget
                    ? (edge.data?._originalTargetHandle as string | undefined)
                    : edge.targetHandle,
                  data: {
                    ...edge.data,
                    _originalSource: undefined,
                    _originalSourceHandle: undefined,
                    _originalTarget: undefined,
                    _originalTargetHandle: undefined,
                  },
                };
              }
            }
          }

          return edge;
        });

        set({
          nodes: updatedNodes,
          edges: updatedEdges,
          isDirty: true,
        });
      },

      openDebugPanel: (nodeId) =>
        set({ debugNodeId: nodeId, isDebugPanelOpen: true }),

      closeDebugPanel: () =>
        set({ debugNodeId: null, isDebugPanelOpen: false }),

      setViewport: (viewport) => set({ viewport }),

      // 执行状态操作
      updateNodeExecutionStatus: (nodeId, status) => {
        set({
          nodeExecutionStatus: {
            ...get().nodeExecutionStatus,
            [nodeId]: status,
          },
        });
      },

      clearNodeExecutionStatus: () => {
        set({ nodeExecutionStatus: {} });
      },

      // 节点执行结果操作
      updateNodeExecutionResult: (nodeId, result) => {
        set({
          nodeExecutionResults: {
            ...get().nodeExecutionResults,
            [nodeId]: result,
          },
        });
      },

      clearNodeExecutionResult: (nodeId) => {
        const newResults = { ...get().nodeExecutionResults };
        delete newResults[nodeId];
        set({ nodeExecutionResults: newResults });
      },

      clearAllNodeExecutionResults: () => {
        set({ nodeExecutionResults: {} });
      },

      // 节点执行详情操作
      updateNodeExecutionDetails: (nodeId, details) => {
        const current = get().nodeExecutionDetails[nodeId] || {
          inputStatus: 'pending',
          outputStatus: 'pending',
          triggered: false,
        };
        set({
          nodeExecutionDetails: {
            ...get().nodeExecutionDetails,
            [nodeId]: { ...current, ...details },
          },
        });
      },

      initNodeExecutionDetails: (nodeIds) => {
        const details: Record<string, NodeExecutionDetails> = {};
        nodeIds.forEach((nodeId) => {
          details[nodeId] = {
            inputStatus: 'pending',
            outputStatus: 'pending',
            triggered: false,
          };
        });
        set({ nodeExecutionDetails: details });
      },

      clearNodeExecutionDetails: () => {
        set({ nodeExecutionDetails: {} });
      },

      // 后台执行操作
      setActiveExecution: (executionId, taskId) => {
        set({
          activeExecutionId: executionId,
          activeTaskId: taskId || null,
        });
      },

      clearActiveExecution: () => {
        set({
          activeExecutionId: null,
          activeTaskId: null,
        });
      },

      setLatestExecutionId: (executionId) => {
        set({ latestExecutionId: executionId });
      },

      // 自动布局 - 使用 dagre 算法，确保节点不重叠
      autoLayout: (direction = "LR") => {
        const { nodes, edges } = get();
        if (nodes.length === 0) return;

        // ==================== 配置参数 ====================
        const NODE_WIDTH = 260;
        const NODE_HEIGHT = 160;
        // 减小间距以更紧凑
        const MIN_GAP_X = 60; // 水平间距
        const MIN_GAP_Y = 40; // 垂直间距

        // ==================== 辅助函数 ====================
        const getNodeSize = (node: Node): { width: number; height: number } => {
          // 如果是组节点，使用其实际尺寸
          if (node.type === "group") {
            const width = Number(node.style?.width) || 300;
            const height = Number(node.style?.height) || 200;
            return { width, height };
          }
          // 普通节点使用固定尺寸
          return { width: NODE_WIDTH, height: NODE_HEIGHT };
        };

        // 检测两个矩形是否重叠
        const isOverlapping = (
          a: { x: number; y: number; width: number; height: number },
          b: { x: number; y: number; width: number; height: number },
          gapX: number,
          gapY: number,
        ): boolean => {
          return !(
            a.x + a.width + gapX <= b.x ||
            b.x + b.width + gapX <= a.x ||
            a.y + a.height + gapY <= b.y ||
            b.y + b.height + gapY <= a.y
          );
        };

        // ==================== 主逻辑 ====================
        const groupNodes = nodes.filter((n) => n.type === "group");
        const regularNodes = nodes.filter(
          (n) => n.type !== "group" && !n.parentId,
        );
        const topLevelNodes = [...regularNodes, ...groupNodes];

        if (topLevelNodes.length === 0) return;

        // 创建 dagre 图
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // 设置布局参数 - 更紧凑的参数
        dagreGraph.setGraph({
          rankdir: direction,
          // dagre 的 nodesep 是同层节点间的间距
          // ranksep 是层与层之间的间距
          nodesep: direction === "LR" ? MIN_GAP_Y : MIN_GAP_X,
          ranksep: direction === "LR" ? MIN_GAP_X : MIN_GAP_Y,
          edgesep: 10, // 减少边的间隔
          marginx: 50,
          marginy: 50,
          align: "UL", // 对齐方式，可能有助于紧凑
        });

        // 存储尺寸
        const nodeSizes = new Map<string, { width: number; height: number }>();

        // 添加节点
        topLevelNodes.forEach((node) => {
          const size = getNodeSize(node);
          nodeSizes.set(node.id, size);
          dagreGraph.setNode(node.id, {
            width: size.width,
            height: size.height,
          });
        });

        // 收集顶层节点ID
        const topLevelNodeIds = new Set(topLevelNodes.map((n) => n.id));

        // 添加边
        edges.forEach((edge) => {
          let sourceId = edge.source;
          let targetId = edge.target;

          const sourceNode = nodes.find((n) => n.id === edge.source);
          const targetNode = nodes.find((n) => n.id === edge.target);

          // 如果连接的是子节点，映射到其父组节点（如果是顶层布局）
          if (
            sourceNode?.parentId &&
            topLevelNodeIds.has(sourceNode.parentId)
          ) {
            sourceId = sourceNode.parentId;
          }
          if (
            targetNode?.parentId &&
            topLevelNodeIds.has(targetNode.parentId)
          ) {
            targetId = targetNode.parentId;
          }

          if (
            topLevelNodeIds.has(sourceId) &&
            topLevelNodeIds.has(targetId) &&
            sourceId !== targetId
          ) {
            dagreGraph.setEdge(sourceId, targetId);
          }
        });

        // 执行 dagre 布局
        dagre.layout(dagreGraph);

        // 收集布局结果
        const positions = new Map<
          string,
          { x: number; y: number; width: number; height: number }
        >();

        topLevelNodes.forEach((node) => {
          const pos = dagreGraph.node(node.id);
          if (pos) {
            const size = nodeSizes.get(node.id) || {
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
            };
            // dagre 返回中心点，转换为左上角
            positions.set(node.id, {
              x: pos.x - size.width / 2,
              y: pos.y - size.height / 2,
              width: size.width,
              height: size.height,
            });
          }
        });

        // ==================== 重叠检测与微调 ====================
        // dagre 通常已经处理得很好，但为了保险起见，进行简单的重叠检测和修复
        const nodeIds = Array.from(positions.keys());

        // 迭代几次以解决微小的重叠
        for (let iter = 0; iter < 5; iter++) {
          let hasOverlap = false;

          // 对节点进行排序，确保按照层级顺序处理，避免打乱整体流向
          // 简单的按照坐标排序
          nodeIds.sort((a, b) => {
            const posA = positions.get(a)!;
            const posB = positions.get(b)!;
            if (Math.abs(posA.x - posB.x) > 10) return posA.x - posB.x;
            return posA.y - posB.y;
          });

          for (let i = 0; i < nodeIds.length; i++) {
            for (let j = i + 1; j < nodeIds.length; j++) {
              const idA = nodeIds[i];
              const idB = nodeIds[j];
              const posA = positions.get(idA)!;
              const posB = positions.get(idB)!;

              // 使用稍微小一点的 gap 进行重叠检查，允许视觉上的紧凑，但防止物理重叠
              if (isOverlapping(posA, posB, 20, 20)) {
                hasOverlap = true;

                // 计算重叠量
                const overlapX = Math.min(
                  posA.x + posA.width + 20 - posB.x,
                  posB.x + posB.width + 20 - posA.x,
                );
                const overlapY = Math.min(
                  posA.y + posA.height + 20 - posB.y,
                  posB.y + posB.height + 20 - posA.y,
                );

                // 简单的排斥逻辑：向较小的重叠方向移动
                if (overlapX < overlapY) {
                  // 水平推开
                  const move = overlapX / 2 + 5;
                  if (posA.x < posB.x) {
                    posA.x -= move;
                    posB.x += move;
                  } else {
                    posA.x += move;
                    posB.x -= move;
                  }
                } else {
                  // 垂直推开
                  const move = overlapY / 2 + 5;
                  if (posA.y < posB.y) {
                    posA.y -= move;
                    posB.y += move;
                  } else {
                    posA.y += move;
                    posB.y -= move;
                  }
                }
              }
            }
          }
          if (!hasOverlap) break;
        }

        // 确保所有节点在正坐标区域
        let minX = Infinity,
          minY = Infinity;
        positions.forEach((pos) => {
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
        });

        const padding = 50;
        const offsetX = -minX + padding;
        const offsetY = -minY + padding;

        positions.forEach((pos) => {
          pos.x += offsetX;
          pos.y += offsetY;
        });

        // ==================== 应用新位置 ====================
        const updatedNodes = nodes.map((node) => {
          if (node.parentId) return node;

          const newPos = positions.get(node.id);
          if (!newPos) return node;

          return {
            ...node,
            position: {
              x: Math.round(newPos.x),
              y: Math.round(newPos.y),
            },
          };
        });

        set({
          nodes: updatedNodes,
          isDirty: true,
        });
      },
      getWorkflowConfig: () => {
        const { nodes, edges, manual } = get();

        // fieldType 映射表：将无效值转换为有效值
        const fieldTypeMapping: Record<string, InputFieldType> = {
          textarea: "text",
          file: "pdf",
          document: "pdf",
        };

        // 有效的 fieldType 值
        const validFieldTypes: InputFieldType[] = [
          "text",
          "image",
          "pdf",
          "word",
          "excel",
          "audio",
          "video",
          "select",
          "multiselect",
        ];

        return {
          version: 1,
          nodes: nodes.map((node) => {
            const nodeData = node.data as NodeConfig;

            // 如果是 INPUT 节点，清洗 fieldType
            if (nodeData.type === "INPUT" && nodeData.config?.fields) {
              const cleanedFields = nodeData.config.fields.map((field) => {
                let fieldType: InputFieldType = field.fieldType || "text";

                // 如果是无效值，进行映射
                if (!validFieldTypes.includes(fieldType)) {
                  const fieldTypeStr = fieldType as string;
                  fieldType = fieldTypeMapping[fieldTypeStr] || "text";
                }

                return {
                  ...field,
                  fieldType,
                };
              });

              return {
                ...nodeData,
                config: {
                  ...nodeData.config,
                  fields: cleanedFields,
                },
                position: node.position,
              };
            }

            return {
              ...nodeData,
              position: node.position, // 确保使用最新的位置
            };
          }),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          })),
          manual,
        };
      },

      markSaved: () => set({ isDirty: false, lastSavedAt: Date.now() }),

      reset: () => set(initialState),
    }),
    {
      name: "workflow-draft",
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
    },
  ),
);
