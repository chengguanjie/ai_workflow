'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, MoreVertical, Play, Edit, Trash2, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useRouter } from 'next/navigation'

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
  const [search, setSearch] = useState('')
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 获取工作流列表
  const fetchWorkflows = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/workflows')
      if (!response.ok) {
        throw new Error('获取工作流列表失败')
      }
      const data = await response.json()
      setWorkflows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取工作流列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkflows()
  }, [])

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工作流</h1>
          <p className="text-muted-foreground">管理您的 AI 工作流</p>
        </div>
        <Link href="/workflows/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新建工作流
          </Button>
        </Link>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索工作流..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

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
    </div>
  )
}
