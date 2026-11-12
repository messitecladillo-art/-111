'use client';

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from './icons';
import styles from './ArtifactShelf.module.css';

export type ArtifactShelfItem = {
  id: string;
  familyId: string;
  title: string;
  kind: 'cover' | 'frame' | 'diagram' | 'chart' | 'table' | 'formula' | 'text' | 'file';
  version: number;
  status: 'candidate' | 'adopted' | 'stored';
  origin: string;
  detail: string;
  updatedAt: string;
  canUse: boolean;
  canEdit: boolean;
  canExport: boolean;
  useLabel?: string;
  useAction?: 'apply' | 'download';
  /** Validated local image bytes from the artifact controller; never a remote URL. */
  thumbnailUrl?: string;
  fingerprint?: string;
};

export type ArtifactShelfProps = {
  items: readonly ArtifactShelfItem[];
  selectedId: string | null;
  preview: ReactNode;
  busy: boolean;
  error: string | null;
  unavailableReason?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onUse: (id: string) => void;
  onEdit: (id: string) => void;
  onExport: (id: string) => void;
  onArchive: (id: string) => void;
  onCommand: (id: string, text: string) => void;
  onImport: (file: File, kind: 'cover' | 'diagram' | 'file') => void;
  onCapture: () => void;
  onExample?: () => void;
};

type Kind = ArtifactShelfItem['kind'];
type ImportKind = Parameters<ArtifactShelfProps['onImport']>[1];
const KINDS: readonly Kind[] = ['cover', 'frame', 'diagram', 'chart', 'table', 'formula', 'text', 'file'];
const KIND_LABELS: Record<Kind, string> = {
  cover: '封面', frame: '页框', diagram: '示意图', chart: '图表', table: '表格', formula: '公式', text: '文字', file: '文件',
};
const STATUS_LABELS: Record<ArtifactShelfItem['status'], string> = { candidate: '候选', adopted: '已采用', stored: '已收存' };

function KindIcon({ kind }: { kind: Kind }) {
  const paths: Record<Kind, ReactNode> = {
    cover: <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8 7h8M8 10h5M8 16l2.5-3 2.5 2 2-1.5 1 2.5" /></>,
    frame: <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M7.5 7h9v10h-9z" /></>,
    diagram: <><rect x="8" y="3" width="8" height="5" rx="1" /><rect x="2.5" y="16" width="7" height="5" rx="1" /><rect x="14.5" y="16" width="7" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></>,
    chart: <><path d="M4 4v16h16M8 16v-4M12 16V7M16 16v-6" /></>,
    table: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15M14.5 4.5v15" /></>,
    formula: <><path d="M19 5H9l6 7-6 7h10M3 10h3M3 14h3" /></>,
    text: <><path d="M5 5h14M12 5v14M9 19h6M5 5v3M19 5v3" /></>,
    file: <><path d="M14 3.5H6a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V9L14 3.5Z" /><path d="M14 3.5V9h5.5M8 13h8M8 16.5h6" /></>,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function StackMark() {
  return <span className={styles.stackMark} aria-hidden="true"><i /><i /><i /></span>;
}

function ArtifactThumbnail({ item }: { item: ArtifactShelfItem }) {
  const [failed, setFailed] = useState(false);
  const source = !failed && item.thumbnailUrl && /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/u.test(item.thumbnailUrl) ? item.thumbnailUrl : null;
  return <span className={styles.itemIcon} data-thumbnail={!!source}>
    {source
      // Validated private bytes are rendered in image context, never inline SVG or a remote request.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={source} alt="" loading="lazy" decoding="async" width={56} height={64} onError={() => setFailed(true)} />
      : <KindIcon kind={item.kind} />}
  </span>;
}

/** A compact, non-modal entry point. The shell owns placement and the open state. */
export function ArtifactShelfLauncher({ count, onClick, open }: { count: number; onClick: () => void; open: boolean }) {
  const label = `${open ? '收起' : '打开'}素材架${count > 0 ? `，${count} 项素材` : ''}`;
  return <button type="button" className={styles.launcher} data-open={open} aria-expanded={open} aria-label={label} title={label} onClick={onClick}>
    <StackMark />
    {count > 0 && <span className={styles.launcherCount} aria-hidden="true">{count > 99 ? '99+' : count}</span>}
  </button>;
}

function newerFirst(a: ArtifactShelfItem, b: ArtifactShelfItem) {
  return b.version - a.version || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai',
  }).format(date);
}

