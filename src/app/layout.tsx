import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "订单管理系统",
  description: "塑料薄膜工厂订单管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-slate-50 text-slate-800 antialiased">
        <Sidebar />
        {/* 内容区偏移侧边栏宽度 */}
        <div className="ml-16 min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
