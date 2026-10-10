import type { Metadata } from "next";
import { HostedSessionProvider } from '@/components/hosted/HostedSession';
import "./globals.css";
import "./workbench.css";
import './hosted.css';

export const metadata: Metadata = {
  title: "证见 EVI-X｜正大杯冠军 Agent",
  description: "面向正大杯项目的全流程循证智能体：真实案例、项目诊断、规则锁定、九道质量门禁与项目控制门户。证见 EVI-X 为独立研究辅助工具，非赛事官方产品。",
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
    description: "独立、非官方的正大杯全流程循证竞赛智能体。",
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
