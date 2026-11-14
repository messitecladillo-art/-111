'use client';

import { useMemo, useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import { parseEditorContent } from '@/lib/editor-model';
import type { Questionnaire } from '@/lib/questionnaire';
import { buildQuickQuestionnaire } from '@/lib/agent/studio-tools';
import { reviewWjxExport } from '@/lib/questionnaire-platform-export';
import QuestionnairePlatformExport from '@/components/design/QuestionnairePlatformExport';
import {
  SURVEY_17_CATEGORY_TEMPLATES,
  SURVEY_DESIGN_BEST_PRACTICES,
} from '@/data/zhengda-corpus-2015-2027';
import { generateInterviewCorpus } from '@/lib/agent/interview-corpus-deai';
import styles from './Studio.module.css';

export default function QuickSurveyStudio({
  content,
  design,
  onUpdateReport,
}: {
  content: EditorContent;
  design: Questionnaire | null;
  onSaveDesign?: (next: Questionnaire) => Promise<void> | void;
  onUpdateReport: (next: EditorContent, message: string, nextDesign?: Questionnaire | null) => void;
}) {
  const [subMode, setSubMode] = useState<'survey' | 'interview'>('survey');
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
        <h4>{subMode === 'survey' ? '极简问卷快搭' : '定性深访语料 (去AI味)'}</h4>
        <span className={styles.monoTag}>
          {subMode === 'survey' ? `${quickDesign.questions.length} 题量表` : `${interviewCorpus.transcripts.length} 位受访者`}
        </span>
      </div>

      <div className={styles.segBar} role="tablist" aria-label="问卷与深访语料模式切换">
        <button
          type="button"
          className={`${styles.segBtn} ${subMode === 'survey' ? styles.segBtnActive : ''}`}
          aria-pressed={subMode === 'survey'}
          onClick={() => setSubMode('survey')}
        >
          📝 定量问卷快搭
        </button>
        <button
          type="button"
          className={`${styles.segBtn} ${subMode === 'interview' ? styles.segBtnActive : ''}`}
          aria-pressed={subMode === 'interview'}
          onClick={() => setSubMode('interview')}
        >
          🎙️ 深访语料与三级编码
        </button>
      </div>

      {subMode === 'survey' ? (
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

            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void applyAndSyncSurvey()}>
              ✦ 一键生成问卷并同步至报告
            </button>
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
    </div>
  );
}
