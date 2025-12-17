'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, MoreVertical, Play, Edit, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// 临时模拟数据
const mockWorkflows = [
  {
    id: '1',
    name: '文章摘要生成',
    description: '自动生成文章摘要',
    status: 'active',
    nodeCount: 3,
    lastRun: '2小时前',
  },
  {
    id: '2',
    name: '客户邮件回复',
    description: '根据客户邮件自动生成回复',
    status: 'active',
    nodeCount: 5,
    lastRun: '1天前',
  },
]

export default function WorkflowsPage() {
  const [search, setSearch] = useState('')

  const filteredWorkflows = mockWorkflows.filter((w) =>
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

      {/* 工作流列表 */}
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
                    <CardDescription>{workflow.description}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Play className="mr-2 h-4 w-4" />
                        执行
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit className="mr-2 h-4 w-4" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
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
                    <Badge variant="secondary">{workflow.nodeCount} 节点</Badge>
                    <span className="text-muted-foreground">
                      上次运行: {workflow.lastRun}
                    </span>
                  </div>
                </div>
              </CardContent>
              <Link
                href={`/workflows/${workflow.id}`}
                className="absolute inset-0"
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
