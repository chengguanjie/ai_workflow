import { describe, it, expect } from 'vitest'

import { getRegisteredProcessorTypes } from '@/lib/workflow/processors'
import { NODE_TYPE_DB_MAP } from '@/lib/workflow/engine/types'
import type { NodeType } from '@/types/workflow'

const CANONICAL_NODE_TYPES: NodeType[] = ['INPUT', 'PROCESS', 'CODE', 'OUTPUT', 'LOGIC', 'GROUP']

// Processor-only node types that exist for runtime routing/backward compatibility.
const ALLOWED_NON_CANONICAL_PROCESSOR_TYPES = ['PROCESS_WITH_TOOLS', 'MERGE'] as const

describe('workflow node type invariants', () => {
  it('processor registry covers all canonical node types', () => {
    const registered = getRegisteredProcessorTypes()
    expect(registered).toEqual(expect.arrayContaining(CANONICAL_NODE_TYPES))
  })

  it('processor registry only contains known types', () => {
    const registered = new Set(getRegisteredProcessorTypes())
    const allowed = new Set<string>([...CANONICAL_NODE_TYPES, ...ALLOWED_NON_CANONICAL_PROCESSOR_TYPES])
    const unknown = Array.from(registered).filter((t) => !allowed.has(t))
    expect(unknown).toEqual([])
  })

  it('every registered processor type has a DB node type mapping', () => {
    const registered = getRegisteredProcessorTypes()
    const unmapped = registered.filter((t) => !(t in NODE_TYPE_DB_MAP))
    expect(unmapped).toEqual([])
  })
})

