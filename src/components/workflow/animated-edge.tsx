'use client'

import React, { FC, useMemo, useId } from 'react'
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
  const uniqueId = useId()
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

  // Check if we're in execution mode (any node is running)
  const isExecutionMode = useMemo(() => {
    return Object.values(nodeExecutionStatus).some(
      status => status === 'running' || status === 'pending'
    )
  }, [nodeExecutionStatus])

  const isSelected = connectedEdgeIds.includes(id)
  const hasSelection = !!selectedNodeId

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20,
  })


  // Generate unique gradient and filter IDs
  const gradientId = `gradient-${uniqueId}-${id}`
  const flowGradientId = `flow-gradient-${uniqueId}-${id}`
  const glowFilterId = `glow-filter-${uniqueId}-${id}`
  const particleGradientId = `particle-gradient-${uniqueId}-${id}`

  return (
    <>
      {/* SVG Definitions */}
      <defs>
        {/* Static gradient for selected/active edges */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.2} />
        </linearGradient>

        {/* Animated flowing gradient for active execution */}
        <linearGradient id={flowGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0}>
            <animate
              attributeName="offset"
              values="-0.5;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}>
            <animate
              attributeName="offset"
              values="0;1.5"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0}>
            <animate
              attributeName="offset"
              values="0.5;2"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>

        {/* Glow filter */}
        <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Particle gradient */}
        <radialGradient id={particleGradientId}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="30%" stopColor="#a78bfa" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Background glow effect for active edges */}
      {isActive && (
        <>
          {/* Outer glow */}
          <path
            d={edgePath}
            style={{
              strokeWidth: 12,
              stroke: '#8b5cf6',
              fill: 'none',
              opacity: 0.2,
              filter: `url(#${glowFilterId})`,
            }}
          />
          {/* Inner glow */}
          <path
            d={edgePath}
            style={{
              strokeWidth: 6,
              stroke: `url(#${flowGradientId})`,
              fill: 'none',
              filter: `url(#${glowFilterId})`,
            }}
          />
        </>
      )}

      {/* Selected edge highlight */}
      {isSelected && !isActive && (
        <path
          d={edgePath}
          style={{
            strokeWidth: 6,
            stroke: `url(#${gradientId})`,
            fill: 'none',
            filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.5))',
          }}
        />
      )}

      {/* Flowing particles effect for active edges */}
      {isActive && (
        <>
          {/* Multiple particles moving along the path */}
          {[0, 0.33, 0.66].map((delay, index) => (
            <circle
              key={index}
              r="4"
              fill={`url(#${particleGradientId})`}
              filter={`url(#${glowFilterId})`}
            >
              <animateMotion
                dur="1.5s"
                repeatCount="indefinite"
                begin={`${delay}s`}
                path={edgePath}
              />
              <animate
                attributeName="r"
                values="3;5;3"
                dur="1.5s"
                repeatCount="indefinite"
                begin={`${delay}s`}
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur="1.5s"
                repeatCount="indefinite"
                begin={`${delay}s`}
                keyTimes="0;0.1;0.9;1"
              />
            </circle>
          ))}

          {/* Additional small sparkles */}
          {[0.15, 0.5, 0.85].map((delay, index) => (
            <circle
              key={`sparkle-${index}`}
              r="2"
              fill="#ffffff"
              opacity={0.8}
            >
              <animateMotion
                dur="1.5s"
                repeatCount="indefinite"
                begin={`${delay}s`}
                path={edgePath}
              />
              <animate
                attributeName="opacity"
                values="0;0.8;0.8;0"
                dur="1.5s"
                repeatCount="indefinite"
                begin={`${delay}s`}
                keyTimes="0;0.1;0.9;1"
              />
            </circle>
          ))}
        </>
      )}

      {/* Dashed flow line for active edges */}
      {isActive && (
        <path
          d={edgePath}
          className="edge-particle-flow"
          style={{
            strokeWidth: 3,
            stroke: '#8b5cf6',
            fill: 'none',
            strokeLinecap: 'round',
          }}
        />
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isActive || isSelected ? 3 : 1.5,
          stroke: isActive ? '#8b5cf6' : isSelected ? '#8b5cf6' : '#94a3b8',
          opacity: isActive ? 1 : isSelected ? 1 : (hasSelection ? 0.15 : (isExecutionMode ? 0.4 : 0.8)),
          transition: 'all 0.3s ease',
        }}
      />
    </>
  )
}

export default AnimatedEdge
