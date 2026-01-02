'use client'

import { useState, useCallback, memo, useRef } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus } from 'lucide-react'
import type { InputField } from '@/types/workflow'

import { InputNodeConfigPanel } from './input-node-config'
import { ProcessNodeConfigPanel } from './process-node-config'
import { LogicNodeConfigPanel } from './logic-node-config'

function NodeConfigPanelInner() {
  const selectedNode = useWorkflowStore((state) =>
    state.nodes.find((n) => n.id === state.selectedNodeId)
  )

  const { selectedNodeId, selectNode, updateNode } = useWorkflowStore(
    useShallow((state) => ({
      selectedNodeId: state.selectedNodeId,
      selectNode: state.selectNode,
      updateNode: state.updateNode,
    }))
  )
  const [panelWidth, setPanelWidth] = useState(576)
  const panelWidthRef = useRef(panelWidth)

  panelWidthRef.current = panelWidth

  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidthRef.current
    let animationFrameId: number | null = null

    const handleMouseMove = (moveEvent: MouseEvent) => {
      try {
        const currentX = moveEvent.clientX

        if (animationFrameId !== null) return

        animationFrameId = requestAnimationFrame(() => {
          try {
            const deltaX = startX - currentX
            const newWidth = Math.max(400, Math.min(900, startWidth + deltaX))
            setPanelWidth(newWidth)
            panelWidthRef.current = newWidth
          } catch (error) {
            console.error('Error during panel resize:', error)
          } finally {
            animationFrameId = null
          }
        })
      } catch (error) {
        console.error('Error in resize mouse move:', error)
      }
    }

    const handleMouseUp = () => {
      try {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      } catch (error) {
        console.error('Error in resize mouse up:', error)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])


  if (!selectedNode) return null

  const nodeData = selectedNode.data as {
    name: string
    type: string
    config?: Record<string, unknown>
  }

  const handleConfigChange = (config: Record<string, unknown>) => {
    updateNode(selectedNodeId!, { config })
  }

  const renderConfigPanel = () => {
    const nodeType = nodeData.type.toLowerCase()

    switch (nodeType) {
      case 'input':
        return (
          <InputNodeConfigPanel
            nodeName={nodeData.name}
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'process':
        return (
          <ProcessNodeConfigPanel
            nodeId={selectedNodeId!}
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'logic':
        return (
          <LogicNodeConfigPanel
            nodeId={selectedNodeId!}
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex border-l bg-background overflow-y-auto" style={{ width: panelWidth }}>
      <div
        className="w-1 hover:w-1.5 bg-border hover:bg-primary cursor-ew-resize flex-shrink-0 transition-all"
        onMouseDown={handlePanelResizeStart}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between border-b p-4 sticky top-0 bg-background z-20">
          <Input
            className="h-8 max-w-xs border-none px-0 text-base font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
            value={nodeData.name}
            onChange={(e) => updateNode(selectedNodeId!, { name: e.target.value })}
            placeholder="输入节点名称"
          />
          <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {nodeData.type.toLowerCase() === 'input' && (
          <div className="flex items-center justify-between p-4 py-3 sticky top-[57px] bg-background z-10 border-b">
            <h4 className="text-sm font-medium">输入字段</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const fields = (nodeData.config?.fields as InputField[]) || []
                const newField: InputField = {
                  id: `field_${Date.now()}`,
                  name: `字段${fields.length + 1}`,
                  value: '',
                  height: 80,
                }
                handleConfigChange({ ...nodeData.config, fields: [...fields, newField] })
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              添加字段
            </Button>
          </div>
        )}

        <div className="space-y-6">
          <div className="px-4 pb-4">
            {renderConfigPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}

export const NodeConfigPanel = memo(NodeConfigPanelInner)

export { InputNodeConfigPanel } from './input-node-config'
export { ProcessNodeConfigPanel } from './process-node-config'
export { LogicNodeConfigPanel } from './logic-node-config'
