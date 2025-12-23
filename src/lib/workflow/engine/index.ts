/**
 * 引擎模块索引
 *
 * 导出所有引擎相关的模块，保持向后兼容
 */

// 类型导出
export type {
        LoopState,
        CheckpointData,
        EngineOptions,
        ExecutionState,
        SequentialExecutionResult,
        ParallelExecutionResult,
} from './types'

export {
        createExecutionState,
        NODE_TYPE_DB_MAP,
} from './types'

// 分支处理
export {
        handleConditionBranching,
        markNodesForSkipping,
        markDependentNodesForSkipping,
} from './branching'

// 日志模块
export {
        saveNodeLog,
        saveNodeLogsBatch,
} from './logger'

// 执行器模块
export {
        executeNode,
        applyInitialInput,
        createPlaceholderOutput,
} from './executor'
