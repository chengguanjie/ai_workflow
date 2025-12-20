import {
  Workflow,
  Sparkles,
  Code2,
  Globe,
  Database,
  Bell,
  GitBranch,
  Repeat,
  Lock,
  Zap,
  BarChart3,
  BookOpen,
} from "lucide-react";

const features = [
  {
    name: "可视化工作流设计",
    description: "拖拽式编辑器，无需编码即可构建复杂业务流程。支持分支、循环、并行等高级逻辑。",
    icon: Workflow,
  },
  {
    name: "AI 智能处理",
    description: "集成 8 大 AI 提供商，支持文本生成、图像识别、代码执行等智能任务处理。",
    icon: Sparkles,
  },
  {
    name: "代码执行引擎",
    description: "支持 JavaScript、TypeScript、Python、SQL 等多种语言，AI 辅助生成和优化代码。",
    icon: Code2,
  },
  {
    name: "HTTP 请求节点",
    description: "支持 RESTful API 调用，多种认证方式，自动重试机制，轻松对接第三方服务。",
    icon: Globe,
  },
  {
    name: "知识库 RAG",
    description: "上传文档构建知识库，支持智能检索增强生成，让 AI 回答更专业、更准确。",
    icon: Database,
  },
  {
    name: "多渠道通知",
    description: "支持飞书、钉钉、企业微信等主流办公平台，工作流结果实时推送。",
    icon: Bell,
  },
  {
    name: "条件分支",
    description: "支持多条件组合判断，12 种比较操作符，灵活控制流程走向。",
    icon: GitBranch,
  },
  {
    name: "循环与并行",
    description: "FOR/WHILE 循环处理批量数据，并行分支提升执行效率。",
    icon: Repeat,
  },
  {
    name: "权限管理",
    description: "细粒度权限控制，支持部门、角色、个人级别的访问管理。",
    icon: Lock,
  },
  {
    name: "触发器系统",
    description: "手动触发、Webhook 回调、Cron 定时任务，三种方式灵活启动工作流。",
    icon: Zap,
  },
  {
    name: "执行分析",
    description: "详细的执行日志、性能统计、成功率分析，全面掌控工作流运行状态。",
    icon: BarChart3,
  },
  {
    name: "模板市场",
    description: "官方精选模板、社区共享模板，一键导入快速上手。",
    icon: BookOpen,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-32 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            功能强大，开箱即用
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            16 种节点类型覆盖各类自动化场景，从简单任务到复杂业务流程，一站式解决
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
