'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import { parseEditorContent } from '@/lib/editor-model';
import type { Questionnaire } from '@/lib/questionnaire';
import { buildQuickQuestionnaire } from '@/lib/agent/studio-tools';
import { demoRun, NO_SCENARIO } from '@/lib/silicon/run';

import { reviewWjxExport } from '@/lib/questionnaire-platform-export';
import QuestionnairePlatformExport from '@/components/design/QuestionnairePlatformExport';
import {
  SURVEY_17_CATEGORY_TEMPLATES,
  SURVEY_DESIGN_BEST_PRACTICES,
} from '@/data/zhengda-corpus-2015-2027';
import { detectAiFlavor, generateInterviewCorpus } from '@/lib/agent/interview-corpus-deai';
import PersonaAvatar from '@/components/silicon/PersonaAvatar';
import {
  generatePanel,
  PANEL_TEMPLATES,
  synthesizePersonaProfile,
  type Persona,
  type PersonaProfile,
} from '@/lib/silicon/persona';
import styles from './Studio.module.css';

const AtypicaLiveTheater = dynamic(() => import('@/components/silicon/AtypicaLiveTheater'), {
  ssr: false,
});

interface RoundtableTurn {
  code: string;
  alias: string;
  archetype: string;
  reply: string;
  aiFlavorScore: number;
  nextAlias?: string;
  cueReason?: string;
}

