import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "表单提交 | AI Workflow",
    template: "%s | AI Workflow",
  },
  description: "AI Workflow 智能表单",
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {children}
    </div>
  );
}
