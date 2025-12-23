
import { describe, it, expect } from 'vitest'
import { replaceVariables } from './utils'
import type { ExecutionContext, NodeOutput } from './types'

describe('replaceVariables', () => {
                  function createMockContext(outputs: Record<string, any>): ExecutionContext {
                                    const nodeOutputs = new Map<string, NodeOutput>();

                                    Object.entries(outputs).forEach(([nodeName, data]) => {
                                                      // using nodeName as key for simplicity in mock, though map key implies nodeId usually.
                                                      // But replaceVariables iterates values and checks nodeName property.
                                                      nodeOutputs.set(nodeName, { // Key doesn't matter for findNodeOutputByName
                                                                        nodeId: nodeName,
                                                                        nodeName: nodeName,
                                                                        type: 'INPUT',
                                                                        status: 'success',
                                                                        data: data,
                                                                        timestamp: Date.now()
                                                      });
                                    });

                                    return {
                                                      executionId: 'test',
                                                      workflowId: 'test',
                                                      organizationId: 'test',
                                                      userId: 'test',
                                                      nodeOutputs,
                                                      globalVariables: {},
                                                      aiConfigs: new Map()
                                    } as ExecutionContext
                  }

                  it('should correctly replace different data types', () => {
                                    const context = createMockContext({
                                                      'User Input': {
                                                                        text: 'Hello',
                                                                        number: 123,
                                                                        file: { name: 'doc.pdf', url: 'http://test', size: 1024 },
                                                                        nested: { deep: { value: 'found me' } },
                                                                        list: ['a', 'b']
                                                      }
                                    });

                                    // 1. Text
                                    expect(replaceVariables('Text: {{User Input.text}}', context)).toBe('Text: Hello')

                                    // 2. Number
                                    expect(replaceVariables('Num: {{User Input.number}}', context)).toBe('Num: 123')

                                    // 3. File Object (Should be JSON stringified)
                                    const fileRes = replaceVariables('File: {{User Input.file}}', context)
                                    // Check if it looks like JSON
                                    expect(fileRes).toContain('File: {')
                                    expect(fileRes).toContain('"name": "doc.pdf"')
                                    expect(fileRes).toContain('"url": "http://test"')
                                    console.log('File replacement result:', fileRes) // For manual check in logs

                                    // 4. Nested Object
                                    expect(replaceVariables('Deep: {{User Input.nested.deep.value}}', context)).toBe('Deep: found me')

                                    // 5. List
                                    const listRes = replaceVariables('List: {{User Input.list}}', context)
                                    expect(listRes).toContain('[\n  "a",\n  "b"\n]')

                                    // 6. Missing value (should be empty string)
                                    const missingRes = replaceVariables('Missing: {{User Input.missing}}', context)
                                    expect(missingRes).toBe('Missing: ')
                  })
})
