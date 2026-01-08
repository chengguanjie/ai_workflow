'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSafeParams } from '@/hooks/use-safe-params'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit,
  Database,
  Activity,
  MessageSquare,
  Code,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const DATA_POINT_TYPES = [
  { value: 'NUMBER', label: '数字' },
  { value: 'STRING', label: '文本' },
  { value: 'BOOLEAN', label: '布尔值' },
  { value: 'PERCENTAGE', label: '百分比' },
  { value: 'RATING', label: '评分' },
  { value: 'ARRAY', label: '数组' },
  { value: 'OBJECT', label: '对象' },
]

const DATA_SOURCES = [
  { value: 'NODE_OUTPUT', label: '节点输出', icon: Database, description: '从节点执行结果中提取数据' },
  { value: 'EXECUTION_META', label: '执行元数据', icon: Activity, description: '执行时间、令牌使用量等' },
  { value: 'USER_FEEDBACK', label: '用户反馈', icon: MessageSquare, description: '评分、准确性等反馈数据' },
  { value: 'CUSTOM', label: '自定义', icon: Code, description: '通过代码自定义收集的数据' },
]

const AGGREGATION_TYPES = [
  { value: 'SUM', label: '总和' },
  { value: 'AVG', label: '平均值' },
  { value: 'MIN', label: '最小值' },
  { value: 'MAX', label: '最大值' },
  { value: 'COUNT', label: '计数' },
  { value: 'MEDIAN', label: '中位数' },
  { value: 'PERCENTILE', label: '百分位数' },
]

const VISUALIZATION_TYPES = [
  { value: 'LINE', label: '折线图' },
  { value: 'BAR', label: '柱状图' },
  { value: 'PIE', label: '饼图' },
  { value: 'AREA', label: '面积图' },
  { value: 'SCATTER', label: '散点图' },
  { value: 'HEATMAP', label: '热力图' },
  { value: 'GAUGE', label: '仪表盘' },
  { value: 'TABLE', label: '表格' },
]

