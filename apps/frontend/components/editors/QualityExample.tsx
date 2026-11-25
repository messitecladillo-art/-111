'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

const QualityExampleCanvas = dynamic(() => import('./QualityExampleCanvas'), {
  ssr: false,
  loading: () => (
    <p role="status" aria-live="polite">
      正在载入研究成果样板工作台…
    </p>
  ),
});

export default function QualityExample() {
  return (
    <main style={{ maxWidth: 1560, margin: '0 auto', padding: '28px 36px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <span style={{ fontSize: 12, color: 'rgb(96, 123, 140)' }}>
            公开银行业营销调研数据集 · 4,521 条公开记录
          </span>
          <h1 style={{ fontSize: 28, margin: '8px 0' }}>研究成果与矢量编排样板</h1>
        </div>
        <Link href="/workspace#analysis">进入数据分析</Link>
      </header>
      <QualityExampleCanvas />
    </main>
  );
}
