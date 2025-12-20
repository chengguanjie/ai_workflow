'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  CreditCard,
  Check,
  Zap,
  Building2,
  Crown,
  Download,
  Calendar,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// 套餐配置
const plans = [
  {
    id: 'FREE',
    name: '免费版',
    description: '适合个人和小团队试用',
    monthlyPrice: 0,
    yearlyPrice: 0,
    icon: Zap,
    features: [
      '最多 3 个工作流',
      '每月 100 次执行',
      '基础 AI 模型',
      '社区支持',
    ],
    limits: {
      workflows: 3,
      executions: 100,
      users: 3,
      storage: '100MB',
    },
  },
  {
    id: 'STARTER',
    name: '入门版',
    description: '适合成长型团队',
    monthlyPrice: 99,
    yearlyPrice: 999,
    icon: Building2,
    popular: false,
    features: [
      '最多 10 个工作流',
      '每月 1,000 次执行',
      '标准 AI 模型',
      '邮件支持',
      '基础数据分析',
    ],
    limits: {
      workflows: 10,
      executions: 1000,
      users: 10,
      storage: '1GB',
    },
  },
  {
    id: 'PROFESSIONAL',
    name: '专业版',
    description: '适合专业团队',
    monthlyPrice: 299,
    yearlyPrice: 2999,
    icon: Crown,
    popular: true,
    features: [
      '最多 50 个工作流',
      '每月 10,000 次执行',
      '高级 AI 模型',
      '优先支持',
      '高级数据分析',
      '自定义知识库',
      'API 访问',
    ],
    limits: {
      workflows: 50,
      executions: 10000,
      users: 50,
      storage: '10GB',
    },
  },
  {
    id: 'ENTERPRISE',
    name: '企业版',
    description: '适合大型企业',
    monthlyPrice: null,
    yearlyPrice: null,
    icon: Sparkles,
    features: [
      '无限工作流',
      '无限执行次数',
      '所有 AI 模型',
      '专属客户经理',
      '定制化开发',
      '私有化部署',
      'SLA 保障',
      '培训服务',
    ],
    limits: {
      workflows: '无限',
      executions: '无限',
      users: '无限',
      storage: '无限',
    },
  },
]

// 模拟账单数据
const mockInvoices = [
  {
    id: '1',
    invoiceNumber: 'INV-2024-001',
    date: '2024-01-15',
    amount: 299,
    status: 'PAID',
    plan: '专业版',
  },
  {
    id: '2',
    invoiceNumber: 'INV-2023-012',
    date: '2023-12-15',
    amount: 299,
    status: 'PAID',
    plan: '专业版',
  },
  {
    id: '3',
    invoiceNumber: 'INV-2023-011',
    date: '2023-11-15',
    amount: 299,
    status: 'PAID',
    plan: '专业版',
  },
]

