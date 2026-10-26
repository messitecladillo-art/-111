'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { awardCases } from '@/data/award-cases';
import { useWorkbenchTheme } from '@/components/workbench/shell-kit';
import { keywordBursts, type Burst } from '@/lib/topic-lab/burst';
import { awardCaseRecords } from '@/lib/topic-lab/evaluate';
import { buildTermMap } from '@/lib/topic-lab/network';
import { FORMAT_LABELS, mergeRecords, parseLiterature, type LitFormat, type LitRecord } from '@/lib/topic-lab/parse';
import { SOURCE_LABELS, buildTermIndex, defaultSource, parseThesaurus, type TermSource } from '@/lib/topic-lab/terms';
import { corpusYears, termTrend, type TermTrend } from '@/lib/topic-lab/trend';
import BurstView from './BurstView';
import Dandelion from './Dandelion';
import KeywordMap from './KeywordMap';
import PaperNetwork from './PaperNetwork';
import TopicStudio, { type TopicHandoff } from './TopicStudio';
import WordCloud from './WordCloud';
import { fmtInt, pct } from './shared';
import styles from './TopicLab.module.css';

type FileReport = { name: string; format: LitFormat | 'unknown'; records: number; skipped: number; warnings: string[] };
type Corpus = { kind: 'import' | 'library'; lists: LitRecord[][]; files: FileReport[] };
type View = 'cloud' | 'map' | 'burst' | 'papers' | 'timeline' | 'studio';
const VIEWS: Array<{ id: View; label: string; hint: string }> = [
  { id: 'cloud', label: '词云', hint: '高频主题' },
  { id: 'map', label: '共现图谱', hint: '聚类 · 时间线' },
  { id: 'burst', label: '突现', hint: '前沿信号' },
  { id: 'papers', label: '文献网络', hint: '耦合 · 共被引' },
  { id: 'timeline', label: '时间脉络', hint: '年份 × 被引' },
  { id: 'studio', label: '选题工作台', hint: '空白 · 证据画像' },
];
const MAX_BYTES = 80 * 1024 * 1024;

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  // CNKI exports from older clients are GB18030; fall back when UTF-8 decoding produced replacement characters.
  if ((utf8.match(/�/g) ?? []).length > 3) { try { return new TextDecoder('gb18030').decode(buf); } catch { /* keep UTF-8 */ } }
  return utf8.replace(/^﻿/, '');
}

