'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  TOPIC_REGION_CATALOG, regionPath, resolveLegacyRegion, searchRegions,
  type RegionRecord, type RegionRef, type RegionSearchResult,
} from '@/lib/topic-advisor/regions';
import styles from './RegionPicker.module.css';

export type RegionPickerProps = {
  regionRef: RegionRef | null;
  /** Original free text is kept until the owner explicitly accepts a selection. */
  region?: string;
  city?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Account/project identity; changing scope discards unconfirmed selections. */
  scopeKey?: string;
  id?: string;
  label?: string;
  onChange: (value: RegionRef | null) => void;
};

type Draft = { owner: string; code: string; query: string; active: number };
const catalog = TOPIC_REGION_CATALOG;
const levelLabel = { province: '省级', prefecture: '地级', county: '县级' };
const provinces = catalog.records.filter(row => row.level === 'province');
const fullPath = (code: string) => regionPath(code).map(row => row.name).join(' / ');

function existingPath(value: RegionRef | null): RegionRecord[] {
  try { return value ? regionPath(value) : []; } catch { return []; }
}

function legacySuggestions(region: string, city: string) {
  try { return resolveLegacyRegion(region, city); }
  catch { return { status: 'unmatched', candidates: [], notices: ['旧地区输入无法解析，请重新选择；原输入仍保留。'] } as const; }
}

