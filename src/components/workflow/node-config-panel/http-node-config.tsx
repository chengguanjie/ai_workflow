'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, X, Clock } from 'lucide-react'
import { OutputTabContent } from './shared/output-tab-content'
import { AIGenerateButton } from './shared/ai-generate-button'
import type { HttpMethod, HttpBodyType, HttpAuthType } from '@/types/workflow'

type HttpTabType = 'params' | 'headers' | 'body' | 'auth' | 'output'

interface HttpNodeConfigPanelProps {
  nodeId: string
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
  availableVariables?: Array<{ label: string; value: string }>
}

const HTTP_METHODS: { value: HttpMethod; label: string; color: string }[] = [
  { value: 'GET', label: 'GET', color: 'bg-green-500' },
  { value: 'POST', label: 'POST', color: 'bg-blue-500' },
  { value: 'PUT', label: 'PUT', color: 'bg-yellow-500' },
  { value: 'DELETE', label: 'DELETE', color: 'bg-red-500' },
  { value: 'PATCH', label: 'PATCH', color: 'bg-purple-500' },
]

const BODY_TYPES: { value: HttpBodyType; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'json', label: 'JSON' },
  { value: 'form', label: '表单 (x-www-form-urlencoded)' },
  { value: 'text', label: '纯文本' },
]

