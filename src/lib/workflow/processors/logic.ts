/**
 * 逻辑判断节点处理器
 *
 * 支持三种模式：
 * - condition: 条件判断（选择性激活后续分支）
 * - merge: 结果合并（聚合多个上游节点数据）
 * - loop: 循环处理（重复执行下游节点）
 *
 * 注意：本处理器本身不直接"跳转"到后续节点，真正的控制流仍由引擎调度层
 * 依据节点输出中的元数据（如 matchedConditionId / activeBranchIds / loopStatus 等）和边结构来实现。
 */

import type { NodeConfig, LogicNodeConfig, LogicNodeConfigData, LogicCondition, LoopConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, LoopIterationContext } from '../types'

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g

export class LogicNodeProcessor implements NodeProcessor {
  nodeType = 'LOGIC'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const logicNode = node as LogicNodeConfig
    const config: LogicNodeConfigData = logicNode.config || { mode: 'condition' }

    const mode = config.mode || 'condition'

    let data: Record<string, unknown> = { mode }

    switch (mode) {
      case 'condition':
        data = {
          ...data,
          ...this.executeCondition(config, context),
        }
        break

      case 'merge':
        data = {
          ...data,
          ...this.executeMerge(config, context),
        }
        break

      case 'loop':
        data = {
          ...data,
          ...this.executeLoop(node.id, config, context),
        }
        break

      default:
        data = {
          ...data,
          warning: `未知的逻辑模式: ${mode}`,
        }
        break
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'success',
      data,
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startedAt.getTime(),
    }
  }

  /**
   * 条件判断模式
   * 遍历条件列表，找到第一个匹配的条件返回其 ID
   */
  private executeCondition(
    config: LogicNodeConfigData,
    context: ExecutionContext
  ): Record<string, unknown> {
    const conditions = config.conditions || []

    for (const condition of conditions) {
      const result = this.evaluateCondition(condition, context)
      if (result) {
        return {
          conditions,
          fallbackTargetNodeId: config.fallbackTargetNodeId,
          matched: true,
          matchedConditionId: condition.id,
          matchedTargetNodeId: condition.targetNodeId,
          evaluatedExpression: condition.expression,
        }
      }
    }

    return {
      conditions,
      fallbackTargetNodeId: config.fallbackTargetNodeId,
      matched: false,
      matchedConditionId: null,
      matchedTargetNodeId: config.fallbackTargetNodeId || null,
    }
  }

  /**
   * 安全地评估条件表达式
   */
  private evaluateCondition(
    condition: LogicCondition,
    context: ExecutionContext
  ): boolean {
    const expression = condition.expression?.trim()
    if (!expression) return false

    try {
      const resolvedExpr = this.resolveExpressionVariables(expression, context)
      return this.safeEvaluate(resolvedExpr)
    } catch (error) {
      console.warn(`[LogicNode] 条件表达式求值失败: ${expression}`, error)
      return false
    }
  }

  /**
   * 替换表达式中的变量引用 {{节点名.字段名}}
   */
  private resolveExpressionVariables(
    expression: string,
    context: ExecutionContext
  ): string {
    VARIABLE_PATTERN.lastIndex = 0
    return expression.replace(VARIABLE_PATTERN, (match, varPath) => {
      const value = this.resolveVariablePath(varPath.trim(), context)
      if (value === undefined || value === null) {
        return 'null'
      }
      if (typeof value === 'string') {
        return JSON.stringify(value)
      }
      if (typeof value === 'object') {
        return JSON.stringify(value)
      }
      return String(value)
    })
  }

  /**
   * 安全的表达式求值（支持简单的比较和逻辑运算）
   */
  private safeEvaluate(expr: string): boolean {
    const trimmed = expr.trim()
    
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    
    if (trimmed.includes('&&')) {
      const parts = trimmed.split('&&')
      return parts.every(part => this.safeEvaluate(part.trim()))
    }
    
    if (trimmed.includes('||')) {
      const parts = trimmed.split('||')
      return parts.some(part => this.safeEvaluate(part.trim()))
    }

    const comparisonMatch = trimmed.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/)
    if (comparisonMatch) {
      const [, leftStr, op, rightStr] = comparisonMatch
      const left = this.parseValue(leftStr.trim())
      const right = this.parseValue(rightStr.trim())
      
      switch (op) {
        case '===': return left === right
        case '!==': return left !== right
        case '==': return left == right
        case '!=': return left != right
        case '>': return Number(left) > Number(right)
        case '<': return Number(left) < Number(right)
        case '>=': return Number(left) >= Number(right)
        case '<=': return Number(left) <= Number(right)
        default: return false
      }
    }

    if (trimmed.includes('includes(')) {
      const includesMatch = trimmed.match(/(.+?)\.includes\((.+)\)/)
      if (includesMatch) {
        const [, strPart, searchPart] = includesMatch
        const str = this.parseValue(strPart.trim())
        const search = this.parseValue(searchPart.trim())
        if (typeof str === 'string' && typeof search === 'string') {
          return str.includes(search)
        }
        if (Array.isArray(str)) {
          return str.includes(search)
        }
      }
    }

    const boolVal = this.parseValue(trimmed)
    return Boolean(boolVal)
  }

  /**
   * 解析字符串值
   */
  private parseValue(str: string): unknown {
    const trimmed = str.trim()
    
    if (trimmed === 'null') return null
    if (trimmed === 'undefined') return undefined
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1)
    }
    
    const num = Number(trimmed)
    if (!isNaN(num)) return num
    
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  /**
   * 结果合并模式
   *
   * 语义：聚合多个上游节点的输出数据。
   * 实现：基于 mergeFromNodeIds 或所有已存在的上游输出，简单聚合为一个对象。
   *
   * 校验机制：
   * - 检查 mergeFromNodeIds 中指定的所有节点是否都已完成
   * - 如果有节点未完成，返回警告信息和缺失节点列表
   * - 区分已完成、未完成和执行失败的节点
   */
  private executeMerge(
    config: LogicNodeConfigData,
    context: ExecutionContext
  ): Record<string, unknown> {
    const mergeFromNodeIds = config.mergeFromNodeIds || []

    const merged: Record<string, unknown> = {}
    const completedNodeIds: string[] = []
    const missingNodeIds: string[] = []
    const failedNodeIds: string[] = []

    if (mergeFromNodeIds.length > 0) {
      // 校验并收集指定节点的输出
      for (const nodeId of mergeFromNodeIds) {
        const output = context.nodeOutputs.get(nodeId)
        if (output) {
          if (output.status === 'error') {
            failedNodeIds.push(nodeId)
            // 仍然收集失败节点的数据（可能包含错误信息）
            merged[nodeId] = output.data
          } else {
            completedNodeIds.push(nodeId)
            merged[nodeId] = output.data
          }
        } else {
          missingNodeIds.push(nodeId)
        }
      }
    } else {
      // 如果没有指定节点，收集所有已执行节点的输出
      for (const [nodeId, output] of context.nodeOutputs.entries()) {
        if (output.status === 'error') {
          failedNodeIds.push(nodeId)
        } else {
          completedNodeIds.push(nodeId)
        }
        merged[nodeId] = output.data
      }
    }

    // 构建校验结果
    const validation = {
      isComplete: missingNodeIds.length === 0,
      totalExpected: mergeFromNodeIds.length || context.nodeOutputs.size,
      completedCount: completedNodeIds.length,
      missingCount: missingNodeIds.length,
      failedCount: failedNodeIds.length,
      completedNodeIds,
      missingNodeIds,
      failedNodeIds,
    }

    // 构建警告信息
    const warnings: string[] = []
    if (missingNodeIds.length > 0) {
      warnings.push(`以下节点尚未完成执行: ${missingNodeIds.join(', ')}`)
    }
    if (failedNodeIds.length > 0) {
      warnings.push(`以下节点执行失败: ${failedNodeIds.join(', ')}`)
    }

    return {
      mergeFromNodeIds: mergeFromNodeIds.length > 0 ? mergeFromNodeIds : undefined,
      merged,
      mergeStrategy: config.mergeStrategy || 'all',
      validation,
      warnings: warnings.length > 0 ? warnings : undefined,
      // 便于下游判断合并是否完整
      isComplete: validation.isComplete && failedNodeIds.length === 0,
    }
  }

  /**
   * 解析类似「节点名.字段」的变量路径
   */
  private resolveVariablePath(
    path: string,
    context: ExecutionContext
  ): unknown {
    const trimmed = path.trim()
    if (!trimmed) return undefined

    const dotIndex = trimmed.indexOf('.')
    let nodeNameOrVar: string
    let fieldPath: string | undefined

    if (dotIndex > 0) {
      nodeNameOrVar = trimmed.substring(0, dotIndex)
      fieldPath = trimmed.substring(dotIndex + 1)
    } else {
      nodeNameOrVar = trimmed
      fieldPath = undefined
    }

    for (const [, output] of context.nodeOutputs) {
      if (output.nodeName === nodeNameOrVar || output.nodeId === nodeNameOrVar) {
        if (!fieldPath) return output.data
        return this.getNestedValue(output.data || {}, fieldPath)
      }
    }

    const gv = context.globalVariables || {}
    if (fieldPath) {
      const base = (gv as Record<string, unknown>)[nodeNameOrVar]
      if (base && typeof base === 'object') {
        return this.getNestedValue(base as Record<string, unknown>, fieldPath)
      }
      return undefined
    }

    return (gv as Record<string, unknown>)[nodeNameOrVar]
  }

  /**
   * 获取嵌套属性值
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return current
  }

  // ============================================
  // 循环模式实现
  // ============================================

  /**
   * 循环模式执行
   *
   * 返回值包含控制元数据，引擎根据这些元数据决定后续行为：
   * - status: 'continue' | 'complete' - 是否继续循环
   * - shouldExecuteBody: boolean - 是否需要执行循环体
   * - loopBodyNodeIds: string[] - 循环体节点 ID 列表
   */
  private executeLoop(
    nodeId: string,
    config: LogicNodeConfigData,
    context: ExecutionContext
  ): Record<string, unknown> {
    const loopConfig = config.loopConfig
    if (!loopConfig) {
      return {
        status: 'complete',
        error: '循环配置缺失',
        shouldExecuteBody: false,
      }
    }

    // 初始化 activeLoops Map（如果不存在）
    if (!context.activeLoops) {
      context.activeLoops = new Map()
    }

    // 获取或初始化循环上下文
    let loopCtx = context.activeLoops.get(nodeId)

    if (!loopCtx) {
      // 首次进入循环，初始化上下文
      try {
        loopCtx = this.initializeLoopContext(nodeId, loopConfig, context)
        context.activeLoops.set(nodeId, loopCtx)
      } catch (error) {
        return {
          status: 'complete',
          error: error instanceof Error ? error.message : '循环初始化失败',
          shouldExecuteBody: false,
        }
      }
    } else {
      // 循环体执行完毕后再次进入，收集上次结果并准备下一次迭代
      this.collectLastIterationResult(loopCtx, loopConfig, context)
      loopCtx.currentIndex++
      this.updateLoopContextForNextIteration(loopCtx, loopConfig, context)
    }

    // 检查是否达到最大迭代限制
    const maxIterations = loopConfig.maxIterations ?? 100
    if (loopCtx.currentIndex >= maxIterations) {
      return this.completeLoop(nodeId, loopCtx, context, 'max_iterations_reached')
    }

    // 根据循环类型判断是否继续
    const shouldContinue = this.evaluateLoopCondition(loopCtx, loopConfig, context)

    if (!shouldContinue) {
      return this.completeLoop(nodeId, loopCtx, context, 'condition_false')
    }

    // 更新循环变量到上下文
    this.exposeLoopVariables(loopCtx, loopConfig, context)

    return {
      status: 'continue',
      loopType: loopConfig.loopType,
      currentIndex: loopCtx.currentIndex,
      currentItem: loopCtx.currentItem,
      totalIterations: loopCtx.totalIterations,
      isFirst: loopCtx.isFirst,
      isLast: loopCtx.isLast,
      loopBodyNodeIds: loopConfig.loopBodyNodeIds || [],
      shouldExecuteBody: true,
      iterationCount: loopCtx.currentIndex + 1,
      loopNamespace: loopCtx.loopNamespace,
    }
  }

  /**
   * 初始化循环上下文
   */
  private initializeLoopContext(
    loopNodeId: string,
    loopConfig: LoopConfig,
    context: ExecutionContext
  ): LoopIterationContext {
    const namespace = loopConfig.loopNamespace ?? 'loop'
    const nestingLevel = context.activeLoops?.size ?? 0

    const baseCtx: LoopIterationContext = {
      loopNodeId,
      currentIndex: 0,
      accumulatedResults: [],
      loopStartTime: new Date(),
      nestingLevel,
      loopNamespace: namespace,
      isFirst: true,
      isLast: false,
    }

    switch (loopConfig.loopType) {
      case 'forEach': {
        if (!loopConfig.iterableSource) {
          throw new Error('forEach 循环必须指定数据源 (iterableSource)')
        }
        const array = this.resolveVariablePath(loopConfig.iterableSource, context)
        if (!Array.isArray(array)) {
          throw new Error(`forEach 循环源必须是数组，得到: ${typeof array}`)
        }
        baseCtx.iterableArray = array
        baseCtx.totalIterations = array.length
        baseCtx.currentItem = array.length > 0 ? array[0] : undefined
        baseCtx.isLast = array.length <= 1
        break
      }

      case 'times': {
        let count: number
        if (loopConfig.loopCountSource) {
          const resolved = this.resolveVariablePath(loopConfig.loopCountSource, context)
          count = Number(resolved)
          if (isNaN(count)) {
            throw new Error(`times 循环次数无效: ${resolved}`)
          }
        } else {
          count = loopConfig.loopCount ?? 1
        }
        baseCtx.totalIterations = count
        baseCtx.isLast = count <= 1
        break
      }

      case 'while': {
        // while 循环不预知总次数
        baseCtx.totalIterations = undefined
        break
      }

      default:
        throw new Error(`未知的循环类型: ${loopConfig.loopType}`)
    }

    return baseCtx
  }

  /**
   * 评估循环条件
   */
  private evaluateLoopCondition(
    loopCtx: LoopIterationContext,
    loopConfig: LoopConfig,
    context: ExecutionContext
  ): boolean {
    switch (loopConfig.loopType) {
      case 'forEach':
        return loopCtx.currentIndex < (loopCtx.iterableArray?.length ?? 0)

      case 'times':
        return loopCtx.currentIndex < (loopCtx.totalIterations ?? 0)

      case 'while': {
        if (!loopConfig.whileCondition) return false
        try {
          const resolved = this.resolveExpressionVariables(loopConfig.whileCondition, context)
          return this.safeEvaluate(resolved)
        } catch (error) {
          console.warn(`[LogicNode] while 条件求值失败:`, error)
          return false
        }
      }

      default:
        return false
    }
  }

  /**
   * 更新下一次迭代的上下文
   */
  private updateLoopContextForNextIteration(
    loopCtx: LoopIterationContext,
    loopConfig: LoopConfig,
    _context: ExecutionContext
  ): void {
    loopCtx.isFirst = false

    if (loopConfig.loopType === 'forEach' && loopCtx.iterableArray) {
      loopCtx.currentItem = loopCtx.iterableArray[loopCtx.currentIndex]
      loopCtx.isLast = loopCtx.currentIndex === loopCtx.iterableArray.length - 1
    } else if (loopConfig.loopType === 'times' && loopCtx.totalIterations) {
      loopCtx.isLast = loopCtx.currentIndex === loopCtx.totalIterations - 1
    }
  }

  /**
   * 收集上一次迭代的结果
   */
  private collectLastIterationResult(
    loopCtx: LoopIterationContext,
    loopConfig: LoopConfig,
    context: ExecutionContext
  ): void {
    if (loopConfig.collectResults === false) return

    // 收集循环体节点的输出作为本次迭代结果
    const bodyNodeIds = loopConfig.loopBodyNodeIds || []
    const iterationResult: Record<string, unknown> = {}

    for (const nodeId of bodyNodeIds) {
      const output = context.nodeOutputs.get(nodeId)
      if (output) {
        iterationResult[nodeId] = output.data
      }
    }

    // 如果有循环体节点输出，则收集；否则收集最后一个节点的输出
    if (Object.keys(iterationResult).length > 0) {
      loopCtx.accumulatedResults.push(iterationResult)
    }
  }

  /**
   * 暴露循环变量到上下文
   */
  private exposeLoopVariables(
    loopCtx: LoopIterationContext,
    _loopConfig: LoopConfig,
    context: ExecutionContext
  ): void {
    const namespace = loopCtx.loopNamespace

    if (!context.loopVariables) {
      context.loopVariables = {}
    }

    context.loopVariables[namespace] = {
      item: loopCtx.currentItem,
      index: loopCtx.currentIndex,
      isFirst: loopCtx.isFirst ?? false,
      isLast: loopCtx.isLast ?? false,
      total: loopCtx.totalIterations ?? -1,
    }

    // 同时写入 globalVariables 以支持 {{loop.item}} 语法
    context.globalVariables[`${namespace}`] = {
      item: loopCtx.currentItem,
      index: loopCtx.currentIndex,
      isFirst: loopCtx.isFirst,
      isLast: loopCtx.isLast,
      total: loopCtx.totalIterations,
      results: loopCtx.accumulatedResults,
    }
  }

  /**
   * 完成循环
   */
  private completeLoop(
    nodeId: string,
    loopCtx: LoopIterationContext,
    context: ExecutionContext,
    reason: 'condition_false' | 'max_iterations_reached'
  ): Record<string, unknown> {
    // 清理循环上下文
    context.activeLoops?.delete(nodeId)

    // 清理循环变量
    if (context.loopVariables) {
      delete context.loopVariables[loopCtx.loopNamespace]
    }

    return {
      status: 'complete',
      reason,
      completedIterations: loopCtx.currentIndex,
      results: loopCtx.accumulatedResults,
      totalDuration: Date.now() - loopCtx.loopStartTime.getTime(),
      shouldExecuteBody: false,
    }
  }
}

export const logicNodeProcessor = new LogicNodeProcessor()
