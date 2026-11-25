'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- root global-error boundary requires full document navigation */

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px 16px',
          backgroundColor: 'rgb(247, 244, 237)',
          color: 'rgb(10, 31, 51)',
          fontFamily:
            '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
          lineHeight: 1.7,
        }}
      >
        <title>系统界面暂时中断｜证见 EVI-X</title>
        <main
          id="global-error-content"
          role="alert"
          aria-live="assertive"
          aria-labelledby="global-error-heading"
          style={{
            width: 'min(560px, 100%)',
            boxSizing: 'border-box',
            padding: '32px 28px',
            borderRadius: '14px',
            border: '1px solid rgba(10, 31, 51, 0.14)',
            backgroundColor: 'rgb(255, 253, 248)',
            boxShadow: '0 18px 42px -24px rgba(10, 31, 51, 0.28)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.16em',
              color: 'rgb(138, 90, 11)',
            }}
          >
            证见 EVI-X · 系统恢复提示
          </p>
          <h1
            id="global-error-heading"
            style={{
              margin: '12px 0',
              fontSize: '24px',
              fontWeight: 700,
              lineHeight: 1.4,
              color: 'rgb(10, 31, 51)',
            }}
          >
            系统界面暂时中断｜证见 EVI-X
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              color: 'rgb(83, 102, 119)',
            }}
          >
            当前页面遇到瞬时网络或运行状态波动，你的研究资料、问卷草稿与项目进度均已安全保留。可尝试重新载入当前内容，或返回工作台首页继续开展研究。
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              marginTop: '22px',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: '40px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid rgb(15, 118, 110)',
                backgroundColor: 'rgb(15, 118, 110)',
                color: 'rgb(255, 255, 255)',
                font: 'inherit',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              重新载入当前内容
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '40px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(10, 31, 51, 0.2)',
                backgroundColor: 'rgb(255, 254, 250)',
                color: 'rgb(10, 31, 51)',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              返回工作台首页
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
