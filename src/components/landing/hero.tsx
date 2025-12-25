import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden w-full">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-gradient-to-tl from-blue-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full flex flex-col items-center">
        <div className="text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm mb-6">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>人效冠军 —— 企业级 AI 实战课程</span>
          </div>

          {/* Main headline */}
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="block">用企业级 AI</span>
            <span className="block mt-2 bg-gradient-to-r from-primary via-blue-600 to-purple-600 bg-clip-text text-transparent">
              打造极致人效
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            【实战案例】某食品企业面向山姆、沃尔玛、小象超市新品开发需求，
            通过 AI 赋能研发，实现<span className="text-foreground font-semibold">效率提升 700%</span>，准确率由 <span className="text-foreground font-semibold">40% 跃升至 100%</span>。
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 h-10" asChild>
              <Link href="/apply">
                立即预约课程
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="text-base px-8 h-10" asChild>
              <Link href="#use-cases">
                <Play className="mr-2 h-4 w-4" />
                查看成功案例
              </Link>
            </Button>
          </div>
        </div>

        {/* Hero image/dashboard preview */}
        <div className="mt-16 relative w-full max-w-5xl">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
          <div className="relative rounded-xl border bg-muted/30 shadow-2xl overflow-hidden aspect-[16/9]">
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <p className="text-lg text-muted-foreground">企业级 AI 提效系统演示</p>
                <p className="text-sm text-muted-foreground/60 mt-2">从新品开发、订单处理到大客户对接，全流程 AI 赋能</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
