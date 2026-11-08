'use client';

import { useId, useState } from 'react';
import { pageArtDataUrl, coverImageFromFile, frameImageFromFile, type CoverImage, type FrameImage } from '@/lib/page-art';
import {
  evaluateReportFormat, REPORT_FORMAT_PROFILES, reportFormatNotices,
  type ReportFormatSettings,
} from '@/lib/report-format';
import styles from './ReportFormatPanel.module.css';

type Props = {
  value: ReportFormatSettings;
  onChange: (settings: ReportFormatSettings) => void;
  sections: readonly { title: string }[];
  /** The whole-page cover made with the report-cover skill; it replaces the system-set title page. */
  coverImage?: CoverImage;
  onCoverImage?: (cover: CoverImage | undefined) => void;
  /** The transparent page frame made with the report-frame skill; it lies behind every page after the cover. */
  frameImage?: FrameImage;
  onFrameImage?: (frame: FrameImage | undefined) => void;
};

const GROUPS = ['本科组', '专科组', '研究生组', '在华留学生组'];
const TRACKS = ['自主选题', '企业命题'];
const STAGES = ['知识赛', '校赛', '企业命题赛', '省赛', '全国赛初赛', '全国赛决赛'];

/** One piece of skill-made page art: a thumbnail, what it does, and upload / replace / remove. */
function ArtRow<T extends CoverImage | FrameImage>({ id, label, art, accept, hint, detail, warning, onFile, onRemove }: { id: string; label: string; art?: T; accept: string; hint: string; detail: (art: T) => string; warning?: string; onFile: (file: File) => Promise<void>; onRemove: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError('');
    try { await onFile(file); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label}无法读取。`); }
    finally { setBusy(false); }
  };
  return <div className={styles.coverRow}>
    {/* eslint-disable-next-line @next/next/no-img-element -- the draft's own data URL; an image optimizer cannot serve it. */}
    {art ? <img className={styles.coverThumb} src={pageArtDataUrl(art)} alt={`当前${label}`} /> : <span className={styles.coverThumb} aria-hidden="true" />}
    <div className={styles.coverText}>
      <strong>{label}</strong>
      <p>{art ? detail(art) : hint}</p>
      {warning && <p className={styles.coverWarn}>{warning}</p>}
      {error && <p className={styles.coverWarn} role="alert">{error}</p>}
    </div>
    <div className={styles.coverActions}>
      <label className={styles.coverButton} htmlFor={id}>{busy ? '处理中…' : art ? '更换' : `上传${label}`}<input id={id} type="file" accept={accept} disabled={busy} onChange={event => { void pick(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {art && <button type="button" className={styles.coverRemove} onClick={() => { setError(''); onRemove(); }}>移除</button>}
    </div>
  </div>;
}

/** A selected layout and an applicable competition rule have separate receipts. */
export default function ReportFormatPanel({ value, onChange, sections, coverImage, onCoverImage, frameImage, onFrameImage }: Props) {
  const id = useId();
  const evaluation = evaluateReportFormat(value);
  const notices = reportFormatNotices(sections);
  const update = (patch: Partial<ReportFormatSettings>) => onChange({ ...value, ...patch });
  const scopeSelect = (key: 'group' | 'track' | 'stage', title: string, choices: string[]) => (
    <label htmlFor={id + '-' + key}>{title}
      <select id={id + '-' + key} value={value[key]} onChange={event => update({ [key]: event.target.value })}>
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
        <label htmlFor={id + '-edition'}>届次<select id={id + '-edition'} value={value.edition} onChange={event => update({ edition: event.target.value })}>
          <option>第十七届</option><option>第十六届</option>
        </select></label>
        {scopeSelect('group', '组别', GROUPS)}
        <label htmlFor={id + '-region'}>赛区<input id={id + '-region'} value={value.region} maxLength={80} placeholder="如：湖北" onChange={event => update({ region: event.target.value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, '') })} /></label>
        {scopeSelect('track', '赛道', TRACKS)}
        {scopeSelect('stage', '阶段', STAGES)}
      </div>
      <div className={styles.profileRow}>
        <label htmlFor={id + '-profile'}>排版方案<select id={id + '-profile'} value={value.profileId} onChange={event => update({ profileId: event.target.value })}>
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
        <label htmlFor={id + '-part'}>导出部分<select id={id + '-part'} value={value.options.part} onChange={event => {
          const part = event.target.value as 'main' | 'appendix';
          update({ options: { ...value.options, part } });
        }}><option value="main">报告正文</option><option value="appendix">附录</option></select></label>
        <label htmlFor={id + '-indent'}>首行缩进<select id={id + '-indent'} value={value.options.firstLineChars} onChange={event => update({ options: { ...value.options, firstLineChars: Number(event.target.value) as 0 | 2 } })}>
          <option value={2}>2 字符</option><option value={0}>不缩进</option>
        </select></label>
        <div className={styles.checks}>
          <label className={styles.check} htmlFor={id + '-cover'}><input id={id + '-cover'} type="checkbox" checked={value.options.includeCover} onChange={event => update({ options: { ...value.options, includeCover: event.target.checked } })} />标题页</label>
          <label className={styles.check} htmlFor={id + '-toc'}><input id={id + '-toc'} type="checkbox" checked={value.options.includeToc} onChange={event => update({ options: { ...value.options, includeToc: event.target.checked } })} />目录</label>
          <label className={styles.check} htmlFor={id + '-pages'}><input id={id + '-pages'} type="checkbox" checked={value.options.numberPages} onChange={event => update({ options: { ...value.options, numberPages: event.target.checked } })} />页码</label>
        </div>
      </div>
      {onCoverImage && <ArtRow id={id + '-cover-image'} label="封面图" art={coverImage} accept="image/png,image/jpeg" onRemove={() => onCoverImage(undefined)}
        hint="上传用报告封面技能生成的整页封面（A4 竖版 JPEG / PNG，题名画在图中）。未上传时使用标题页。"
        detail={art => `整页铺满 A4 封面，画布、Word 与 LaTeX 一致；系统不再另排标题。${art.widthPx}×${art.heightPx} 像素。`}
        warning={!value.options.includeCover && coverImage ? '「标题页」未勾选，导出时不含封面。' : ''}
        onFile={file => coverImageFromFile(file, `封面图「${file.name.slice(0, 120)}」由报告封面技能整页生成，题名字形在图中；作者已逐字核对。`).then(onCoverImage)} />}
      {onFrameImage && <ArtRow id={id + '-frame-image'} label="页框图" art={frameImage} accept="image/png" onRemove={() => onFrameImage(undefined)}
        hint="上传用报告页框技能生成的透明 A4 PNG；装饰只在页边，正文区与页码区必须完全透明。"
        detail={art => `铺在封面之后的每一页，正文版心不变；画布、Word 与 LaTeX 一致。${art.widthPx}×${art.heightPx} 像素。`}
        onFile={file => frameImageFromFile(file, `页框图「${file.name.slice(0, 120)}」由报告页框技能生成，只在页边装饰。`).then(onFrameImage)} />}
      {notices.length > 0 && <ul className={styles.notices} aria-label="章节建议">{notices.map(notice => <li key={notice}>{notice}</li>)}</ul>}
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
