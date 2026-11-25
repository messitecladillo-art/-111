'use client';

import { useMemo, useState } from 'react';
import type { CitationVerifyResult, VerifiedCitationMatch } from '@/lib/agent/autonomous-agent';
import type { EditorContent } from '@/lib/editor-model';
import {
  applyCrossReferenceToContent,
  matchCrossReferences,
  type LiteratureCandidate,
} from '@/lib/agent/studio-tools';
import { citationEvidenceReady } from '@/lib/agent/integration-safety';
import styles from './Studio.module.css';

function formatGroundingSourceLabel(source: string): string {
  if (source === 'offline_curated_catalog') return '文献核验库';
  if (source === 'crossref_live') return 'Crossref 学术库';
  if (source === 'openalex_live') return 'OpenAlex 学术库';
  return source || '文献核验库';
}

export default function CrossRefStudio({
  content,
  onUpdateReport,
  onJumpToSection,
  projectId,
  signedIn,
  csrfToken,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onJumpToSection?: (sectionId: string) => void;
  projectId?: string | null;
  signedIn?: boolean;
  csrfToken?: string;
}) {
  const [lookupInput, setLookupInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [groundingResult, setGroundingResult] = useState<CitationVerifyResult | null>(null);
  const [groundingNotice, setGroundingNotice] = useState('');
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

  const handleVerifyCitation = async () => {
    if (!signedIn || !projectId || /^(?:local|demo)/i.test(projectId)) {
      const msg = '请先登录并选择项目后启用文献核验。';
      setGroundingResult(null);
      setGroundingNotice(msg);
      setStatus(msg);
      return;
    }
    const raw = lookupInput.trim();
    if (!raw) {
      const msg = '请输入 DOI 或方法学关键词后再发起核验。';
      setGroundingNotice(msg);
      setStatus(msg);
      return;
    }
    const strippedDoi = raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
    const isDoi = /^10\.\d{4,9}\//i.test(strippedDoi);
    setVerifying(true);
    setGroundingNotice('');
    try {
      // Lazy import keeps top-level dependencies minimal for static citation safety harnesses.
      const { verifyProjectCitation } = await import('@/lib/agent/autonomous-agent');
      const res = await verifyProjectCitation(
        projectId,
        isDoi ? { doi: strippedDoi } : { query: raw },
        { csrfToken },
      );
      setGroundingResult(res);
      if (!res.verified || res.matches.length === 0) {
        const missMsg = '未在文献核验库或学术索引中检索到该文献，请勿在正文中编造引用。';
        setGroundingNotice(missMsg);
        setStatus(missMsg);
      } else {
        setGroundingNotice('');
        setStatus(`文献核验库已匹配到 ${res.matches.length} 条记录，请点击“填入核验表”并核对原文支持位置。`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文献循证核验失败，请稍后重试。';
      setGroundingResult(null);
      setGroundingNotice(msg);
      setStatus(msg);
    } finally {
      setVerifying(false);
    }
  };

  const fillVerifiedCitation = (item: VerifiedCitationMatch) => {
    setTitle(item.title);
    setAuthors(item.authors.join(', '));
    setYear(item.year ? String(item.year) : '');
    setJournal(item.venue);
    setUrl(item.url || (item.doi ? `https://doi.org/${item.doi}` : ''));
    setKeywordsText(item.tags?.join('、') || '');
    setCheckedKey(null);
    setStatus(`已将“${item.title.slice(0, 24)}”填入核验表，请补充支持位置并勾选核对确认后再插入正文。`);
  };

  const candidate: LiteratureCandidate = useMemo(() => ({
    id: 'checked-manual-source',
    title: title.trim(),
    authors: authors.trim(),
    year: year.trim(),
    journal: journal.trim(),
    keywords: [...new Set(keywordsText.split(/[、,，\s]+/u).map(s => s.trim()).filter(Boolean))],
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
      `已将第 ${result.citeNumber} 条参考文献（${candidate.title.slice(0, 18)}…）精准交叉引用至正文对应段落并同步文末文献表。`,
    );
    setStatus(`已完成交叉引用，在正文对应段落标引第 ${result.citeNumber} 条参考文献并同步文末文献表。`);
    onJumpToSection?.(sectionId);
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>智能文献交叉引用</h4>
        <span className={styles.monoTag}>已编目 {(content.references ?? []).length} 篇</span>
      </div>

      <div className={styles.panel} data-citation-grounding="bar">
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>文献标识与统计方法核验</strong>
          <span className={styles.badge}>文献核验库</span>
        </div>
        <div className={styles.row}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            aria-label="检索方法文献或 DOI"
            placeholder="输入 DOI（如 10.1016/j.jeconom.2020.12.001）或方法关键词（如 Callaway、Cronbach、Firth）"
            value={lookupInput}
            maxLength={300}
            onChange={e => setLookupInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleVerifyCitation();
              }
            }}
          />
          <button
            type="button"
            className={styles.btn}
            aria-label="发起文献循证核验"
            disabled={verifying}
            onClick={() => void handleVerifyCitation()}
          >
            {verifying ? '核验中…' : '循证核验'}
          </button>
        </div>
        {groundingNotice && (
          <p className={styles.muted} role="alert">
            {groundingNotice}
          </p>
        )}
        {groundingResult?.verified && groundingResult.matches.length > 0 && (
          <ul className={styles.list}>
            {groundingResult.matches.map((item, idx) => (
              <li key={`${item.doi || item.title}-${idx}`} className={styles.itemCard}>
                <div className={styles.heroHead}>
                  <span className={styles.badge}>{formatGroundingSourceLabel(groundingResult.source)}</span>
                  {item.doi && <span className={styles.monoTag}>文献标识 {item.doi}</span>}
                </div>
                <strong style={{ fontSize: 12 }}>{item.title || item.doi}</strong>
                <p className={styles.muted}>
                  {[item.authors.join(', '), item.year ? String(item.year) : '', item.venue].filter(Boolean).join(' · ')}
                </p>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.btn}
                    aria-label={`将“${item.title || item.doi || '当前文献'}”填入核验表`}
                    onClick={() => fillVerifiedCitation(item)}
                  >
                    填入核验表
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.muted}>录入你已核读的真实文献。下方按关键词推荐插引位置，具体支持关系仍需核对原文。</p>

        <label className={styles.field}>
          <span>文献题名</span>
          <input
            className={styles.input}
            aria-label="文献题名"
            value={title}
            maxLength={400}
            onChange={e => setTitle(e.target.value)}
          />
        </label>

        <div className={styles.row}>
          <label className={styles.field} style={{ flex: 2 }}>
            <span>作者</span>
            <input
              className={styles.input}
              aria-label="文献作者"
              value={authors}
              maxLength={1200}
              onChange={e => setAuthors(e.target.value)}
            />
          </label>
          <label className={styles.field} style={{ flex: 1 }}>
            <span>年份</span>
            <input
              className={styles.input}
              aria-label="发表年份"
              value={year}
              maxLength={4}
              onChange={e => setYear(e.target.value)}
            />
          </label>
          <label className={styles.field} style={{ flex: 2 }}>
            <span>期刊/来源</span>
            <input
              className={styles.input}
              aria-label="发表期刊或来源"
              value={journal}
              maxLength={200}
              onChange={e => setJournal(e.target.value)}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span>检索关键词与核心论点</span>
          <input
            className={styles.input}
            aria-label="文献检索关键词"
            value={keywordsText}
            onChange={e => setKeywordsText(e.target.value)}
            placeholder="满意度、抽样、异质性"
          />
          <textarea
            className={styles.textarea}
            aria-label="文献核心论点与主要结论"
            value={claim}
            onChange={e => setClaim(e.target.value)}
            placeholder="文献主要结论（用于在空白段自动补句）"
          />
        </label>
        <label className={styles.field}>
          <span>原文链接</span>
          <input
            className={styles.input}
            type="url"
            aria-label="文献原文链接"
            value={url}
            maxLength={1000}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className={styles.field}>
          <span>支持位置（页码、章节或图表）</span>
          <input
            className={styles.input}
            aria-label="原文支持位置（页码、章节或图表）"
            value={locator}
            maxLength={200}
            onChange={e => setLocator(e.target.value)}
            placeholder="第 8 页，表 3"
          />
        </label>
        <label className={styles.row}>
          <input
            type="checkbox"
            aria-label="确认已核对原文及其对所引主张的支持关系"
            checked={evidenceChecked}
            onChange={e => setCheckedKey(e.target.checked ? evidenceKey : null)}
          />
          我已核对原文及其对所引主张的支持关系
        </label>
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
                  {m.matchedTerms.map((term, ti) => (
                    <span key={`${term}-${ti}`} className={styles.badge}>{term}</span>
                  ))}
                </div>
              )}
              <div className={styles.row}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  aria-label={`在“${m.sectionTitle}”第 ${m.paragraphIndex + 1} 段插入交叉引用`}
                  disabled={!canInsert}
                  onClick={() => injectAt(m.sectionId, m.paragraphIndex)}
                >
                  ✦ 在此段落插入交叉引用
                </button>
                {onJumpToSection && (
                  <button
                    type="button"
                    className={styles.btn}
                    aria-label={`定位至章节“${m.sectionTitle}”`}
                    onClick={() => onJumpToSection(m.sectionId)}
                  >
                    定位章节
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.statusBar} role="status" aria-live="polite">
        {status}
      </div>
    </div>
  );
}
