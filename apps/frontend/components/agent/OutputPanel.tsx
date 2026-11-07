'use client';

import { useMemo, useState } from 'react';
import { Figure, ResultTable } from '@/components/editors/PaperBlocks';
import { CHART_THEMES } from '@/lib/chart-theme';
import { REPORT_FIGURE_LABELS, type ProjectVisualStyle, type ReportFigure, type ReportFigureKind } from '@/lib/report-figure';
import { defaultColumn, METHOD_LABELS, suggestedExhibits } from '@/lib/report-placement';
import { reproScript, scriptText } from '@/lib/repro-script';
import type { ResultSnapshot } from '@/lib/research-quality';
import { Icon } from './icons';
import styles from './OutputPanel.module.css';

type Tab = 'chart' | 'table' | 'code';

/**
 * One registered result opened beside the conversation: its figure, its table, and, for whoever has switched the code
 * view on, the Python that recomputes it, with the lines a beginner may change told apart from those that decide the
 * conclusion.
 */
/** Changes a figure can take from a sentence: the other kinds of its family, three other palettes, its value labels. */
function tweaks(result: ResultSnapshot, figure: ReportFigure | null, palette: string): string[] {
  const family: ReportFigureKind[] = result.method === 'crosstab' ? ['grouped_bar', 'percent_stacked', 'heatmap'] : ['bar', 'horizontal_bar'];
  const kind = figure?.kind ?? family[0];
  return [
    ...family.filter(k => k !== kind).map(k => `换成${REPORT_FIGURE_LABELS[k]}`),
    ...CHART_THEMES.slice(0, 5).filter(t => t.id !== palette).slice(0, 3).map(t => `配色换成${t.title}`),
    (figure?.style.showLabels ?? true) ? '隐藏数值标签' : '显示数值标签',
  ];
}

export default function OutputPanel({ result, showCode, onClose, onOpenAnalysis, onSay, figure, visualStyle }: { result: ResultSnapshot; showCode: boolean; onClose: () => void; onOpenAnalysis: () => void;
  /** Says a sentence in the conversation, as if typed. */
  onSay: (text: string) => void;
  /** The report's own figure for this result and the report's palette, when the report holds one. */
  figure: ReportFigure | null; visualStyle?: ProjectVisualStyle }) {
  const charted = suggestedExhibits(result).includes('chart');
  const tabs: [Tab, string][] = [...(charted ? [['chart', '图'] as [Tab, string]] : []), ['table', '表'], ...(showCode ? [['code', '代码'] as [Tab, string]] : [])];
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab = picked && tabs.some(([id]) => id === picked) ? picked : tabs[0][0];
  return <section className={styles.output} aria-label={`产出：${result.title}`}>
    <header className={styles.head}>
      <div className={styles.title}>
        <h2>{result.title}</h2>
        <p>{METHOD_LABELS[result.method] ?? result.method} · 有效样本 {result.n}{result.total !== result.n ? `（共 ${result.total}）` : ''}{result.classification === 'simulated' ? ' · 教学模拟数据' : ''}</p>
      </div>
      <button type="button" className={styles.iconButton} aria-label="关闭产出" title="关闭" onClick={onClose}><Icon name="close" /></button>
    </header>
    <div className={styles.tabs} role="tablist" aria-label="查看方式">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setPicked(id)}>{label}</button>)}
    </div>
    <div className={styles.body} role="tabpanel">
      {tab === 'chart' && <>
        <div className={styles.figure}><Figure result={result} column={defaultColumn(result)} accent="#0F766E" figure={figure ?? undefined} visualStyle={visualStyle} /></div>
        <p className={styles.hint}>跟证见说一句就能改，例如「换成条形图」「配色换成洞见青」；改动写进报告，可以撤销。字号由报告排版统一设定{showCode ? '，要单独改请用「代码」在本地重画' : ''}。</p>
        <div className={styles.tweaks}>
          {tweaks(result, figure, visualStyle?.paletteId ?? 'blue').map(t => <button key={t} type="button" onClick={() => onSay(t)}>{t}</button>)}
          <button type="button" data-quiet="true" onClick={onOpenAnalysis}>打开图表工作室</button>
        </div>
      </>}
      {tab === 'table' && <div className={styles.table}><ResultTable result={result} /></div>}
      {tab === 'code' && <Code result={result} />}
    </div>
  </section>;
}

function Code({ result }: { result: ResultSnapshot }) {
  const script = useMemo(() => reproScript(result), [result]);
  const [copied, setCopied] = useState(false);
  if (!script) return <p className={styles.hint}>这项结果没有计算凭据（高级方法或较早登记的结果），暂时不能生成等价的代码；表中数字仍以系统计算为准。</p>;
  const text = scriptText(script);
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => setCopied(false));
  const save = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/x-python;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: script.fileName });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className={styles.code}>
    <div className={styles.codeHead}>
      <b>{script.fileName}</b>
      <span>{script.exact ? '在本地运行会得到同样的结果' : '与系统的计算有差别，见下方说明'}</span>
      <span className={styles.spacer} />
      <button type="button" onClick={copy}>{copied ? '已复制' : '复制'}</button>
      <button type="button" data-primary="true" onClick={save}>下载 .py</button>
    </div>
    <div className={styles.legend}>
      <span data-kind="style"><i />✎ 可以放心改：颜色、大小、字号、清晰度</span>
      <span data-kind="risk"><i />▲ 改了会影响结论：样本、缺失、检验方法</span>
    </div>
    {script.gaps.map(gap => <p key={gap} className={styles.gap} role="note">{gap}</p>)}
    <ol className={styles.lines} aria-label="分析代码">
      {script.lines.map((line, i) => <li key={i} data-kind={line.kind}>
        <code>{line.text || ' '}</code>
        {line.note && <small>{line.kind === 'style' ? '✎' : '▲'} {line.note}</small>}
      </li>)}
    </ol>
    <p className={styles.hint}>下载的文件里，每条说明都写成了注释，拿到本地也看得懂；蓝色行随便改，黄色行改动前先和组里确认。</p>
  </div>;
}
