'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaperAnnotation } from '@/components/editors/PaperPages';
import { parseEditorContent, sectionProseText, type EditorContent } from '@/lib/editor-model';
import { matchBlueprintNode } from '@/lib/report-blueprint';
import { SECTION_RHETORICAL_BLUEPRINTS } from '@/data/zhengda-empirical-anatomy';
import {
  buildDeAiPromptRules,
  detectAiFlavor,
  humanizeTextWithSkills,
  TOP10_DEAI_SKILLS,
} from '@/lib/agent/interview-corpus-deai';
import styles from './Studio.module.css';

const QUICK_OPERATORS: Array<{ label: string; directive: string }> = [
  {
    label: '✨ 精炼学术表达',
    directive: '采用标准计量实证学术句式重写，压缩口语与空泛过渡词，保留核心统计检验结论。',
  },
  {
    label: '🛡️ 学术降重与去套话',
    directive: '禁用“综上所述/值得注意的是/赋能/抓手”等套话，打散机械对称排比，转为结论前置、证据紧跟的写法。',
  },
  {
    label: '📐 三线表互文强化',
    directive: '正文严格与三线表相互指代，重点解释显著因子方向与效应量，避免流水账报数。',
  },
  {
    label: '🎯 痛点—主体—量化指标对策',
    directive: '对策回溯前文关键改进项与群体断点，明确执行举措、协同责任主体与评估指标。',
  },
];

const RHETORIC_LIST = Object.values(SECTION_RHETORICAL_BLUEPRINTS);

function cleanRhetoricBlueprintCopy(raw: string): string {
  return raw
    .replace(/（(?:详?见|参见)?\{G\d+\}）/gu, '（见对应图表）')
    .replace(/\{G\d+\}/gu, '对应图表')
    .replace(/\{R\d+\}/gu, '')
    .replace(/\{F\d+\}/gu, '实证指标')
    .replace(/[【「]/gu, '“')
    .replace(/[】」]/gu, '”');
}

