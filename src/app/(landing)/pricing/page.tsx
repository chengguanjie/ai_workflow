import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingHeader, LandingFooter } from "@/components/landing";
import { Check, X, Sparkles, Building2, Rocket, Crown } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "定价方案 - AI Workflow",
  description: "选择适合您团队的 AI Workflow 方案，从免费版到企业定制版，满足各种规模需求",
};

const plans = [
  {
    name: "免费版",
    price: "0",
    period: "永久免费",
    description: "个人体验、小型试用",
    icon: Sparkles,
    features: [
      { name: "工作流数量", value: "3 个", included: true },
      { name: "执行次数", value: "100 次/月", included: true },
      { name: "团队成员", value: "仅自己", included: true },
      { name: "知识库存储", value: "50 MB", included: true },
      { name: "历史记录", value: "7 天", included: true },
      { name: "AI 助手对话", value: "20 次/月", included: true },
      { name: "基础节点类型", value: "", included: true },
      { name: "手动触发器", value: "", included: true },
      { name: "HTTP 节点", value: "", included: false },
      { name: "Webhook 触发器", value: "", included: false },
      { name: "权限管理", value: "", included: false },
      { name: "API 访问", value: "", included: false },
    ],
    cta: "免费开始",
    ctaLink: "/register",
    popular: false,
  },
  {
    name: "专业版",
    price: "99",
    period: "/月",
    yearlyPrice: "999",
    yearlySaving: "189",
    description: "个人开发者、小微团队",
    icon: Rocket,
    features: [
      { name: "工作流数量", value: "20 个", included: true },
      { name: "执行次数", value: "5,000 次/月", included: true },
      { name: "团队成员", value: "5 人", included: true },
      { name: "知识库存储", value: "2 GB", included: true },
      { name: "历史记录", value: "30 天", included: true },
      { name: "AI 助手对话", value: "500 次/月", included: true },
      { name: "全部基础节点 + HTTP 节点", value: "", included: true },
      { name: "手动 + 定时触发器", value: "", included: true },
      { name: "模板市场", value: "", included: true },
      { name: "Webhook 触发器", value: "", included: false },
      { name: "权限管理", value: "", included: false },
      { name: "API 访问", value: "", included: false },
    ],
    cta: "立即订阅",
    ctaLink: "/register?plan=professional",
    popular: false,
  },
  {
    name: "旗舰版",
    price: "399",
    period: "/月",
    yearlyPrice: "3,999",
    yearlySaving: "789",
    description: "中型团队、部门级使用",
    icon: Crown,
    features: [
      { name: "工作流数量", value: "无限", included: true },
      { name: "执行次数", value: "50,000 次/月", included: true },
      { name: "团队成员", value: "30 人", included: true },
      { name: "知识库存储", value: "20 GB", included: true },
      { name: "历史记录", value: "90 天", included: true },
      { name: "AI 助手对话", value: "5,000 次/月", included: true },
      { name: "全部节点类型", value: "", included: true },
      { name: "全部触发器 + Webhook", value: "", included: true },
      { name: "部门 + 角色权限管理", value: "", included: true },
      { name: "版本管理", value: "", included: true },
      { name: "API 访问", value: "", included: true },
      { name: "分析报表 + 导入导出", value: "", included: true },
    ],
    cta: "立即订阅",
    ctaLink: "/register?plan=flagship",
    popular: true,
  },
  {
    name: "定制版",
    price: "2,000",
    period: "起/月",
    description: "大型企业、有合规要求的组织",
    icon: Building2,
    features: [
      { name: "私有部署 / 混合云", value: "", included: true },
      { name: "执行次数", value: "无限", included: true },
      { name: "团队成员", value: "无限", included: true },
      { name: "存储空间", value: "按需配置", included: true },
      { name: "数据隔离、加密存储", value: "", included: true },
      { name: "完整操作审计日志", value: "", included: true },
      { name: "SSO 集成", value: "企微/钉钉/LDAP", included: true },
      { name: "SLA 保障", value: "99.9% 可用性", included: true },
      { name: "专属技术支持", value: "", included: true },
      { name: "定制开发", value: "按需报价", included: true },
      { name: "培训服务", value: "", included: true },
      { name: "优先功能需求", value: "", included: true },
    ],
    cta: "联系我们",
    ctaLink: "#contact",
    popular: false,
  },
];

