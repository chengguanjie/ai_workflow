/**
 * 逻辑判断节点处理器
 *
 * 支持四种模式：
 * - condition: 条件判断（选择性激活后续分支）
 * - split: 并行拆分（激活所有后续分支）
 * - merge: 结果合并（聚合多个上游节点数据）
 * - switch: 基于变量取值的多分支选择
 *
 * 注意：本处理器本身不直接"跳转"到后续节点，真正的控制流仍由引擎调度层
 * 依据节点输出中的元数据（如 matchedConditionId / activeBranchIds 等）和边结构来实现。
 */

import type { NodeConfig, LogicNodeConfig, LogicNodeConfigData, LogicCondition } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'

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
   * 当前实现：基于 mergeFromNodeIds 或所有已存在的上游输出，简单聚合为一个对象。
   */
  private executeMerge(
    config: LogicNodeConfigData,
    context: ExecutionContext
  ): Record<string, unknown> {
    const mergeFromNodeIds = config.mergeFromNodeIds || []

    const merged: Record<string, unknown> = {}

    if (mergeFromNodeIds.length > 0) {
      for (const nodeId of mergeFromNodeIds) {
        const output = context.nodeOutputs.get(nodeId)
        if (output) {
          merged[nodeId] = output.data
        }
      }
    } else {
      for (const [nodeId, output] of context.nodeOutputs.entries()) {
        merged[nodeId] = output.data
      }
    }

    return {
      mergeFromNodeIds: mergeFromNodeIds.length > 0 ? mergeFromNodeIds : undefined,
      merged,
      mergeStrategy: config.mergeStrategy || 'all',
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
}

export const logicNodeProcessor = new LogicNodeProcessor()
