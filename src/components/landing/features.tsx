import {
  Workflow,
  Sparkles,
  Globe,
  Database,
  Bell,
  BarChart3,
} from "lucide-react";

const features = [
  {
    name: "组织流程再造",
    description: "通过 AI 对传统业务流程进行深度重构，消除冗余环节，实现组织结构的扁平化与高效协作。",
    icon: Workflow,
  },
  {
    name: "AI 决策增强",
    description: "利用企业级大模型分析海量市场数据，为新品研发、库存管理等核心决策提供科学支撑。",
    icon: Sparkles,
  },
  {
    name: "跨平台数字化协同",
    description: "无缝对接山姆、沃尔玛等大型零售商系统，实现供应商与大客户之间的高频、精准协作。",
    icon: Globe,
  },
  {
    name: "企业知识资产化",
    description: "构建企业专属知识库，将研发经验、市场洞察转化为可检索、可进化的数字资产。",
    icon: Database,
  },
  {
    name: "实时响应体系",
    description: "建立全渠道自动化通知机制，确保大客户需求在第一时间得到反馈与执行。",
    icon: Bell,
  },
  {
    name: "极致效率追踪",
    description: "多维度分析人效提升数据，通过可视化看板实时监控提效成果，确保持续优化。",
    icon: BarChart3,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-32 w-full bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            核心实战模块
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            从理论到实操，为您提供一套完整的、可落地的人效提升方法论
          </p>
        </div>

        {/* Features grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.name}
              className="relative rounded-xl border bg-background p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{feature.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
