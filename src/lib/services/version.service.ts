/**
 * 工作流版本管理服务
 */

import { prisma } from '@/lib/db'
import { VersionType } from '@prisma/client'
import type { WorkflowConfig, NodeConfig, EdgeConfig } from '@/types/workflow'

// ============================================
// 类型定义
// ============================================

export interface CreateVersionOptions {
  versionTag?: string
  commitMessage: string
  versionType?: VersionType
  publish?: boolean
  optimizationIds?: string[]
}

export interface VersionComparison {
  nodesAdded: NodeConfig[]
  nodesRemoved: NodeConfig[]
  nodesModified: {
    nodeId: string
    nodeName: string
    changes: {
      field: string
      oldValue: unknown
      newValue: unknown
    }[]
  }[]
  edgesAdded: EdgeConfig[]
  edgesRemoved: EdgeConfig[]
}

export interface VersionWithStats {
  id: string
  versionNumber: number
  versionTag: string | null
  commitMessage: string
  versionType: VersionType
  isPublished: boolean
  isActive: boolean
  executionCount: number
  successRate: number | null
  avgRating: number | null
  createdAt: Date
  createdById: string
  changesSummary: VersionComparison | null
}

// ============================================
// 版本管理服务
// ============================================

export class VersionService {
  /**
   * 创建新版本
   */
  async createVersion(
    workflowId: string,
    userId: string,
    options: CreateVersionOptions
  ) {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    })

    if (!workflow) {
      throw new Error('工作流不存在')
    }

    // 获取最新版本号
    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { versionNumber: 'desc' }
    })

    const newVersionNumber = (latestVersion?.versionNumber || 0) + 1

    // 计算变更摘要
    let changesSummary: VersionComparison | null = null
    if (latestVersion) {
      changesSummary = this.calculateChanges(
        latestVersion.config as unknown as WorkflowConfig,
        workflow.config as unknown as WorkflowConfig
      )
    }

    // 如果要发布，先取消其他版本的活跃状态
    if (options.publish) {
      await prisma.workflowVersion.updateMany({
        where: { workflowId, isActive: true },
        data: { isActive: false }
      })
    }

    // 创建版本
    const version = await prisma.workflowVersion.create({
      data: {
        workflowId,
        versionNumber: newVersionNumber,
        versionTag: options.versionTag || `v${newVersionNumber}`,
        commitMessage: options.commitMessage,
        config: workflow.config as object,
        versionType: options.versionType || 'MANUAL',
        isPublished: options.publish || false,
        isActive: options.publish || false,
        changesSummary: changesSummary ? (changesSummary as object) : undefined,
        sourceVersionId: latestVersion?.id,
        optimizationIds: options.optimizationIds,
        createdById: userId,
      }
    })

    // 如果发布，更新工作流的当前版本ID
    if (options.publish) {
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { currentVersionId: version.id }
      })
    }

    return version
  }

  /**
   * 获取版本列表
   */
  async getVersions(
    workflowId: string,
    options: { page?: number; limit?: number } = {}
  ) {
    const { page = 1, limit = 20 } = options
    const skip = (page - 1) * limit

    const [versions, total] = await Promise.all([
      prisma.workflowVersion.findMany({
        where: { workflowId },
        orderBy: { versionNumber: 'desc' },
        skip,
        take: limit,
      }),
      prisma.workflowVersion.count({ where: { workflowId } })
    ])

    return {
      versions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  /**
   * 获取单个版本详情
   */
  async getVersion(versionId: string) {
    return prisma.workflowVersion.findUnique({
      where: { id: versionId }
    })
  }

  /**
   * 发布版本（设为活跃版本）
   */
  async publishVersion(workflowId: string, versionId: string) {
    const version = await prisma.workflowVersion.findUnique({
      where: { id: versionId }
    })

    if (!version || version.workflowId !== workflowId) {
      throw new Error('版本不存在')
    }

    // 取消其他版本的活跃状态
    await prisma.workflowVersion.updateMany({
      where: { workflowId, isActive: true },
      data: { isActive: false }
    })

    // 设置当前版本为活跃
    const updatedVersion = await prisma.workflowVersion.update({
      where: { id: versionId },
      data: { isActive: true, isPublished: true }
    })

    // 更新工作流配置为该版本
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        config: version.config as object,
        currentVersionId: versionId
      }
    })

    return updatedVersion
  }

  /**
   * 回滚到指定版本
   */
  async rollback(
    workflowId: string,
    targetVersionId: string,
    userId: string,
    commitMessage?: string
  ) {
    const targetVersion = await prisma.workflowVersion.findUnique({
      where: { id: targetVersionId }
    })

    if (!targetVersion || targetVersion.workflowId !== workflowId) {
      throw new Error('目标版本不存在')
    }

    // 更新工作流配置为目标版本
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { config: targetVersion.config as object }
    })

    // 创建回滚版本记录
    return this.createVersion(workflowId, userId, {
      commitMessage: commitMessage || `回滚到版本 ${targetVersion.versionTag || `v${targetVersion.versionNumber}`}`,
      versionType: 'ROLLBACK',
      publish: true,
    })
  }

  /**
   * 版本对比
   */
  async compareVersions(versionId1: string, versionId2: string): Promise<VersionComparison> {
    const [v1, v2] = await Promise.all([
      prisma.workflowVersion.findUnique({ where: { id: versionId1 } }),
      prisma.workflowVersion.findUnique({ where: { id: versionId2 } }),
    ])

    if (!v1 || !v2) {
      throw new Error('版本不存在')
    }

    return this.calculateChanges(
      v1.config as unknown as WorkflowConfig,
      v2.config as unknown as WorkflowConfig
    )
  }

  /**
   * 计算两个配置之间的变更
   */
  calculateChanges(oldConfig: WorkflowConfig, newConfig: WorkflowConfig): VersionComparison {
    const oldNodes = new Map(oldConfig.nodes?.map(n => [n.id, n]) || [])
    const newNodes = new Map(newConfig.nodes?.map(n => [n.id, n]) || [])
    const oldEdges = new Map(oldConfig.edges?.map(e => [e.id, e]) || [])
    const newEdges = new Map(newConfig.edges?.map(e => [e.id, e]) || [])

    // 新增的节点
    const nodesAdded = (newConfig.nodes || []).filter(n => !oldNodes.has(n.id))

    // 删除的节点
    const nodesRemoved = (oldConfig.nodes || []).filter(n => !newNodes.has(n.id))

    // 修改的节点
    const nodesModified: VersionComparison['nodesModified'] = []
    for (const [id, newNode] of newNodes) {
      const oldNode = oldNodes.get(id)
      if (oldNode) {
        const changes = this.diffNodes(oldNode, newNode)
        if (changes.length > 0) {
          nodesModified.push({
            nodeId: id,
            nodeName: newNode.name,
            changes
          })
        }
      }
    }

    // 新增的边
    const edgesAdded = (newConfig.edges || []).filter(e => !oldEdges.has(e.id))

    // 删除的边
    const edgesRemoved = (oldConfig.edges || []).filter(e => !newEdges.has(e.id))

    return {
      nodesAdded,
      nodesRemoved,
      nodesModified,
      edgesAdded,
      edgesRemoved
    }
  }

  /**
   * 对比两个节点的差异
   */
  private diffNodes(
    oldNode: NodeConfig,
    newNode: NodeConfig
  ): { field: string; oldValue: unknown; newValue: unknown }[] {
    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = []

    // 比较名称
    if (oldNode.name !== newNode.name) {
      changes.push({ field: 'name', oldValue: oldNode.name, newValue: newNode.name })
    }

    // 比较配置
    const oldConfig = (oldNode as unknown as { config?: Record<string, unknown> }).config || {}
    const newConfig = (newNode as unknown as { config?: Record<string, unknown> }).config || {}

    // 比较配置中的重要字段
    const configFields = new Set([
      ...Object.keys(oldConfig),
      ...Object.keys(newConfig)
    ])

    for (const field of configFields) {
      const oldValue = oldConfig[field]
      const newValue = newConfig[field]

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: `config.${field}`,
          oldValue,
          newValue
        })
      }
    }

    return changes
  }

  /**
   * 更新版本统计信息
   */
  async updateVersionStats(versionId: string) {
    const version = await prisma.workflowVersion.findUnique({
      where: { id: versionId }
    })

    if (!version) return

    // 获取该版本的执行统计
    const executions = await prisma.execution.findMany({
      where: { workflowVersionId: versionId },
      select: {
        status: true,
        feedbacks: {
          select: { rating: true }
        }
      }
    })

    const executionCount = executions.length
    const successCount = executions.filter((e: { status: string }) => e.status === 'COMPLETED').length
    const successRate = executionCount > 0 ? successCount / executionCount : null

    // 计算平均评分
    const allRatings = executions.flatMap((e: { feedbacks: Array<{ rating: number }> }) => e.feedbacks.map((f: { rating: number }) => f.rating))
    const avgRating = allRatings.length > 0
      ? allRatings.reduce((sum: number, r: number) => sum + r, 0) / allRatings.length
      : null

    await prisma.workflowVersion.update({
      where: { id: versionId },
      data: {
        executionCount,
        successRate,
        avgRating
      }
    })
  }

  /**
   * 生成变更摘要文本
   */
  generateChangeSummaryText(comparison: VersionComparison): string {
    const parts: string[] = []

    if (comparison.nodesAdded.length > 0) {
      parts.push(`新增 ${comparison.nodesAdded.length} 个节点`)
    }

    if (comparison.nodesRemoved.length > 0) {
      parts.push(`删除 ${comparison.nodesRemoved.length} 个节点`)
    }

    if (comparison.nodesModified.length > 0) {
      parts.push(`修改 ${comparison.nodesModified.length} 个节点`)
    }

    if (comparison.edgesAdded.length > 0) {
      parts.push(`新增 ${comparison.edgesAdded.length} 条连接`)
    }

    if (comparison.edgesRemoved.length > 0) {
      parts.push(`删除 ${comparison.edgesRemoved.length} 条连接`)
    }

    return parts.length > 0 ? parts.join('，') : '无变更'
  }
}

// 导出单例
export const versionService = new VersionService()
