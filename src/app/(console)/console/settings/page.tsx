'use client'

import { Settings, Server, Database, Mail, Bell } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">系统设置</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              系统信息
            </CardTitle>
            <CardDescription>查看系统运行状态</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">系统版本</span>
                <span>v1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">运行环境</span>
                <span>Production</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">服务状态</span>
                <span className="text-green-600">正常运行</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              数据库
            </CardTitle>
            <CardDescription>数据库连接状态</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">数据库类型</span>
                <span>MySQL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">连接状态</span>
                <span className="text-green-600">已连接</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              邮件服务
            </CardTitle>
            <CardDescription>邮件发送配置</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SMTP服务器</span>
                <span>未配置</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">发送状态</span>
                <span className="text-yellow-600">待配置</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              通知设置
            </CardTitle>
            <CardDescription>系统通知配置</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">新申请通知</span>
                <span>已开启</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">系统告警</span>
                <span>已开启</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
