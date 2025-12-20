'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  Database,
  FileText,
  Settings,
  Trash2,
  MoreHorizontal,
  Upload,
  ChevronRight,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { KnowledgeBasePermissionsDialog } from '@/components/knowledge-base/knowledge-base-permissions-dialog'

interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  embeddingProvider: string
  embeddingModel: string
  isActive: boolean
  documentCount: number
  chunkCount: number
  totalSize: number
  createdAt: string
  updatedAt: string
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export default function KnowledgeBasesPage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [newKB, setNewKB] = useState({
    name: '',
    description: '',
    embeddingProvider: 'SHENSUAN',
    embeddingModel: 'text-embedding-3-large',
  })

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/knowledge-bases')
      const data = await response.json()

      if (data.success) {
        setKnowledgeBases(data.data.knowledgeBases)
      } else {
        toast.error(data.error?.message || '获取知识库列表失败')
      }
    } catch {
      toast.error('获取知识库列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKnowledgeBases()
  }, [fetchKnowledgeBases])

  const handleCreate = async () => {
    if (!newKB.name.trim()) {
      toast.error('请输入知识库名称')
      return
    }

    try {
      setCreating(true)
      const response = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKB),
      })
      const data = await response.json()

      if (data.success) {
        toast.success('知识库创建成功')
        setCreateDialogOpen(false)
        setNewKB({
          name: '',
          description: '',
          embeddingProvider: 'SHENSUAN',
          embeddingModel: 'text-embedding-3-large',
        })
        fetchKnowledgeBases()
      } else {
        toast.error(data.error?.message || '创建失败')
      }
    } catch {
      toast.error('创建失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedKB) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/knowledge-bases/${selectedKB.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (data.success) {
        toast.success('知识库已删除')
        setDeleteDialogOpen(false)
        setSelectedKB(null)
        fetchKnowledgeBases()
      } else {
        toast.error(data.error?.message || '删除失败')
      }
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const filteredKBs = knowledgeBases.filter(
    (kb) =>
      kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kb.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">知识库</h1>
          <p className="text-muted-foreground">
            管理你的知识库，上传文档进行向量化存储
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新建知识库
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="icon" onClick={fetchKnowledgeBases}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 知识库列表 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-5 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredKBs.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? '未找到匹配的知识库' : '暂无知识库'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? '尝试其他搜索词'
                : '创建你的第一个知识库，开始构建 RAG 应用'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新建知识库
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredKBs.map((kb) => (
            <Card key={kb.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{kb.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/knowledge-bases/${kb.id}`}>
                          <Settings className="h-4 w-4 mr-2" />
                          管理
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/knowledge-bases/${kb.id}/upload`}>
                          <Upload className="h-4 w-4 mr-2" />
                          上传文档
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedKB(kb)
                          setPermissionsDialogOpen(true)
                        }}
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        权限设置
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setSelectedKB(kb)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardDescription className="line-clamp-2">
                  {kb.description || '暂无描述'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{kb.documentCount} 文档</span>
                  </div>
                  <div className="text-muted-foreground">
                    {kb.chunkCount} 分块
                  </div>
                  <div className="text-muted-foreground">
                    {formatBytes(kb.totalSize)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant={kb.isActive ? 'default' : 'secondary'}>
                    {kb.isActive ? '已启用' : '已禁用'}
                  </Badge>
                  <Link href={`/knowledge-bases/${kb.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1">
                      查看详情
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 创建对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
            <DialogDescription>
              创建一个新的知识库来存储和检索文档
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">名称 *</Label>
              <Input
                id="name"
                placeholder="输入知识库名称"
                value={newKB.name}
                onChange={(e) =>
                  setNewKB((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                placeholder="输入知识库描述（可选）"
                value={newKB.description}
                onChange={(e) =>
                  setNewKB((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>嵌入模型提供商</Label>
              <Select
                value={newKB.embeddingProvider}
                onValueChange={(value) =>
                  setNewKB((prev) => ({ ...prev, embeddingProvider: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPENAI">OpenAI</SelectItem>
                  <SelectItem value="SHENSUAN">胜算云</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>嵌入模型</Label>
              <Select
                value={newKB.embeddingModel}
                onValueChange={(value) =>
                  setNewKB((prev) => ({ ...prev, embeddingModel: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text-embedding-3-large">
                    text-embedding-3-large (推荐)
                  </SelectItem>
                  <SelectItem value="text-embedding-3-small">
                    text-embedding-3-small
                  </SelectItem>
                  <SelectItem value="text-embedding-ada-002">
                    text-embedding-ada-002
                  </SelectItem>
                  <SelectItem value="bytedance/doubao-embedding-large">
                    doubao-embedding-large (豆包)
                  </SelectItem>
                  <SelectItem value="BAAI/bge-m3">
                    bge-m3 (BAAI)
                  </SelectItem>
                  <SelectItem value="BAAI/bge-large-zh-v1.5">
                    bge-large-zh-v1.5 (中文)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                如需使用其他模型，请确保已在 AI 配置中添加对应服务商
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除知识库 &quot;{selectedKB?.name}&quot; 吗？
              此操作将删除所有相关文档和向量数据，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 权限设置对话框 */}
      {selectedKB && (
        <KnowledgeBasePermissionsDialog
          knowledgeBaseId={selectedKB.id}
          knowledgeBaseName={selectedKB.name}
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
        />
      )}
    </div>
  )
}
