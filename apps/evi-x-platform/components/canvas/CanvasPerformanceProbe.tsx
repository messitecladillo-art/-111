'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

type Sample = { frames: number[]; latency: number[]; moves: number; gestures: number; cancelled: number; longTasks: number; started: number; heapStart: number | null; heapEnd: number | null };
const heap = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
const quantile = (xs: number[], q: number) => xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * q) - 1)] : null;
const ms = (n: number | null) => n === null ? '—' : `${n.toFixed(1)} ms`;

/** Explicit development-only observation of real input. Never drives or fabricates a gesture. */
export default function CanvasPerformanceProbe({ hostRef, nodes, edges }: { hostRef: RefObject<HTMLDivElement | null>; nodes: number; edges: number }) {
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<Sample | null>(null);
  const samples = useRef<Sample | null>(null);
  useEffect(() => {
    if (!recording) return;
    const host = hostRef.current;
    if (!host) return;
    const s: Sample = { frames: [], latency: [], moves: 0, gestures: 0, cancelled: 0, longTasks: 0, started: performance.now(), heapStart: heap(), heapEnd: null };
    samples.current = s;
    let dragging = false, frame = 0, nextFrame = 0, last = 0;
    const tick = (now: number) => { if (!dragging) return; if (last) s.frames.push(now - last); last = now; frame = requestAnimationFrame(tick); };
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.react-flow__node') || e.target.closest('button,input,textarea,select,.react-flow__handle') || e.button !== 0) return;
      dragging = true; s.gestures++; last = 0; cancelAnimationFrame(frame); frame = requestAnimationFrame(tick);
    };
    const move = () => {
      if (!dragging) return;
      s.moves++;
      if (nextFrame) return;
      const at = performance.now();
      nextFrame = requestAnimationFrame(() => { s.latency.push(performance.now() - at); nextFrame = 0; });
    };
    const stop = (e: Event) => { if (dragging && e.type !== 'pointerup') s.cancelled++; dragging = false; last = 0; cancelAnimationFrame(frame); };
    const visibility = () => { if (document.hidden) stop(new Event('visibilitychange')); };
    const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver(list => { s.longTasks += list.getEntries().length; });
    try { observer?.observe({ type: 'longtask', buffered: false }); } catch { /* Optional Chromium diagnostic only. */ }
    host.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      dragging = false; cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); observer?.disconnect();
      host.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', stop, true); window.removeEventListener('pointercancel', stop, true); window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility); s.heapEnd = heap();
    };
  }, [recording, hostRef]);
  return <aside data-canvas-diagnostics aria-label="画布性能记录" style={{ position: 'absolute', left: 20, bottom: 104, zIndex: 20, padding: '10px 14px', background: 'var(--wb-solid)', border: '1px solid var(--wb-line)', borderRadius: 12, fontSize: 12, maxWidth: 360 }}>
    <strong>桌面验收 · {nodes} 节点 / {edges} 连线</strong>
    <div><button type="button" onClick={() => { if (recording) { const s = samples.current; if (s) setResult({ ...s, frames: [...s.frames], latency: [...s.latency], heapEnd: heap() }); } else setResult(null); setRecording(!recording); }}>{recording ? '结束性能记录' : '开始性能记录'}</button></div>
    {result && <output style={{ display: 'block', whiteSpace: 'pre-line', marginTop: 6 }}>{`真实手势 ${result.gestures} · 移动事件 ${result.moves} · 帧样本 ${result.frames.length}\n帧中位 ${ms(quantile(result.frames, .5))} · P95 ${ms(quantile(result.frames, .95))} · 最长 ${ms(quantile(result.frames, 1))}\n输入处理→下一 RAF P95 ${ms(quantile(result.latency, .95))} · 样本 ${result.latency.length}\n长任务 ${result.longTasks} · 取消 ${result.cancelled}\nJS 堆 ${result.heapStart === null ? '不可用' : `${(result.heapStart / 1048576).toFixed(1)} → ${((result.heapEnd ?? result.heapStart) / 1048576).toFixed(1)} MiB`}`}</output>}
  </aside>;
}
