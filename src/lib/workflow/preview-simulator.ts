
import { Node, Edge } from '@xyflow/react';
import { NodeAction } from '@/stores/ai-assistant-store';


export interface PreviewResult {
                  nodes: Node[];
                  edges: Edge[];
                  summary: {
                                    addedNodes: number;
                                    removedNodes: number;
                                    modifiedNodes: number;
                                    addedEdges: number;
                                    removedEdges: number;
                  };
}

/**
 * Get simplified default config for preview purposes
 */
function getDefaultConfig(type: string): Record<string, unknown> {
                  const t = type.toUpperCase();
                  switch (t) {
                                    case 'TRIGGER': return { triggerType: 'MANUAL', enabled: true };
                                    case 'INPUT': return { fields: [] };
                                    case 'PROCESS': return { systemPrompt: '', userPrompt: '', temperature: 0.7 };
                                    case 'CODE': return { prompt: '', language: 'javascript', code: '' };
                                    case 'OUTPUT': return { prompt: '', format: 'text' };
                                    default: return {};
                  }
}

/**
 * Simulate the application of AI actions to generate a preview state
 * with visual diff indicators (added/modified/removed status).
 */
export function simulateWorkflowActions(
                  currentNodes: Node[],
                  currentEdges: Edge[],
                  actions: NodeAction[]
): PreviewResult {
                  // Deep clone to avoid mutating original state
                  const nodes: Node[] = JSON.parse(JSON.stringify(currentNodes));
                  const edges: Edge[] = JSON.parse(JSON.stringify(currentEdges));

                  // Initialize previewStatus for existing nodes
                  nodes.forEach(n => {
                                    if (!n.data) n.data = { name: '', type: '' };
                                    n.data.previewStatus = 'unchanged';
                  });

                  const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));
                  const nameToIdMap = new Map<string, string>();

                  // Build initial name map
                  nodes.forEach(n => {
                                    if (n.data && typeof n.data.name === 'string') {
                                                      nameToIdMap.set(n.data.name, n.id);
                                    }
                  });

                  const summary = {
                                    addedNodes: 0,
                                    removedNodes: 0,
                                    modifiedNodes: 0,
                                    addedEdges: 0,
                                    removedEdges: 0,
                  };

                  // Process actions
                  actions.forEach(action => {
                                    switch (action.action) {
                                                      case 'add': {
                                                                        const type = action.nodeType || 'process';
                                                                        const name = action.nodeName || `New ${type}`;

                                                                        // Generate temporary ID for preview
                                                                        const id = `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

                                                                        const newNode: Node = {
                                                                                          id,
                                                                                          type: type.toUpperCase(),
                                                                                          position: action.position || { x: 0, y: 0 }, // If no position, will overlap or requires layout
                                                                                          data: {
                                                                                                            name,
                                                                                                            type: type.toUpperCase(),
                                                                                                            config: action.config || getDefaultConfig(type),
                                                                                                            previewStatus: 'added',
                                                                                          },
                                                                        };

                                                                        // Attempt to place new node intelligently if no position
                                                                        // For preview, we might just stack them or place them at (100, 100) offset from last node
                                                                        if (!action.position && nodes.length > 0) {
                                                                                          const lastNode = nodes[nodes.length - 1];
                                                                                          newNode.position = {
                                                                                                            x: lastNode.position.x + 50,
                                                                                                            y: lastNode.position.y + 100
                                                                                          };
                                                                        } else if (!action.position) {
                                                                                          newNode.position = { x: 100, y: 100 };
                                                                        }

                                                                        nodes.push(newNode);
                                                                        nodeMap.set(id, newNode);
                                                                        nameToIdMap.set(name, id);
                                                                        summary.addedNodes++;
                                                                        break;
                                                      }

                                                      case 'update': {
                                                                        if (!action.nodeName) break;
                                                                        const id = nameToIdMap.get(action.nodeName);
                                                                        if (id) {
                                                                                          const node = nodeMap.get(id);
                                                                                          if (node) {
                                                                                                            node.data.config = {
                                                                                                                              ...(node.data.config as Record<string, unknown>),
                                                                                                                              ...(action.config || {}),
                                                                                                            };
                                                                                                            // Only mark as modified if not already added/removed
                                                                                                            if (node.data.previewStatus === 'unchanged') {
                                                                                                                              node.data.previewStatus = 'modified';
                                                                                                                              summary.modifiedNodes++;
                                                                                                            }
                                                                                          }
                                                                        }
                                                                        break;
                                                      }

                                                      case 'delete': {
                                                                        if (!action.nodeName) break;
                                                                        const id = nameToIdMap.get(action.nodeName);
                                                                        if (id) {
                                                                                          const node = nodeMap.get(id);
                                                                                          if (node) {
                                                                                                            // We DON'T remove it from the array, we mark it
                                                                                                            node.data.previewStatus = 'removed';
                                                                                                            // Also mark connected edges as removed?
                                                                                                            // Visual preference: maybe just fade the node.
                                                                                                            summary.removedNodes++;
                                                                                          }
                                                                        }
                                                                        break;
                                                      }

                                                      case 'connect': {
                                                                        if (!action.source || !action.target) break;
                                                                        const sourceId = nameToIdMap.get(action.source);
                                                                        const targetId = nameToIdMap.get(action.target);

                                                                        if (sourceId && targetId) {
                                                                                          // Check if edge exists
                                                                                          const exists = edges.some(e => e.source === sourceId && e.target === targetId);
                                                                                          if (!exists) {
                                                                                                            const newEdge: Edge = {
                                                                                                                              id: `edge_${sourceId}_${targetId}_${Date.now()}`,
                                                                                                                              source: sourceId,
                                                                                                                              target: targetId,
                                                                                                                              type: 'default',
                                                                                                                              style: { stroke: '#22c55e', strokeWidth: 3 }, // Green edge for added
                                                                                                                              animated: true,
                                                                                                            };
                                                                                                            edges.push(newEdge);
                                                                                                            summary.addedEdges++;
                                                                                          }
                                                                        }
                                                                        break;
                                                      }
                                    }
                  });

                  return { nodes, edges, summary };
}
