'use client';

import { useMemo, useState } from 'react';
import type { PaperAnnotation } from '@/components/editors/PaperPages';
import { parseEditorContent, type EditorContent } from '@/lib/editor-model';
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
    label: '🛡️ 知网 AIGC 降重去味',
    directive: '禁用“综上所述/值得注意的是/赋能/抓手”等套话，打散机械对称排比，转为结论前置、证据紧跟的写法。',
  },
  {
    label: '📐 三线表互文强化',
    directive: '正文严格与三线表相互指代，重点解释显著因子方向与效应量，避免流水账报数。',
  },
  {
    label: '🎯 痛点—主体—KPI对策',
    directive: '对策回溯前文关键改进项与群体断点，明确执行举措、协同责任主体与评估指标。',
  },
];

const RHETORIC_LIST = Object.values(SECTION_RHETORICAL_BLUEPRINTS);

export default function SteeringAnnotationStudio({
  content,
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
  const [targetSectionId, setTargetSectionId] = useState(() =>
    content.report.find(s => !/^(?:封面|目录)/u.test(s.title))?.id ?? content.report[0]?.id ?? 'intro.background',
  );
  const [manualQuote, setManualQuote] = useState('');
  const [manualIdea, setManualIdea] = useState('');
  const [rhetoricNodeId, setRhetoricNodeId] = useState<string>(RHETORIC_LIST[0]?.nodeId ?? 'intro.background');
  const [deAiStatus, setDeAiStatus] = useState('已内置 GitHub 去 AI 味十大 Skill，可检测当前章节或直接去除正文套话。');

  const activeBlueprint = SECTION_RHETORICAL_BLUEPRINTS[rhetoricNodeId] ?? RHETORIC_LIST[0];
  const targetSection = content.report.find(s => s.id === targetSectionId) ?? content.report[0];
  const aiAudit = useMemo(() => detectAiFlavor(targetSection?.body ?? ''), [targetSection?.body]);

  const submitSteering = () => {
    const clean = noteInput.trim();
    if (!clean) return;
    onAddSteering(clean);
    setNoteInput('');
  };

  const handleDeAiSectionBody = () => {
    if (!targetSection) return;
    const res = humanizeTextWithSkills(targetSection.body, 'academic_clean');
    if (res.rewritten === targetSection.body.trim()) {
      setDeAiStatus(`「${targetSection.title}」当前 AI 味 ${res.beforeScore}/100，未见需清洗的高频套话。`);
      return;
    }
    if (onUpdateReport) {
      const next = parseEditorContent({
        ...content,
        report: content.report.map(s => (s.id === targetSection.id ? { ...s, body: res.rewritten } : s)),
      });
      onUpdateReport(
        next,
        `已应用去 AI 味 Skill（Humanizer-zh / stop-slop）清洗「${targetSection.title}」：AI 味指数 ${res.beforeScore} → ${res.afterScore}。`,
      );
    }
    setDeAiStatus(`✓ 已改写「${targetSection.title}」（AI味 ${res.beforeScore} → ${res.afterScore}），共清理 ${res.changes.length} 处套话。`);
    onJumpToSection(targetSection.id);
  };

  const injectDeAiRulesToPrompt = () => {
    onAddSteering(buildDeAiPromptRules('academic_clean'));
    setDeAiStatus('✓ 已将去 AI 味写作红线注入全局 Agent 生成指令队列。');
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
        <h4>写作去 AI 味 &amp; 批注精修</h4>
        <span className={styles.monoTag}>
          Top-10 Skills · 队列 {steeringNotes.length}
        </span>
      </div>

      {/* 1. GitHub 去 AI 味十大 Skill 实时检测与章节去味 */}
      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>🧼 GitHub 去 AI 味十大 Skill 审查</strong>
          <span className={styles.badge}>
            AI味 {aiAudit.score}/100 ({aiAudit.level === 'clean' ? '自然' : aiAudit.level === 'mild' ? '轻度' : '偏高'})
          </span>
        </div>

        <select
          className={styles.select}
          aria-label="选择要检测与批注的报告章节"
          value={targetSectionId}
          onChange={e => setTargetSectionId(e.target.value)}
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
            🧼 一键去 AI 味改写本节
          </button>
          <button type="button" className={styles.btn} onClick={injectDeAiRulesToPrompt}>
            + 注入去味红线到 Prompt
          </button>
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
            查看内置 GitHub「去 AI 味十大 Skill 榜」({TOP10_DEAI_SKILLS.length} 项)
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

      {/* 2. 实时写作指令插话 + 国奖修辞模板 */}
      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>实时写作指令队列（{steeringNotes.length}）</strong>
          <small className={styles.muted}>下轮生成优先遵循</small>
        </div>
        <div className={styles.row}>
          <input
            className={styles.input}
            style={{ flex: 1, minWidth: 110 }}
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitSteering();
              }
            }}
            placeholder="例如：补充 Z 世代群体异质性对比，精简过渡句…"
          />
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!noteInput.trim()} onClick={submitSteering}>
            + 注入
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
                  <button type="button" className={styles.btn} onClick={() => onRemoveSteering(idx)}>
                    撤除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
            🏆 国奖 26 节点修辞骨架参考
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
                <div><b>论证骨架：</b>{activeBlueprint.structuralArc}</div>
                <div><b>开篇示范：</b>{activeBlueprint.openingMove}</div>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => onAddSteering(`[${activeBlueprint.sectionName}] ${activeBlueprint.recommendedNotes}`)}
                >
                  + 注入该节写作规范
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
            value={manualQuote}
            onChange={e => setManualQuote(e.target.value)}
            placeholder="摘录待修改片段（或在中间 A4 纸面划词自动带入）"
          />
          <textarea
            className={styles.textarea}
            value={manualIdea}
            onChange={e => setManualIdea(e.target.value)}
            placeholder="修改思路（如：删掉套话并补充统计检验置信边界）"
          />
          <button type="button" className={styles.btn} disabled={!manualIdea.trim()} onClick={submitManualAnnotation}>
            📌 添加批注
          </button>
        </div>

        <ul className={styles.list}>
          {annotations.map(ann => (
            <li key={ann.id} className={styles.itemCard}>
              <div className={styles.heroHead}>
                <strong style={{ fontSize: 11.5 }}>{sectionTitle(ann.sectionId)}</strong>
                <span className={styles.badge}>{ann.status === 'applied' ? '✓ 已改写' : '待精修'}</span>
              </div>
              {ann.quote && <p className={styles.hitMark} style={{ margin: 0 }}>“{ann.quote}”</p>}
              <p style={{ margin: 0, fontSize: 12 }}>{ann.note}</p>
              <div className={styles.row}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => onRewriteWithIdea(ann.sectionId, ann.quote, ann.note)}
                >
                  ✨ 按此重写
                </button>
                <button type="button" className={styles.btn} onClick={() => onJumpToSection(ann.sectionId)}>
                  定位
                </button>
                <button type="button" className={styles.btn} onClick={() => onToggleAnnotationStatus(ann.id)}>
                  {ann.status === 'applied' ? '重开' : '完成'}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => onRemoveAnnotation(ann.id)}>
                  删
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.statusBar}>{deAiStatus}</div>
    </div>
  );
}
