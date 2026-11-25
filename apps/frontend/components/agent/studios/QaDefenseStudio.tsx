'use client';

import { useRef, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import {
  buildDefenseScriptDocx,
  buildDefenseScriptMarkdown,
  searchReportForQa,
  type QaDefenseItem,
} from '@/lib/agent/studio-tools';
import { auditStatisticalMethodGuardrails } from '@/lib/agent/numeric-verifier';
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
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightResult, setPreflightResult] = useState<{
    passed: boolean;
    score: number;
    source: 'backend+local' | 'local';
    checks: Array<{
      id: string;
      severity: 'error' | 'warn' | 'info';
      title: string;
      message: string;
      sectionTitle?: string;
    }>;
  } | null>(null);
  const [status, setStatus] = useState('提问即在右侧 A4 纸面标红定位并生成问辩应答口径。');
  const idCounterRef = useRef(1);
  const quotaResult = calculateProvincialQuota(quotaTrack, quotaCount);

  const handleRunPreflightAudit = async () => {
    setPreflightBusy(true);
    setStatus('正在开展提交前质量预检（方法严谨性 · 盲审脱敏 · 赛事规范 · 页数上限）…');
    const localFindings = auditStatisticalMethodGuardrails(content).map(f => ({
      id: f.code,
      severity: f.severity,
      title: '统计方法规范提醒',
      message: f.message,
      sectionTitle: f.sectionTitle,
    }));

    try {
      const resp = await fetch('/api/reports/preflight-audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: content.title,
          subtitle: content.subtitle,
          sections: content.report.map(s => ({ id: s.id, title: s.title, body: s.body })),
          results: content.quality?.results ?? [],
          expectedEdition: 17,
          requireBlindReview: true,
        }),
      });
      if (resp.ok) {
        const body = (await resp.json()) as {
          ok?: boolean;
          passed?: boolean;
          score?: number;
          checks?: Array<{
            id: string;
            severity: 'error' | 'warn' | 'info';
            title: string;
            message: string;
            sectionTitle?: string;
          }>;
        };
        if (body.ok && Array.isArray(body.checks)) {
          const seen = new Set(body.checks.map(c => `${c.id}:${c.sectionTitle ?? ''}`));
          const merged = [
            ...body.checks,
            ...localFindings.filter(f => !seen.has(`${f.id}:${f.sectionTitle ?? ''}`)),
          ];
          const errCount = merged.filter(c => c.severity === 'error').length;
          setPreflightResult({
            passed: errCount === 0,
            score: body.score ?? Math.max(0, 100 - errCount * 18),
            source: 'backend+local',
            checks: merged,
          });
          setStatus(
            errCount === 0
              ? `✓ 提交前预检通过（得分 ${body.score ?? 100}/100，共 ${merged.length} 条建议）。`
              : `⚠ 提交前预检发现 ${errCount} 项硬性风险，请逐条定位修正后再导出。`,
          );
          return;
        }
      }
    } catch {
      // Offline / dev proxy graceful local fallback
    } finally {
      setPreflightBusy(false);
    }

    const errCount = localFindings.filter(c => c.severity === 'error').length;
    const warnCount = localFindings.filter(c => c.severity === 'warn').length;
    const score = Math.max(0, 100 - errCount * 18 - warnCount * 7);
    setPreflightResult({
      passed: errCount === 0,
      score,
      source: 'local',
      checks: localFindings,
    });
    setStatus(
      localFindings.length === 0
        ? '✓ 本地统计方法核查未发现硬性疏漏（100/100）。'
        : `⚠ 本地方法核查检出 ${errCount} 项错误、${warnCount} 项提醒。`,
    );
  };

  const runLookup = (qText = question, winnerBlueprint?: string) => {
    const clean = qText.trim();
    if (!clean) return;
    setQuestion(clean);
    const { hits, highlightTerms: nextTerms } = searchReportForQa(content, clean, 5);
    const hasHit = hits.length > 0;
    onHighlightChange(nextTerms);

    const fallbackDraft = winnerBlueprint
      ? `评委老师好。${winnerBlueprint}`
      : '评委老师好。当前正文尚未直接单列该细分条目；结合统计调查规范与公开学术基线，我们采用配额纠偏与稳健标准误进行补充校验，并将在终稿附录补充完整说明。';
    const hitDraft = `评委老师好。围绕该问题，我们在报告“${hits.map(h => h.sectionTitle).slice(0, 2).join('、')}”已给出实证阐述，${hits[0]?.text.slice(0, 130) ?? ''}${(hits[0]?.text.length ?? 0) > 130 ? '…' : ''} 此外我们在数据质控阶段通过分层配额与注意力甄别项保障了推断稳健性。${winnerBlueprint ? `\n\n结合历届高分答辩范式，可进一步补充，${winnerBlueprint}` : ''}`;

    const item: QaDefenseItem = {
      id: `qa-${idCounterRef.current++}`,
      question: clean,
      sourceMode: hasHit ? 'report_hit' : 'external_fallback',
      hits,
      highlightTerms: nextTerms,
      answerDraft: hasHit ? hitDraft : fallbackDraft,
      followUpTip: hasHit
        ? `若评委继续追问参数边界，可当场跳转“${hits[0].sectionTitle}”指出对应红色高亮句与三线表检验值及置信区间。`
        : '建议点击下方“公开资料深度补充答复”生成扩展口径，并补写一段方法说明放入附录。',
      createdAt: new Date().toISOString(),
    };

    setDeck(prev => [item, ...prev.slice(0, 14)]);
    if (hasHit) {
      onJumpToSection(hits[0].sectionId);
      setStatus(`报告命中 ${hits.length} 处原文，已在右侧纸面上标红高亮（${nextTerms.slice(0, 4).join('、')}）。`);
    } else {
      setStatus('当前报告正文暂未检索到直接表述，已生成方法论备选答复（也可点击公开资料补充）。');
    }
  };

  const clearHighlights = () => {
    onHighlightChange([]);
    setStatus('已清除报告纸面上的答辩标红高亮。');
  };

  const exportMarkdown = () => {
    if (!deck.length) return;
    const md = buildDefenseScriptMarkdown(content.title, deck);
    triggerBlobDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${content.title || '研究报告'}-问辩稿.md`);
    setStatus('已导出竞赛答辩问辩文稿。');
  };

  const exportDocx = async () => {
    if (!deck.length) return;
    const blob = await buildDefenseScriptDocx(content.title, deck);
    triggerBlobDownload(blob, `${content.title || '研究报告'}-问辩稿.docx`);
    setStatus('已导出可直接打印手卡的问辩文档。');
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>答辩原文标红与问辩稿</h4>
        <span className={styles.monoTag}>已整理 {deck.length} 题</span>
      </div>

      <div className={styles.panel}>
        <label className={styles.field}>
          <span>评委模拟提问 / 自查问题</span>
          <textarea
            className={styles.textarea}
            aria-label="评委模拟提问与自查问题"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="输入评委可能追问的问题，例如样本量置信度如何推算？"
          />
        </label>
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
              清除标红（{highlightTerms.length}）
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
              onClick={() => onAskExternalAi(`请结合外部科研规范与最新公开实证资料回答答辩问题“${question}”，并给出可直接放进问辩稿的三条支撑论据。`)}
            >
              公开资料深度补充答复
            </button>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>问辩稿预案卡片（{deck.length}）</strong>
          <div className={styles.row}>
            <button type="button" className={styles.btn} disabled={!deck.length} onClick={exportMarkdown}>
              导出文稿
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!deck.length} title="导出可打印问辩稿文档" onClick={() => void exportDocx()}>
              导出文档
            </button>
          </div>
        </div>

        {!deck.length && <p className={styles.muted}>尚未检索提问。点击上方“高频问”或输入问题，系统将自动在正文中高亮定位。</p>}

        <ul className={styles.list}>
          {deck.map((item, i) => (
            <li key={item.id} className={styles.itemCard}>
              <div className={styles.heroHead}>
                <strong style={{ fontSize: 12 }}>第 {deck.length - i} 题 · {item.question}</strong>
                <span className={styles.badge}>
                  {item.sourceMode === 'report_hit' ? `正文命中 ${item.hits.length} 处` : '方法框架补全'}
                </span>
              </div>
              {item.hits.slice(0, 2).map(hit => (
                <div key={hit.id} className={styles.panel} style={{ padding: '7px 9px' }}>
                  <div className={styles.heroHead}>
                    <span className={styles.hitMark}>{hit.sectionTitle} · 相关度 {hit.score}</span>
                    <button
                      type="button"
                      className={styles.btn}
                      aria-label={`跳转至“${hit.sectionTitle}”高亮段落`}
                      onClick={() => { onHighlightChange(item.highlightTerms); onJumpToSection(hit.sectionId); }}
                    >
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
                  aria-label={`第 ${deck.length - i} 题现场回答口径`}
                  value={item.answerDraft}
                  onChange={e => setDeck(prev => prev.map(d => d.id === item.id ? { ...d, answerDraft: e.target.value } : d))}
                />
              </label>
              <p className={styles.muted}><b>追问提示</b> · {item.followUpTip}</p>
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
                        note: `问辩补充（${item.question}） · ${item.answerDraft}`,
                      });
                      setStatus(`已将第 ${deck.length - i} 题预案加入“${item.hits[0]?.sectionTitle ?? '方法局限与正文'}”批注修订列表。`);
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

      <div className={styles.panel} role="region" aria-label="提交前质量预检">
        <div className={styles.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12 }}>提交前全流程质量预检（盲审 · 统计红线 · 页数）</strong>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={preflightBusy}
            onClick={() => void handleRunPreflightAudit()}
          >
            {preflightBusy ? '预检中…' : '🛡️ 一键提交前质量预检'}
          </button>
        </div>
        {preflightResult && (
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            <div className={styles.row} style={{ justifyContent: 'space-between', fontSize: 11.5 }}>
              <span>
                预检得分 <b>{preflightResult.score}/100</b>（{preflightResult.source === 'backend+local' ? '全项核验' : '本地方法核验'}）
              </span>
              <span className={styles.badge}>
                {preflightResult.passed ? '通过准入' : '存在阻塞项'} · {preflightResult.checks.length} 条
              </span>
            </div>
            {preflightResult.checks.length > 0 && (
              <ul className={styles.list} style={{ maxHeight: 190, overflow: 'auto' }}>
                {preflightResult.checks.map((ck, idx) => (
                  <li key={`${ck.id}-${idx}`} className={styles.itemCard} style={{ padding: '6px 8px' }}>
                    <div className={styles.row} style={{ justifyContent: 'space-between', fontSize: 11 }}>
                      <strong>
                        {ck.severity === 'error' ? '❌ ' : ck.severity === 'warn' ? '⚠️ ' : 'ℹ️ '}
                        {ck.title}
                      </strong>
                      {ck.sectionTitle && (
                        <button
                          type="button"
                          className={styles.btn}
                          aria-label={`定位至章节“${ck.sectionTitle}”`}
                          style={{ minHeight: 20, padding: '1px 6px', fontSize: 10 }}
                          onClick={() => {
                            const sec = content.report.find(s => s.title === ck.sectionTitle);
                            if (sec) onJumpToSection(sec.id);
                          }}
                        >
                          定位章节
                        </button>
                      )}
                    </div>
                    <p className={styles.muted} style={{ margin: '3px 0 0', fontSize: 10.5 }}>{ck.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                  placeholder="网考通过或缴费人数"
                />
              )}
            </div>
            <p className={styles.muted} style={{ margin: '6px 0 0' }}>{quotaResult.rule}</p>
          </div>

          <div className={styles.itemCard}>
            <strong>综合成绩由 60% 书面报告与 40% 现场答辩构成（均按百分制折算）</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {EDITION_17_OFFICIAL_GUIDE.reportScoringWeights.map(rw => (
                <li key={rw.id}><b>{rw.item}（{rw.points}分）</b> · {rw.subitems}</li>
              ))}
            </ul>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {EDITION_17_OFFICIAL_GUIDE.defenseScoringWeights.map(dw => (
                <li key={dw.id}><b>{dw.item}（{dw.points}分）</b> · {dw.ratioHint}</li>
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
                <li key={m.stage}><b>{m.stage}</b> · {m.window}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className={styles.statusBar} role="status" aria-live="polite">{status}</div>
    </div>
  );
}
