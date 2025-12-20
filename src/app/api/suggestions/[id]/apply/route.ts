/**
 * 优化建议应用 API
 *
 * POST /api/suggestions/[id]/apply - 应用优化建议
 */

import { NextRequest } from 'next/server'
import { withAuth, AuthContext } from '@/lib/api/with-auth'
import { ApiResponse } from '@/lib/api/api-response'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { prisma } from '@/lib/db'
import { versionService } from '@/lib/services/version.service'
import { z } from 'zod'
import type { WorkflowConfig } from '@/types/workflow'

const applySchema = z.object({
  createNewVersion: z.boolean().optional().default(true),
  versionTag: z.string().optional(),
  commitMessage: z.string().optional(),
})

interface SuggestedChange {
  nodeId: string
  field: string
  oldValue: unknown
  newValue: unknown
  explanation: string
}

/**
 * POST /api/suggestions/[id]/apply
 * 应用优化建议
 */
export const POST = withAuth(async (request: NextRequest, { user, params }: AuthContext) => {
  const suggestionId = params?.id
  if (!suggestionId) {
    throw new NotFoundError('建议不存在')
  }

  // 获取建议
  const suggestion = await prisma.optimizationSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      feedback: {
        include: {
          execution: {
            include: {
              workflow: true,
            },
          },
        },
      },
    },
  })

  if (!suggestion) {
    throw new NotFoundError('建议不存在')
  }

  // 验证用户权限
  if (suggestion.feedback.execution.workflow.organizationId !== user.organizationId) {
    throw new NotFoundError('建议不存在')
  }

  // 解析请求体
  const body = await request.json()
  const parseResult = applySchema.safeParse(body)

  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.issues[0].message)
  }

  const { createNewVersion, versionTag, commitMessage } = parseResult.data

  const workflow = suggestion.feedback.execution.workflow
  const changes = suggestion.suggestedChanges as unknown as SuggestedChange[]

  // 应用修改到工作流配置
  const config = workflow.config as unknown as WorkflowConfig
  const updatedConfig = applyChangesToConfig(config, changes)

  // 更新工作流配置
  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { config: updatedConfig as object },
  })

  // 更新建议状态
  await prisma.optimizationSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: 'APPLIED',
      appliedAt: new Date(),
      appliedById: user.id,
    },
  })

  // 更新反馈状态
  await prisma.executionFeedback.update({
    where: { id: suggestion.feedbackId },
    data: { optimizationStatus: 'APPLIED' },
  })

  // 可选：创建新版本
  let newVersion = null
  if (createNewVersion) {
    newVersion = await versionService.createVersion(workflow.id, user.id, {
      versionTag,
      commitMessage: commitMessage || `应用AI优化建议: ${suggestion.suggestionTitle}`,
      versionType: 'OPTIMIZATION',
      publish: true,
      optimizationIds: [suggestionId],
    })
  }

  return ApiResponse.success({
    success: true,
    appliedChanges: changes,
    workflowVersion: newVersion,
  })
})

/**
 * 将修改应用到工作流配置
 */
function applyChangesToConfig(
  config: WorkflowConfig,
  changes: SuggestedChange[]
): WorkflowConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as WorkflowConfig

  for (const change of changes) {
    // 找到对应的节点
    const node = updatedConfig.nodes?.find((n) => n.id === change.nodeId)
    if (!node) continue

    // 解析字段路径 (如 "config.userPrompt")
    const fieldParts = change.field.split('.')

    // 遍历路径并设置值
    let target: Record<string, unknown> = node as unknown as Record<string, unknown>
    for (let i = 0; i < fieldParts.length - 1; i++) {
      const part = fieldParts[i]
      if (target[part] === undefined) {
        target[part] = {}
      }
      target = target[part] as Record<string, unknown>
    }

    const lastPart = fieldParts[fieldParts.length - 1]
    target[lastPart] = change.newValue
  }

  return updatedConfig
}
