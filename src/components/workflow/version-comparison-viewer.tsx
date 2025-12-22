'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  GitCompare,
  Loader2,
  Plus,
  Minus,
  Edit3,
  ChevronDown,
  ChevronRight,
  Link2,
  Settings,
  AlertCircle,
} from 'lucide-react'

interface NodeChange {
  id: string
  name: string
  type: string
  changes?: string[]
}

interface EdgeChange {
  id: string
  source: string
  target: string
}

interface ComparisonData {
  changes: {
    nodes: {
      added: NodeChange[]
      removed: NodeChange[]
      modified: NodeChange[]
    }
    edges: {
      added: EdgeChange[]
      removed: EdgeChange[]
    }
    settings: {
      changed: boolean
      oldValue?: Record<string, unknown>
      newValue?: Record<string, unknown>
    }
  }
  summary: {
    totalChanges: number
    hasChanges: boolean
  }
}

interface VersionComparisonViewerProps {
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NODE_TYPE_LABELS: Record<string, string> = {
  TRIGGER: '触发器',
  INPUT: '输入',
  PROCESS: 'AI 处理',
  CODE: '代码',
  OUTPUT: '输出',
  DATA: '数据',
  IMAGE: '图片',
  VIDEO: '视频',
  AUDIO: '音频',
  CONDITION: '条件',
  LOOP: '循环',
  HTTP: 'HTTP 请求',
  MERGE: '合并',
  IMAGE_GEN: '图片生成',
  NOTIFICATION: '通知',
  SWITCH: '分支',
  GROUP: '分组',
}

export function VersionComparisonViewer({
  workflowId,
  open,
  onOpenChange,
}: VersionComparisonViewerProps) {
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['nodes', 'edges', 'settings'])
  )

  const loadComparison = useCallback(async () => {
    if (!open) return

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/compare`)
      if (!response.ok) {
        throw new Error('加载对比数据失败')
      }
      const result = await response.json()
      setComparison(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [workflowId, open])

  useEffect(() => {
    loadComparison()
  }, [loadComparison])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const getNodeTypeLabel = (type: string) => {
    return NODE_TYPE_LABELS[type] || type
  }

  const renderNodeList = (
    nodes: NodeChange[],
    type: 'added' | 'removed' | 'modified'
  ) => {
    if (nodes.length === 0) return null

    const config = {
      added: {
        icon: Plus,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        label: '新增节点',
      },
      removed: {
        icon: Minus,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: '删除节点',
      },
      modified: {
        icon: Edit3,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        label: '修改节点',
      },
    }[type]

    const Icon = config.icon

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span>{config.label}</span>
          <Badge variant="secondary" className="text-xs">
            {nodes.length}
          </Badge>
        </div>
        <div className="space-y-1 pl-6">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`rounded-md border p-2 ${config.bgColor} ${config.borderColor}`}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {getNodeTypeLabel(node.type)}
                </Badge>
                <span className="text-sm font-medium">{node.name}</span>
              </div>
              {node.changes && node.changes.length > 0 && (
                <ul className="mt-1 text-xs text-muted-foreground">
                  {node.changes.map((change, idx) => (
                    <li key={idx} className="ml-2">
                      • {change}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderEdgeList = (
    edges: EdgeChange[],
    type: 'added' | 'removed'
  ) => {
    if (edges.length === 0) return null

    const config = {
      added: {
        icon: Plus,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        label: '新增连接',
      },
      removed: {
        icon: Minus,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: '删除连接',
      },
    }[type]

    const Icon = config.icon

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span>{config.label}</span>
          <Badge variant="secondary" className="text-xs">
            {edges.length}
          </Badge>
        </div>
        <div className="space-y-1 pl-6">
          {edges.map((edge) => (
            <div
              key={edge.id}
              className={`rounded-md border p-2 text-xs ${config.bgColor} ${config.borderColor}`}
            >
              <span className="font-mono">
                {edge.source} → {edge.target}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const hasNodeChanges =
    comparison &&
    (comparison.changes.nodes.added.length > 0 ||
      comparison.changes.nodes.removed.length > 0 ||
      comparison.changes.nodes.modified.length > 0)

  const hasEdgeChanges =
    comparison &&
    (comparison.changes.edges.added.length > 0 ||
      comparison.changes.edges.removed.length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            版本对比
          </SheetTitle>
          <SheetDescription>
            对比草稿版本与已发布版本的差异
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-140px)]">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={loadComparison}>
                重试
              </Button>
            </div>
          )}

          {comparison && !isLoading && !error && (
            <div className="space-y-4 pr-4">
              {/* Summary */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">变更摘要</span>
                  <Badge
                    variant={comparison.summary.hasChanges ? 'default' : 'secondary'}
                  >
                    {comparison.summary.totalChanges} 项变更
                  </Badge>
                </div>
                {!comparison.summary.hasChanges && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    草稿版本与已发布版本没有差异
                  </p>
                )}
              </div>

              {/* Node Changes */}
              {hasNodeChanges && (
                <Collapsible
                  open={expandedSections.has('nodes')}
                  onOpenChange={() => toggleSection('nodes')}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-2"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('nodes') ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="font-medium">节点变更</span>
                      </div>
                      <Badge variant="outline">
                        {comparison.changes.nodes.added.length +
                          comparison.changes.nodes.removed.length +
                          comparison.changes.nodes.modified.length}
                      </Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pl-4 pt-2">
                    {renderNodeList(comparison.changes.nodes.added, 'added')}
                    {renderNodeList(comparison.changes.nodes.removed, 'removed')}
                    {renderNodeList(comparison.changes.nodes.modified, 'modified')}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Edge Changes */}
              {hasEdgeChanges && (
                <Collapsible
                  open={expandedSections.has('edges')}
                  onOpenChange={() => toggleSection('edges')}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-2"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('edges') ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <Link2 className="h-4 w-4" />
                        <span className="font-medium">连接变更</span>
                      </div>
                      <Badge variant="outline">
                        {comparison.changes.edges.added.length +
                          comparison.changes.edges.removed.length}
                      </Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pl-4 pt-2">
                    {renderEdgeList(comparison.changes.edges.added, 'added')}
                    {renderEdgeList(comparison.changes.edges.removed, 'removed')}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Settings Changes */}
              {comparison.changes.settings.changed && (
                <Collapsible
                  open={expandedSections.has('settings')}
                  onOpenChange={() => toggleSection('settings')}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-2"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('settings') ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <Settings className="h-4 w-4" />
                        <span className="font-medium">设置变更</span>
                      </div>
                      <Badge variant="outline">已更改</Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 pt-2">
                    <div className="space-y-2">
                      {comparison.changes.settings.oldValue && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-2">
                          <div className="text-xs font-medium text-red-600 mb-1">
                            原设置:
                          </div>
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify(
                              comparison.changes.settings.oldValue,
                              null,
                              2
                            )}
                          </pre>
                        </div>
                      )}
                      {comparison.changes.settings.newValue && (
                        <div className="rounded-md border border-green-200 bg-green-50 p-2">
                          <div className="text-xs font-medium text-green-600 mb-1">
                            新设置:
                          </div>
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify(
                              comparison.changes.settings.newValue,
                              null,
                              2
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* No changes message */}
              {!comparison.summary.hasChanges && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <GitCompare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-sm text-muted-foreground">
                    当前草稿与已发布版本完全一致
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
