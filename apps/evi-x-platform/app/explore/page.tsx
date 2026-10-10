import Link from 'next/link';
import type { Metadata } from 'next';
import LandingDemo from '@/components/landing/LandingDemo';
import styles from '@/components/landing/LandingExplore.module.css';

export const metadata: Metadata = {
  title: '了解证见｜EVI-X',
  description: '体验问卷设计、样本核验和报告预览，了解证见的研究工作流程。',
};

export default function ExplorePage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#demo">跳到演示</a>
    <header className={styles.header}><Link href="/">证见 <span>EVI-X</span></Link><nav aria-label="产品导航"><Link href="/">返回首页</Link><Link href="/projects">进入研究空间 ↗</Link></nav></header>
    <main className={styles.main}>
      <div className={styles.intro}><p>从问题，到有依据的行动。</p><h1>动手试试证见。</h1></div>
      <section id="demo" className={styles.demo} aria-label="产品交互演示"><LandingDemo/></section>
      <section id="questions" className={styles.questions} aria-labelledby="questions-title"><h2 id="questions-title">开始之前</h2>{[
        ['证见适合谁？', '面向市场调查与分析大赛参赛团队，以及需要设计问卷、分析数据、撰写研究报告的小团队。'],
        ['需要自己的 API Key 吗？', '模型生成使用你配置的个人 API Key；密钥由服务器加密保管，不随项目共享。本页演示无需 Key。'],
        ['现在可以使用哪些功能？', '邮箱登录、团队项目、个人模型连接、问卷提案和云端版本已接通。本地数据分析、报告与 PPT 编辑导出继续可用。调查发布回收与云端 Office 正在后续建设中。'],
        ['如何加入内测？', '当前面向受邀团队开放。获得邀请后，使用对应邮箱验证码登录即可。'],
      ].map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</section>
      <div className={styles.tools}><p>已有研究，继续向前。</p><Link href="/workspace">打开研究工具 ↗</Link></div>
    </main>
    <footer className={styles.footer}><p>证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。</p><p>本页使用合成示例。</p></footer>
  </div>;
}
