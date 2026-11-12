'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  buildLiteratureStudy, LITERATURE_STUDY_LIMITS, parseLiteratureStudy, suggestLiteratureEvidence,
  type LiteratureStudy, type StudyDomain, type StudyEvidence, type StudyPaper,
} from '@/lib/agent/literature-study';
import styles from './LiteratureStudyPanel.module.css';

const roles = [
  { id: 'lead', name: '研究负责人', task: '确认本轮问题与资料范围', output: '研究范围', tab: 'evidence' },
  { id: 'reader', name: '文献研究员', task: '按 PDF 页码整理已确认的摘录', output: '原文证据', tab: 'evidence' },
  { id: 'analyst', name: '领域与方法分析师', task: '逐篇核对研究方法、结果与限制', output: '文献对照表', tab: 'matrix' },
  { id: 'writer', name: '研究撰稿人', task: '把证据整理成可验证的研究问题', output: '候选选题', tab: 'topics' },
  { id: 'reviewer', name: '证据审查员', task: '检查页码、摘录和选题引用', output: '核对结果', tab: 'topics' },
] as const;
const domains: Record<StudyDomain, string> = { general: '通用研究', social: '社会科学', computing: '计算机与工程', business: '经济管理' };
const kinds = { question: '研究问题', method: '方法', result: '结果', limitation: '局限' } as const;
type Tab = 'evidence' | 'matrix' | 'topics';
type Kind = StudyEvidence['kind'];
const tabs: { id: Tab; label: string }[] = [
  { id: 'evidence', label: '资料与证据' }, { id: 'matrix', label: '文献对照' }, { id: 'topics', label: '候选选题' },
];

type Props = {
  value: LiteratureStudy;
  direction: string;
  disabled: boolean;
  onChange: (study: LiteratureStudy) => void;
  onAdopt: (candidateId: string) => void;
};

