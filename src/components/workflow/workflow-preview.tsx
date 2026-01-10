
'use client';

import React, { useMemo, useCallback } from 'react';
import {
                  ReactFlow,
                  Background,
                  Controls,
                  MiniMap,
                  useNodesState,
                  useEdgesState,
                  Node,
                  Edge,
                  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NodeAction } from '@/stores/ai-assistant-store';
import { simulateWorkflowActions } from '@/lib/workflow/preview-simulator';
import { nodeTypes } from '@/components/workflow/nodes';
import AnimatedEdge from '@/components/workflow/animated-edge';
import {
                  Dialog,
                  DialogContent,
                  DialogHeader,
                  DialogTitle,
                  DialogDescription,
                  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, GitCompare } from 'lucide-react';

interface WorkflowPreviewProps {
                  open: boolean;
                  onOpenChange: (open: boolean) => void;
                  currentNodes: Node[];
                  currentEdges: Edge[];
                  actions: NodeAction[];
                  onConfirm: () => void;
                  onCancel: () => void;
}

const edgeTypes = {
                  default: AnimatedEdge,
};

const proOptions = { hideAttribution: true };

function WorkflowPreviewContent({
                  currentNodes,
                  currentEdges,
                  actions,
                  onNodeClick,
}: {
                  currentNodes: Node[];
                  currentEdges: Edge[];
                  actions: NodeAction[];
                  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
}) {
                  const { nodes: previewNodes, edges: previewEdges, summary } = useMemo(() => {
                                    return simulateWorkflowActions(currentNodes, currentEdges, actions);
                  }, [currentNodes, currentEdges, actions]);

                  const [nodes, , onNodesChange] = useNodesState(previewNodes);
                  const [edges, , onEdgesChange] = useEdgesState(previewEdges);

                  return (
                                    <div className="flex flex-col h-full">
                                                      <div className="flex items-center justify-between px-6 py-2 bg-muted/30 border-b">
                                                                        <div className="flex gap-4 text-xs">
                                                                                          <div className="flex items-center gap-1.5">
                                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                                                                                            <span>新增 ({summary.addedNodes})</span>
                                                                                          </div>
                                                                                          <div className="flex items-center gap-1.5">
                                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                                                                                            <span>修改 ({summary.modifiedNodes})</span>
                                                                                          </div>
                                                                                          <div className="flex items-center gap-1.5">
                                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                                                                                            <span>删除 ({summary.removedNodes})</span>
                                                                                          </div>
                                                                                          <div className="flex items-center gap-1.5">
                                                                                                            <div className="w-2.5 h-2.5 rounded-full bg-gray-300 border border-gray-400" />
                                                                                                            <span>无变化</span>
                                                                                          </div>
                                                                        </div>
                                                      </div>

                                                      <div className="flex-1 min-h-[400px] w-full bg-slate-50 relative">
                                                                        <ReactFlow
                                                                                          nodes={nodes}
                                                                                          edges={edges}
                                                                                          nodeTypes={nodeTypes}
                                                                                          edgeTypes={edgeTypes}
                                                                                          onNodesChange={onNodesChange}
                                                                                          onEdgesChange={onEdgesChange}
                                                                                          onNodeClick={onNodeClick}
                                                                                          proOptions={proOptions}
                                                                                          fitView
                                                                                          minZoom={0.1}
                                                                                          maxZoom={2}
                                                                                          nodesDraggable={true} // Allow dragging to inspect
                                                                                          nodesConnectable={false}
                                                                                          elementsSelectable={true}
                                                                        >
                                                                                          <Background color="#ccc" gap={20} />
                                                                                          <Controls />
                                                                                          <MiniMap pannable zoomable />
                                                                        </ReactFlow>
                                                      </div>
                                    </div>
                  );
}

