'use client';

import { useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import {
  applyCrossReferenceToContent,
  matchCrossReferences,
  type LiteratureCandidate,
} from '@/lib/agent/studio-tools';
import { CP_AND_AWARD_CROSSREF_PRESETS } from '@/data/zhengda-corpus-2015-2027';
import styles from './Studio.module.css';

const PRESET_CANDIDATES: readonly LiteratureCandidate[] = [
  {
    id: 'lit-ipa',
    title: '基于修正 IPA 与结构方程的公共服务满意度驱动机制研究',
    authors: '张明远, 李思琪',
    year: '2024',
    journal: '公共管理学报',
    keywords: ['满意度', '服务', '回归', '驱动', '改进', '结构'],
    claim: '重要度-绩效分析（IPA）与多因素回归联动可精准定位低绩效高权重改进项',
  },
  {
    id: 'lit-sampling',
    title: '多层分层配额抽样在青年群体实证调查中的偏差修正策略',
    authors: '陈志刚, 王予诺',
    year: '2023',
    journal: '统计研究',
    keywords: ['抽样', '问卷', '样本', '代表性', '信度', '效度'],
    claim: '分层配额抽样配合事后加权与注意力甄别题能显著降低覆盖误差',
  },
  {
    id: 'lit-digital',
    title: '数字素养、感知易用性与持续使用意愿的跨群体异质性检验',
    authors: '林若溪, 赵子昂',
    year: '2025',
    journal: '信息资源管理学报',
    keywords: ['群体', '差异', '体验', '数字', '意愿', '现状'],
    claim: '不同使用频次与年龄梯队在信任度与操作摩擦敏感性上存在显著差异',
  },
];

const ALL_PRESETS: readonly LiteratureCandidate[] = [...PRESET_CANDIDATES, ...CP_AND_AWARD_CROSSREF_PRESETS];

export default function CrossRefStudio({
  content,
  onUpdateReport,
  onJumpToSection,
}: {
  content: EditorContent;
  onUpdateReport: (next: EditorContent, message: string) => void;
  onJumpToSection?: (sectionId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(PRESET_CANDIDATES[0].id);
  const [title, setTitle] = useState(PRESET_CANDIDATES[0].title);
  const [authors, setAuthors] = useState(PRESET_CANDIDATES[0].authors);
  const [year, setYear] = useState(PRESET_CANDIDATES[0].year);
  const [journal, setJournal] = useState(PRESET_CANDIDATES[0].journal ?? '');
  const [keywordsText, setKeywordsText] = useState((PRESET_CANDIDATES[0].keywords ?? []).join('、'));
  const [claim, setClaim] = useState(PRESET_CANDIDATES[0].claim ?? '');
  const [status, setStatus] = useState('选择文献后自动定位最佳插引段落并写入国标参考文献。');

  const candidate: LiteratureCandidate = useMemo(() => ({
    id: selectedId || 'custom-lit',
    title: title.trim() || '自定义参考文献',
    authors: authors.trim() || '佚名',
    year: year.trim() || '2025',
    journal: journal.trim() || '学术期刊',
    keywords: keywordsText.split(/[、,，\s]+/u).map(s => s.trim()).filter(Boolean),
    claim: claim.trim(),
  }), [selectedId, title, authors, year, journal, keywordsText, claim]);

  const matches = useMemo(
    () => matchCrossReferences(content.report, candidate, 5),
    [content.report, candidate],
  );

  const loadPreset = (item: LiteratureCandidate) => {
    setSelectedId(item.id);
    setTitle(item.title);
    setAuthors(item.authors);
    setYear(item.year);
    setJournal(item.journal ?? '');
    setKeywordsText((item.keywords ?? []).join('、'));
    setClaim(item.claim ?? '');
    setStatus(`已检索「${item.title.slice(0, 16)}…」的最佳段落锚点。`);
  };

  const injectAt = (sectionId: string, paragraphIndex: number) => {
    const result = applyCrossReferenceToContent(content, candidate, { sectionId, paragraphIndex });
    onUpdateReport(
      result.content,
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
        <div className={styles.field}>
          <span>快速选用精选核心文献（含正大杯 2024–2025 国奖范式）</span>
          <div className={styles.row} style={{ flexWrap: 'wrap' }}>
            {ALL_PRESETS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`${styles.btn} ${selectedId === item.id ? styles.btnPrimary : ''}`}
                onClick={() => loadPreset(item)}
              >
                {item.id.startsWith('ref-') ? `${item.title.slice(0, 9)}… (${item.year})` : `${item.authors.split(',')[0]} (${item.year})`}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span>文献题名</span>
          <input className={styles.input} value={title} onChange={e => { setSelectedId('custom'); setTitle(e.target.value); }} />
        </label>

        <div className={styles.row}>
          <label className={styles.field} style={{ flex: 2 }}>
            <span>作者</span>
            <input className={styles.input} value={authors} onChange={e => setAuthors(e.target.value)} />
          </label>
          <label className={styles.field} style={{ flex: 1 }}>
            <span>年份</span>
            <input className={styles.input} value={year} onChange={e => setYear(e.target.value)} />
          </label>
          <label className={styles.field} style={{ flex: 2 }}>
            <span>期刊/来源</span>
            <input className={styles.input} value={journal} onChange={e => setJournal(e.target.value)} />
          </label>
        </div>

        <label className={styles.field}>
          <span>检索关键词 & 核心论点</span>
          <input className={styles.input} value={keywordsText} onChange={e => setKeywordsText(e.target.value)} placeholder="如：满意度、抽样、异质性" />
          <textarea className={styles.textarea} value={claim} onChange={e => setClaim(e.target.value)} placeholder="文献主要结论（用于在空白段自动补句）" />
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
                  {m.matchedTerms.map(term => (
                    <span key={term} className={styles.badge}>{term}</span>
                  ))}
                </div>
              )}
              <div className={styles.row}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => injectAt(m.sectionId, m.paragraphIndex)}>
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
