import Link from 'next/link';
import type { Metadata } from 'next';
import LandingDemo from '@/components/landing/LandingDemo';
import CorpusObservatoryLazy from '@/components/landing/CorpusObservatoryLazy';
import styles from '@/components/landing/LandingExplore.module.css';

export const metadata: Metadata = {
  title: '了解证见｜证见 EVI-X',
  description: '体验问卷设计、样本核验与报告成文预览，了解证见 EVI-X 的实证调查研究工作流程。',
};

export default function ExplorePage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#demo">跳到演示</a>
    <header className={styles.header}><Link href="/">证见 <span>EVI-X</span></Link><nav aria-label="产品导航"><Link href="/">返回首页</Link><Link href="/projects">进入研究空间 ↗</Link></nav></header>
    <main className={styles.main}>
      <div className={styles.intro}><p>从问题，到有依据的行动。</p><h1>动手试试证见。</h1></div>
      <section id="demo" className={styles.demo} aria-label="产品交互演示"><LandingDemo/></section>
      <section id="corpus" aria-labelledby="corpus-title" style={{ marginTop: 48 }}><CorpusObservatoryLazy compact/></section>
      <section id="questions" className={styles.questions} aria-labelledby="questions-title"><h2 id="questions-title">开始之前</h2>{[
        ['证见适合谁？', '面向市场调查与分析大赛参赛团队，以及需要设计问卷、分析数据、撰写研究报告的小团队。'],
        ['如何接入外部研究服务？', '在个人服务设置中填入自有访问凭证，即可为问卷起草与文稿审校等任务选用对应服务。'],
        ['现在可以使用哪些功能？', '支持邮箱登录、团队项目协作、个人服务连接、问卷提案、云端问卷版本管理与受访角色预测试。本地可完成数据分析、报告编辑及文档与演示文稿导出；线上问卷回收与云端协同文档待开放。'],
        ['如何加入内测？', '当前面向受邀团队开放。获得邀请后，使用对应邮箱验证码登录即可。'],
      ].map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</section>
      <div className={styles.tools}><p>已有研究，继续向前。</p><Link href="/workspace">打开研究工具 ↗</Link></div>
    </main>
  </div>;
}