export default function TopicLab({ onUseTopic }: { onUseTopic?: (h: TopicHandoff) => void }) {
  const theme = useWorkbenchTheme();
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [busy, setBusy] = useState('');
  const [importError, setImportError] = useState('');
  const [source, setSource] = useState<TermSource | null>(null);
  const [minDf, setMinDf] = useState(2);
  const [maxTerms, setMaxTerms] = useState(100);
  const [resolution, setResolution] = useState(1);
  const [colorBy, setColorBy] = useState<'cluster' | 'year'>('cluster');
  const [thesaurusDraft, setThesaurusDraft] = useState('');
  const [thesaurus, setThesaurus] = useState('');
  const [gamma, setGamma] = useState(1);
  const [view, setView] = useState<View>('cloud');
  const [basket, setBasket] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const merged = useMemo(() => corpus ? mergeRecords(corpus.lists) : null, [corpus]);
  const records = useMemo(() => merged?.records ?? [], [merged]);
  const activeSource: TermSource = source ?? (corpus?.kind === 'library' ? 'title' : defaultSource(records));
  const thes = useMemo(() => parseThesaurus(thesaurus), [thesaurus]);
  const index = useMemo(() => records.length ? buildTermIndex(records, { source: activeSource, synonyms: thes.synonyms, exclude: thes.exclude }) : null, [records, activeSource, thes]);
  const map = useMemo(() => index ? buildTermMap(index, { maxTerms, minDf, resolution }) : null, [index, maxTerms, minDf, resolution]);
  const cy = useMemo(() => index ? corpusYears(index) : null, [index]);
  const trends = useMemo(() => {
    const m = new Map<string, TermTrend>(); if (!index || !cy || !map) return m;
    for (const n of map.nodes) m.set(n.key, termTrend(index, n.key, cy));
    return m;
  }, [index, cy, map]);
  const burstData = useMemo(() => index ? keywordBursts(index, { gamma, limit: 400 }) : { rows: [], years: [] }, [index, gamma]);
  const bursts = useMemo(() => new Map<string, Burst>(burstData.rows.map(r => [r.key, r.burst])), [burstData]);
  const topBursts = useMemo(() => ({ rows: burstData.rows.slice(0, 25), years: burstData.years }), [burstData]);
  const lastYear = cy?.max ?? null;
  const clusterNames = useMemo(() => map?.clusterInfo.map(c => c.label) ?? [], [map]);
  const basketLabels = basket.map(k => index?.terms.get(k)?.label ?? k);
  const toggle = (key: string) => setBasket(b => b.includes(key) ? b.filter(k => k !== key) : [...b, key]);

  const quality = useMemo(() => {
    if (!records.length) return null;
    const share = (f: (r: LitRecord) => boolean) => records.filter(f).length / records.length;
    return { year: share(r => r.year !== null), keywords: share(r => r.keywords.length > 0), plus: share(r => r.keywordsPlus.length > 0), abstract: share(r => r.abstract.length > 40), refs: share(r => r.refs.length > 0), citations: share(r => r.citations !== null) };
  }, [records]);
  const corpusLabel = !corpus || !merged ? '' : corpus.kind === 'library'
    ? `内置获奖案例索引 ${records.length} 项题名（${cy?.min ?? '—'}–${cy?.max ?? '—'}）`
    : `导入的 ${[...new Set(corpus.files.filter(f => f.records).map(f => f.format === 'unknown' ? '未知格式' : FORMAT_LABELS[f.format]))].join(' + ')} 共 ${fmtInt(records.length)} 条记录（${cy?.min ?? '—'}–${cy?.max ?? '—'}）`;

  const dataNote = `数据：${corpusLabel}；词来源：${SOURCE_LABELS[activeSource]}，出现 ≥ ${minDf} 篇，显示前 ${maxTerms} 个词。`;

  async function addFiles(list: FileList | File[]) {
    const files = [...list];
    if (!files.length) return;
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_BYTES) { setImportError(`文件合计超过 ${MAX_BYTES / 1024 / 1024} MB，请分批导出。`); return; }
    setImportError(''); setBusy(`正在解析 ${files.length} 个文件…`);
    const lists: LitRecord[][] = [], reports: FileReport[] = [];
    for (const f of files) {
      try {
        const rep = parseLiterature(await readText(f));
        lists.push(rep.records); reports.push({ name: f.name, format: rep.format, records: rep.records.length, skipped: rep.skipped, warnings: rep.warnings });
      } catch {
        reports.push({ name: f.name, format: 'unknown', records: 0, skipped: 0, warnings: ['读取失败，文件可能已损坏。'] });
      }
    }
    setBusy('');
    setCorpus(prev => prev?.kind === 'import' ? { kind: 'import', lists: [...prev.lists, ...lists], files: [...prev.files, ...reports] } : { kind: 'import', lists, files: reports });
    setSource(null); setBasket([]);
    if (lists.some(l => l.length)) setView('cloud');
  }
  const loadLibrary = () => { setCorpus({ kind: 'library', lists: [awardCaseRecords(awardCases)], files: [] }); setSource(null); setMinDf(2); setBasket([]); setView('cloud'); };
  const clear = () => { setCorpus(null); setBasket([]); setSource(null); setThesaurus(''); setThesaurusDraft(''); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); };

  const hiddenInput = <input ref={fileInput} type="file" multiple accept=".txt,.ris,.bib,.enw,.net,.nbib,.ciw,text/plain" className={styles.srOnly} tabIndex={-1} aria-hidden="true" onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />;

  if (!corpus || !records.length) return <div className={styles.lab}>
    {hiddenInput}
    <div className={styles.intro}>
      <div className={`${styles.dropZone} ${dragging ? styles.dropActive : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 31V11m0 0-8 8m8-8 8 8M10 30v7h28v-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h3>导入文献</h3><span>拖入数据库导出的文件，或从本地选择</span>
        <span>Web of Science 纯文本 · RIS · BibTeX · RefWorks · EndNote</span>
        <button type="button" className={styles.primaryButton} onClick={() => fileInput.current?.click()} disabled={!!busy}>{busy || '选择文献文件'}</button>
        <button type="button" className={styles.linkButton} onClick={loadLibrary}>试用内置题名索引（{awardCases.length} 项）</button>
        <small>仅在本浏览器解析；刷新后需重新导入。</small>
        {importError && <p className={styles.errorLine} role="alert">{importError}</p>}
        {corpus && !records.length && <p className={styles.errorLine} role="alert">没有读到有效记录：{corpus.files.map(f => `${f.name}（${f.warnings[0] ?? '0 条'}）`).join('；')}</p>}
      </div>
      <div className={styles.introText}>
        <h4>从文献到候选题目</h4>
        <ol className={styles.steps}><li><b>1</b><span>导入文献记录</span></li><li><b>2</b><span>查看主题、关联与趋势</span></li><li><b>3</b><span>加入选题篮，评估候选方向</span></li></ol>
        <p>图谱只描述导入记录，研究价值仍需结合实际问题判断。</p>
      </div>
    </div>
    <ExportGuide />
  </div>;

  return <div className={styles.lab}>
    {hiddenInput}
    <div className={styles.corpusBar}>
      <div className={styles.corpusMain}>
        <span className={styles.eyebrowSmall}>{corpus.kind === 'library' ? '示例语料 · 内置获奖案例索引' : '文献语料'}</span>
        <strong>{fmtInt(records.length)} 条记录{cy?.min ? ` · ${cy.min}–${cy.max}` : ''}</strong>
        {corpus.kind === 'import' && <span>{corpus.files.map(f => `${f.name}：${f.format === 'unknown' ? '无法识别' : `${FORMAT_LABELS[f.format]} ${f.records} 条`}`).join('；')}{merged!.duplicates ? `；合并去重 ${merged!.duplicates} 条` : ''}</span>}
        {corpus.kind === 'library' && <span>{awardCases.filter(c => c.verification === 'official_verified').length} 项官方来源核验 + {awardCases.filter(c => c.verification !== 'official_verified').length} 项用户陈述；非历届全量，只能描述这些题名本身。</span>}
      </div>
      {quality && <dl className={styles.quality}>
        <div><dt>有年份</dt><dd>{pct(quality.year, 0)}</dd></div>
        <div><dt>有关键词</dt><dd>{pct(quality.keywords, 0)}</dd></div>
        <div><dt>有摘要</dt><dd>{pct(quality.abstract, 0)}</dd></div>
        <div><dt>有参考文献</dt><dd>{pct(quality.refs, 0)}</dd></div>
        <div><dt>有被引次数</dt><dd>{pct(quality.citations, 0)}</dd></div>
      </dl>}
      <div className={styles.corpusActions}>
        {corpus.kind === 'import' && <button type="button" className={styles.secondaryButton} onClick={() => fileInput.current?.click()} disabled={!!busy}>{busy || '追加文件'}</button>}
        {corpus.kind === 'library' && <button type="button" className={styles.primaryButton} onClick={() => { clear(); }}>导入自己的文献</button>}
        <button type="button" className={styles.linkButton} onClick={clear}>清除</button>
      </div>
      {corpus.files.some(f => f.warnings.length) && <ul className={styles.warnList}>{corpus.files.flatMap(f => f.warnings.map(w => <li key={f.name + w}>{f.name}：{w}</li>))}</ul>}
    </div>

    <div className={styles.settings}>
      <label className={styles.inlineField}>词来源<select value={activeSource} onChange={e => setSource(e.target.value as TermSource)}>
        {(['keywords', 'keywords+plus', 'title', 'title+abstract'] as TermSource[]).map(s => <option key={s} value={s} disabled={(s === 'keywords' && !quality?.keywords) || (s === 'keywords+plus' && !quality?.plus) || (s === 'title+abstract' && !quality?.abstract)}>{SOURCE_LABELS[s]}</option>)}
      </select></label>
      <label className={styles.inlineField}>最少出现<select value={minDf} onChange={e => setMinDf(Number(e.target.value))}>{[1, 2, 3, 5, 10, 20].map(v => <option key={v} value={v}>{v} 篇</option>)}</select></label>
      <label className={styles.inlineField}>显示词数<select value={maxTerms} onChange={e => setMaxTerms(Number(e.target.value))}>{[50, 100, 150, 200].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
      <label className={styles.inlineField}>聚类粒度<select value={resolution} onChange={e => setResolution(Number(e.target.value))}>{[[.5, '粗'], [.8, '较粗'], [1, '标准'], [1.3, '较细'], [1.8, '细']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className={styles.segmented} role="group" aria-label="着色方式">
        <button type="button" aria-pressed={colorBy === 'cluster'} onClick={() => setColorBy('cluster')}>按聚类着色</button>
        <button type="button" aria-pressed={colorBy === 'year'} onClick={() => setColorBy('year')}>按年份着色</button>
      </div>
      <details className={styles.thesaurus}>
        <summary>合并与排除{thesaurus.trim() ? `（${thes.synonyms.size} 组合并、${thes.exclude.size} 个排除）` : ''}</summary>
        <p className={styles.muted}>每行一条。“原词 =&gt; 统一词”合并同义词，单独一个词表示排除。修改后点“应用”。</p>
        <textarea rows={4} value={thesaurusDraft} onChange={e => setThesaurusDraft(e.target.value)} placeholder={'新能源汽车 => 电动汽车\nEVs => electric vehicle\n研究'} />
        <button type="button" className={styles.secondaryButton} onClick={() => setThesaurus(thesaurusDraft)} disabled={thesaurusDraft === thesaurus}>应用</button>
      </details>
    </div>
    {index?.notes.map(n => <p key={n} className={styles.caution}>{n}</p>)}

    <div className={styles.viewTabs} role="tablist" aria-label="分析视图">
      {VIEWS.map((v, i) => <button key={v.id} type="button" role="tab" id={`tl-tab-${v.id}`} aria-selected={view === v.id} aria-controls={`tl-panel-${v.id}`} tabIndex={view === v.id ? 0 : -1} onClick={() => setView(v.id)} onKeyDown={e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length].id;
        setView(next); document.getElementById(`tl-tab-${next}`)?.focus();
      }}><strong>{v.label}</strong><small>{v.hint}</small></button>)}
    </div>
    <div role="tabpanel" id={`tl-panel-${view}`} aria-labelledby={`tl-tab-${view}`} className={styles.panel}>
      {!map || !index || !cy ? null : map.nodes.length < 3 && view !== 'studio' && view !== 'papers' && view !== 'timeline' ? <div className={styles.emptyView}><strong>可用的词太少</strong><p>出现 ≥ {minDf} 篇的词不足 3 个。可以降低“最少出现”，或改用其他词来源。</p></div> : <>
        {view === 'cloud' && <WordCloud dataNote={dataNote} map={map} trends={trends} theme={theme} basket={basket} onToggle={toggle} colorBy={colorBy} clusterNames={clusterNames} />}
        {view === 'map' && <KeywordMap dataNote={dataNote} map={map} index={index} trends={trends} bursts={bursts} lastYear={lastYear} theme={theme} basket={basket} onToggle={toggle} colorBy={colorBy} />}
        {view === 'burst' && <BurstView dataNote={dataNote} theme={theme} index={index} records={records} cy={cy} basket={basket} onToggle={toggle} gamma={gamma} onGamma={setGamma} keywordBursts={topBursts} />}
        {view === 'papers' && <PaperNetwork dataNote={dataNote} records={records} index={index} theme={theme} basket={basket} basketLabels={basketLabels} />}
        {view === 'timeline' && <Dandelion dataNote={dataNote} records={records} index={index} map={map} theme={theme} basket={basket} basketLabels={basketLabels} clusterNames={clusterNames} />}
        {view === 'studio' && <TopicStudio index={index} map={map} cy={cy} trends={trends} bursts={bursts} lastYear={lastYear} basket={basket} setBasket={setBasket} synonyms={thes.synonyms} theme={theme} corpusLabel={corpusLabel} onUseTopic={onUseTopic} />}
      </>}
    </div>
    {basket.length > 0 && view !== 'studio' && <div className={styles.basketDock} role="status">
      <span>选题篮：{basketLabels.join('、')}</span>
      <button type="button" className={styles.primaryButton} onClick={() => setView('studio')}>去选题工作台</button>
    </div>}
    <MethodNotes />
  </div>;
}

function ExportGuide() {
  return <details className={styles.guide}>
    <summary>如何导出文献</summary>
    <div className={styles.guideGrid}>
      <article>
        <h5>Web of Science（推荐，信息最全）</h5>
        <ol><li>检索结果页点击 <b>Export</b></li><li>选择 <b>Plain text file</b>（或 RIS / BibTeX）</li><li>Record Content 选 <b>Full Record and Cited References</b></li><li>每次最多 1,000 条，可分批导出后一起导入</li></ol>
        <div className={styles.mockMenu} aria-hidden="true"><span>Export</span><i>EndNote online</i><i>EndNote desktop</i><i className={styles.mockOn}>Plain text file</i><i className={styles.mockOn}>RIS (other reference software)</i><i className={styles.mockOn}>BibTeX</i><i>Excel</i></div>
      </article>
      <article>
        <h5>中国知网（CNKI）</h5>
        <ol><li>勾选文献后点击 <b>导出与分析 → 导出文献</b></li><li>选择 <b>RefWorks</b> 或 <b>EndNote</b> 格式</li><li>点击 <b>导出</b> 保存为 .txt</li></ol>
        <p className={styles.muted}>知网导出不含参考文献与被引次数，因此“共被引”“被引距离”等视图会自动降级并注明。</p>
      </article>
      <article>
        <h5>Scopus、Google Scholar 与文献管理软件</h5>
        <ol><li>导出为 <b>RIS</b> 或 <b>BibTeX</b></li><li>Zotero / EndNote：选中条目 → 导出 → RIS</li></ol>
        <p className={styles.muted}>检索式决定了你看到的“领域”。建议在方法部分写明数据库、检索式、时间范围与导出日期。</p>
      </article>
    </div>
  </details>;
}

function MethodNotes() {
  return <details className={styles.methods}>
    <summary>方法与边界</summary>
    <div className={styles.methodGrid}>
      <section><h5>计数与归一化</h5><p>每篇记录中一个词只计一次（全计数）。两词连线强度用关联强度 = 共现篇数 × 总篇数 ÷（两词各自篇数之积），大于 1 表示比独立出现更常在一起（van Eck &amp; Waltman，VOSviewer）。</p></section>
      <section><h5>聚类与布局</h5><p>按共现篇数做 Louvain 模块度聚类（Blondel 等，2008），报告模块度 Q 与平均轮廓值 S；布局为固定随机种子的力导向算法，同一文件每次结果相同。坐标轴没有含义。</p></section>
      <section><h5>枢纽与剪枝</h5><p>中介中心性按 Brandes 算法在 Pathfinder（r = ∞，q = n − 1）剪枝后的骨干网络上计算；≥ 0.1 标紫圈，沿用 CiteSpace（Chen，2006）的约定。</p></section>
      <section><h5>突现与趋势</h5><p>突现用 Kleinberg（2002）二状态模型（s = 2，γ 可调）。趋势用双比例 z 检验比较最近 3 年与此前的占比，两段各需 ≥ 20 条记录、该词 ≥ 8 篇，|z| ≥ 1.96 才判为显著。</p></section>
      <section><h5>研究空白</h5><p>对高频词两两做单侧 Fisher 精确检验（实际共现是否显著少于独立预期），用 Benjamini–Hochberg 方法控制错误发现率。这只说明“很少被一起研究”，是否值得研究取决于真实的决策问题。</p></section>
      <section><h5>文献关系</h5><p>施引文献之间用书目耦合（Kessler，1963，余弦归一化）；被引文献之间用共被引（Small，1973）。参考文献按引用字符串或 DOI 识别，写法不一致会被拆分。被引次数是导出时的累计值，早年文献天然更高。</p></section>
      <section><h5>获奖题目参照</h5><p>只用内置索引中的题名做描述性对照：题目要素的出现比例、题面相似度与公告来源。索引不是全量榜单，也没有未获奖作品作对照，<strong>本工具不估计、也不暗示获奖概率</strong>。</p></section>
      <section><h5>数据与隐私</h5><p>所有解析与计算都在你的浏览器中完成，文件不上传。图表只呈现导入文件中的真实记录，不补全、不生成任何文献。</p></section>
    </div>
  </details>;
}
