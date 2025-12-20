import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-gradient-to-tl from-blue-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm mb-8">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>AI 驱动的智能工作流引擎</span>
          </div>

          {/* Main headline */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="block">零代码构建</span>
            <span className="block mt-2 bg-gradient-to-r from-primary via-blue-600 to-purple-600 bg-clip-text text-transparent">
              企业级自动化工作流
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            拖拽式可视化设计 + AI 智能处理，让复杂业务流程自动运转。
            <br className="hidden sm:block" />
            支持 16 种节点类型、8 大 AI 模型、无限可能的自动化场景。
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <Link href="/register">
                免费开始使用
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="text-base px-8 h-12" asChild>
              <Link href="#demo">
                <Play className="mr-2 h-4 w-4" />
                观看演示
              </Link>
            </Button>
          </div>

          {/* Social proof */}
          <div className="mt-12 flex flex-col items-center">
            <p className="text-sm text-muted-foreground mb-4">已有众多企业信赖使用</p>
            <div className="flex items-center gap-8 opacity-60 grayscale">
              <div className="text-2xl font-bold">企业A</div>
              <div className="text-2xl font-bold">企业B</div>
              <div className="text-2xl font-bold">企业C</div>
              <div className="text-2xl font-bold">企业D</div>
            </div>
          </div>
        </div>

        {/* Hero image/dashboard preview */}
        <div className="mt-16 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
          <div className="relative rounded-xl border bg-muted/30 shadow-2xl overflow-hidden">
            <div className="aspect-[16/9] bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
                <p className="text-lg text-muted-foreground">工作流编辑器预览</p>
                <p className="text-sm text-muted-foreground/60 mt-2">拖拽节点，连接流程，一切如此简单</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
