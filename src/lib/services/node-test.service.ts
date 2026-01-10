/**
 * Node Test Service
 *
 * Provides functionality to test individual nodes with sample input.
 * Supports PROCESS and CODE node types.
 *
 * Requirements: 3.2, 3.3, 3.5
 */

import type { NodeConfig, WorkflowConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput, AIConfigCache } from '@/lib/workflow/types'
import { getProcessor } from '@/lib/workflow/processors'

/**
 * Test node request interface
 */
export interface TestNodeRequest {
  /** Input data for the node */
  input: Record<string, unknown>
  /** Execution timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * Test node response interface
 */
export interface TestNodeResponse {
  /** Whether the test execution was successful */
  success: boolean
  /** Output data from the node (if successful) */
  output?: unknown
  /** Error details (if failed) */
  error?: {
    message: string
    stack?: string
  }
  /** Execution metrics */
  metrics: {
    /** Execution duration in milliseconds */
    duration: number
    /** Prompt tokens used (for PROCESS nodes) */
    promptTokens?: number
    /** Completion tokens used (for PROCESS nodes) */
    completionTokens?: number
    /** Total tokens used (for PROCESS nodes) */
    totalTokens?: number
  }
}

/**
 * Node types that can be tested independently
 */
const TESTABLE_NODE_TYPES = ['PROCESS', 'CODE']

/**
 * Node types that cannot be tested independently
 */
const NON_TESTABLE_NODE_TYPES = ['INPUT', 'OUTPUT']

/**
 * Check if a node type can be tested
 */
export function isTestableNodeType(nodeType: string): boolean {
  return TESTABLE_NODE_TYPES.includes(nodeType)
}

/**
 * Check if a node type is explicitly non-testable
 */
export function isNonTestableNodeType(nodeType: string): boolean {
  return NON_TESTABLE_NODE_TYPES.includes(nodeType)
}

/**
 * Node Test Service class
 */
export class NodeTestService {
  /**
   * Test a single node with provided input
   *
   * @param node - The node configuration to test
   * @param workflowConfig - The full workflow configuration (for context)
   * @param organizationId - Organization ID for AI config lookup
   * @param userId - User ID for execution context
   * @param request - Test request with input and options
   * @returns Test response with output or error and metrics
   */
  async testNode(
    node: NodeConfig,
    workflowConfig: WorkflowConfig,
    organizationId: string,
    userId: string,
    request: TestNodeRequest
  ): Promise<TestNodeResponse> {
    const startTime = Date.now()

    // Validate node type
    if (isNonTestableNodeType(node.type)) {
      return {
        success: false,
        error: {
          message: `节点类型 ${node.type} 不支持独立测试`,
        },
        metrics: {
          duration: Date.now() - startTime,
        },
      }
    }

    if (!isTestableNodeType(node.type)) {
      return {
        success: false,
        error: {
          message: `节点类型 ${node.type} 暂不支持测试`,
        },
        metrics: {
          duration: Date.now() - startTime,
        },
      }
    }

    // Get the processor for this node type
    const processor = this.getEffectiveProcessor(node)
    if (!processor) {
      return {
        success: false,
        error: {
          message: `未找到节点处理器: ${node.type}`,
        },
        metrics: {
          duration: Date.now() - startTime,
        },
      }
    }

    // Create execution context
    const context = this.createExecutionContext(
      node,
      workflowConfig,
      organizationId,
      userId,
      request.input
    )

    try {
      // Execute with timeout
      const timeout = request.timeout || 30000
      const result = await this.executeWithTimeout(
        () => processor.process(node, context),
        timeout
      )

      return this.buildResponse(result, startTime)
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : '节点执行失败',
          stack: error instanceof Error ? error.stack : undefined,
        },
        metrics: {
          duration: Date.now() - startTime,
        },
      }
    }
  }

  /**
   * Get the effective processor for a node
   * Handles special cases like PROCESS nodes with tools
   */
  private getEffectiveProcessor(node: NodeConfig) {
    // Check if PROCESS node has tools enabled
    if (node.type === 'PROCESS') {
      const config = node.config as {
        enableToolCalling?: boolean
        tools?: Array<{ enabled?: boolean }>
      } | null | undefined

      const hasEnabledTools = Boolean(config?.tools?.some(tool => tool?.enabled))
      if (config?.enableToolCalling || hasEnabledTools) {
        const toolProcessor = getProcessor('PROCESS_WITH_TOOLS')
        if (toolProcessor) return toolProcessor
      }
    }

    return getProcessor(node.type)
  }

  /**
   * Create execution context for node testing
   */
  private createExecutionContext(
    node: NodeConfig,
    workflowConfig: WorkflowConfig,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>
  ): ExecutionContext {
    // Initialize node outputs map with input data
    const nodeOutputs = new Map<string, NodeOutput>()

    // Find INPUT nodes and populate their outputs from the provided input
    const inputNodes = workflowConfig.nodes.filter(n => n.type === 'INPUT')
    for (const inputNode of inputNodes) {
      const inputNodeOutput: NodeOutput = {
        nodeId: inputNode.id,
        nodeName: inputNode.name,
        nodeType: 'INPUT',
        status: 'success',
        data: {},
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
      }

      // Map input fields from the provided input
      const fields = (inputNode.config as { fields?: Array<{ id: string; name: string }> })?.fields || []
      for (const field of fields) {
        if (input[field.name] !== undefined) {
          inputNodeOutput.data[field.name] = input[field.name]
        }
      }

      nodeOutputs.set(inputNode.id, inputNodeOutput)
    }

    // Also add a virtual "input" node output for direct variable references
    const virtualInputOutput: NodeOutput = {
      nodeId: 'input',
      nodeName: 'input',
      nodeType: 'INPUT',
      status: 'success',
      data: { ...input },
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
    }
    nodeOutputs.set('input', virtualInputOutput)

    return {
      executionId: `test-${Date.now()}`,
      workflowId: 'test-workflow',
      organizationId,
      userId,
      nodeOutputs,
      globalVariables: workflowConfig.globalVariables || {},
      aiConfigs: new Map<string, AIConfigCache>(),
      logs: [],
      addLog: (_type, _message, _step, _data) => {
        // Collect logs for debugging if needed
      },
    }
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`执行超时 (${timeoutMs}ms)`))
      }, timeoutMs)

      fn()
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Build response from node output
   */
  private buildResponse(result: NodeOutput, startTime: number): TestNodeResponse {
    const duration = Date.now() - startTime

    if (result.status === 'error') {
      return {
        success: false,
        error: {
          message: result.error || '节点执行失败',
        },
        metrics: {
          duration,
          promptTokens: result.tokenUsage?.promptTokens,
          completionTokens: result.tokenUsage?.completionTokens,
          totalTokens: result.tokenUsage?.totalTokens,
        },
      }
    }

    return {
      success: true,
      output: result.data,
      metrics: {
        duration,
        promptTokens: result.tokenUsage?.promptTokens,
        completionTokens: result.tokenUsage?.completionTokens,
        totalTokens: result.tokenUsage?.totalTokens,
      },
    }
  }
}

// Export singleton instance
export const nodeTestService = new NodeTestService()
