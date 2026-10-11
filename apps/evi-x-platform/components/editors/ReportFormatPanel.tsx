'use client';

import { useId } from 'react';
import {
  evaluateReportFormat, REPORT_FORMAT_PROFILES, reportFormatNotices,
  type ReportFormatSettings,
} from '@/lib/report-format';
import styles from './ReportFormatPanel.module.css';

type Props = {
  value: ReportFormatSettings;
  onChange: (settings: ReportFormatSettings) => void;
  sections: readonly { title: string }[];
};

const GROUPS = ['本科组', '专科组', '研究生组', '在华留学生组'];
const TRACKS = ['自主选题', '企业命题'];
const STAGES = ['知识赛', '校赛', '企业命题赛', '省赛', '全国赛初赛', '全国赛决赛'];

/** A selected layout and an applicable competition rule have separate receipts. */
export default function ReportFormatPanel({ value, onChange, sections }: Props) {
  const id = useId();
  const evaluation = evaluateReportFormat(value);
  const notices = reportFormatNotices(sections);
  const update = (patch: Partial<ReportFormatSettings>) => onChange({ ...value, ...patch });
  const scopeSelect = (key: 'group' | 'track' | 'stage', title: string, choices: string[]) => (
    <label>{title}
      <select value={value[key]} onChange={event => update({ [key]: event.target.value })}>
        <option value="">请选择</option>
        {value[key] && !choices.includes(value[key]) && <option value={value[key]}>{value[key]}</option>}
        {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    </label>
  );

  return <details className={styles.panel}>
    <summary className={styles.summary}>
      <span>报告格式</span>
      <span className={styles.profileName}>{evaluation.profile.label}</span>
      <span className={styles.status} data-state={evaluation.status}>{evaluation.label}</span>
    </summary>
    <div className={styles.content}>
      <div className={styles.scope}>
        <label>届次<select value={value.edition} onChange={event => update({ edition: event.target.value })}>
          <option>第十七届</option><option>第十六届</option>
        </select></label>
        {scopeSelect('group', '组别', GROUPS)}
        <label>赛区<input value={value.region} maxLength={80} placeholder="如：湖北" onChange={event => update({ region: event.target.value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, '') })} /></label>
        {scopeSelect('track', '赛道', TRACKS)}
        {scopeSelect('stage', '阶段', STAGES)}
      </div>
      <div className={styles.profileRow}>
        <label>排版方案<select value={value.profileId} onChange={event => update({ profileId: event.target.value })}>
          {REPORT_FORMAT_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
        </select></label>
        <p className={styles.scopeStatus} role="status" data-state={evaluation.status}>{evaluation.detail}</p>
      </div>
      <dl className={styles.specs}>
        <div><dt>纸张与页边距</dt><dd>A4 · 上下 25.4 / 左右 31.8 mm</dd></div>
        <div><dt>正文</dt><dd>宋体 12 pt · 1.25 倍行距</dd></div>
        <div><dt>标题</dt><dd>一级黑体 15 pt · 二级黑体 14 pt</dd></div>
        <div><dt>图表题</dt><dd>宋体 12 pt · 图下表上 · 居中</dd></div>
      </dl>
      <div className={styles.options}>
        <label>导出部分<select value={value.options.part} onChange={event => {
          const part = event.target.value as 'main' | 'appendix';
          update({ options: { ...value.options, part, ...(part === 'main' ? { includeCover: true, includeToc: true } : {}) } });
        }}><option value="main">报告正文</option><option value="appendix">附录</option></select></label>
        <label>首行缩进<select value={value.options.firstLineChars} onChange={event => update({ options: { ...value.options, firstLineChars: Number(event.target.value) as 0 | 2 } })}>
          <option value={2}>2 字符</option><option value={0}>不缩进</option>
        </select></label>
        <div className={styles.checks}>
          <label className={styles.check}><input type="checkbox" checked={value.options.includeCover} disabled={value.options.part === 'main'} onChange={event => update({ options: { ...value.options, includeCover: event.target.checked } })} />标题页</label>
          <label className={styles.check}><input type="checkbox" checked={value.options.includeToc} disabled={value.options.part === 'main'} onChange={event => update({ options: { ...value.options, includeToc: event.target.checked } })} />目录</label>
          <label className={styles.check}><input type="checkbox" checked={value.options.numberPages} onChange={event => update({ options: { ...value.options, numberPages: event.target.checked } })} />页码</label>
        </div>
      </div>
      {notices.length > 0 && <ul className={styles.notices} aria-label="章节检查">{notices.map(notice => <li key={notice}>{notice}</li>)}</ul>}
      <details className={styles.source}>
        <summary>来源与适用范围</summary>
        <dl aria-labelledby={`${id}-source`}>
          <div><dt id={`${id}-source`}>当前方案</dt><dd>{evaluation.profile.scope}</dd></div>
          {evaluation.profile.sourceUrl && <div><dt>排版来源</dt><dd><a href={evaluation.profile.sourceUrl} target="_blank" rel="noreferrer">{evaluation.profile.sourceTitle} ↗</a> · 核验 {evaluation.profile.verifiedAt}</dd></div>}
          <div><dt>第十七届通知</dt><dd><a href="https://stxy.btbu.edu.cn/docs/2026-10/1fcc2b9eccae40efad4f6e4903db2e3e.pdf" target="_blank" rel="noreferrer">组委会总通知 ↗</a> · 实践赛文件安排于 2026 年 11 月 17 日发布</dd></div>
          <div><dt>页数与 PPT</dt><dd>按所选组别、赛区和阶段绑定正式要求。</dd></div>
        </dl>
      </details>
    </div>
  </details>;
}
