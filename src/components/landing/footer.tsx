import Link from "next/link";
import { Workflow } from "lucide-react";

const footerNavigation = {
  product: [
    { name: "功能介绍", href: "#features" },
    { name: "定价方案", href: "/pricing" },
    { name: "客户案例", href: "#testimonials" },
    { name: "更新日志", href: "#" },
  ],
  support: [
    { name: "帮助中心", href: "#" },
    { name: "API 文档", href: "#" },
    { name: "联系我们", href: "#" },
    { name: "状态页面", href: "#" },
  ],
  company: [
    { name: "关于我们", href: "#" },
    { name: "博客", href: "#" },
    { name: "招聘", href: "#" },
    { name: "合作伙伴", href: "#" },
  ],
  legal: [
    { name: "隐私政策", href: "#" },
    { name: "服务条款", href: "#" },
    { name: "Cookie 政策", href: "#" },
  ],
};

export function LandingFooter() {
  return (
    <footer className="bg-muted/30 border-t" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Workflow className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">AI Workflow</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              零代码构建企业级自动化工作流，AI驱动的智能流程引擎，让复杂业务自动运转。
            </p>
            <div className="flex space-x-4">
              {/* Social links placeholder */}
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-12 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold">产品</h3>
                <ul role="list" className="mt-4 space-y-3">
                  {footerNavigation.product.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold">支持</h3>
                <ul role="list" className="mt-4 space-y-3">
                  {footerNavigation.support.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold">公司</h3>
                <ul role="list" className="mt-4 space-y-3">
                  {footerNavigation.company.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold">法律</h3>
                <ul role="list" className="mt-4 space-y-3">
                  {footerNavigation.legal.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 border-t pt-8">
          <p className="text-sm text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} AI Workflow. 保留所有权利。
          </p>
        </div>
      </div>
    </footer>
  );
}