interface AnalyticsConfig {
  id: string
  name: string
  label: string
  type: string
  source: string
  sourcePath: string
  nodeId?: string
  nodeName?: string
  isRequired: boolean
  defaultAggregation?: string
  supportedAggregations?: string[]
  defaultVisualization?: string
  supportedVisualizations?: string[]
  unit?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface WorkflowNode {
  id: string
  name: string
  type: string
}

export default function AnalyticsConfigPage() {
  const params = useSafeParams<{ id: string }>()
  const _router = useRouter()
  const workflowId = params.id
  const queryClient = useQueryClient()

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AnalyticsConfig | null>(null)
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([])

  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    type: 'NUMBER',
    source: 'NODE_OUTPUT',
    sourcePath: '',
    nodeId: '',
    nodeName: '',
    isRequired: false,
    defaultAggregation: 'AVG',
    supportedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
    defaultVisualization: 'LINE',
    supportedVisualizations: ['LINE', 'BAR', 'AREA'],
    unit: '',
    isActive: true,
  })

  // 获取工作流节点列表
  useEffect(() => {
    fetch(`/api/workflows/${workflowId}`)
      .then(res => res.json())
      .then(data => {
        if (data.draftConfig?.nodes) {
          const nodes = data.draftConfig.nodes.map((node: WorkflowNode) => ({
            id: node.id,
            name: node.name,
            type: node.type,
          }))
          setWorkflowNodes(nodes)
        }
      })
      .catch(console.error)
  }, [workflowId])

  // 查询分析配置
  const { data: configs = [], isLoading: _isLoading } = useQuery({
    queryKey: ['analytics-config', workflowId],
    queryFn: async () => {
      const res = await fetch(`/api/workflows/${workflowId}/analytics/config`)
      if (!res.ok) throw new Error('加载配置失败')
      const result = await res.json()
      // API 返回格式: { success: true, data: [...] }
      return result.data || []
    },
  })

  // 创建配置
  const createConfigMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/workflows/${workflowId}/analytics/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('创建配置失败')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-config', workflowId] })
      setIsAddDialogOpen(false)
      resetForm()
      toast.success('配置创建成功')
    },
    onError: () => {
      toast.error('创建配置失败')
    },
  })

  // 更新配置
  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const res = await fetch(`/api/workflows/${workflowId}/analytics/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: [{ id, ...data }] }),
      })
      if (!res.ok) throw new Error('更新配置失败')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-config', workflowId] })
      setIsEditDialogOpen(false)
      setEditingConfig(null)
      resetForm()
      toast.success('配置更新成功')
    },
    onError: () => {
      toast.error('更新配置失败')
    },
  })

  // 删除配置
  const deleteConfigMutation = useMutation({
    mutationFn: async (configId: string) => {
      const res = await fetch(
        `/api/workflows/${workflowId}/analytics/config?configId=${configId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('删除配置失败')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-config', workflowId] })
      toast.success('配置删除成功')
    },
    onError: () => {
      toast.error('删除配置失败')
    },
  })

  // 重置表单
  const resetForm = () => {
    setFormData({
      name: '',
      label: '',
      type: 'NUMBER',
      source: 'NODE_OUTPUT',
      sourcePath: '',
      nodeId: '',
      nodeName: '',
      isRequired: false,
      defaultAggregation: 'AVG',
      supportedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
      defaultVisualization: 'LINE',
      supportedVisualizations: ['LINE', 'BAR', 'AREA'],
      unit: '',
      isActive: true,
    })
  }

  // 编辑配置
  const handleEdit = (config: AnalyticsConfig) => {
    setEditingConfig(config)
    setFormData({
      name: config.name,
      label: config.label,
      type: config.type,
      source: config.source,
      sourcePath: config.sourcePath,
      nodeId: config.nodeId || '',
      nodeName: config.nodeName || '',
      isRequired: config.isRequired,
      defaultAggregation: config.defaultAggregation || 'AVG',
      supportedAggregations: config.supportedAggregations || ['SUM', 'AVG', 'MIN', 'MAX'],
      defaultVisualization: config.defaultVisualization || 'LINE',
      supportedVisualizations: config.supportedVisualizations || ['LINE', 'BAR', 'AREA'],
      unit: config.unit || '',
      isActive: config.isActive,
    })
    setIsEditDialogOpen(true)
  }

  // 提交表单
  const handleSubmit = () => {
    if (editingConfig) {
      updateConfigMutation.mutate({ id: editingConfig.id, data: formData })
    } else {
      createConfigMutation.mutate(formData)
    }
  }

  // 切换激活状态
  const toggleActive = async (config: AnalyticsConfig) => {
    updateConfigMutation.mutate({
      id: config.id,
      data: { isActive: !config.isActive },
    })
  }

  // 根据数据源生成示例路径
  const getExamplePath = () => {
    switch (formData.source) {
      case 'NODE_OUTPUT':
        return 'examples: data.score, result.analysis[0].value, $.metadata.rating'
      case 'EXECUTION_META':
        return 'examples: duration, totalTokens, status, successRate'
      case 'USER_FEEDBACK':
        return 'examples: rating, accuracyScore, issueCategories, issueCount'
      default:
        return ''
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/workflows/${workflowId}/analytics`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回分析页面
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">分析配置管理</h1>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加数据点
        </Button>
      </div>

      {/* 数据源说明 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {DATA_SOURCES.map(source => {
          const Icon = source.icon
          return (
            <Card key={source.value}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {source.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{source.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 配置列表 */}
      <Card>
        <CardHeader>
          <CardTitle>已配置的数据点</CardTitle>
          <CardDescription>
            定义要从工作流执行中收集的数据点，支持从节点输出、执行元数据和用户反馈中提取数据
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              尚未配置任何数据点，点击&ldquo;添加数据点&rdquo;开始配置
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>数据源</TableHead>
                  <TableHead>路径</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config: AnalyticsConfig) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-mono text-sm">{config.name}</TableCell>
                    <TableCell>{config.label}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {DATA_POINT_TYPES.find(t => t.value === config.type)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {DATA_SOURCES.find(s => s.value === config.source)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {config.sourcePath}
                      {config.nodeName && (
                        <div className="text-muted-foreground">节点: {config.nodeName}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={config.isActive}
                        onCheckedChange={() => toggleActive(config)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(config)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteConfigMutation.mutate(config.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 添加/编辑对话框 */}
      <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false)
          setIsEditDialogOpen(false)
          setEditingConfig(null)
          resetForm()
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? '编辑数据点' : '添加数据点'}
            </DialogTitle>
            <DialogDescription>
              配置要从工作流执行中收集的数据点
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">数据点名称</Label>
                <Input
                  id="name"
                  placeholder="例如: audio_score"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  用于标识数据点的唯一名称（英文）
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">显示标签</Label>
                <Input
                  id="label"
                  placeholder="例如: 音频评分"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  在界面上显示的友好名称
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">数据类型</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_POINT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">数据源</Label>
                <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_SOURCES.map(source => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.source === 'NODE_OUTPUT' && (
              <div className="space-y-2">
                <Label htmlFor="nodeId">选择节点（可选）</Label>
                <Select
                  value={formData.nodeId}
                  onValueChange={(v) => {
                    const node = workflowNodes.find(n => n.id === v)
                    setFormData({
                      ...formData,
                      nodeId: v,
                      nodeName: node?.name || '',
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择特定节点或留空监听所有节点" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflowNodes.map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name} ({node.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sourcePath">数据路径</Label>
              <Input
                id="sourcePath"
                placeholder={getExamplePath()}
                value={formData.sourcePath}
                onChange={(e) => setFormData({ ...formData, sourcePath: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                使用点分隔路径或 JSONPath 语法提取数据
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">单位（可选）</Label>
                <Input
                  id="unit"
                  placeholder="例如: 分、%、ms"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>默认聚合方式</Label>
                <Select
                  value={formData.defaultAggregation}
                  onValueChange={(v) => setFormData({ ...formData, defaultAggregation: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGGREGATION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>默认可视化</Label>
                <Select
                  value={formData.defaultVisualization}
                  onValueChange={(v) => setFormData({ ...formData, defaultVisualization: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISUALIZATION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isRequired"
                checked={formData.isRequired}
                onCheckedChange={(v) => setFormData({ ...formData, isRequired: v })}
              />
              <Label htmlFor="isRequired">必需数据点</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddDialogOpen(false)
              setIsEditDialogOpen(false)
              setEditingConfig(null)
              resetForm()
            }}>
              取消
            </Button>
            <Button onClick={handleSubmit}>
              {editingConfig ? '更新' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}