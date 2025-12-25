/**
 * 工作流执行引擎模块（简化版）
 * 只支持 INPUT 和 PROCESS 两种节点类型
 */

export { WorkflowEngine, executeWorkflow } from './engine'
export type {
  ExecutionContext,
  ExecutionResult,
  NodeOutput,
  ExecutionStatus,
  AIConfigCache,
  NodeProcessor,
} from './types'
export {
  parseVariableReferences,
  replaceVariables,
  replaceFileNameVariables,
  getExecutionOrder,
  sanitizeFileName,
} from './utils'
export {
  getProcessor,
  inputNodeProcessor,
  processNodeProcessor,
} from './processors'
