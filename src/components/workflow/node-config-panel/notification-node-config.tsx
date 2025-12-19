'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Bell, MessageSquare, AtSign, X, Plus, AlertCircle } from 'lucide-react'
import type { NotificationNodeConfigData, NotificationPlatform, NotificationMessageType } from '@/types/workflow'

type NotificationTabType = 'basic' | 'advanced'

interface NotificationNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

const PLATFORM_OPTIONS: { value: NotificationPlatform; label: string; description: string; icon: string }[] = [
  { value: 'feishu', label: '飞书', description: 'Lark/飞书机器人', icon: '🪶' },
  { value: 'dingtalk', label: '钉钉', description: '钉钉群机器人', icon: '💬' },
  { value: 'wecom', label: '企业微信', description: '企业微信机器人', icon: '💼' },
]

const MESSAGE_TYPE_OPTIONS: { value: NotificationMessageType; label: string; description: string }[] = [
  { value: 'text', label: '纯文本', description: '简单文本消息' },
  { value: 'markdown', label: 'Markdown', description: '支持格式化' },
  { value: 'card', label: '卡片消息', description: '富文本卡片' },
]

export function NotificationNodeConfigPanel({
  config,
  onUpdate,
}: NotificationNodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<NotificationTabType>('basic')
  const [newMobile, setNewMobile] = useState('')

  const notificationConfig = (config || {
    platform: 'feishu',
    messageType: 'text',
    content: '',
  }) as unknown as NotificationNodeConfigData

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ ...notificationConfig, [key]: value })
  }

  const addAtMobile = () => {
    if (newMobile.trim()) {
      const mobiles = notificationConfig.atMobiles || []
      if (!mobiles.includes(newMobile.trim())) {
        handleChange('atMobiles', [...mobiles, newMobile.trim()])
      }
      setNewMobile('')
    }
  }

  const removeAtMobile = (mobile: string) => {
    const mobiles = notificationConfig.atMobiles || []
    handleChange('atMobiles', mobiles.filter(m => m !== mobile))
  }

  const selectedPlatform = PLATFORM_OPTIONS.find(p => p.value === notificationConfig.platform)

  // Tab 配置
  const tabs: { key: NotificationTabType; label: string }[] = [
    { key: 'basic', label: '基本配置' },
    { key: 'advanced', label: '高级选项' },
  ]

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 基本配置 Tab */}
      {activeTab === 'basic' && (
        <div className="space-y-4">
          {/* 平台选择 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <Label>通知平台</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORM_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    notificationConfig.platform === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50'
                  }`}
                  onClick={() => handleChange('platform', option.value)}
                >
                  <div className="text-xl mb-1">{option.icon}</div>
                  <div className="font-medium text-sm">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              placeholder={`粘贴${selectedPlatform?.label || ''}机器人的 Webhook 地址...`}
              value={notificationConfig.webhookUrl || ''}
              onChange={(e) => handleChange('webhookUrl', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {notificationConfig.platform === 'feishu' && '在飞书群设置 → 群机器人中获取'}
              {notificationConfig.platform === 'dingtalk' && '在钉钉群设置 → 智能群助手中获取'}
              {notificationConfig.platform === 'wecom' && '在企业微信群设置 → 群机器人中获取'}
            </p>
          </div>

          {/* 消息类型 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <Label>消息类型</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MESSAGE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`p-2 rounded-lg border text-left transition-colors ${
                    notificationConfig.messageType === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50'
                  }`}
                  onClick={() => handleChange('messageType', option.value)}
                >
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 标题（非纯文本时显示） */}
          {notificationConfig.messageType !== 'text' && (
            <div className="space-y-2">
              <Label>消息标题</Label>
              <Input
                placeholder="输入消息标题..."
                value={notificationConfig.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
              />
            </div>
          )}

          {/* 消息内容 */}
          <div className="space-y-2">
            <Label>消息内容</Label>
            <textarea
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y font-mono"
              placeholder={
                notificationConfig.messageType === 'markdown'
                  ? '# 标题\n\n**加粗** _斜体_\n\n- 列表项 1\n- 列表项 2\n\n使用 {{节点名.字段}} 引用变量'
                  : '输入消息内容...\n\n使用 {{节点名.字段}} 引用其他节点的输出'
              }
              value={notificationConfig.content || ''}
              onChange={(e) => handleChange('content', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              支持变量引用，例如：{'{{处理节点.result}}'}, {'{{输入节点.用户名}}'}
            </p>
          </div>
        </div>
      )}

      {/* 高级选项 Tab */}
      {activeTab === 'advanced' && (
        <div className="space-y-4">
          {/* @所有人 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AtSign className="h-4 w-4 text-primary" />
              <div>
                <Label>@ 所有人</Label>
                <p className="text-xs text-muted-foreground">发送时 @ 群内所有成员</p>
              </div>
            </div>
            <Switch
              checked={notificationConfig.atAll || false}
              onCheckedChange={(checked) => handleChange('atAll', checked)}
            />
          </div>

          {/* @ 指定成员 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AtSign className="h-4 w-4 text-primary" />
              <Label>@ 指定成员</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              输入手机号来 @ 指定成员（仅钉钉和企业微信支持）
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="输入手机号..."
                value={newMobile}
                onChange={(e) => setNewMobile(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addAtMobile()
                  }
                }}
              />
              <Button variant="outline" size="icon" onClick={addAtMobile}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* 已添加的手机号列表 */}
            {notificationConfig.atMobiles && notificationConfig.atMobiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {notificationConfig.atMobiles.map((mobile) => (
                  <div
                    key={mobile}
                    className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
                  >
                    <span>{mobile}</span>
                    <button
                      type="button"
                      onClick={() => removeAtMobile(mobile)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 平台特性提示 */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4" />
              平台特性说明
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {notificationConfig.platform === 'feishu' && (
                <>
                  <p>Markdown 消息会以卡片形式发送</p>
                  <p>不支持 @ 指定成员（需使用用户 ID）</p>
                </>
              )}
              {notificationConfig.platform === 'dingtalk' && (
                <>
                  <p>支持所有消息类型</p>
                  <p>@ 成员需使用手机号</p>
                  <p>安全设置中需添加自定义关键词或 IP 白名单</p>
                </>
              )}
              {notificationConfig.platform === 'wecom' && (
                <>
                  <p>Markdown 消息格式略有不同</p>
                  <p>卡片消息使用模板卡片</p>
                  <p>@ 成员需使用手机号</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 配置预览 */}
      {notificationConfig.webhookUrl && notificationConfig.content && (
        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium">
            <Bell className="h-4 w-4" />
            配置预览
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>平台: {selectedPlatform?.label}</div>
            <div>消息类型: {MESSAGE_TYPE_OPTIONS.find(m => m.value === notificationConfig.messageType)?.label}</div>
            {notificationConfig.title && <div>标题: {notificationConfig.title}</div>}
            {notificationConfig.atAll && <div>@ 所有人: 是</div>}
            {notificationConfig.atMobiles && notificationConfig.atMobiles.length > 0 && (
              <div>@ 成员: {notificationConfig.atMobiles.join(', ')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
