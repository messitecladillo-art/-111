'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Formula, Tex } from '@/components/math/Tex';
import { advancedColumns, reverseScored, ADVANCED_METHODS, advancedInsert, runAdvanced, type AdvancedMethod, type AdvancedRun, type AdvancedSpec } from '@/lib/advanced-analysis';
import { splitInlineMath } from '@/lib/inline-math';
import { planSVG } from '@/lib/report-figures';
import type { ReportInsert } from '@/lib/report-insert';
import type { SurveyProfile, SurveyTable } from '@/lib/survey-analysis';
import { literalText } from '@/lib/report-templates';
import styles from './AdvancedMethods.module.css';

type Props = {
  table: SurveyTable; profile: SurveyProfile; missingCodes: string[]; simulated: boolean; sourceName: string; sourceHash: string;
  /** Hands the write-up to the report, which applies it as one undoable step in the method's blueprint section. */
  onReportInsert?: (insert: ReportInsert) => void;
  /**
   * The rows a method may read, as the other analyses get them: with a linked questionnaire, the confirmed eligible
   * rows of current, valid columns, or the problems that stop it. Without one, the table as loaded.
   */
  /** The analysis context `prepare` reads (questionnaire mapping, its confirmation, the skip-logic policy): a result
   * computed under another context is hidden until computed again. */
  context?: string;
  prepare?: (columns: number[], scaled: number[]) => { table: SurveyTable; problems: string[]; reverse?: { column: number; min: number; max: number; name: string }[]; scope?: string[] };
};

/** Text with inline $…$ formulas, as the report preview sets it. */
function Prose({ text }: { text: string }) {
  return <>{splitInlineMath(text).map((part, i) => (part.math ? <Tex key={i} tex={part.text} /> : <span key={i}>{part.text.replace(/\[\[(表|图):[^\]]+\]\]/gu, '$1')}</span>))}</>;
}

/**
 * The advanced methods on the loaded table: choose a method and its variables, compute on complete cases, read the
 * write-up as the report will print it (method, formulas, table, figure, reading), then write it into the report.
 */
