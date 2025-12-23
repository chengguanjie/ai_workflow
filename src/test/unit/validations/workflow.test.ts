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
            type: 'TRIGGER',
            name: 'Start',
            position: { x: 0, y: 0 },
            config: {
              triggerType: 'MANUAL'
            }
          }
        ],
        edges: []
      }
    }
    const result = workflowCreateSchema.safeParse(validWorkflow)
    expect(result.success).toBe(true)
  })

  it('should reject invalid node type', () => {
    const invalidWorkflow = {
      name: 'Invalid Workflow',
      config: {
        nodes: [
          {
            id: '1',
            type: 'INVALID_TYPE',
            name: 'Start',
            position: { x: 0, y: 0 },
            config: {}
          }
        ],
        edges: []
      }
    }
    const result = workflowCreateSchema.safeParse(invalidWorkflow)
    expect(result.success).toBe(false)
  })

  it('should reject missing config fields for TRIGGER node', () => {
    const invalidWorkflow = {
      name: 'Invalid Config',
      config: {
        nodes: [
          {
            id: '1',
            type: 'TRIGGER',
            name: 'Start',
            position: { x: 0, y: 0 },
            config: {
              // Missing triggerType
            }
          }
        ],
        edges: []
      }
    }
    const result = workflowCreateSchema.safeParse(invalidWorkflow)
    expect(result.success).toBe(false)
  })
  
  it('should validate complex nested config (HTTP node)', () => {
      const validHttpWorkflow = {
        name: 'HTTP Workflow',
        config: {
          nodes: [
            {
              id: 'node-http',
              type: 'HTTP',
              name: 'API Call',
              position: { x: 100, y: 100 },
              config: {
                  method: 'POST',
                  url: 'https://api.example.com',
                  body: {
                      type: 'json',
                      content: '{"key":"value"}'
                  }
              }
            }
          ],
          edges: []
        }
      }
      const result = workflowCreateSchema.safeParse(validHttpWorkflow)
      expect(result.success).toBe(true)
  })
})
