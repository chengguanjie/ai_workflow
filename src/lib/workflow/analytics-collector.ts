/**
 * 工作流分析数据收集器
 */

import { prisma } from '@/lib/db'
import { type AnalyticsConfig, type DataPointType, Prisma } from '@prisma/client'
import { get } from 'lodash'

/**
 * 提取数据值的辅助函数
 */
function extractValue(data: unknown, path: string): unknown {
  // 支持 JSONPath 语法
  if (path.startsWith('$.')) {
    const simplePath = path.substring(2).replace(/\[(\d+)\]/g, '.$1')
    return get(data, simplePath)
  }
  // 支持普通的点分隔路径
  return get(data, path)
}

/**
 * 将值转换为指定类型
 */
function convertValue(value: unknown, type: DataPointType): {
  numberValue?: number | null
  stringValue?: string | null
  booleanValue?: boolean | null
  jsonValue?: Prisma.InputJsonValue
} {
  const result: {
    numberValue?: number | null
    stringValue?: string | null
    booleanValue?: boolean | null
    jsonValue?: Prisma.InputJsonValue
  } = {}

  switch (type) {
    case 'NUMBER':
    case 'PERCENTAGE':
    case 'RATING':
      if (value !== null && value !== undefined) {
        const num = Number(value)
        result.numberValue = isNaN(num) ? null : num
      } else {
        result.numberValue = null
      }
      break

    case 'STRING':
      result.stringValue = value != null ? String(value) : null
      break

    case 'BOOLEAN':
      result.booleanValue = value != null ? Boolean(value) : null
      break

    case 'ARRAY':
    case 'OBJECT':
      result.jsonValue = (value !== null && value !== undefined ? value : Prisma.JsonNull) as Prisma.InputJsonValue
      break

    default:
      // 默认存储为 JSON
      result.jsonValue = value as Prisma.InputJsonValue
  }

  return result
}

export class AnalyticsCollector {
  private configs: AnalyticsConfig[] = []
  private workflowId: string
  private userId: string
  private departmentId?: string
  private executionId: string

  constructor(
    workflowId: string,
    userId: string,
    executionId: string,
    departmentId?: string
  ) {
    this.workflowId = workflowId
    this.userId = userId
    this.executionId = executionId
    this.departmentId = departmentId
  }

  /**
   * 初始化：加载工作流的分析配置
   */
  async initialize(): Promise<void> {
    this.configs = await prisma.analyticsConfig.findMany({
      where: {
        workflowId: this.workflowId,
        isActive: true,
      },
    })
  }

  /**
   * 收集节点输出数据
   */
  async collectNodeOutput(
    nodeId: string,
    nodeName: string,
    output: unknown
  ): Promise<void> {
    // 查找匹配此节点的配置
    const nodeConfigs = this.configs.filter(config => {
      if (config.source !== 'NODE_OUTPUT') return false
      if (config.nodeId && config.nodeId !== nodeId) return false
      if (config.nodeName && config.nodeName !== nodeName) return false
      return true
    })

    const dataPoints: Prisma.AnalyticsDataPointCreateManyInput[] = []

    for (const config of nodeConfigs) {
      try {
        // 提取值
        const value = extractValue(output, config.sourcePath)

        // 检查是否必需
        if (config.isRequired && (value === null || value === undefined)) {
          console.warn(`Required analytics data point missing: ${config.name} from node ${nodeName}`)
          continue
        }

        // 转换值
        const convertedValue = convertValue(value, config.type)

        dataPoints.push({
          configId: config.id,
          executionId: this.executionId,
          nodeId,
          nodeName,
          userId: this.userId,
          departmentId: this.departmentId,
          ...convertedValue,
        } as Prisma.AnalyticsDataPointCreateManyInput)
      } catch (error) {
        console.error(`Error collecting analytics data point ${config.name}:`, error)
      }
    }

    // 批量插入数据点
    if (dataPoints.length > 0) {
      await prisma.analyticsDataPoint.createMany({
        data: dataPoints as Prisma.AnalyticsDataPointCreateManyInput[],
      })
    }
  }