export default function QuickSurveyStudio({
  content,
  design,
  onUpdateReport,
  onOpenMainTheater,
}: {
  content: EditorContent;
  design: Questionnaire | null;
  onSaveDesign?: (next: Questionnaire) => Promise<void> | void;
  onUpdateReport: (next: EditorContent, message: string, nextDesign?: Questionnaire | null) => void;
  onOpenMainTheater?: (payload: {
    design: Questionnaire;
    templateKey: 'residents' | 'students' | 'seniors';
    seed: number;
    population: string;
  }) => void;
}) {
  const [subMode, setSubMode] = useState<'survey' | 'personas' | 'interview'>('survey');
  const [templateKey, setTemplateKey] = useState<'residents' | 'students' | 'seniors'>('residents');
  const [personaSeed, setPersonaSeed] = useState(2026);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [roundtableTopic, setRoundtableTopic] = useState('');
  const [roundtableBusy, setRoundtableBusy] = useState(false);
  const [liveRoundtable, setLiveRoundtable] = useState<RoundtableTurn[] | null>(null);
  const [liveTheaterModalOpen, setLiveTheaterModalOpen] = useState(false);
  const [title, setTitle] = useState(design?.title || content.title || '专题实证调查问卷');
  const [population, setPopulation] = useState(design?.population || '目标受访青年与常住居民群体');
  const [groupQuestion, setGroupQuestion] = useState('您的主要使用/参与频率属于？');
  const [groupChoicesText, setGroupChoicesText] = useState('每周3次及以上高频, 偶尔参与(月1-3次), 暂未参与(潜在群体)');
  const [dimensionsText, setDimensionsText] = useState('流程便捷度, 服务响应速度, 价格/信息透明度, 场景环境体验, 总体推荐意愿');
  const [includeAttention, setIncludeAttention] = useState(true);
  const [revision, setRevision] = useState(1);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [status, setStatus] = useState('选择研究维度即刻生成定量问卷，或切换上方生成去 AI 味定性深访语料。');

  const activeCategory = useMemo(
    () => SURVEY_17_CATEGORY_TEMPLATES.find(c => c.id === selectedCatId) ?? null,
    [selectedCatId],
  );

  const dims = useMemo(
    () => dimensionsText.split(/[,，、\n]+/u).map(s => s.trim()).filter(Boolean),
    [dimensionsText],
  );
  const groupChoices = useMemo(
    () => groupChoicesText.split(/[,，、\n]+/u).map(s => s.trim()).filter(Boolean),
    [groupChoicesText],
  );

  const applyCategoryTemplate = (catId: string) => {
    setSelectedCatId(catId);
    const tpl = SURVEY_17_CATEGORY_TEMPLATES.find(c => c.id === catId);
    if (!tpl) return;
    setTitle(tpl.title);
    setPopulation(tpl.population);
    setGroupQuestion(tpl.groupQuestion);
    setGroupChoicesText(tpl.groupChoices.join(', '));
    setDimensionsText(tpl.dimensions.join(', '));
    setStatus(`已载入「${tpl.category}」经典模板（共 ${tpl.dimensions.length} 维量表）。`);
  };

  const quickDesign = useMemo(
    () =>
      buildQuickQuestionnaire({
        title,
        objective: `定量测度「${title}」核心影响维度对总体满意度的驱动效应`,
        population,
        groupQuestion,
        groupChoices,
        dimensions: dims,
        includeAttentionCheck: includeAttention,
      }),
    [title, population, groupQuestion, groupChoices, dims, includeAttention],
  );

  const interviewCorpus = useMemo(
    () =>
      generateInterviewCorpus({
        topic: title,
        population,
        dimensions: dims,
        groupChoices,
      }),
    [title, population, dims, groupChoices],
  );

  const exportReview = useMemo(() => reviewWjxExport(quickDesign), [quickDesign]);

  const activeTemplate = PANEL_TEMPLATES[templateKey] ?? PANEL_TEMPLATES.residents;
  const siliconPersonas = useMemo<Array<{ persona: Persona; profile: PersonaProfile }>>(() => {
    const list = generatePanel({
      attributes: activeTemplate.attributes,
      size: 6,
      allocation: 'quota',
      seed: personaSeed,
      background: population,
    });
    return list.map(persona => ({
      persona,
      profile: synthesizePersonaProfile(persona, activeTemplate.attributes, title),
    }));
  }, [activeTemplate, personaSeed, population, title]);

  const activePersonaEntry =
    siliconPersonas.find(item => item.persona.id === selectedPersonaId) ?? siliconPersonas[0] ?? null;

  const fallbackRoundtable = useMemo<RoundtableTurn[]>(() => {
    const cast = siliconPersonas.slice(0, 4);
    return cast.map((entry, idx) => {
      const next = cast[idx + 1];
      const dim = dims[idx % Math.max(1, dims.length)] || '核心体验';
      const reply =
        idx === 0
          ? `拿《${title}》来说，我填问卷最烦一上来全是“非常满意到非常不满意”的套话；你要问「${dim}」，不如直接拆出最近一次实际掏钱时到底嫌弃哪块。${entry.profile.catchphrase}`
          : `我赞同前面 ${cast[0].profile.alias.split(' · ').pop()} 说的！不过按我（${entry.profile.archetype}）的日常习惯，光看「${dim}」还不够，像我平常更在乎现场排队值不值得折腾。`;
      return {
        code: entry.persona.code,
        alias: entry.profile.alias,
        archetype: entry.profile.archetype,
        reply,
        aiFlavorScore: detectAiFlavor(reply).score,
        nextAlias: next?.profile.alias,
        cueReason: next
          ? `接力邀请「${next.profile.archetype}」从对照组角度补充遗漏构念`
          : undefined,
      };
    });
  }, [siliconPersonas, dims, title]);

  const roundtableTurns = liveRoundtable ?? fallbackRoundtable;

  const runLiveRoundtable = async () => {
    setRoundtableBusy(true);
    setStatus('正在召唤 4 位硅基人设接入大模型召开实时焦点小组圆桌…');
    const cast = siliconPersonas.slice(0, 4);
    const promptIssue =
      roundtableTopic.trim()
      || `围绕《${title}》量表维度（${dims.slice(0, 4).join('、')}）讨论真实顾虑与问卷设计盲区`;
    const castBrief = cast
      .map(
        (c, i) =>
          `${i + 1}. ${c.profile.alias} (${c.persona.code}, ${c.profile.archetype}, 语调:${c.profile.toneRule})`,
      )
      .join('\n');

    try {
      const res = await fetch('/api/agent/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 1,
          noTools: true,
          context: { topic: title, stage: 'silicon-focus-group' },
          message: [
            `请模拟以下 4 位“硅基焦点小组受访者”围绕议题「${promptIssue}」进行 4 轮口语化互评讨论。`,
            `人物列表：\n${castBrief}`,
            '严格要求：',
            '1) 仅输出纯 JSON 数组，4 个对象，每项字段为 {"code":"S-001","reply":"真实口语回应，70-120字，必须点名回应前一位的某个具体观点","nextReason":"为什么要交给下一位接麦，18字内"}；',
            '2) 严禁使用“综上所述/值得注意的是/赋能/抓手”等 AI 套话，要像真人微信语音聊生活细节。',
          ].join('\n'),
        }),
        signal: AbortSignal.timeout(35_000),
      });
      const json = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
      const raw = json.reply ?? '';
      const arrMatch = /\[[\s\S]*\]/u.exec(raw);
      if (res.ok && json.ok && arrMatch) {
        const parsed = JSON.parse(arrMatch[0]) as Array<{ code?: string; reply?: string; nextReason?: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const formatted: RoundtableTurn[] = parsed.slice(0, 4).map((item, idx) => {
            const match = cast[idx];
            const replyText = String(item.reply ?? '').trim() || fallbackRoundtable[idx]?.reply || '';
            const next = cast[idx + 1];
            return {
              code: match?.persona.code ?? item.code ?? `S-00${idx + 1}`,
              alias: match?.profile.alias ?? `受访者 ${idx + 1}`,
              archetype: match?.profile.archetype ?? '硅基样本',
              reply: replyText,
              aiFlavorScore: detectAiFlavor(replyText).score,
              nextAlias: next?.profile.alias,
              cueReason: next ? String(item.nextReason ?? '').trim() || '不同分层群体接力互评' : undefined,
            };
          });
          setLiveRoundtable(formatted);
          setStatus('✓ 实调大模型完成 4 人硅基焦点小组实时互评（已检测去 AI 味评分）。');
          return;
        }
      }
      setLiveRoundtable(fallbackRoundtable);
      setStatus(`模型未返回有效 JSON（${json.error ?? '已启用本地语料推演'}），已切换本地硅基圆桌推演。`);
    } catch (err) {
      setLiveRoundtable(fallbackRoundtable);
      setStatus(`已切换本地硅基圆桌推演（${err instanceof Error ? err.message : '网络回退'}）。`);
    } finally {
      setRoundtableBusy(false);
    }
  };

  const applyAndSyncSurvey = async () => {
    const summaryText = [
      `问卷设计方案已确认（共 ${quickDesign.questions.length} 题）：围绕「${title}」对${population}开展调研。`,
      `量表结构涵盖 1 道分组控制题（${groupChoicesText}）、${dims.length} 个 5 级李克特维度${includeAttention ? '及 1 道注意力甄别题' : ''}。`,
    ].join('');

    const nextReport = content.report.map(sec =>
      sec.id === 'design.questionnaire'
        ? { ...sec, body: sec.body.trim() ? `${sec.body.trim()}\n\n${summaryText}` : summaryText }
        : sec,
    );
    const updated = parseEditorContent({ ...content, report: nextReport });
    onUpdateReport(updated, `极简问卷工坊已生成 ${quickDesign.questions.length} 道标准题目并写入「调查设计 · 问卷星题纲」。`, quickDesign);
    setRevision(r => r + 1);
    setStatus(`✓ 已同步 ${quickDesign.questions.length} 题问卷结构至工作台与报告设计节。`);
  };

  const injectInterviewAppendix = () => {
    const hasAppendix4 = content.report.some(s => s.id === 's-appendix-4' || /附录四.*深访/u.test(s.title));
    const nextReport = hasAppendix4
      ? content.report.map(s =>
          s.id === 's-appendix-4' || /附录四.*深访/u.test(s.title)
            ? { ...s, body: interviewCorpus.appendixBody }
            : s,
        )
      : [
          ...content.report,
          {
            id: 's-appendix-4',
            title: '附录四 定性深访与焦点小组语料实录及三级编码',
            body: interviewCorpus.appendixBody,
            source: '教学模拟访谈语料 · Humanizer-zh / shuorenhua / nuwa-skill',
          },
        ];
    const updated = parseEditorContent({ ...content, report: nextReport });
    onUpdateReport(updated, '已将半结构化深访提纲、4位去AI味受访者原声语料与三级编码表写入「附录四」。');
    setStatus('✓ 已写入报告「附录四：定性深访与焦点小组语料实录及三级编码」。');
  };

  const downloadInterviewMd = () => {
    const url = URL.createObjectURL(new Blob([interviewCorpus.markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${interviewCorpus.topic || '研究专题'}-深访语料与编码.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('✓ 已导出定性深访提纲与实录 Markdown 档案。');
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>
          {subMode === 'survey'
            ? '极简问卷快搭'
            : subMode === 'personas'
              ? '硅基受访人设与焦点圆桌'
              : '定性深访语料 (去AI味)'}
        </h4>
        <span className={styles.monoTag}>
          {subMode === 'survey'
            ? `${quickDesign.questions.length} 题量表`
            : subMode === 'personas'
              ? `${siliconPersonas.length} 位人设`
              : `${interviewCorpus.transcripts.length} 位受访者`}
        </span>
      </div>

      <div className={styles.segBar} role="tablist" aria-label="问卷与深访语料模式切换">
        <button
          type="button"
          className={`${styles.segBtn} ${subMode === 'survey' ? styles.segBtnActive : ''}`}
          aria-pressed={subMode === 'survey'}
          onClick={() => setSubMode('survey')}
        >
          📝 问卷快搭
        </button>
        <button
          type="button"
          className={`${styles.segBtn} ${subMode === 'personas' ? styles.segBtnActive : ''}`}
          aria-pressed={subMode === 'personas'}
          onClick={() => setSubMode('personas')}
        >
          🎭 人设与圆桌
        </button>
        <button
          type="button"
          className={`${styles.segBtn} ${subMode === 'interview' ? styles.segBtnActive : ''}`}
          aria-pressed={subMode === 'interview'}
          onClick={() => setSubMode('interview')}
        >
          🎙️ 深访语料库
        </button>
      </div>

      {subMode === 'personas' ? (
        <>
          <div className={styles.panel}>
            <div className={styles.row} style={{ justifyContent: 'space-between' }}>
              <select
                className={styles.select}
                style={{ flex: '1 1 130px' }}
                aria-label="选择硅基画像人群模板"
                value={templateKey}
                onChange={e => {
                  setTemplateKey(e.target.value as 'residents' | 'students' | 'seniors');
                  setLiveRoundtable(null);
                }}
              >
                <option value="residents">城市居民样本</option>
                <option value="students">在校大学生样本</option>
                <option value="seniors">银发人群样本</option>
              </select>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  setPersonaSeed(Math.floor(Math.random() * 90000) + 1000);
                  setLiveRoundtable(null);
                }}
              >
                🎲 换一批人设
              </button>
            </div>

            <div className={styles.personaGrid} role="listbox" aria-label="硅基受访人设名册">
              {siliconPersonas.map(({ persona, profile }) => (
                <button
                  key={persona.id}
                  type="button"
                  role="option"
                  aria-selected={activePersonaEntry?.persona.id === persona.id}
                  aria-pressed={activePersonaEntry?.persona.id === persona.id}
                  className={styles.personaCardBtn}
                  onClick={() => setSelectedPersonaId(persona.id)}
                >
                  <PersonaAvatar appearance={persona.appearance} size={36} />
                  <div className={styles.personaCardMeta}>
                    <strong>{profile.alias}</strong>
                    <small>{persona.code} · {profile.tags.slice(0, 2).join(' · ')}</small>
                  </div>
                </button>
              ))}
            </div>

            {activePersonaEntry && (
              <div className={styles.personaDossierCard} aria-label="选中硅基人设档案">
                <div className={styles.heroHead}>
                  <div className={styles.row}>
                    <PersonaAvatar appearance={activePersonaEntry.persona.appearance} size={40} />
                    <div>
                      <strong style={{ fontSize: 12.5 }}>{activePersonaEntry.profile.alias}</strong>
                      <div className={styles.muted}>{activePersonaEntry.profile.provenance}</div>
                    </div>
                  </div>
                  <span className={styles.monoTag}>{activePersonaEntry.persona.code}</span>
                </div>
                <div className={styles.row} style={{ gap: 4 }}>
                  {activePersonaEntry.profile.tags.map(t => (
                    <span key={t} className={styles.badge}>{t}</span>
                  ))}
                </div>
                <blockquote className={styles.personaQuoteBox}>
                  “{activePersonaEntry.profile.catchphrase}”
                </blockquote>
                <div style={{ whiteSpace: 'pre-wrap' }}>{activePersonaEntry.profile.monologue}</div>
                <div className={styles.muted}>语调风格：{activePersonaEntry.profile.toneRule}</div>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.heroHead}>
              <strong style={{ fontSize: 12 }}>🔥 焦点小组圆桌讨论（4 人互评）</strong>
              <span className={styles.monoTag}>{liveRoundtable ? '大模型实演' : '示例预演'}</span>
            </div>
            <input
              className={styles.input}
              value={roundtableTopic}
              onChange={e => setRoundtableTopic(e.target.value)}
              placeholder={`聚焦讨论：围绕《${title}》量表盲区与消费痛点`}
            />
            <div className={styles.row}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ flex: 1 }}
                disabled={roundtableBusy}
                onClick={() => void runLiveRoundtable()}
              >
                {roundtableBusy ? '⏳ 4 位人设正在互评讨论…' : '✦ 实调大模型召开实时圆桌'}
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  if (onOpenMainTheater) {
                    onOpenMainTheater({
                      design: design ?? quickDesign,
                      templateKey,
                      seed: personaSeed,
                      population,
                    });
                    setStatus('✓ 已同步人设与问卷到中央 Atypica 1:1 实时推演剧场。');
                  } else {
                    setLiveTheaterModalOpen(true);
                  }
                }}
              >
                ⚡ 1:1 实时全流程剧场
              </button>
              <a className={styles.btn} href="/workspace#silicon">
                3D 舞台 ↗
              </a>
            </div>

            <ul className={styles.list}>
              {roundtableTurns.map(turn => {
                const speaker = siliconPersonas.find(s => s.persona.code === turn.code)?.persona;
                return (
                  <li key={turn.code} className={styles.itemCard}>
                    <div className={styles.heroHead}>
                      <div className={styles.row}>
                        {speaker && <PersonaAvatar appearance={speaker.appearance} size={26} />}
                        <strong style={{ fontSize: 11.5 }}>{turn.alias}</strong>
                        <span className={styles.monoTag}>{turn.archetype}</span>
                      </div>
                      <span className={styles.badge}>AI味 {turn.aiFlavorScore}/100</span>
                    </div>
                    <p style={{ margin: '2px 0', fontSize: 12, lineHeight: 1.55 }}>{turn.reply}</p>
                    {turn.nextAlias && turn.cueReason && (
                      <details className={styles.turnCuePill}>
                        <summary>@ {turn.nextAlias} · 接麦原因 ▾</summary>
                        <p>{turn.cueReason}</p>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : subMode === 'survey' ? (
        <>
          <div className={styles.panel}>
            <label className={styles.field}>
              <span>📂 套用 17 类正大杯经典问卷模板</span>
              <select className={styles.select} value={selectedCatId} onChange={e => applyCategoryTemplate(e.target.value)}>
                <option value="">-- 选择场景一键填充（共 {SURVEY_17_CATEGORY_TEMPLATES.length} 类） --</option>
                {SURVEY_17_CATEGORY_TEMPLATES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.category}
                  </option>
                ))}
              </select>
            </label>
            {activeCategory && (
              <div className={styles.itemCard} style={{ fontSize: 11.5 }}>
                <div><b>参照范本：</b>{activeCategory.referenceSampleName}</div>
                <div><b>避坑提示：</b>{activeCategory.designPitfall}</div>
              </div>
            )}

            <label className={styles.field}>
              <span>1. 问卷标题与调查对象</span>
              <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} />
              <input className={styles.input} value={population} onChange={e => setPopulation(e.target.value)} placeholder="抽样总体描述" />
            </label>

            <label className={styles.field}>
              <span>2. 分组对照题（用于交叉表/异质性分析）</span>
              <input className={styles.input} value={groupQuestion} onChange={e => setGroupQuestion(e.target.value)} />
              <input className={styles.input} value={groupChoicesText} onChange={e => setGroupChoicesText(e.target.value)} placeholder="逗号分隔组别选项" />
            </label>

            <label className={styles.field}>
              <span>3. 核心 5 级李克特量表维度</span>
              <textarea className={styles.textarea} value={dimensionsText} onChange={e => setDimensionsText(e.target.value)} />
            </label>

            <label className={styles.row} style={{ cursor: 'pointer', fontSize: 11.5 }}>
              <input type="checkbox" checked={includeAttention} onChange={e => setIncludeAttention(e.target.checked)} />
              自动附加注意力甄别题（拦截机械作答废卷）
            </label>

            <div className={styles.row}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ flex: 1 }} onClick={() => void applyAndSyncSurvey()}>
                ✦ 一键生成问卷并同步至报告
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  if (onOpenMainTheater) {
                    onOpenMainTheater({
                      design: quickDesign,
                      templateKey,
                      seed: personaSeed,
                      population,
                    });
                    setStatus('✓ 已将当前问卷送入 Atypica × 硅基 1:1 实时预测试推演剧场。');
                  } else {
                    setLiveTheaterModalOpen(true);
                  }
                }}
              >
                ⚡ 硅基预测试推演
              </button>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.heroHead}>
              <strong style={{ fontSize: 12 }}>问卷星 / 平台导出</strong>
              <span className={styles.monoTag}>{exportReview.questions.length}/{quickDesign.questions.length} 题就绪</span>
            </div>
            <QuestionnairePlatformExport design={quickDesign} revision={revision} blocked={false} />
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>预览题纲明细（{quickDesign.questions.length} 题）</summary>
              <ul className={styles.list} style={{ marginTop: 8 }}>
                {quickDesign.questions.map(q => (
                  <li key={q.id} className={styles.itemCard}>
                    <div className={styles.heroHead}>
                      <strong style={{ fontSize: 11 }}>{q.variable} · {q.construct || q.type}</strong>
                      <span className={styles.badge}>{q.type === 'likert' ? '5级量表' : '单选'}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11.5 }}>{q.text}</p>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <details className={styles.panel}>
            <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
              📘 问卷与质控 4 条国奖红线
            </summary>
            <ul className={styles.list} style={{ marginTop: 8 }}>
              {SURVEY_DESIGN_BEST_PRACTICES.map(bp => (
                <li key={bp.title} className={styles.itemCard} style={{ fontSize: 11.5 }}>
                  <strong>{bp.title}</strong>
                  <p className={styles.muted}>{bp.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <>
          <div className={styles.panel}>
            <div className={styles.heroHead}>
              <strong style={{ fontSize: 12 }}>去 AI 味访谈语料库</strong>
              <span className={styles.badge}>nuwa-skill · shuorenhua</span>
            </div>
            <p className={styles.muted}>{interviewCorpus.disclaimer}</p>
            <div className={styles.row}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={injectInterviewAppendix}>
                ✦ 一键写入报告附录四
              </button>
              <button type="button" className={styles.btn} onClick={downloadInterviewMd}>
                ↓ 导出实录 .md
              </button>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.heroHead}>
              <strong style={{ fontSize: 12 }}>五阶段半结构化深访提纲</strong>
              <span className={styles.monoTag}>{interviewCorpus.guide.length} 问</span>
            </div>
            <ul className={styles.list}>
              {interviewCorpus.guide.map(g => (
                <li key={g.id} className={styles.itemCard}>
                  <div className={styles.heroHead}>
                    <strong style={{ fontSize: 11.5 }}>{g.id} · {g.stage}</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: 12 }}>{g.prompt}</p>
                  <p className={styles.muted}>{g.followUp}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.panel}>
            <div className={styles.heroHead}>
              <strong style={{ fontSize: 12 }}>受访者原声语料（低 AI 味自然口语）</strong>
              <span className={styles.monoTag}>4 人格对照</span>
            </div>
            <ul className={styles.list}>
              {interviewCorpus.transcripts.map(t => (
                <li key={t.id} className={styles.itemCard}>
                  <div className={styles.heroHead}>
                    <strong style={{ fontSize: 11.5 }}>{t.respondentCode}</strong>
                    <span className={styles.badge}>AI味 {t.aiFlavorScore}/100</span>
                  </div>
                  <p className={styles.muted}>{t.personaName} · {t.contextNote}</p>
                  <p style={{ margin: '2px 0', fontSize: 12, lineHeight: 1.55 }}>「{t.excerpt}」</p>
                </li>
              ))}
            </ul>
          </div>

          <details className={styles.panel} open>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              扎根理论三级编码与量表维度映射（{interviewCorpus.codingMatrix.length} 组）
            </summary>
            <ul className={styles.list} style={{ marginTop: 8 }}>
              {interviewCorpus.codingMatrix.map(row => (
                <li key={row.openCode} className={styles.itemCard} style={{ fontSize: 11.5 }}>
                  <strong>{row.openCode}</strong>
                  <div className={styles.muted}>原声锚点：{row.rawAnchor}</div>
                  <div>主轴：{row.axialCategory} → 选择：{row.selectiveTheme}</div>
                  <span className={styles.monoTag}>映射量表：{row.mappedDimension}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      <div className={styles.statusBar}>{status}</div>

      {liveTheaterModalOpen && (
        <QuickSurveyTheaterModal
          design={design ?? quickDesign}
          attributes={activeTemplate.attributes}
          seed={personaSeed}
          population={population}
          onClose={() => setLiveTheaterModalOpen(false)}
          onImportFindings={summaryLines => {
            const nextReport = content.report.map(sec =>
              sec.id === 'design.questionnaire'
                ? {
                    ...sec,
                    body: sec.body.trim()
                      ? `${sec.body.trim()}\n\n${summaryLines.join('\n')}`
                      : summaryLines.join('\n'),
                  }
                : sec,
            );
            onUpdateReport({ ...content, report: nextReport }, '已将 Atypica × 硅基实时推演预测试结论写入「问卷设计」章节。');
            setStatus('✓ 已将 1:1 实时推演预测试结论写入报告「问卷设计」节。');
            setLiveTheaterModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function QuickSurveyTheaterModal({
  design,
  attributes,
  seed,
  population,
  onClose,
  onImportFindings,
}: {
  design: Questionnaire;
  attributes: (typeof PANEL_TEMPLATES)['residents']['attributes'];
  seed: number;
  population: string;
  onClose: () => void;
  onImportFindings: (lines: string[]) => void;
}) {
  const payload = useMemo(() => {
    const cleanDesign = structuredClone(design);
    const panel = generatePanel({
      attributes,
      size: 24,
      allocation: 'quota',
      seed,
      background: population,
    });
    const settings = {
      engine: 'demo' as const,
      memory: 'carry' as const,
      shuffleOptions: false,
      scenarios: [NO_SCENARIO],
      models: [],
    };
    const run = demoRun(cleanDesign, attributes, panel, settings);
    return { design: cleanDesign, panel, settings, run };
  }, [design, attributes, seed, population]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 85,
        background: 'rgba(7, 17, 28, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 18,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ width: 'min(1320px, 100%)' }}>
        <AtypicaLiveTheater
          design={payload.design}
          attributes={attributes}
          personas={payload.panel}
          settings={payload.settings}
          run={payload.run}
          autoPlay
          modalMode
          onClose={onClose}
          onOpenReportAction={bp =>
            onImportFindings([
              `【硅基预测试推演结论（${bp.enrichedPersonas.length} 位分层画像 · 阻塞 ${bp.report.metrics.blockers} · 提示 ${bp.report.metrics.warnings}）】`,
              ...bp.report.actionChecklist,
            ])
          }
        />
      </div>
    </div>
  );
}
