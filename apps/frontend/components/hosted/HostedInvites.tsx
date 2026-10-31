'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, hostedRequest, HostedApiError } from './api-client';
import { useHostedSession } from './HostedSession';
import { HostedReceipt, LoginRequired } from './HostedFrame';

type InviteStatus = 'active' | 'used_up' | 'expired' | 'revoked';
type Invite = { id: string; label: string; maxUses: number; uses: number; status: InviteStatus; createdAt: string; expiresAt: string; revokedAt: string | null };
const STATUS_LABELS: Record<InviteStatus, string> = { active: '可用', used_up: '已用完', expired: '已过期', revoked: '已作废' };

/** One invitation as the API returns it; anything else is refused rather than shown. */
function parseInvite(value: unknown): Invite {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.id !== 'string' || typeof v.label !== 'string' || !Number.isInteger(v.maxUses) || !Number.isInteger(v.uses)
    || !['active', 'used_up', 'expired', 'revoked'].includes(v.status as string) || typeof v.createdAt !== 'string' || typeof v.expiresAt !== 'string'
    || (v.revokedAt !== null && typeof v.revokedAt !== 'string')) throw Error('邀请码记录格式无效。');
  return { id: v.id, label: v.label, maxUses: v.maxUses as number, uses: v.uses as number, status: v.status as InviteStatus, createdAt: v.createdAt, expiresAt: v.expiresAt, revokedAt: v.revokedAt as string | null };
}
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN');

export default function HostedInvites() { return <LoginRequired><InvitePanel/></LoginRequired>; }

function InvitePanel() {
  const auth = useHostedSession(), epoch = useRef(0);
  const [invites, setInvites] = useState<Invite[]>([]), [forbidden, setForbidden] = useState(false), [loading, setLoading] = useState(true);
  const [label, setLabel] = useState(''), [maxUses, setMaxUses] = useState('1'), [days, setDays] = useState('7');
  const [fresh, setFresh] = useState<{ code: string; label: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    const n = ++epoch.current;
    try {
      const value = await hostedRequest('/api/invites') as { invites?: unknown };
      if (!Array.isArray(value.invites)) throw Error('邀请码列表格式无效。');
      if (n === epoch.current) { setInvites(value.invites.map(parseInvite)); setForbidden(false); }
    } catch (e) {
      if (n !== epoch.current) return;
      if (e instanceof HostedApiError && e.code === 'invite_forbidden') setForbidden(true); else setError(errorMessage(e));
    } finally { if (n === epoch.current) setLoading(false); }
  }, []);
  // Fetch after the effect commits; results land through reload's epoch guard.
  useEffect(() => { const counter = epoch; const timer = setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); counter.current++; }; }, [reload, auth.identityEpoch]);

  async function create(e: FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    const uses = Number(maxUses), lifetime = Number(days);
    if (!label.trim() || !Number.isInteger(uses) || uses < 1 || uses > 50 || !Number.isInteger(lifetime) || lifetime < 1 || lifetime > 30) { setError('请填写用途说明，可用次数 1–50，有效天数 1–30。'); return; }
    setBusy(true);
    try {
      const value = await auth.mutate('/api/invites', { label: label.trim(), maxUses: uses, days: lifetime }) as { code?: unknown };
      if (typeof value.code !== 'string') throw Error('未收到邀请码。');
      setFresh({ code: value.code, label: label.trim() }); setLabel(''); await reload();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function copy() {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh.code); setNotice('已复制邀请码。'); } catch { setNotice('无法自动复制，请手动选中邀请码复制。'); }
  }
  async function revoke(invite: Invite) {
    if (!window.confirm(`作废“${invite.label}”的邀请码？已用它注册的账号不受影响，之后不能再用它注册。`)) return;
    setBusy(true); setError('');
    try { await auth.mutate(`/api/invites/${invite.id}/revoke`, {}); setNotice('邀请码已作废。'); await reload(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  if (loading) return <p className="hosted-empty" role="status">正在读取邀请码…</p>;
  if (forbidden) return <p className="hosted-notice">只有管理员可以发放邀请码。需要邀请他人时，请联系管理员。</p>;
  return <>
    <section className="hosted-card">
      <span className="hosted-kicker">邀请新成员</span><h2>发放邀请码</h2>
      <p className="hosted-small">对方在登录页填写邮箱与邀请码，收到验证码后即可注册。每个邀请码按可用次数注册账号，到期或作废后失效；已注册的账号之后直接用邮箱登录。</p>
      <form className="hosted-invite-form" onSubmit={create} aria-busy={busy}>
        <label>用途说明<input value={label} maxLength={40} required disabled={busy} placeholder="例如：数据组队友" onChange={e => setLabel(e.target.value)}/></label>
        <label>可用次数<input type="number" min={1} max={50} value={maxUses} required disabled={busy} onChange={e => setMaxUses(e.target.value)}/></label>
        <label>有效天数<input type="number" min={1} max={30} value={days} required disabled={busy} onChange={e => setDays(e.target.value)}/></label>
        <button className="hosted-primary" data-pending={busy || undefined} disabled={busy || !label.trim()}>生成邀请码</button>
      </form>
      {fresh && <div className="hosted-notice" role="status"><p>“{fresh.label}”的邀请码（只显示这一次，请现在复制并发给对方）：</p><div className="hosted-invite-code"><code>{fresh.code}</code><button type="button" className="hosted-secondary" onClick={() => void copy()}>复制</button></div></div>}
      <HostedReceipt text={notice}/><HostedReceipt text={error} tone="alert"/>
    </section>
    <section className="hosted-card">
      <h3>已发放的邀请码</h3>
      {invites.length ? <div className="hosted-table-wrap"><table><thead><tr><th>用途</th><th>已用 / 可用</th><th>状态</th><th>有效至</th><th>管理</th></tr></thead><tbody>
        {invites.map(invite => <tr key={invite.id}><td>{invite.label}</td><td>{invite.uses} / {invite.maxUses}</td><td>{STATUS_LABELS[invite.status]}</td><td>{day(invite.expiresAt)}</td>
          <td>{invite.status === 'active' ? <button type="button" className="hosted-secondary" disabled={busy} onClick={() => void revoke(invite)}>作废</button> : '—'}</td></tr>)}
      </tbody></table></div> : <p className="hosted-small">还没有发放邀请码。</p>}
    </section>
  </>;
}
