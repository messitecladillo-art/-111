import type { Metadata } from "next";
import { HostedSessionProvider } from '@/components/hosted/HostedSession';
import "./globals.css";
import "./workbench.css";
import './hosted.css';

export const metadata: Metadata = {
  title: "证见 EVI-X｜正大杯冠军 Agent",
  description: "面向市场调查与分析团队的独立研究工作台：案例检索、问卷设计、硅基样本预测试、数据分析与报告答辩。",
  applicationName: "证见 EVI-X",
  keywords: ["正大杯", "市场调查", "证见 EVI-X", "竞赛 Agent", "循证研究"],
  openGraph: {
    title: "证见 EVI-X｜正大杯冠军 Agent",
    description: "让每个问题，都循证抵达行动。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "证见 EVI-X｜让每个问题，都循证抵达行动" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "证见 EVI-X｜正大杯冠军 Agent",
    description: "市场调查与分析的循证研究工作台。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><HostedSessionProvider>{children}</HostedSessionProvider></body>
    </html>
  );
}