const overageRates = [
  { item: "工作流执行", price: "¥0.02/次" },
  { item: "AI 对话", price: "¥0.1/次" },
  { item: "存储空间", price: "¥5/GB/月" },
  { item: "API 调用", price: "¥0.01/次" },
  { item: "额外成员", price: "¥20/人/月" },
];

const faqs = [
  {
    question: "免费版有什么限制？",
    answer: "免费版包含 3 个工作流、每月 100 次执行、50MB 知识库存储。适合个人体验和简单场景使用，功能完整但有数量限制。",
  },
  {
    question: "可以随时升级或降级吗？",
    answer: "是的，您可以随时升级到更高版本，升级后立即生效。降级将在当前计费周期结束后生效，已使用的资源不会退款。",
  },
  {
    question: "超出配额后如何计费？",
    answer: "超出配额后按用量计费。工作流执行 ¥0.02/次，AI 对话 ¥0.1/次，存储 ¥5/GB/月。您可以设置用量预警避免意外费用。",
  },
  {
    question: "定制版的私有部署包含什么？",
    answer: "私有部署包括阿里云/AWS 基础设施搭建、数据库配置、SSL 证书、监控告警、日常运维等。我们提供完整的技术支持和 SLA 保障。",
  },
  {
    question: "是否支持年付优惠？",
    answer: "专业版年付 ¥999（省 ¥189），旗舰版年付 ¥3,999（省 ¥789）。年付用户还可获得优先技术支持。",
  },
  {
    question: "如何获取发票？",
    answer: "所有付费订阅均可开具正规增值税发票。您可以在设置中填写开票信息，发票将在付款后 5 个工作日内开具。",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <main className="pt-24">
        {/* Hero */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              简单透明的定价方案
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              选择适合您团队规模的方案，随时根据需求升级
            </p>
          </div>
        </section>

        {/* Pricing cards */}
        <section className="pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border bg-background p-6 ${
                    plan.popular ? "border-primary shadow-lg ring-1 ring-primary" : ""
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        最受欢迎
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      plan.popular ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      <plan.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold">¥{plan.price}</span>
                      <span className="ml-1 text-muted-foreground">{plan.period}</span>
                    </div>
                    {plan.yearlyPrice && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        年付 ¥{plan.yearlyPrice}（省 ¥{plan.yearlySaving}）
                      </p>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mb-6">
                    {plan.description}
                  </p>

                  <Button
                    className="w-full mb-6"
                    variant={plan.popular ? "default" : "outline"}
                    asChild
                  >
                    <Link href={plan.ctaLink}>{plan.cta}</Link>
                  </Button>

                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start text-sm">
                        {feature.included ? (
                          <Check className="h-4 w-4 text-green-600 mt-0.5 mr-2 shrink-0" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 mr-2 shrink-0" />
                        )}
                        <span className={feature.included ? "" : "text-muted-foreground/60"}>
                          {feature.name}
                          {feature.value && <span className="text-muted-foreground ml-1">({feature.value})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Overage rates */}
        <section className="py-16 bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold">超额计费标准</h2>
              <p className="mt-2 text-muted-foreground">所有付费版本适用，按实际用量计费</p>
            </div>
            <div className="max-w-2xl mx-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {overageRates.map((rate) => (
                  <div key={rate.item} className="rounded-lg border bg-background p-4 text-center">
                    <p className="text-sm text-muted-foreground">{rate.item}</p>
                    <p className="mt-1 font-semibold">{rate.price}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold">常见问题</h2>
            </div>
            <div className="space-y-6">
              {faqs.map((faq, index) => (
                <div key={index} className="rounded-lg border bg-background p-6">
                  <h3 className="font-semibold">{faq.question}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl font-bold">还有疑问？</h2>
            <p className="mt-2 text-muted-foreground">
              我们的团队随时为您解答任何问题
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Button variant="outline" asChild>
                <Link href="#contact">联系销售</Link>
              </Button>
              <Button asChild>
                <Link href="/register">免费试用</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
