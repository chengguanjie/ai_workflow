/**
 * 节点执行器模块
 *
 * 负责执行单个节点并管理节点输出
 */

import type { NodeConfig } from '@/types/workflow'
import type { ExecutionContext, NodeOutput } from '../types'
import { getProcessor } from '../processors'
import type { AnalyticsCollector } from '../analytics-collector'

/**
 * 执行单个节点
 */
export async function executeNode(
        node: NodeConfig,
        context: ExecutionContext,
        analyticsCollector?: AnalyticsCollector | null
): Promise<NodeOutput> {
        const processor = getProcessor(node.type)

        if (!processor) {
                // 对于不支持的节点类型，返回跳过状态
                console.warn(`未找到节点处理器: ${node.type}`)
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
        const result = await processor.process(node, context)

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
