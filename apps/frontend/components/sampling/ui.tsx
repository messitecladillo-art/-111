'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Formula, Tex } from '../math/Tex';
import type { Step } from '@/lib/sampling-estimators';
import type { Interval } from '@/lib/sampling-core';
import styles from './Sampling.module.css';

/** Inputs survive reloads in this browser only; storage failures are ignored. */
export function usePersistent<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const raw = window.localStorage.getItem(`evix.sampling.${key}`); return raw ? { ...initial, ...JSON.parse(raw) } as T : initial; } catch { return initial; }
  });
  useEffect(() => { try { window.localStorage.setItem(`evix.sampling.${key}`, JSON.stringify(value)); } catch { /* convenience only */ } }, [key, value]);
  return [value, setValue];
}

/** Text with inline math written between dollar signs, e.g. “其中 $N_h$ 为层规模”. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('$');
  return <>{parts.map((part, i) => i % 2 ? <Tex key={i} tex={part} /> : <span key={i}>{part}</span>)}</>;
}

export const parseNumber = (text: string) => { const t = text.trim().replace(/[，,]/g, ''); if (t === '') return NaN; const v = Number(t.replace(/%$/, '')); return Number.isFinite(v) ? (t.endsWith('%') ? v / 100 : v) : NaN; };
/** Numbers for display: precision adapts to magnitude unless `digits` is given. */
export const fmt = (v: number, digits?: number) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v), d = digits ?? (a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : 4);
  return v.toLocaleString('zh-CN', { maximumFractionDigits: d });
};
export const pct = (v: number, digits = 1) => Number.isFinite(v) ? `${(v * 100).toLocaleString('zh-CN', { maximumFractionDigits: digits })}%` : '—';

export function Field({ label, tex, value, onChange, hint, suffix, placeholder, wide, inputMode = 'decimal' }: { label: string; tex?: string; value: string; onChange: (value: string) => void; hint?: ReactNode; suffix?: string; placeholder?: string; wide?: boolean; inputMode?: 'decimal' | 'numeric' | 'text' }) {
  const id = useId();
  return <div className={styles.field} data-wide={wide || undefined}>
    <label htmlFor={id}>{label}{tex && <> <Tex tex={tex} /></>}</label>
    <div className={styles.inputWrap}><input id={id} inputMode={inputMode} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />{suffix && <span>{suffix}</span>}</div>
    {hint && <small>{hint}</small>}
  </div>;
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <fieldset className={styles.choice}><legend>{label}</legend>
    <div role="radiogroup" aria-label={label}>{options.map(([id, text]) => <button type="button" role="radio" aria-checked={value === id} key={id} onClick={() => onChange(id)}>{text}</button>)}</div>
  </fieldset>;
}

export function Confidence({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Choice label="置信水平" value={value} options={[['0.9', '90%'], ['0.95', '95%'], ['0.99', '99%']] as const} onChange={onChange} />;
}

export function Paste({ label, value, onChange, rows = 6, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; hint?: ReactNode }) {
  const id = useId();
  return <div className={styles.field} data-wide>
    <label htmlFor={id}>{label}</label>
    <textarea id={id} rows={rows} value={value} placeholder={placeholder} spellCheck={false} onChange={e => onChange(e.target.value)} />
    {hint && <small>{hint}</small>}
  </div>;
}

export type Column<R> = { key: keyof R & string; label: ReactNode; width?: string; numeric?: boolean; placeholder?: string };
/** A compact editable table whose cells are kept as text and parsed by the caller. */
export function EditTable<R extends Record<string, string>>({ columns, rows, onChange, make, min = 1, max = 30, addLabel = '＋ 添加一行', caption }: { columns: Column<R>[]; rows: R[]; onChange: (rows: R[]) => void; make: (index: number) => R; min?: number; max?: number; addLabel?: string; caption: string }) {
  return <div className={styles.editTable}>
    <div className={styles.tableScroll} tabIndex={0} aria-label={caption}><table>
      <caption className={styles.srOnly}>{caption}</caption>
      <thead><tr>{columns.map(c => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}<th aria-label="操作" /></tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>
        {columns.map(c => <td key={c.key}><input aria-label={`第 ${i + 1} 行 ${typeof c.label === 'string' ? c.label : c.key}`} inputMode={c.numeric ? 'decimal' : 'text'} value={row[c.key]} placeholder={c.placeholder} onChange={e => onChange(rows.map((r, j) => j === i ? { ...r, [c.key]: e.target.value } : r))} /></td>)}
        <td><button type="button" className={styles.ghost} disabled={rows.length <= min} aria-label={`删除第 ${i + 1} 行`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>删除</button></td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" className={styles.ghost} disabled={rows.length >= max} onClick={() => onChange([...rows, make(rows.length)])}>{addLabel}</button>
  </div>;
}

export function Steps({ steps, start = 1 }: { steps: Step[]; start?: number }) {
  return <ol className={styles.steps} start={start}>{steps.map((s, i) => <li key={`${s.label}-${i}`}><span>{s.label}</span><Formula tex={s.tex} compact /></li>)}</ol>;
}

export function Metric({ label, value, unit, note, accent }: { label: string; value: string; unit?: string; note?: ReactNode; accent?: boolean }) {
  return <div className={styles.metric} data-accent={accent || undefined}><span>{label}</span><strong>{value}{unit && <small> {unit}</small>}</strong>{note && <em>{note}</em>}</div>;
}
export const ciText = (ci: Interval, digits?: number) => `[${fmt(ci.lower, digits)}, ${fmt(ci.upper, digits)}]`;

export function Notes({ items, tone = 'muted' }: { items: string[]; tone?: 'muted' | 'risk' }) {
  if (!items.length) return null;
  return <ul className={styles.notes} data-tone={tone}>{items.map(w => <li key={w}><Rich text={w} /></li>)}</ul>;
}

export function Statement({ title = '方法部分草稿', text, footnote }: { title?: string; text: string; footnote?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }
  return <div className={styles.statement}>
    <div><span>{title}</span><button type="button" onClick={() => void copy()}>{copied ? '已复制' : '复制'}</button></div>
    <p>{text}</p>
    {footnote && <small>{footnote}</small>}
  </div>;
}

/** Calculator frame: inputs on the left, results on the right; errors replace the results. */
export function Calc({ title, intro, inputs, children, error }: { title?: string; intro?: ReactNode; inputs: ReactNode; children?: ReactNode; error?: string | null }) {
  return <div className={styles.calc}>
    {(title || intro) && <header>{title && <h4>{title}</h4>}{intro && <p>{intro}</p>}</header>}
    <div className={styles.calcGrid}>
      <form className={styles.inputs} onSubmit={e => e.preventDefault()}>{inputs}</form>
      <div className={styles.output} aria-live="polite">{error ? <p className={styles.error} role="alert">{error}</p> : children}</div>
    </div>
  </div>;
}

/** Run a calculation and turn thrown validation messages into an error string. */
export function attempt<T>(run: () => T): { value: T | null; error: string | null } {
  try { return { value: run(), error: null }; } catch (e) { return { value: null, error: (e as Error).message }; }
}
export function Download({ label, filename, content, mime = 'text/csv;charset=utf-8' }: { label: string; filename: string; content: () => string; mime?: string }) {
  return <button type="button" className={styles.ghost} onClick={() => {
    const blob = new Blob(['﻿' + content()], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>{label}</button>;
}
