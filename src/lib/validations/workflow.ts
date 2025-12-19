/**
 * Zod validation schemas for workflow-related API endpoints
 * 
 * These schemas provide runtime validation and TypeScript type inference
 * for workflow create, list, and execute operations.
 */
import { z } from 'zod'

/**
 * Schema for creating a new workflow
 * Validates name, optional description, and workflow configuration
 */
export const workflowCreateSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称不能超过100字符'),
  description: z.string().max(500).optional(),
  config: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    globalVariables: z.record(z.string(), z.string()).optional(),
  }),
})

/**
 * Schema for listing workflows with pagination and filtering
 * Uses z.coerce for query parameter parsing
 */
export const workflowListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
})

/**
 * Schema for updating an existing workflow
 * All fields are optional since partial updates are allowed
 */
export const workflowUpdateSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称不能超过100字符').optional(),
  description: z.string().max(500).optional(),
  config: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    globalVariables: z.record(z.string(), z.string()).optional(),
  }).optional(),
  isActive: z.boolean().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
})

/**
 * Schema for executing a workflow
 * Validates optional input data, timeout configuration, and async mode
 */
export const workflowExecuteSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  timeout: z.number().int().min(1).max(3600).optional(),
  async: z.boolean().optional(),
})

// Inferred TypeScript types from Zod schemas
export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>
export type WorkflowUpdateInput = z.infer<typeof workflowUpdateSchema>
export type WorkflowListInput = z.infer<typeof workflowListSchema>
export type WorkflowExecuteInput = z.infer<typeof workflowExecuteSchema>