export default function AdvancedMethods({ table, profile, missingCodes, simulated, sourceName, sourceHash, onReportInsert, prepare, context = '' }: Props) {
  const numeric = useMemo(() => profile.columns.filter(c => c.numeric > 0 && !c.likelyIdentifier), [profile]);
  const name = (index: number) => table.columnLabels?.[table.headers[index]] ?? table.headers[index] ?? `第 ${index + 1} 列`;
  const [method, setMethod] = useState<AdvancedMethod>('validity');
  const [picked, setPicked] = useState<number[]>([]), [outcome, setOutcome] = useState<number | null>(null);
  const [importanceMode, setImportanceMode] = useState<'stated' | 'derived'>('derived'), [importance, setImportance] = useState<Record<number, number>>({}), [overall, setOverall] = useState<number | null>(null);
  const [k, setK] = useState(3), [criteria, setCriteria] = useState('安全\n便利\n价格'), [judgements, setJudgements] = useState<Record<string, number>>({});
  const names = criteria.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 15);
  // A result belongs to the settings it was computed from; changing any of them hides it until computed again.
  const settings = JSON.stringify([method, picked, outcome, importanceMode, importance, overall, k, criteria, judgements, missingCodes, sourceHash, table.rows.length, context]);
  const [computed, setComputed] = useState<{ settings: string; run: AdvancedRun | { refused: string }; figure: string | null; notice: string; scope: string[] } | null>(null);
  const current = computed?.settings === settings ? computed : null, run = current?.run ?? null, figure = current?.figure ?? null, notice = current?.notice ?? '';

  const toggle = (c: number) => setPicked(list => (list.includes(c) ? list.filter(x => x !== c) : [...list, c]));
  const spec = (): AdvancedSpec | null => {
    switch (method) {
      case 'validity': return { method, items: picked };
      case 'regression': case 'logistic': return outcome === null ? null : { method, outcome, predictors: picked };
      case 'cluster': return { method, variables: picked, k };
      case 'ipa': return importanceMode === 'stated'
        ? (picked.every(c => importance[c] !== undefined) ? { method, performance: picked, importance: picked.map(c => importance[c]), overall: null } : null)
        : (overall === null ? null : { method, performance: picked, importance: null, overall });
      case 'ahp': return { method, criteria: names, matrix: names.map((_, i) => names.map((__, j) => (i === j ? 1 : i < j ? judgements[`${i}-${j}`] ?? 1 : 1 / (judgements[`${j}-${i}`] ?? 1)))) };
    }
  };
  const compute = async () => {
    const s = spec(), columns = s ? advancedColumns(s) : null;
    // A linked questionnaire decides the rows and checks the columns first; its problems stop the calculation.
    const prepared = s && columns && columns.all.length && prepare ? prepare(columns.all, columns.scaled) : { table, problems: [] };
    // Items the questionnaire scores in reverse are turned before the calculation; the table note says which.
    const reverse = 'reverse' in prepared ? prepared.reverse ?? [] : [], reversed = reverse.map(r => r.name);
    const next = !s ? { refused: '请先完成左侧的设置。' } : prepared.problems.length ? { refused: prepared.problems.join('') } : runAdvanced(s, reverseScored(prepared.table, reverse, missingCodes), missingCodes);
    if (!('refused' in next) && reversed.length) next.writing.table.note = next.writing.table.note.replace(/。$/u, `；${reversed.map(n => `“${literalText(n)}”`).join('、')}已按问卷反向计分。`);
    // The figure is the report's own SVG, already checked to carry no script, reference or raster.
    const svg = 'refused' in next || !next.figure ? null : await planSVG(next.figure).catch(() => null);
    // The scope the result was computed under travels with it into the report, as the basic analyses' does.
    const scope = 'refused' in next ? [] : [
      `原表 ${table.rows.length} 行，共同应答范围 ${prepared.table.rows.length} 行，有效计算 ${next.n} 行${next.invalid ? `（${next.invalid} 行含无效值）` : ''}。`,
      ...(reversed.length ? [`${reversed.join('、')}已按问卷反向计分。`] : []),
      ...('scope' in prepared ? prepared.scope ?? [] : [`缺失编码：${missingCodes.join('、') || '空白'}`]),
    ];
    setComputed({ settings, run: next, figure: svg, notice: '', scope });
  };
  const setNotice = (text: string) => setComputed(c => (c ? { ...c, notice: text } : c));
  // A write still being prepared when the dataset or a setting changes (the panel remounts per dataset) is dropped,
  // never handed to the report under the new data.
  const live = useRef({ mounted: false, settings });
  useEffect(() => { live.current.settings = settings; }, [settings]);
  useEffect(() => { const current = live.current; current.mounted = true; return () => { current.mounted = false; }; }, []);
  const write = async () => {
    if (!run || 'refused' in run || !onReportInsert) return;
    const captured = settings;
    try {
      const insert = await advancedInsert(run, { name: sourceName, hash: sourceHash, simulated }, current?.scope ?? []);
      if (!live.current.mounted || live.current.settings !== captured) return;
      onReportInsert(insert); setNotice('已交给报告与 PPT，写入对应的蓝图章节；可在编辑器里撤销。');
    }
    catch (error) { setNotice(`未能写入：${(error as Error).message}`); }
  };
  const columnChecks = (label: string, exclude: number | null = null) => <fieldset className={styles.columns}><legend>{label}</legend>
    {numeric.filter(c => c.index !== exclude).map(c => <label key={c.index}><input type="checkbox" checked={picked.includes(c.index)} onChange={() => toggle(c.index)} />{name(c.index)}</label>)}
  </fieldset>;
  const columnSelect = (label: string, value: number | null, set: (v: number | null) => void) => <label className={styles.field}>{label}
    <select value={value ?? ''} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))}><option value="">请选择</option>{numeric.map(c => <option key={c.index} value={c.index}>{name(c.index)}</option>)}</select>
  </label>;

  return <section className={styles.panel} aria-label="高级方法">
    <div className={styles.methods} role="radiogroup" aria-label="方法">
      {ADVANCED_METHODS.map(m => <button key={m.id} type="button" role="radio" aria-checked={method === m.id} className={styles.method} onClick={() => { setMethod(m.id); setPicked([]); setOutcome(null); }}>
        <b>{m.title}</b><span>{m.use}</span>
      </button>)}
    </div>
    <div className={styles.body}>
      <div className={styles.setup}>
        {method === 'validity' && columnChecks('量表题项（至少 3 个）')}
        {(method === 'regression' || method === 'logistic') && <>{columnSelect(method === 'logistic' ? '因变量（0 / 1 编码，1 = 事件发生）' : '因变量', outcome, setOutcome)}{columnChecks('自变量', outcome)}</>}
        {method === 'cluster' && <>{columnChecks('聚类变量（2–7 个，自动标准化）')}<label className={styles.field}>类别数 k<input type="number" min={2} max={8} value={k} onChange={e => setK(Math.max(2, Math.min(8, Number(e.target.value) || 2)))} /></label></>}
        {method === 'ipa' && <>{columnChecks('各属性的表现评分')}
          <fieldset className={styles.inline}><legend>重要性来自</legend>
            <label><input type="radio" checked={importanceMode === 'derived'} onChange={() => setImportanceMode('derived')} />总体满意度推导（隐性）</label>
            <label><input type="radio" checked={importanceMode === 'stated'} onChange={() => setImportanceMode('stated')} />受访者评定</label>
          </fieldset>
          {importanceMode === 'derived' ? columnSelect('总体满意度', overall, setOverall)
            : picked.map(c => <label key={c} className={styles.field}>{name(c)} 的重要性<select value={importance[c] ?? ''} onChange={e => setImportance({ ...importance, [c]: Number(e.target.value) })}><option value="">请选择</option>{numeric.map(o => <option key={o.index} value={o.index}>{name(o.index)}</option>)}</select></label>)}</>}
        {method === 'ahp' && <>
          <label className={styles.field}>准则（每行一个）<textarea rows={4} value={criteria} onChange={e => setCriteria(e.target.value)} /></label>
          <fieldset className={styles.matrix}><legend>两两比较（1～9：行准则比列准则重要的程度；小于 1 填分数如 0.333）</legend>
            {names.flatMap((a, i) => names.slice(i + 1).map((b, d) => { const key = `${i}-${i + d + 1}`; return <label key={key}>{a} 对 {b}<input type="number" min={0.111} max={9} step="any" value={judgements[key] ?? 1} onChange={e => setJudgements({ ...judgements, [key]: Number(e.target.value) || 1 })} /></label>; }))}
          </fieldset></>}
        <button type="button" className={styles.primary} onClick={() => void compute()}>计算</button>
        <p className={styles.note}>只纳入所选变量都有有效数值的案例，缺失代码不计入，也不插补。{simulated ? '当前是教学模拟数据，写进报告时会标注。' : ''}</p>
      </div>
      <div className={styles.result} aria-live="polite">
        {!run ? <p className={styles.empty}>选好方法与变量后计算，这里会按报告的样子显示方法说明、公式、结果表、图与读数。</p>
          : 'refused' in run ? <p className={styles.error} role="alert">{run.refused}</p>
            : <>
              <p><Prose text={run.writing.text} /></p>
              {run.writing.formulas.map((tex, i) => <Formula key={i} tex={tex} copyable={false} compact />)}
              <p className={styles.where}><Prose text={run.writing.where} /></p>
              <p className={styles.caption}>{run.writing.table.caption}</p>
              <div className={styles.tableWrap}><table><thead><tr>{run.writing.table.headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{run.writing.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
              <p className={styles.tableNote}><Prose text={run.writing.table.note} /></p>
              {figure && <div className={styles.figure} role="img" aria-label={`${run.title}的图`} dangerouslySetInnerHTML={{ __html: figure }} />}
              <p><Prose text={`由表可知，${run.writing.reading}`} /></p>
              <div className={styles.actions}>
                <span>n = {run.n}（共 {run.total}）</span>
                {onReportInsert && <button type="button" className={styles.primary} onClick={write}>写进报告</button>}
              </div>
              {notice && <p className={styles.notice} role="status">{notice}</p>}
            </>}
      </div>
    </div>
  </section>;
}
