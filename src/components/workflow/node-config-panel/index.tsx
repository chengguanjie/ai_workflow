'use client'

import { useState, useCallback } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { X } from 'lucide-react'

// Import split components
import { InputNodeConfigPanel } from './input-node-config'
import { ProcessNodeConfigPanel } from './process-node-config'
import { CodeNodeConfigPanel } from './code-node-config'
import { OutputNodeConfigPanel } from './output-node-config'
import { ConditionNodeConfigPanel } from './condition-node-config'
import { LoopNodeConfigPanel } from './loop-node-config'
import { 
  DataNodeConfigPanel, 
  ImageNodeConfigPanel, 
  VideoNodeConfigPanel, 
  AudioNodeConfigPanel 
} from './data-node-config'

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, selectNode, updateNode } = useWorkflowStore()
  const [panelWidth, setPanelWidth] = useState(320)

  // 处理配置面板宽度拖拽
  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX // 向左拖变宽
      const newWidth = Math.max(280, Math.min(600, startWidth + deltaX))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  if (!selectedNode) return null

  const nodeData = selectedNode.data as {
    name: string
    type: string
    config?: Record<string, unknown>
  }

  const handleNameChange = (name: string) => {
    updateNode(selectedNodeId!, { name })
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
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'process':
        return (
          <ProcessNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'code':
        return (
          <CodeNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'output':
        return (
          <OutputNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'data':
        return (
          <DataNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'image':
        return (
          <ImageNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'video':
        return (
          <VideoNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'audio':
        return (
          <AudioNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'condition':
        return (
          <ConditionNodeConfigPanel
            config={nodeData.config}
            onUpdate={handleConfigChange}
          />
        )
      case 'loop':
        return (
          <LoopNodeConfigPanel
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
      {/* 左侧拖拽手柄 */}
      <div
        className="w-1 hover:w-1.5 bg-border hover:bg-primary cursor-ew-resize flex-shrink-0 transition-all"
        onMouseDown={handlePanelResizeStart}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between border-b p-4 sticky top-0 bg-background z-10">
          <h3 className="font-medium">节点配置</h3>
          <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>节点名称</Label>
              <Input
                value={nodeData.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* 节点特定配置 */}
          {renderConfigPanel()}
        </div>
      </div>
    </div>
  )
}

// Re-export all sub-components for direct access if needed
export { InputNodeConfigPanel } from './input-node-config'
export { ProcessNodeConfigPanel } from './process-node-config'
export { CodeNodeConfigPanel } from './code-node-config'
export { OutputNodeConfigPanel } from './output-node-config'
export { ConditionNodeConfigPanel } from './condition-node-config'
export { LoopNodeConfigPanel } from './loop-node-config'
export { 
  DataNodeConfigPanel, 
  ImageNodeConfigPanel, 
  VideoNodeConfigPanel, 
  AudioNodeConfigPanel 
} from './data-node-config'
export { MediaNodeConfigPanel } from './media-node-config'
