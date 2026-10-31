'use client';
import { useRef, useState, type FormEvent } from 'react';
import { parseSession } from '@evix/shared';
import { errorMessage, hostedRequest } from './api-client';
import { useHostedSession } from './HostedSession';
import { HostedReceipt } from './HostedFrame';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

export default function HostedLogin() {
  const auth = useHostedSession(), [email, setEmail] = useState(''), [invite, setInvite] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const sentEmail = useRef('');
  const steps = useKeyedListMotion<HTMLDivElement>({ ids: ['email', 'verify', 'project'], activeId: challenge ? 'verify' : 'email' });
  const codeLabel = useContentReveal<HTMLSpanElement>({ token: challenge || null });
  async function send(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const normalized = email.trim().toLowerCase(); const result = await hostedRequest('/api/auth/code', { method: 'POST', body: { email: normalized, ...(invite.trim() ? { inviteCode: invite.trim() } : {}) } }) as { challengeId?: unknown }; if (typeof result.challengeId !== 'string') throw Error('验证码请求未收到可核对的回执。'); sentEmail.current = normalized; setChallenge(result.challengeId); setCode(''); setNotice('受邀邮箱或凭有效邀请码注册的邮箱将收到验证码，十分钟内有效；重发需间隔一分钟。'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function verify(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { if (sentEmail.current !== email.trim().toLowerCase()) throw Error('邮箱已经改变，请重新获取验证码。'); if (!/^\d{6}$/.test(code)) throw Error('请输入六位验证码。'); const value = parseSession(await hostedRequest('/api/auth/verify', { method: 'POST', body: { challengeId: challenge, code } })); auth.accept(value); await auth.refresh(); auth.announce(); setCode(''); auth.navigate('/projects'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <section className="hosted-login-card"><div className="hosted-login-intro"><span className="hosted-kicker">欢迎回到证见</span><h2>让研究有据可循。</h2><p>登录后管理项目、保存问卷版本，接入个人模型服务。</p><div className="hosted-steps" ref={steps}><i className="hosted-step-marker" data-motion-marker aria-hidden="true" hidden/><span data-motion-id="email" data-active={!challenge} aria-current={!challenge ? 'step' : undefined}>01 邮箱与邀请码</span><span data-motion-id="verify" data-active={!!challenge} aria-current={challenge ? 'step' : undefined}>02 验证身份</span><span data-motion-id="project">03 开始项目</span></div></div><div>
    <form onSubmit={send} aria-busy={busy}><label>邮箱<input type="email" value={email} maxLength={254} autoComplete="email" required disabled={busy} onChange={e => { setEmail(e.target.value); setChallenge(''); setNotice(''); }}/></label><label>邀请码（首次注册时填写）<input value={invite} maxLength={64} autoComplete="off" spellCheck={false} placeholder="例如 ABCD-EFGH-JKMN" disabled={busy} onChange={e => { setInvite(e.target.value); setChallenge(''); setNotice(''); }}/></label><button className="hosted-secondary" data-pending={busy || undefined} disabled={busy || !email.trim()}>{busy ? '正在处理…' : challenge ? '重新获取验证码' : '获取验证码'}</button></form>
    {challenge && <form onSubmit={verify} aria-busy={busy}><label><span ref={codeLabel}>六位验证码</span><input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required disabled={busy} onChange={e => setCode(e.target.value)}/></label><button className="hosted-primary" data-pending={busy || undefined} disabled={busy || code.length !== 6}>验证并进入</button></form>}
    <HostedReceipt text={notice}/><HostedReceipt text={error} tone="alert"/><p className="hosted-small">内测仅限受邀邮箱或持有邀请码的新成员。已注册的账号直接用邮箱登录；未收到验证码时，请核对邮箱与邀请码，或联系管理员。</p>
  </div></section>;
}