const AUTH_TYPES: { value: HttpAuthType; label: string }[] = [
  { value: 'none', label: '无认证' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apikey', label: 'API Key' },
]

export function HttpNodeConfigPanel({
  nodeId,
  config,
  onUpdate,
}: HttpNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<HttpTabType>('params')
  
  const method = (config?.method as HttpMethod) || 'GET'
  const url = (config?.url as string) || ''
  const headers = (config?.headers as Record<string, string>) || {}
  const queryParams = (config?.queryParams as Record<string, string>) || {}
  const body = (config?.body as { type: HttpBodyType; content?: string | Record<string, unknown> }) || { type: 'none' }
  const auth = (config?.auth as { 
    type: HttpAuthType
    username?: string
    password?: string
    token?: string
    apiKey?: { key: string; value: string; addTo: 'header' | 'query' }
  }) || { type: 'none' }
  const timeout = (config?.timeout as number) || 30000
  const retry = (config?.retry as { maxRetries: number; retryDelay: number }) || { maxRetries: 3, retryDelay: 1000 }

  const updateMethod = (m: HttpMethod) => {
    onUpdate({ ...config, method: m })
  }

  const updateUrl = (u: string) => {
    onUpdate({ ...config, url: u })
  }

  const updateHeaders = (h: Record<string, string>) => {
    onUpdate({ ...config, headers: h })
  }

  const updateQueryParams = (q: Record<string, string>) => {
    onUpdate({ ...config, queryParams: q })
  }

  const updateBody = (b: { type: HttpBodyType; content?: string | Record<string, unknown> }) => {
    onUpdate({ ...config, body: b })
  }

  const updateAuth = (a: typeof auth) => {
    onUpdate({ ...config, auth: a })
  }

  const updateTimeout = (t: number) => {
    onUpdate({ ...config, timeout: t })
  }

  const updateRetry = (r: typeof retry) => {
    onUpdate({ ...config, retry: r })
  }

  const addKeyValue = (
    current: Record<string, string>,
    updater: (v: Record<string, string>) => void
  ) => {
    updater({ ...current, '': '' })
  }

  const updateKeyValue = (
    current: Record<string, string>,
    oldKey: string,
    newKey: string,
    newValue: string,
    updater: (v: Record<string, string>) => void
  ) => {
    const updated = { ...current }
    if (oldKey !== newKey) {
      delete updated[oldKey]
    }
    updated[newKey] = newValue
    updater(updated)
  }

  const removeKeyValue = (
    current: Record<string, string>,
    key: string,
    updater: (v: Record<string, string>) => void
  ) => {
    const updated = { ...current }
    delete updated[key]
    updater(updated)
  }

  const renderKeyValueEditor = (
    data: Record<string, string>,
    updater: (v: Record<string, string>) => void,
    keyPlaceholder: string,
    valuePlaceholder: string
  ) => {
    const entries = Object.entries(data)
    
    return (
      <div className="space-y-2">
        {entries.map(([key, value], index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={key}
              onChange={(e) => updateKeyValue(data, key, e.target.value, value, updater)}
              placeholder={keyPlaceholder}
              className="h-8 text-xs flex-1"
            />
            <Input
              value={value}
              onChange={(e) => updateKeyValue(data, key, key, e.target.value, updater)}
              placeholder={valuePlaceholder}
              className="h-8 text-xs flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => removeKeyValue(data, key, updater)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => addKeyValue(data, updater)}
        >
          <Plus className="mr-1 h-3 w-3" />
          添加
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">请求方法与 URL</Label>
        <div className="flex gap-2">
          <Select value={method} onValueChange={(v) => updateMethod(v as HttpMethod)}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${m.color}`} />
                    {m.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={url}
            onChange={(e) => updateUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            className="h-8 text-xs font-mono flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          支持变量替换: {"{{节点名.字段名}}"}
        </p>
      </div>

      <div className="flex border-b">
        {(['params', 'headers', 'body', 'auth', 'output'] as const).map((tab) => (
          <button
            key={tab}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'params' && '参数'}
            {tab === 'headers' && '请求头'}
            {tab === 'body' && '请求体'}
            {tab === 'auth' && '认证'}
            {tab === 'output' && '输出'}
          </button>
        ))}
      </div>

      {activeTab === 'params' && (
        <div className="space-y-2">
          <Label className="text-xs">查询参数</Label>
          {renderKeyValueEditor(queryParams, updateQueryParams, '参数名', '参数值')}
        </div>
      )}

      {activeTab === 'headers' && (
        <div className="space-y-2">
          <Label className="text-xs">请求头</Label>
          {renderKeyValueEditor(headers, updateHeaders, 'Header 名称', 'Header 值')}
        </div>
      )}

      {activeTab === 'body' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">内容类型</Label>
            <Select
              value={body.type}
              onValueChange={(v) => updateBody({ ...body, type: v as HttpBodyType })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BODY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {body.type !== 'none' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {body.type === 'json' && 'JSON 内容'}
                  {body.type === 'form' && '表单数据 (JSON 格式)'}
                  {body.type === 'text' && '文本内容'}
                </Label>
                <AIGenerateButton
                  fieldType="httpBody"
                  currentContent={
                    typeof body.content === 'string'
                      ? body.content
                      : JSON.stringify(body.content || {}, null, 2)
                  }
                  onConfirm={(value) => updateBody({ ...body, content: value })}
                  fieldLabel="请求体"
                />
              </div>
              <Textarea
                value={
                  typeof body.content === 'string'
                    ? body.content
                    : JSON.stringify(body.content || {}, null, 2)
                }
                onChange={(e) => updateBody({ ...body, content: e.target.value })}
                placeholder={
                  body.type === 'json'
                    ? '{\n  "key": "value"\n}'
                    : body.type === 'form'
                    ? '{\n  "field1": "value1",\n  "field2": "value2"\n}'
                    : '输入文本内容...'
                }
                className="font-mono text-xs min-h-[120px]"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'auth' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">认证类型</Label>
            <Select
              value={auth.type}
              onValueChange={(v) => updateAuth({ ...auth, type: v as HttpAuthType })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTH_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {auth.type === 'basic' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">用户名</Label>
                <Input
                  value={auth.username || ''}
                  onChange={(e) => updateAuth({ ...auth, username: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">密码</Label>
                <Input
                  type="password"
                  value={auth.password || ''}
                  onChange={(e) => updateAuth({ ...auth, password: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {auth.type === 'bearer' && (
            <div className="space-y-1">
              <Label className="text-xs">Token</Label>
              <Input
                value={auth.token || ''}
                onChange={(e) => updateAuth({ ...auth, token: e.target.value })}
                placeholder="输入 Bearer Token"
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {auth.type === 'apikey' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Key 名称</Label>
                  <Input
                    value={auth.apiKey?.key || ''}
                    onChange={(e) =>
                      updateAuth({
                        ...auth,
                        apiKey: { ...auth.apiKey!, key: e.target.value },
                      })
                    }
                    placeholder="X-API-Key"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Key 值</Label>
                  <Input
                    value={auth.apiKey?.value || ''}
                    onChange={(e) =>
                      updateAuth({
                        ...auth,
                        apiKey: { ...auth.apiKey!, value: e.target.value },
                      })
                    }
                    placeholder="your-api-key"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">添加到</Label>
                <Select
                  value={auth.apiKey?.addTo || 'header'}
                  onValueChange={(v) =>
                    updateAuth({
                      ...auth,
                      apiKey: { ...auth.apiKey!, addTo: v as 'header' | 'query' },
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header">请求头</SelectItem>
                    <SelectItem value="query">查询参数</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 输出 Tab */}
      {activeTab === 'output' && (
        <OutputTabContent nodeId={nodeId} />
      )}

      {activeTab !== 'output' && (
        <>
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              高级设置
            </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">超时时间 (毫秒)</Label>
            <Input
              type="number"
              value={timeout}
              onChange={(e) => updateTimeout(parseInt(e.target.value) || 30000)}
              min={1000}
              max={300000}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">最大重试次数</Label>
            <Input
              type="number"
              value={retry.maxRetries}
              onChange={(e) =>
                updateRetry({ ...retry, maxRetries: parseInt(e.target.value) || 0 })
              }
              min={0}
              max={10}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">重试延迟 (毫秒)</Label>
          <Input
            type="number"
            value={retry.retryDelay}
            onChange={(e) =>
              updateRetry({ ...retry, retryDelay: parseInt(e.target.value) || 1000 })
            }
            min={100}
            max={60000}
            className="h-8 text-xs"
          />
          <p className="text-xs text-muted-foreground">使用指数退避策略</p>
        </div>
      </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">输出说明</p>
            <div className="p-2 bg-muted rounded text-xs">
              <p><strong>响应数据:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>{"{{节点名.data}}"} - 响应体内容</li>
                <li>{"{{节点名.statusCode}}"} - HTTP 状态码</li>
                <li>{"{{节点名.headers}}"} - 响应头</li>
                <li>{"{{节点名.duration}}"} - 请求耗时 (毫秒)</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
