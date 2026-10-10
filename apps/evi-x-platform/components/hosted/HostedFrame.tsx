'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { PageHeading, ThemeProvider, ThemeToggle, WorkbenchFooter, WorkbenchSidebar, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { useHostedSession } from './HostedSession';
import { errorMessage } from './api-client';

export function AccountStatus() {
  const { session, loading, error, logout, refresh } = useHostedSession(), [notice, setNotice] = useState('');
  return <div className="hosted-account">
    {loading ? <span>正在核对登录状态…</span> : error ? <><span role="alert">账号服务暂未就绪</span><button onClick={() => void refresh().catch(e => setNotice(errorMessage(e)))}>重新连接</button></> : session?.authenticated ? <><span>{session.user?.email}</span><button onClick={() => void logout().catch(e => setNotice(errorMessage(e)))}>退出</button></> : <Link href="/login">邮箱登录</Link>}
    {notice && <span role="alert">{notice}</span>}
  </div>;
}
export function EnvironmentNotice() { const { session } = useHostedSession(); return session?.mode === 'local_test' ? <p className="hosted-test-banner" role="status">本地合成验收环境 · 邮件和模型由测试适配器提供，请勿输入真实密钥或调查资料。</p> : null; }
export default function HostedFrame({ title, subtitle, children, variant = 'app', density }: { title: string; subtitle: string; children: ReactNode; variant?: 'app' | 'auth'; density?: 'compact' }) {
  const pathname = usePathname(), theme = useThemePreference(), [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  if (variant === 'auth') return <ThemeProvider value={theme}><div className="workbench hosted-app hosted-auth" data-theme={theme}>
    <a className="hosted-skip" href="#hosted-content">跳到主要内容</a>
    <header className="hosted-auth-bar"><Link className="wb-brand" href="/"><BrandMark size={32}/><span><strong>证见 EVI-X</strong><small>正大杯研究工作台</small></span></Link><div className="wb-top-actions"><Link className="hosted-ghost-link" href="/workspace">先看看研究工具</Link><ThemeToggle theme={theme}/></div></header>
    <main id="hosted-content" className="hosted-main hosted-auth-main" tabIndex={-1}><EnvironmentNotice/><h1 className="hosted-sr-only">{title}</h1>{children}</main>
    <footer className="wb-footer"><span>证见 EVI-X 为独立研究辅助工具，非赛事官方产品</span><span>不承诺奖项结果</span></footer>
  </div></ThemeProvider>;
  const active: Section = pathname.startsWith('/services') ? 'services' : 'workspace';
  return <ThemeProvider value={theme}><div className="workbench hosted-app" data-theme={theme} data-section={active} data-density={density}>
    <a className="hosted-skip" href="#hosted-content">跳到主要内容</a>
    <WorkbenchSidebar active={active} inWorkspace={false} open={open} setOpen={setOpen} menuRef={menuRef}/>
    <div className="workbench-main">
      <PageHeading group={active === 'services' ? '服务与设置' : '项目管理'} title={title} description={subtitle} actions={<><AccountStatus/><ThemeToggle theme={theme}/></>}/>
      <div className="workbench-content"><main id="hosted-content" className="hosted-main" tabIndex={-1}><EnvironmentNotice/>{children}</main></div>
      <WorkbenchFooter/>
    </div>
  </div></ThemeProvider>;
}
export function LoginRequired({ children }: { children: ReactNode }) { const { session, loading, error } = useHostedSession(); if (loading) return <p className="hosted-empty" role="status">正在读取你的工作区…</p>; if (error && !session?.authenticated) return <p className="hosted-alert" role="alert">{error}</p>; if (!session?.authenticated) return <div className="hosted-empty"><h2>建立属于你的研究项目</h2><p>通过受邀邮箱登录后，项目、问卷版本与个人服务将在账号内保存。</p><Link className="hosted-primary" href="/login">使用邮箱登录</Link></div>; return children; }