  /**
   * 收集执行元数据
   */
  async collectExecutionMeta(
    duration: number,
    totalTokens: number,
    status: 'COMPLETED' | 'FAILED'
  ): Promise<void> {
    const metaConfigs = this.configs.filter(config => config.source === 'EXECUTION_META')
    const dataPoints: Prisma.AnalyticsDataPointCreateManyInput[] = []

    const metadata = {
      duration,
      totalTokens,
      status,
      successRate: status === 'COMPLETED' ? 100 : 0,
    }

    for (const config of metaConfigs) {
      try {
        const value = extractValue(metadata, config.sourcePath)
        const convertedValue = convertValue(value, config.type)

        const dataPoint: Prisma.AnalyticsDataPointCreateManyInput = {
          configId: config.id,
          executionId: this.executionId,
          userId: this.userId,
          departmentId: this.departmentId,
          ...convertedValue,
          metadata: {
            executionStatus: status
          } as Prisma.InputJsonValue
        }
        dataPoints.push(dataPoint)
      } catch (error) {
        console.error(`Error collecting execution meta ${config.name}:`, error)
      }
    }

    if (dataPoints.length > 0) {
      await prisma.analyticsDataPoint.createMany({
        data: dataPoints as Prisma.AnalyticsDataPointCreateManyInput[],
      })
    }
  }

  /**
   * 收集用户反馈数据
   */
  async collectUserFeedback(
    rating: number,
    isAccurate: boolean,
    issueCategories?: string[]
  ): Promise<void> {
    const feedbackConfigs = this.configs.filter(config => config.source === 'USER_FEEDBACK')
    const dataPoints: Prisma.AnalyticsDataPointCreateManyInput[] = []

    const feedbackData = {
      rating,
      isAccurate,
      accuracyScore: isAccurate ? 100 : 0,
      issueCategories,
      issueCount: issueCategories?.length || 0,
    }

    for (const config of feedbackConfigs) {
      try {
        const value = extractValue(feedbackData, config.sourcePath)
        const convertedValue = convertValue(value, config.type)

        dataPoints.push({
          configId: config.id,
          executionId: this.executionId,
          userId: this.userId,
          departmentId: this.departmentId,
          ...convertedValue,
        } as Prisma.AnalyticsDataPointCreateManyInput)
      } catch (error) {
        console.error(`Error collecting feedback data ${config.name}:`, error)
      }
    }

    if (dataPoints.length > 0) {
      await prisma.analyticsDataPoint.createMany({
        data: dataPoints as Prisma.AnalyticsDataPointCreateManyInput[],
      })
    }
  }

  /**
   * 手动收集自定义数据
   */
  async collectCustomData(
    dataPointName: string,
    value: unknown,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const config = this.configs.find(c => c.name === dataPointName && c.source === 'CUSTOM')
    if (!config) {
      console.warn(`Custom data point configuration not found: ${dataPointName}`)
      return
    }

    try {
      const convertedValue = convertValue(value, config.type)

      await prisma.analyticsDataPoint.create({
        data: {
          configId: config.id,
          executionId: this.executionId,
          userId: this.userId,
          departmentId: this.departmentId,
          ...convertedValue,
          metadata: metadata as Prisma.InputJsonValue,
        },
      })
    } catch (error) {
      console.error(`Error collecting custom data ${dataPointName}:`, error)
    }
  }
}

/**
 * 创建分析收集器的便捷函数
 */
export async function createAnalyticsCollector(
  workflowId: string,
  userId: string,
  executionId: string,
  departmentId?: string
): Promise<AnalyticsCollector | null> {
  try {
    // 检查工作流是否启用了分析
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { analyticsEnabled: true },
    })

    if (!workflow?.analyticsEnabled) {
      return null
    }

    const collector = new AnalyticsCollector(workflowId, userId, executionId, departmentId)
    await collector.initialize()
    return collector
  } catch (error) {
    console.error('Error creating analytics collector:', error)
    return null
  }
}