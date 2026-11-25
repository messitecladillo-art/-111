'use client';

import { ADVISORS, ADVISOR_TONES, advisorReading, type Advisor } from '@/lib/agent/advisors';
import type { BenchmarkResult } from '@/lib/report-benchmark';
import styles from './Advisors.module.css';

const ADVISOR_DOMAIN_LABEL: Record<string, string> = {
  design: '调查设计',
  evidence: '证据核验',
  modeling: '统计建模',
  figures: '图表呈现',
  writing: '报告撰写',
  delivery: '合规交付',
};

function advisorDomainLabel(advisor: Advisor): string {
  return ADVISOR_DOMAIN_LABEL[advisor.id] ?? advisor.name;
}

function cleanAdvisorText(raw: string): string {
  return raw
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）')
    .replace(/生图模型/gu, '智能配图服务')
    .replace(/树模型/gu, '树方法')
    .replace(/网络舆情\/NLP\s*/gu, '公开文本语义分析')
    .replace(/<=65页/gu, '不超过 65 页')
    .replace(/1\+1克制配色/gu, '主次双色克制配色');
}

/**
 * The advisors a team can bring into the EVI-X Agent bench: balanced optical plates showing each specialist's checks,
 * live open issues, rules, toggle to attach to the report inspector, and one-click consultation with the Agent Brain.
 */
export default function Advisors({
  benchmark,
  hired,
  onHire,
  onConsult,
}: {
  benchmark: BenchmarkResult | null;
  hired: string[];
  onHire: (ids: string[]) => void;
  onConsult?: (advisor: Advisor, prompt: string) => void;
}) {
  const toggle = (advisor: Advisor) => onHire(hired.includes(advisor.id) ? hired.filter(id => id !== advisor.id) : [...hired, advisor.id]);
  const consult = (advisor: Advisor) => {
    const reading = advisorReading(advisor, benchmark);
    const domain = advisorDomainLabel(advisor);
    const issueSummary = reading.issues.slice(0, 4).map(issue => `“${cleanAdvisorText(issue.label)}”`).join('、');
    const rulesSummary = advisor.rules.map(cleanAdvisorText).join('；');
    const prompt = reading.issues.length
      ? `请以“${advisor.name}”视角，结合当前项目已核查结果逐项诊断${issueSummary}等 ${reading.issues.length} 项待改进问题，并结合“${domain}”评审要点给出可执行修改建议。`
      : `请以“${advisor.name}”视角，结合“${domain}”评审规范（${rulesSummary}）核查当前项目是否达标。`;
    if (!hired.includes(advisor.id)) onHire([...hired, advisor.id]);
    onConsult?.(advisor, prompt);
  };

  const card = (advisor: Advisor, index: number) => {
    const reading = advisorReading(advisor, benchmark);
    const on = hired.includes(advisor.id);
    const tone = ADVISOR_TONES[advisor.id] ?? '#0f766e';
    const hasIssues = reading.issues.length > 0;
    return (
      <article key={advisor.id} className={styles.card} data-hired={on} style={{ ['--i' as string]: index, ['--tone' as string]: tone }}>
        <span className={styles.watermarkGlyph} aria-hidden="true">{advisor.glyph}</span>
        <div className={styles.cardTop}>
          <div className={styles.cardTitleGroup}>
            <span className={styles.skillTag}>{advisorDomainLabel(advisor)}</span>
            <div className={styles.statusRibbon}>
              <span className={styles.ribbonStat}>负责 {advisor.checks.length} 项</span>
              <span className={styles.ribbonDot} aria-hidden="true">·</span>
              <span className={styles.ribbonStat} data-pass="true">通过 {reading.passed}</span>
              <span className={styles.ribbonDot} aria-hidden="true">·</span>
              <span className={styles.ribbonStat} data-alert={hasIssues}>
                {hasIssues ? `${reading.issues.length} 待处理` : '全部通过'}
              </span>
            </div>
            <h3>{advisor.name}</h3>
          </div>
          <span className={styles.statePill} data-active={on}>{on ? '已就位' : '待命'}</span>
        </div>

        <p className={styles.line}>{cleanAdvisorText(advisor.line)}</p>

        <ul className={styles.rules}>
          {advisor.rules.map(rule => (
            <li key={rule}>{cleanAdvisorText(rule)}</li>
          ))}
        </ul>

        <div className={styles.cardActions}>
          <button type="button" className={styles.hireBtn} data-active={on} onClick={() => toggle(advisor)} aria-pressed={on}>
            {on ? '移出顾问席' : '请入顾问席'}
          </button>
          {onConsult && (
            <button type="button" className={styles.consultBtn} onClick={() => consult(advisor)}>
              对话会诊 →
            </button>
          )}
        </div>
      </article>
    );
  };

  const mine = ADVISORS.filter(a => hired.includes(a.id));
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>专家审阅与质量核查席</div>
        <div className={styles.headRow}>
          <h2>
            研究审阅专家顾问 <small>{ADVISORS.length}</small>
          </h2>
          {mine.length > 0 && (
            <div className={styles.hiredInline}>
              {mine.map(a => (
                <span key={a.id} className={styles.hiredChip} style={{ ['--tone' as string]: ADVISOR_TONES[a.id] ?? '#0f766e' }}>
                  <b aria-hidden="true">{a.glyph}</b>
                  {a.name}
                  <small>{advisorReading(a, benchmark).issues.length} 条待议</small>
                </span>
              ))}
            </div>
          )}
        </div>
        <p>覆盖调研全流程六大评审维度。每位专家直接读取当前项目实测体检与待改进项，可请入右侧成文检查席，或点击“对话会诊”展开深度核查。</p>
      </header>

      <div className={styles.grid}>{ADVISORS.map(card)}</div>
    </div>
  );
}
