'use client';
import { useMemo, useState } from 'react';
import { countWord, equalProbabilityInclusion, frameTable, groupIsProbability, groupStatement, mergeSpans, parseSelectionTree, STAGE_METHODS, type PlanGroup, type PlanStage, type StageMethod } from '@/lib/sampling-selection';
import { texNum } from '@/lib/sampling-core';
import { Formula } from '../math/Tex';
import { Field, Notes, parseNumber, Statement, usePersistent } from './ui';
import styles from './Sampling.module.css';

type StageDraft = { id: string; unit: string; frame: string; method: StageMethod; frameSize: string; take: string; sizeMeasure: string; strata: string };
type GroupDraft = { id: string; name: string; population: string; completes: string; stages: StageDraft[]; tree: string };
const stage = (id: string, unit: string, frame: string, method: StageMethod, take = '', frameSize = '', sizeMeasure = '', strata = ''): StageDraft => ({ id, unit, frame, method, take, frameSize, sizeMeasure, strata });
const EXAMPLE: GroupDraft[] = [
  { id: 'g1', name: '城区居民', population: '在本市居住半年以上的城镇居民', completes: '300', tree: '甲区\n  一街道\n  二街道\n乙区\n  三街道\n  四街道',
    stages: [stage('s1', '行政区', '全市所有行政区', 'pps', '2', '13', '常住人口'), stage('s2', '街道', '所有街道', 'srs', '2'), stage('s3', '居民', '所有居民', 'intercept')] },
  { id: 'g2', name: '高校学生', population: '本市全日制在校生', completes: '300', tree: '某理工大学｜全市本科院校\n某师范大学｜全市本科院校\n某职业学院｜全市专科院校',
    stages: [stage('t1', '学校', '全市高校', 'stratified', '3', '', '', '本科、专科'), stage('t2', '学生', '所有学生', 'intercept')] },
];
function toGroup(d: GroupDraft): PlanGroup {
  const num = (t: string) => t.trim() === '' ? null : parseNumber(t);
  return { id: d.id, name: d.name, population: d.population, completes: num(d.completes), tree: parseSelectionTree(d.tree),
    stages: d.stages.map<PlanStage>(s => ({ id: s.id, unit: s.unit, frame: s.frame, method: s.method, frameSize: num(s.frameSize), take: num(s.take), sizeMeasure: s.sizeMeasure, strata: s.strata })) };
}
const escapeHtml = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function tableHtml(headers: string[], rows: string[][]): string {
  const spans = mergeSpans(rows), cell = 'border:1px solid #444;padding:4px 8px;text-align:center;vertical-align:middle;font-size:10.5pt';
  return `<table style="border-collapse:collapse"><thead><tr>${headers.map(h => `<th style="${cell};font-weight:bold">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr>${r.map((v, c) => spans[i][c] ? `<td rowspan="${spans[i][c]}" style="${cell}">${escapeHtml(v)}</td>` : '').join('')}</tr>`).join('')}</tbody></table>`;
}

function FrameTable({ group }: { group: PlanGroup }) {
  const { headers, rows } = frameTable(group), spans = mergeSpans(rows);
  const [copied, setCopied] = useState('');
  async function copy() {
    const tsv = [headers, ...rows].map(r => r.join('\t')).join('\n');
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([tableHtml(headers, rows)], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(tsv);
      setCopied('已复制，可直接粘贴到 Word'); window.setTimeout(() => setCopied(''), 1800);
    } catch { setCopied('复制失败，请手动选择表格'); }
  }
  return <div className={styles.frameTable}>
    <div className={styles.row}><strong>{group.name || '该群体'}抽样框</strong><button type="button" className={styles.ghost} onClick={() => void copy()}>{copied || '复制表格'}</button></div>
    <div className={styles.resultTable}><table className={styles.bordered}><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, c) => spans[i][c] ? <td key={c} rowSpan={spans[i][c]}>{v}</td> : null)}</tr>)}</tbody></table></div>
  </div>;
}

