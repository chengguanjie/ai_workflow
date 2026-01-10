/**
 * 节点执行器模块
 *
 * 负责执行单个节点并管理节点输出
 */

import type { NodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from '../types'
import { getProcessor } from '../processors'
import type { AnalyticsCollector } from '../analytics-collector'

function shouldUseToolProcessor(node: NodeConfig): boolean {
        if (node.type !== 'PROCESS') return false

        const config = node.config as {
                enableToolCalling?: boolean
                tools?: Array<{ enabled?: boolean }>
        } | null | undefined

        const hasEnabledTools = Boolean(config?.tools?.some(tool => tool?.enabled))
        return Boolean(config?.enableToolCalling || hasEnabledTools)
}

function getEffectiveProcessor(node: NodeConfig) {
        // 如果是 PROCESS 节点且启用了工具调用，则切换到带工具的处理器
        if (shouldUseToolProcessor(node)) {
                const toolProcessor = getProcessor('PROCESS_WITH_TOOLS')
                if (toolProcessor) return toolProcessor
        }
        return getProcessor(node.type)
}

/**
 * 执行单个节点
 */
export async function executeNode(
        node: NodeConfig,
        context: ExecutionContext,
        analyticsCollector?: AnalyticsCollector | null
): Promise<NodeOutput> {
        const processor = getEffectiveProcessor(node)

        if (!processor) {
                // 对于不支持的节点类型，返回跳过状态
                console.warn(`未找到节点处理器: ${node.type}`)
                context.addLog?.('warning', `未找到节点处理器: ${node.type}`, 'PROCESSOR', {
                        nodeId: node.id,
                        nodeName: node.name,
                        nodeType: node.type,
                })
                const output: NodeOutput = {
                        nodeId: node.id,
                        nodeName: node.name,
                        nodeType: node.type,
                        status: 'skipped',
                        data: {},
                        startedAt: new Date(),
                        completedAt: new Date(),
                        duration: 0,
                }
                context.nodeOutputs.set(node.id, output)
                return output
        }

        // 执行节点
        context.addLog?.('info', `准备执行节点: ${node.name}`, 'NODE', {
                nodeId: node.id,
                nodeType: node.type,
                processor: processor.nodeType,
        })
        context.addLog?.('step', `开始执行节点处理器: ${processor.nodeType}`, 'EXECUTE')

        let result: NodeOutput
        try {
                result = await processor.process(node, context)
        } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                context.addLog?.('error', `节点执行异常: ${errorMessage}`, 'ERROR')
                throw error
        }

        if (result.status === 'success') {
                context.addLog?.('success', '节点执行成功', 'COMPLETE', {
                        duration: result.duration,
                        tokenUsage: result.tokenUsage,
                })
        } else if (result.status === 'error') {
                context.addLog?.('error', `节点执行失败: ${result.error || '未知错误'}`, 'COMPLETE', {
                        duration: result.duration,
                })
        } else if (result.status === 'paused') {
                context.addLog?.('warning', '节点已暂停，等待审批', 'PAUSED', {
                        approvalRequestId: result.approvalRequestId,
                })
        } else {
                context.addLog?.('info', `节点执行结束，状态: ${result.status}`, 'COMPLETE', {
                        duration: result.duration,
                })
        }

        // 保存到上下文
        context.nodeOutputs.set(node.id, result)

        // 收集节点输出数据用于分析（仅在成功时）
        if (analyticsCollector && result.status === 'success' && result.data) {
                await analyticsCollector.collectNodeOutput(node.id, node.name, result.data)
        }

        return result
}

/**
 * 应用初始输入到输入节点
 */
export function applyInitialInput(
        nodes: NodeConfig[],
        input: Record<string, unknown>
): void {
        for (const node of nodes) {
                if (node.type === 'INPUT' && node.config?.fields) {
                        const fields = node.config.fields as Array<{
                                id: string
                                name: string
                                value: string
                        }>

                        for (const field of fields) {
                                if (input[field.name] !== undefined) {
                                        field.value = String(input[field.name])
                                }
                        }
                }
        }
}

/**
 * 创建节点输出占位符
 */
export function createPlaceholderOutput(node: NodeConfig): NodeOutput {
        return {
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                status: 'success',
                data: {},
                startedAt: new Date(),
                completedAt: new Date(),
                duration: 0,
        }
}
