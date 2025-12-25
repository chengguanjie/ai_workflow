import { FileText, Users, ShoppingCart, Headphones, TrendingUp, Mail } from "lucide-react";

const useCases = [
  {
    title: "食品企业新品研发赋能",
    description: "通过 AI 自动化分析大客户研发需求，实现新品开发从数周缩短至数天。",
    icon: FileText,
    examples: ["需求自动拆解与对标", "智能配方生成与优化", "包装合规性自动审查"],
    color: "bg-orange-500/10 text-orange-600",
  },
  {
    title: "山姆/沃尔玛大客户对接",
    description: "建立 AI 自动化工作流，精准对接零售巨头的采购与新品准入标准。",
    icon: ShoppingCart,
    examples: ["新品准入文件自动填充", "标签/成分自动审核", "供应链实时响应协作"],
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    title: "研发全流程提效 700%",
    description: "重构研发管理流程，将人工处理的繁琐环节交给 AI，极大释放核心人才生产力。",
    icon: TrendingUp,
    examples: ["研发进度自动追踪", "跨部门协作自动提醒", "历史成功案例智能匹配"],
    color: "bg-green-500/10 text-green-600",
  },
  {
    title: "准确率从 40% 到 100%",
    description: "通过 AI 知识库与规则引擎，消除人为疏漏，确保产出物 100% 符合大客户标准。",
    icon: Headphones,
    examples: ["智能质检与误差识别", "标准操作规程 (SOP) AI 校验", "专家经验数字化复用"],
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    title: "市场趋势智能捕捉",
    description: "AI 实时扫描零售平台数据，帮助企业在 24 小时内锁定潜在爆品趋势。",
    icon: Mail,
    examples: ["大客户新品趋势动态", "竞品策略自动化监控", "消费情绪语义分析"],
    color: "bg-pink-500/10 text-pink-600",
  },
  {
    title: "人效冠军管理模型",
    description: "基于实战案例总结的 AI 管理模型，帮助企业从 0 到 1 打造高人效组织。",
    icon: Users,
    examples: ["部门人效 ROI 分析", "AI 落地卡点诊断", "数字化人才培养体系"],
    color: "bg-cyan-500/10 text-cyan-600",
  },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" className="py-20 lg:py-32 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            深度复盘：提效 700% 的实战密码
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            我们不仅仅是提供工具，更是通过 AI 重新定义企业的人效天花板
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
