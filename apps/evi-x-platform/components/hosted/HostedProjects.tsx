'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { parseCollection, parseProject, parseTeam, ROLE_LABELS, type Project, type Team } from '@evix/shared';
import { errorMessage, hostedRequest, HostedApiError } from './api-client';
import { useHostedSession } from './HostedSession';
import { HostedReceipt, LoginRequired } from './HostedFrame';
import { useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

export default function HostedProjects() { return <LoginRequired><ProjectList/></LoginRequired>; }
function ProjectList() {
  const auth = useHostedSession(), [projects, setProjects] = useState<Project[]>([]), [teams, setTeams] = useState<Team[]>([]), [teamId, setTeamId] = useState(''), [title, setTitle] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [uncertain, setUncertain] = useState(false);
  const request = useRef<{ title: string; teamId: string; idempotencyKey: string } | null>(null), epoch = useRef(0);
  const directory = useKeyedListMotion<HTMLDivElement>({ ids: projects.map(project => project.id), enabled: !loading });
  const reload = useCallback(async () => { const n = ++epoch.current; setLoading(true); setError(''); try { const [p, t] = await Promise.all([hostedRequest('/api/projects'), hostedRequest('/api/teams')]); const rows = parseCollection(p, 'projects', parseProject), groups = parseCollection(t, 'teams', parseTeam); if (n !== epoch.current) return; setProjects(rows); setTeams(groups); setTeamId(id => groups.some(g => g.id === id && ['owner', 'editor'].includes(g.role)) ? id : groups.find(g => ['owner', 'editor'].includes(g.role))?.id || ''); } catch (e) { if (n === epoch.current) setError(errorMessage(e)); } finally { if (n === epoch.current) setLoading(false); } }, []);
  // Fetch after the effect commits; results land through reload's epoch guard.
  useEffect(() => { const counter = epoch; const timer = setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); counter.current++; }; }, [reload, auth.identityEpoch]);
  async function create(e?: FormEvent) { e?.preventDefault(); setBusy(true); setError(''); request.current ??= { title: title.trim(), teamId, idempotencyKey: crypto.randomUUID() }; const payload = request.current; try { const p = parseProject(await auth.mutate('/api/projects', payload)); request.current = null; setUncertain(false); setTitle(''); setNotice('项目已创建。现在可以写研究需求或直接编辑问卷。'); setProjects(rows => [p, ...rows.filter(r => r.id !== p.id)]); auth.navigate(`/projects/${p.id}`); } catch (e) { setError(errorMessage(e)); if(e instanceof HostedApiError && e.status>=400 && e.status<500){request.current=null;setUncertain(false);}else setUncertain(true); } finally { setBusy(false); } }
  return <><section className="hosted-card hosted-create"><div><span className="hosted-kicker">从一个真实问题开始</span><h2>新建研究项目</h2><p>从问卷设计与回收到数据分析，保存报告和 PPT 的每一次修订。</p></div><form onSubmit={create}><label>项目名称<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required disabled={busy || uncertain} placeholder="例如：校园预约服务的流程改进"/></label><label>所属团队<select value={teamId} onChange={e => setTeamId(e.target.value)} required disabled={busy || uncertain}>{!teamId && <option value="">没有可创建项目的团队</option>}{teams.filter(t => ['owner', 'editor'].includes(t.role)).map(t => <option key={t.id} value={t.id}>{t.name} · {ROLE_LABELS[t.role]}</option>)}</select></label><button className="hosted-primary" disabled={busy || !teamId || !title.trim() || uncertain}>{busy ? '正在创建…' : '创建项目'}</button></form>
    {uncertain && <div className="hosted-notice"><p>上次创建尚待核对。重试使用原请求，不重复创建新的项目。</p><button disabled={busy} onClick={() => void create()}>核对并重试上次创建</button><button disabled={busy} onClick={() => { request.current = null; setUncertain(false); void reload(); }}>先查看项目列表</button></div>}</section>
    <HostedReceipt text={error} tone="alert"/><HostedReceipt text={notice}/>
    <div className="hosted-section-title"><h2>我的项目 <small>{projects.length}</small></h2><button className="hosted-secondary" data-pending={loading || undefined} onClick={() => void reload()} disabled={loading}>刷新列表</button></div>
    <div className="hosted-project-directory" ref={directory} aria-busy={loading}>{loading ? <div className="hosted-loading" role="status">正在读取已保存的项目…</div> : !projects.length ? <div className="hosted-empty"><h3>还没有项目</h3><p>创建项目，保存所属团队的问卷设计和历史版本。</p></div> : <div className="hosted-project-grid">{projects.map(p => <Link key={p.id} data-motion-id={p.id} className="hosted-project-card" href={`/projects/${p.id}`}><span className="hosted-kicker">研究项目 · v{p.revision}</span><h3>{p.title}</h3><p>{teams.find(t => t.id === p.teamId)?.name || '共享团队'}</p><div><span>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</span><strong>进入工作台 →</strong></div></Link>)}</div>}</div>
  </>;
}
