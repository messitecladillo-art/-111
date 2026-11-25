import type { Metadata } from "next";
import { HostedSessionProvider } from '@/components/hosted/HostedSession';
import KnowledgeProvider from '@/components/knowledge/KnowledgeProvider';
import GlobalAgentDock from '@/components/agent/GlobalAgentDock';
import "./globals.css";
import "./workbench.css";
import './hosted.css';

export const metadata: Metadata = {
  title: "证见 EVI-X｜实证调查研究工作台",
  description: "面向市场调查与统计分析团队的循证研究工作台，贯通案例检索、问卷设计、样本预测试、数据分析与报告答辩全流程。",
  applicationName: "证见 EVI-X",
  keywords: ["市场调查", "证见 EVI-X", "统计分析", "实证调研", "循证研究"],
  openGraph: {
    title: "证见 EVI-X｜实证调查研究工作台",
    description: "让每个问题，都循证抵达行动。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "证见 EVI-X｜让每个问题，都循证抵达行动" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "证见 EVI-X｜实证调查研究工作台",
    description: "市场调查与分析的循证研究工作台。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><HostedSessionProvider><KnowledgeProvider>{children}<GlobalAgentDock /></KnowledgeProvider></HostedSessionProvider></body>
    </html>
  );
}