/** Presentation only: supplied objects and callbacks remain owned by the active workspace. */
export default function ArtifactShelf({ items, selectedId, preview, busy, error, unavailableReason, onSelect, onClose, onUse, onEdit, onExport, onArchive, onCommand, onImport, onCapture, onExample }: ArtifactShelfProps) {
  const headingId = useId();
  const searchId = useId();
  const versionId = useId();
  const commandId = useId();
  const importKindId = useId();
  const blocked = busy || !!unavailableReason;
  const fileInput = useRef<HTMLInputElement>(null);
  const imageViewer = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [importKind, setImportKind] = useState<ImportKind>('cover');
  const [commands, setCommands] = useState<Record<string, string>>({});
  const selected = items.find(item => item.id === selectedId) ?? null;
  const families = useMemo(() => {
    const grouped = new Map<string, ArtifactShelfItem[]>();
    for (const item of items) {
      const family = grouped.get(item.familyId) ?? [];
      family.push(item);
      grouped.set(item.familyId, family);
    }
    return [...grouped.values()].map(family => family.sort(newerFirst)).sort((a, b) => b[0].updatedAt.localeCompare(a[0].updatedAt));
  }, [items]);
  const visibleFamilies = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return families.map(family => family.filter(item => (kind === 'all' || item.kind === kind) && (!term || [item.title, item.origin, item.detail, KIND_LABELS[item.kind]].join(' ').toLocaleLowerCase().includes(term)))).filter(family => family.length > 0);
  }, [families, kind, query]);
  const selectedVersions = selected ? families.find(family => family[0].familyId === selected.familyId) ?? [] : [];
  const selectedImage = selected?.thumbnailUrl && /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/u.test(selected.thumbnailUrl) ? selected.thumbnailUrl : null;
  const command = selected ? commands[selected.id] ?? '' : '';
  const latestByFamily = new Map(families.map(family => [family[0].familyId, family[0].id]));
  const kindCounts = new Map(KINDS.map(type => [type, families.filter(family => family.some(item => item.kind === type)).length]));
  const selectedVisible = !selected || visibleFamilies.some(family => (showHistory ? family : family.slice(0, 1)).some(item => item.id === selected.id));

  function sendCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || blocked || !command.trim()) return;
    onCommand(selected.id, command.trim());
  }

  return <aside className={styles.shelf} aria-labelledby={headingId}>
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.headingMark}><StackMark /></span>
        <div><h2 id={headingId}>素材架</h2><p>{items.length ? `${families.length} 项素材 · ${items.length} 个版本` : '留在手边，随时取用'}</p></div>
      </div>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="收起素材架" title="收起素材架"><Icon name="panel" /></button>
    </header>

    <div className={styles.filters}>
      <label className={styles.search} htmlFor={searchId}><Icon name="search" /><span className={styles.srOnly}>搜索素材</span><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、来源或内容" /></label>
      <div className={styles.filterRow}>
        <span className={styles.resultCount} role="status">{query.trim() || kind !== 'all' ? `找到 ${visibleFamilies.length} 项` : `${families.length} 项素材`}</span>
        <button type="button" className={styles.historyToggle} aria-pressed={showHistory} onClick={() => setShowHistory(value => !value)}><Icon name="book" />历史版本</button>
      </div>
      {families.length > 0 && <div className={styles.kindFilters} role="group" aria-label="素材分类">
        <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>全部 <span>{families.length}</span></button>
        {KINDS.filter(type => kindCounts.get(type)! > 0 || kind === type).map(type => <button type="button" key={type} aria-pressed={kind === type} onClick={() => setKind(type)}>{KIND_LABELS[type]} <span>{kindCounts.get(type)}</span></button>)}
      </div>}
    </div>

    <div className={styles.content}>
      {error && <p className={styles.error} role="alert"><Icon name="info" /><span>{error}</span></p>}
      {unavailableReason && <p className={styles.error} role="status"><Icon name="info" /><span>{unavailableReason}</span></p>}
      {busy && <p className={styles.busy} role="status">正在处理素材…</p>}
      <section className={styles.library} aria-label="素材列表">
        {visibleFamilies.length > 0 ? <ul className={styles.families}>
          {visibleFamilies.map(family => <li className={styles.family} key={family[0].familyId}>
            {showHistory && family.length > 1 && <div className={styles.familyLabel}><span>{family[0].title}</span><span>{family.length} 个版本</span></div>}
            <ul className={styles.items}>
              {(showHistory ? family : family.slice(0, 1)).map(item => <li key={item.id}>
                <button type="button" className={styles.item} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}>
                  <ArtifactThumbnail item={item} />
                  <span className={styles.itemContent}><strong title={item.title}>{item.title}</strong><span className={styles.itemMeta}><span>{KIND_LABELS[item.kind]}</span><span>v{item.version}{!showHistory && latestByFamily.get(item.familyId) !== item.id ? ' · 历史匹配' : !showHistory && family.length > 1 ? ` · 共 ${family.length} 版` : ''}</span></span></span>
                  <span className={styles.status} data-status={item.status}>{STATUS_LABELS[item.status]}</span>
                </button>
              </li>)}
            </ul>
          </li>)}
        </ul> : <div className={styles.empty}>
          <span className={styles.emptyMark}><StackMark /></span>
          <strong>{items.length ? '没有找到匹配的素材' : '素材会留在这里'}</strong>
          <p>{items.length ? '试试其他关键词，或切换素材类型。' : '生成的封面、图表和文字可以独立预览，也可以导入已有素材。'}</p>
          {items.length > 0 && (query || kind !== 'all') && <button type="button" className={styles.textButton} onClick={() => { setQuery(''); setKind('all'); }}>清除筛选</button>}
        </div>}
      </section>

      {selected ? <section className={styles.selection} aria-label={`选中素材：${selected.title}`}>
        <div className={styles.selectionHeader}><h3>{selected.title}</h3><label className={styles.versionPicker} htmlFor={versionId}><span className={styles.srOnly}>选择素材版本</span><select id={versionId} value={selected.id} onChange={event => onSelect(event.target.value)}>{selectedVersions.map(item => <option key={item.id} value={item.id}>v{item.version}{item.id === selectedVersions[0]?.id ? ' · 最新' : ''} · {STATUS_LABELS[item.status]}</option>)}</select></label></div>
        {!selectedVisible && <p className={styles.filteredSelection} role="status">所选素材不在当前列表中。<button type="button" onClick={() => { setQuery(''); setKind('all'); setShowHistory(true); }}>显示所选版本</button></p>}
        <div className={styles.previewShell}>
          <div className={styles.preview} aria-label={`${selected.title}预览`} aria-busy={busy}>{preview == null ? <div className={styles.previewEmpty}><KindIcon kind={selected.kind} /><span>此素材暂无可用预览</span></div> : preview}</div>
          {selectedImage && <button type="button" className={styles.enlarge} onClick={() => { if (!imageViewer.current?.open) imageViewer.current?.showModal(); }}><Icon name="expand" />放大查看</button>}
        </div>
        {selectedImage && <dialog ref={imageViewer} className={styles.imageViewer} aria-label={`${selected.title} · v${selected.version}`} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
          <header><h3>{selected.title}<small>v{selected.version}</small></h3><button type="button" className={styles.iconButton} aria-label="关闭图片预览" onClick={() => imageViewer.current?.close()}><Icon name="close" /></button></header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedImage} alt={selected.title} />
        </dialog>}
        <div className={styles.actions} aria-label="选中素材操作" data-download={selected.useAction === 'download' && selected.canUse}>
          <button type="button" className={styles.primaryButton} disabled={blocked || !selected.canUse} onClick={() => onUse(selected.id)}><Icon name={selected.useAction === 'download' ? 'download' : 'check'} />{selected.useLabel??(selected.kind==='frame'?'预览并应用':'用于报告')}</button>
          <button type="button" disabled={blocked || !selected.canEdit} onClick={() => onEdit(selected.id)}><Icon name="edit" />编辑</button>
          {(selected.useAction !== 'download' || !selected.canUse) && <button type="button" disabled={blocked || !selected.canExport} onClick={() => onExport(selected.id)}><Icon name="download" />导出</button>}
          <button type="button" disabled={blocked || selected.status === 'stored'} onClick={() => onArchive(selected.id)}><Icon name="folder" />{selected.status === 'stored' ? '已收存' : '收存'}</button>
        </div>
        <details className={styles.metadata}><summary>来源与版本</summary><dl className={styles.details}>
          <div><dt>来源</dt><dd>{selected.origin || '未记录'}</dd></div>
          <div><dt>内容</dt><dd>{selected.detail || KIND_LABELS[selected.kind]}</dd></div>
          <div><dt>更新</dt><dd><time dateTime={Number.isNaN(Date.parse(selected.updatedAt)) ? undefined : selected.updatedAt} title="北京时间">{updatedLabel(selected.updatedAt)}</time></dd></div>
          {selected.fingerprint && <div><dt>指纹</dt><dd><code>{selected.fingerprint}</code></dd></div>}
        </dl></details>
        <form className={styles.command} onSubmit={sendCommand}>
          <label htmlFor={commandId}>对这项素材说一句</label>
          <div className={styles.commandInput}><textarea id={commandId} value={command} rows={2} maxLength={2000} placeholder="例如：标题缩短一些，保留当前配色" onChange={event => setCommands(value => ({ ...value, [selected.id]: event.target.value }))} disabled={blocked} /><button type="submit" disabled={blocked || !command.trim()} aria-label={`向“${selected.title}”发送指令`} title="发送指令"><Icon name="up" /></button></div>
        </form>
      </section> : items.length > 0 && <div className={styles.chooseHint}><Icon name="grid" /><p>选择一项素材，在这里预览和继续编辑。</p></div>}

      <details className={styles.importSection} open={items.length === 0}>
        <summary>添加与收录 <Icon name="plus" /></summary>
        <div className={styles.importRow}><label htmlFor={importKindId} className={styles.srOnly}>导入素材类别</label><select id={importKindId} value={importKind} onChange={event => setImportKind(event.target.value as ImportKind)} disabled={blocked}><option value="cover">作为封面</option><option value="diagram">作为示意图</option><option value="file">作为文件</option></select><button type="button" onClick={() => fileInput.current?.click()} disabled={blocked}><Icon name="plus" />导入素材</button></div>
        <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={event => { const file = event.currentTarget.files?.[0]; if (file && !blocked) onImport(file, importKind); event.currentTarget.value = ''; }} />
        <p>PNG、JPG、WebP、SVG</p>
        <button type="button" className={styles.captureButton} onClick={onCapture} disabled={blocked}><Icon name="book" />收录当前报告素材</button>
        {onExample && <button type="button" className={styles.captureButton} onClick={onExample} disabled={blocked}><Icon name="grid" />添加信息图示例</button>}
      </details>
    </div>
  </aside>;
}
