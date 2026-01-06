import { describe, it, expect } from 'vitest'
import { workflowCreateSchema } from '@/lib/validations/workflow'

describe('Workflow Validation', () => {
  it('should validate a correct workflow', () => {
    const validWorkflow = {
      name: 'Test Workflow',
      config: {
        nodes: [
          {
            id: '1',
            type: 'INPUT',
            name: '用户输入',
            position: { x: 0, y: 0 },
            config: {
              fields: []
            }
          }
        ],
        edges: []
      }
    }
    const result = workflowCreateSchema.safeParse(validWorkflow)
    expect(result.success).toBe(true)
  })

  it('should accept any node type for backward compatibility', () => {
    // Note: We use flexible schema to support old workflows with legacy node types
    // The schema accepts any node type, validation of supported types happens at runtime
    const workflowWithLegacyType = {
      name: 'Legacy Workflow',
      config: {
        nodes: [
          {
            id: '1',
            type: 'LEGACY_TYPE',
            name: 'Start',
            position: { x: 0, y: 0 },
            config: {}
          }
        ],
        edges: []
      }
    }
    const result = workflowCreateSchema.safeParse(workflowWithLegacyType)
    // Flexible schema accepts any node type for backward compatibility
    expect(result.success).toBe(true)
  })

  it('should validate INPUT node with empty fields array', () => {
    const validWorkflow = {
      name: 'Valid Config',
      config: {
        nodes: [
          {
            id: '1',
            type: 'INPUT',
            name: '用户输入',
            position: { x: 0, y: 0 },
            config: {
              fields: []
            }
          }
        ],
        edges: []
      }
    }
    const result = workflowCreateSchema.safeParse(validWorkflow)
    expect(result.success).toBe(true)
  })
  
  it('should validate PROCESS node', () => {
      const validProcessWorkflow = {
        name: 'Process Workflow',
        config: {
          nodes: [
            {
              id: 'node-process',
              type: 'PROCESS',
              name: 'AI处理',
              position: { x: 100, y: 100 },
              config: {
                  systemPrompt: 'You are a helpful assistant',
                  userPrompt: '{{input.text}}'
              }
            }
          ],
          edges: []
        }
      }
      const result = workflowCreateSchema.safeParse(validProcessWorkflow)
      expect(result.success).toBe(true)
  })
})
