'use client';

import { useState } from 'react';
import { emptyReference, formatReference, importReferenceLines, REFERENCE_LIMIT, REFERENCE_TYPES, referenceProblems, unfinishedReference, type ReferenceEntry, type ReferenceType } from '@/lib/references';
import styles from './ReferencesPanel.module.css';

type Field = { key: keyof ReferenceEntry; label: string; placeholder?: string; wide?: boolean };
/** The items GB/T 7714—2015 records for each type, in the order the entry prints them. */
const FIELDS: Record<ReferenceType, Field[]> = {
  J: [{ key: 'title', label: '题名', wide: true }, { key: 'source', label: '刊名' }, { key: 'year', label: '年', placeholder: '2024' }, { key: 'volume', label: '卷' }, { key: 'issue', label: '期' }, { key: 'pages', label: '页码', placeholder: '15-22' }, { key: 'doi', label: 'DOI' }],
  M: [{ key: 'title', label: '书名', wide: true }, { key: 'edition', label: '版本', placeholder: '第 1 版不填，如 4版' }, { key: 'place', label: '出版地' }, { key: 'publisher', label: '出版者' }, { key: 'year', label: '年' }, { key: 'pages', label: '引文页码' }],
  D: [{ key: 'title', label: '题名', wide: true }, { key: 'place', label: '授予单位所在地' }, { key: 'publisher', label: '学位授予单位' }, { key: 'year', label: '年' }],
  C: [{ key: 'title', label: '题名', wide: true }, { key: 'source', label: '文集名', wide: true }, { key: 'place', label: '出版地' }, { key: 'publisher', label: '出版者' }, { key: 'year', label: '年' }, { key: 'pages', label: '页码' }],
  R: [{ key: 'title', label: '题名', wide: true }, { key: 'number', label: '报告编号' }, { key: 'place', label: '出版地' }, { key: 'publisher', label: '发布机构' }, { key: 'year', label: '年' }],
  N: [{ key: 'title', label: '题名', wide: true }, { key: 'source', label: '报纸名' }, { key: 'date', label: '出版日期', placeholder: '2024-03-01' }, { key: 'pages', label: '版次', placeholder: '05' }],
  S: [{ key: 'title', label: '标准名称', wide: true }, { key: 'number', label: '标准号', placeholder: 'GB/T 7714—2015' }, { key: 'place', label: '出版地' }, { key: 'publisher', label: '出版者' }, { key: 'year', label: '年' }],
  'EB/OL': [{ key: 'title', label: '题名', wide: true }, { key: 'date', label: '发布或更新日期', placeholder: '2024-02-29' }, { key: 'accessed', label: '引用日期', placeholder: '2024-10-01' }, { key: 'url', label: '链接', wide: true, placeholder: 'https://' }],
  other: [{ key: 'text', label: '整条著录（已按 GB/T 7714 写好）', wide: true }],
};
const AUTHORS: Partial<Record<ReferenceType, string>> = { R: '主要责任者', S: '主要责任者', 'EB/OL': '主要责任者' };
const splitAuthors = (text: string) => text.split(/[,，、;；]/u).map(a => a.trim()).filter(Boolean);

type Props = {
  references: ReferenceEntry[];
  /** Number of every entry: cited ones by first citation, then the rest. */
  numbers: ReadonlyMap<string, number>;
  uncited: ReadonlySet<string>;
  /** Text still typed in the references section, which can be turned into entries. */
  legacy: string;
  disabled?: boolean;
  onChange: (next: ReferenceEntry[]) => void;
  onImport: (entries: ReferenceEntry[]) => void;
};

