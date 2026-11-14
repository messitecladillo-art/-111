'use client';

import { useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import {
  applyCrossReferenceToContent,
  matchCrossReferences,
  type LiteratureCandidate,
} from '@/lib/agent/studio-tools';
import { citationEvidenceReady } from '@/lib/agent/integration-safety';
import styles from './Studio.module.css';

export default function CrossRefStudio({
  content,
  onUpdateReport,
  onJumpToSection,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onJumpToSection?: (sectionId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [journal, setJournal] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [claim, setClaim] = useState('');
  const [url, setUrl] = useState(''), [locator, setLocator] = useState('');
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [status, setStatus] = useState('填写已读原文的书目信息与支持位置，再确认其支持的具体主张。');
  const evidenceKey = JSON.stringify([title, authors, year, journal, url, locator, claim]);
  const evidenceChecked = checkedKey === evidenceKey;
  const canInsert = citationEvidenceReady({ title, authors, year, source: journal, url, locator, checked: evidenceChecked });

  const candidate: LiteratureCandidate = useMemo(() => ({
    id: 'checked-manual-source',
    title: title.trim(),
    authors: authors.trim(),
    year: year.trim(),
    journal: journal.trim(),
    keywords: keywordsText.split(/[、,，\s]+/u).map(s => s.trim()).filter(Boolean),
    claim: claim.trim(),
    url: url.trim(),
  }), [title, authors, year, journal, keywordsText, claim, url]);

  const matches = useMemo(
    () => title.trim() ? matchCrossReferences(content.report, candidate, 5) : [],
    [content.report, candidate, title],
  );

  const injectAt = (sectionId: string, paragraphIndex: number) => {
    if (!canInsert) { setStatus('请补齐原文链接与支持位置，并确认已核对内容。'); return; }
    const result = applyCrossReferenceToContent(content, candidate, { sectionId, paragraphIndex });
    onUpdateReport(
      { ...result.content, references: result.content.references?.map(entry => entry.id === result.refId
        ? { ...entry, url: url.trim(), locator: locator.trim(), verification: 'verified' as const } : entry) },
      `已将参考文献 [${result.citeNumber}]（${candidate.title.slice(0, 18)}…）精准交叉引用至正文对应段落并同步文末文献表。`,
    );
    setStatus(`完成交叉引用：已在正文中标引 [${result.citeNumber}] 并归档至第 ${result.citeNumber} 条参考文献。`);
    onJumpToSection?.(sectionId);
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>智能文献交叉引用</h4>
        <span className={styles.monoTag}>已编目 {(content.references ?? []).length} 篇</span>
      </div>

      <div className={styles.panel}>
        <p className={styles.muted}>录入你已核读的真实文献。下方按关键词推荐插引位置，具体支持关系仍需核对原文。</p>

        <label className={styles.field}>
          <span>文献题名</span>
          <input className={styles.input} value={title} maxLength={400} onChange={e => setTitle(e.target.value)} />
        </label>

        <div className={styles.row}>
          <label className={styles.field} style={{ flex: 2 }}>
            <span>作者</span>
            <input className={styles.input} value={authors} maxLength={1200} onChange={e => setAuthors(e.target.value)} />
          </label>
          <label className={styles.field} style={{ flex: 1 }}>
            <span>年份</span>
            <input className={styles.input} value={year} maxLength={4} onChange={e => setYear(e.target.value)} />
          </label>
          <label className={styles.field} style={{ flex: 2 }}>
            <span>期刊/来源</span>
            <input className={styles.input} value={journal} maxLength={200} onChange={e => setJournal(e.target.value)} />
          </label>
        </div>

        <label className={styles.field}>
          <span>检索关键词 & 核心论点</span>
          <input className={styles.input} value={keywordsText} onChange={e => setKeywordsText(e.target.value)} placeholder="如：满意度、抽样、异质性" />
          <textarea className={styles.textarea} value={claim} onChange={e => setClaim(e.target.value)} placeholder="文献主要结论（用于在空白段自动补句）" />
        </label>
        <label className={styles.field}><span>原文链接</span><input className={styles.input} type="url" value={url} maxLength={1000} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label>
        <label className={styles.field}><span>支持位置（页码、章节或图表）</span><input className={styles.input} value={locator} maxLength={200} onChange={e => setLocator(e.target.value)} placeholder="例如：第 8 页，表 3" /></label>
        <label className={styles.row}><input type="checkbox" checked={evidenceChecked} onChange={e => setCheckedKey(e.target.checked ? evidenceKey : null)} />我已核对原文及其对所引主张的支持关系</label>
      </div>

      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>系统推荐最佳插引位置（{matches.length} 处）</strong>
          <small className={styles.muted}>按语义契合度排序</small>
        </div>
        <ul className={styles.list}>
          {matches.map(m => (
            <li key={`${m.sectionId}-${m.paragraphIndex}`} className={styles.itemCard}>
              <div className={styles.heroHead}>
                <strong style={{ fontSize: 11.5 }}>{m.sectionTitle} · 第 {m.paragraphIndex + 1} 段</strong>
                <span className={styles.badge}>契合度 {Math.round(m.score * 100)}%</span>
              </div>
              <p className={styles.muted}>{m.snippet}</p>
              {m.matchedTerms.length > 0 && (
                <div className={styles.row}>
                  {m.matchedTerms.map(term => (
                    <span key={term} className={styles.badge}>{term}</span>
                  ))}
                </div>
              )}
              <div className={styles.row}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canInsert} onClick={() => injectAt(m.sectionId, m.paragraphIndex)}>
                  ✦ 在此段落插入交叉引用 [n]
                </button>
                {onJumpToSection && (
                  <button type="button" className={styles.btn} onClick={() => onJumpToSection(m.sectionId)}>
                    定位章节
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.statusBar}>{status}</div>
    </div>
  );
}
