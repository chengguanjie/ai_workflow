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

  it('应该正确处理 split 模式', async () => {
    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '并行拆分',
      position: { x: 0, y: 0 },
      config: {
        mode: 'split',
        branches: [
          { id: 'branch1', label: '分支1', targetNodeId: 'target1' },
          { id: 'branch2', label: '分支2', targetNodeId: 'target2' },
        ],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.mode).toBe('split')
    expect(result.data.activeBranchIds).toEqual(['branch1', 'branch2'])
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
  })

  it('应该正确处理 switch 模式', async () => {
    mockContext.nodeOutputs.set('node1', {
      nodeId: 'node1',
      nodeName: '输入',
      nodeType: 'INPUT',
      status: 'success',
      data: { type: '科技' },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    })

    const node: LogicNodeConfig = {
      id: 'logic1',
      type: 'LOGIC',
      name: '类型选择',
      position: { x: 0, y: 0 },
      config: {
        mode: 'switch',
        switchInput: '输入.type',
        branches: [
          { id: 'branch1', label: '科技', targetNodeId: 'tech' },
          { id: 'branch2', label: '生活', targetNodeId: 'life' },
          { id: 'branch3', label: '娱乐', targetNodeId: 'entertainment' },
        ],
      },
    }

    const result = await processor.process(node, mockContext)

    expect(result.status).toBe('success')
    expect(result.data.mode).toBe('switch')
    expect(result.data.inputValue).toBe('科技')
    expect(result.data.matchedBranchId).toBe('branch1')
    expect(result.data.matchedTargetNodeId).toBe('tech')
  })
})
