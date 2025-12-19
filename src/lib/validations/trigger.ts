/**
 * Zod validation schemas for workflow trigger API endpoints
 */
import { z } from 'zod'

/**
 * Trigger type enum
 */
export const triggerTypeEnum = z.enum(['MANUAL', 'WEBHOOK', 'SCHEDULE'])

/**
 * Cron expression validation regex
 * Supports standard 5-field cron: minute hour day month weekday
 */
const cronExpressionRegex = /^(\*|([0-9]|[1-5][0-9])(-([0-9]|[1-5][0-9]))?)(,(\*|([0-9]|[1-5][0-9])(-([0-9]|[1-5][0-9]))?))*\s+(\*|([0-9]|1[0-9]|2[0-3])(-([0-9]|1[0-9]|2[0-3]))?)(,(\*|([0-9]|1[0-9]|2[0-3])(-([0-9]|1[0-9]|2[0-3]))?))*\s+(\*|([1-9]|[1-2][0-9]|3[0-1])(-([1-9]|[1-2][0-9]|3[0-1]))?)(,(\*|([1-9]|[1-2][0-9]|3[0-1])(-([1-9]|[1-2][0-9]|3[0-1]))?))*\s+(\*|([1-9]|1[0-2])(-([1-9]|1[0-2]))?)(,(\*|([1-9]|1[0-2])(-([1-9]|1[0-2]))?))*\s+(\*|[0-6](-[0-6])?)(,(\*|[0-6](-[0-6])?))*$/

/**
 * Schema for creating a new trigger
 */
export const triggerCreateSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称不能超过100字符'),
  type: triggerTypeEnum,
  enabled: z.boolean().default(true),

  // 定时任务配置
  cronExpression: z.string()
    .regex(cronExpressionRegex, '无效的 Cron 表达式')
    .optional(),
  timezone: z.string().default('Asia/Shanghai'),

  // 执行配置
  inputTemplate: z.record(z.string(), z.unknown()).optional(),
  retryOnFail: z.boolean().default(false),
  maxRetries: z.number().int().min(1).max(10).default(3),
}).refine((data) => {
  // 如果是定时任务，必须有 cron 表达式
  if (data.type === 'SCHEDULE' && !data.cronExpression) {
    return false
  }
  return true
}, {
  message: '定时任务必须配置 Cron 表达式',
  path: ['cronExpression'],
})

/**
 * Schema for updating a trigger
 */
export const triggerUpdateSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称不能超过100字符').optional(),
  enabled: z.boolean().optional(),

  // 定时任务配置
  cronExpression: z.string()
    .regex(cronExpressionRegex, '无效的 Cron 表达式')
    .optional()
    .nullable(),
  timezone: z.string().optional(),

  // 执行配置
  inputTemplate: z.record(z.string(), z.unknown()).optional().nullable(),
  retryOnFail: z.boolean().optional(),
  maxRetries: z.number().int().min(1).max(10).optional(),
})

/**
 * Schema for listing triggers
 */
export const triggerListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: triggerTypeEnum.optional(),
  enabled: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
})

/**
 * Schema for listing trigger logs
 */
export const triggerLogListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

// Inferred TypeScript types
export type TriggerCreateInput = z.infer<typeof triggerCreateSchema>
export type TriggerUpdateInput = z.infer<typeof triggerUpdateSchema>
export type TriggerListInput = z.infer<typeof triggerListSchema>
export type TriggerLogListInput = z.infer<typeof triggerLogListSchema>