export default function BillingPage() {
  const { data: session } = useSession()
  const [isYearly, setIsYearly] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  // 当前套餐（从session或API获取）
  const currentPlan = 'FREE' // 模拟数据

  const handleUpgrade = (planId: string) => {
    setSelectedPlan(planId)
    // TODO: 跳转到支付页面或显示支付弹窗
    console.log('Upgrade to:', planId)
  }

  const handleContactSales = () => {
    // TODO: 打开联系销售的表单或跳转
    window.open('mailto:sales@aiworkflow.com?subject=企业版咨询', '_blank')
  }

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">付费管理</h1>
        <p className="text-muted-foreground">
          管理您的订阅套餐和账单信息
        </p>
      </div>

      <Tabs defaultValue="subscription" className="space-y-6">
        <TabsList>
          <TabsTrigger value="subscription">订阅套餐</TabsTrigger>
          <TabsTrigger value="invoices">账单历史</TabsTrigger>
          <TabsTrigger value="usage">使用统计</TabsTrigger>
        </TabsList>

        {/* 订阅套餐 */}
        <TabsContent value="subscription" className="space-y-6">
          {/* 当前套餐状态 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                当前套餐
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {plans.find(p => p.id === currentPlan)?.name}
                    </span>
                    <Badge variant="secondary">当前</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentPlan === 'FREE'
                      ? '免费使用，无需付费'
                      : '下次续费日期：2024年2月15日'
                    }
                  </p>
                </div>
                {currentPlan !== 'FREE' && (
                  <Button variant="outline">
                    管理订阅
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 计费周期切换 */}
          <div className="flex items-center justify-center gap-4">
            <Label htmlFor="billing-cycle" className={cn(!isYearly && 'font-semibold')}>
              月付
            </Label>
            <Switch
              id="billing-cycle"
              checked={isYearly}
              onCheckedChange={setIsYearly}
            />
            <Label htmlFor="billing-cycle" className={cn(isYearly && 'font-semibold')}>
              年付
              <Badge variant="secondary" className="ml-2">省 17%</Badge>
            </Label>
          </div>

          {/* 套餐列表 */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const Icon = plan.icon
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
              const isCurrentPlan = plan.id === currentPlan
              const isUpgrade = plans.findIndex(p => p.id === plan.id) > plans.findIndex(p => p.id === currentPlan)

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative',
                    plan.popular && 'border-primary shadow-lg',
                    isCurrentPlan && 'bg-muted/50'
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary">最受欢迎</Badge>
                    </div>
                  )}

                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle>{plan.name}</CardTitle>
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* 价格 */}
                    <div className="flex items-baseline gap-1">
                      {price === null ? (
                        <span className="text-2xl font-bold">联系我们</span>
                      ) : price === 0 ? (
                        <span className="text-3xl font-bold">免费</span>
                      ) : (
                        <>
                          <span className="text-3xl font-bold">¥{price}</span>
                          <span className="text-muted-foreground">
                            /{isYearly ? '年' : '月'}
                          </span>
                        </>
                      )}
                    </div>

                    {/* 功能列表 */}
                    <ul className="space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter>
                    {isCurrentPlan ? (
                      <Button variant="outline" className="w-full" disabled>
                        当前套餐
                      </Button>
                    ) : price === null ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleContactSales}
                      >
                        联系销售
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : isUpgrade ? (
                      <Button
                        className="w-full"
                        onClick={() => handleUpgrade(plan.id)}
                      >
                        升级到{plan.name}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleUpgrade(plan.id)}
                      >
                        降级到{plan.name}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>

          {/* 功能对比表 */}
          <Card>
            <CardHeader>
              <CardTitle>功能对比</CardTitle>
              <CardDescription>详细了解各套餐的功能差异</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">功能</TableHead>
                    {plans.map((plan) => (
                      <TableHead key={plan.id} className="text-center">
                        {plan.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">工作流数量</TableCell>
                    {plans.map((plan) => (
                      <TableCell key={plan.id} className="text-center">
                        {plan.limits.workflows}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">每月执行次数</TableCell>
                    {plans.map((plan) => (
                      <TableCell key={plan.id} className="text-center">
                        {plan.limits.executions}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">团队成员</TableCell>
                    {plans.map((plan) => (
                      <TableCell key={plan.id} className="text-center">
                        {plan.limits.users}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">存储空间</TableCell>
                    {plans.map((plan) => (
                      <TableCell key={plan.id} className="text-center">
                        {plan.limits.storage}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 账单历史 */}
        <TabsContent value="invoices" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>账单历史</CardTitle>
              <CardDescription>查看和下载历史账单</CardDescription>
            </CardHeader>
            <CardContent>
              {mockInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  暂无账单记录
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>账单编号</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead>套餐</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {invoice.date}
                          </div>
                        </TableCell>
                        <TableCell>{invoice.plan}</TableCell>
                        <TableCell>¥{invoice.amount}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.status === 'PAID'
                                ? 'default'
                                : invoice.status === 'PENDING'
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {invoice.status === 'PAID'
                              ? '已支付'
                              : invoice.status === 'PENDING'
                              ? '待支付'
                              : '支付失败'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4 mr-1" />
                            下载
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 使用统计 */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>工作流使用</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2 / 3</div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: '66%' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  已使用 66%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>本月执行次数</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">45 / 100</div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: '45%' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  已使用 45%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>团队成员</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2 / 3</div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: '66%' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  已使用 66%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>存储空间</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">12MB / 100MB</div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: '12%' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  已使用 12%
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>使用提示</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  您当前使用的是 <span className="font-semibold text-foreground">免费版</span>。
                  升级到更高版本可以获得更多工作流、执行次数和高级功能。
                </p>
                <Button className="mt-4" onClick={() => handleUpgrade('STARTER')}>
                  立即升级
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
