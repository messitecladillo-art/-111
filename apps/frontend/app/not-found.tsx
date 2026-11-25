import type { Metadata } from 'next';
import Link from 'next/link';
import BrandMark from '@/components/brand/BrandMark';

export const metadata: Metadata = {
  title: '页面未找到｜证见 EVI-X',
  description: '所访问的地址不存在或已迁移，可返回证见 EVI-X 工作台首页或进入实证研究工作台继续开展调研。',
};

export default function NotFoundPage() {
  return (
    <div className="workbench hosted-app hosted-auth">
      <header className="hosted-auth-bar">
        <Link className="wb-brand" href="/">
          <BrandMark size={32} />
          <span>
            <strong>证见 EVI-X</strong>
            <small>实证调查研究工作台</small>
          </span>
        </Link>
      </header>
      <main id="not-found-content" className="hosted-main hosted-auth-main">
        <section
          className="hosted-card"
          aria-labelledby="not-found-heading"
          style={{ width: 'min(560px, 100%)', margin: '0 auto' }}
        >
          <span className="hosted-kicker">地址核对 · 404</span>
          <h1
            id="not-found-heading"
            style={{ font: '700 24px/1.4 var(--wb-serif)', letterSpacing: '0.03em', margin: '12px 0' }}
          >
            未找到所访问的页面
          </h1>
          <p className="hosted-small" style={{ fontSize: '14px' }}>
            当前链接可能已变更、输入有误或暂未开放。你的研究项目、问卷草稿与分析记录均不受影响，可从下方入口继续开展研究。
          </p>
          <div className="hosted-actions" style={{ marginTop: '20px', marginBottom: 0 }}>
            <Link className="hosted-primary" href="/">
              返回工作台首页
            </Link>
            <Link className="hosted-secondary" href="/agent">
              进入实证研究工作台
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
