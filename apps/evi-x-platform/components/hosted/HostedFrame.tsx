'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
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
export default function HostedFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const pathname = usePathname();
  return <div className="workbench hosted-app" data-theme="light">
    <a className="hosted-skip" href="#hosted-content">跳到主要内容</a>
    <header className="hosted-topbar"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span><span><strong>证见 EVI-X</strong><small>正大杯研究工作台</small></span></Link>
      <nav aria-label="账号与项目导航"><Link href="/workspace">工作台</Link><Link href="/projects" aria-current={pathname === '/projects' || pathname.startsWith('/projects/') ? 'page' : undefined}>我的项目</Link><Link href="/services" aria-current={pathname === '/services' ? 'page' : undefined}>我的模型服务</Link></nav><AccountStatus/>
    </header>
    <main id="hosted-content" className="hosted-main" tabIndex={-1}><EnvironmentNotice/><div className="hosted-heading"><span>Q → D → I → A</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</main>
    <footer className="hosted-footer">证见 EVI-X 为独立研究辅助工具，非赛事官方产品 · 不承诺奖项结果</footer>
  </div>;
}
export function LoginRequired({ children }: { children: ReactNode }) { const { session, loading, error } = useHostedSession(); if (loading) return <p className="hosted-empty" role="status">正在读取你的工作区…</p>; if (error && !session?.authenticated) return <p className="hosted-alert" role="alert">{error}</p>; if (!session?.authenticated) return <div className="hosted-empty"><h2>建立属于你的研究项目</h2><p>通过受邀邮箱登录后，项目、问卷版本与个人服务将在账号内保存。</p><Link className="hosted-primary" href="/login">使用邮箱登录</Link></div>; return children; }
