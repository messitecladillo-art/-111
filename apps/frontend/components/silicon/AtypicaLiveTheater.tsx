'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { detectAiFlavor } from '@/lib/agent/interview-corpus-deai';
import type { Questionnaire } from '@/lib/questionnaire';
import type { Expectation } from '@/lib/silicon/assess';
import {
  buildAtypicaFlowBlueprint,
  FLOW_CHECKLIST_STEPS,
  RIGHT_VIEW_OPTIONS,
  type AtypicaFlowBlueprint,
  type DiscussionTurnItem,
  type EnrichedPersonaEntry,
  type InterviewRoundPack,
  type LiveFlowRightViewId,
} from '@/lib/silicon/live-flow';
import type { Persona, PersonaAttribute } from '@/lib/silicon/persona';
import { answerLabel, type RunSettings, type SiliconRun } from '@/lib/silicon/run';
import { NEUTRAL_HALO, stageCategoryColor } from '@/lib/silicon/palette';
import { siliconCsv } from '@/lib/silicon/export';
import type { DatasetHandoff } from './ResultsBoard';
import type { FigureActivity, StageFigure, StageTip } from './PersonaStage';
import PersonaAvatar from './PersonaAvatar';
import styles from './AtypicaLiveTheater.module.css';

const PersonaStage = dynamic(() => import('./PersonaStage'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#a1a1aa' }}>
      正在挂载 3D 硅基舞台…
    </div>
  ),
});

export interface AtypicaLiveTheaterProps {
  design: Questionnaire;
  attributes: PersonaAttribute[];
  personas: Persona[];
  settings: RunSettings;
  run: SiliconRun;
  expectations?: Expectation[];
  /** Start playing automatically on mount. */
  autoPlay?: boolean;
  /** Optional modal styling + close handler when launched from /agent or overlay. */
  modalMode?: boolean;
  onClose?: () => void;
  onSendToAnalysis?: (handoff: DatasetHandoff) => void;
  onOpenReportAction?: (blueprint: AtypicaFlowBlueprint) => void;
}

const TOTAL_PHASES = 12;

function renderHighlightedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/gu);
  return parts.map((chunk, i) => {
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return <strong key={i}>{chunk.slice(2, -2)}</strong>;
    }
    return <span key={i}>{chunk}</span>;
  });
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AtypicaLiveTheater({
  design,
  attributes,
  personas,
  settings,
  run,
  expectations = [],
  autoPlay = true,
  modalMode = false,
  onClose,
  onSendToAnalysis,
  onOpenReportAction,
}: AtypicaLiveTheaterProps) {
  const blueprint = useMemo(
    () => buildAtypicaFlowBlueprint({ design, attributes, personas, settings, run, expectations }),
    [design, attributes, personas, settings, run, expectations],
  );

  const [phaseIndex, setPhaseIndex] = useState<number>(autoPlay ? 2 : TOTAL_PHASES);
  const [playing, setPlaying] = useState<boolean>(autoPlay);
  const [speed, setSpeed] = useState<'1x' | '3x' | 'instant'>('1x');
  const [autoFollowView, setAutoFollowView] = useState<boolean>(true);
  const [rightView, setRightView] = useState<LiveFlowRightViewId>('design');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const [nerdOpen, setNerdOpen] = useState(false);
  const [dockPopover, setDockPopover] = useState<'progress' | 'outputs' | 'panel' | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [copiedNotice, setCopiedNotice] = useState('');

  // Interactive clarifications & accordions
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({
    focus: 'pretest',
    mode: 'live',
  });
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [expandedExecs, setExpandedExecs] = useState<Record<string, boolean>>({
    discussion: true,
  });
  const [citedOnly, setCitedOnly] = useState(false);
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<number | null>(null);

  // Selected personas for 1v1 interview switcher, Dossier Modal, and 3D stage
  const [activeInterviewPersonaId, setActiveInterviewPersonaId] = useState<string>(
    blueprint.enrichedPersonas[0]?.persona.id ?? '',
  );
  const [modalPersona, setModalPersona] = useState<EnrichedPersonaEntry | null>(null);
  const [stageSelectedId, setStageSelectedId] = useState<string | null>(null);

  // Live Roundtable state (baseline turns + user live follow-up turns)
  const [extraDiscussionTurns, setExtraDiscussionTurns] = useState<DiscussionTurnItem[]>([]);
  const [followupDraft, setFollowupDraft] = useState('');
  const [followupBusy, setFollowupBusy] = useState(false);
  const [expandedReasons, setExpandedReasons] = useState<Record<string, boolean>>({});
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({});

  const timelineEndRef = useRef<HTMLDivElement>(null);

  // Escape key closes popovers or Dossier Modal cleanly
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalPersona) setModalPersona(null);
        else if (viewMenuOpen) setViewMenuOpen(false);
        else if (dockPopover) setDockPopover(null);
        else if (nerdOpen) setNerdOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalPersona, viewMenuOpen, dockPopover, nerdOpen]);

  // Playback timer driving steps 2 -> 12 continuously like Atypica live stream
  useEffect(() => {
    if (!playing || phaseIndex >= TOTAL_PHASES) return;
    if (speed === 'instant') {
      const id = window.setTimeout(() => {
        setPhaseIndex(TOTAL_PHASES);
        setPlaying(false);
        if (autoFollowView) setRightView('report');
      }, 60);
      return () => window.clearTimeout(id);
    }
    const stepMs = speed === '3x' ? 420 : 1250;
    const timer = window.setTimeout(() => {
      const next = Math.min(TOTAL_PHASES, phaseIndex + 1);
      setPhaseIndex(next);
      if (autoFollowView) {
        const matchedTodo = FLOW_CHECKLIST_STEPS.find(s => s.doneAtStep === next);
        if (matchedTodo) setRightView(matchedTodo.viewId);
      }
      if (next >= TOTAL_PHASES) setPlaying(false);
    }, stepMs);
    return () => window.clearTimeout(timer);
  }, [playing, phaseIndex, speed, autoFollowView]);

  // Live Nerd Stats clock while streaming
  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => {
      setElapsedSec(s => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [playing]);

  // Auto-scroll left timeline on new streaming phases
  useEffect(() => {
    if (playing) {
      timelineEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [phaseIndex, playing, extraDiscussionTurns.length]);

  const completedTodos = FLOW_CHECKLIST_STEPS.filter(s => phaseIndex >= s.doneAtStep).length;
  const activeTodo = FLOW_CHECKLIST_STEPS.find(s => phaseIndex === s.doneAtStep - 1) ?? null;

  const focusRightView = (viewId: LiveFlowRightViewId, manual = true) => {
    if (manual) setAutoFollowView(false);
    setRightView(viewId);
    setViewMenuOpen(false);
    setDockPopover(null);
  };

  const toggleExecExpand = (key: string) =>
    setExpandedExecs(prev => ({ ...prev, [key]: !prev[key] }));

  const restartPlayback = () => {
    setPhaseIndex(1);
    setElapsedSec(0);
    setAutoFollowView(true);
    setRightView('design');
    setExtraDiscussionTurns([]);
    setPlaying(true);
  };

  const handleShareTrace = () => {
    const summary = [
      `# ${blueprint.studyTitle} · EVI-X × Atypica 实时推演记录`,
      `- 受访队列：${blueprint.enrichedPersonas.length} 位硅基样本`,
      `- 已完成流程：${completedTodos}/${FLOW_CHECKLIST_STEPS.length}`,
      `- 核心指标：有效回答 ${blueprint.report.metrics.responses} · 阻断 ${blueprint.report.metrics.blockers} · 修订提示 ${blueprint.report.metrics.warnings}`,
      ...blueprint.discussionTurns.map(t => `- [${t.alias}] ${t.content.replace(/\*\*/gu, '')}`),
    ].join('\n');
    void navigator.clipboard?.writeText(summary).then(() => {
      setCopiedNotice('已复制推演实录');
      setTimeout(() => setCopiedNotice(''), 2000);
    });
  };

  // Trigger real DeepSeek or grounded local rebuttal on follow-up question
  const submitFollowupQuestion = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || followupBusy) return;
    setFollowupDraft('');
    setFollowupBusy(true);
    focusRightView('discussion', false);
    setPhaseIndex(TOTAL_PHASES);
    setPlaying(false);

    const modTurn: DiscussionTurnItem = {
      id: `mod-live-${Date.now().toString(36)}`,
      speakerType: 'moderator',
      alias: '证见 · 焦点主持人（实时追问）',
      roleBadge: '实时追问',
      content: clean,
    };

    const cast = blueprint.enrichedPersonas.slice(0, 3);
    const liveReplies: DiscussionTurnItem[] = [];

    for (let i = 0; i < cast.length; i++) {
      const entry = cast[i];
      const next = cast[i + 1];
      let replyText = '';
      try {
        const prompt = `请你完全以第一人称硅基受访者「${entry.profile.alias}」（${entry.profile.archetype}，人口特征：${entry.profile.tags.join('、')}，口头禅风格：${entry.profile.toneRule}）回答主持人的追问：「${clean}」。要求：70字以内，用生活化口语真实回应，可对问卷设计提具体建议，禁止出现"综上所述"、"值得注意的是"等AI模板词汇。`;
        const resp = await fetch('/api/agent/brain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: prompt,
            history: [],
            step: 1,
            noTools: true,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { reply?: string; message?: string };
          const text = (data.reply || data.message || '').trim();
          if (text.length >= 12) replyText = text;
        }
      } catch {
        // Offline or network drop: fall back deterministically below.
      }

      if (!replyText) {
        replyText = `站在我（**${entry.profile.archetype}**）的角度看你问的「${clean.slice(0, 22)}」：${entry.profile.catchphrase} 真要改的话，建议把对应题目的前提场景写死，别让没遇到过这事的人硬选中间分。`;
      }
      const deai = detectAiFlavor(replyText);
      liveReplies.push({
        id: `persona-live-${entry.persona.id}-${Date.now().toString(36)}-${i}`,
        speakerType: 'persona',
        personaId: entry.persona.id,
        code: entry.persona.code,
        alias: entry.profile.alias,
        roleBadge: entry.profile.archetype,
        content: replyText,
        aiFlavorScore: deai.score,
        nextPersonaId: next?.persona.id,
        nextAlias: next?.profile.alias,
        routingReason: next
          ? `转由「${next.profile.archetype}」交叉对照这一追问在另一类生活作息人群中是否成立。`
          : undefined,
      });
    }

    setExtraDiscussionTurns(prev => [...prev, modTurn, ...liveReplies]);
    setFollowupBusy(false);
  };

  // Compute live 3D Stage Figures synced with current streaming phase!
  const stageData = useMemo(() => {
    const anchorQ = design.questions.find(q => q.type === 'likert' || q.type === 'single') ?? design.questions[0];
    const cats = anchorQ
      ? anchorQ.type === 'likert'
        ? Array.from({ length: Math.max(1, (anchorQ.max ?? 5) - (anchorQ.min ?? 1) + 1) }, (_, i) => String((anchorQ.min ?? 1) + i))
        : anchorQ.choices.map(c => c.code)
      : ['all'];
    const colorMap = new Map(
      cats.map((c, idx) => [c, stageCategoryColor(anchorQ?.type === 'likert', idx, cats.length)]),
    );

    const figures: StageFigure[] = blueprint.enrichedPersonas.map((entry, idx) => {
      const p = entry.persona;
      let activity: FigureActivity = 'idle';
      let halo: string | null = null;
      let group = 'all';

      const resp = run.responses.find(r => r.personaId === p.id && r.status === 'ok');
      const ans = anchorQ && resp ? resp.answers.find(a => a.questionId === anchorQ.id) : undefined;

      if (phaseIndex >= 8) {
        if (ans && ans.shown && !ans.refused && ans.value !== null) {
          const code = String(ans.value);
          group = code;
          halo = colorMap.get(code) ?? NEUTRAL_HALO;
        }
        activity = ans?.unclear?.trim() ? 'flagged' : 'done';
      } else if (phaseIndex >= 6 && idx < 10) {
        activity = playing ? 'thinking' : 'done';
      } else if (playing) {
        activity = 'queued';
      }

      if (rightView === 'interview_1' || rightView === 'interview_2' || rightView === 'interview_3') {
        if (p.id === activeInterviewPersonaId) {
          activity = 'thinking';
          halo = '#39ff5a';
        }
      }

      return {
        id: p.id,
        code: p.code,
        appearance: p.appearance,
        group,
        halo,
        activity,
      };
    });

    const groupOrder =
      phaseIndex >= 8 && anchorQ
        ? cats
            .filter(c => figures.some(f => f.group === c))
            .map(c => ({
              key: c,
              label: anchorQ.type === 'likert' ? `${c} 分` : answerLabel(anchorQ, c),
            }))
            .concat(figures.some(f => f.group === 'all') ? [{ key: 'all', label: '未显示' }] : [])
        : [{ key: 'all', label: '观测队列全景' }];

    const describe = (id: string): StageTip | null => {
      const found = blueprint.enrichedPersonas.find(e => e.persona.id === id);
      if (!found) return null;
      return {
        title: `${found.profile.alias} · ${found.persona.code}`,
        meta: attributes.map(a => found.persona.traits[a.key]).filter(Boolean).join(' · '),
        lines: [`“${found.profile.catchphrase.slice(0, 32)}…”`],
        flag: found.risk.level === 'elevated' ? `保真度风险：${found.risk.reasons.join('、')}` : undefined,
      };
    };

    return { figures, groups: groupOrder, describe };
  }, [blueprint.enrichedPersonas, design.questions, run.responses, phaseIndex, playing, rightView, activeInterviewPersonaId, attributes]);

  const activeViewLabel = RIGHT_VIEW_OPTIONS.find(v => v.id === rightView)?.label ?? '研究设计';
  const isLiveGlow = playing || followupBusy;
  const elapsedLabel = `${String(Math.floor(elapsedSec / 60)).padStart(2, '0')}m ${String(elapsedSec % 60).padStart(2, '0')}s`;
  const allDiscussionTurns = [...blueprint.discussionTurns, ...extraDiscussionTurns];

  const firstBatch = blueprint.enrichedPersonas.slice(0, 5);
  const fullBatch = blueprint.enrichedPersonas.slice(0, 10);

  return (
    <section
      className={styles.theaterRoot}
      data-modal={modalMode ? 'true' : undefined}
      aria-label="证见 × Atypica 1:1 硅基实时研究剧场"
    >
      {/* ── Top Cockpit Header ── */}
      <header className={styles.topBar}>
        <div className={styles.brandGroup}>
          <span className={styles.brandName}>
            <i className={styles.liveDot} data-active={isLiveGlow ? 'true' : 'false'} aria-hidden="true" />
            <span>atypica × 证见</span>
          </span>
          <span className={styles.studyTitlePill} title={blueprint.studyTitle}>
            {blueprint.studyTitle}
          </span>
        </div>

        <div className={styles.headerActions}>
          <button type="button" className={styles.ghostBtn} onClick={handleShareTrace}>
            <span>{copiedNotice || '分享研究过程'}</span>
          </button>

          <button
            type="button"
            className={styles.ghostBtn}
            aria-expanded={nerdOpen}
            aria-haspopup="dialog"
            onClick={() => setNerdOpen(v => !v)}
          >
            <span>Nerd Stats</span>
          </button>

          <span className={styles.quotaChip}>
            {blueprint.enrichedPersonas.length} 位 · {Math.max(1, settings.scenarios.length)} 情境
          </span>

          <div className={styles.speedGroup} role="group" aria-label="推演播放倍速">
            {([
              ['1x', '1x'],
              ['3x', '3x'],
              ['instant', '全展开'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                aria-pressed={speed === val}
                onClick={() => {
                  setSpeed(val);
                  if (val === 'instant') {
                    setPhaseIndex(TOTAL_PHASES);
                    setPlaying(false);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => {
              if (phaseIndex >= TOTAL_PHASES) {
                restartPlayback();
              } else {
                setPlaying(p => !p);
              }
            }}
          >
            {phaseIndex >= TOTAL_PHASES ? '↻ 重跑演示' : playing ? '⏸ 暂停推演' : '▶ 继续推演'}
          </button>

          {onClose && (
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              收起剧场 ×
            </button>
          )}
        </div>

        {/* Nerd Stats Floating Popover */}
        {nerdOpen && (
          <div className={styles.nerdPopover} role="dialog" aria-label="实时运行指标 Nerd Stats">
            <div className={styles.nerdHead}>
              <strong>atypica × evi-x &lt;silicon α&gt;</strong>
              <span>{run.engine === 'demo' ? 'DETERMINISTIC' : 'LLM-LIVE'}</span>
            </div>
            <div className={styles.nerdGrid}>
              <div>
                <small>time</small>
                <strong>{elapsedLabel}</strong>
              </div>
              <div>
                <small>steps</small>
                <strong>{completedTodos}/{FLOW_CHECKLIST_STEPS.length}</strong>
              </div>
              <div>
                <small>agents</small>
                <strong>{blueprint.enrichedPersonas.length}</strong>
              </div>
              <div>
                <small>answers</small>
                <strong>{blueprint.report.metrics.responses}</strong>
              </div>
            </div>
            <div className={styles.nerdFoot}>
              <span>engine: {settings.engine}</span>
              <span>EVIX-Lab</span>
            </div>
          </div>
        )}
      </header>

      {/* ── 50/50 Split Body ── */}
      <div className={styles.splitBody}>
        {/* ══ LEFT PANE: LIVE TIMELINE STREAM ══ */}
        <div className={styles.leftPane}>
          <div className={styles.timelineScroll}>
            {/* Step 0: Thought Accordion */}
            <button
              type="button"
              className={styles.thoughtToggle}
              aria-expanded={thoughtOpen}
              onClick={() => setThoughtOpen(v => !v)}
            >
              <span>⏱ Thought for 2s</span>
              <span>{thoughtOpen ? '▴' : '▾'}</span>
            </button>
            {thoughtOpen && (
              <div className={styles.thoughtBody}>
                正在分析《{blueprint.studyTitle}》结构：共 {design.questions.length} 道测量题，设定{' '}
                {attributes.length} 个分层属性。将先由 {blueprint.enrichedPersonas.length} 位配额硅基受访者分三轮执行 1v1 访谈，再触发 4 席异质视角焦点圆桌，最终合成为带定量核验的预测试报告。
              </div>
            )}

            {/* Interactive Clarification Cards (1:1 exec requestInteraction) */}
            {blueprint.clarificationOptions.map(block => (
              <div key={block.id} className={styles.clarifyBlock}>
                <div className={styles.clarifyQ}>
                  <code style={{ color: '#4ade80', fontSize: 11, marginRight: 6 }}>exec · requestInteraction</code>
                  {block.prompt}
                </div>
                <div className={styles.clarifyOptions}>
                  {block.choices.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={styles.clarifyPill}
                      aria-pressed={clarifyAnswers[block.id] === c.id}
                      onClick={() => {
                        setClarifyAnswers(prev => ({ ...prev, [block.id]: c.id }));
                        if (c.id === 'fast') {
                          setSpeed('instant');
                          setPhaseIndex(TOTAL_PHASES);
                          setPlaying(false);
                        }
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Step 1: Research Plan Card */}
            {phaseIndex >= 1 && (
              <article className={styles.planCard} aria-label="研究计划">
                <div className={styles.planCardHead}>
                  <div>
                    <small>研究计划</small>
                    <h4>{blueprint.planCard.title}</h4>
                  </div>
                  <button
                    type="button"
                    className={styles.execMetaBtn}
                    onClick={() => focusRightView('design')}
                  >
                    查看设计 ↗
                  </button>
                </div>
                <p><strong>背景：</strong>{blueprint.planCard.background}</p>
                <div>
                  <strong>研究目标：</strong>
                  <ul>{blueprint.planCard.goals.map(g => <li key={g}>{g}</li>)}</ul>
                </div>
                <p><strong>目标人群：</strong>{blueprint.planCard.targetPopulation}</p>
                <div>
                  <strong>研究方法：</strong>
                  <ul>{blueprint.planCard.methods.map(m => <li key={m}>{m}</li>)}</ul>
                </div>
                <p><strong>交付物：</strong>{blueprint.planCard.deliverable}</p>
                <div className={styles.planConfirmTick}>✓ 研究计划已确认，正在调度研究步骤</div>
              </article>
            )}

            {/* Step 2: exec designStudy */}
            {phaseIndex >= 2 && (
              <div className={styles.execRow} data-state={phaseIndex === 2 && playing ? 'running' : 'done'} data-focused={rightView === 'design'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => toggleExecExpand('designStudy')}>
                      <span>› exec designStudy</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('design')}>
                      👁 查看过程
                    </button>
                  </div>
                  {expandedExecs.designStudy && (
                    <div className={styles.codeDrawer}>
                      <span className={styles.codeLabel}>&gt;_ args</span>
                      <table className={styles.argsTable}>
                        <tbody>
                          <tr><td>brief</td><td>{blueprint.planCard.background}</td></tr>
                          <tr><td>studyType</td><td>userResearch · siliconPretest</td></tr>
                        </tbody>
                      </table>
                      <span className={styles.codeLabel}>&gt;_ result</span>
                      <pre className={styles.codeBlockPre}>
                        {JSON.stringify(blueprint.todos.map(t => ({ title: t.title, completed: phaseIndex >= t.doneAtStep })), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: exec socialGrounding */}
            {phaseIndex >= 3 && (
              <div className={styles.execRow} data-state={phaseIndex === 3 && playing ? 'running' : 'done'} data-focused={rightView === 'grounding'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => toggleExecExpand('grounding')}>
                      <span>› exec socialGrounding</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('grounding')}>
                      👁 查看过程
                    </button>
                  </div>
                  <div className={styles.sourceChipRow}>
                    {blueprint.groundingSources.map(s => (
                      <span key={s.label} className={styles.sourceChip}>{s.label} · {s.count}</span>
                    ))}
                  </div>
                  <p style={{ margin: 0, color: '#d4d4d8', lineHeight: 1.55 }}>{blueprint.groundingSummary}</p>
                </div>
              </div>
            )}

            {/* Step 4: exec deepResearch */}
            {phaseIndex >= 4 && (
              <div className={styles.execRow} data-state={phaseIndex === 4 && playing ? 'running' : 'done'} data-focused={rightView === 'deep_research'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => focusRightView('deep_research')}>
                      <span>› exec deepResearch</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('deep_research')}>
                      👁 查看过程
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: exec searchPersonas */}
            {phaseIndex >= 5 && (
              <div className={styles.execRow} data-state={phaseIndex === 5 && playing ? 'running' : 'done'} data-focused={rightView === 'search_persona'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => focusRightView('search_persona')}>
                      <span>› exec searchPersonas</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('search_persona')}>
                      🔍 查看详情
                    </button>
                  </div>
                  <div style={{ color: '#d4d4d8' }}>
                    已检索 {blueprint.enrichedPersonas.length} 位配额受访者 · 重点盯防 {blueprint.report.metrics.elevatedRisk} 位边缘高敏样本
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: exec buildPersona (Batch 1 + Batch 2 1:1 cards!) */}
            {phaseIndex >= 6 && (
              <div className={styles.execRow} data-state={phaseIndex === 6 && playing ? 'running' : 'done'} data-focused={rightView === 'build_persona'}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div className={styles.buildBatchCard}>
                    <div className={styles.buildBatchHead}>
                      <span>🤖 已构建 {firstBatch.length} 个 AI 人设</span>
                      <button type="button" className={styles.detailPillBtn} onClick={() => focusRightView('build_persona')}>
                        点击查看
                      </button>
                    </div>
                    <ul className={styles.buildAvatarList}>
                      {firstBatch.map(entry => (
                        <li
                          key={entry.persona.id}
                          className={styles.buildAvatarRow}
                          onClick={() => setModalPersona(entry)}
                        >
                          <PersonaAvatar appearance={entry.persona.appearance} size={22} />
                          <span>{entry.profile.alias}</span>
                          <small style={{ color: '#71717a', marginLeft: 'auto', fontFamily: 'var(--wb-mono, monospace)' }}>
                            {entry.persona.code}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {blueprint.enrichedPersonas.length > 5 && (
                    <div className={styles.buildBatchCard}>
                      <div className={styles.buildBatchHead}>
                        <span>🤖 已构建全部 {blueprint.enrichedPersonas.length} 位硅基队列</span>
                        <button type="button" className={styles.detailPillBtn} onClick={() => focusRightView('build_persona')}>
                          点击查看
                        </button>
                      </div>
                      <ul className={styles.buildAvatarList}>
                        {fullBatch.slice(5, 10).map(entry => (
                          <li
                            key={entry.persona.id}
                            className={styles.buildAvatarRow}
                            onClick={() => setModalPersona(entry)}
                          >
                            <PersonaAvatar appearance={entry.persona.appearance} size={22} />
                            <span>{entry.profile.alias}</span>
                            <small style={{ color: '#71717a', marginLeft: 'auto', fontFamily: 'var(--wb-mono, monospace)' }}>
                              {entry.persona.code}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 7: exec createPanel + 3D stage link */}
            {phaseIndex >= 7 && (
              <div className={styles.execRow} data-state={phaseIndex === 7 && playing ? 'running' : 'done'} data-focused={rightView === 'stage_3d'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => focusRightView('stage_3d')}>
                      <span>› exec createPanel</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('stage_3d')}>
                      3D 舞台
                    </button>
                  </div>
                  <div className={styles.avatarStackBar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div className={styles.avatarOverlap}>
                        {blueprint.enrichedPersonas.slice(0, 5).map(e => (
                          <span key={e.persona.id}>
                            <PersonaAvatar appearance={e.persona.appearance} size={24} />
                          </span>
                        ))}
                      </div>
                      <span style={{ fontSize: 12, color: '#d4d4d8' }}>
                        {blueprint.panelName} · +{Math.max(0, blueprint.enrichedPersonas.length - 5)}
                      </span>
                    </div>
                    <button type="button" className={styles.detailPillBtn} onClick={() => focusRightView('stage_3d')}>
                      进入 3D 舞台 ↗
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Steps 8, 9, 10: Three Interview Rounds with inline Markdown matrix preview */}
            {(['interview_1', 'interview_2', 'interview_3'] as const).map((roundKey, idx) => {
              const unlockAt = 8 + idx;
              if (phaseIndex < unlockAt) return null;
              const round = blueprint.interviewRounds[roundKey];
              const isOpen = !!expandedExecs[roundKey];
              return (
                <div
                  key={roundKey}
                  className={styles.execRow}
                  data-state={phaseIndex === unlockAt && playing ? 'running' : 'done'}
                  data-focused={rightView === roundKey}
                >
                  <div className={styles.execCard}>
                    <div className={styles.execHead}>
                      <button type="button" className={styles.execTitleBtn} onClick={() => toggleExecExpand(roundKey)}>
                        <span>› exec interviewChat · {round.roundLabel}</span>
                      </button>
                      <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView(roundKey)}>
                        👁 查看过程
                      </button>
                    </div>
                    <pre className={styles.codeBlockPre} style={{ maxHeight: isOpen ? 220 : 68 }}>
                      {round.markdownPreview}
                    </pre>
                    <button
                      type="button"
                      className={styles.thoughtToggle}
                      onClick={() => toggleExecExpand(roundKey)}
                    >
                      {isOpen ? '^ 收起矩阵摘要' : '⌄ 展开更多'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Step 11: exec discussionChat with >_ args table */}
            {phaseIndex >= 11 && (
              <div className={styles.execRow} data-state={phaseIndex === 11 && playing ? 'running' : 'done'} data-focused={rightView === 'discussion'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => toggleExecExpand('discussion')}>
                      <span>› exec discussionChat</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('discussion')}>
                      👁 查看过程
                    </button>
                  </div>
                  {expandedExecs.discussion && (
                    <div className={styles.codeDrawer}>
                      <span className={styles.codeLabel}>&gt;_ args</span>
                      <table className={styles.argsTable}>
                        <tbody>
                          <tr><td>panelId</td><td>{blueprint.discussionArgs.panelId}</td></tr>
                          <tr><td>instruction</td><td>{blueprint.discussionArgs.instruction}</td></tr>
                          <tr><td>personaIds</td><td>{JSON.stringify(blueprint.discussionArgs.personaIds)}</td></tr>
                          <tr><td>timelineToken</td><td>{blueprint.discussionArgs.timelineToken}</td></tr>
                        </tbody>
                      </table>
                      <span className={styles.codeLabel}>&gt;_ result</span>
                      <div style={{ color: '#d4d4d8', lineHeight: 1.55 }}>{blueprint.discussionSummary}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 12: exec generateReport + Follow-up exploration chips */}
            {phaseIndex >= 12 && (
              <div className={styles.execRow} data-state="done" data-focused={rightView === 'report'}>
                <div className={styles.execCard}>
                  <div className={styles.execHead}>
                    <button type="button" className={styles.execTitleBtn} onClick={() => focusRightView('report')}>
                      <span>› exec generateReport</span>
                    </button>
                    <button type="button" className={styles.execMetaBtn} onClick={() => focusRightView('report')}>
                      👁 查看报告
                    </button>
                  </div>
                  <p style={{ margin: 0, color: '#bbf7d0', fontWeight: 600 }}>
                    报告已生成：《{blueprint.studyTitle}》预测试与硅基样本深度洞察报告
                  </p>
                  <div className={styles.followupGrid}>
                    {blueprint.report.followupChips.map(chip => (
                      <button
                        key={chip.id}
                        type="button"
                        className={styles.followupBtn}
                        onClick={() => void submitFollowupQuestion(chip.prompt)}
                      >
                        <small>{chip.badge}</small>
                        <strong>{chip.title}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={timelineEndRef} />
          </div>

          {/* ── Sticky Bottom Left Bar: 进度 / 研究产出 / Panel + Follow-up Prompt ── */}
          <div className={styles.leftDock}>
            {/* Dock Popover Panels */}
            {dockPopover === 'progress' && (
              <div className={styles.dockPopover} role="dialog" aria-label="研究步骤进度清单">
                <div className={styles.popoverTitle}>
                  <span>☰ 进度 {completedTodos}/{FLOW_CHECKLIST_STEPS.length}</span>
                  <button type="button" className={styles.detailPillBtn} onClick={() => setDockPopover(null)}>×</button>
                </div>
                <ul className={styles.todoList}>
                  {FLOW_CHECKLIST_STEPS.map(item => {
                    const done = phaseIndex >= item.doneAtStep;
                    const active = !done && activeTodo?.id === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={styles.todoBtn}
                          onClick={() => focusRightView(item.viewId)}
                        >
                          <span className={styles.todoIcon} data-done={done} data-running={active}>
                            {done ? '✓' : active ? '•' : ''}
                          </span>
                          <span>{item.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {dockPopover === 'outputs' && (
              <div className={styles.dockPopover} role="dialog" aria-label="研究产出清单">
                <div className={styles.popoverTitle}>
                  <span>⊞ 研究产出 ({phaseIndex >= 12 ? 3 : 2})</span>
                  <button type="button" className={styles.detailPillBtn} onClick={() => setDockPopover(null)}>×</button>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  <button
                    type="button"
                    className={styles.followupBtn}
                    onClick={() => focusRightView('report')}
                  >
                    <small>📄 结构化预测试洞察报告</small>
                    <strong>《{blueprint.studyTitle}》诊断与修订建议 →</strong>
                  </button>
                  <button
                    type="button"
                    className={styles.followupBtn}
                    onClick={() => downloadFile(siliconCsv(design, run), `硅基样本-${blueprint.panelId}.csv`, 'text/csv;charset=utf-8')}
                  >
                    <small>📊 全量模拟数据集 CSV</small>
                    <strong>下载 {run.responses.length} 条可追溯作答矩阵 ↓</strong>
                  </button>
                  <button
                    type="button"
                    className={styles.followupBtn}
                    onClick={() => focusRightView('stage_3d')}
                  >
                    <small>3D 舞台</small>
                    <strong>在 3D 舞台中巡检全部受访者 ↗</strong>
                  </button>
                </div>
              </div>
            )}

            {dockPopover === 'panel' && (
              <div className={styles.dockPopover} role="dialog" aria-label="受访队列 Panel 概览">
                <div className={styles.popoverTitle}>
                  <span>👥 Panel {blueprint.enrichedPersonas.length}</span>
                  <button type="button" className={styles.detailPillBtn} onClick={() => setDockPopover(null)}>×</button>
                </div>
                <div style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.55 }}>
                  <strong>{blueprint.panelName}</strong>
                  <p style={{ margin: '4px 0 8px', color: '#a1a1aa' }}>
                    {blueprint.enrichedPersonas.length} 位分层受访者已就绪（{blueprint.report.metrics.elevatedRisk} 位保真度警示锚点）
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={styles.detailPillBtn}
                      style={{ flex: 1 }}
                      onClick={() => focusRightView('build_persona')}
                    >
                      浏览人设卡片
                    </button>
                    <button
                      type="button"
                      className={styles.primaryCta}
                      style={{ height: 26, fontSize: 11.5 }}
                      onClick={() => focusRightView('stage_3d')}
                    >
                      3D 舞台查看
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.dockPills}>
              <button
                type="button"
                className={styles.dockPill}
                aria-expanded={dockPopover === 'progress'}
                onClick={() => setDockPopover(p => (p === 'progress' ? null : 'progress'))}
              >
                <span>☰ 进度 {completedTodos}/{FLOW_CHECKLIST_STEPS.length} ⌃</span>
              </button>
              <button
                type="button"
                className={styles.dockPill}
                aria-expanded={dockPopover === 'outputs'}
                onClick={() => setDockPopover(p => (p === 'outputs' ? null : 'outputs'))}
              >
                <span>⊞ 研究产出 {phaseIndex >= 12 ? 3 : 2} ⌃</span>
              </button>
              <button
                type="button"
                className={styles.dockPill}
                aria-expanded={dockPopover === 'panel'}
                onClick={() => setDockPopover(p => (p === 'panel' ? null : 'panel'))}
              >
                <span>👥 Panel {blueprint.enrichedPersonas.length} ⌃</span>
              </button>
            </div>

            <form
              className={styles.promptForm}
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void submitFollowupQuestion(followupDraft);
              }}
            >
              <input
                value={followupDraft}
                onChange={e => setFollowupDraft(e.target.value)}
                disabled={followupBusy}
                placeholder="提出后续问题，直接追问焦点小组（支持实调大模型或离线追问）…"
                aria-label="追问硅基焦点小组"
              />
              <span className={styles.liveStatusLine}>
                <i className={styles.liveDot} data-active={playing || followupBusy ? 'true' : 'false'} aria-hidden="true" />
                <span>
                  {followupBusy
                    ? '实时追问中…'
                    : playing
                      ? `正在推演 ${completedTodos}/${FLOW_CHECKLIST_STEPS.length}`
                      : '推演就绪'}
                </span>
              </span>
              <button
                type="submit"
                className={styles.detailPillBtn}
                disabled={followupBusy || !followupDraft.trim()}
              >
                {followupBusy ? '…' : '追问 ↑'}
              </button>
            </form>
          </div>
        </div>

        {/* ══ RIGHT PANE: SYNCHRONIZED ARTIFACT VIEWPORT (GLOWING EMERALD FRAME) ══ */}
        <div className={styles.rightPane} data-live={isLiveGlow ? 'true' : 'false'}>
          <header className={styles.rightTopBar}>
            <div className={styles.viewSelectWrap}>
              <button
                type="button"
                className={styles.viewTrigger}
                role="combobox"
                aria-expanded={viewMenuOpen}
                aria-haspopup="listbox"
                aria-label="切换右侧演示视图"
                onClick={() => setViewMenuOpen(v => !v)}
              >
                <span>≡ {activeViewLabel}</span>
                <span style={{ opacity: 0.65 }}>⌄</span>
              </button>

              {viewMenuOpen && (
                <div className={styles.viewMenu} role="listbox" aria-label="所有研究阶段产物视图">
                  {RIGHT_VIEW_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      role="option"
                      aria-selected={rightView === opt.id}
                      className={styles.viewOption}
                      onClick={() => focusRightView(opt.id)}
                    >
                      <span>{opt.label}</span>
                      {rightView === opt.id && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className={styles.ghostBtn}
                aria-pressed={autoFollowView}
                onClick={() => setAutoFollowView(v => !v)}
                title="开启时右侧视图随左侧推演步骤自动跳转"
              >
                {autoFollowView ? '⚡ 视图跟随' : '🔒 已锁定视图'}
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                aria-pressed={rightView === 'stage_3d'}
                onClick={() => focusRightView(rightView === 'stage_3d' ? 'build_persona' : 'stage_3d')}
              >
                3D 舞台
              </button>
            </div>
          </header>

          {/* 1. 研究设计 */}
          {rightView === 'design' && (
            <div className={styles.rightScroll}>
              <div className={styles.docView}>
                {blueprint.designMarkdown.split('\n\n').map((block, idx) => {
                  if (block.startsWith('## ')) {
                    return <h3 key={idx}>{block.slice(3)}</h3>;
                  }
                  return (
                    <div key={idx} style={{ whiteSpace: 'pre-wrap', color: '#d4d4d8' }}>
                      {renderHighlightedText(block)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. 文献与观察（含可点击引用徽标与“只看被引用的”开关） */}
          {rightView === 'grounding' && (
            <div className={styles.rightScroll}>
              <div className={styles.docView}>
                <div className={styles.sourceChipRow}>
                  {blueprint.groundingSources.map(s => (
                    <span key={s.label} className={styles.sourceChip}>{s.label} · {s.count}</span>
                  ))}
                </div>
                <p style={{ margin: 0, color: '#d4d4d8' }}>{blueprint.groundingSummary}</p>

                {blueprint.groundingFindings.map(sec => (
                  <div key={sec.heading} style={{ display: 'grid', gap: 8 }}>
                    <h3>{sec.heading}</h3>
                    {sec.bullets.map((b, bi) => (
                      <p key={bi} style={{ margin: 0, color: '#e4e4e7' }}>
                        • {b.text}
                        {b.citeIds.map(cid => (
                          <button
                            key={cid}
                            type="button"
                            className={styles.citeBtn}
                            data-active={highlightedEvidenceId === cid}
                            onClick={() => setHighlightedEvidenceId(cid)}
                            title={`定位证据 #${cid}`}
                          >
                            {cid}
                          </button>
                        ))}
                      </p>
                    ))}
                  </div>
                ))}

                <div className={styles.evidenceSection}>
                  <div className={styles.evidenceBar}>
                    <strong style={{ fontSize: 13 }}>证据 · {blueprint.evidenceCards.length} 条</strong>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#a1a1aa', cursor: 'pointer' }}>
                      <input type="checkbox" checked={citedOnly} onChange={e => setCitedOnly(e.target.checked)} />
                      <span>只看被引用的</span>
                    </label>
                  </div>
                  <div className={styles.evidenceGrid}>
                    {blueprint.evidenceCards
                      .filter(c => !citedOnly || c.cited)
                      .map(card => (
                        <article
                          key={card.id}
                          className={styles.evidenceCard}
                          data-highlighted={highlightedEvidenceId === card.id}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4ade80', fontSize: 11 }}>
                            <span>[{card.id}] {card.platform}</span>
                            <span style={{ color: '#a1a1aa' }}>{card.metric}</span>
                          </div>
                          <strong style={{ fontSize: 12.5 }}>{card.title}</strong>
                          <small style={{ color: '#a1a1aa' }}>{card.source}</small>
                          <p style={{ margin: 0, color: '#d4d4d8', lineHeight: 1.55 }}>{card.excerpt}</p>
                        </article>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. 深度研究 */}
          {rightView === 'deep_research' && (
            <div className={styles.rightScroll}>
              <div className={styles.docView}>
                {blueprint.deepResearchSections.map(sec => (
                  <article
                    key={sec.title}
                    style={{
                      padding: 14,
                      borderRadius: 9,
                      border: '1px solid var(--at-border)',
                      background: 'var(--at-surface)',
                      display: 'grid',
                      gap: 7,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ margin: 0 }}>{sec.title}</h3>
                      <span className={styles.tagChip} style={{ color: '#4ade80', borderColor: 'rgba(34,197,94,0.4)' }}>
                        {sec.badge}
                      </span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#d4d4d8', fontSize: 13 }}>
                      {renderHighlightedText(sec.body)}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* 4. 搜索 Persona（配额核验与风险扫瞄） */}
          {rightView === 'search_persona' && (
            <div className={styles.rightScroll}>
              <div className={styles.docView}>
                <h3>分层配额矩阵与保真度预检（N = {blueprint.enrichedPersonas.length}）</h3>
                <p style={{ margin: 0, color: '#a1a1aa' }}>
                  识别高保真度风险画像 {blueprint.report.metrics.elevatedRisk} 位，确保边缘与非标准群体声音不被平均数淹没。
                </p>
                <div className={styles.evidenceGrid}>
                  {blueprint.enrichedPersonas.slice(0, 8).map(entry => (
                    <div key={entry.persona.id} className={styles.personaCard}>
                      <div className={styles.personaCardHead}>
                        <div className={styles.personaIdentity}>
                          <PersonaAvatar appearance={entry.persona.appearance} size={32} />
                          <div>
                            <strong>{entry.profile.alias}</strong>
                            <small>{entry.persona.code}</small>
                          </div>
                        </div>
                        <button type="button" className={styles.detailPillBtn} onClick={() => setModalPersona(entry)}>
                          详情
                        </button>
                      </div>
                      <div className={styles.tagRow}>
                        {entry.profile.tags.slice(0, 3).map(t => <span key={t} className={styles.tagChip}>{t}</span>)}
                        {entry.risk.level === 'elevated' && (
                          <span className={styles.tagChip} style={{ color: '#fbbf24', borderColor: 'rgba(244,185,66,0.45)' }}>
                            需人工防偏核对
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5. 构建 Persona (1:1 Two-Column Grid!) */}
          {rightView === 'build_persona' && (
            <div className={styles.rightScroll}>
              <div className={styles.personaGrid2Col}>
                {blueprint.enrichedPersonas.slice(0, 12).map(entry => (
                  <article key={entry.persona.id} className={styles.personaCard}>
                    <div className={styles.personaCardHead}>
                      <div className={styles.personaIdentity}>
                        <PersonaAvatar appearance={entry.persona.appearance} size={36} />
                        <div>
                          <strong>{entry.profile.alias}</strong>
                          <small>{entry.persona.code} · {entry.profile.archetype}</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.detailPillBtn}
                        onClick={() => setModalPersona(entry)}
                      >
                        详情
                      </button>
                    </div>
                    <p className={styles.personaProvenance}>{entry.profile.provenance}</p>
                    <div className={styles.tagRow}>
                      {entry.profile.tags.map(tag => (
                        <span key={tag} className={styles.tagChip}>{tag}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* 6, 7, 8. 访谈 1/2/3 (Matrix + Alternating Q&A + Sticky Bottom Respondent Bar!) */}
          {(rightView === 'interview_1' || rightView === 'interview_2' || rightView === 'interview_3') && (
            <InterviewRoundPane
              round={blueprint.interviewRounds[rightView]}
              personas={blueprint.enrichedPersonas}
              activePersonaId={activeInterviewPersonaId}
              onSelectPersona={id => {
                setActiveInterviewPersonaId(id);
                setStageSelectedId(id);
              }}
              onOpenDossier={setModalPersona}
            />
          )}

          {/* 9. 讨论 · 焦点小组圆桌 (@ 下一位 · 查看原因 + 展开) */}
          {rightView === 'discussion' && (
            <div className={styles.rightScroll}>
              <div className={styles.chatStream}>
                {allDiscussionTurns.map(turn => {
                  const personaEntry = turn.personaId
                    ? blueprint.enrichedPersonas.find(e => e.persona.id === turn.personaId)
                    : undefined;
                  const reasonOpen = !!expandedReasons[turn.id];
                  const isCollapsed = !!collapsedReplies[turn.id];

                  return (
                    <div key={turn.id}>
                      {turn.speakerType === 'moderator' ? (
                        <div className={styles.discModeratorCard}>
                          <div className={styles.discModHead}>
                            <i className={styles.liveDot} data-active="true" aria-hidden="true" />
                            <span>{turn.alias}</span>
                          </div>
                          <div className={styles.discBody} style={{ textAlign: 'center', color: '#e4e4e7' }}>
                            {renderHighlightedText(turn.content)}
                          </div>
                        </div>
                      ) : (
                        <article className={styles.discPersonaCard}>
                          <div className={styles.personaCardHead}>
                            <div className={styles.personaIdentity}>
                              {personaEntry && <PersonaAvatar appearance={personaEntry.persona.appearance} size={30} />}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <strong>{turn.alias}</strong>
                                  <span className={styles.discRoleTag}>{turn.roleBadge}</span>
                                </div>
                                <small>{turn.code}</small>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {turn.aiFlavorScore !== undefined && (
                                <span className={styles.tagChip} style={{ color: '#4ade80' }}>
                                  AI味 {turn.aiFlavorScore}/100
                                </span>
                              )}
                              {personaEntry && (
                                <button
                                  type="button"
                                  className={styles.detailPillBtn}
                                  onClick={() => setModalPersona(personaEntry)}
                                >
                                  档案
                                </button>
                              )}
                            </div>
                          </div>
                          <div
                            className={styles.discBody}
                            style={{
                              maxHeight: isCollapsed ? 58 : 'none',
                              overflow: isCollapsed ? 'hidden' : 'visible',
                            }}
                          >
                            {renderHighlightedText(turn.content)}
                          </div>
                          <button
                            type="button"
                            className={styles.thoughtToggle}
                            onClick={() => setCollapsedReplies(p => ({ ...p, [turn.id]: !p[turn.id] }))}
                          >
                            {isCollapsed ? '⌄ 展开全文' : '⌃ 收起'}
                          </button>
                        </article>
                      )}

                      {turn.nextAlias && turn.routingReason && (
                        <div className={styles.routingDivider}>
                          <button
                            type="button"
                            className={styles.routingTrigger}
                            aria-expanded={reasonOpen}
                            onClick={() => setExpandedReasons(p => ({ ...p, [turn.id]: !p[turn.id] }))}
                          >
                            <span>@ {turn.nextAlias}</span>
                            <span>ⓘ {reasonOpen ? '收起原因 ⌃' : '查看原因 ⌄'}</span>
                          </button>
                          {reasonOpen && (
                            <div className={styles.routingReasonBox}>{turn.routingReason}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 10. 报告 · 洞察与诊断 */}
          {rightView === 'report' && (
            <>
              <div className={styles.rightScroll}>
                <article className={styles.reportPaper}>
                  <header>
                    <span className={styles.reportKicker}>{blueprint.report.kicker}</span>
                    <h2>{blueprint.report.title}</h2>
                    <p className={styles.reportSubtitle}>{blueprint.report.subtitle}</p>
                  </header>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: '#27272a' }}>
                    {blueprint.report.lead}
                  </p>
                  <p className={styles.reportNote}>{blueprint.report.sourceNote}</p>

                  <div className={styles.reportKpiGrid}>
                    <div className={styles.reportKpiCard}>
                      <span>模拟回答样本</span>
                      <strong>{blueprint.report.metrics.responses}</strong>
                    </div>
                    <div className={styles.reportKpiCard}>
                      <span>阻断缺陷</span>
                      <strong style={{ color: blueprint.report.metrics.blockers > 0 ? '#dc2626' : '#16a34a' }}>
                        {blueprint.report.metrics.blockers}
                      </strong>
                    </div>
                    <div className={styles.reportKpiCard}>
                      <span>需修订提示</span>
                      <strong style={{ color: '#d97706' }}>{blueprint.report.metrics.warnings}</strong>
                    </div>
                    <div className={styles.reportKpiCard}>
                      <span>回答多样熵 H</span>
                      <strong>{blueprint.report.metrics.entropy === null ? '—' : blueprint.report.metrics.entropy.toFixed(2)}</strong>
                    </div>
                  </div>

                  <section style={{ display: 'grid', gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>核心预测试发现</h3>
                    {blueprint.report.keyFindings.map(item => (
                      <div key={item.title} style={{ padding: '10px 12px', border: '1px solid #e4e4e7', borderRadius: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e' }}>{item.tag}</span>
                        <div style={{ fontSize: 14, fontWeight: 700, margin: '2px 0 4px' }}>{item.title}</div>
                        <p style={{ margin: 0, fontSize: 13, color: '#3f3f46', lineHeight: 1.65 }}>{item.detail}</p>
                      </div>
                    ))}
                  </section>

                  <section style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>代表性硅基画像对照速写</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                      {blueprint.report.personaSnap.map(snap => (
                        <div key={snap.code} style={{ padding: 10, border: '1px solid #e4e4e7', borderRadius: 6, background: '#fafafa' }}>
                          <strong style={{ fontSize: 13 }}>{snap.alias} ({snap.code})</strong>
                          <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>{snap.traitLine}</div>
                          <p style={{ margin: 0, fontSize: 12, color: '#3f3f46', fontStyle: 'italic' }}>“{snap.quote}”</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section style={{ display: 'grid', gap: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>正式投放前核对清单</h3>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#27272a', lineHeight: 1.7 }}>
                      {blueprint.report.actionChecklist.map(step => <li key={step}>{step}</li>)}
                    </ol>
                  </section>
                </article>
              </div>
              <footer className={styles.reportFooterBar}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => downloadFile(siliconCsv(design, run), `硅基预测试-${blueprint.panelId}.csv`, 'text/csv;charset=utf-8')}
                >
                  导出 CSV 矩阵
                </button>
                {onSendToAnalysis && (
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() =>
                      onSendToAnalysis({
                        id: `${run.id}-${Date.now().toString(36)}`,
                        name: `硅基预测试 · ${blueprint.studyTitle}`,
                        csv: siliconCsv(design, run),
                      })
                    }
                  >
                    送入数据分析 ↗
                  </button>
                )}
                {onOpenReportAction && (
                  <button
                    type="button"
                    className={styles.primaryCta}
                    onClick={() => onOpenReportAction(blueprint)}
                  >
                    导入正式工作台 ↗
                  </button>
                )}
              </footer>
            </>
          )}

          {/* 11. 3D 硅基舞台 */}
          {rightView === 'stage_3d' && (
            <div className={styles.stageViewport}>
              <div className={styles.stageBadgeOverlay}>
                <i className={styles.liveDot} data-active="true" aria-hidden="true" />
                <span>3D 硅基舞台 · {blueprint.enrichedPersonas.length} 位在场</span>
              </div>
              <PersonaStage
                figures={stageData.figures}
                groups={stageData.groups}
                selectedId={stageSelectedId}
                onSelect={id => {
                  setStageSelectedId(id);
                  if (id) {
                    const found = blueprint.enrichedPersonas.find(e => e.persona.id === id);
                    if (found) setModalPersona(found);
                  }
                }}
                describe={stageData.describe}
                reducedMotion={false}
                onFallback={() => focusRightView('build_persona')}
                stacked
                label={`3D 舞台：展示 ${blueprint.enrichedPersonas.length} 位硅基受访者`}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Centered 1:1 Persona Dossier Modal ── */}
      {modalPersona && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${modalPersona.profile.alias} 人设完整档案`}
          onClick={e => {
            if (e.target === e.currentTarget) setModalPersona(null);
          }}
        >
          <div className={styles.modalDialog}>
            <header className={styles.modalHead}>
              <div className={styles.personaIdentity}>
                <PersonaAvatar appearance={modalPersona.persona.appearance} size={46} />
                <div>
                  <strong style={{ fontSize: 16 }}>{modalPersona.profile.alias}</strong>
                  <small>{modalPersona.profile.provenance} · 锚点编号 {modalPersona.persona.code}</small>
                </div>
              </div>
              <button
                type="button"
                className={styles.detailPillBtn}
                onClick={() => setModalPersona(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className={styles.modalBody}>
              <div className={styles.tagRow}>
                {modalPersona.profile.tags.map(tag => (
                  <span key={tag} className={styles.tagChip}>{tag}</span>
                ))}
                {modalPersona.risk.level === 'elevated' && (
                  <span className={styles.tagChip} style={{ color: '#fbbf24', borderColor: 'rgba(244,185,66,0.45)' }}>
                    保真度警示：{modalPersona.risk.reasons.join('、')}
                  </span>
                )}
              </div>

              <blockquote
                style={{
                  margin: 0,
                  padding: '10px 14px',
                  borderLeft: '3px solid var(--at-amber)',
                  background: 'rgba(244, 185, 66, 0.08)',
                  color: '#fde68a',
                  borderRadius: '0 8px 8px 0',
                }}
              >
                “{modalPersona.profile.catchphrase}”
              </blockquote>

              {modalPersona.profile.monologue.split('\n\n').map((p, idx) => (
                <p key={idx} style={{ margin: 0 }}>{p}</p>
              ))}

              <div style={{ fontSize: 12, color: '#a1a1aa' }}>
                <strong>语调边界约束：</strong>{modalPersona.profile.toneRule}
              </div>

              <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--at-border)' }}>
                <button
                  type="button"
                  className={styles.primaryCta}
                  onClick={() => {
                    const pid = modalPersona.persona.id;
                    setStageSelectedId(pid);
                    setModalPersona(null);
                    focusRightView('stage_3d');
                  }}
                >
                  在 3D 舞台中定位 TA ↗
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => {
                    const pid = modalPersona.persona.id;
                    setActiveInterviewPersonaId(pid);
                    setModalPersona(null);
                    focusRightView('interview_1');
                  }}
                >
                  💬 查看TA的 1v1 访谈实录
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InterviewRoundPane({
  round,
  personas,
  activePersonaId,
  onSelectPersona,
  onOpenDossier,
}: {
  round: InterviewRoundPack;
  personas: EnrichedPersonaEntry[];
  activePersonaId: string;
  onSelectPersona: (id: string) => void;
  onOpenDossier: (entry: EnrichedPersonaEntry) => void;
}) {
  const activeEntry = personas.find(p => p.persona.id === activePersonaId) ?? personas[0];
  const turns = activeEntry ? round.transcriptsByPersona[activeEntry.persona.id] ?? [] : [];
  const [copiedMatrix, setCopiedMatrix] = useState(false);

  return (
    <div className={styles.interviewShell}>
      <div className={styles.interviewContent}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{round.title}</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: '#a1a1aa' }}>{round.subtitle}</p>
        </div>

        {/* Collapsible / Scrollable Measurement Matrix */}
        <div className={styles.matrixBox}>
          <div className={styles.matrixHeader}>
            <span>⊞ 本轮测量矩阵（{round.matrixRows.length} 位受访者）</span>
            <button
              type="button"
              className={styles.detailPillBtn}
              onClick={() => {
                const md = [
                  `| ${round.matrixHeader.join(' | ')} |`,
                  `| ${round.matrixHeader.map(() => '---').join(' | ')} |`,
                  ...round.matrixRows.map(r => `| ${r.alias} (${r.code}) | ${r.cells.join(' | ')} |`),
                ].join('\n');
                void navigator.clipboard?.writeText(md).then(() => {
                  setCopiedMatrix(true);
                  setTimeout(() => setCopiedMatrix(false), 1800);
                });
              }}
            >
              {copiedMatrix ? '✓ 已复制 MD' : '复制表格'}
            </button>
          </div>
          <div className={styles.matrixScroll}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>{round.matrixHeader.map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {round.matrixRows.map(row => (
                  <tr
                    key={row.personaId}
                    onClick={() => onSelectPersona(row.personaId)}
                    style={{
                      cursor: 'pointer',
                      background: row.personaId === activeEntry?.persona.id ? 'rgba(34, 197, 94, 0.1)' : undefined,
                    }}
                  >
                    <td>
                      <strong>{row.alias.split(' · ').pop()}</strong>{' '}
                      <small style={{ color: '#71717a' }}>({row.code})</small>
                    </td>
                    {row.cells.map((cell, ci) => <td key={ci}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 1v1 Alternating Chat Exchanges */}
        {activeEntry && (
          <div className={styles.chatStream} aria-label={`${activeEntry.profile.alias} 访谈记录`}>
            {turns.map(turn => (
              <div key={turn.questionId} style={{ display: 'grid', gap: 8 }}>
                <div className={styles.modBubbleWrap}>
                  <div>
                    <div className={styles.modBubbleMeta}>
                      <span>证见研究主持</span>
                      <code>{turn.variable}</code>
                    </div>
                    <div className={styles.modBubble}>{turn.questionText}</div>
                  </div>
                </div>

                <div className={styles.guestBubble}>
                  <div className={styles.guestHead}>
                    <PersonaAvatar appearance={activeEntry.persona.appearance} size={24} />
                    <button
                      type="button"
                      onClick={() => onOpenDossier(activeEntry)}
                      style={{ background: 'none', border: 0, color: '#fff', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      {activeEntry.profile.alias}
                    </button>
                    <small style={{ color: '#71717a', fontFamily: 'var(--wb-mono, monospace)' }}>
                      {activeEntry.persona.code}
                    </small>
                  </div>
                  <div className={styles.guestBody}>{turn.answerText}</div>
                  {turn.unclear && <div className={styles.guestUnclear}>💭 困惑反馈：{turn.unclear}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Bottom Horizontal Respondent Switcher (1:1 Atypica) */}
      <div className={styles.respondentBar} role="tablist" aria-label="切换 1v1 受访者实录">
        {round.respondentIds.map(pid => {
          const entry = personas.find(p => p.persona.id === pid);
          if (!entry) return null;
          return (
            <button
              key={pid}
              type="button"
              role="tab"
              aria-selected={activeEntry?.persona.id === pid}
              className={styles.respondentPill}
              onClick={() => onSelectPersona(pid)}
            >
              <PersonaAvatar appearance={entry.persona.appearance} size={20} />
              <span>{entry.profile.alias.split(' · ').pop()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
