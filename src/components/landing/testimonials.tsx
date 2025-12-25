import { Quote } from "lucide-react";

const testimonials = [
  {
    content: "AI Workflow 彻底改变了我们的内容生产流程。以前需要3天完成的工作，现在2小时就能搞定。AI 智能处理节点太强大了！",
    author: "张明",
    role: "内容运营总监",
    company: "某知名互联网公司",
    avatar: "Z",
  },
  {
    content: "作为一个技术小白，我用 AI Workflow 搭建了整个客服自动回复系统，完全不需要写代码。知识库功能让 AI 回答更专业。",
    author: "李婷",
    role: "客户服务经理",
    company: "某电商平台",
    avatar: "L",
  },
  {
    content: "我们用 AI Workflow 自动化了销售线索分配和跟进提醒，销售团队效率提升了40%。Webhook 触发器和通知功能配合完美。",
    author: "王强",
    role: "销售总监",
    company: "某 SaaS 企业",
    avatar: "W",
  },
  {
    content: "HTTP 请求节点让我们轻松对接了内部多个系统。加上定时触发器，每天自动生成数据报表，省去了大量重复工作。",
    author: "陈刚",
    role: "技术经理",
    company: "某金融科技公司",
    avatar: "C",
  },
  {
    content: "模板市场太赞了！我们直接使用官方的入职流程模板，稍作修改就能用。HR 部门非常满意这个工具。",
    author: "刘芳",
    role: "人力资源总监",
    company: "某制造业企业",
    avatar: "L",
  },
  {
    content: "从评估到上线只用了一周。权限管理很完善，不同部门只能看到自己的工作流。企业版的 SLA 保障让我们很放心。",
    author: "赵伟",
    role: "IT 总监",
    company: "某集团公司",
    avatar: "Z",
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 lg:py-32 w-full bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            客户怎么说
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            来自各行业用户的真实反馈
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="relative rounded-xl border bg-background p-6 hover:shadow-lg transition-shadow"
            >
              <Quote className="h-8 w-8 text-primary/20" />
              <p className="mt-4 text-muted-foreground leading-relaxed">
                &ldquo;{testimonial.content}&rdquo;
              </p>
              <div className="mt-6 flex items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  {testimonial.avatar}
                </div>
                <div className="ml-3">
                  <p className="font-semibold">{testimonial.author}</p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.role} · {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