export default function LiteratureStudyPanel({ value, direction, disabled, onChange, onAdopt }: Props) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('evidence');
  const [role, setRole] = useState<(typeof roles)[number]['id']>('lead');
  const [paperId, setPaperId] = useState('');
  const [pageNumber, setPageNumber] = useState(0);
  const [kind, setKind] = useState<Kind>('method');
  const [quote, setQuote] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState('');
  const [highlight, setHighlight] = useState('');
  const [range, setRange] = useState({ start: '', end: '' });
  const [confirmedScope, setConfirmedScope] = useState<{ value: LiteratureStudy; direction: string } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const scopeHeader = useRef<HTMLElement>(null);
  const reviewOutput = useRef<HTMLDivElement>(null);
  const pageText = useRef<HTMLTextAreaElement>(null);
  const evidenceOutput = useRef<HTMLElement>(null);
  const matrixOutput = useRef<HTMLElement>(null);
  const topicsOutput = useRef<HTMLElement>(null);
  const viewTabs = useRef<Partial<Record<Tab, HTMLButtonElement>>>({});
  const pendingFocus = useRef<Tab | 'review' | null>(null);
  const upload = useRef<AbortController | null>(null);
  const reattach = useRef<string | null>(null);
  const urls = useRef(new Map<string, string>());
  const latest = useRef({ value, disabled, onChange });
  useLayoutEffect(() => { latest.current = { value, disabled, onChange }; }, [value, disabled, onChange]);
  useEffect(() => {
    const owned = urls.current;
    return () => {
      upload.current?.abort();
      upload.current = null;
      for (const url of owned.values()) URL.revokeObjectURL(url);
      owned.clear();
    };
  }, []);

  const paper = value.papers.find(item => item.id === paperId) ?? value.papers[0];
  const page = paper?.pages.find(item => item.page === pageNumber) ?? paper?.pages[0];
  const executed = value.executedFor !== undefined && value.executedFor === direction.trim();
  const result = useMemo(() => executed ? buildLiteratureStudy(value, direction) : null, [value, direction, executed]);
  const suggestions = useMemo(() => paper ? suggestLiteratureEvidence(paper).filter(item => !value.evidence.some(entry =>
    entry.paperId === paper.id && entry.page === item.page && entry.kind === item.kind && entry.quote === item.quote)) : [], [paper, value.evidence]);
  const selectedEvidence = value.evidence.find(item => item.id === highlight);
  const selectedRole = roles.find(item => item.id === role)!;
  const stage = result?.stages.find(item => item.id === role);
  const locked = disabled || !!reading;
  const scopeConfirmed = confirmedScope?.value === value && confirmedScope.direction === direction.trim();

  function focusOutput(target: Tab | 'review') {
    const node = target === 'evidence' ? pageText.current ?? evidenceOutput.current
      : target === 'matrix' ? matrixOutput.current : target === 'review' ? reviewOutput.current ?? topicsOutput.current : topicsOutput.current;
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusOutput(target);
  });

  function showView(next: Tab, target: Tab | 'review' = next) {
    if (tab === next) focusOutput(target);
    else { pendingFocus.current = target; setTab(next); }
  }

  function revise(next: LiteratureStudy) {
    const { executedFor: _pastRun, ...input } = next;
    void _pastRun;
    onChange(parseLiteratureStudy(input));
  }

  function navigatePaper(next: StudyPaper, selectedPage = next.pages[0]?.page ?? 0) {
    setPaperId(next.id);
    setPageNumber(selectedPage);
    setQuote('');
    setHighlight('');
  }

  function openEvidence(entry: StudyEvidence) {
    const source = value.papers.find(item => item.id === entry.paperId);
    if (!source) return;
    navigatePaper(source, entry.page);
    setHighlight(entry.id);
    showView('evidence');
  }

  function attachOriginal(file: File, sourceId: string) {
    const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
    const oldUrl = urls.current.get(sourceId);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    urls.current.set(sourceId, url);
    setLinks(Object.fromEntries(urls.current));
  }

  async function importPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const restoreId = reattach.current;
    reattach.current = null;
    if (!file || locked) return;
    const selectedRange = !restoreId && (range.start || range.end) ? { startPage: Number(range.start), endPage: Number(range.end) } : undefined;
    if (selectedRange && (!Number.isSafeInteger(selectedRange.startPage) || !Number.isSafeInteger(selectedRange.endPage) ||
      selectedRange.startPage < 1 || selectedRange.endPage < selectedRange.startPage ||
      selectedRange.endPage - selectedRange.startPage + 1 > LITERATURE_STUDY_LIMITS.pagesPerPaper)) {
      setError('请填写有效的起止页码，单次最多 50 页。');
      return;
    }
    const controller = new AbortController();
    upload.current?.abort();
    upload.current = controller;
    setReading(file.name);
    setError('');
    try {
      if (restoreId) {
        if (!file.size || file.size > 20 * 1024 * 1024) throw Error('请选择原来的 PDF，文件上限为 20 MiB。');
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        if (controller.signal.aborted || upload.current !== controller || latest.current.disabled) return;
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actual !== restoreId || !latest.current.value.papers.some(item => item.id === restoreId)) throw Error('文件与已保存的原文指纹不一致。');
        attachOriginal(file, restoreId);
        return;
      }
      const { readLiteraturePdf } = await import('@/lib/agent/literature-pdf');
      const imported = await readLiteraturePdf(file, controller.signal, selectedRange);
      if (controller.signal.aborted || upload.current !== controller || latest.current.disabled) return;
      const current = latest.current.value;
      const previous = current.papers.find(item => item.id === imported.id);
      const knownPages = new Set(previous?.pages.map(item => item.page));
      const addedPages = imported.pages.filter(item => !knownPages.has(item.page));
      const nextPaper = previous ? { ...previous, pages: [...previous.pages, ...addedPages].sort((a, b) => a.page - b.page) } : imported;
      if (!previous || addedPages.length) {
        const { executedFor: _pastRun, ...draft } = current;
        void _pastRun;
        latest.current.onChange(parseLiteratureStudy({
          ...draft,
          papers: previous ? current.papers.map(item => item.id === imported.id ? nextPaper : item) : [...current.papers, nextPaper],
        }));
      }
      attachOriginal(file, imported.id);
      navigatePaper(nextPaper, imported.pages[0]?.page);
      setTab('evidence');
    } catch (reason) {
      if (!controller.signal.aborted && upload.current === controller) {
        setError(reason instanceof Error ? reason.message : 'PDF 读取失败。');
      }
    } finally {
      if (upload.current === controller) {
        upload.current = null;
        setReading('');
      }
    }
  }

  function saveQuote() {
    if (!paper || !page || locked || !quote.trim()) return;
    try {
      revise({ ...value, evidence: [...value.evidence, { id: crypto.randomUUID(), paperId: paper.id, page: page.page, kind, quote: quote.trim() }] });
      setQuote('');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '摘录无法确认。');
    }
  }

  function removePaper() {
    if (!paper || locked) return;
    revise({ ...value, papers: value.papers.filter(item => item.id !== paper.id), evidence: value.evidence.filter(item => item.paperId !== paper.id) });
    const url = urls.current.get(paper.id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(paper.id);
    setLinks(Object.fromEntries(urls.current));
    setPaperId('');
    setPageNumber(0);
    setQuote('');
    setHighlight('');
    setError('');
  }

  function run() {
    if (locked || (!scopeConfirmed && !executed) || !direction.trim()) return;
    try {
      onChange(parseLiteratureStudy({ ...value, executedFor: direction.trim() }));
      setRole('reviewer');
      setTab('topics');
      pendingFocus.current = 'review';
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法运行本轮分析。'); }
  }

  function showOutput() {
    if (selectedRole.id === 'lead') {
      scopeHeader.current?.scrollIntoView({ block: 'nearest' });
      scopeHeader.current?.focus({ preventScroll: true });
      return;
    }
    if (selectedRole.id === 'reader') {
      const evidence = value.evidence.find(item => stage?.artifactIds.includes(item.id));
      if (evidence) { openEvidence(evidence); return; }
    }
    showView(selectedRole.tab, selectedRole.id === 'reviewer' ? 'review' : selectedRole.tab);
  }

  return <section className={styles.workbench} aria-label="选题与文献研究" aria-describedby={`${id}-mode`}>
    <header className={styles.header} ref={scopeHeader} tabIndex={-1} aria-label="研究范围">
      <div><span className={styles.kicker}>文献研究</span><h3>让选题有据可循</h3>
        <p>{direction.trim() || '先在研究路线中填写一个方向。'}</p></div>
      <label className={styles.field}>领域
        <select value={value.domain} disabled={locked} onChange={event => revise({ ...value, domain: event.target.value as StudyDomain })}>
          {Object.entries(domains).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </label>
    </header>

    <div className={styles.import}>
      <div className={styles.materialStats}><span><strong>{value.papers.length}</strong> 篇文献</span><span><strong>{value.evidence.length}</strong> 条原文证据</span>{executed && <span><strong>{result?.candidates.length ?? 0}</strong> 个候选选题</span>}</div>
      <input type="file" accept="application/pdf,.pdf" ref={input} hidden aria-label="导入文献 PDF 文件" onChange={event => void importPdf(event)} />
      <button type="button" className={!value.papers.length ? styles.primary : undefined} disabled={locked} onClick={() => { reattach.current = null; input.current?.click(); }}><span aria-hidden="true">＋</span>导入文献 PDF</button>
    </div>
    <div className={styles.runControls}>
      {!!value.papers.length && !executed ? <label className={styles.scope}><input type="checkbox" checked={scopeConfirmed}
        disabled={locked || !direction.trim()} onChange={event => setConfirmedScope(event.target.checked ? { value, direction: direction.trim() } : null)} />
        已确认文献与当前研究方向相关</label> : <p id={`${id}-mode`} className={styles.mode}>本地规则分析 · 摘录由你确认 · 选题等待采纳</p>}
      <button type="button" className={value.papers.length ? styles.primary : undefined} disabled={locked || !value.papers.length || (!scopeConfirmed && !executed) || !direction.trim()} onClick={run}>运行文献选题分析<span aria-hidden="true"> →</span></button>
    </div>
    {!!value.papers.length && !executed && <p id={`${id}-mode`} className={styles.mode}>本地规则分析 · 摘录由你确认 · 选题等待采纳</p>}
    <div className={styles.toolbar}>
      <div role="tablist" aria-label="文献研究视图" className={styles.tabs} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = tabs.findIndex(item => item.id === tab);
        const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        setTab(next.id); viewTabs.current[next.id]?.focus();
      }}>
        {tabs.map(item => <button key={item.id} ref={node => { viewTabs.current[item.id] = node ?? undefined; }} id={`${id}-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {reading && <div className={styles.busy} role="status">正在读取 {reading}<button type="button" onClick={() => {
      upload.current?.abort();
      upload.current = null;
      setReading('');
    }}>取消</button></div>}

    <section id={`${id}-panel-evidence`} role="tabpanel" aria-labelledby={`${id}-tab-evidence`} ref={evidenceOutput} tabIndex={-1} hidden={tab !== 'evidence'}>
      {!value.papers.length && <div className={styles.zeroState}>
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M32 16c-8-5-16-6-24-4v37c8-2 16-1 24 4m0-37c8-5 16-6 24-4v37c-8-2-16-1-24 4V16Z"/><path d="m15 23 10 2m-10 6 10 2m14-8 10-2m-10 10 10-2"/></svg>
        <h4>先放入与你的方向相关的文献</h4><p>带文字层的 PDF，在本浏览器读取。</p>
        <ol><li><span>1</span>导入原文</li><li><span>2</span>确认页内摘录</li><li><span>3</span>对照文献，形成选题</li></ol>
      </div>}
      <details className={styles.range}><summary>指定读取页码</summary>
        <div><label>起始页<input type="number" min="1" value={range.start} disabled={locked} onChange={e => setRange({ ...range, start: e.target.value })} /></label>
          <label>结束页<input type="number" min="1" value={range.end} disabled={locked} onChange={e => setRange({ ...range, end: e.target.value })} /></label></div>
        <p>每篇最多保留 50 页。长文可先指定需要核对的页码。</p>
      </details>
      {paper && page && <div className={styles.reader}>
        <div className={styles.readerControls}>
          <label className={styles.field}>文献<select value={paper.id} onChange={event => {
            const next = value.papers.find(item => item.id === event.target.value);
            if (next) navigatePaper(next);
          }}>{value.papers.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label className={styles.field}>PDF 页码<select value={page.page} onChange={event => navigatePaper(paper, Number(event.target.value))}>
            {paper.pages.map(item => <option key={item.page} value={item.page}>第 {item.page} 页</option>)}
          </select></label>
        </div>
        <div className={styles.pageMeta}>
          <span>已读取 {paper.pages.length} / {paper.pageCount} 页</span>
          {links[paper.id] ? <a href={`${links[paper.id]}#page=${page.page}`} target="_blank" rel="noopener noreferrer">打开 PDF 原页 ↗</a>
            : <button type="button" disabled={locked} onClick={() => { reattach.current = paper.id; input.current?.click(); }}>重新关联 PDF 原件</button>}
          <button type="button" disabled={locked} onClick={removePaper}>移除文献</button>
        </div>
        {selectedEvidence && <blockquote className={styles.highlight}>{selectedEvidence.quote}</blockquote>}
        <textarea aria-label="PDF 页原文" readOnly rows={9} ref={pageText} value={page.text} />
        {!!suggestions.length && <details className={styles.suggestions}><summary>可核对的摘录建议 · {suggestions.length}</summary>
          {suggestions.map((item, index) => <button key={index} type="button" disabled={locked} onClick={() => {
            navigatePaper(paper, item.page);
            setKind(item.kind);
            setQuote(item.quote);
            setError('');
          }}><strong>{kinds[item.kind]} · 第 {item.page} 页</strong><span>{item.quote}</span></button>)}
        </details>}
        <div className={styles.quoteTools}>
          <label className={styles.field}>证据类型<select value={kind} disabled={locked} onChange={event => setKind(event.target.value as Kind)}>
            {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button type="button" disabled={locked} onClick={() => {
            const node = pageText.current;
            const text = node?.value.slice(node.selectionStart, node.selectionEnd).trim();
            if (!text) { setError('请先在页原文中选择一段文字。'); return; }
            if (text.length > LITERATURE_STUDY_LIMITS.quoteChars) { setError('请缩短选区后再摘录。'); return; }
            setQuote(text);
            setError('');
          }}>摘录所选文字</button>
        </div>
        <label className={styles.field}>待确认摘录<textarea value={quote} rows={3} disabled={locked}
          maxLength={LITERATURE_STUDY_LIMITS.quoteChars} onChange={event => setQuote(event.target.value)} placeholder="选择页中文字，或粘贴该页的一段原文" /></label>
        <button className={styles.primary} type="button" disabled={locked || !quote.trim()} onClick={saveQuote}>确认原文证据</button>
      </div>}
      {!!value.evidence.length && <div className={styles.evidenceList}>
        <h4>已确认摘录</h4>
        {value.evidence.map(item => <article key={item.id}>
          <button type="button" onClick={() => openEvidence(item)}>{value.papers.find(source => source.id === item.paperId)?.title} · 第 {item.page} 页 · {kinds[item.kind]}</button>
          <p>{item.quote}</p><button type="button" disabled={locked} onClick={() => {
            revise({ ...value, evidence: value.evidence.filter(entry => entry.id !== item.id) });
            setHighlight('');
          }}>撤回摘录</button>
        </article>)}
      </div>}
    </section>

    <section id={`${id}-panel-matrix`} role="tabpanel" aria-labelledby={`${id}-tab-matrix`} ref={matrixOutput} tabIndex={-1} hidden={tab !== 'matrix'}>
    {result?.rows.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="可横向滚动的文献对照表">
      <table aria-label="文献对照表"><thead><tr><th scope="col">文献</th>{Object.values(kinds).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.paper.id}><th scope="row">{row.paper.title}</th>
          {(Object.keys(kinds) as Kind[]).map(key => <td key={key}>{row.cells[key].length ? row.cells[key].map(entry =>
            <button key={entry.id} className={styles.reference} type="button" onClick={() => openEvidence(entry)}><span>{entry.quote}</span><small>第 {entry.page} 页 ↗</small></button>
          ) : <span className={styles.missing}>待补摘录</span>}</td>)}</tr>)}</tbody></table>
    </div> : <div className={styles.empty}><h4>把分散的阅读，放到一起比较</h4><p>确认原文摘录并运行分析后，按问题、方法、结果和局限对照各篇文献。</p><button type="button" onClick={() => showView('evidence')}>去整理原文证据 →</button></div>}
    </section>

    <section id={`${id}-panel-topics`} role="tabpanel" aria-labelledby={`${id}-tab-topics`} ref={topicsOutput} tabIndex={-1} hidden={tab !== 'topics'}><div className={styles.topics}>
      {result && <div ref={reviewOutput} className={styles.review} tabIndex={-1} aria-label="证据核对结果">
        <strong>证据核对</strong><p>{result.stages.find(item => item.id === 'reviewer')?.summary}</p>
      </div>}
      {result?.issues.length ? <ul className={styles.issues}>{result.issues.map(item => <li key={item}>{item}</li>)}</ul> : null}
      {result?.candidates.map(candidate => <article className={styles.topic} key={candidate.id}>
        <span className={styles.kicker}>拟研究方向</span><h4>{candidate.title}</h4>
        <dl className={styles.topicContent}>
          <div><dt>研究问题</dt><dd>{candidate.question}</dd></div>
          <div><dt>验证思路</dt><dd>{candidate.design}</dd></div>
        </dl>
        <details className={styles.topicDisclosure}><summary>适用条件</summary><p>{candidate.caveat}</p></details>
        <details className={styles.topicDisclosure}><summary>原文依据 · {candidate.evidenceIds.length} 条</summary>
        <div className={styles.refs} aria-label="选题所用原文证据">{candidate.evidenceIds.map(evidenceId => {
          const entry = value.evidence.find(item => item.id === evidenceId);
          const source = entry && value.papers.find(item => item.id === entry.paperId);
          return entry && source ? <button className={styles.reference} type="button" key={entry.id} onClick={() => openEvidence(entry)}>
            {source.title} · 第 {entry.page} 页 · {kinds[entry.kind]} ↗
          </button> : null;
        })}</div></details>
        <button type="button" disabled={locked || result.stages.find(item => item.id === 'reviewer')?.status !== 'done'} onClick={() => onAdopt(candidate.id)}>带入选题确认</button>
      </article>)}
      {!result && <div className={styles.empty}><h4>选题从证据中生长</h4><p>先整理原文证据，再运行本地分析。候选选题会保留每一条引用。</p><button type="button" onClick={() => showView('evidence')}>去整理原文证据 →</button></div>}
    </div></section>
    <details className={styles.collaboration}>
      <summary><span><strong>研究协作与交接</strong><span>{result ? `${result.stages.filter(item => item.status === 'done').length} / ${roles.length} 项本地流程已完成` : '查看五个角色的分工与成果'}</span></span><span aria-hidden="true">⌄</span></summary>
      <div className={styles.team} role="group" aria-label="文献研究团队">
        {roles.map((item, index) => {
          const receipt = result?.stages.find(entry => entry.id === item.id);
          const status = receipt?.status === 'done' ? '已完成' : receipt?.status === 'blocked' ? '待补充' : '待执行';
          return <button className={styles.member} type="button" key={item.id} aria-pressed={role === item.id} onClick={() => setRole(item.id)}>
            <span aria-hidden="true" className={styles.avatar} style={{ backgroundPosition: `${index * 25}% center` }} />
            <span><strong>{item.name}</strong><small data-status={receipt?.status ?? 'waiting'}>{status}</small></span>
          </button>;
        })}
      </div>
      <div className={styles.handoff} aria-label={`${selectedRole.name}工作回执`}>
        <div><strong>{selectedRole.name}</strong><p>{stage?.summary ?? selectedRole.task}</p>
          {stage?.status === 'done' && <small>{selectedRole.id === 'reviewer' ? `已核对 ${stage.artifactIds.length} 项` : `已交付 ${stage.artifactIds.length} 项`} · 交给{roles[roles.indexOf(selectedRole) + 1]?.name ?? '用户确认'}</small>}</div>
        <button type="button" onClick={showOutput}>{selectedRole.output}<span aria-hidden="true"> ↗</span></button>
      </div>
    </details>
  </section>;
}
