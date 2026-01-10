/**
 * 工作流引擎类型定义
 */

import type { ParallelErrorStrategy } from '@/types/workflow'

/**
 * 循环状态
 */
export interface LoopState {
        loopNodeId: string
        loopType: 'FOR' | 'WHILE'
        currentIndex: number
        totalItems: number
        items: unknown[]
        currentItem: unknown
        iterationsCompleted: number
        maxIterations: number
        isComplete: boolean
}

/**
 * 检查点数据结构
 */
export interface CheckpointData {
        completedNodes: Record<string, {
                output: unknown
                status: string
                completedAt: string
        }>
        context: {
                nodeResults: Record<string, unknown>
                variables: Record<string, unknown>
        }
        version: number
        workflowHash: string
        failedNodeId?: string
}

/**
 * 工作流引擎配置选项
 */
export interface EngineOptions {
        enableParallelExecution?: boolean
        parallelErrorStrategy?: ParallelErrorStrategy
}

/**
 * 执行状态
 */
export interface ExecutionState {
        skippedNodes: Set<string>
        completedNodes: Set<string>
        failedNodes: Set<string>
        loopStates: Map<string, LoopState>
        loopBodyNodes: Map<string, string[]>
        loopIterationResults: Map<string, Record<string, unknown>[]>
        checkpoint: CheckpointData | null
        lastFailedNodeId: string | null
}

/**
 * 创建初始执行状态
 */
export function createExecutionState(): ExecutionState {
        return {
                skippedNodes: new Set(),
                completedNodes: new Set(),
                failedNodes: new Set(),
                loopStates: new Map(),
                loopBodyNodes: new Map(),
                loopIterationResults: new Map(),
                checkpoint: null,
                lastFailedNodeId: null,
        }
}

/**
 * 串行执行结果
 */
export interface SequentialExecutionResult {
        totalTokens: number
        promptTokens: number
        completionTokens: number
        lastOutput: Record<string, unknown>
        paused?: boolean
        pausedNodeId?: string
        approvalRequestId?: string
}

/**
 * 并行执行结果
 */
export interface ParallelExecutionResult {
        totalTokens: number
        promptTokens: number
        completionTokens: number
        lastOutput: Record<string, unknown>
}

/**
 * 节点类型映射到数据库类型
 */
export const NODE_TYPE_DB_MAP: Record<string, 'TRIGGER' | 'INPUT' | 'PROCESS' | 'CODE' | 'OUTPUT'> = {
        TRIGGER: 'TRIGGER',
        INPUT: 'INPUT',
        PROCESS: 'PROCESS',
        PROCESS_WITH_TOOLS: 'PROCESS',
        CODE: 'CODE',
        OUTPUT: 'OUTPUT',
        LOGIC: 'PROCESS',
        DATA: 'INPUT',
        IMAGE: 'INPUT',
        VIDEO: 'INPUT',
        AUDIO: 'INPUT',
        CONDITION: 'PROCESS',
        LOOP: 'PROCESS',
        HTTP: 'PROCESS',
        MERGE: 'PROCESS',
        SWITCH: 'PROCESS',
        IMAGE_GEN: 'PROCESS',
        NOTIFICATION: 'PROCESS',
        APPROVAL: 'PROCESS',
        GROUP: 'PROCESS',
}
