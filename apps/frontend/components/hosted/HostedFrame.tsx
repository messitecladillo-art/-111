'use client';
import Link from 'next/link';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import BrandMark from '@/components/brand/BrandMark';
import { PageHeading, ThemeProvider, ThemeToggle, WorkbenchFooter, WorkbenchSidebar, useThemePreference, type Section } from '@/components/workbench/shell-kit';
import { useHostedSession } from './HostedSession';
import { errorMessage } from './api-client';
import { useContentReveal } from '@/components/motion/useWorkspaceMotion';

export function HostedReceipt({ text, tone = 'notice' }: { text: string; tone?: 'notice' | 'alert' }) {
  const receipt = useContentReveal<HTMLParagraphElement>({ token: text ? `${tone}:${text}` : null, enabled: tone !== 'alert' });
  return text ? <p ref={receipt} className={`hosted-${tone}`} role={tone === 'alert' ? 'alert' : 'status'}>{text}</p> : null;
}

export function AccountStatus() {
  const { session, loading, error, logout, refresh } = useHostedSession(), [notice, setNotice] = useState('');
  return <div className="hosted-account" data-state={loading ? 'loading' : error ? 'error' : session?.authenticated ? 'authenticated' : 'signed-out'} aria-busy={loading}>
    {loading ? <span>正在核对登录状态…</span> : error ? <><span role="alert">账号服务暂未就绪</span><button onClick={() => void refresh().catch(e => setNotice(errorMessage(e)))}>重新连接</button></> : session?.authenticated ? <><span>{session.user?.email}</span><button onClick={() => void logout().catch(e => setNotice(errorMessage(e)))}>退出</button></> : <Link href="/login">邮箱登录</Link>}
    {notice && <span role="alert">{notice}</span>}
  </div>;
}
export default function HostedFrame({ title, subtitle, children, variant = 'app', density }: { title: string; subtitle: string; children: ReactNode; variant?: 'app' | 'auth'; density?: 'compact' }) {
  const pathname = usePathname(), theme = useThemePreference(), [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const { openSearch } = useKnowledge();
  if (variant === 'auth') return <ThemeProvider value={theme}><div className="workbench hosted-app hosted-auth" data-theme={theme}>
    <a className="hosted-skip" href="#hosted-content">跳到主要内容</a>
    <header className="hosted-auth-bar"><Link className="wb-brand" href="/"><BrandMark size={32}/><span><strong>证见 EVI-X</strong><small>正大杯研究工作台</small></span></Link><div className="wb-top-actions"><Link className="hosted-ghost-link" href="/workspace">先看看研究工具</Link><ThemeToggle theme={theme}/></div></header>
    <main id="hosted-content" className="hosted-main hosted-auth-main" tabIndex={-1}><h1 className="hosted-sr-only">{title}</h1>{children}</main>
    <WorkbenchFooter/>
  </div></ThemeProvider>;
  const active: Section = pathname.startsWith('/services') || pathname.startsWith('/invites') ? 'services' : 'workspace';
  return <ThemeProvider value={theme}><div className="workbench hosted-app" data-theme={theme} data-section={active} data-page={pathname === '/knowledge' ? 'knowledge' : undefined} data-density={density}>
    <a className="hosted-skip" href="#hosted-content">跳到主要内容</a>
    <WorkbenchSidebar active={pathname === '/knowledge' ? 'knowledge' : active} inWorkspace={false} open={open} setOpen={setOpen} menuRef={menuRef} onSearch={openSearch}/>
    <div className="workbench-main">
      <PageHeading group={pathname === '/knowledge' ? '知识与方法' : active === 'services' ? '服务与设置' : '项目管理'} title={title} description={subtitle} actions={<><button className="wb-search-toggle" onPointerDown={event => event.preventDefault()} onClick={openSearch}>全局搜索 <kbd>Ctrl K</kbd></button><AccountStatus/><ThemeToggle theme={theme}/></>}/>
      <div className="workbench-content"><main id="hosted-content" className="hosted-main" tabIndex={-1}>{children}</main></div>
      <WorkbenchFooter/>
    </div>
  </div></ThemeProvider>;
}
export function LoginRequired({ children }: { children: ReactNode }) { const { session, loading, error } = useHostedSession(); if (loading) return <p className="hosted-empty" role="status">正在读取你的工作区…</p>; if (error && !session?.authenticated) return <p className="hosted-alert" role="alert">{error}</p>; if (!session?.authenticated) return <div className="hosted-empty"><h2>建立属于你的研究项目</h2><p>通过受邀邮箱登录后，项目、问卷版本与个人服务将在账号内保存。</p><Link className="hosted-primary" href="/login">使用邮箱登录</Link></div>; return children; }
