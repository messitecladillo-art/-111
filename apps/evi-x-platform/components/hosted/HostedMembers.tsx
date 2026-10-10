'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { parseCollection, parseMember, ROLE_LABELS, type Member, type MembershipRole } from '@evix/shared';
import { hostedRequest, errorMessage } from './api-client';
import { useHostedSession } from './HostedSession';

export default function HostedMembers({ teamId, role }: { teamId: string; role: MembershipRole }) {
  const auth = useHostedSession(), [members, setMembers] = useState<Member[]>([]), [email, setEmail] = useState(''), [newRole, setRole] = useState<Exclude<MembershipRole, 'owner'>>('editor'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), epoch = useRef(0);
  const reload = useCallback(async () => { if (role !== 'owner') return; const n = ++epoch.current; try { const rows = parseCollection(await hostedRequest(`/api/teams/${teamId}/members`), 'members', parseMember); if (n === epoch.current) setMembers(rows); } catch (e) { if (n === epoch.current) setError(errorMessage(e)); } }, [teamId, role]);
  // Fetch after the effect commits; results land through reload's epoch guard.
  useEffect(() => { const counter = epoch; const timer = role === 'owner' ? setTimeout(() => void reload(), 0) : undefined; return () => { clearTimeout(timer); counter.current++; }; }, [reload, role, auth.identityEpoch]);
  async function add(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await auth.mutate(`/api/teams/${teamId}/members`, { email: email.trim().toLowerCase(), role: newRole }); setEmail(''); setNotice('成员权限已添加。此操作不会发送邮件。'); await reload(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function remove(member: Member) { if (!window.confirm(`撤销 ${member.email} 的团队权限？其后续项目访问将被拒绝。`)) return; setBusy(true); setError(''); try { await auth.mutate(`/api/teams/${teamId}/members/${member.userId}`, undefined, 'DELETE'); setNotice('成员权限已撤销。已读取的本地内容不会被远程擦除。'); await reload(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  if (role !== 'owner') return <p className="hosted-notice">你的角色是{ROLE_LABELS[role]}。成员邮箱和管理入口仅由团队负责人查看。</p>;
  return <section className="hosted-card"><div className="hosted-section-title"><h2>团队成员</h2><button className="hosted-secondary" disabled={busy} onClick={() => void reload()}>刷新成员</button></div><p className="hosted-small">新成员需要先使用全局受邀邮箱完成登录。个人模型密钥和额度不因加入团队而共享。</p><form className="hosted-inline-form" onSubmit={add}><label>受邀成员邮箱<input type="email" maxLength={254} required value={email} disabled={busy} onChange={e => setEmail(e.target.value)}/></label><label>项目权限<select value={newRole} disabled={busy} onChange={e => setRole(e.target.value as typeof newRole)}><option value="editor">编辑成员</option><option value="reviewer">复核成员（本期只读）</option><option value="viewer">只读成员</option></select></label><button className="hosted-primary" disabled={busy || !email.trim()}>添加成员</button></form>{error && <p className="hosted-alert" role="alert">{error}</p>}{notice && <p className="hosted-notice" role="status">{notice}</p>}
    <div className="hosted-table-wrap"><table><thead><tr><th>邮箱</th><th>角色</th><th>管理</th></tr></thead><tbody>{members.map(m => <tr key={m.userId}><td>{m.email}</td><td>{ROLE_LABELS[m.role]}</td><td>{m.role === 'owner' ? <span className="hosted-small">负责人</span> : <button className="hosted-danger" disabled={busy} onClick={() => void remove(m)}>撤销权限</button>}</td></tr>)}</tbody></table></div>
  </section>;
}
