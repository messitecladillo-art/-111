'use client';

import { useRef, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import {
  buildDefenseScriptDocx,
  buildDefenseScriptMarkdown,
  searchReportForQa,
  type QaDefenseItem,
} from '@/lib/agent/studio-tools';
import {
  EDITION_17_OFFICIAL_GUIDE,
  calculateProvincialQuota,
  type CompetitionTrackGroup,
} from '@/data/zhengda-corpus-2015-2027';
import styles from './Studio.module.css';

const JUDGE_QUESTIONS = [
  '你们的抽样框偏差是如何控制的，样本是否具有总体代表性？',
  '为什么核心模型选择当前统计分析方法，是否做过稳健性或置信区间检验？',
  '对策建议部分的可落地性与成本收益边界在哪里？',
];

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export default function QaDefenseStudio({
  content,
  highlightTerms,
  onHighlightChange,
  onJumpToSection,
  onOpenKnowledge,
  onAskExternalAi,
  onPinToAnnotation,
}: {
  content: EditorContent;
  highlightTerms: string[];
  onHighlightChange: (terms: string[]) => void;
  onJumpToSection: (sectionId: string) => void;
  onOpenKnowledge?: () => void;
  onAskExternalAi?: (question: string) => void;
  onPinToAnnotation?: (ann: { sectionId: string; quote: string; note: string }) => void;
}) {
  const [question, setQuestion] = useState(JUDGE_QUESTIONS[0]);
  const [deck, setDeck] = useState<QaDefenseItem[]>([]);
  const [quotaTrack, setQuotaTrack] = useState<CompetitionTrackGroup>('本科组');
  const [quotaCount, setQuotaCount] = useState(360);
  const [status, setStatus] = useState('提问即在右侧 A4 纸面标红定位并生成问辩应答口径。');
  const idCounterRef = useRef(1);
  const quotaResult = calculateProvincialQuota(quotaTrack, quotaCount);

  const runLookup = (qText = question, winnerBlueprint?: string) => {
    const clean = qText.trim();
    if (!clean) return;
    setQuestion(clean);
    const { hits, highlightTerms: nextTerms } = searchReportForQa(content, clean, 5);
    const hasHit = hits.length > 0;
    onHighlightChange(nextTerms);

    const fallbackDraft = winnerBlueprint
      ? `评委老师好。${winnerBlueprint}`
      : '评委老师好。当前正文尚未直接单列该细分条目；结合统计调查规范与公开学术基线，我们采用配额纠偏 + Bootstrap 稳健标准误进行补充校验，并将在终稿附录补充完整说明。';
    const hitDraft = `评委老师好。关于该问题，我们在报告「${hits.map(h => h.sectionTitle).slice(0, 2).join('、')}」已给出实证阐述：${hits[0]?.text.slice(0, 130) ?? ''}${(hits[0]?.text.length ?? 0) > 130 ? '…' : ''} 此外我们在数据质控阶段通过分层配额与注意力甄别项保障了推断稳健性。${winnerBlueprint ? `\n\n【国奖答辩要点参考】${winnerBlueprint}` : ''}`;

    const item: QaDefenseItem = {
      id: `qa-${idCounterRef.current++}`,
      question: clean,
      sourceMode: hasHit ? 'report_hit' : 'external_fallback',
      hits,
      highlightTerms: nextTerms,
      answerDraft: hasHit ? hitDraft : fallbackDraft,
      followUpTip: hasHit
        ? `若评委继续追问参数边界，可当场跳转「${hits[0].sectionTitle}」指出对应红色高亮句与三线表 p 值/置信区间。`
        : '建议点击下方「调用 AI/网上知识深答」生成扩展口径，并补写一小段方法论说明进附录。',
      createdAt: new Date().toISOString(),
    };

    setDeck(prev => [item, ...prev.slice(0, 14)]);
    if (hasHit) {
      onJumpToSection(hits[0].sectionId);
      setStatus(`报告命中 ${hits.length} 处原文！已在右侧 A4 纸面上标红高亮（${nextTerms.slice(0, 4).join('、')}）。`);
    } else {
      setStatus('当前报告正文暂未检索到直接表述，已自动触发外部方法论知识框架备选答复（也可调用 AI 检索补充）。');
    }
  };

  const clearHighlights = () => {
    onHighlightChange([]);
    setStatus('已清除报告纸面上的 Q/A 标红高亮。');
  };

  const exportMarkdown = () => {
    if (!deck.length) return;
    const md = buildDefenseScriptMarkdown(content.title, deck);
    triggerBlobDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${content.title || '研究报告'}-问辩稿.md`);
    setStatus('已导出竞赛答辩《问辩稿.md》。');
  };

  const exportDocx = async () => {
    if (!deck.length) return;
    const blob = await buildDefenseScriptDocx(content.title, deck);
    triggerBlobDownload(blob, `${content.title || '研究报告'}-问辩稿.docx`);
    setStatus('已导出可直接打印手卡的《问辩稿.docx》。');
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>Q/A 原文标红与问辩稿</h4>
        <span className={styles.monoTag}>已收编 {deck.length} 题</span>
      </div>

      <div className={styles.panel}>
        <div className={styles.field}>
          <span>评委模拟提问 / 自查问题</span>
          <textarea
            className={styles.textarea}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="输入评委可能追问的问题，如：样本量置信度如何推算？"
          />
        </div>
        <div className={styles.row} style={{ flexWrap: 'wrap' }}>
          {JUDGE_QUESTIONS.map((q, idx) => (
            <button key={q} type="button" className={styles.btn} onClick={() => runLookup(q)}>
              高频问 #{idx + 1}
            </button>
          ))}
          {EDITION_17_OFFICIAL_GUIDE.classicJudgeQaFromWinners.map(w => (
            <button
              key={w.id}
              type="button"
              className={styles.btn}
              onClick={() => runLookup(w.question, w.answerBlueprint)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => runLookup()}>
            🔍 全文检索并标红注释
          </button>
          {highlightTerms.length > 0 && (
            <button type="button" className={styles.btn} onClick={clearHighlights}>
              清除标红 ({highlightTerms.length})
            </button>
          )}
        </div>
        <div className={styles.row}>
          {onOpenKnowledge && (
            <button type="button" className={styles.btn} onClick={onOpenKnowledge}>
              打开知识镜深查
            </button>
          )}
          {onAskExternalAi && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => onAskExternalAi(`请结合外部科研规范与网络最新实证资料回答答辩问题：「${question}」，并给出可直接放进问辩稿的三条辩护论据。`)}
            >
              调用联网/AI 补充答复
            </button>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>问辩稿预案卡片（{deck.length}）</strong>
          <div className={styles.row}>
            <button type="button" className={styles.btn} disabled={!deck.length} onClick={exportMarkdown}>
              导出 .md
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!deck.length} onClick={() => void exportDocx()}>
              导出 .docx 问辩稿
            </button>
          </div>
        </div>

        {!deck.length && <p className={styles.muted}>尚未检索提问。点击上方「高频问」或输入问题，系统将自动在正文中高亮定位。</p>}

        <ul className={styles.list}>
          {deck.map((item, i) => (
            <li key={item.id} className={styles.itemCard}>
              <div className={styles.heroHead}>
                <strong style={{ fontSize: 12 }}>Q{deck.length - i}. {item.question}</strong>
                <span className={styles.badge}>
                  {item.sourceMode === 'report_hit' ? `正文命中 ${item.hits.length} 处` : '外部知识补全'}
                </span>
              </div>
              {item.hits.slice(0, 2).map(hit => (
                <div key={hit.id} className={styles.panel} style={{ padding: '7px 9px' }}>
                  <div className={styles.heroHead}>
                    <span className={styles.hitMark}>{hit.sectionTitle} · 相关度 {hit.score}</span>
                    <button type="button" className={styles.btn} onClick={() => { onHighlightChange(item.highlightTerms); onJumpToSection(hit.sectionId); }}>
                      跳转红框
                    </button>
                  </div>
                  <p className={styles.muted}>{hit.text.slice(0, 120)}{hit.text.length > 120 ? '…' : ''}</p>
                </div>
              ))}
              <label className={styles.field}>
                <span>现场回答口径（可微调后随问辩稿导出）</span>
                <textarea
                  className={styles.textarea}
                  value={item.answerDraft}
                  onChange={e => setDeck(prev => prev.map(d => d.id === item.id ? { ...d, answerDraft: e.target.value } : d))}
                />
              </label>
              <p className={styles.muted}><b>防线提示：</b>{item.followUpTip}</p>
              {onPinToAnnotation && (
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => {
                      const targetSectionId =
                        item.hits[0]?.sectionId ??
                        content.report.find(s => s.id === 'method.limitations')?.id ??
                        content.report.find(s => !/^(?:封面|目录)/u.test(s.title))?.id ??
                        'intro.background';
                      onPinToAnnotation({
                        sectionId: targetSectionId,
                        quote: item.hits[0]?.text.slice(0, 80) || item.question,
                        note: `[问辩沉淀 · ${item.question}] ${item.answerDraft}`,
                      });
                      setStatus(`已将Q${deck.length - i} 预案沉淀至「${item.hits[0]?.sectionTitle ?? '方法局限/正文'}」批注修订队列。`);
                    }}
                  >
                    📌 沉淀为正文修撰批注
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <details className={styles.panel}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          ⚖️ 第十七届（{EDITION_17_OFFICIAL_GUIDE.noticeId}）省赛名额计算器 · 100分评审与排版红线
        </summary>
        <div style={{ marginTop: 10, display: 'grid', gap: 10, fontSize: 11.5 }}>
          <div className={styles.itemCard}>
            <div className={styles.heroHead}>
              <strong>省赛晋级名额试算器</strong>
              <span className={styles.badge}>上限 {quotaResult.quota} 支</span>
            </div>
            <div className={styles.row} style={{ marginTop: 6 }}>
              <select
                className={styles.input}
                aria-label="组别选择"
                value={quotaTrack}
                onChange={e => setQuotaTrack(e.target.value as CompetitionTrackGroup)}
              >
                <option value="本科组">本科组（封顶 30 支）</option>
                <option value="专科组">专科组（封顶 15 支）</option>
                <option value="研究生组">研究生组（封顶 20 支）</option>
                <option value="在华留学生组">在华留学生组（校推 3 支）</option>
              </select>
              {quotaTrack !== '在华留学生组' && (
                <input
                  type="number"
                  min={0}
                  max={5000}
                  className={styles.input}
                  aria-label="网考通过或缴费人数"
                  value={quotaCount}
                  onChange={e => setQuotaCount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="网考通过/缴费人数"
                />
              )}
            </div>
            <p className={styles.muted} style={{ margin: '6px 0 0' }}>{quotaResult.rule}</p>
          </div>

          <div className={styles.itemCard}>
            <strong>总分公式：60% 书面报告 + 40% 现场答辩（均按 100 分计）</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {EDITION_17_OFFICIAL_GUIDE.reportScoringWeights.map(rw => (
                <li key={rw.id}><b>{rw.item}（{rw.points}分）</b>：{rw.subitems}</li>
              ))}
            </ul>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {EDITION_17_OFFICIAL_GUIDE.defenseScoringWeights.map(dw => (
                <li key={dw.id}><b>{dw.item}（{dw.points}分）</b>：{dw.ratioHint}</li>
              ))}
            </ul>
          </div>

          <div className={styles.itemCard}>
            <strong>附件8 排版与匿名红线 & 第十七届关键节点</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {EDITION_17_OFFICIAL_GUIDE.formattingRedlines.map(r => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {EDITION_17_OFFICIAL_GUIDE.milestones.map(m => (
                <li key={m.stage}><b>{m.stage}</b>：{m.window}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className={styles.statusBar}>{status}</div>
    </div>
  );
}
