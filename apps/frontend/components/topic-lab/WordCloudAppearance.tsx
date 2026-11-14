'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  CLOUD_SHAPES,
  DEFAULT_CLOUD_APPEARANCE,
  cloudShapePath,
  parseCloudAppearance,
  synthesizeSemanticCloudMask,
  type AgentShapeRecognition,
  type CloudAppearance,
} from '@/lib/topic-lab/cloud-shapes';
import { readCustomCloudMask } from '@/lib/topic-lab/custom-cloud-mask';
import styles from './WordCloudAppearance.module.css';

type WordCloudAppearanceProps = {
  value: CloudAppearance;
  onChange: (value: CloudAppearance) => void;
  recognition?: AgentShapeRecognition;
  autoRecognize?: boolean;
  onToggleAuto?: (next: boolean) => void;
};

export default function WordCloudAppearance({
  value,
  onChange,
  recognition,
  autoRecognize = false,
  onToggleAuto,
}: WordCloudAppearanceProps) {
  const fileInput = useRef<HTMLInputElement>(null), epoch = useRef(0), controller = useRef<AbortController | null>(null);
  const latest = useRef(value);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [prompt, setPrompt] = useState('');
  const customMask = value.customMask;
  const thumbnails = useMemo(() => new Map(CLOUD_SHAPES.filter(shape => shape.id !== 'free' && (shape.id !== 'custom' || customMask)).map(shape => [shape.id, cloudShapePath({ ...DEFAULT_CLOUD_APPEARANCE, shape: shape.id, ...(customMask ? { customMask } : {}) }, 100, 60)])), [customMask]);
  useEffect(() => { latest.current = value; }, [value]);
  useEffect(() => () => { epoch.current++; controller.current?.abort(); }, []);
  const cancel = () => { epoch.current++; controller.current?.abort(); controller.current = null; setBusy(false); };
  const select = (shape: CloudAppearance['shape']) => {
    cancel(); setError('');
    if (shape === 'custom' && !value.customMask) { fileInput.current?.click(); return; }
    onToggleAuto?.(false);
    onChange({ ...value, shape });
  };
  const applyPromptShape = () => {
    const clean = prompt.trim();
    if (!clean) return;
    cancel(); setError('');
    const mask = synthesizeSemanticCloudMask(clean);
    onToggleAuto?.(false);
    onChange(parseCloudAppearance({ ...latest.current, shape: 'custom', outline: true, customMask: mask }));
  };
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    cancel(); const token = ++epoch.current, active = new AbortController(); controller.current = active;
    setBusy(true); setError('');
    const timeout = window.setTimeout(() => active.abort(), 30_000);
    try {
      const customMask = await readCustomCloudMask(file, active.signal);
      if (epoch.current === token && !active.signal.aborted) {
        onToggleAuto?.(false);
        onChange(parseCloudAppearance({ ...latest.current, shape: 'custom', customMask }));
      }
    } catch (reason) {
      if (epoch.current === token) setError(active.signal.aborted ? '读取超时，请重试或换一张较小的剪影。' : reason instanceof Error ? reason.message : '剪影读取失败，请重试。');
    } finally {
      window.clearTimeout(timeout);
      if (epoch.current === token) { setBusy(false); controller.current = null; }
    }
  }
  return <section className={styles.appearance} aria-label="词云形状设置">
    {recognition && <div className={styles.agentBar}>
      <div className={styles.agentMeta}>
        <span className={styles.agentBadge}>🤖 Agent 自动识形</span>
        <span className={styles.agentCopy}>{recognition.reason}</span>
      </div>
      <div className={styles.agentControls}>
        {onToggleAuto && <button type="button" className={styles.autoBtn} aria-pressed={autoRecognize} onClick={() => onToggleAuto(!autoRecognize)}>
          {autoRecognize ? '✨ 自动识形：已开启' : `应用推荐「${recognition.label}」`}
        </button>}
        <div className={styles.promptRow}>
          <input
            type="text"
            className={styles.promptInput}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyPromptShape(); } }}
            placeholder="AI 构形：如 新能源汽车、奶茶杯、奖杯"
            aria-label="输入语义主题生成词云轮廓"
            maxLength={40}
          />
          <button type="button" className={styles.aiBtn} disabled={!prompt.trim() || busy} onClick={applyPromptShape}>AI 构形</button>
        </div>
      </div>
    </div>}
    <div className={styles.heading}><strong>形状</strong><button className={styles.upload} type="button" onClick={() => fileInput.current?.click()} disabled={busy} title="PNG、JPG 或 WebP，最多 2 MB">＋ 上传剪影</button></div>
    <div className={styles.shapes} role="group" aria-label="词云形状">
      {CLOUD_SHAPES.map(shape => <button key={shape.id} type="button" className={styles.shape} aria-pressed={value.shape === shape.id} aria-label={`${shape.label}词云`} onClick={() => select(shape.id)}>
        <svg viewBox="0 0 100 60" aria-hidden="true">
          {shape.id === 'free' ? <g fill="currentColor"><rect x="20" y="17" width="24" height="7" rx="1" /><rect x="48" y="15" width="31" height="9" rx="1" /><rect x="12" y="29" width="35" height="11" rx="1" /><rect x="52" y="29" width="36" height="11" rx="1" /><rect x="25" y="45" width="24" height="5" rx="1" /><rect x="54" y="45" width="20" height="5" rx="1" /></g>
            : shape.id === 'custom' && !value.customMask ? <g fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 18V10h18m28 0h18v8M18 42v8h18m28 0h18v-8M50 20v20m-10-10h20" /></g>
              : <path d={thumbnails.get(shape.id)} fill="currentColor" fillOpacity=".18" fillRule="evenodd" stroke="currentColor" strokeWidth="1.5" />}
        </svg>
        <span>{shape.label}</span>
      </button>)}
    </div>
    <div className={styles.controls}>
      <label>方向<select aria-label="词云轮廓方向" value={value.orientation} disabled={value.shape === 'free' || value.shape === 'circle'} onChange={e => { cancel(); onChange({ ...value, orientation: e.target.value as CloudAppearance['orientation'] }); }}><option value="horizontal">横向</option><option value="vertical">纵向</option></select></label>
      <label>间距<select aria-label="词云文字间距" value={value.spacing} onChange={e => onChange({ ...value, spacing: e.target.value as CloudAppearance['spacing'] })}><option value="compact">紧凑</option><option value="standard">标准</option><option value="relaxed">舒展</option></select></label>
      <label><input type="checkbox" checked={value.outline} disabled={value.shape === 'free'} onChange={e => onChange({ ...value, outline: e.target.checked })} />显示轮廓</label>
    </div>
    {busy && <div className={styles.customRow} role="status"><span>正在读取剪影…</span><button type="button" className={styles.cancel} onClick={cancel}>取消</button></div>}
    {!busy && value.customMask && <div className={styles.customRow}><span>{value.customMask.label}</span><button className={styles.cancel} type="button" onClick={() => { cancel(); const { customMask: _mask, ...rest } = value; void _mask; onChange({ ...rest, shape: value.shape === 'custom' ? 'free' : value.shape }); }}>移除剪影</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <input ref={fileInput} className={styles.hiddenInput} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="上传词云剪影" tabIndex={-1} onChange={upload} />
  </section>;
}
