/**
 * Property-Based Tests for Workflow Store Node Execution Status
 *
 * Feature: node-highlight-sync
 * Property 1: Single Running Node Invariant
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * Property 1: For any workflow execution state, at most one node SHALL have
 * status 'running' at any given time.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useWorkflowStore } from './workflow-store'

// ============================================
// Arbitraries (Generators)
// ============================================

// Node execution status generator
const NODE_EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped', 'paused'] as const
type NodeExecutionStatus = (typeof NODE_EXECUTION_STATUSES)[number]
const nodeExecutionStatusArb: fc.Arbitrary<NodeExecutionStatus> = fc.constantFrom(...NODE_EXECUTION_STATUSES)

// Node ID generator
const nodeIdArb: fc.Arbitrary<string> = fc.stringMatching(/^node_[a-z0-9]{8}$/)

// Status update event generator
interface StatusUpdateEvent {
  nodeId: string
  status: NodeExecutionStatus
  timestamp: number
}

const statusUpdateEventArb: fc.Arbitrary<StatusUpdateEvent> = fc.record({
  nodeId: nodeIdArb,
  status: nodeExecutionStatusArb,
  timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }), // Valid timestamps
})

// Sequence of status update events
const statusUpdateSequenceArb: fc.Arbitrary<StatusUpdateEvent[]> = fc.array(statusUpdateEventArb, {
  minLength: 1,
  maxLength: 50,
})

// Generate a sequence with multiple nodes and running status updates
const multiNodeRunningSequenceArb: fc.Arbitrary<StatusUpdateEvent[]> = fc
  .tuple(
    fc.array(nodeIdArb, { minLength: 2, maxLength: 5 }),
    fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 5, maxLength: 20 })
  )
  .chain(([nodeIds, delays]) => {
    const baseTimestamp = 1700000000000
    return fc.array(
      fc.record({
        nodeId: fc.constantFrom(...nodeIds),
        status: fc.constantFrom('running', 'completed', 'failed') as fc.Arbitrary<NodeExecutionStatus>,
        timestamp: fc.constantFrom(...delays.map((d, i) => baseTimestamp + i * 100 + d)),
      }),
      { minLength: 5, maxLength: 20 }
    )
  })

// ============================================
// Helper Functions
// ============================================

/**
 * Count the number of nodes with 'running' status
 */
function countRunningNodes(nodeExecutionStatus: Record<string, NodeExecutionStatus>): number {
  return Object.values(nodeExecutionStatus).filter(status => status === 'running').length
}

/**
 * Reset the store to initial state
 */
function resetStore(): void {
  const store = useWorkflowStore.getState()
  store.reset()
  // Also clear the new fields
  useWorkflowStore.setState({
    executionManagerActive: false,
    currentRunningNodeId: null,
    statusUpdateTimestamps: {},
    nodeExecutionStatus: {},
  })
}

// ============================================
// Property Tests
// ============================================

