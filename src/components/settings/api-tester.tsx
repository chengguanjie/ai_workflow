'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Copy, Loader2, Send, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  generateExecuteSnippet,
  type SnippetLang,
  type SnippetContext,
} from '@/components/settings/api-snippet-generator'

type TokenOption = { id: string; label: string; token: string }

import {
  clearManualTokenEverywhere,
  loadManualToken,
  loadRememberMode,
  saveManualToken,
  saveRememberMode,
  type RememberMode,
} from '@/components/settings/token-storage'

export function ApiTester(props: {
  baseUrl: string
  tokens: TokenOption[]
  workflows: Array<{ id: string; name: string }>
  initialTokenId?: string
  initialWorkflowId?: string
}) {
  const [tokenId, setTokenId] = useState(props.initialTokenId || props.tokens[0]?.id || '')
  const [manualToken, setManualToken] = useState('')
  const [rememberMode, setRememberMode] = useState<RememberMode>('local')
  const [workflowId, setWorkflowId] = useState(props.initialWorkflowId || props.workflows[0]?.id || '')
  const [lang, setLang] = useState<SnippetLang>('js_fetch')

  const [bodyText, setBodyText] = useState<string>(
    JSON.stringify({ input: { text: '你好' }, async: false }, null, 2)
  )
  const [sending, setSending] = useState(false)
  const [polling, setPolling] = useState(false)
  const [taskId, setTaskId] = useState<string>('')
  const [pollUrl, setPollUrl] = useState<string>('')
  const [responseText, setResponseText] = useState<string>('')
  const [statusLine, setStatusLine] = useState<string>('')

  // Load saved remember mode + token on mount
  useEffect(() => {
    const mode = loadRememberMode()
    setRememberMode(mode)
    const saved = loadManualToken(mode)
    if (saved) setManualToken(saved)
  }, [])

  // Persist remember mode changes
  useEffect(() => {
    saveRememberMode(rememberMode)
    // Ensure storage aligns with current mode
    if (manualToken) saveManualToken(rememberMode, manualToken)
    else saveManualToken('none', '')
  }, [rememberMode])

  // Persist token changes
  useEffect(() => {
    if (manualToken) saveManualToken(rememberMode, manualToken)
    else saveManualToken('none', '')
  }, [manualToken, rememberMode])

  const selectedToken = useMemo(() => props.tokens.find(t => t.id === tokenId) || null, [props.tokens, tokenId])
  const effectiveToken = tokenId === '__manual__' ? manualToken.trim() : (selectedToken?.token || '')

  const ctx = useMemo<SnippetContext>(() => {
    let exampleBody: Record<string, unknown> = { input: { text: '你好' }, async: false }
    try {
      const parsed = JSON.parse(bodyText)
      if (parsed && typeof parsed === 'object') exampleBody = parsed
    } catch {
      // ignore
    }

    return {
      baseUrl: props.baseUrl,
      token: effectiveToken || 'YOUR_API_TOKEN',
      workflowId: workflowId || '{workflow_id}',
      exampleBody,
    }
  }, [props.baseUrl, selectedToken, workflowId, bodyText])

  const executeUrl = `${props.baseUrl}/api/v1/workflows/${workflowId}/execute`

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  const pollUntilDone = async () => {
    if (!taskId || !pollUrl) {
      toast.error('没有可轮询的任务')
      return
    }
    if (!effectiveToken) {
      toast.error('缺少 Token')
      return
    }

    setPolling(true)
    try {
      const maxAttempts = 60 // ~2min at 2s interval
      for (let i = 0; i < maxAttempts; i++) {
        const url = pollUrl.startsWith('http') ? pollUrl : `${props.baseUrl}${pollUrl}`
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
        })
        const text = await res.text()

        setStatusLine(`${res.status} ${res.statusText}`)
        try {
          const json = JSON.parse(text)
          setResponseText(JSON.stringify(json, null, 2))

          const status = json.data?.status || json.status
          if (status === 'completed' || status === 'failed') {
            toast.success('任务已完成')
            return
          }
        } catch {
          setResponseText(text)
        }

        await new Promise(r => setTimeout(r, 2000))
      }
      toast.error('轮询超时（请稍后再试）')
    } catch (e) {
      toast.error('轮询失败')
      setResponseText(String(e))
    } finally {
      setPolling(false)
    }
  }

  const send = async () => {
    if (!effectiveToken) {
      toast.error('请输入或选择可用的 Token（需要完整 token 值）')
      return
    }
    if (!workflowId) {
      toast.error('请选择工作流')
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(bodyText)
    } catch (e) {
      toast.error('请求 JSON 格式不正确')
      return
    }

    setSending(true)
    setStatusLine('')
    setResponseText('')

    try {
      const res = await fetch(executeUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${effectiveToken}`, 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      setStatusLine(`${res.status} ${res.statusText}`)

      const text = await res.text()
      // try format JSON
      try {
        const json = JSON.parse(text)
        setResponseText(JSON.stringify(json, null, 2))
      } catch {
        setResponseText(text)
      }

      if (!res.ok) {
        toast.error('请求失败（见响应）')
      } else {
        const json = JSON.parse(text)
        if (json.data?.taskId) {
          toast.success('异步任务已创建')
          setTaskId(json.data.taskId)
          setPollUrl(json.data.pollUrl)
        } else {
          toast.success('请求成功')
        }
      }
    } catch (e) {
      toast.error('请求异常，请检查网络/权限')
      setResponseText(String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>交互式 API 测试器</CardTitle>
        <CardDescription>
          选择 Token + 工作流，填写 JSON 输入，一键发送请求并查看响应；也可以一键复制为代码片段。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Token</Label>
            <Select value={tokenId} onValueChange={setTokenId}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="选择 Token" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">手动输入 Token…</SelectItem>
                {props.tokens.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tokenId === '__manual__' ? (
            <div className="space-y-2">
              <Label>手动 Token（仅保存在本机浏览器，可选）</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="粘贴完整 Token，例如 wf_xxx..."
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setManualToken('')
                    clearManualTokenEverywhere()
                    toast.success('已清除本机保存的 Token')
                  }}
                  title="清除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Token 记住策略</Label>
                <RadioGroup
                  value={rememberMode}
                  onValueChange={(v) => setRememberMode(v as RememberMode)}
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="remember_none" value="none" />
                    <label htmlFor="remember_none" className="text-sm text-muted-foreground">
                      不保存（刷新后需要重新粘贴）
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="remember_session" value="session" />
                    <label htmlFor="remember_session" className="text-sm text-muted-foreground">
                      仅本次会话记住（sessionStorage）
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="remember_local" value="local" />
                    <label htmlFor="remember_local" className="text-sm text-muted-foreground">
                      记住在本机（localStorage，轻度混淆存储；不要在公共电脑使用）
                    </label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>工作流</Label>
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="选择工作流" />
              </SelectTrigger>
              <SelectContent>
                {props.workflows.map(wf => (
                  <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>复制为代码</Label>
            <Select value={lang} onValueChange={(v) => setLang(v as SnippetLang)}>
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
          <Label>请求 URL</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">{executeUrl}</code>
            <Button variant="outline" size="icon" onClick={() => copy(executeUrl)} title="复制 URL">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>请求 Body (JSON)</Label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(generateExecuteSnippet(lang, ctx))}>
                <Copy className="mr-2 h-4 w-4" />
                复制为代码
              </Button>
              <Button size="sm" onClick={send} disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                发送
              </Button>
            </div>
          </div>
          <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} className="font-mono min-h-[180px]" />
        </div>

        {taskId && pollUrl ? (
          <div className="space-y-2">
            <Label>异步任务</Label>
            <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">taskId:</span> <code className="font-mono">{taskId}</code></div>
              <div><span className="text-muted-foreground">pollUrl:</span> <code className="font-mono">{pollUrl}</code></div>
              <div className="pt-2">
                <Button size="sm" onClick={pollUntilDone} disabled={polling}>
                  {polling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  一键轮询直到完成
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>响应</Label>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => responseText && copy(responseText)} disabled={!responseText}>
              <Copy className="mr-1 h-3 w-3" />
              复制响应
            </Button>
          </div>
          <div className="bg-muted rounded-lg p-4 overflow-x-auto">
            {statusLine ? <div className="text-xs text-muted-foreground mb-2">HTTP {statusLine}</div> : null}
            <pre className="text-sm font-mono whitespace-pre-wrap break-all">{responseText || '（尚未发送）'}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
