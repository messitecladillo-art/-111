import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChartStudio from '../../components/analysis/ChartStudio';
import ChartPreview, { type ChartPreviewHandle } from '../../components/analysis/ChartPreview';
import { defaultChartSettings } from '../../lib/chart-theme';
import type { ChartWorkspaceSettings } from '../../lib/chart-types';
import { buildStressScenarios } from './chart-stress-data';
import styles from './chart-stress-browser.module.css';

const buildStart = performance.now();
const scenarios = buildStressScenarios();
const preparationMs = performance.now() - buildStart;
const modules = [...new Map(scenarios.map(item => [item.module.id, item.module])).values()];
const initial: ChartWorkspaceSettings = { ...defaultChartSettings(), theme: 'teal', figures: Object.fromEntries(scenarios.map(item => [item.module.id, { kind: item.kind, style: item.style }])) };
type Measurement = { id: string; kind: string; n: number; ms: number; elements: number; cycle: number };
type Outcome = { status: 'passed' | 'failed'; preparationMs: number; browser: string; measurements: Measurement[]; maxRenderMs: number; p95RenderMs: number; longTasks: number[]; exports: { kind: string; type: string; bytes: number; width?: number; height?: number; sha256: string }[]; checks: Record<string, boolean>; failures: string[]; memory: { before: number | null; after: number | null; explicitGC: false }; objectURLsRemaining: number; caveats: string[] };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function waitUntil(check: () => boolean, label: string, timeout = 15000) {
  const start = performance.now();
  while (!check()) { if (performance.now() - start > timeout) throw Error(`${label} 超过 ${timeout}ms`); await frame(); }
}
const heap = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
const hash = async (blob: Blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');

function Lab() {
  const [settings, setSettings] = useState(initial);
  const [activeId, setActiveId] = useState(scenarios[0].module.id);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [studio, setStudio] = useState(true);
  const [visible, setVisible] = useState(true);
  const [renderTitle, setRenderTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('复杂场景已准备：使用现有分析程序计算的合成数据。');
  const [report, setReport] = useState<Outcome | null>(null);
  const benchmark = useRef<HTMLDivElement>(null);
  const preview = useRef<ChartPreviewHandle>(null);
  const scene = scenarios[sceneIndex];

  function select(index: number) {
    const next = scenarios[index]; setSceneIndex(index); setActiveId(next.module.id);
    setSettings(previous => ({ ...previous, figures: { ...previous.figures, [next.module.id]: { kind: next.kind, style: next.style } } }));
  }
  async function run() {
    setBusy(true); setReport(null); setStudio(false); setVisible(true);
    const result: Outcome = { status: 'failed', preparationMs, browser: navigator.userAgent, measurements: [], maxRenderMs: 0, p95RenderMs: 0, longTasks: [], exports: [], checks: {}, failures: [], memory: { before: heap(), after: null, explicitGC: false }, objectURLsRemaining: 0, caveats: ['Only supported 5,000-row/20×20/30-item synthetic boundary cases.', 'Browser heap readings have no forced GC; they are observations, not proof of no leaks.', 'Rendering time measures requested state update to actual ready SVG/table, including React scheduling and excluding fixture computation.', 'Measurements apply to this browser and computer.'] };
    const ownedURLs = new Set<string>(), urlBlobs = new Map<string, Blob>(), captures: Blob[] = [];
    const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL, click = HTMLAnchorElement.prototype.click, toBlob = HTMLCanvasElement.prototype.toBlob;
    URL.createObjectURL = (blob: Blob | MediaSource) => { const url = createURL.call(URL, blob); ownedURLs.add(url); if (blob instanceof Blob) urlBlobs.set(url, blob); return url; };
    URL.revokeObjectURL = (url: string) => { ownedURLs.delete(url); urlBlobs.delete(url); revokeURL.call(URL, url); };
    HTMLAnchorElement.prototype.click = function () { const blob = this.download && urlBlobs.get(this.href); if (blob) captures.push(blob); else click.call(this); };
    const browserError = (event: ErrorEvent) => result.failures.push(event.message);
    const rejection = (event: PromiseRejectionEvent) => result.failures.push(String(event.reason));
    window.addEventListener('error', browserError); window.addEventListener('unhandledrejection', rejection);
    let observer: PerformanceObserver | null = null;
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) { observer = new PerformanceObserver(list => result.longTasks.push(...list.getEntries().map(item => item.duration))); observer.observe({ type: 'longtask', buffered: false }); }
    const show = async (index: number, cycle: number) => {
      const next = scenarios[index], title = `${next.style.title} · 压测 ${cycle}`;
      const start = performance.now(); setVisible(true); setSceneIndex(index); setRenderTitle(title);
      await waitUntil(() => {
        const area = benchmark.current;
        if (!area || area.dataset.scene !== `${index}:${title}`) return false;
        const ready = area.querySelector('[data-chart-ready="true"]');
        if (!ready || ready.getAttribute('data-chart-kind') !== next.kind) return false;
        if (next.kind === 'table') return ready.querySelector('h3')?.textContent === title && !!ready.querySelector('table');
        return !!ready.querySelector('svg') && ready.getAttribute('aria-label')?.startsWith(`${title}，`) === true;
      }, `绘制 ${next.kind}`);
      await frame();
      const drawn = benchmark.current!.querySelector('[data-chart-ready="true"]')!;
      if (drawn.querySelector('[role="alert"]') || benchmark.current!.querySelector('[role="alert"]')) throw Error(`绘制失败 ${next.kind}`);
      if (next.kind !== 'table' && drawn.querySelectorAll('svg').length !== 1) throw Error('绘制实例没有保持单一 SVG');
      const text = drawn.textContent ?? '';
      if (!text.includes(`n = ${next.module.snapshot!.n}`)) throw Error('图中样本数丢失');
      result.measurements.push({ id: next.id, kind: next.kind, n: next.module.snapshot!.n, ms: performance.now() - start, elements: drawn.querySelectorAll('*').length, cycle });
    };
    try {
      for (let i = 0; i < 60; i++) { setStatus(`连续重绘 ${i + 1} / 60 · ${scenarios[i % scenarios.length].title}`); await show(i % scenarios.length, i); }
      result.checks.sixtyCommittedRenders = result.measurements.length === 60;
      // A frame between changes forces React commits; this exercises cleanup under fast changes.
      for (let i = 0; i < 36; i++) { const index = i % scenarios.length; setSceneIndex(index); setRenderTitle(`快速切换 ${i}`); await waitUntil(() => benchmark.current?.dataset.scene === `${index}:快速切换 ${i}`, '快速切换提交'); }
      await show(0, 100); result.checks.rapidSwitchFinalBinding = true;
      for (const index of [scenarios.findIndex(item => item.kind === 'group_raincloud'), scenarios.findIndex(item => item.kind === 'heatmap')].filter(index => index >= 0)) {
        await show(index, 200 + index);
        for (const format of ['svg', 'png'] as const) {
          const before = captures.length; await preview.current!.exportImage(format);
          if (captures.length !== before + 1) throw Error('当前导出未生成唯一文件');
          const blob = captures[captures.length - 1];
          const record: Outcome['exports'][number] = { kind: scenarios[index].kind, type: format, bytes: blob.size, sha256: await hash(blob) };
          if (format === 'svg') { const parsed = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml'); if (parsed.querySelector('parsererror')) throw Error('SVG XML 解析失败'); if (!parsed.documentElement.textContent?.includes(`n = ${scenarios[index].module.snapshot!.n}`)) throw Error('SVG 丢失样本数'); }
          else { const bitmap = await createImageBitmap(blob); record.width = bitmap.width; record.height = bitmap.height; bitmap.close(); if (record.width !== scenarios[index].style.width || record.height !== scenarios[index].style.height) throw Error('PNG 尺寸与当前格式不符'); }
          result.exports.push(record);
        }
      }
      result.checks.denseSVGAndPNG = result.exports.length === 4;
      async function cancelledExport(unmount: boolean) {
        const gate: { release?: () => void; released: boolean } = { released: false };
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) { toBlob.call(this, blob => { gate.release = () => { if (!gate.released) { gate.released = true; callback(blob); } }; }, type, quality); };
        const before = captures.length;
        const pending = preview.current!.exportImage('png').then(() => ({ rejected: false, message: '' }), error => ({ rejected: true, message: String(error) }));
        try {
          await waitUntil(() => !!gate.release, '截住已编码的 PNG 回调');
          if (unmount) { setVisible(false); await waitUntil(() => !benchmark.current?.querySelector('[data-chart-kind]'), '卸载绘图'); }
          else { await show(1 % scenarios.length, 501); await show(0, 500); }
          gate.release!();
          const outcome = await pending;
          if (!outcome.rejected || captures.length !== before || !outcome.message.includes('变化')) throw Error('过期编码产生了下载');
          return true;
        } finally { gate.release?.(); HTMLCanvasElement.prototype.toBlob = toBlob; }
      }
      await show(0, 500); result.checks.delayedABAExportRejected = await cancelledExport(false);
      await show(0, 510); result.checks.unmountedExportRejected = await cancelledExport(true);
      await show(0, 600); result.checks.recoveredAfterCancellation = true;
      await waitUntil(() => ownedURLs.size === 0, '导出 URL 回收', 4000);
      result.objectURLsRemaining = ownedURLs.size;
      result.checks.objectURLsReclaimed = ownedURLs.size === 0;
      result.status = result.failures.length || Object.values(result.checks).some(value => !value) ? 'failed' : 'passed';
    } catch (error) { result.failures.push(error instanceof Error ? error.message : String(error)); }
    finally {
      result.longTasks.push(...(observer?.takeRecords().map(item => item.duration) ?? [])); observer?.disconnect();
      URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; HTMLAnchorElement.prototype.click = click; HTMLCanvasElement.prototype.toBlob = toBlob;
      window.removeEventListener('error', browserError); window.removeEventListener('unhandledrejection', rejection);
      for (const url of ownedURLs) revokeURL.call(URL, url);
      result.memory.after = heap();
      const times = result.measurements.map(item => item.ms).sort((a, b) => a - b);
      result.maxRenderMs = times.at(-1) ?? 0; result.p95RenderMs = times[Math.max(0, Math.ceil(times.length * .95) - 1)] ?? 0;
      setReport(result); setBusy(false); setStatus(result.status === 'passed' ? `压力运行通过 · ${result.measurements.length} 次已确认绘制 · 4 份复杂图编码 · 两项晚到导出取消` : `压力运行发现问题：${result.failures.join('；')}`);
    }
  }
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '复杂图表浏览器压力记录.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><small>EVI-X / CHART VALIDATION</small><h1>复杂图表压力验收</h1><p>5,000 行合成数据 · 20 组分布 · 20×20 交叉矩阵 · 50 类别 · 30 题项</p></div><a href="http://127.0.0.1:3180/workspace#analysis">返回研究工作台</a></header>
    <div className={styles.tools}><label>复杂场景 <select aria-label="复杂场景" value={sceneIndex} disabled={busy} onChange={event => select(Number(event.target.value))}>{scenarios.map((item, index) => <option key={item.id} value={index}>{item.title}</option>)}</select></label><button type="button" disabled={busy} onClick={() => void run()}>运行连续压力测试</button><button type="button" disabled={busy} onClick={() => { setStudio(true); setVisible(true); select(sceneIndex); }}>回到图表工作室</button><button type="button" disabled={!report || busy} onClick={downloadReport}>下载压力记录</button></div>
    <div className={styles.status} role="status">{status}</div>
    {studio ? <ChartStudio modules={modules} settings={settings} onChange={setSettings} activeId={activeId} onSelect={setActiveId} onBack={() => setStatus('图表状态保留，可继续选择复杂场景。')}/>
      : <div ref={benchmark} className={styles.bench} data-scene={`${sceneIndex}:${renderTitle}`}>{visible && <ChartPreview ref={preview} snapshot={scene.module.snapshot!} kind={scene.kind} style={{ ...scene.style, title: renderTitle }} theme="teal"/>}</div>}
    {report && <details className={styles.report} open><summary>本次测量结果 · {report.status} · 最慢 {report.maxRenderMs.toFixed(1)} ms / P95 {report.p95RenderMs.toFixed(1)} ms</summary><pre id="pressure-report">{JSON.stringify(report, null, 2)}</pre></details>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Lab/>);
