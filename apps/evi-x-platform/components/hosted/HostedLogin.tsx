'use client';
import { useRef, useState, type FormEvent } from 'react';
import { parseSession } from '@evix/shared';
import { errorMessage, hostedRequest } from './api-client';
import { useHostedSession } from './HostedSession';

export default function HostedLogin() {
  const auth = useHostedSession(), [email, setEmail] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const sentEmail = useRef('');
  async function send(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const normalized = email.trim().toLowerCase(); const result = await hostedRequest('/api/auth/code', { method: 'POST', body: { email: normalized } }) as { challengeId?: unknown }; if (typeof result.challengeId !== 'string') throw Error('验证码请求未收到可核对的回执。'); sentEmail.current = normalized; setChallenge(result.challengeId); setCode(''); setNotice('如果此邮箱已获邀请，验证码会送达。请在十分钟内填写；重发至少间隔一分钟。'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function verify(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { if (sentEmail.current !== email.trim().toLowerCase()) throw Error('邮箱已经改变，请重新获取验证码。'); if (!/^\d{6}$/.test(code)) throw Error('请输入六位验证码。'); const value = parseSession(await hostedRequest('/api/auth/verify', { method: 'POST', body: { challengeId: challenge, code } })); auth.accept(value); await auth.refresh(); auth.announce(); setCode(''); auth.navigate('/projects'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <section className="hosted-login-card"><div className="hosted-login-intro"><span className="hosted-kicker">欢迎回到证见</span><h2>让研究有据可循。</h2><p>一个账号保存你的项目和问卷版本。在自己的模型服务中填入 API Key，再回到项目提出研究需求。</p><div className="hosted-steps"><span>01 受邀邮箱</span><span>02 验证身份</span><span>03 开始项目</span></div></div><div>
    <form onSubmit={send}><label>邮箱<input type="email" value={email} maxLength={254} autoComplete="email" required disabled={busy} onChange={e => { setEmail(e.target.value); setChallenge(''); setNotice(''); }}/></label><button className="hosted-secondary" disabled={busy || !email.trim()}>{busy ? '正在处理…' : challenge ? '重新获取验证码' : '获取验证码'}</button></form>
    {challenge && <form onSubmit={verify}><label>六位验证码<input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required disabled={busy} onChange={e => setCode(e.target.value)}/></label><button className="hosted-primary" disabled={busy || code.length !== 6}>验证并进入</button></form>}
    {notice && <p className="hosted-notice" role="status">{notice}</p>}{error && <p className="hosted-alert" role="alert">{error}</p>}<p className="hosted-small">仅面向受邀账号内测。页面不会显示验证码；未收到时请核对邮箱或联系管理员。</p>
  </div></section>;
}
