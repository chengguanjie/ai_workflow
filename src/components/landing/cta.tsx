import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

const benefits = [
  "实战案例深度解析",
  "落地模版即拿即用",
  "专家 1 对 1 诊断",
  "企业人效增长方案",
];

export function CTASection() {
  return (
    <section className="py-20 lg:py-32 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-primary px-8 py-16 sm:px-16 sm:py-24 overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-white/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
          </div>

          <div className="relative text-center">
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
              开启您的组织人效增长之旅
            </h2>
            <p className="mt-6 text-lg text-primary-foreground/80 max-w-2xl mx-auto">
              立即预约《人效冠军》实战课程，掌握 AI 时代的领先竞争力。<br />
              让 AI 成为您企业的人效倍增器。
            </p>

            {/* Benefits list */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center text-primary-foreground/90">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                variant="secondary"
                className="text-base px-8 h-12 bg-white text-primary hover:bg-white/90"
                asChild
              >
                <Link href="/apply">
                  立即预约报名
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 h-12 bg-white/10 border-white text-white hover:bg-white hover:text-primary transition-colors"
                asChild
              >
                <Link href="#use-cases">查看更多案例</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
