'use client';

import Link from 'next/link';
import BrandMark from '@/components/brand/BrandMark';

export default function GlobalRouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
      <main id="route-error-content" className="hosted-main hosted-auth-main">
        <section
          role="alert"
          aria-live="assertive"
          aria-labelledby="route-error-heading"
          className="hosted-card"
          style={{ width: 'min(560px, 100%)', margin: '0 auto' }}
        >
          <span className="hosted-kicker">状态恢复提示</span>
          <h1
            id="route-error-heading"
            style={{ font: '700 24px/1.4 var(--wb-serif)', letterSpacing: '0.03em', margin: '12px 0' }}
          >
            页面载入暂时中断
          </h1>
          <p className="hosted-small" style={{ fontSize: '14px' }}>
            页面载入遇到网络或状态波动，你的研究资料与项目进度均安全保留。可尝试重新载入当前内容，或先返回工作台首页。
          </p>
          <div className="hosted-actions" style={{ marginTop: '20px', marginBottom: 0 }}>
            <button type="button" className="hosted-primary" onClick={() => reset()}>
              重新载入当前内容
            </button>
            <Link className="hosted-secondary" href="/">
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