/** Directory selection only: choosing a node does not assert local research coverage. */
export default function RegionPicker({
  regionRef, region = '', city = '', disabled = false, readOnly = false, scopeKey = '',
  id, label = '研究地区', onChange,
}: RegionPickerProps) {
  const generatedId = useId();
  const fieldId = id ?? `region-${generatedId}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const live = useRef<{ owner: string; draft: Draft | null } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const locked = disabled || readOnly;
  const owner = JSON.stringify([scopeKey, regionRef, region, city, locked]);
  // A parent project/selection change invalidates the entire unconfirmed draft.
  if (draft && draft.owner !== owner) setDraft(null);
  const open = !!draft && draft.owner === owner && !locked;
  const savedPath = existingPath(regionRef);
  const incompatible = !!regionRef && !savedPath.length;
  const legacyText = [region, city].filter(Boolean).join(' / ');
  const legacy = !regionRef && legacyText ? legacySuggestions(region, city) : null;
  const stagedPath = draft?.code ? regionPath(draft.code) : [];
  const staged = stagedPath.at(-1);
  const province = stagedPath.find(row => row.level === 'province');
  const prefecture = stagedPath.find(row => row.level === 'prefecture');
  const provinceOnly = !!province && catalog.coverage.provinceOnlyCodes.includes(province.code);
  const prefectures = province ? catalog.records.filter(row => row.parentCode === province.code && row.level === 'prefecture') : [];
  const counties = province ? catalog.records.filter(row => row.level === 'county' && row.parentCode === (prefecture?.code ?? province.code)) : [];
  const query = draft?.query ?? '';
  const results = query.trim() ? searchRegions(query, null, 60) : [];
  const activeResult = results[draft?.active ?? 0];
  const display = savedPath.length ? savedPath.map(row => row.name).join(' / ') : incompatible
    ? `已保留地区 ${regionRef!.code}` : legacyText || '选择省、市或区县';

  // Layout effects update before interaction. Retained handlers cannot write to a
  // new account/project, a cancelled draft, or an unmounted keyed instance.
  useLayoutEffect(() => {
    const current = { owner, draft: open ? draft : null };
    live.current = current;
    return () => { if (live.current === current) live.current = null; };
  }, [owner, draft, open]);

  useEffect(() => {
    if (!open) { composing.current = false; return; }
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setDraft(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open && query.trim()) document.getElementById(`${fieldId}-result-${draft?.active ?? 0}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, query, draft?.active, fieldId]);

  function close(restoreFocus = true) {
    if (live.current?.owner !== owner) return;
    setDraft(null);
    composing.current = false;
    if (restoreFocus) queueMicrotask(() => trigger.current?.focus());
  }
  function stage(row: RegionRecord) {
    if (locked || live.current?.owner !== owner) return;
    setDraft(current => current?.owner === owner ? { ...current, code: row.code, query: '', active: 0 } : current);
  }
  function confirm() {
    if (locked || !open || !staged || live.current?.owner !== owner || live.current.draft !== draft) return;
    onChange({ code: staged.code, catalogVersion: catalog.catalogVersion });
    close();
  }
  function inputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (live.current?.owner !== owner || event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setDraft(current => current ? { ...current, active: (current.active + step + results.length) % results.length } : current);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeResult) stage(activeResult);
    }
  }
  function result(row: RegionSearchResult, index: number) {
    return <div key={row.code} id={`${fieldId}-result-${index}`} role="option"
      aria-selected={index === draft?.active} className={styles.result}>
      <button type="button" tabIndex={-1} onClick={() => stage(row)}
        aria-label={`选择 ${fullPath(row.code)}`}>
        <span><strong>{row.name}</strong><span className={styles.badge}>{levelLabel[row.level]}</span></span>
        <small>{fullPath(row.code)}<span className={styles.code}>{row.code}</span></small>
        {row.match === 'historical' && <small className={styles.historical}>历史名称“{row.matchedName}”的现行候选，需核对范围</small>}
      </button>
    </div>;
  }
  function column(rows: readonly RegionRecord[], title: string, empty: string, selectedCode?: string) {
    return <section className={styles.column} aria-label={title}>
      <h5>{title}<span>{rows.length ? `${rows.length} 项` : ''}</span></h5>
      <div className={styles.columnList} role="group" aria-label={`${title}列表`} aria-describedby={`${fieldId}-browse-hint`}
        onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const at = buttons.indexOf(event.target as HTMLButtonElement);
          if (at < 0 || !buttons.length) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}>{rows.length ? rows.map((row, index) =>
        <button type="button" key={row.code} aria-pressed={row.code === selectedCode}
          tabIndex={row.code === selectedCode || !selectedCode && index === 0 ? 0 : -1}
          aria-label={`选择 ${fullPath(row.code)}`} onClick={() => stage(row)}>
          <span>{row.name}</span><span aria-hidden="true">{row.code === selectedCode ? '✓' : row.level === 'county' ? '' : '›'}</span>
        </button>) : <p className={styles.columnEmpty}>{empty}</p>}</div>
    </section>;
  }

  return <div ref={root} className={styles.root} data-self-styled data-visual-mode="agent_ui"
    data-disabled={disabled || undefined} data-readonly={readOnly || undefined}>
    <label id={`${fieldId}-label`} className={styles.label} htmlFor={fieldId}>{label}</label>
    <div className={styles.control}>
      <button ref={trigger} id={fieldId} type="button" className={styles.trigger}
        disabled={locked} aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? `${fieldId}-panel` : undefined}
        aria-labelledby={`${fieldId}-label ${fieldId}-value`} aria-describedby={`${fieldId}-hint`}
        onClick={() => { if (live.current?.owner !== owner) return; if (open) close(); else if (!locked) setDraft({ owner, code: savedPath.at(-1)?.code ?? '', query: '', active: 0 }); }}>
        <span id={`${fieldId}-value`} data-empty={!regionRef && !legacyText || undefined}>{display}</span>
        <span className={styles.chevron} aria-hidden="true">⌄</span>
      </button>
      {(regionRef || legacyText) && <button type="button" className={styles.clear}
        disabled={locked} aria-label="清除研究地区" title="清除研究地区"
        onClick={() => { if (!locked && live.current?.owner === owner) { onChange(null); close(); } }}>×</button>}
    </div>
    <p id={`${fieldId}-hint`} className={styles.hint}>{incompatible
      ? `原引用 ${regionRef!.code} · ${regionRef!.catalogVersion} 已保留，请重新选择并确认。`
      : legacy ? '保留旧输入；选择候选并确认后才绑定地区。'
        : '2025年末目录 · 可停留在省级、地级或县级'}</p>
    {open && <div id={`${fieldId}-panel`} className={styles.panel} role="dialog" aria-modal="false"
      aria-labelledby={`${fieldId}-panel-title`} onKeyDown={event => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
          event.preventDefault(); event.stopPropagation(); close();
        }
      }}>
      <div className={styles.panelHeader}><div><h4 id={`${fieldId}-panel-title`}>选择研究地区</h4><p>按实际研究范围选择，不必选到区县。</p></div><button type="button" className={styles.close} aria-label="取消地区选择" onClick={() => close()}>×</button></div>
      <label className={styles.srOnly} htmlFor={`${fieldId}-search`}>搜索地区名称或六位代码</label>
      <div className={styles.search}><span aria-hidden="true">⌕</span><input ref={search} id={`${fieldId}-search`}
        type="text" role="combobox" autoComplete="off" spellCheck={false} maxLength={160}
        placeholder="搜索地区名称或六位代码" value={query}
        aria-autocomplete="list" aria-expanded={!!query.trim()}
        aria-controls={query.trim() ? `${fieldId}-results` : undefined}
        aria-activedescendant={activeResult ? `${fieldId}-result-${draft.active}` : undefined}
        onChange={event => {
          if (live.current?.owner !== owner) return;
          const value = event.target.value.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 160);
          setDraft(current => current ? { ...current, query: value, active: 0 } : current);
        }} onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }} onKeyDown={inputKey} />
        {!!query && <button type="button" aria-label="清空地区搜索" onClick={() => { setDraft(current => current ? { ...current, query: '', active: 0 } : current); search.current?.focus(); }}>×</button>}
      </div>
      {query.trim() ? <div className={styles.searchArea}>
        <p className={styles.resultCount} role="status">{results.length ? `${results.length === 60 ? '最多显示' : '找到'} ${results.length} 个地区，↑↓ 切换，Enter 预选` : '没有匹配地区，请尝试完整名称或六位代码。'}</p>
        <div id={`${fieldId}-results`} role="listbox" aria-label="地区搜索结果" className={styles.results}>{results.map(result)}</div>
      </div> : <>
        {legacy && <div className={styles.legacy}><p><strong>旧输入待确认</strong><span>{legacyText}</span></p>
          {!!legacy.candidates.length && <div className={styles.legacyCandidates}>{legacy.candidates.map(row => <button type="button" key={row.code}
            aria-label={`预选旧输入候选 ${fullPath(row.code)}`} onClick={() => stage(row)}>{fullPath(row.code)}<span>预选 ›</span></button>)}</div>}
          <p>{legacy.candidates.length > 1 ? '存在多个候选，请按完整路径核对后确认。' : legacy.notices[0]}</p>
          {legacy.candidates.some(row => row.match === 'historical') && <p>历史名称可能涉及撤并或分割，请核对原研究范围。</p>}
        </div>}
        {incompatible && <p className={styles.legacy}>原目录引用继续保留；当前目录中的选择须由你重新确认。</p>}
        <p id={`${fieldId}-browse-hint`} className={styles.srOnly}>每列使用上下方向键浏览，Home 和 End 跳转，Enter 预选；Tab 切换列及操作按钮。</p>
        <div className={styles.cascade}>
          {column(provinces, '省 / 直辖市', '暂无省级节点', province?.code)}
          {column(prefectures, '市 / 州 / 盟', provinceOnly ? '该地区目前仅收录省级节点' : province && !prefectures.length ? '该省级节点直接下辖县区' : '先选择省级地区', prefecture?.code)}
          {column(counties, '区 / 县 / 旗', provinceOnly ? '尚无下级明细，可选择省级范围' : !province ? '先选择省级地区' : prefectures.length && !prefecture ? '选择地级地区，或查看省直辖县区' : '该节点暂无县级明细', staged?.level === 'county' ? staged.code : undefined)}
        </div>
      </>}
      <div className={styles.selection} aria-live="polite"><span>待确认范围</span><strong>{staged ? fullPath(staged.code) : '尚未选择'}</strong>{staged && <small>{levelLabel[staged.level]} · {staged.code}{provinceOnly ? ' · 仅省级目录' : ''}</small>}</div>
      <p className={styles.coverage}>{provinceOnly ? '该地区仅有省级目录，尚无市县明细。' : '确认后，按所选范围匹配研究方向。'}</p>
      <div className={styles.panelFooter}><span>2025年末目录</span><button type="button" onClick={() => close()}>取消</button><button type="button" className={styles.confirm} disabled={!staged || locked} onClick={confirm}>确认地区</button></div>
    </div>}
  </div>;
}