export default function DesignBuilder() {
  const [groups, setGroups] = usePersistent('builder.v1', { list: EXAMPLE, quota: '1:1' });
  const update = (id: string, patch: Partial<GroupDraft>) => setGroups({ ...groups, list: groups.list.map(g => g.id === id ? { ...g, ...patch } : g) });
  const updateStage = (g: GroupDraft, id: string, patch: Partial<StageDraft>) => update(g.id, { stages: g.stages.map(s => s.id === id ? { ...s, ...patch } : s) });
  const built = useMemo(() => groups.list.map(toGroup), [groups.list]);
  const allProbability = built.every(groupIsProbability);
  const total = built.reduce((s, g) => s + (g.completes ?? 0), 0);
  const overall = built.length > 1 ? `本研究将调查对象分为${built.map(g => `“${g.name}”`).join('与')}${countWord(built.length)}个群体，${groups.quota.trim() ? `样本量按 ${groups.quota.trim()} 配置，` : ''}分别设计抽样方案${total ? `，计划有效样本合计 ${total} 份` : ''}。` : '';
  const statement = [overall, ...built.map(groupStatement)].filter(Boolean).join('\n');
  return <div className={styles.builder}>
    <div className={styles.callout}>按“目标总体 → 各阶段抽样单元 → 入样单位”逐级填写。表格与方法段落会实时更新；示例中的地名与学校均为占位，请替换为你的实际抽样框。</div>
    <div className={styles.row}><Field label="各群体样本比例（可选）" value={groups.quota} onChange={quota => setGroups({ ...groups, quota })} inputMode="text" placeholder="如 1:1" /></div>
    {groups.list.map((g, gi) => { const group = built[gi], probability = groupIsProbability(group), inclusion = equalProbabilityInclusion(group); return <section key={g.id} className={styles.groupCard}>
      <header className={styles.row}>
        <input className={styles.groupName} aria-label="群体名称" value={g.name} onChange={e => update(g.id, { name: e.target.value })} />
        <span className={styles.badge} data-tone={probability ? undefined : 'warn'}>{probability ? '概率抽样' : '含非概率阶段'}</span>
        <button type="button" className={styles.ghost} disabled={groups.list.length <= 1} onClick={() => setGroups({ ...groups, list: groups.list.filter(x => x.id !== g.id) })}>删除群体</button>
      </header>
      <div className={styles.inputs}>
        <Field label="目标总体" value={g.population} onChange={population => update(g.id, { population })} inputMode="text" wide />
        <Field label="计划有效样本" value={g.completes} onChange={completes => update(g.id, { completes })} inputMode="numeric" />
      </div>
      <ol className={styles.stageList}>{g.stages.map((s, si) => <li key={s.id}>
        <div className={styles.stageHead}><span>第 {si + 1} 阶段</span><select className={styles.select} aria-label={`第 ${si + 1} 阶段的抽样方式`} value={s.method} onChange={e => updateStage(g, s.id, { method: e.target.value as StageMethod })}>{(Object.keys(STAGE_METHODS) as StageMethod[]).map(m => <option key={m} value={m}>{STAGE_METHODS[m].label}</option>)}</select>
          <button type="button" className={styles.ghost} disabled={g.stages.length <= 1} onClick={() => update(g.id, { stages: g.stages.filter(x => x.id !== s.id) })}>删除</button></div>
        <div className={styles.stageGrid}>
          <Field label="抽样单元" value={s.unit} onChange={unit => updateStage(g, s.id, { unit })} inputMode="text" placeholder="如 行政区" />
          <Field label={si === 0 ? '抽样框' : '上级单位内的抽样框'} value={s.frame} onChange={frame => updateStage(g, s.id, { frame })} inputMode="text" placeholder={si === 0 ? '如 全市所有行政区' : '如 所有街道'} />
          {STAGE_METHODS[s.method].probability && s.method !== 'census' && <Field label="每个上级单位抽取数" value={s.take} onChange={take => updateStage(g, s.id, { take })} inputMode="numeric" />}
          {STAGE_METHODS[s.method].probability && s.method !== 'census' && s.method !== 'pps' && <Field label="框内单位数（可选）" value={s.frameSize} onChange={frameSize => updateStage(g, s.id, { frameSize })} inputMode="numeric" />}
          {s.method === 'pps' && <Field label="规模指标" value={s.sizeMeasure} onChange={sizeMeasure => updateStage(g, s.id, { sizeMeasure })} inputMode="text" placeholder="如 常住人口" />}
          {s.method === 'stratified' && <Field label="分层依据" value={s.strata} onChange={strata => updateStage(g, s.id, { strata })} inputMode="text" placeholder="如 本科、专科" />}
        </div>
        <small className={styles.muted}>{STAGE_METHODS[s.method].hint}</small>
      </li>)}</ol>
      <button type="button" className={styles.ghost} disabled={g.stages.length >= 5} onClick={() => update(g.id, { stages: [...g.stages, stage(crypto.randomUUID(), '', '', 'srs')] })}>＋ 添加阶段</button>
      {g.stages.length > 1 && <div className={styles.field} data-wide><label>入样单位（每行一个，缩进两个空格表示下一级；“名称｜抽样框”可注明所属层）<textarea rows={6} value={g.tree} spellCheck={false} onChange={e => update(g.id, { tree: e.target.value })} /></label><small>可把“抽取样本”工具的结果粘贴到这里。</small></div>}
      <FrameTable group={group} />
      {inclusion !== null && <Formula compact label="最终单位的入样概率（各阶段等概率）" tex={String.raw`\pi=\prod_{k}\frac{n_k}{N_k}=${texNum(inclusion, 4)}`} />}
      {probability && inclusion === null && <Formula compact label="多阶段设计的入样概率与权数" tex={String.raw`\pi_i=\prod_{k=1}^{K}\pi_{i}^{(k)},\qquad w_i=\frac{1}{\pi_i}`} />}
    </section>; })}
    <button type="button" className={styles.ghost} disabled={groups.list.length >= 4} onClick={() => setGroups({ ...groups, list: [...groups.list, { id: crypto.randomUUID(), name: `群体${groups.list.length + 1}`, population: '', completes: '', tree: '', stages: [stage(crypto.randomUUID(), '', '', 'srs')] }] })}>＋ 添加调查群体</button>
    <Statement title="抽样设计段落草稿" text={statement} footnote="依据上方填写生成。名单来源、抽取时的随机种子与抽取记录请放入附录。" />
    <Notes items={allProbability ? ['所有群体的各阶段都是概率抽样，可以按多阶段设计计算抽样误差（见“复杂样本估计”）。'] : ['含有拦截、配额或方便抽样阶段的群体不是概率样本：可以用前几阶段的随机抽取说明覆盖面，但不应报告严格的抽样误差。']} />
  </div>;
}
