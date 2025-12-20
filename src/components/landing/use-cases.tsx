import { FileText, Users, ShoppingCart, Headphones, TrendingUp, Mail } from "lucide-react";

const useCases = [
  {
    title: "内容生产自动化",
    description: "从素材收集、AI 撰写、多平台分发到效果追踪，一条工作流搞定内容运营全流程。",
    icon: FileText,
    examples: ["自动生成营销文案", "批量处理产品描述", "多语言内容翻译"],
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    title: "客户服务智能化",
    description: "智能分类客户问题，自动匹配知识库答案，复杂问题自动升级人工处理。",
    icon: Headphones,
    examples: ["智能工单分配", "FAQ 自动回复", "客户情绪分析"],
    color: "bg-green-500/10 text-green-600",
  },
  {
    title: "销售流程自动化",
    description: "线索自动评分、跟进提醒、合同生成、业绩统计，释放销售团队的生产力。",
    icon: TrendingUp,
    examples: ["线索自动分配", "报价单生成", "销售数据分析"],
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    title: "HR 人事管理",
    description: "入职流程自动化、考勤数据处理、薪资计算、绩效评估，让 HR 工作更高效。",
    icon: Users,
    examples: ["入职自动化流程", "请假审批流程", "绩效数据汇总"],
    color: "bg-orange-500/10 text-orange-600",
  },
  {
    title: "电商运营自动化",
    description: "订单处理、库存预警、价格监控、评论分析，电商运营全流程自动化。",
    icon: ShoppingCart,
    examples: ["订单状态同步", "差评自动预警", "竞品价格监控"],
    color: "bg-pink-500/10 text-pink-600",
  },
  {
    title: "营销自动化",
    description: "用户分群、个性化推送、A/B 测试、效果追踪，精准触达每一位用户。",
    icon: Mail,
    examples: ["用户画像分析", "定时邮件推送", "营销效果统计"],
    color: "bg-cyan-500/10 text-cyan-600",
  },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" className="py-20 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            适用于各行各业的自动化场景
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            无论您是初创团队还是大型企业，AI Workflow 都能帮助您实现业务流程自动化
          </p>
        </div>

        {/* Use cases grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase) => (
            <div
              key={useCase.title}
              className="group relative rounded-2xl border bg-background p-8 hover:border-primary/50 hover:shadow-lg transition-all"
            >
              <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl ${useCase.color}`}>
                <useCase.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-6 text-xl font-semibold">{useCase.title}</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {useCase.description}
              </p>
              <div className="mt-6">
                <p className="text-sm font-medium text-muted-foreground mb-3">应用示例：</p>
                <ul className="space-y-2">
                  {useCase.examples.map((example) => (
                    <li key={example} className="flex items-center text-sm">
                      <span className="mr-2 h-1.5 w-1.5 rounded-full bg-primary" />
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
