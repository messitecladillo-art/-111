'use client';

import { useState } from 'react';
import type { EditorContent } from '@/lib/editor-model';
import type { Questionnaire } from '@/lib/questionnaire';
import { AI_USES, aiAppendix, dataAppendix, DEFAULT_AI_CHECKING, questionnaireAppendix, type AiUse } from '@/lib/report-appendices';
import styles from './AppendixHelper.module.css';

type Props = {
  /** Blueprint node of the selected appendix. */
  node: string;
  content: EditorContent;
  questionnaire: Questionnaire | null;
  disabled?: boolean;
  /** Appends the generated lines to the selected appendix; returns an error message or ''. */
  onWrite: (lines: string[], what: string) => string;
};

/** Drafts an appendix from what the platform holds: the questionnaire, the registered results, the author's AI-use answers. */
export default function AppendixHelper({ node, content, questionnaire, disabled = false, onWrite }: Props) {
  const [answer, setAnswer] = useState<AiUse>({ used: false, tools: '', uses: [], sections: '', checking: DEFAULT_AI_CHECKING });
  const [problem, setProblem] = useState('');
  const write = (make: () => string[], what: string) => { try { setProblem(onWrite(make(), what)); } catch (e) { setProblem((e as Error).message); } };
  const results = content.quality?.results.length ?? 0;
  let body: React.ReactNode;
  if (node === 'appendix.questionnaire') body = <>
    <p>{questionnaire ? `「${questionnaire.title || '未命名问卷'}」共 ${questionnaire.questions.length} 题。写入卷首语与全部题目、选项和跳答说明。` : '在「问卷设计」中完成问卷后，可在这里一键写入问卷全文。'}</p>
    <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || !questionnaire?.questions.length} onClick={() => write(() => questionnaireAppendix(questionnaire!), '问卷全文')}>写入问卷全文</button></div>
  </>;
  else if (node === 'appendix.data') body = <>
    <p>{results ? `根据已登记的 ${results} 项分析结果，写入每项的数据来源、方法、有效样本、筛选范围、缺失编码与质控记录。` : '在数据分析中登记结果后，可在这里生成数据与处理说明。'}</p>
    <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || !results} onClick={() => write(() => dataAppendix(content), '数据处理说明')}>生成数据处理说明</button></div>
  </>;
  else if (node === 'appendix.ai') body = <>
    <p>如实说明是否使用、在哪些环节使用了生成式人工智能工具；平台按规则生成的图表与公式会单独注明。</p>
    <fieldset className={styles.choice} disabled={disabled}>
      <label><input type="radio" checked={!answer.used} onChange={() => setAnswer({ ...answer, used: false })}/>未使用生成式人工智能工具</label>
      <label><input type="radio" checked={answer.used} onChange={() => setAnswer({ ...answer, used: true })}/>使用了</label>
    </fieldset>
    {answer.used && <div className={styles.form}>
      <label className={styles.wide}>工具与版本<input disabled={disabled} value={answer.tools} placeholder="如：某大模型 4.0（网页版）" onChange={e => setAnswer({ ...answer, tools: e.target.value })}/></label>
      <fieldset className={styles.uses} disabled={disabled}><legend>用途</legend>{AI_USES.map(use => <label key={use}><input type="checkbox" checked={answer.uses.includes(use)} onChange={e => setAnswer({ ...answer, uses: e.target.checked ? [...answer.uses, use] : answer.uses.filter(u => u !== use) })}/>{use}</label>)}</fieldset>
      <label className={styles.wide}>涉及的章节<input disabled={disabled} value={answer.sections} placeholder="如：第一章文献综述、第四章文字润色" onChange={e => setAnswer({ ...answer, sections: e.target.value })}/></label>
      <label className={styles.wide}>人工核验方式<textarea disabled={disabled} rows={3} value={answer.checking} onChange={e => setAnswer({ ...answer, checking: e.target.value })}/></label>
    </div>}
    <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled} onClick={() => write(() => aiAppendix(answer, content), 'AI 使用说明')}>写入使用说明</button></div>
  </>;
  else return null;
  return <section className={styles.helper} aria-label="附录生成">
    <strong>从已有材料生成</strong>
    {body}
    {problem && <p className={styles.problem} role="status">{problem}</p>}
  </section>;
}
