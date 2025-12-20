const stats = [
  { value: "16+", label: "节点类型", description: "覆盖各类自动化场景" },
  { value: "8", label: "AI 提供商", description: "灵活选择最适合的模型" },
  { value: "99.9%", label: "可用性保障", description: "企业级稳定性" },
  { value: "5分钟", label: "快速上手", description: "无需编码即可使用" },
];

export function StatsSection() {
  return (
    <section className="py-16 border-y bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl font-bold text-primary lg:text-5xl">
                {stat.value}
              </div>
              <div className="mt-2 text-lg font-semibold">{stat.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