export default function SteeringAnnotationStudio({
  content,
  pickedSectionId,
  onUpdateReport,
  steeringNotes,
  onAddSteering,
  onRemoveSteering,
  annotations,
  onAddAnnotation,
  onToggleAnnotationStatus,
  onRemoveAnnotation,
  onRewriteWithIdea,
  onJumpToSection,
}: {
  content: EditorContent;
  pickedSectionId?: string | null;
  onUpdateReport?: (next: EditorContent, message: string) => void;
  steeringNotes: string[];
  onAddSteering: (note: string) => void;
  onRemoveSteering: (idx: number) => void;
  annotations: PaperAnnotation[];
  onAddAnnotation: (ann: Omit<PaperAnnotation, 'id' | 'status'>) => void;
  onToggleAnnotationStatus: (id: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onRewriteWithIdea: (sectionId: string, quote: string, idea: string) => void;
  onJumpToSection: (sectionId: string) => void;
}) {
  const [noteInput, setNoteInput] = useState('');
  const [targetSectionId, setTargetSectionId] = useState(() => {
    const domPicked = typeof document !== 'undefined' ? document.documentElement.dataset.evixPickedSection : undefined;
    const candidateId = pickedSectionId || domPicked;
    if (candidateId && content.report.some(s => s.id === candidateId && !/^(?:封面|目录)/u.test(s.title))) {
      return candidateId;
    }
    return content.report.find(s => !/^(?:封面|目录)/u.test(s.title))?.id ?? content.report[0]?.id ?? 'intro.background';
  });
  const [manualQuote, setManualQuote] = useState('');
  const [manualIdea, setManualIdea] = useState('');
  const [rhetoricNodeId, setRhetoricNodeId] = useState<string>(() => {
    const matched = content.report.find(s => s.id === targetSectionId && !/^(?:封面|目录)/u.test(s.title));
    const bpId = matched
      ? SECTION_RHETORICAL_BLUEPRINTS[matched.id]
        ? matched.id
        : matchBlueprintNode(matched.title)?.id
      : undefined;
    return bpId && SECTION_RHETORICAL_BLUEPRINTS[bpId]
      ? bpId
      : (RHETORIC_LIST[0]?.nodeId ?? 'intro.background');
  });
  const [deAiStatus, setDeAiStatus] = useState('已内置 10 项学术表达润色规范，可检测当前章节或直接去除正文套话。');

  const syncTargetSection = useCallback((sectionId: string | null | undefined) => {
    if (!sectionId) return;
    const matched = content.report.find(s => s.id === sectionId && !/^(?:封面|目录)/u.test(s.title));
    if (!matched) return;
    setTargetSectionId(matched.id);
    const bpId = SECTION_RHETORICAL_BLUEPRINTS[matched.id]
      ? matched.id
      : matchBlueprintNode(matched.title)?.id;
    if (bpId && SECTION_RHETORICAL_BLUEPRINTS[bpId]) {
      setRhetoricNodeId(bpId);
    }
  }, [content.report]);

  const [lastPickedSectionId, setLastPickedSectionId] = useState<string | null | undefined>(pickedSectionId);
  if (pickedSectionId !== lastPickedSectionId) {
    setLastPickedSectionId(pickedSectionId);
    if (pickedSectionId) {
      const matched = content.report.find(s => s.id === pickedSectionId && !/^(?:封面|目录)/u.test(s.title));
      if (matched) {
        setTargetSectionId(matched.id);
        const bpId = SECTION_RHETORICAL_BLUEPRINTS[matched.id]
          ? matched.id
          : matchBlueprintNode(matched.title)?.id;
        if (bpId && SECTION_RHETORICAL_BLUEPRINTS[bpId]) {
          setRhetoricNodeId(bpId);
        }
      }
    }
  }

  const [lastAnnotationCount, setLastAnnotationCount] = useState(annotations.length);
  if (annotations.length !== lastAnnotationCount) {
    const grew = annotations.length > lastAnnotationCount;
    setLastAnnotationCount(annotations.length);
    if (grew && annotations[0]?.sectionId) {
      const matched = content.report.find(s => s.id === annotations[0].sectionId && !/^(?:封面|目录)/u.test(s.title));
      if (matched) {
        setTargetSectionId(matched.id);
        const bpId = SECTION_RHETORICAL_BLUEPRINTS[matched.id]
          ? matched.id
          : matchBlueprintNode(matched.title)?.id;
        if (bpId && SECTION_RHETORICAL_BLUEPRINTS[bpId]) {
          setRhetoricNodeId(bpId);
        }
      }
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPicked = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      if (detail) syncTargetSection(detail);
    };
    window.addEventListener('evix:picked-section', onPicked);
    return () => window.removeEventListener('evix:picked-section', onPicked);
  }, [syncTargetSection]);

  const activeBlueprint = SECTION_RHETORICAL_BLUEPRINTS[rhetoricNodeId] ?? RHETORIC_LIST[0];
  const targetSection = content.report.find(s => s.id === targetSectionId) ?? content.report[0];
  const targetProse = useMemo(() => (targetSection ? sectionProseText(targetSection) : ''), [targetSection]);
  const aiAudit = useMemo(() => detectAiFlavor(targetProse), [targetProse]);

  const submitSteering = () => {
    const clean = noteInput.trim();
    if (!clean) return;
    onAddSteering(clean);
    setNoteInput('');
  };

  const handleDeAiSectionBody = () => {
    if (!targetSection) return;
    const beforeScore = detectAiFlavor(sectionProseText(targetSection)).score;
    const bodyRes = targetSection.body.trim()
      ? humanizeTextWithSkills(targetSection.body, 'academic_clean')
      : { rewritten: targetSection.body, changes: [] as string[] };
    let blockChanges = 0;
    let blocksChanged = false;
    const nextBlocks = targetSection.blocks?.map(block => {
      if (!['paragraph', 'callout', 'citation'].includes(block.kind) || !block.text.trim()) return block;
      const cleaned = humanizeTextWithSkills(block.text, 'academic_clean');
      blockChanges += cleaned.changes.length;
      if (cleaned.rewritten !== block.text.trim()) {
        blocksChanged = true;
        return { ...block, text: cleaned.rewritten };
      }
      return block;
    });
    const bodyChanged = bodyRes.rewritten !== targetSection.body.trim();
    if (!bodyChanged && !blocksChanged) {
      setDeAiStatus(`“${targetSection.title}”当前套话指数为 ${beforeScore}/100，未见需清理的高频套话。`);
      return;
    }
    const updatedSection = {
      ...targetSection,
      ...(bodyChanged ? { body: bodyRes.rewritten } : {}),
      ...(nextBlocks ? { blocks: nextBlocks } : {}),
    };
    const afterScore = detectAiFlavor(sectionProseText(updatedSection)).score;
    const totalChanges = bodyRes.changes.length + blockChanges;
    if (onUpdateReport) {
      const next = parseEditorContent({
        ...content,
        report: content.report.map(s => (s.id === targetSection.id ? updatedSection : s)),
      });
      onUpdateReport(
        next,
        `已按学术文风润色规范优化“${targetSection.title}”，套话指数由 ${beforeScore} 降至 ${afterScore}。`,
      );
    }
    setDeAiStatus(`✓ 已改写“${targetSection.title}”（套话指数 ${beforeScore} → ${afterScore}），共清理 ${totalChanges} 处套话。`);
    onJumpToSection(targetSection.id);
  };

  const injectDeAiRulesToPrompt = () => {
    onAddSteering(buildDeAiPromptRules('academic_clean'));
    setDeAiStatus('✓ 已将学术去套话要求加入后续写作指令。');
  };

  const submitManualAnnotation = () => {
    if (!manualIdea.trim()) return;
    onAddAnnotation({
      sectionId: targetSectionId,
      quote: manualQuote.trim() || '整节表述优化',
      note: manualIdea.trim(),
    });
    setManualQuote('');
    setManualIdea('');
  };

  const sectionTitle = (id: string) => content.report.find(s => s.id === id)?.title ?? id;

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>学术文风润色与批注精修</h4>
        <span className={styles.monoTag}>
          学术润色规范 · 待办 {steeringNotes.length}
        </span>
      </div>

      {/* 1. 学术文风与去套话实时检测与章节去味 */}
      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>🧼 学术文风与去套话审查</strong>
          <span className={styles.badge}>
            套话指数 {aiAudit.score}/100（{aiAudit.level === 'clean' ? '自然' : aiAudit.level === 'mild' ? '轻度' : '偏高'}）
          </span>
        </div>

        <select
          className={styles.select}
          aria-label="选择要检测与批注的报告章节"
          value={targetSectionId}
          onChange={e => syncTargetSection(e.target.value)}
        >
          {content.report
            .filter(s => !/^(?:封面|目录)/u.test(s.title))
            .map(s => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
        </select>

        {aiAudit.hits.length > 0 && (
          <div className={styles.row}>
            {aiAudit.hits.slice(0, 5).map(h => (
              <span key={h.phrase} className={styles.hitMark} title={h.reason}>
                {h.phrase}
              </span>
            ))}
          </div>
        )}

        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleDeAiSectionBody}>
            🧼 一键润色本节文风
          </button>
          <button type="button" className={styles.btn} onClick={injectDeAiRulesToPrompt}>
            + 写入下轮写作要求
          </button>
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
            查看内置学术文风润色规范 ({TOP10_DEAI_SKILLS.length} 项)
          </summary>
          <ul className={styles.list} style={{ marginTop: 8 }}>
            {TOP10_DEAI_SKILLS.map(sk => (
              <li key={sk.id} className={styles.itemCard} style={{ padding: '6px 8px' }}>
                <div className={styles.heroHead}>
                  <strong style={{ fontSize: 11.5 }}>
                    <span className={styles.monoTag}>{sk.rank}</span> {sk.name}
                  </strong>
                  <span className={styles.badge}>{sk.tag}</span>
                </div>
                <p className={styles.muted}>{sk.summary}</p>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {/* 2. 本章写作补充要求 + 国奖修辞模板 */}
      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>本章写作补充要求（{steeringNotes.length}）</strong>
          <small className={styles.muted}>下轮生成优先遵循</small>
        </div>
        <div className={styles.row}>
          <input
            className={styles.input}
            aria-label="本章写作补充要求"
            style={{ flex: 1, minWidth: 110 }}
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitSteering();
              }
            }}
            placeholder="补充受访青年群体差异对比，精简过渡段落…"
          />
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!noteInput.trim()} onClick={submitSteering}>
            + 加入要求
          </button>
        </div>
        <div className={styles.row}>
          {QUICK_OPERATORS.map(op => (
            <button
              key={op.label}
              type="button"
              className={styles.btn}
              onClick={() => {
                onAddSteering(op.directive);
                setManualIdea(prev => (prev.trim() ? prev : op.directive));
              }}
            >
              {op.label}
            </button>
          ))}
        </div>

        {steeringNotes.length > 0 && (
          <ul className={styles.list}>
            {steeringNotes.map((note, idx) => (
              <li key={`${idx}-${note.slice(0, 10)}`} className={styles.itemCard}>
                <div className={styles.heroHead}>
                  <span style={{ fontSize: 11.5, overflowWrap: 'anywhere', flex: 1 }}>{idx + 1}. {note}</span>
                  <button
                    type="button"
                    className={styles.btn}
                    aria-label={`撤除第 ${idx + 1} 条写作补充要求`}
                    onClick={() => onRemoveSteering(idx)}
                  >
                    撤除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
            🏆 国奖 28 节点修辞骨架参考
          </summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <select
              className={styles.select}
              aria-label="选择国奖章节修辞模板"
              value={rhetoricNodeId}
              onChange={e => setRhetoricNodeId(e.target.value)}
            >
              {RHETORIC_LIST.map(bp => (
                <option key={bp.nodeId} value={bp.nodeId}>
                  {bp.chapterGroup} · {bp.sectionName}
                </option>
              ))}
            </select>
            {activeBlueprint && (
              <div className={styles.itemCard} style={{ fontSize: 11.5 }}>
                <div><b>论证脉络</b> · {cleanRhetoricBlueprintCopy(activeBlueprint.structuralArc)}</div>
                <div><b>开篇参考</b> · {cleanRhetoricBlueprintCopy(activeBlueprint.openingMove)}</div>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => onAddSteering(`${activeBlueprint.sectionName}写作规范，${cleanRhetoricBlueprintCopy(activeBlueprint.recommendedNotes)}`)}
                >
                  + 加入该节写作规范
                </button>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* 3. 正文划词批注 */}
      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>正文选区批注（{annotations.length}）</strong>
          <small className={styles.muted}>划词直连</small>
        </div>
        <div className={styles.field}>
          <input
            className={styles.input}
            aria-label="摘录待修改正文片段"
            value={manualQuote}
            onChange={e => setManualQuote(e.target.value)}
            placeholder="摘录待修改片段（或在中间纸面划词自动带入）"
          />
          <textarea
            className={styles.textarea}
            aria-label="章节修改思路"
            value={manualIdea}
            onChange={e => setManualIdea(e.target.value)}
            placeholder="填写修改思路（例如删掉套话并补充统计检验置信边界）"
          />
          <button type="button" className={styles.btn} disabled={!manualIdea.trim()} onClick={submitManualAnnotation}>
            📌 添加批注
          </button>
        </div>

        {annotations.length === 0 ? (
          <div className={styles.itemCard} role="note" style={{ fontSize: 11.5 }}>
            <strong>暂无正文批注</strong>
            <p className={styles.muted} style={{ margin: '2px 0 0' }}>
              可在中间报告纸面划选句子自动带入，或在上方填写摘录片段与修改思路后添加批注。
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {annotations.map((ann, idx) => {
              const secName = sectionTitle(ann.sectionId);
              return (
                <li key={ann.id} className={styles.itemCard}>
                  <div className={styles.heroHead}>
                    <strong style={{ fontSize: 11.5 }}>{secName}</strong>
                    <span className={styles.badge}>{ann.status === 'applied' ? '✓ 已改写' : '待精修'}</span>
                  </div>
                  {ann.quote && <p className={styles.hitMark} style={{ margin: 0 }}>“{ann.quote}”</p>}
                  <p style={{ margin: 0, fontSize: 12 }}>{ann.note}</p>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      aria-label={`按第 ${idx + 1} 条批注重写“${secName}”`}
                      onClick={() => onRewriteWithIdea(ann.sectionId, ann.quote, ann.note)}
                    >
                      ✨ 按此重写
                    </button>
                    <button
                      type="button"
                      className={styles.btn}
                      aria-label={`定位至第 ${idx + 1} 条批注所在章节“${secName}”`}
                      onClick={() => onJumpToSection(ann.sectionId)}
                    >
                      定位
                    </button>
                    <button
                      type="button"
                      className={styles.btn}
                      aria-label={`${ann.status === 'applied' ? '重新打开' : '标记完成'}第 ${idx + 1} 条批注`}
                      onClick={() => onToggleAnnotationStatus(ann.id)}
                    >
                      {ann.status === 'applied' ? '重开' : '完成'}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnDanger}`}
                      aria-label={`删除第 ${idx + 1} 条正文批注（${secName}）`}
                      onClick={() => onRemoveAnnotation(ann.id)}
                    >
                      删
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.statusBar} role="status" aria-live="polite">{deAiStatus}</div>
    </div>
  );
}
