'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Formula } from '@/components/math/Tex';
import { createEditorContent, type EditorContent } from '@/lib/editor-model';
import { parseReportFigure, reportFigureSVG, figureFromResult, defaultProjectVisualStyle } from '@/lib/report-figure';
import { approveReportFrame, frameSVG, parseReportFrame } from '@/lib/report-frame';
import { parseFigureRequest, applyFigureChange } from '@/lib/agent/figure-tweak';
import { ARTIFACT_LIMITS, artifactHash, artifactImageMime, artifactScope, captureArtifacts, collectReportArtifacts, emptyArtifactLibrary, readArtifactLibrary, updateArtifactLibrary, type ArtifactLibrary, type ArtifactRecord, type ArtifactSeed, type ArtifactValue } from '@/lib/agent/artifact-library';
import type { ArtifactShelfItem } from './ArtifactShelf';

type Current = { scope: string | null; content: EditorContent | null; sectionId: string | null; blocked: boolean };
export type ArtifactLibraryOptions = {
  owner: string | null; projectId: string | null; content: EditorContent | null;
  candidate: { id: string; report: EditorContent } | null; selectedSectionId: string | null;
  sectionCandidate?: {id:string;seed:ArtifactSeed}|null;
  readCurrent: () => Current;
  apply: (record: ArtifactRecord, sectionId: string | null) => { ok: boolean; reason?: string };
  onSay: (text: string) => void;
};
export type ArtifactImportMeta = Pick<ArtifactSeed, 'origin'|'classification'>;
type Edit = { record: ArtifactRecord; title: string; text: string; decimals: number; labels: boolean; grid: boolean; border: boolean; lineWidth: number; density: number; strength: number; layout: 'none'|'corners'|'open'|'closed' };
type Lease = { scope: string | null };
type State = { lease: Lease; library: ArtifactLibrary; selectedId: string | null; ready: boolean; busy: boolean; error: string | null; edit: Edit | null };
const initial = (lease: Lease): State => ({ lease, library: emptyArtifactLibrary(), selectedId: null, ready: false, busy: false, error: null, edit: null });
const message = (error: unknown) => error instanceof Error ? error.message : '素材操作未完成，请重试。';
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const nameOf = (title: string) => (title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').trim().slice(0, 100) || '素材');
const plainText = (value: ArtifactValue) => value.type === 'text' ? [value.section.body, ...(value.section.blocks ?? []).filter(b => b.kind === 'paragraph').map(b => b.text)].filter(Boolean).join('\n') : value.type === 'block' ? value.block.text : '';
const CLASSIFICATION_NAMES = { simulated: '模拟素材', public: '公开材料', user_provided: '用户提供', mixed: '混合材料', unclassified: '待分类' } as const;
const IMAGE_NAMES: Record<string, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP', 'image/svg+xml': 'SVG' };
function table(headers: string[], rows: (string | number | null)[][]) { return <table><thead><tr>{headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell === null ? '—' : String(cell)}</td>)}</tr>)}</tbody></table>; }
/* Local data URLs intentionally bypass remote image optimisation. */
/* eslint-disable @next/next/no-img-element */
function previewValue(value: ArtifactValue): ReactNode {
  try {
    if (value.type === 'file') return <img src={value.dataUrl} alt={value.name} />;
    if (value.type === 'cover') return <section style={{ textAlign: 'center', padding: '24px 8px', overflowWrap: 'anywhere' }}><h3>{value.title}</h3><p>{value.subtitle}</p></section>;
    if (value.type === 'frame') return <img src={svgUrl(frameSVG(value.frame))} alt={value.frame.title} />;
    if (value.type === 'figure') return value.figure.kind === 'table' ? table(value.figure.table.headers, value.figure.table.rows) : <img src={svgUrl(reportFigureSVG(value.figure, value.visualStyle ?? defaultProjectVisualStyle()))} alt={value.figure.title} />;
    if (value.type === 'text') return <article><h4>{value.section.title}</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{plainText(value)}</p></article>;
    if (value.block.kind === 'formula') return <Formula tex={value.block.text} copyable compact />;
    if (value.result && value.block.kind === 'table') return table(value.result.headers, value.result.rows);
    if (value.result && value.block.kind === 'chart') return <img src={svgUrl(reportFigureSVG(figureFromResult(value.result, value.result.method === 'crosstab' ? 'grouped_bar' : 'bar', value.block.valueColumn, value.block.id), defaultProjectVisualStyle()))} alt={value.block.text || value.result.title} />;
    return <p style={{ whiteSpace: 'pre-wrap' }}>{value.block.text}</p>;
  } catch (error) { return <p role="status">{message(error)}</p>; }
}
/* eslint-enable @next/next/no-img-element */

