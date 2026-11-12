'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CAPABILITY_LABELS, PROVIDER_BASES, parseCollection, parseService, type Service, type ServiceCapability, type ServiceProvider } from '@evix/shared';
import { hostedRequest, errorMessage, HostedApiError } from './api-client';
import { useHostedSession } from './HostedSession';
import { HostedReceipt, LoginRequired } from './HostedFrame';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';
import ModelRoutingSettings from '@/components/agent/ModelRoutingSettings';
import { MODEL_SERVICES_UPDATED } from '@/lib/agent/model-routing';
import styles from './HostedServices.module.css';

type Form = { label: string; provider: ServiceProvider; baseUrl: string; model: string; maxOutputTokens: string; capabilities: ServiceCapability[] };
const blank = (): Form => ({ label: '', provider: 'openai', baseUrl: PROVIDER_BASES.openai, model: '', maxOutputTokens: '1024', capabilities: ['questionnaire', 'research', 'report', 'defense'] });
const providers: Record<ServiceProvider, { label: string; mark: string }> = {
  openai: { label: 'OpenAI', mark: 'O' }, anthropic: { label: 'Anthropic · Claude', mark: 'A' },
  gemini: { label: 'Google · Gemini', mark: 'G' }, deepseek: { label: 'DeepSeek', mark: 'D' },
  qwen: { label: '千问', mark: 'Q' }, compatible: { label: '其他兼容服务', mark: '+' },
};
function ServiceIcon({ kind }: { kind: 'key' | 'route' | 'refresh' | 'lock' | 'plus' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'key' ? <><circle cx="8.5" cy="8.5" r="4.5"/><path d="m12 12 8 8m-4-4 2-2m-5-1 2-2"/></>
      : kind === 'route' ? <><rect x="3" y="4" width="6" height="6" rx="1.5"/><rect x="15" y="14" width="6" height="6" rx="1.5"/><path d="M9 7h6a3 3 0 0 1 3 3v4M6 10v7h9"/></>
        : kind === 'refresh' ? <><path d="M20 8a8 8 0 1 0 .2 7M20 3v5h-5"/></>
          : kind === 'lock' ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>
            : <path d="M12 5v14M5 12h14"/>}
  </svg>;
}
export default function HostedServices() { return <LoginRequired><ServicePanel/></LoginRequired>; }
function ServiceSummary({ service }: { service: Service }) {
  const summary = useContentReveal<HTMLDivElement>({ token: `${service.id}:${service.revision}` });
  return <div ref={summary}>
    <div className={styles.serviceHeading}>
      <span className={styles.providerMark} aria-hidden="true">{providers[service.provider].mark}</span>
      <div><p className={styles.providerName}>{providers[service.provider].label}</p><h3>{service.label}</h3></div>
      <span className={styles.revision}>v{service.revision}</span>
    </div>
    <p className={styles.modelId}>{service.model}</p>
    <div className={styles.tags}>{service.capabilities.map(c => <span key={c}>{CAPABILITY_LABELS[c]}</span>)}</div>
  </div>;
}
function ServicePanel() {
  const nameInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'routing' | 'connections' | null>(null);
  const auth = useHostedSession(), [services, setServices] = useState<Service[]>([]), [form, setForm] = useState<Form>(blank), [editing, setEditing] = useState<Service | null>(null), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [uncertain, setUncertain] = useState(false);
  const activeTab = tab ?? (loading || !services.length ? 'connections' : 'routing');
  const changed=()=>{const ownerId=auth.session?.user?.id;if(ownerId)window.dispatchEvent(new CustomEvent(MODEL_SERVICES_UPDATED,{detail:{ownerId,identityEpoch:auth.identityEpoch}}));};
  const epoch = useRef(0), pending = useRef<{ method: string; path: string; body: Record<string, unknown> } | null>(null);
  const directory = useKeyedListMotion<HTMLElement>({ ids: services.map(service => service.id), activeId: editing?.id, enabled: !loading });
  const reload = useCallback(async () => { const n = ++epoch.current; setLoading(true); try { const rows = parseCollection(await hostedRequest('/api/services'), 'services', parseService, 8); if (n === epoch.current) setServices(rows); } catch (e) { if (n === epoch.current) setError(errorMessage(e)); } finally { if (n === epoch.current) setLoading(false); } }, []);
  // An identity change remounts this panel (HostedSession keys children by identityEpoch), so state starts fresh;
  // only the fetch is needed, deferred until after the effect commits.
  useEffect(() => { const counter = epoch; pending.current = null; const timer = setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); counter.current++; pending.current = null; }; }, [reload, auth.identityEpoch]);
  function focusForm() { nameInput.current?.focus({ preventScroll: true }); nameInput.current?.scrollIntoView({ block: 'center', behavior: 'auto' }); }
  function edit(service: Service) { if (busy || uncertain) return; setEditing(service); setForm({ ...service, maxOutputTokens: String(service.maxOutputTokens) }); setKey(''); setError(''); setNotice('密钥留空会保留原密钥；更换服务商或地址需重新填写。'); focusForm(); }
  function provider(value: ServiceProvider) { setForm(f => ({ ...f, provider: value, baseUrl: value === 'compatible' ? '' : PROVIDER_BASES[value] })); }
  async function submit(e?: FormEvent) {
    e?.preventDefault(); setError('');
    if (!pending.current) {
      const maxOutputTokens = Number(form.maxOutputTokens);
      if (!form.label.trim() || !form.model.trim() || !form.capabilities.length || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 4096) { setError('请填写名称、模型、至少一项能力，以及128–4096的整数输出上限。'); return; }
      if (!editing && !key) { setError('首次保存需要填写 API Key。'); return; }
      if (editing && (editing.provider !== form.provider || editing.baseUrl !== form.baseUrl) && !key) { setError('更换服务商或地址需要重新填写 API Key。'); return; }
      pending.current = { method: editing ? 'PUT' : 'POST', path: editing ? `/api/services/${editing.id}` : '/api/services', body: { label: form.label.trim(), provider: form.provider, baseUrl: form.baseUrl, model: form.model.trim(), maxOutputTokens, capabilities: form.capabilities, ...(key ? { apiKey: key } : {}), ...(editing ? { expectedRevision: editing.revision } : {}), idempotencyKey: crypto.randomUUID() } };
    }
    setBusy(true);
    try { const operation = pending.current; parseService(await auth.mutate(operation.path, operation.body, operation.method)); pending.current = null; setUncertain(false); setEditing(null); setForm(blank()); setNotice('服务配置已保存。各研究步骤可以选择这个命名服务。'); await reload(); changed(); }
    catch (e) { setError(errorMessage(e)); if(e instanceof HostedApiError && e.status>=400 && e.status<500){pending.current=null;setUncertain(false);if(e.status===409)void reload();}else setUncertain(true); }
    finally { setKey(''); setBusy(false); }
  }
  async function remove(service: Service) { if (!window.confirm(`移除“${service.label}”的密钥配置？后续调用将无法使用它；已发送的请求不保证撤回。`)) return; setBusy(true); setError(''); try { await auth.mutate(`/api/services/${service.id}`, { expectedRevision: service.revision, idempotencyKey: crypto.randomUUID() }, 'DELETE'); if (editing?.id === service.id) { setEditing(null); setForm(blank()); setKey(''); } setNotice('服务配置已移除。'); await reload(); changed(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <div className={styles.services} data-self-styled>
    <div className={styles.navigation}>
      <div className={styles.tabs} role="tablist" aria-label="模型设置" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'connections' : event.key === 'End' ? 'routing' : activeTab === 'connections' ? 'routing' : 'connections';
        setTab(next); document.getElementById(`model-${next}-tab`)?.focus();
      }}>
        <button type="button" role="tab" id="model-connections-tab" aria-selected={activeTab === 'connections'} aria-controls="model-connections-panel" tabIndex={activeTab === 'connections' ? 0 : -1} onClick={() => setTab('connections')}><ServiceIcon kind="key"/>服务接入</button>
        <button type="button" role="tab" id="model-routing-tab" aria-selected={activeTab === 'routing'} aria-controls="model-routing-panel" tabIndex={activeTab === 'routing' ? 0 : -1} onClick={() => setTab('routing')}><ServiceIcon kind="route"/>任务分工</button>
      </div>
      <span className={styles.accountScope}><ServiceIcon kind="lock"/>个人模型空间</span>
    </div>
    <div id="model-routing-panel" role="tabpanel" aria-labelledby="model-routing-tab" hidden={activeTab !== 'routing'}>
      <ModelRoutingSettings owner={auth.session?.user?.id ?? null} services={services} loading={loading} onManageServices={() => setTab('connections')}/>
      <HostedReceipt text={error} tone="alert"/>
    </div>
    <div id="model-connections-panel" role="tabpanel" aria-labelledby="model-connections-tab" hidden={activeTab !== 'connections'}>
      <div className={styles.layout}>
        <section className={styles.formCard} aria-labelledby="service-form-title">
          <header className={styles.formHeader}>
            <span className={styles.headerIcon}><ServiceIcon kind={editing ? 'key' : 'plus'}/></span>
            <div><h2 id="service-form-title">{editing ? `修改 ${editing.label}` : '添加模型服务'}</h2><p>{editing ? '更新配置后，后续调用使用新版本。' : '保存一个名字，在研究的每一步调用。'}</p></div>
          </header>
          <form onSubmit={submit}>
            <fieldset disabled={busy || uncertain || loading}>
              <div className={styles.fieldGrid}>
                <label>配置名称<input ref={nameInput} required maxLength={80} placeholder="例如：我的研究助手" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}/></label>
                <label>服务商<select value={form.provider} onChange={e => provider(e.target.value as ServiceProvider)}>{(Object.keys(providers) as ServiceProvider[]).map(value => <option key={value} value={value}>{providers[value].label}</option>)}</select></label>
              </div>
              <label>模型 ID<input required maxLength={120} placeholder="填写服务商提供的模型 ID" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}/></label>
              <label><span className={styles.labelRow}>API Key<span>{editing ? '留空保留原密钥' : '加密保存，不回显'}</span></span><input type="password" autoComplete="off" data-lpignore="true" spellCheck={false} maxLength={512} value={key} placeholder="输入 API Key" onChange={e => setKey(e.target.value)}/></label>
              <fieldset className={styles.capabilities}><legend>可用任务</legend><div>{(Object.keys(CAPABILITY_LABELS) as ServiceCapability[]).map(c => <label key={c} data-checked={form.capabilities.includes(c)}><input type="checkbox" checked={form.capabilities.includes(c)} onChange={e => setForm(f => ({ ...f, capabilities: e.target.checked ? [...f.capabilities, c] : f.capabilities.filter(x => x !== c) }))}/>{CAPABILITY_LABELS[c]}</label>)}</div></fieldset>
              <details className={styles.advanced} open={form.provider === 'compatible'}>
                <summary>高级设置<span>服务地址与输出上限</span></summary>
                <label>服务地址<input required maxLength={512} value={form.baseUrl} readOnly={form.provider !== 'compatible'} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}/></label>
                <p className={styles.fieldHelp}>兼容地址须经服务器管理员批准，不含密钥、账号参数或本机地址。</p>
                <label>单次输出上限（tokens）<input type="number" min={128} max={4096} step={1} required value={form.maxOutputTokens} onChange={e => setForm(f => ({ ...f, maxOutputTokens: e.target.value }))}/></label>
              </details>
              <div className={styles.formActions}>
                <button type="submit" className={styles.primary} disabled={!editing && services.length >= 8}>{busy ? '正在保存…' : editing ? '保存修改' : '加密保存配置'}<span aria-hidden="true">→</span></button>
                {editing && <button type="button" className={styles.secondary} onClick={() => { setEditing(null); setForm(blank()); setKey(''); focusForm(); }}>取消修改</button>}
              </div>
              {!editing && services.length >= 8 && <p className={styles.fieldHelp}>已达 8 项上限，移除一项后可继续添加。</p>}
            </fieldset>
          </form>
          {uncertain && <div className="hosted-notice"><p>保存状态待核对。重试沿用原请求、原密钥和原内容。</p><div className={styles.receiptActions}><button className={styles.secondary} disabled={busy} onClick={() => void submit()}>核对并重试原保存</button><button className={styles.secondary} disabled={busy} onClick={() => { pending.current = null; setUncertain(false); setKey(''); void reload(); }}>取消重试，刷新列表</button></div></div>}
          {busy && <p className="hosted-pending-status" role="status"><span aria-hidden="true"/>正在处理配置请求…</p>}
          <HostedReceipt text={error} tone="alert"/><HostedReceipt text={notice}/>
          <p className={styles.privacy}><ServiceIcon kind="lock"/><span>密钥不存入浏览器，仅你本人可用。</span></p>
        </section>
        <section className={styles.directory} ref={directory} aria-busy={loading} aria-labelledby="service-directory-title">
          <i className="hosted-step-marker" data-motion-marker aria-hidden="true" hidden/>
          <header className={styles.directoryHeader}><div><h2 id="service-directory-title">已保存的服务</h2><span className={styles.count}>{services.length}<span> / 8</span></span></div><button className={styles.refresh} aria-label="刷新服务列表" data-pending={loading || undefined} disabled={loading || busy} onClick={() => void reload()}><ServiceIcon kind="refresh"/>刷新</button></header>
          {loading ? <div className={styles.loading} role="status"><span/>正在读取配置…</div>
            : !services.length ? <div className={styles.empty}>
              <div className={styles.emptyIllustration} aria-hidden="true"><span>Q</span><span>D</span><span>I</span><span>A</span><ServiceIcon kind="route"/></div>
              <h3>让合适的模型，接力你的研究</h3><p>添加服务后，为选题、问卷和报告安排模型。</p>
              <button className={styles.secondary} disabled={busy || uncertain} onClick={() => nameInput.current?.focus()}><ServiceIcon kind="plus"/>添加第一个服务</button>
            </div>
              : <div className={styles.serviceList}>{services.map(s => <article key={s.id} data-motion-id={s.id} className={styles.serviceCard} data-selected={editing?.id === s.id}>
                <ServiceSummary service={s}/>
                <footer className={styles.cardActions}><button className={styles.editButton} disabled={busy || uncertain} aria-label={`修改 ${s.label} 的配置`} onClick={() => edit(s)}>修改配置<span aria-hidden="true">↗</span></button><button className={styles.removeButton} disabled={busy || uncertain} aria-label={`移除 ${s.label}`} onClick={() => void remove(s)}>移除</button></footer>
              </article>)}</div>}
        </section>
      </div>
    </div>
  </div>;
}
