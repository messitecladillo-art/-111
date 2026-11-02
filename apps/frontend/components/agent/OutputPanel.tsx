'use client';

import { useMemo, useState } from 'react';
import { Figure, ResultTable } from '@/components/editors/PaperBlocks';
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
export default function OutputPanel({ result, showCode, onClose, onOpenAnalysis }: { result: ResultSnapshot; showCode: boolean; onClose: () => void; onOpenAnalysis: () => void }) {
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
        <div className={styles.figure}><Figure result={result} column={defaultColumn(result)} accent="#0F766E" /></div>
        <p className={styles.hint}>要换图型、配色或字号，到「数据分析」的图表工作室细调{showCode ? '；也可以在「代码」里改蓝色标出的那几行，在本地重画' : ''}。</p>
        <div className={styles.tweaks}><button type="button" onClick={onOpenAnalysis}>打开图表工作室</button></div>
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