/** Inspect actual local bytes; the declared MIME or filename alone never establishes an image. */
export async function readArtifactImage(file: File): Promise<Extract<ArtifactValue, { type: 'file' }>> {
  if (!file.size || file.size > ARTIFACT_LIMITS.fileBytes) throw Error('请选择不超过 6 MB 的本地图片。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) throw Error('图片读取不完整，请重新选择。');
  const mime = artifactImageMime(bytes);
  const extensions: Record<string, RegExp> = { 'image/png': /\.png$/iu, 'image/jpeg': /\.jpe?g$/iu, 'image/webp': /\.webp$/iu, 'image/svg+xml': /\.svg$/iu };
  if (!mime || (file.type && file.type.toLowerCase() !== mime) || !extensions[mime].test(file.name)) throw Error('文件内容、扩展名与图片类型不一致。');
  let binary = ''; for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return { type: 'file', name: file.name.slice(0, 180), mime, dataUrl: `data:${mime};base64,${btoa(binary)}` };
}

/** A command sees only the selected immutable figure, never its same-result siblings in a report. */
export function artifactFigureCommand(record: ArtifactRecord, text: string): ArtifactSeed | null {
  if (record.value.type !== 'figure') return null;
  const request = parseFigureRequest(text);
  if (!request) return null;
  if (request.unsupported.length) throw Error(request.unsupported.join(' '));
  const value = structuredClone(record.value), before = value.figure;
  if (before.resultId !== value.result.id || before.resultHash !== value.result.resultHash) throw Error('图形与分析依据版本不一致。');
  if (before.kind === 'table' && !request.change.kind) {
    value.figure = parseReportFigure({ ...before, style: { ...before.style, ...(request.change.decimals === undefined ? {} : { decimals: request.change.decimals }), ...(request.change.showLabels === undefined ? {} : { showLabels: request.change.showLabels }), ...(request.change.showGrid === undefined ? {} : { showGrid: request.change.showGrid }), ...(request.change.showBorder === undefined ? {} : { showBorder: request.change.showBorder }) } });
    if (request.change.paletteId) value.visualStyle = { schema: 'ProjectVisualStyle/v1', paletteId: request.change.paletteId as NonNullable<typeof value.visualStyle>['paletteId'], version: (value.visualStyle?.version ?? 0) + 1 };
  } else {
    const base = { ...createEditorContent(), version: 3 as const, quality: { version: 1 as const, results: [value.result], findings: [] }, figures: before.kind === 'table' ? [] : [before], visualStyle: value.visualStyle ?? defaultProjectVisualStyle() };
    const applied = applyFigureChange(base, value.result.id, request.change);
    value.figure = { ...applied.figure, title: before.title, note: before.note };
    value.visualStyle = applied.content.visualStyle ?? base.visualStyle;
  }
  if (JSON.stringify(value) === JSON.stringify(record.value)) return null;
  value.figure = parseReportFigure({ ...value.figure, id: crypto.randomUUID() });
  return { familyId: record.familyId, kind: value.figure.kind === 'table' ? 'table' : 'chart', title: value.figure.title, origin: '素材指令编辑', status: 'stored', classification: record.classification, value };
}

export function useArtifactLibrary(options: ArtifactLibraryOptions) {
  const readCurrent=options.readCurrent;
  const scope = options.owner ? artifactScope(options.owner, options.projectId) : null;
  const lease = useMemo<Lease>(() => ({ scope }), [scope]);
  const [state, setState] = useState<State>(() => initial(lease));
  const shown = state.lease === lease ? state : initial(lease);
  const env = useRef(options), active = useRef<Lease | null>(null), library = useRef(emptyArtifactLibrary()), selected = useRef<string | null>(null), queue = useRef<Promise<unknown>>(Promise.resolve()), pending = useRef(0), initialCaptured = useRef(false), candidates = useRef(new Set<string>());
  useLayoutEffect(() => { env.current = options; });
  useLayoutEffect(() => {
    active.current = lease; library.current = emptyArtifactLibrary(); selected.current = null; queue.current = Promise.resolve(); pending.current = 0; initialCaptured.current = false; candidates.current = new Set();
    return () => { if (active.current === lease) active.current = null; };
  }, [lease]);
  const current = useCallback(() => !!lease.scope && active.current === lease && env.current.readCurrent().scope === lease.scope, [lease]);
  const patch = useCallback((change: (before: State) => State) => { if (current()) setState(before => change(before.lease === lease ? before : initial(lease))); }, [current, lease]);
  const publish = useCallback((next: ArtifactLibrary, choose?: string) => {
    if (!current() || next.revision < library.current.revision) return;
    library.current = next;
    const wanted = choose ?? selected.current;
    selected.current = next.records.some(record => record.id === wanted) ? wanted : next.records.at(-1)?.id ?? null;
    patch(before => ({ ...before, library: next, selectedId: selected.current, ready: true }));
  }, [current, patch]);
  const enqueue = useCallback((work: (scope: string) => Promise<ArtifactLibrary | void>) => {
    if (!current() || !lease.scope) return;
    pending.current++; patch(before => ({ ...before, busy: true, error: null }));
    const job = queue.current.catch(() => {}).then(async () => {
      try { if(!current())return; const next = await work(lease.scope!); if (next && current()) publish(next); }
      catch (error) { patch(before => ({ ...before, error: message(error) })); }
      finally { if(active.current===lease){pending.current--;setState(before=>before.lease===lease?{...before,busy:pending.current>0}:before);} }
    });
    queue.current = job; return job;
  }, [current, lease, patch, publish]);
  const persist = useCallback(async (seed: ArtifactSeed, targetScope: string, expectedSelection?: string) => {
    const hash = await artifactHash(seed.value);
    if (!current() || expectedSelection && selected.current !== expectedSelection) return;
    const next = await captureArtifacts(targetScope, [seed]);
    if (!current()) return;
    const record = next.records.find(item => item.familyId === seed.familyId && item.hash === hash);
    const unchanged = !expectedSelection || selected.current === expectedSelection;
    publish(next, unchanged ? record?.id : undefined); if (unchanged) patch(before => ({ ...before, edit: null })); return record;
  }, [current, patch, publish]);
  useEffect(() => {
    if(scope&&!shown.ready&&readCurrent().scope===scope)void enqueue(readArtifactLibrary);
  }, [scope, shown.ready, readCurrent, enqueue]);
  useEffect(() => {
    if (!shown.ready || !options.content || !scope) return;
    const content = structuredClone(options.content);
    const timer = setTimeout(() => {
      if (!current()) return;
      const includeText = !initialCaptured.current; initialCaptured.current = true;
      void enqueue(target => captureArtifacts(target, collectReportArtifacts(content, '当前报告', 'adopted', includeText)));
    }, initialCaptured.current ? 650 : 0);
    return () => clearTimeout(timer);
  }, [options.content, shown.ready, scope, current, enqueue]);
  useEffect(() => {
    if (!shown.ready || !options.candidate || !current() || candidates.current.has(options.candidate.id)) return;
    const candidate = structuredClone(options.candidate); candidates.current.add(candidate.id);
    void enqueue(target => captureArtifacts(target, collectReportArtifacts(candidate.report, `候选稿 ${candidate.id.slice(0, 8)}`, 'candidate', true)));
  }, [options.candidate, shown.ready, current, enqueue]);
  useEffect(()=>{
    const candidate=options.sectionCandidate;
    if(!shown.ready||!candidate||!current()||candidates.current.has(candidate.id))return;
    const frozen=structuredClone(candidate);candidates.current.add(candidate.id);
    void enqueue(target=>captureArtifacts(target,[frozen.seed]));
  },[options.sectionCandidate,shown.ready,current,enqueue]);
  const recordFor = useCallback((id: string) => {
    if (!current() || selected.current !== id) return null;
    return library.current.records.find(record => record.id === id) ?? null;
  }, [current]);
  const onSelect = useCallback((id: string) => { if (!current() || !library.current.records.some(record => record.id === id)) return; selected.current = id; patch(before => ({ ...before, selectedId: id, edit: null, error: null })); }, [current, patch]);
  const download = useCallback((record: ArtifactRecord) => {
    if (!current()) return;
    const value = record.value; let blob: Blob, extension = 'json';
    if (value.type === 'file') { const encoded = value.dataUrl.split(',')[1]; const binary = atob(encoded); blob = new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: value.mime }); extension = value.name.split('.').at(-1) ?? 'bin'; }
    else if (value.type === 'figure' && value.figure.kind !== 'table') { blob = new Blob([reportFigureSVG(value.figure, value.visualStyle ?? defaultProjectVisualStyle())], { type: 'image/svg+xml' }); extension = 'svg'; }
    else if (value.type === 'frame') { blob = new Blob([frameSVG(value.frame)], { type: 'image/svg+xml' }); extension = 'svg'; }
    else if (value.type === 'text' || value.type === 'block' && value.block.kind === 'formula') { blob = new Blob([plainText(value)], { type: 'text/plain;charset=utf-8' }); extension = value.type === 'text' ? 'txt' : 'tex'; }
    else blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `${nameOf(record.title)}-v${record.version}.${extension}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [current]);
  const onExport = useCallback((id: string) => { const record = recordFor(id); if (!record) return; try { download(record); } catch (error) { patch(before => ({ ...before, error: message(error) })); } }, [recordFor, download, patch]);
  const onUse = useCallback((id: string) => {
    const record = recordFor(id); if (!record) return;
    if (record.value.type === 'file') { onExport(id); return; }
    if (env.current.readCurrent().blocked) { patch(before => ({ ...before, error: '请先完成当前报告操作，再应用素材。' })); return; }
    void enqueue(async target => {
      if (!recordFor(id)) return;
      let chosen = record;
      if (record.value.type === 'frame') {
        const frame = await approveReportFrame(record.value.frame, env.current.owner!);
        if (!current() || selected.current !== id || env.current.readCurrent().blocked) return;
        const approved = await persist({ familyId: record.familyId, kind: record.kind, title: record.title, origin: record.origin, classification: record.classification, value: { type: 'frame', frame }, status: 'stored' }, target, id);
        if (!approved) return; chosen = approved;
      }
      if (!current() || selected.current !== chosen.id || env.current.readCurrent().blocked) return;
      const live = env.current.readCurrent(); const result = env.current.apply(chosen, live.sectionId);
      if (!result.ok) throw Error(result.reason || '编辑器尚未接受素材，原稿保留。');
      return updateArtifactLibrary(target, before => ({ ...before, revision: before.revision + 1, records: before.records.map(item => item.id === chosen.id ? { ...item, status: 'adopted' } : item) }));
    });
  }, [recordFor, onExport, patch, enqueue, current, persist]);
  const onArchive = useCallback((id: string) => { if (!recordFor(id)) return; void enqueue(target => updateArtifactLibrary(target, before => ({ ...before, revision: before.revision + 1, records: before.records.map(record => record.id === id ? { ...record, status: 'stored' } : record) }))); }, [recordFor, enqueue]);
  const onCapture = useCallback(() => { if (!current()) return; const live = env.current.readCurrent(); if (!live.content) return; const content = structuredClone(live.content); void enqueue(target => captureArtifacts(target, collectReportArtifacts(content, '手动收录当前报告', 'stored', true))); }, [current, enqueue]);
  const importImage = useCallback((file: File, kind: 'cover'|'diagram'|'file', original?: ArtifactRecord, meta?: ArtifactImportMeta) => {
    if (!current()) return;
    void enqueue(async target => { const value = await readArtifactImage(file); if (!current() || original && selected.current !== original.id) return; await persist({ familyId: original?.familyId ?? `import:${crypto.randomUUID()}`, kind, title: value.name, origin: meta?.origin ?? (original ? '本地图片替换' : '本地图片导入'), status: 'stored', classification: meta?.classification ?? 'unclassified', value }, target, original?.id); });
  }, [current, enqueue, persist]);
  const onImport = useCallback((file: File, kind: 'cover'|'diagram'|'file', meta?: ArtifactImportMeta) => importImage(file, kind, undefined, meta), [importImage]);
  const onEdit = useCallback((id: string) => {
    const record = recordFor(id); if (!record) return; const value = record.value, figure = value.type === 'figure' ? value.figure : null, frame = value.type === 'frame' ? value.frame : null;
    patch(before => ({ ...before, error: null, edit: { record: structuredClone(record), title: value.type==='cover'?value.title:record.title, text: value.type === 'cover' ? value.subtitle : plainText(value), decimals: figure?.style.decimals ?? 2, labels: figure?.style.showLabels ?? true, grid: figure?.style.showGrid ?? true, border: figure?.style.showBorder ?? false, lineWidth: frame?.lineWidthPt ?? .85, density: frame?.density ?? .4, strength: frame?.strength ?? .6, layout: frame?.layout ?? 'corners' } }));
  }, [recordFor, patch]);
  const saveEdit = useCallback((draft: Edit) => {
    if (!recordFor(draft.record.id)) return;
    void enqueue(async target => {
      if (!recordFor(draft.record.id)) return;
      const value = structuredClone(draft.record.value), title = draft.title.trim(); if (!title || title.length > 150) throw Error('素材标题需为 1–150 字。');
      if (value.type === 'cover') { value.title = title; value.subtitle = draft.text; }
      else if (value.type === 'frame') value.frame = parseReportFrame({ ...value.frame, title, version: value.frame.version + 1, status: 'vector_draft', review: null, lineWidthPt: draft.lineWidth, density: draft.density, strength: draft.strength, layout: draft.layout });
      else if (value.type === 'figure') value.figure = parseReportFigure({ ...value.figure, id: crypto.randomUUID(), title, style: { ...value.figure.style, decimals: draft.decimals, showLabels: draft.labels, showGrid: draft.grid, showBorder: draft.border } });
      else if (value.type === 'text') value.section = { ...value.section, title, body: draft.text, blocks: value.section.blocks?.filter(block => block.kind !== 'paragraph') };
      else if (value.type === 'block') value.block = { ...value.block, id: crypto.randomUUID(), text: value.block.kind === 'formula' ? draft.text : title };
      else value.name = title.endsWith(`.${value.name.split('.').at(-1)}`) ? title : `${title}.${value.name.split('.').at(-1)}`;
      await persist({ familyId: draft.record.familyId, kind: draft.record.kind, title, origin: '素材手动编辑', status: 'stored', classification: draft.record.classification, value }, target, draft.record.id);
    });
  }, [recordFor, enqueue, persist]);
  const onCommand = useCallback((id: string, raw: string) => {
    const record = recordFor(id), text = raw.trim(); if (!record || !text || text.length > 2000) return;
    try { const seed = artifactFigureCommand(record, text); if (seed) { void enqueue(async target => { if (recordFor(id)) await persist(seed, target, id); }); return; } env.current.onSay(`对素材「${record.title}」提出修改：${JSON.stringify(text)}。类型 ${record.kind}，精确版本 v${record.version}，标识 ${record.id}，指纹 ${record.hash}。`); }
    catch (error) { patch(before => ({ ...before, error: message(error) })); }
  }, [recordFor, enqueue, persist, patch]);
  const chosen = shown.library.records.find(record => record.id === shown.selectedId) ?? null;
  const edit = shown.edit && shown.edit.record.id === shown.selectedId ? shown.edit : null;
  const changeEdit = (change: Partial<Edit>) => patch(before => before.edit ? { ...before, edit: { ...before.edit, ...change } } : before);
  const preview = edit ? <form style={{ display: 'grid', gap: 10, width: '100%' }} onSubmit={event => { event.preventDefault(); saveEdit(edit); }}>
    <label>标题<input aria-label="素材标题" value={edit.title} maxLength={150} disabled={shown.busy} onChange={event => changeEdit({ title: event.target.value })} /></label>
    {['cover','text'].includes(edit.record.value.type) || edit.record.value.type === 'block' && edit.record.value.block.kind === 'formula' ? <label>{edit.record.value.type === 'cover' ? '副标题' : '正文'}<textarea aria-label="素材正文" value={edit.text} maxLength={12000} rows={5} disabled={shown.busy} onChange={event => changeEdit({ text: event.target.value })} /></label> : null}
    {edit.record.value.type === 'figure' && <><label>小数位<select aria-label="素材小数位" value={edit.decimals} disabled={shown.busy} onChange={event => changeEdit({ decimals: Number(event.target.value) })}>{[0,1,2,3,4,5,6].map(n => <option key={n}>{n}</option>)}</select></label>{(['labels','grid','border'] as const).map((key, index) => <label key={key}><input type="checkbox" checked={edit[key]} disabled={shown.busy} onChange={event => changeEdit({ [key]: event.target.checked })} />{['数值标签','网格线','边框'][index]}</label>)}</>}
    {edit.record.value.type === 'frame' && <><label>框线<select value={edit.layout} disabled={shown.busy} onChange={event => changeEdit({ layout: event.target.value as Edit['layout'] })}>{(['none','corners','open','closed'] as const).map((value, index) => <option key={value} value={value}>{['无框','边角','开放框','闭合框'][index]}</option>)}</select></label>{([['lineWidth','线宽',.25,2,.05],['density','密度',0,1,.05],['strength','颜色强度',0,1,.05]] as const).map(([key,label,min,max,step]) => <label key={key}>{label}<input aria-label={`素材${label}`} type="range" min={min} max={max} step={step} value={edit[key]} disabled={shown.busy} onChange={event => changeEdit({ [key]: Number(event.target.value) })} /></label>)}</>}
    {edit.record.value.type === 'file' && <label>替换图片<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={shown.busy} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) importImage(file, edit.record.kind === 'cover' || edit.record.kind === 'diagram' ? edit.record.kind : 'file', edit.record); event.currentTarget.value = ''; }} /></label>}
    <div><button type="submit" disabled={shown.busy}>另存新版本</button><button type="button" disabled={shown.busy} onClick={() => patch(before => ({ ...before, edit: null }))}>取消编辑</button></div>
  </form> : chosen ? previewValue(chosen.value) : null;
  const items: ArtifactShelfItem[] = shown.library.records.map(record => ({
    id: record.id, familyId: record.familyId, kind: record.kind, title: record.title,
    version: record.version, status: record.status, origin: record.origin, updatedAt: record.updatedAt,
    detail: [CLASSIFICATION_NAMES[record.classification], record.value.type === 'file' ? IMAGE_NAMES[record.value.mime] : record.value.type === 'cover' ? '标题与副标题' : ''].filter(Boolean).join(' · '),
    fingerprint: record.hash,
    canUse: record.value.type === 'file' || !!options.content && (record.value.type === 'cover' || record.value.type === 'frame' || !!options.selectedSectionId),
    canEdit: true, canExport: true,
    ...(record.value.type === 'file' ? { useLabel: '下载原图', useAction: 'download' as const, thumbnailUrl: record.value.dataUrl } : {}),
  }));
  const unavailableReason = !scope || options.readCurrent().scope !== scope ? '账号与项目尚未确认，请重新连接后操作素材。' : undefined;
  return { items, selectedId: shown.selectedId, preview, busy: shown.busy, error: shown.error, unavailableReason, onSelect, onUse, onEdit, onExport, onArchive, onCommand, onImport, onCapture, count: new Set(items.map(item => item.familyId)).size };
}
