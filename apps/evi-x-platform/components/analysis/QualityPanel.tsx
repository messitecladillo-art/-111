'use client';
import { useMemo, useState } from 'react';
import { detectQualityColumns, likertCandidates, evaluateQuality, exclusionLedger, keptTable, tableCsv, validateRules, type QualityReport, type QualityRules, type RuleId } from '@/lib/data-quality';
import type { SurveyTable } from '@/lib/survey-analysis';
import type { CollectionOrigin, QualityOrigin } from '@/lib/survey-collection';
import styles from './QualityPanel.module.css';

type Props = { table: SurveyTable; sourceName: string; sourceHash: string; simulated: boolean; silicon: boolean; collection?: CollectionOrigin; missingCodes: string[]; onApply: (csv: string, name: string, origin: QualityOrigin) => void };
const DEFAULT_EXCLUDE: RuleId[] = ['duration', 'attention', 'duplicateAnswers'];
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function sha256(text: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
const stem = (name: string) => name.replace(/\.[^.]+$/, '');

/** Register rules first, then see which responses they flag; nothing is removed until chosen. */
export default function QualityPanel({ table, sourceName, sourceHash, simulated, silicon, collection, missingCodes, onApply }: Props) {
  const detected = useMemo(() => detectQualityColumns(table), [table]);
  const candidates = useMemo(() => likertCandidates(table, missingCodes), [table, missingCodes]);
  const [rules, setRules] = useState<QualityRules>(() => ({
    idColumn: detected.id,
    duration: detected.duration === null ? null : { column: detected.duration, mode: 'median-fraction', value: 0.33 },
    straightlining: null, attention: null,
    duplicateIp: null, duplicateAnswers: true,
  }));
  const [likert, setLikert] = useState<number[]>([]);
  const [registered, setRegistered] = useState<{ at: string; key: string; report: QualityReport } | null>(null);
  const [exclude, setExclude] = useState<Set<RuleId>>(new Set(DEFAULT_EXCLUDE));
  const [error, setError] = useState('');
  const effective: QualityRules = { ...rules, straightlining: likert.length ? { columns: likert } : null };
  const key = JSON.stringify([effective, missingCodes, sourceHash]);
  const stale = registered !== null && registered.key !== key;
  const issues = validateRules(table, effective);
  const columnOptions = table.headers.map((h, i) => <option key={i} value={i}>{table.columnLabels?.[h] ?? h}</option>);

  function run() {
    try { setRegistered({ at: new Date().toISOString(), key, report: evaluateQuality(table, effective, missingCodes) }); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  const report = registered && !stale ? registered.report : null;
  const kept = report ? keptTable(table, report, exclude) : null;
  async function apply() {
    if (!report || !kept || !registered) return;
    const ledger = exclusionLedger(report, exclude, { sourceName, sourceHash, registeredAt: registered.at });
    onApply(tableCsv(kept.table), `${stem(sourceName)} · 质控后（剔除 ${kept.removed} 行）`, {
      kind: 'quality', parentName: sourceName, parentHash: sourceHash, simulated, silicon, removed: kept.removed, ledgerHash: await sha256(ledger),
      rules: report.rules.filter(r => exclude.has(r.id)).map(r => `${r.label}：${r.criterion}`),
      // Hosted collection data keeps its frozen questionnaire and release identity after QC.
      ...(collection ? { collection } : {}),
    });
  }

  return <section className={styles.panel} aria-label="回收质量控制">
    <header><span className={styles.eyebrow}>QUALITY CONTROL</span><h3>回收质量控制</h3><p>先登记规则，再看标记结果。原始数据不变；只有你勾选“剔除”的规则会影响后续分析，剔除台账可下载并放入附录。</p></header>
    <div className={styles.grid}>
      <label>答卷编号列<select value={rules.idColumn ?? ''} onChange={e => setRules(r => ({ ...r, idColumn: e.target.value === '' ? null : Number(e.target.value) }))}><option value="">无（台账只记行号）</option>{columnOptions}</select></label>
      <fieldset className={styles.rule} data-on={!!rules.duration}>
        <legend><label><input type="checkbox" checked={!!rules.duration} onChange={e => setRules(r => ({ ...r, duration: e.target.checked ? { column: detected.duration ?? 0, mode: 'median-fraction', value: 0.33 } : null }))} />作答过快</label></legend>
        {rules.duration && <div className={styles.fields}>
          <select aria-label="作答时长列" value={rules.duration.column} onChange={e => setRules(r => ({ ...r, duration: { ...r.duration!, column: Number(e.target.value) } }))}>{columnOptions}</select>
          <select aria-label="阈值方式" value={rules.duration.mode} onChange={e => setRules(r => ({ ...r, duration: { ...r.duration!, mode: e.target.value as 'median-fraction' | 'seconds', value: e.target.value === 'seconds' ? 60 : 0.33 } }))}><option value="median-fraction">低于中位数的比例</option><option value="seconds">低于固定秒数</option></select>
          <input aria-label="阈值" inputMode="decimal" key={rules.duration.mode} defaultValue={rules.duration.value} onChange={e => setRules(r => ({ ...r, duration: { ...r.duration!, value: Number(e.target.value) } }))} />
        </div>}
        <small>常用做法是低于中位用时的 1/3 视为未认真作答；阈值请在看到结果前确定。</small>
      </fieldset>
      <fieldset className={styles.rule} data-on={likert.length > 0}>
        <legend>直线作答（选择同一量表的题目）</legend>
        {candidates.length ? <div className={styles.chips}>{candidates.map(i => { const h = table.headers[i]; return <label key={i} data-checked={likert.includes(i)}><input type="checkbox" checked={likert.includes(i)} onChange={e => setLikert(v => e.target.checked ? [...v, i] : v.filter(x => x !== i))} />{table.columnLabels?.[h] ?? h}</label>; })}</div> : <small>没有找到取值为少量数字的题目列；量表题须先编码为数字。</small>}
        <small>至少 3 题，最好 5 题以上且含反向题；全部选同一选项的行会被标记。</small>
      </fieldset>
      <fieldset className={styles.rule} data-on={!!rules.attention}>
        <legend><label><input type="checkbox" checked={!!rules.attention} onChange={e => setRules(r => ({ ...r, attention: e.target.checked ? { column: 0, expected: '' } : null }))} />注意力题</label></legend>
        {rules.attention && <div className={styles.fields}>
          <select aria-label="注意力题" value={rules.attention.column} onChange={e => setRules(r => ({ ...r, attention: { ...r.attention!, column: Number(e.target.value) } }))}>{columnOptions}</select>
          <input aria-label="正确答案" placeholder="正确答案（按数据中的取值）" defaultValue={rules.attention.expected} onChange={e => setRules(r => ({ ...r, attention: { ...r.attention!, expected: e.target.value } }))} />
        </div>}
      </fieldset>
      <fieldset className={styles.rule} data-on={!!rules.duplicateIp}>
        <legend><label><input type="checkbox" checked={!!rules.duplicateIp} onChange={e => setRules(r => ({ ...r, duplicateIp: e.target.checked ? { column: detected.ip ?? 0 } : null }))} />同一 IP 重复提交</label></legend>
        {rules.duplicateIp && <div className={styles.fields}><select aria-label="IP 列" value={rules.duplicateIp.column} onChange={e => setRules(r => ({ ...r, duplicateIp: { column: Number(e.target.value) } }))}>{columnOptions}</select></div>}
      </fieldset>
      <fieldset className={styles.rule} data-on={rules.duplicateAnswers}>
        <legend><label><input type="checkbox" checked={rules.duplicateAnswers} onChange={e => setRules(r => ({ ...r, duplicateAnswers: e.target.checked }))} />答案完全重复</label></legend>
        <small>不比较编号、时间、时长和 IP 列。</small>
      </fieldset>
    </div>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={!!issues.length} onClick={run}>{registered ? '按当前规则重新核查' : '登记规则并核查'}</button>
      {issues.length > 0 && <span className={styles.hint}>{issues[0]}</span>}
      {stale && <span className={styles.hint}>规则已改动，请重新核查；旧结果不再使用。</span>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {report && kept && <div className={styles.report}>
      <p className={styles.registered}>规则登记于 {new Date(registered!.at).toLocaleString('zh-CN')} · 共 {report.total} 份 · 被任一规则标记 {report.flagged.length} 份</p>
      <table><thead><tr><th>规则</th><th>判定标准</th><th>标记</th><th>处理</th></tr></thead><tbody>
        {report.rules.map(r => <tr key={r.id}><td>{r.label}</td><td>{r.criterion}{r.unparsed ? `；${r.unparsed} 行无法读取` : ''}</td><td><b>{r.flagged}</b> <small>{report.total ? `${(r.flagged / report.total * 100).toFixed(1)}%` : ''}</small></td>
          <td><label className={styles.toggle}><input type="checkbox" checked={exclude.has(r.id)} onChange={e => setExclude(s => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />{exclude.has(r.id) ? '剔除' : '仅标记'}</label></td></tr>)}
      </tbody></table>
      <div className={styles.summary}><div><span>保留</span><strong>{report.total - kept.removed}</strong></div><div><span>剔除</span><strong>{kept.removed}</strong></div><div><span>有效率</span><strong>{report.total ? `${((report.total - kept.removed) / report.total * 100).toFixed(1)}%` : '—'}</strong></div></div>
      {report.notes.length > 0 && <ul className={styles.notes}>{report.notes.map(n => <li key={n}>{n}</li>)}</ul>}
      {report.flagged.length > 0 && <details className={styles.preview}><summary>查看被标记的答卷（前 50 行）</summary><table><thead><tr><th>原表行号</th><th>答卷编号</th><th>触发规则</th></tr></thead><tbody>{report.flagged.slice(0, 50).map(f => <tr key={f.row}><td>{f.row}</td><td>{f.id || '—'}</td><td>{f.reasons.map(id => report.rules.find(r => r.id === id)?.label).join('、')}</td></tr>)}</tbody></table></details>}
      <div className={styles.actions}>
        <button type="button" onClick={() => download(exclusionLedger(report, exclude, { sourceName, sourceHash, registeredAt: registered!.at }), `${stem(sourceName)}-剔除台账.csv`, 'text/csv;charset=utf-8')}>下载剔除台账</button>
        <button type="button" onClick={() => download(tableCsv(kept.table), `${stem(sourceName)}-质控后.csv`, 'text/csv;charset=utf-8')}>下载质控后数据</button>
        <button type="button" className={styles.primary} disabled={!kept.removed} onClick={() => void apply()}>以质控后数据继续分析</button>
      </div>
    </div>}
  </section>;
}
