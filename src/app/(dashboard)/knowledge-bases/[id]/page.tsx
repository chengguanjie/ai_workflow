'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Upload,
  Search,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Database,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'

interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  embeddingProvider: string
  embeddingModel: string
  chunkSize: number
  chunkOverlap: number
  isActive: boolean
  documentCount: number
  chunkCount: number
  totalSize: number
  createdAt: string
  updatedAt: string
}

interface Document {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  chunkCount: number
  errorMessage: string | null
  createdAt: string
  processedAt: string | null
}

interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

const formatDate = (date: string): string => {
  return new Date(date).toLocaleString('zh-CN')
}

const getStatusIcon = (status: Document['status']) => {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'FAILED':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'PROCESSING':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />
  }
}

const getStatusLabel = (status: Document['status']) => {
  const labels = {
    PENDING: '待处理',
    PROCESSING: '处理中',
    COMPLETED: '已完成',
    FAILED: '失败',
  }
  return labels[status]
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const kbId = params.id as string

  const [kb, setKB] = useState<KnowledgeBase | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 搜索相关
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [topK, setTopK] = useState(5)
  const [threshold, setThreshold] = useState(0.7)

  const fetchKnowledgeBase = useCallback(async () => {
    try {
      const response = await fetch(`/api/knowledge-bases/${kbId}`)
      const data = await response.json()

      if (data.success) {
        setKB(data.data)
      } else {
        toast.error(data.error?.message || '获取知识库失败')
        router.push('/knowledge-bases')
      }
    } catch {
      toast.error('获取知识库失败')
      router.push('/knowledge-bases')
    }
  }, [kbId, router])

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/knowledge-bases/${kbId}/documents`)
      const data = await response.json()

      if (data.success) {
        setDocuments(data.data.documents)
      }
    } catch {
      toast.error('获取文档列表失败')
    } finally {
      setLoading(false)
    }
  }, [kbId])

  useEffect(() => {
    fetchKnowledgeBase()
    fetchDocuments()
  }, [fetchKnowledgeBase, fetchDocuments])

  // 定时刷新处理中的文档
  useEffect(() => {
    const processingDocs = documents.filter(
      (d) => d.status === 'PENDING' || d.status === 'PROCESSING'
    )
    if (processingDocs.length > 0) {
      const interval = setInterval(fetchDocuments, 5000)
      return () => clearInterval(interval)
    }
  }, [documents, fetchDocuments])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    try {
      setUploading(true)

      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`/api/knowledge-bases/${kbId}/documents`, {
          method: 'POST',
          body: formData,
        })
        const data = await response.json()

        if (data.success) {
          toast.success(`${file.name} 上传成功`)
        } else {
          toast.error(`${file.name}: ${data.error?.message || '上传失败'}`)
        }
      }

      fetchDocuments()
      fetchKnowledgeBase()
    } catch {
      toast.error('文件上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteDoc = async () => {
    if (!selectedDoc) return

    try {
      setDeleting(true)
      const response = await fetch(
        `/api/knowledge-bases/${kbId}/documents/${selectedDoc.id}`,
        { method: 'DELETE' }
      )
      const data = await response.json()

      if (data.success) {
        toast.success('文档已删除')
        setDeleteDialogOpen(false)
        setSelectedDoc(null)
        fetchDocuments()
        fetchKnowledgeBase()
      } else {
        toast.error(data.error?.message || '删除失败')
      }
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('请输入搜索内容')
      return
    }

    try {
      setSearching(true)
      const response = await fetch(`/api/knowledge-bases/${kbId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          topK,
          threshold,
        }),
      })
      const data = await response.json()

      if (data.success) {
        setSearchResults(data.data.results)
        if (data.data.results.length === 0) {
          toast.info('未找到相关内容')
        }
      } else {
        toast.error(data.error?.message || '搜索失败')
      }
    } catch {
      toast.error('搜索失败')
    } finally {
      setSearching(false)
    }
  }

  if (!kb) {
    return (
      <div className="container mx-auto py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 返回和标题 */}
      <div className="flex items-center gap-4">
        <Link href="/knowledge-bases">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{kb.name}</h1>
            <Badge variant={kb.isActive ? 'default' : 'secondary'}>
              {kb.isActive ? '已启用' : '已禁用'}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {kb.description || '暂无描述'}
          </p>
        </div>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>文档数量</CardDescription>
            <CardTitle className="text-3xl">{kb.documentCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>分块数量</CardDescription>
            <CardTitle className="text-3xl">{kb.chunkCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>总大小</CardDescription>
            <CardTitle className="text-3xl">{formatBytes(kb.totalSize)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>嵌入模型</CardDescription>
            <CardTitle className="text-lg">{kb.embeddingModel}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* 标签页 */}
      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            文档管理
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            搜索测试
          </TabsTrigger>
        </TabsList>

        {/* 文档管理 */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">文档列表</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={fetchDocuments}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                上传文档
              </Button>
            </div>
          </div>

          {documents.length === 0 ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">暂无文档</h3>
                <p className="text-muted-foreground mb-4">
                  上传文档开始构建知识库
                </p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  上传文档
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>文件名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>分块数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>上传时间</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        {doc.fileName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.fileType}</Badge>
                      </TableCell>
                      <TableCell>{formatBytes(doc.fileSize)}</TableCell>
                      <TableCell>{doc.chunkCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(doc.status)}
                          <span>{getStatusLabel(doc.status)}</span>
                        </div>
                        {doc.errorMessage && (
                          <p className="text-xs text-red-500 mt-1">
                            {doc.errorMessage}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(doc.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            setSelectedDoc(doc)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* 搜索测试 */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>语义搜索</CardTitle>
              <CardDescription>
                测试知识库的语义搜索功能，验证文档检索效果
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>搜索内容</Label>
                <Textarea
                  placeholder="输入要搜索的内容..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>返回数量: {topK}</Label>
                  <Slider
                    value={[topK]}
                    onValueChange={([v]) => setTopK(v)}
                    min={1}
                    max={20}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>相似度阈值: {threshold.toFixed(2)}</Label>
                  <Slider
                    value={[threshold]}
                    onValueChange={([v]) => setThreshold(v)}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
              </div>
              <Button onClick={handleSearch} disabled={searching}>
                {searching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                搜索
              </Button>
            </CardContent>
          </Card>

          {searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>搜索结果</CardTitle>
                <CardDescription>
                  找到 {searchResults.length} 条相关结果
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {searchResults.map((result, index) => (
                  <div
                    key={result.chunkId}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <span className="font-medium">
                          {result.documentName}
                        </span>
                      </div>
                      <Badge>
                        相似度: {(result.score * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {result.content}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除文档 &quot;{selectedDoc?.fileName}&quot; 吗？
              此操作将删除文档的所有分块数据，且无法恢复。
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
              onClick={handleDeleteDoc}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
