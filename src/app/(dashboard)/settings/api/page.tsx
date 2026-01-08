'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  Trash2,
  Copy,
  Check,
  Clock,
  Activity,
  AlertTriangle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  generateExecuteSnippet,
  generateListSnippet,
  type SnippetLang,
} from '@/components/settings/api-snippet-generator'

interface ApiToken {
  id: string
  name: string
  prefix: string
  token?: string // 仅创建时返回
  lastUsedAt: string | null
  expiresAt: string | null
  isActive: boolean
  scopes: string[]
  usageCount: number
  createdAt: string
}

interface Workflow {
  id: string
  name: string
}

export default function ApiPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showTokenDialog, setShowTokenDialog] = useState(false)
  const [newToken, setNewToken] = useState<ApiToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('_list')
  const [selectedTokenId, setSelectedTokenId] = useState<string>('')
  const [apiLang, setApiLang] = useState<SnippetLang>('js_fetch')

  const [formData, setFormData] = useState({
    name: '',
    expiresIn: 'never',
  })


  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [tokensRes, workflowsRes] = await Promise.all([
        fetch('/api/settings/api-tokens'),
        fetch('/api/workflows'),
      ])

      if (tokensRes.ok) {
        const result = await tokensRes.json()
        // ApiResponse.success 返回 { success: true, data: { tokens: [...] } }
        const nextTokens = result.data?.tokens || []
        setTokens(nextTokens)
        if (nextTokens.length > 0) {
          setSelectedTokenId(nextTokens[0].id)
        }
      }

      if (workflowsRes.ok) {
        const data = await workflowsRes.json()
        // workflows API 返回 { success: true, data: [...] } 格式
        const workflows = Array.isArray(data.data) ? data.data : []
        setWorkflows(workflows)
        // 默认保持 _list 模式，用户可以选择具体工作流
      }
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateToken = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入 Token 名称')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const result = await res.json()
      
      if (!res.ok) {
        throw new Error(result.error?.message || '创建失败')
      }

      // ApiResponse.success 返回 { success: true, data: {...} } 结构
      setNewToken(result.data)
      setShowAddDialog(false)
      setShowTokenDialog(true)
      setFormData({ name: '', expiresIn: 'never' })
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteToken = async (id: string) => {
    if (!confirm('确定删除这个 API Token 吗？删除后使用该 Token 的所有调用都将失败。')) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/settings/api-tokens/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('删除失败')
      }

      toast.success('Token 已删除')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(null)
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  const getExpiryStatus = (expiresAt: string | null) => {
    if (!expiresAt) return { status: 'active', label: '永不过期' }
    const expiry = new Date(expiresAt)
    const now = new Date()
    if (expiry < now) return { status: 'expired', label: '已过期' }
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 7) return { status: 'warning', label: `${daysLeft} 天后过期` }
    return { status: 'active', label: formatDistanceToNow(expiry, { locale: zhCN, addSuffix: true }) + '过期' }
  }

  const getBaseUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3000'
    return window.location.origin
  }

  const selectedToken = useMemo(
    () => tokens.find(t => t.id === selectedTokenId) || null,
    [tokens, selectedTokenId]
  )

  const snippetCtx = useMemo(() => {
    return {
      baseUrl: getBaseUrl(),
      token: selectedToken?.token || `${selectedToken?.prefix || 'YOUR_API_TOKEN'}...`,
      workflowId: selectedWorkflow || '{workflow_id}',
      exampleBody: {
        input: { text: '你的输入内容' },
        async: false,
      },
    }
  }, [selectedToken, selectedWorkflow])

  const isListMode = selectedWorkflow === '_list'

  const getCodeExample = () => {
    if (isListMode) {
      return generateListSnippet(apiLang, { baseUrl: snippetCtx.baseUrl, token: snippetCtx.token })
    }
    return generateExecuteSnippet(apiLang, snippetCtx)
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API 调用</h1>
        <p className="text-muted-foreground">
          通过 API Token 让外部程序调用你的工作流
        </p>
      </div>

      {/* 快捷生成：一键复制可运行的调用代码（填充 Token/WorkflowId/BaseUrl） */}
      <Card>
        <CardHeader>
          <CardTitle>快捷调用代码（推荐）</CardTitle>
          <CardDescription>
            选择一个 Token 和工作流后，复制下方代码即可直接在 AI IDE / 脚本里调用，无需再手动拼 URL 或查 ID。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>Token</Label>
              <Select value={selectedTokenId} onValueChange={setSelectedTokenId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="选择 Token" />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.prefix}...)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>工作流</Label>
              <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="选择工作流" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_list" className="text-muted-foreground">
                    获取工作流列表
                  </SelectItem>
                  {workflows.length > 0 && (
                    <div className="my-1 h-px bg-border" />
                  )}
                  {workflows.map(wf => (
                    <SelectItem key={wf.id} value={wf.id}>
                      {wf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>语言</Label>
              <Select value={apiLang} onValueChange={(v) => setApiLang(v as SnippetLang)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="js_fetch">JavaScript (fetch)</SelectItem>
                  <SelectItem value="node_axios">Node.js (axios)</SelectItem>
                  <SelectItem value="python_requests">Python (requests)</SelectItem>
                  <SelectItem value="curl">cURL</SelectItem>
                  <SelectItem value="go">Go</SelectItem>
                  <SelectItem value="java">Java</SelectItem>
                  <SelectItem value="php">PHP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{isListMode ? '一键复制：获取工作流列表' : '一键复制：执行工作流'}</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copyToClipboard(getCodeExample())}>
                <Copy className="mr-1 h-3 w-3" />
                复制代码
              </Button>
            </div>
            <div className="bg-muted rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm font-mono whitespace-pre-wrap break-all">{getCodeExample()}</pre>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Token 列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">API Tokens</h2>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建 Token
          </Button>
        </div>

        {tokens.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <p className="text-muted-foreground mb-4">尚未创建任何 API Token</p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                创建第一个 Token
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => {
              const expiry = getExpiryStatus(token.expiresAt)
              return (
                <Card key={token.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{token.name}</span>
                          <Badge variant={token.isActive ? 'default' : 'secondary'}>
                            {token.isActive ? '启用' : '禁用'}
                          </Badge>
                          <Badge
                            variant={
                              expiry.status === 'expired' ? 'destructive' :
                              expiry.status === 'warning' ? 'outline' :
                              'secondary'
                            }
                          >
                            {expiry.status === 'warning' && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {expiry.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <code className="bg-muted px-2 py-0.5 rounded">{token.prefix}...</code>
                          <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {token.usageCount} 次调用
                          </span>
                          {token.lastUsedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(token.lastUsedAt), {
                                locale: zhCN,
                                addSuffix: true
                              })}使用
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteToken(token.id)}
                        disabled={deleting === token.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {deleting === token.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* 创建 Token 对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建 API Token</DialogTitle>
            <DialogDescription>
              创建一个新的 API Token 用于调用工作流
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Token 名称</Label>
              <Input
                placeholder="例如：生产环境、测试脚本"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>有效期</Label>
              <Select
                value={formData.expiresIn}
                onValueChange={value => setFormData(prev => ({ ...prev, expiresIn: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">永不过期</SelectItem>
                  <SelectItem value="7d">7 天</SelectItem>
                  <SelectItem value="30d">30 天</SelectItem>
                  <SelectItem value="90d">90 天</SelectItem>
                  <SelectItem value="1y">1 年</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateToken} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 显示新创建的 Token */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token 创建成功</DialogTitle>
            <DialogDescription>
              <span className="text-destructive font-medium">
                请立即复制此 Token，它只会显示一次！
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>API Token</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                  {newToken?.token}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newToken?.token && copyToClipboard(newToken.token)}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg text-sm">
              <p className="font-medium">安全提示</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>此 Token 只会显示一次，请妥善保存</li>
                <li>不要在公开代码或日志中暴露 Token</li>
                <li>如果 Token 泄露，请立即删除并重新创建</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowTokenDialog(false)}>
              我已保存 Token
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
