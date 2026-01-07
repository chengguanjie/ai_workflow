'use client'

import { useState, useEffect } from 'react'
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
  Code,
  ChevronDown,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

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
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('')

  const [formData, setFormData] = useState({
    name: '',
    expiresIn: 'never',
  })

  // 折叠状态
  const [openSections, setOpenSections] = useState({
    listApi: true,
    executeApi: true,
    fullExample: false,
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
        setTokens(result.data?.tokens || [])
      }

      if (workflowsRes.ok) {
        const data = await workflowsRes.json()
        // workflows API 可能使用不同的响应格式，保持兼容
        const workflows = data.data?.workflows || data.workflows || []
        setWorkflows(workflows)
        if (workflows.length > 0) {
          setSelectedWorkflow(workflows[0].id)
        }
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

  const getListApiEndpoint = () => `${getBaseUrl()}/api/v1/workflows`

  const getExecuteApiEndpoint = () => {
    return `${getBaseUrl()}/api/v1/workflows/${selectedWorkflow || '{workflow_id}'}/execute`
  }

  // 代码示例生成
  const getListCurlExample = () => `curl '${getListApiEndpoint()}' \\
  -H 'Authorization: Bearer YOUR_API_TOKEN'`

  const getListJsExample = () => `const response = await fetch('${getListApiEndpoint()}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN',
  },
});

const { data: workflows } = await response.json();
console.log(workflows);
// 输出: [{ id: "xxx", name: "工作流名称", ... }, ...]`

  const getExecuteCurlExample = () => `curl -X POST '${getExecuteApiEndpoint()}' \\
  -H 'Authorization: Bearer YOUR_API_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "input": {
      "text": "你的输入内容"
    },
    "async": false
  }'`

  const getExecuteJsExample = () => `const response = await fetch('${getExecuteApiEndpoint()}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    input: { text: '你的输入内容' },
    async: false  // 设为 true 可异步执行
  }),
});

const result = await response.json();
console.log(result);`

  const getFullExample = () => `// 完整示例：先获取工作流列表，再执行指定工作流
const TOKEN = 'YOUR_API_TOKEN';
const BASE_URL = '${getBaseUrl()}';

// 1. 获取工作流列表
const listRes = await fetch(\`\${BASE_URL}/api/v1/workflows\`, {
  headers: { 'Authorization': \`Bearer \${TOKEN}\` }
});
const { data: workflows } = await listRes.json();
console.log('工作流列表:', workflows);

// 2. 执行第一个工作流
const workflowId = workflows[0].id;
const execRes = await fetch(\`\${BASE_URL}/api/v1/workflows/\${workflowId}/execute\`, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${TOKEN}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    input: { text: '你好' },
    async: false
  }),
});
const result = await execRes.json();
console.log('执行结果:', result);`

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

      {/* API 1: 获取工作流列表 */}
      <Collapsible
        open={openSections.listApi}
        onOpenChange={(open) => setOpenSections(prev => ({ ...prev, listApi: open }))}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    API 1：获取工作流列表
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    获取当前组织下的所有工作流，用于查询可执行的工作流 ID
                  </CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${openSections.listApi ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <Label>API 端点</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                    GET {getListApiEndpoint()}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(`GET ${getListApiEndpoint()}`)}
                    title="复制"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>cURL 示例</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => copyToClipboard(getListCurlExample())}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    复制代码
                  </Button>
                </div>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap break-all">
{getListCurlExample()}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>JavaScript 示例</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => copyToClipboard(getListJsExample())}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    复制代码
                  </Button>
                </div>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap break-all">
{getListJsExample()}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <Label>响应示例</Label>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap">
{`{
  "success": true,
  "data": [
    {
      "id": "cm5abc123xyz",
      "name": "我的工作流",
      "description": "工作流描述",
      "isActive": true,
      "publishStatus": "PUBLISHED",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* API 2: 执行单个工作流 */}
      <Collapsible
        open={openSections.executeApi}
        onOpenChange={(open) => setOpenSections(prev => ({ ...prev, executeApi: open }))}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    API 2：执行单个工作流
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    执行指定的工作流，获取 AI 处理结果
                  </CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${openSections.executeApi ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {workflows.length > 0 && (
                <div className="space-y-2">
                  <Label>选择工作流（自动填充 ID）</Label>
                  <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="选择工作流" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map(wf => (
                        <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>API 端点</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                    POST {getExecuteApiEndpoint()}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(`POST ${getExecuteApiEndpoint()}`)}
                    title="复制"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>cURL 示例</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => copyToClipboard(getExecuteCurlExample())}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    复制代码
                  </Button>
                </div>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap break-all">
{getExecuteCurlExample()}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>JavaScript 示例</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => copyToClipboard(getExecuteJsExample())}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    复制代码
                  </Button>
                </div>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap break-all">
{getExecuteJsExample()}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <Label>请求参数说明</Label>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">参数</th>
                        <th className="text-left py-2 font-medium">类型</th>
                        <th className="text-left py-2 font-medium">说明</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <tr className="border-b">
                        <td className="py-2">input</td>
                        <td className="py-2 text-muted-foreground">object</td>
                        <td className="py-2 font-sans">传递给工作流的输入变量</td>
                      </tr>
                      <tr>
                        <td className="py-2">async</td>
                        <td className="py-2 text-muted-foreground">boolean</td>
                        <td className="py-2 font-sans">
                          <code className="text-xs bg-background px-1 rounded">false</code> 同步执行，等待结果返回；
                          <code className="text-xs bg-background px-1 rounded">true</code> 异步执行，立即返回 taskId
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <Label>响应示例（同步模式）</Label>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap">
{`{
  "success": true,
  "data": {
    "executionId": "exec_xxx",
    "status": "COMPLETED",
    "output": {
      "result": "AI 处理的结果内容..."
    },
    "duration": 1234,
    "totalTokens": 500,
    "promptTokens": 300,
    "completionTokens": 200
  }
}`}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <Label>响应示例（异步模式）</Label>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap">
{`{
  "success": true,
  "data": {
    "taskId": "task_xxx",
    "status": "pending",
    "message": "任务已加入队列",
    "pollUrl": "/api/v1/tasks/task_xxx"
  }
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 完整示例 */}
      <Collapsible
        open={openSections.fullExample}
        onOpenChange={(open) => setOpenSections(prev => ({ ...prev, fullExample: open }))}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    完整调用示例
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    先获取工作流列表，再执行指定工作流的完整流程
                  </CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${openSections.fullExample ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>JavaScript 完整示例</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => copyToClipboard(getFullExample())}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    复制代码
                  </Button>
                </div>
                <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm font-mono whitespace-pre-wrap break-all">
{getFullExample()}
                  </pre>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