export function WorkflowPreview({
                  open,
                  onOpenChange,
                  currentNodes,
                  currentEdges,
                  actions,
                  onConfirm,
                  onCancel,
                  onRefine,
                  isRefining,
}: WorkflowPreviewProps & {
                  onRefine?: (nodeName: string, requirement: string) => void;
                  isRefining?: boolean;
}) {
                  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null);
                  const [refinementInput, setRefinementInput] = React.useState('');

                  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
                                    setSelectedNode(node);
                                    setRefinementInput('');
                  }, []);

                  const handleRefineSubmit = () => {
                                    if (selectedNode && refinementInput.trim() && onRefine) {
                                                      onRefine(selectedNode.data.name as string, refinementInput);
                                                      setRefinementInput('');
                                    }
                  };

                  return (
                                    <Dialog open={open} onOpenChange={onOpenChange}>
                                                      <DialogContent className="max-w-[90vw] w-[1200px] h-[85vh] flex flex-col p-0 gap-0">
                                                                        <DialogHeader className="px-6 py-4 border-b">
                                                                                          <DialogTitle className="flex items-center gap-2">
                                                                                                            <GitCompare className="h-5 w-5 text-primary" />
                                                                                                            预览修改
                                                                                          </DialogTitle>
                                                                                          <DialogDescription>
                                                                                                            AI 建议对工作流进行以下修改，您可以点击节点进行微调。
                                                                                          </DialogDescription>
                                                                        </DialogHeader>

                                                                        <div className="flex-1 overflow-hidden flex">
                                                                                          <div className="flex-1 relative border-r">
                                                                                                            <ReactFlowProvider>
                                                                                                                              <WorkflowPreviewContent
                                                                                                                                                currentNodes={currentNodes}
                                                                                                                                                currentEdges={currentEdges}
                                                                                                                                                actions={actions}
                                                                                                                                                onNodeClick={onNodeClick}
                                                                                                                              />
                                                                                                            </ReactFlowProvider>
                                                                                          </div>

                                                                                          {/* Right Sidebar for Refinement */}
                                                                                          {selectedNode && (
                                                                                                            <div className="w-80 bg-white p-4 overflow-y-auto shadow-inner flex flex-col gap-4">
                                                                                                                              <div>
                                                                                                                                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                                                                                                                                                  {selectedNode.data.name as string}
                                                                                                                                                                  <Badge variant="outline" className="text-xs">{selectedNode.data.type as string}</Badge>
                                                                                                                                                </h3>
                                                                                                                                                <div className="mt-2 text-sm text-gray-500 space-y-1">
                                                                                                                                                                  <p>Status: <Badge className={
                                                                                                                                                                                    selectedNode.data.previewStatus === 'added' ? 'bg-green-500' :
                                                                                                                                                                                                      selectedNode.data.previewStatus === 'modified' ? 'bg-amber-500' :
                                                                                                                                                                                                                        selectedNode.data.previewStatus === 'removed' ? 'bg-red-500' : 'bg-gray-400'
                                                                                                                                                                  }>{selectedNode.data.previewStatus as string}</Badge></p>
                                                                                                                                                                  <p>ID: <span className="font-mono text-xs">{selectedNode.id}</span></p>
                                                                                                                                                </div>
                                                                                                                              </div>

                                                                                                                              <div className="flex-1">
                                                                                                                                                <h4 className="text-sm font-medium mb-2">配置预览</h4>
                                                                                                                                                <pre className="text-xs bg-gray-50 p-2 rounded border overflow-auto max-h-60">
                                                                                                                                                                  {JSON.stringify(selectedNode.data.config, null, 2)}
                                                                                                                                                </pre>
                                                                                                                              </div>

                                                                                                                              <div className="border-t pt-4">
                                                                                                                                                <h4 className="text-sm font-medium mb-2">AI 微调 (Refine)</h4>
                                                                                                                                                <p className="text-xs text-gray-500 mb-2">对此节点有修改意见？告诉 AI。</p>
                                                                                                                                                <textarea
                                                                                                                                                                  className="w-full text-sm border rounded p-2 min-h-[80px] mb-2"
                                                                                                                                                                  placeholder="例如：把模型换成 GPT-4，或者增加一个输入字段..."
                                                                                                                                                                  value={refinementInput}
                                                                                                                                                                  onChange={(e) => setRefinementInput(e.target.value)}
                                                                                                                                                                  disabled={isRefining}
                                                                                                                                                />
                                                                                                                                                <Button
                                                                                                                                                                  onClick={handleRefineSubmit}
                                                                                                                                                                  disabled={!refinementInput.trim() || isRefining}
                                                                                                                                                                  className="w-full"
                                                                                                                                                                  size="sm"
                                                                                                                                                >
                                                                                                                                                                  {isRefining ? 'AI 正在调整...' : '提交修改'}
                                                                                                                                                </Button>
                                                                                                                              </div>
                                                                                                            </div>
                                                                                          )}
                                                                        </div>

                                                                        <DialogFooter className="px-6 py-4 border-t bg-gray-50/50">
                                                                                          <Button variant="outline" onClick={onCancel}>
                                                                                                            <X className="mr-2 h-4 w-4" />
                                                                                                            取消
                                                                                          </Button>
                                                                                          <Button onClick={onConfirm} className="bg-green-600 hover:bg-green-700">
                                                                                                            <Check className="mr-2 h-4 w-4" />
                                                                                                            确认应用
                                                                                          </Button>
                                                                        </DialogFooter>
                                                      </DialogContent>
                                    </Dialog>
                  );
}
