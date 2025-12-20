import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "AI Workflow - 智能工作流自动化平台",
    template: "%s | AI Workflow",
  },
  description: "零代码构建企业级自动化工作流，AI驱动的智能流程引擎，让复杂业务自动运转",
  keywords: ["工作流", "自动化", "AI", "低代码", "流程引擎", "企业应用", "RPA", "自动化办公"],
  openGraph: {
    title: "AI Workflow - 智能工作流自动化平台",
    description: "零代码构建企业级自动化工作流，AI驱动的智能流程引擎",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Workflow - 智能工作流自动化平台",
    description: "零代码构建企业级自动化工作流，AI驱动的智能流程引擎",
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
