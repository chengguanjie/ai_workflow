import { describe, it, expect } from 'vitest'
import type { ProcessNodeConfig, WorkflowConfig } from '@/types/workflow'
import {
  extractExpectedJsonKeys,
  inferExpectedType,
  validateNodeOutputAgainstPrompt,
  fixInputVariableReferences,
  fixExpectedOutputTypesFromPrompts,
} from './prompt-contract'

function createProcessNode(id: string, name: string, systemPrompt: string, userPrompt: string): ProcessNodeConfig {
  return {
    id,
    type: 'PROCESS',
    name,
    position: { x: 0, y: 0 },
    config: { systemPrompt, userPrompt },
  }
}

describe('prompt-contract', () => {
  it('infers json expected type from prompts', () => {
    expect(inferExpectedType('你是…', '请输出JSON格式：{"a": 1}')).toBe('json')
  })

  it('extracts expected json keys from prompt example', () => {
    expect(extractExpectedJsonKeys('', '请输出JSON：{"a": 1, "b": "x", "nested": {"c": 1}}')).toEqual([
      'a',
      'b',
      'nested',
      'c',
    ])
  })

  it('validates json parse and missing keys', () => {
    const node = createProcessNode('p1', '节点1', '', '请输出JSON格式：{"a": 1, "b": 2}')
    const bad = validateNodeOutputAgainstPrompt(node, { result: 'not json' })
    expect(bad.some(v => v.kind === 'json_parse_error')).toBe(true)

    const missing = validateNodeOutputAgainstPrompt(node, { result: '{"a": 1}' })
    expect(missing.some(v => v.kind === 'json_missing_keys')).toBe(true)
  })

  it('fixes {{输入.*}} variable references using input node name', () => {
    const wf: WorkflowConfig = {
      version: 3,
      nodes: [
        {
          id: 'i1',
          type: 'INPUT',
          name: '输入节点',
          position: { x: 0, y: 0 },
          config: { fields: [{ id: 'f1', name: '标题', value: '' }] },
        },
        createProcessNode('p1', '处理1', '', '标题：{{输入.标题}}'),
      ],
      edges: [{ id: 'e1', source: 'i1', target: 'p1' }],
    }

    const res = fixInputVariableReferences(wf)
    expect(res.changed).toBe(true)
    const node = wf.nodes.find(n => n.id === 'p1') as ProcessNodeConfig
    expect(node.config.userPrompt).toContain('{{输入节点.标题}}')
  })

  it('sets expectedOutputType from inferred prompt type', () => {
    const wf: WorkflowConfig = {
      version: 3,
      nodes: [
        {
          id: 'i1',
          type: 'INPUT',
          name: '输入',
          position: { x: 0, y: 0 },
          config: { fields: [{ id: 'f1', name: 'x', value: '' }] },
        },
        createProcessNode('p1', '处理1', '输出格式要求：Markdown格式', '...'),
        createProcessNode('p2', '处理2', '', '请输出JSON格式：{"a": 1}'),
      ],
      edges: [
        { id: 'e1', source: 'i1', target: 'p1' },
        { id: 'e2', source: 'p1', target: 'p2' },
      ],
    }

    const res = fixExpectedOutputTypesFromPrompts(wf)
    expect(res.changed).toBe(true)
    const p1 = wf.nodes.find(n => n.id === 'p1') as ProcessNodeConfig
    const p2 = wf.nodes.find(n => n.id === 'p2') as ProcessNodeConfig
    expect(p1.config.expectedOutputType).toBe('markdown')
    expect(p2.config.expectedOutputType).toBe('json')
  })
})

