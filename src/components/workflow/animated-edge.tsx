'use client'

import React, { FC, useMemo } from 'react'
import { getSmoothStepPath, EdgeProps, BaseEdge } from '@xyflow/react'
import { useWorkflowStore } from '@/stores/workflow-store'

export const AnimatedEdge: FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data: _data,
  markerEnd,
  source,
  target,
}) => {
  const { nodeExecutionStatus, connectedEdgeIds, selectedNodeId } = useWorkflowStore()

  // Get the execution status of source and target nodes
  const sourceStatus = nodeExecutionStatus[source] || 'idle'
  const targetStatus = nodeExecutionStatus[target] || 'idle'

  // Determine if this edge is active (source completed/running and target is running/pending)
  const isActive = useMemo(() => {
    return (
      (sourceStatus === 'completed' || sourceStatus === 'running') &&
      (targetStatus === 'running' || targetStatus === 'pending')
    )
  }, [sourceStatus, targetStatus])

  const isSelected = connectedEdgeIds.includes(id)
  const hasSelection = !!selectedNodeId

  const [edgePath, _labelX, _labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20,
  })

  return (
    <>
      {/* Background path for animation */}
      {(isActive || isSelected) && (
        <>
          <defs>
            <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0} />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={edgePath}
            style={{
              strokeWidth: 4,
              stroke: `url(#gradient-${id})`,
              fill: 'none',
              filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.5))',
              opacity: isActive ? 1 : 0.6,
            }}
            className={isActive ? "animate-flow-gradient" : ""}
          />
        </>
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isActive || isSelected ? 2.5 : 1.5,
          stroke: isActive || isSelected ? '#8b5cf6' : '#94a3b8',
          opacity: isActive || isSelected ? 1 : (hasSelection ? 0.2 : 0.8),
          transition: 'all 0.3s ease',
          zIndex: isActive || isSelected ? 10 : 0
        }}
      />
    </>
  )
}

export default AnimatedEdge