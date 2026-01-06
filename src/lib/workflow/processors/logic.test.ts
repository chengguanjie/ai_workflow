/**
 * 微信公众号文章智能二创助手工作流功能测试
 *
 * 测试内容：
 * 1. 条件判断功能
 * 2. HTTP工具功能
 * 3. 图片生成功能
 * 4. Word文档输出功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LogicNodeProcessor } from './logic'
import type { ExecutionContext, NodeOutput } from '../types'
import type { LogicNodeConfig } from '@/types/workflow'

describe('LogicNodeProcessor - 条件判断功能', () => {
  let processor: LogicNodeProcessor
  let mockContext: ExecutionContext

  beforeEach(() => {
    processor = new LogicNodeProcessor()
    mockContext = {
      executionId: 'test-exec-1',
      workflowId: 'test-workflow-1',
      organizationId: 'test-org-1',
      userId: 'test-user-1',
      nodeOutputs: new Map(),
      globalVariables: {},
      aiConfigs: new Map(),
    }
  })

  it('应该正确评估简单相等条件', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '输入节点',
      nodeType: 'INPUT',
      status: 'success',
      data: { platform: 'wechat' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '条件判断',
      position: { x: 0, y: 0 },
      config: {
        mode: 'condition',
        conditions: [
          {
            id: 'cond1',
            label: '微信平台',
            expression: '{{输入节点.platform}} === "wechat"',
            targetNodeId: 'target1',
          },
          {
            id: 'cond2',
            label: '其他平台',
            expression: '{{输入节点.platform}} === "other"',
            targetNodeId: 'target2',
          },
        ],
        fallbackTargetNodeId: 'fallback',
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.matched).toBe(true)
    expect(result.data.matchedConditionId).toBe('cond1')
    expect(result.data.matchedTargetNodeId).toBe('target1')
  })

  it('应该正确评估数值比较条件', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '分析节点',
      nodeType: 'PROCESS',
      status: 'success',
      data: { score: 85 },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '分数判断',
      position: { x: 0, y: 0 },
      config: {
        mode: 'condition',
        conditions: [
          {
            id: 'cond1',
            label: '高分',
            expression: '{{分析节点.score}} >= 80',
            targetNodeId: 'high',
          },
          {
            id: 'cond2',
            label: '中等',
            expression: '{{分析节点.score}} >= 60',
            targetNodeId: 'medium',
          },
        ],
        fallbackTargetNodeId: 'low',
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.matched).toBe(true)
    expect(result.data.matchedConditionId).toBe('cond1')
    expect(result.data.matchedTargetNodeId).toBe('high')
  })

  it('应该正确处理逻辑与运算', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '输入',
      nodeType: 'INPUT',
      status: 'success',
      data: { platform: 'wechat', needImage: true },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '复合判断',
      position: { x: 0, y: 0 },
      config: {
        mode: 'condition',
        conditions: [
          {
            id: 'cond1',
            label: '需要配图',
            expression: '{{输入.platform}} === "wechat" && {{输入.needImage}} === true',
            targetNodeId: 'withImage',
          },
        ],
        fallbackTargetNodeId: 'noImage',
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.matched).toBe(true)
    expect(result.data.matchedConditionId).toBe('cond1')
  })

  it('应该正确处理未匹配情况', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '输入',
      nodeType: 'INPUT',
      status: 'success',
      data: { platform: 'unknown' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '条件判断',
      position: { x: 0, y: 0 },
      config: {
        mode: 'condition',
        conditions: [
          {
            id: 'cond1',
            expression: '{{输入.platform}} === "wechat"',
            targetNodeId: 'wechat',
          },
        ],
        fallbackTargetNodeId: 'fallback',
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.matched).toBe(false)
    expect(result.data.matchedConditionId).toBe(null)
    expect(result.data.matchedTargetNodeId).toBe('fallback')
  })

  it('应该正确处理 includes 方法', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '内容',
      nodeType: 'PROCESS',
      status: 'success',
      data: { text: '这是一篇关于人工智能的文章' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '内容检测',
      position: { x: 0, y: 0 },
      config: {
        mode: 'condition',
        conditions: [
          {
            id: 'cond1',
            expression: '"这是一篇关于人工智能的文章".includes("人工智能")',
            targetNodeId: 'aiContent',
          },
        ],
        fallbackTargetNodeId: 'other',
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.matched).toBe(true)
    expect(result.data.matchedConditionId).toBe('cond1')
  })

  it('应该正确处理 merge 模式', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '分支1结果',
      nodeType: 'PROCESS',
      status: 'success',
      data: { result: 'data1' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    mockContext.nodeOutputs.set('node2', {
      nodeId: 'node2',
      nodeName: '分支2结果',
      nodeType: 'PROCESS',
      status: 'success',
      data: { result: 'data2' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '结果合并',
      position: { x: 0, y: 0 },
      config: {
        mode: 'merge',
        mergeFromNodeIds: ['node1', 'node2'],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.mode).toBe('merge')
    expect(result.data.merged).toEqual({
      node1: { result: 'data1' },
      node2: { result: 'data2' },
    })
    // 校验新增的验证字段
    expect(result.data.isComplete).toBe(true)
    expect(result.data.validation).toEqual({
      isComplete: true,
      totalExpected: 2,
      completedCount: 2,
      missingCount: 0,
      failedCount: 0,
      completedNodeIds: ['node1', 'node2'],
      missingNodeIds: [],
      failedNodeIds: [],
    })
    expect(result.data.warnings).toBeUndefined()
  })
})

describe('LogicNodeProcessor - Merge 校验机制', () => {
  let processor: LogicNodeProcessor
  let mockContext: ExecutionContext

  beforeEach(() => {
    processor = new LogicNodeProcessor()
    mockContext = {
      executionId: 'test-exec-1',
      workflowId: 'test-workflow-1',
      organizationId: 'test-org-1',
      userId: 'test-user-1',
      nodeOutputs: new Map(),
      globalVariables: {},
      aiConfigs: new Map(),
    }
  })

  it('应该检测到缺失的节点并返回警告', async () => {
    // 只设置 node1，不设置 node2 和 node3
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '分支1',
      nodeType: 'PROCESS',
      status: 'success',
      data: { result: 'data1' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'merge1',
      type: 'LOGIC',
      name: '合并节点',
      position: { x: 0, y: 0 },
      config: {
        mode: 'merge',
        mergeFromNodeIds: ['node1', 'node2', 'node3'],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.isComplete).toBe(false)
    expect(result.data.validation).toEqual({
      isComplete: false,
      totalExpected: 3,
      completedCount: 1,
      missingCount: 2,
      failedCount: 0,
      completedNodeIds: ['node1'],
      missingNodeIds: ['node2', 'node3'],
      failedNodeIds: [],
    })
    expect(result.data.warnings).toContain('以下节点尚未完成执行: node2, node3')
  })

  it('应该检测到失败的节点并返回警告', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '成功节点',
      nodeType: 'PROCESS',
      status: 'success',
      data: { result: 'success data' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    mockContext.nodeOutputs.set('node2', {
      nodeId: 'node2',
      nodeName: '失败节点',
      nodeType: 'PROCESS',
      status: 'error',
      data: { error: '执行出错' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'merge1',
      type: 'LOGIC',
      name: '合并节点',
      position: { x: 0, y: 0 },
      config: {
        mode: 'merge',
        mergeFromNodeIds: ['node1', 'node2'],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.isComplete).toBe(false)
    expect(result.data.validation).toMatchObject({
      isComplete: true, // 节点都有输出，但有失败的
      completedCount: 1,
      failedCount: 1,
      failedNodeIds: ['node2'],
    })
    expect(result.data.warnings).toContain('以下节点执行失败: node2')
    // 失败节点的数据仍然被收集
    expect(result.data.merged).toEqual({
      node1: { result: 'success data' },
      node2: { error: '执行出错' },
    })
  })

  it('应该同时检测缺失和失败的节点', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '成功节点',
      nodeType: 'PROCESS',
      status: 'success',
      data: { result: 'ok' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    mockContext.nodeOutputs.set('node2', {
      nodeId: 'node2',
      nodeName: '失败节点',
      nodeType: 'PROCESS',
      status: 'error',
      data: { error: '出错了' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    // node3 未设置（缺失）

    const node: LogicNodeConfig = {
      id: 'merge1',
      type: 'LOGIC',
      name: '合并节点',
      position: { x: 0, y: 0 },
      config: {
        mode: 'merge',
        mergeFromNodeIds: ['node1', 'node2', 'node3'],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.data.isComplete).toBe(false)
    expect(result.data.validation).toMatchObject({
      isComplete: false,
      totalExpected: 3,
      completedCount: 1,
      missingCount: 1,
      failedCount: 1,
      completedNodeIds: ['node1'],
      missingNodeIds: ['node3'],
      failedNodeIds: ['node2'],
    })
    expect(result.data.warnings).toHaveLength(2)
  })

  it('未指定 mergeFromNodeIds 时应收集所有已执行节点', async () => {
    mockContext.nodeOutputs.set('nodeA', {
      nodeId: 'nodeA',
      nodeName: '节点A',
      nodeType: 'INPUT',
      status: 'success',
      data: { value: 'A' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    mockContext.nodeOutputs.set('nodeB', {
      nodeId: 'nodeB',
      nodeName: '节点B',
      nodeType: 'PROCESS',
      status: 'success',
      data: { value: 'B' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'merge1',
      type: 'LOGIC',
      name: '全量合并',
      position: { x: 0, y: 0 },
      config: {
        mode: 'merge',
        // 不指定 mergeFromNodeIds
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.data.isComplete).toBe(true)
    expect(result.data.merged).toEqual({
      nodeA: { value: 'A' },
      nodeB: { value: 'B' },
    })
    expect(result.data.validation).toMatchObject({
      isComplete: true,
      totalExpected: 2,
      completedCount: 2,
      missingCount: 0,
      failedCount: 0,
    })
  })

  it('所有节点都完成时 isComplete 应为 true', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '节点1',
      nodeType: 'PROCESS',
      status: 'success',
      data: { x: 1 },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    mockContext.nodeOutputs.set('node2', {
      nodeId: 'node2',
      nodeName: '节点2',
      nodeType: 'PROCESS',
      status: 'success',
      data: { x: 2 },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })
    mockContext.nodeOutputs.set('node3', {
      nodeId: 'node3',
      nodeName: '节点3',
      nodeType: 'PROCESS',
      status: 'success',
      data: { x: 3 },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'merge1',
      type: 'LOGIC',
      name: '完整合并',
      position: { x: 0, y: 0 },
      config: {
        mode: 'merge',
        mergeFromNodeIds: ['node1', 'node2', 'node3'],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.data.isComplete).toBe(true)
    expect(result.data.warnings).toBeUndefined()
    expect(result.data.validation).toEqual({
      isComplete: true,
      totalExpected: 3,
      completedCount: 3,
      missingCount: 0,
      failedCount: 0,
      completedNodeIds: ['node1', 'node2', 'node3'],
      missingNodeIds: [],
      failedNodeIds: [],
    })
  })
})

describe('LogicNodeProcessor - 循环模式 (loop)', () => {
  let processor: LogicNodeProcessor
  let mockContext: ExecutionContext

  beforeEach(() => {
    processor = new LogicNodeProcessor()
    mockContext = {
      executionId: 'test-exec-1',
      workflowId: 'test-workflow-1',
      organizationId: 'test-org-1',
      userId: 'test-user-1',
      nodeOutputs: new Map(),
      globalVariables: {},
      aiConfigs: new Map(),
    }
  })

  describe('forEach 循环', () => {
    it('应该正确初始化 forEach 循环', async () => {
      mockContext.nodeOutputs.set('dataNode', {
        nodeId: 'dataNode',
        nodeName: '数据源',
        nodeType: 'INPUT',
        status: 'success',
        data: { items: ['apple', 'banana', 'cherry'] },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '遍历水果',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'forEach',
            iterableSource: '数据源.items',
            itemVariableName: 'fruit',
            loopBodyNodeIds: ['processNode'],
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.status).toBe('continue')
      expect(result.data.loopType).toBe('forEach')
      expect(result.data.currentIndex).toBe(0)
      expect(result.data.currentItem).toBe('apple')
      expect(result.data.totalIterations).toBe(3)
      expect(result.data.isFirst).toBe(true)
      expect(result.data.isLast).toBe(false)
      expect(result.data.shouldExecuteBody).toBe(true)
    })

    it('应该在空数组时正确完成循环', async () => {
      mockContext.nodeOutputs.set('dataNode', {
        nodeId: 'dataNode',
        nodeName: '数据源',
        nodeType: 'INPUT',
        status: 'success',
        data: { items: [] },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '遍历空数组',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'forEach',
            iterableSource: '数据源.items',
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.status).toBe('complete')
      expect(result.data.shouldExecuteBody).toBe(false)
    })

    it('应该正确处理对象数组', async () => {
      mockContext.nodeOutputs.set('dataNode', {
        nodeId: 'dataNode',
        nodeName: '用户列表',
        nodeType: 'INPUT',
        status: 'success',
        data: {
          users: [
            { name: '张三', age: 25 },
            { name: '李四', age: 30 },
          ],
        },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '遍历用户',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'forEach',
            iterableSource: '用户列表.users',
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.currentItem).toEqual({ name: '张三', age: 25 })
      expect(result.data.totalIterations).toBe(2)
    })
  })

  describe('times 循环', () => {
    it('应该正确初始化固定次数循环', async () => {
      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '固定循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'times',
            loopCount: 5,
            loopBodyNodeIds: ['processNode'],
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.status).toBe('continue')
      expect(result.data.loopType).toBe('times')
      expect(result.data.currentIndex).toBe(0)
      expect(result.data.totalIterations).toBe(5)
      expect(result.data.isFirst).toBe(true)
      expect(result.data.shouldExecuteBody).toBe(true)
    })

    it('应该从变量获取循环次数', async () => {
      mockContext.nodeOutputs.set('configNode', {
        nodeId: 'configNode',
        nodeName: '配置',
        nodeType: 'INPUT',
        status: 'success',
        data: { repeatCount: 3 },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '动态次数循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'times',
            loopCountSource: '配置.repeatCount',
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.totalIterations).toBe(3)
    })

    it('应该在循环次数为0时立即完成', async () => {
      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '零次循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'times',
            loopCount: 0,
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.status).toBe('complete')
      expect(result.data.shouldExecuteBody).toBe(false)
    })
  })

  describe('while 循环', () => {
    it('应该正确评估 while 条件', async () => {
      mockContext.nodeOutputs.set('counterNode', {
        nodeId: 'counterNode',
        nodeName: '计数器',
        nodeType: 'PROCESS',
        status: 'success',
        data: { count: 0 },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '条件循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'while',
            whileCondition: '{{计数器.count}} < 5',
            maxIterations: 10,
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.status).toBe('continue')
      expect(result.data.loopType).toBe('while')
      expect(result.data.shouldExecuteBody).toBe(true)
    })

    it('应该在条件为 false 时完成循环', async () => {
      mockContext.nodeOutputs.set('counterNode', {
        nodeId: 'counterNode',
        nodeName: '计数器',
        nodeType: 'PROCESS',
        status: 'success',
        data: { count: 10 },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '条件循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'while',
            whileCondition: '{{计数器.count}} < 5',
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.status).toBe('complete')
      expect(result.data.shouldExecuteBody).toBe(false)
    })
  })

  describe('循环配置错误处理', () => {
    it('应该在缺少循环配置时返回错误', async () => {
      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '无配置循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          // 没有 loopConfig
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.error).toBe('循环配置缺失')
      expect(result.data.shouldExecuteBody).toBe(false)
    })

    it('应该在 forEach 缺少数据源时返回错误', async () => {
      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '无数据源循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'forEach',
            // 没有 iterableSource
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.error).toContain('forEach 循环必须指定数据源')
      expect(result.data.shouldExecuteBody).toBe(false)
    })

    it('应该在数据源不是数组时返回错误', async () => {
      mockContext.nodeOutputs.set('dataNode', {
        nodeId: 'dataNode',
        nodeName: '数据源',
        nodeType: 'INPUT',
        status: 'success',
        data: { notArray: 'string value' },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '非数组循环',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'forEach',
            iterableSource: '数据源.notArray',
          },
        },
      }

      const result = await processor.process(node, mockContext)

      expect(result.status).toBe('success')
      expect(result.data.error).toContain('forEach 循环源必须是数组')
      expect(result.data.shouldExecuteBody).toBe(false)
    })
  })

  describe('循环变量暴露', () => {
    it('应该正确暴露循环变量到上下文', async () => {
      mockContext.nodeOutputs.set('dataNode', {
        nodeId: 'dataNode',
        nodeName: '数据源',
        nodeType: 'INPUT',
        status: 'success',
        data: { items: ['a', 'b', 'c'] },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      })

      const node: LogicNodeConfig = {
        id: 'loopNode',
        type: 'LOGIC',
        name: '变量暴露测试',
        position: { x: 0, y: 0 },
        config: {
          mode: 'loop',
          loopConfig: {
            loopType: 'forEach',
            iterableSource: '数据源.items',
            loopNamespace: 'myLoop',
          },
        },
      }

      await processor.process(node, mockContext)

      // 检查循环变量是否正确暴露
      expect(mockContext.loopVariables).toBeDefined()
      expect(mockContext.loopVariables!['myLoop']).toEqual({
        item: 'a',
        index: 0,
        isFirst: true,
        isLast: false,
        total: 3,
      })

      // 检查全局变量
      expect(mockContext.globalVariables['myLoop']).toBeDefined()
      expect((mockContext.globalVariables['myLoop'] as Record<string, unknown>).item).toBe('a')
    })
  })
})
