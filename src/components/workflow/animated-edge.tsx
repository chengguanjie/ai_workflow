'use client'

import React, { FC, useMemo } from 'react'
import { getBezierPath, EdgeProps, BaseEdge } from '@xyflow/react'
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
  const { nodeExecutionStatus } = useWorkflowStore()

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

  const [edgePath, _labelX, _labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      {/* Background path for animation */}
      {isActive && (
        <>
          <defs>
            <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0} />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity={1} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={edgePath}
            style={{
              strokeWidth: 6,
              stroke: `url(#gradient-${id})`,
              fill: 'none',
              filter: 'blur(4px)',
            }}
          >
            <animate
              attributeName="stroke-dasharray"
              values="0 100;20 80;0 100"
              dur="1.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-dashoffset"
              values="0;-100"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </path>
        </>
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isActive ? 2.5 : 1.5,
          stroke: isActive ? '#3b82f6' : '#b1b1b7',
          transition: 'all 0.3s ease',
        }}
      />
    </>
  )
}

export default AnimatedEdge