import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ToasterProvider } from "@/components/providers/toaster-provider";
import { NavigationProgress } from "@/components/providers/navigation-progress";
import { QueryProvider } from "@/components/providers/query-client-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Workflow",
  description: "智能工作流自动化平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
          <ToasterProvider />
        </QueryProvider>
      </body>
    </html>
  );
}