describe('Workflow Store Node Execution Status - Property Tests', () => {
  beforeEach(() => {
    resetStore()
  })

  /**
   * Property 1a: At most one node can be running at any time
   *
   * Feature: node-highlight-sync, Property 1: Single Running Node Invariant
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('Property 1a: at most one node can be running at any time after any sequence of updates', () => {
    fc.assert(
      fc.property(multiNodeRunningSequenceArb, (events) => {
        resetStore()
        const store = useWorkflowStore.getState()

        // Apply all status updates
        for (const event of events) {
          store.updateNodeExecutionStatusSafe(event.nodeId, event.status, event.timestamp)

          // Property: After each update, at most one node should be running
          const currentState = useWorkflowStore.getState()
          const runningCount = countRunningNodes(currentState.nodeExecutionStatus)
          expect(runningCount).toBeLessThanOrEqual(1)
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1b: Setting a new node to running clears previous running node
   *
   * Feature: node-highlight-sync, Property 1: Single Running Node Invariant
   * Validates: Requirements 1.2, 1.3
   */
  it('Property 1b: setting a new node to running clears previous running node', () => {
    fc.assert(
      fc.property(
        fc.array(nodeIdArb, { minLength: 2, maxLength: 5 }),
        (nodeIds) => {
          resetStore()
          const store = useWorkflowStore.getState()
          const uniqueNodeIds = [...new Set(nodeIds)]
          
          if (uniqueNodeIds.length < 2) return true

          // Set first node to running
          const firstNodeId = uniqueNodeIds[0]
          store.updateNodeExecutionStatusSafe(firstNodeId, 'running', Date.now())

          let state = useWorkflowStore.getState()
          expect(state.nodeExecutionStatus[firstNodeId]).toBe('running')
          expect(state.currentRunningNodeId).toBe(firstNodeId)

          // Set second node to running
          const secondNodeId = uniqueNodeIds[1]
          store.updateNodeExecutionStatusSafe(secondNodeId, 'running', Date.now() + 1)

          state = useWorkflowStore.getState()
          
          // Property: First node should no longer be running
          expect(state.nodeExecutionStatus[firstNodeId]).toBe('completed')
          
          // Property: Second node should be running
          expect(state.nodeExecutionStatus[secondNodeId]).toBe('running')
          
          // Property: currentRunningNodeId should be updated
          expect(state.currentRunningNodeId).toBe(secondNodeId)
          
          // Property: Only one node should be running
          expect(countRunningNodes(state.nodeExecutionStatus)).toBe(1)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1c: Same status update is idempotent
   *
   * Feature: node-highlight-sync, Property 1: Single Running Node Invariant
   * Validates: Requirements 3.1
   */
  it('Property 1c: applying the same status update twice has no additional effect', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeExecutionStatusArb,
        fc.integer({ min: 1000000000000, max: 2000000000000 }),
        (nodeId, status, timestamp) => {
          resetStore()
          const store = useWorkflowStore.getState()

          // Apply update once
          store.updateNodeExecutionStatusSafe(nodeId, status, timestamp)
          const stateAfterFirst = { ...useWorkflowStore.getState().nodeExecutionStatus }

          // Apply same update again
          store.updateNodeExecutionStatusSafe(nodeId, status, timestamp)
          const stateAfterSecond = useWorkflowStore.getState().nodeExecutionStatus

          // Property: State should be identical
          expect(stateAfterSecond).toEqual(stateAfterFirst)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1d: Terminal states cannot regress to running
   *
   * Feature: node-highlight-sync, Property 1: Single Running Node Invariant
   * Validates: Requirements 3.2
   */
  it('Property 1d: completed or failed nodes cannot be set back to running', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        fc.constantFrom('completed', 'failed') as fc.Arbitrary<'completed' | 'failed'>,
        (nodeId, terminalStatus) => {
          resetStore()
          const store = useWorkflowStore.getState()

          // Set node to terminal status
          store.updateNodeExecutionStatusSafe(nodeId, terminalStatus, Date.now())
          
          let state = useWorkflowStore.getState()
          expect(state.nodeExecutionStatus[nodeId]).toBe(terminalStatus)

          // Try to set back to running
          store.updateNodeExecutionStatusSafe(nodeId, 'running', Date.now() + 1)

          state = useWorkflowStore.getState()
          
          // Property: Node should still be in terminal status
          expect(state.nodeExecutionStatus[nodeId]).toBe(terminalStatus)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1e: Outdated timestamps are ignored
   *
   * Feature: node-highlight-sync, Property 1: Single Running Node Invariant
   * Validates: Requirements 3.2
   */
  it('Property 1e: status updates with older timestamps are ignored', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        nodeExecutionStatusArb,
        nodeExecutionStatusArb.filter(s => s !== 'completed' && s !== 'failed'),
        fc.integer({ min: 1000000000000, max: 1500000000000 }),
        fc.integer({ min: 1500000000001, max: 2000000000000 }),
        (nodeId, oldStatus, newStatus, oldTimestamp, newTimestamp) => {
          if (oldStatus === newStatus) return true
          
          resetStore()
          const store = useWorkflowStore.getState()

          // Apply newer update first
          store.updateNodeExecutionStatusSafe(nodeId, newStatus, newTimestamp)
          
          let state = useWorkflowStore.getState()
          expect(state.nodeExecutionStatus[nodeId]).toBe(newStatus)

          // Try to apply older update
          store.updateNodeExecutionStatusSafe(nodeId, oldStatus, oldTimestamp)

          state = useWorkflowStore.getState()
          
          // Property: Node should still have the newer status
          expect(state.nodeExecutionStatus[nodeId]).toBe(newStatus)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 1f: currentRunningNodeId tracks the running node correctly
   *
   * Feature: node-highlight-sync, Property 1: Single Running Node Invariant
   * Validates: Requirements 1.1
   */
  it('Property 1f: currentRunningNodeId always matches the actual running node', () => {
    fc.assert(
      fc.property(statusUpdateSequenceArb, (events) => {
        resetStore()
        const store = useWorkflowStore.getState()

        for (const event of events) {
          store.updateNodeExecutionStatusSafe(event.nodeId, event.status, event.timestamp)

          const state = useWorkflowStore.getState()
          const runningNodes = Object.entries(state.nodeExecutionStatus)
            .filter(([, status]) => status === 'running')
            .map(([id]) => id)

          if (runningNodes.length === 0) {
            // Property: If no nodes are running, currentRunningNodeId should be null
            expect(state.currentRunningNodeId).toBeNull()
          } else {
            // Property: currentRunningNodeId should match the running node
            expect(runningNodes).toContain(state.currentRunningNodeId)
            expect(runningNodes.length).toBe(1)
          }
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})


// ============================================
// Property 2: Status Update Idempotence and Validity
// ============================================

describe('Workflow Store - Property 2: Status Update Idempotence and Validity', () => {
  /**
   * Property 2: Status Update Idempotence and Validity
   *
   * Feature: node-highlight-sync, Property 2: Status Update Idempotence and Validity
   * Validates: Requirements 3.1, 3.2
   *
   * For any sequence of status updates, applying the same update twice SHALL result
   * in the same state as applying it once, and updates to terminal states (completed, failed)
   * SHALL not regress to running.
   */

  beforeEach(() => {
    resetStore()
  })

  /**
   * Property 2a: Idempotence - applying the same update multiple times yields same result
   *
   * Feature: node-highlight-sync, Property 2: Status Update Idempotence and Validity
   * Validates: Requirements 3.1
   */
  it('Property 2a: status updates are idempotent - multiple applications yield same state', () => {
    fc.assert(
      fc.property(
        fc.array(statusUpdateEventArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        (events, repeatCount) => {
          resetStore()
          const store = useWorkflowStore.getState()

          // Apply all events once
          for (const event of events) {
            store.updateNodeExecutionStatusSafe(event.nodeId, event.status, event.timestamp)
          }
          const stateAfterOnce = {
            nodeExecutionStatus: { ...useWorkflowStore.getState().nodeExecutionStatus },
            currentRunningNodeId: useWorkflowStore.getState().currentRunningNodeId,
          }

          // Apply all events again (repeatCount times)
          for (let i = 0; i < repeatCount; i++) {
            for (const event of events) {
              store.updateNodeExecutionStatusSafe(event.nodeId, event.status, event.timestamp)
            }
          }
          const stateAfterRepeat = {
            nodeExecutionStatus: useWorkflowStore.getState().nodeExecutionStatus,
            currentRunningNodeId: useWorkflowStore.getState().currentRunningNodeId,
          }

          // Property: State should be identical after repeated applications
          expect(stateAfterRepeat.nodeExecutionStatus).toEqual(stateAfterOnce.nodeExecutionStatus)
          expect(stateAfterRepeat.currentRunningNodeId).toBe(stateAfterOnce.currentRunningNodeId)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2b: Terminal state validity - terminal states cannot regress to running
   *
   * Feature: node-highlight-sync, Property 2: Status Update Idempotence and Validity
   * Validates: Requirements 3.2
   */
  it('Property 2b: terminal states (completed/failed) cannot regress to running', () => {
    fc.assert(
      fc.property(
        fc.array(nodeIdArb, { minLength: 1, maxLength: 10 }),
        fc.array(
          fc.record({
            terminalStatus: fc.constantFrom('completed', 'failed') as fc.Arbitrary<'completed' | 'failed'>,
            attemptRunning: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (nodeIds, operations) => {
          resetStore()
          const store = useWorkflowStore.getState()
          const uniqueNodeIds = [...new Set(nodeIds)]
          
          if (uniqueNodeIds.length === 0) return true

          // For each node, set to terminal state then try to set back to running
          uniqueNodeIds.forEach((nodeId, index) => {
            const op = operations[index % operations.length]
            const baseTimestamp = Date.now() + index * 1000

            // Set to terminal state
            store.updateNodeExecutionStatusSafe(nodeId, op.terminalStatus, baseTimestamp)
            
            const stateAfterTerminal = useWorkflowStore.getState()
            expect(stateAfterTerminal.nodeExecutionStatus[nodeId]).toBe(op.terminalStatus)

            if (op.attemptRunning) {
              // Try to set back to running (should be rejected)
              store.updateNodeExecutionStatusSafe(nodeId, 'running', baseTimestamp + 1)
              
              const stateAfterAttempt = useWorkflowStore.getState()
              // Property: Node should still be in terminal state
              expect(stateAfterAttempt.nodeExecutionStatus[nodeId]).toBe(op.terminalStatus)
            }
          })

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2c: Combined idempotence and validity across mixed operations
   *
   * Feature: node-highlight-sync, Property 2: Status Update Idempotence and Validity
   * Validates: Requirements 3.1, 3.2
   */
  it('Property 2c: mixed operations maintain idempotence and terminal state validity', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            nodeId: nodeIdArb,
            initialStatus: fc.constantFrom('pending', 'running') as fc.Arbitrary<'pending' | 'running'>,
            terminalStatus: fc.constantFrom('completed', 'failed') as fc.Arbitrary<'completed' | 'failed'>,
            attemptRevert: fc.boolean(),
          }),
          { minLength: 1, maxLength: 15 }
        ),
        (operations) => {
          resetStore()
          const store = useWorkflowStore.getState()
          const baseTimestamp = Date.now()

          operations.forEach((op, index) => {
            const timestamp = baseTimestamp + index * 100

            // Set initial status
            store.updateNodeExecutionStatusSafe(op.nodeId, op.initialStatus, timestamp)
            
            // Set to terminal status
            store.updateNodeExecutionStatusSafe(op.nodeId, op.terminalStatus, timestamp + 1)
            
            const stateAfterTerminal = useWorkflowStore.getState()
            expect(stateAfterTerminal.nodeExecutionStatus[op.nodeId]).toBe(op.terminalStatus)

            if (op.attemptRevert) {
              // Try to revert to initial status (should be rejected if trying to go back to running)
              store.updateNodeExecutionStatusSafe(op.nodeId, op.initialStatus, timestamp + 2)
              
              const stateAfterRevert = useWorkflowStore.getState()
              
              if (op.initialStatus === 'running') {
                // Property: Cannot revert from terminal to running
                expect(stateAfterRevert.nodeExecutionStatus[op.nodeId]).toBe(op.terminalStatus)
              }
            }

            // Apply same terminal status again (idempotence check)
            store.updateNodeExecutionStatusSafe(op.nodeId, op.terminalStatus, timestamp + 3)
            
            const stateAfterIdempotent = useWorkflowStore.getState()
            // Property: State should remain the same
            expect(stateAfterIdempotent.nodeExecutionStatus[op.nodeId]).toBe(op.terminalStatus)
          })

          // Final check: at most one running node
          const finalState = useWorkflowStore.getState()
          const runningCount = countRunningNodes(finalState.nodeExecutionStatus)
          expect(runningCount).toBeLessThanOrEqual(1)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ============================================
// Property 3: Execution Finalization Consistency
// ============================================

describe('Workflow Store - Property 3: Execution Finalization Consistency', () => {
  /**
   * Property 3: Execution Finalization Consistency
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.1, 4.2, 4.3
   *
   * For any workflow execution that completes (success or failure), no node SHALL
   * remain in 'running' status after finalization.
   */

  beforeEach(() => {
    resetStore()
  })

  /**
   * Property 3a: finalizeExecution(true) clears all running nodes to completed
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.1
   */
  it('Property 3a: finalizeExecution(true) clears all running nodes to completed', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        (nodeId) => {
          resetStore()
          const store = useWorkflowStore.getState()

          // Set a single node to running (guaranteed to work)
          store.updateNodeExecutionStatusSafe(nodeId, 'running', Date.now())

          const stateBeforeFinalize = useWorkflowStore.getState()
          expect(stateBeforeFinalize.nodeExecutionStatus[nodeId]).toBe('running')
          expect(stateBeforeFinalize.currentRunningNodeId).toBe(nodeId)

          // Finalize execution with success
          store.finalizeExecution(true)

          const stateAfterFinalize = useWorkflowStore.getState()
          
          // Property: No nodes should be running after finalization
          const runningCountAfter = countRunningNodes(stateAfterFinalize.nodeExecutionStatus)
          expect(runningCountAfter).toBe(0)
          
          // Property: currentRunningNodeId should be null
          expect(stateAfterFinalize.currentRunningNodeId).toBeNull()
          
          // Property: executionManagerActive should be false
          expect(stateAfterFinalize.executionManagerActive).toBe(false)
          
          // Property: Previously running node should now be completed
          expect(stateAfterFinalize.nodeExecutionStatus[nodeId]).toBe('completed')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3b: finalizeExecution(false) clears all running nodes to failed
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.2
   */
  it('Property 3b: finalizeExecution(false) clears all running nodes to failed', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        (nodeId) => {
          resetStore()
          const store = useWorkflowStore.getState()

          // Set a single node to running (guaranteed to work)
          store.updateNodeExecutionStatusSafe(nodeId, 'running', Date.now())

          const stateBeforeFinalize = useWorkflowStore.getState()
          expect(stateBeforeFinalize.nodeExecutionStatus[nodeId]).toBe('running')
          expect(stateBeforeFinalize.currentRunningNodeId).toBe(nodeId)

          // Finalize execution with failure
          store.finalizeExecution(false)

          const stateAfterFinalize = useWorkflowStore.getState()
          
          // Property: No nodes should be running after finalization
          const runningCountAfter = countRunningNodes(stateAfterFinalize.nodeExecutionStatus)
          expect(runningCountAfter).toBe(0)
          
          // Property: currentRunningNodeId should be null
          expect(stateAfterFinalize.currentRunningNodeId).toBeNull()
          
          // Property: executionManagerActive should be false
          expect(stateAfterFinalize.executionManagerActive).toBe(false)
          
          // Property: Previously running node should now be failed
          expect(stateAfterFinalize.nodeExecutionStatus[nodeId]).toBe('failed')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3c: clearRunningNodes resets all running nodes to pending
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.3
   */
  it('Property 3c: clearRunningNodes resets all running nodes to pending', () => {
    fc.assert(
      fc.property(
        fc.array(nodeIdArb, { minLength: 2, maxLength: 5 }),
        (nodeIds) => {
          resetStore()
          const store = useWorkflowStore.getState()
          const uniqueNodeIds = [...new Set(nodeIds)]
          
          if (uniqueNodeIds.length < 2) return true

          // Set first node to completed (will stay completed)
          const completedNodeId = uniqueNodeIds[0]
          store.updateNodeExecutionStatusSafe(completedNodeId, 'completed', Date.now())
          
          // Set second node to running (will be the only running node)
          const runningNodeId = uniqueNodeIds[1]
          store.updateNodeExecutionStatusSafe(runningNodeId, 'running', Date.now() + 1)

          const stateBeforeClear = useWorkflowStore.getState()
          expect(stateBeforeClear.nodeExecutionStatus[completedNodeId]).toBe('completed')
          expect(stateBeforeClear.nodeExecutionStatus[runningNodeId]).toBe('running')

          // Clear running nodes
          store.clearRunningNodes()

          const stateAfterClear = useWorkflowStore.getState()
          
          // Property: No nodes should be running after clear
          const runningCount = countRunningNodes(stateAfterClear.nodeExecutionStatus)
          expect(runningCount).toBe(0)
          
          // Property: currentRunningNodeId should be null
          expect(stateAfterClear.currentRunningNodeId).toBeNull()
          
          // Property: Previously running node should now be pending
          expect(stateAfterClear.nodeExecutionStatus[runningNodeId]).toBe('pending')
          
          // Property: Completed nodes should remain completed
          expect(stateAfterClear.nodeExecutionStatus[completedNodeId]).toBe('completed')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3d: Finalization is idempotent
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.1, 4.2
   */
  it('Property 3d: calling finalizeExecution multiple times has no additional effect', () => {
    fc.assert(
      fc.property(
        fc.array(nodeIdArb, { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        fc.integer({ min: 1, max: 5 }),
        (nodeIds, success, repeatCount) => {
          resetStore()
          const store = useWorkflowStore.getState()
          const uniqueNodeIds = [...new Set(nodeIds)]
          
          if (uniqueNodeIds.length === 0) return true

          // Set up nodes with running status
          uniqueNodeIds.forEach((nodeId, index) => {
            store.updateNodeExecutionStatusSafe(nodeId, 'running', Date.now() + index)
          })

          // Finalize once
          store.finalizeExecution(success)
          const stateAfterFirst = {
            nodeExecutionStatus: { ...useWorkflowStore.getState().nodeExecutionStatus },
            currentRunningNodeId: useWorkflowStore.getState().currentRunningNodeId,
            executionManagerActive: useWorkflowStore.getState().executionManagerActive,
          }

          // Finalize multiple times
          for (let i = 0; i < repeatCount; i++) {
            store.finalizeExecution(success)
          }
          const stateAfterRepeat = {
            nodeExecutionStatus: useWorkflowStore.getState().nodeExecutionStatus,
            currentRunningNodeId: useWorkflowStore.getState().currentRunningNodeId,
            executionManagerActive: useWorkflowStore.getState().executionManagerActive,
          }

          // Property: State should be identical after repeated finalization
          expect(stateAfterRepeat.nodeExecutionStatus).toEqual(stateAfterFirst.nodeExecutionStatus)
          expect(stateAfterRepeat.currentRunningNodeId).toBe(stateAfterFirst.currentRunningNodeId)
          expect(stateAfterRepeat.executionManagerActive).toBe(stateAfterFirst.executionManagerActive)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3e: Finalization after complex execution sequence
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.1, 4.2, 4.3
   */
  it('Property 3e: finalization works correctly after complex execution sequences', () => {
    fc.assert(
      fc.property(
        multiNodeRunningSequenceArb,
        fc.boolean(),
        (events, success) => {
          resetStore()
          const store = useWorkflowStore.getState()

          // Apply a complex sequence of status updates
          for (const event of events) {
            store.updateNodeExecutionStatusSafe(event.nodeId, event.status, event.timestamp)
          }

          // Finalize execution
          store.finalizeExecution(success)

          const stateAfterFinalize = useWorkflowStore.getState()
          
          // Property: No nodes should be running after finalization
          const runningCount = countRunningNodes(stateAfterFinalize.nodeExecutionStatus)
          expect(runningCount).toBe(0)
          
          // Property: currentRunningNodeId should be null
          expect(stateAfterFinalize.currentRunningNodeId).toBeNull()
          
          // Property: executionManagerActive should be false
          expect(stateAfterFinalize.executionManagerActive).toBe(false)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 3f: setExecutionManagerActive correctly toggles the flag
   *
   * Feature: node-highlight-sync, Property 3: Execution Finalization Consistency
   * Validates: Requirements 4.1, 4.2, 4.3
   */
  it('Property 3f: setExecutionManagerActive correctly toggles the flag', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (toggleSequence) => {
          resetStore()
          const store = useWorkflowStore.getState()

          for (const active of toggleSequence) {
            store.setExecutionManagerActive(active)
            
            const state = useWorkflowStore.getState()
            // Property: executionManagerActive should match the last set value
            expect(state.executionManagerActive).toBe(active)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