/** The reference list as records: each entry prints in GB/T 7714 form and is numbered by where the text first cites it. */
export default function ReferencesPanel({ references, numbers, uncited, legacy, disabled = false, onChange, onImport }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  // Author lists are typed as text; keep the draft so a trailing comma survives until the next name is typed.
  const [authorDraft, setAuthorDraft] = useState<{ id: string; text: string } | null>(null);
  const ordered = [...references].sort((a, b) => (numbers.get(a.id) ?? 1e9) - (numbers.get(b.id) ?? 1e9));
  // The typed list converts as a whole or not at all; a reason is shown instead of dropping lines.
  let imports: ReferenceEntry[] = [], importProblem = '';
  if (legacy.trim()) try { imports = importReferenceLines(legacy, references.length); } catch (e) { importProblem = (e as Error).message; }
  const update = (id: string, patch: Partial<ReferenceEntry>) => onChange(references.map(e => e.id === id ? { ...e, ...patch } : e));
  function add() { const entry = emptyReference('J'); onChange([...references, entry]); setOpen(entry.id); }
  function remove(entry: ReferenceEntry) {
    if (!uncited.has(entry.id) && !window.confirm('这条文献已在正文中被引用。删除后这些引用会标红，并在导出前要求重新引用。确定删除？')) return;
    onChange(references.filter(e => e.id !== entry.id));
  }
  return <section className={styles.panel} aria-label="参考文献">
    <header className={styles.head}>
      <div className={styles.title}><strong>参考文献</strong><span>GB/T 7714—2015 · 顺序编码制</span></div>
      <p className={styles.summary}>{references.length ? `共 ${references.length} 条，正文已引用 ${references.length - uncited.size} 条。` : '还没有文献条目。'}在其他章节正文中用「插入引用」标注，序号按首次引用的先后自动编排，导出时生成本节列表。</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={disabled || references.length >= REFERENCE_LIMIT} onClick={add}>＋ 添加文献</button>
        {imports.length > 0 && <button type="button" disabled={disabled} onClick={() => onImport(imports)}>把本节正文的 {imports.length} 条转为文献条目</button>}
      </div>
      {importProblem && <p className={styles.problem} role="status">本节正文暂不能转换：{importProblem}</p>}
    </header>
    {ordered.length > 0 && <ol className={styles.list}>
      {ordered.map(entry => {
        const editing = open === entry.id, problems = referenceProblems(entry), text = unfinishedReference(entry) ? '' : formatReference(entry);
        return <li key={entry.id} className={styles.entry} data-editing={editing}>
          <div className={styles.row}>
            <span className={styles.number}>[{numbers.get(entry.id)}]</span>
            <span className={styles.text}>{text || <em>尚未填写题名，点「编辑」完成著录</em>}</span>
            <span className={styles.rowActions}>
              <button type="button" aria-expanded={editing} onClick={() => setOpen(editing ? null : entry.id)}>{editing ? '完成' : '编辑'}</button>
              <button type="button" disabled={disabled} onClick={() => remove(entry)}>删除</button>
            </span>
          </div>
          {(uncited.has(entry.id) || problems.length > 0) && <div className={styles.flags}>
            {uncited.has(entry.id) && <span className={styles.flag}>正文尚未引用</span>}
            {problems.map(problem => <span key={problem} className={styles.flag} data-tone="warn">{problem}</span>)}
          </div>}
          {editing && <div className={styles.form}>
            <label>文献类型<select value={entry.type} disabled={disabled} onChange={e => update(entry.id, { type: e.target.value as ReferenceType })}>
              {(Object.keys(REFERENCE_TYPES) as ReferenceType[]).map(type => <option key={type} value={type}>{type === 'other' ? '' : `[${type}] `}{REFERENCE_TYPES[type]}</option>)}
            </select></label>
            {entry.type !== 'other' && <label className={styles.wide}>{AUTHORS[entry.type] ?? '作者'}<input disabled={disabled} placeholder="多位作者用逗号分隔，超过三位时自动写作“等”；英文作者如 SMITH J"
              value={authorDraft?.id === entry.id ? authorDraft.text : entry.authors.join('，')}
              onChange={e => { setAuthorDraft({ id: entry.id, text: e.target.value }); update(entry.id, { authors: splitAuthors(e.target.value) }); }}
              onBlur={() => setAuthorDraft(null)}/></label>}
            {FIELDS[entry.type].map(field => <label key={field.key} className={field.wide ? styles.wide : undefined}>{field.label}
              <input disabled={disabled} placeholder={field.placeholder} value={entry[field.key] as string} onChange={e => update(entry.id, { [field.key]: e.target.value })}/></label>)}
          </div>}
        </li>;
      })}
    </ol>}
  </section>;
}
