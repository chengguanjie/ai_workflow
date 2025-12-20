'use client'

import { useEffect, useState } from 'react'
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
  admin: {
    id: string
    email: string
    name: string | null
  }
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface Filters {
  actions: string[]
  resources: string[]
  admins: { id: string; email: string; name: string | null }[]
}

const actionLabels: Record<string, string> = {
  CREATE_ORG: '创建企业',
  UPDATE_ORG: '更新企业',
  DELETE_ORG: '删除企业',
  DISABLE_ORG: '禁用企业',
  ENABLE_ORG: '启用企业',
  CREATE_ADMIN: '创建管理员',
  UPDATE_ADMIN: '更新管理员',
  DELETE_ADMIN: '删除管理员',
  APPROVE_APPLICATION: '审批通过申请',
  REJECT_APPLICATION: '拒绝申请',
  LOGIN: '登录',
  LOGOUT: '登出',
}

const resourceLabels: Record<string, string> = {
  organization: '企业',
  admin: '管理员',
  application: '申请',
  user: '用户',
  plan: '套餐',
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  DISABLE: 'bg-orange-100 text-orange-700',
  ENABLE: 'bg-green-100 text-green-700',
  APPROVE: 'bg-green-100 text-green-700',
  REJECT: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-gray-100 text-gray-700',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [filters, setFilters] = useState<Filters>({
    actions: [],
    resources: [],
    admins: [],
  })
  const [loading, setLoading] = useState(true)

  // 筛选条件
  const [selectedAction, setSelectedAction] = useState<string>('')
  const [selectedResource, setSelectedResource] = useState<string>('')
  const [selectedAdmin, setSelectedAdmin] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  useEffect(() => {
    fetchLogs()
  }, [pagination.page, selectedAction, selectedResource, selectedAdmin, startDate, endDate])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('page', pagination.page.toString())
      params.set('pageSize', pagination.pageSize.toString())

      if (selectedAction) params.set('action', selectedAction)
      if (selectedResource) params.set('resource', selectedResource)
      if (selectedAdmin) params.set('adminId', selectedAdmin)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/console/audit-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setPagination(data.pagination)
        setFilters(data.filters)
      }
    } catch (error) {
      console.error('获取审计日志失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    const prefix = action.split('_')[0]
    return actionColors[prefix] || 'bg-gray-100 text-gray-700'
  }

  const formatDetail = (detail: Record<string, unknown> | null) => {
    if (!detail) return '-'
    return JSON.stringify(detail, null, 2)
  }

  const clearFilters = () => {
    setSelectedAction('')
    setSelectedResource('')
    setSelectedAdmin('')
    setStartDate('')
    setEndDate('')
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审计日志</h1>
      </div>

      {/* 筛选条件 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={selectedAction || 'all'} onValueChange={(v) => {
              setSelectedAction(v === 'all' ? '' : v)
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="操作类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部操作</SelectItem>
                {filters.actions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {actionLabels[action] || action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedResource || 'all'} onValueChange={(v) => {
              setSelectedResource(v === 'all' ? '' : v)
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="资源类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部资源</SelectItem>
                {filters.resources.map((resource) => (
                  <SelectItem key={resource} value={resource}>
                    {resourceLabels[resource] || resource}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedAdmin || 'all'} onValueChange={(v) => {
              setSelectedAdmin(v === 'all' ? '' : v)
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="操作人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部操作人</SelectItem>
                {filters.admins.map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>
                    {admin.name || admin.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPagination((prev) => ({ ...prev, page: 1 }))
                }}
                className="w-[140px]"
              />
              <span className="text-muted-foreground">至</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPagination((prev) => ({ ...prev, page: 1 }))
                }}
                className="w-[140px]"
              />
            </div>

            {(selectedAction || selectedResource || selectedAdmin || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 日志列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            操作记录
            <span className="text-sm font-normal text-muted-foreground">
              (共 {pagination.total} 条)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">加载中...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">暂无审计日志</div>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border p-4 hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${getActionColor(
                            log.action
                          )}`}
                        >
                          {actionLabels[log.action] || log.action}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {resourceLabels[log.resource] || log.resource}
                          {log.resourceId && ` #${log.resourceId.slice(0, 8)}`}
                        </span>
                      </div>
                      <p className="text-sm">
                        操作人: {log.admin.name || log.admin.email}
                      </p>
                      {log.detail && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">
                            查看详情
                          </summary>
                          <pre className="mt-2 overflow-auto rounded bg-muted p-2">
                            {formatDetail(log.detail)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{new Date(log.createdAt).toLocaleString()}</p>
                      {log.ip && <p className="text-xs">IP: {log.ip}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                第 {pagination.page} / {pagination.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === 1}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === pagination.totalPages}
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
