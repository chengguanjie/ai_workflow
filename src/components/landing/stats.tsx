const stats = [
  { value: "700%", label: "研发效能提升", description: "从数周缩短至数天" },
  { value: "100%", label: "新品开发准确率", description: "由 40% 提升至满分" },
  { value: "TOP 3", label: "零售巨头对接", description: "山姆、沃尔玛、小象超市" },
  { value: "50+", label: "企业人效增长", description: "深耕行业管理咨询" },
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
