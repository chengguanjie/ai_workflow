'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, MoreVertical, Play, Edit, Trash2, Loader2, Link2, Copy, Shield, Filter, X, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import { WorkflowPermissionsDialog } from '@/components/workflow/workflow-permissions-dialog'
import { ShareToTemplateDialog } from '@/components/template/share-to-template-dialog'
import { CreateWorkflowDialog } from '@/components/workflow/create-workflow-dialog'

interface Department {
  id: string
  name: string
  level: number
  parentId: string | null
}

interface Creator {
  id: string
  name: string | null
  email: string
}

interface Workflow {
  id: string
  name: string
  description: string | null
  category: string | null
  tags: string[]
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
  creator: {
    id: string
    name: string | null
    email: string
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return '刚刚'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`
  return date.toLocaleDateString('zh-CN')
}

export default function WorkflowsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 筛选状态
  const [filterCreatorId, setFilterCreatorId] = useState<string>('')
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [creators, setCreators] = useState<Creator[]>([])
  const [showFilters, setShowFilters] = useState(false)

  // 权限设置弹窗
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)

  // 分享到模板库弹窗
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [workflowToShare, setWorkflowToShare] = useState<Workflow | null>(null)

  const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN'

  const canManagePermissions = (workflow: Workflow) => {
    return isAdmin || workflow.creator.id === session?.user?.id
  }

  // 获取部门列表
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/departments')
      if (res.ok) {
        const data = await res.json()
        setDepartments(data.departments || [])
      }
    } catch (err) {
      console.error('Failed to load departments:', err)
    }
  }, [])

  // 获取成员列表（用于创建人筛选）
  const fetchCreators = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/members')
      if (res.ok) {
        const data = await res.json()
        const members = data.members || []
        setCreators(members.map((m: { id: string; name: string | null; email: string }) => ({
          id: m.id,
          name: m.name,
          email: m.email,
        })))
      }
    } catch (err) {
      console.error('Failed to load members:', err)
    }
  }, [])

  // 获取工作流列表
  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 构建查询参数
      const params = new URLSearchParams()
      if (filterCreatorId) params.append('creatorId', filterCreatorId)
      if (filterDepartmentId) params.append('departmentId', filterDepartmentId)

      const url = `/api/workflows${params.toString() ? `?${params.toString()}` : ''}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('获取工作流列表失败')
      }
      const result = await response.json()
      setWorkflows(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取工作流列表失败')
    } finally {
      setLoading(false)
    }
  }, [filterCreatorId, filterDepartmentId])

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  useEffect(() => {
    fetchDepartments()
    fetchCreators()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 清除筛选
  const clearFilters = () => {
    setFilterCreatorId('')
    setFilterDepartmentId('')
  }

  const hasActiveFilters = filterCreatorId || filterDepartmentId

  // 删除工作流
  const handleDelete = async () => {
    if (!workflowToDelete) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/workflows/${workflowToDelete.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('删除工作流失败')
      }
      // 重新获取列表
      await fetchWorkflows()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除工作流失败')
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setWorkflowToDelete(null)
    }
  }

  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  )

  // 复制 API 调用链接
  const copyApiUrl = async (workflowId: string, workflowName: string) => {
    const apiUrl = `${window.location.origin}/api/v1/workflows/${workflowId}/execute`
    await navigator.clipboard.writeText(apiUrl)
    toast.success(`已复制「${workflowName}」的 API 链接`)
  }

  // 复制工作流
  const duplicateWorkflow = async (workflowId: string, workflowName: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/duplicate`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('复制工作流失败')
      }
      toast.success(`已复制「${workflowName}」`)
      // 重新获取列表
      await fetchWorkflows()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '复制工作流失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工作流</h1>
          <p className="text-muted-foreground">管理您的 AI 工作流</p>
        </div>
        <div className="flex items-center gap-2">
          <CreateWorkflowDialog />
          <Link href="/workflows/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新建工作流
            </Button>
          </Link>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索工作流..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant={showFilters ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          筛选
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
              {(filterCreatorId ? 1 : 0) + (filterDepartmentId ? 1 : 0)}
            </Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
            <X className="h-4 w-4" />
            清除筛选
          </Button>
        )}
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">创建人:</span>
            <Select
              value={filterCreatorId || '_all'}
              onValueChange={(value) => setFilterCreatorId(value === '_all' ? '' : value)}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                {creators.map((creator) => (
                  <SelectItem key={creator.id} value={creator.id}>
                    {creator.name || creator.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">部门:</span>
            <Select
              value={filterDepartmentId || '_all'}
              onValueChange={(value) => setFilterDepartmentId(value === '_all' ? '' : value)}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-destructive">{error}</p>
            <Button onClick={fetchWorkflows} variant="outline">
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 工作流列表 */}
      {!loading && !error && (
        <>
          {filteredWorkflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="mb-4 text-muted-foreground">
                  {search ? '没有找到匹配的工作流' : '还没有创建工作流'}
                </p>
                <Link href="/workflows/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    创建第一个工作流
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredWorkflows.map((workflow) => (
                <Card key={workflow.id} className="group relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{workflow.name}</CardTitle>
                        <CardDescription>{workflow.description || '暂无描述'}</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 relative z-10">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/workflows/${workflow.id}/run`)}>
                            <Play className="mr-2 h-4 w-4" />
                            执行
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/workflows/${workflow.id}`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyApiUrl(workflow.id, workflow.name)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            复制 API 链接
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateWorkflow(workflow.id, workflow.name)}>
                            <Copy className="mr-2 h-4 w-4" />
                            复制
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setWorkflowToShare(workflow)
                              setShareDialogOpen(true)
                            }}
                          >
                            <Share2 className="mr-2 h-4 w-4" />
                            分享到内部模板库
                          </DropdownMenuItem>
                          {canManagePermissions(workflow) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedWorkflow(workflow)
                                  setPermissionsDialogOpen(true)
                                }}
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                权限设置
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setWorkflowToDelete(workflow)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <Badge variant={workflow.isActive ? 'default' : 'secondary'}>
                          {workflow.isActive ? '已启用' : '已禁用'}
                        </Badge>
                        <span className="text-muted-foreground">
                          更新于: {formatTimeAgo(workflow.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                  <Link
                    href={`/workflows/${workflow.id}`}
                    className="absolute inset-0 z-0"
                  />
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除工作流 &ldquo;{workflowToDelete?.name}&rdquo; 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 权限设置弹窗 */}
      {selectedWorkflow && (
        <WorkflowPermissionsDialog
          workflowId={selectedWorkflow.id}
          workflowName={selectedWorkflow.name}
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
        />
      )}

      {/* 分享到模板库弹窗 */}
      {workflowToShare && (
        <ShareToTemplateDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          workflowId={workflowToShare.id}
          workflowName={workflowToShare.name}
          workflowDescription={workflowToShare.description}
        />
      )}
    </div>
  )
}
