"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ARENA, DEFAULT_PULL, INITIAL_X, LANE_Y, constrainPull, createFlight, flightPath, sampleFlight, type Flight, type Point } from "@/lib/evidence-flight";
import styles from "./EvidenceFlight.module.css";

const STAGES = [
  { code: "Q", name: "问题", detail: "从一个真实问题出发" },
  { code: "D", name: "数据", detail: "让每一份证据有来源" },
  { code: "I", name: "洞察", detail: "把线索连成可靠判断" },
  { code: "A", name: "行动", detail: "让洞察落到下一步" },
];
type Phase = "idle" | "aiming" | "flying" | "landed" | "complete";
type MotionFrame = { flight: Flight; fraction: number };

export default function EvidenceFlight() {
  const [active, setActive] = useState(0);
  const [positions, setPositions] = useState<number[]>([...INITIAL_X]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState<Point | null>(null);
  const [frame, setFrame] = useState<MotionFrame | null>(null);
  const [impact, setImpact] = useState<Point | null>(null);
  const [automatic, setAutomatic] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [message, setMessage] = useState("拖住发光圆点，向后蓄力，松手发射。");
  const arenaRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epochRef = useRef(0);
  const activeRef = useRef(0);
  const positionsRef = useRef<number[]>([...INITIAL_X]);
  const phaseRef = useRef<Phase>("idle");
  const automaticRef = useRef(false);
  const reducedRef = useRef(false);
  const pullRef = useRef<Point | null>(null);
  const dragRef = useRef<{ id: number; element: HTMLButtonElement; start: Point; origin: Point } | null>(null);

  const updatePhase = useCallback((value: Phase) => {
    phaseRef.current = value;
    setPhase(value);
  }, []);

  const cancelMotion = useCallback(() => {
    epochRef.current += 1;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.element.hasPointerCapture(drag.id)) drag.element.releasePointerCapture(drag.id);
    automaticRef.current = false;
    pullRef.current = null;
  }, []);

  const stop = useCallback((text: string) => {
    cancelMotion();
    setAutomatic(false);
    setFrame(null);
    setPull(null);
    setImpact(null);
    updatePhase(activeRef.current === 3 ? "complete" : "idle");
    setMessage(text);
  }, [cancelMotion, updatePhase]);

  const reset = useCallback(() => {
    cancelMotion();
    activeRef.current = 0;
    positionsRef.current = [...INITIAL_X];
    setActive(0);
    setPositions([...INITIAL_X]);
    setPull(null);
    setFrame(null);
    setImpact(null);
    setAutomatic(false);
    updatePhase("idle");
    setMessage("已重置。从问题节点，再走一程。");
  }, [cancelMotion, updatePhase]);

  const launch = useCallback(function fly(aim: Point, runAll: boolean) {
    const index = activeRef.current;
    if (index >= 3 || phaseRef.current === "flying" || phaseRef.current === "landed") return;
    const origin = { x: positionsRef.current[index], y: LANE_Y[index] };
    const flight = createFlight(origin, LANE_Y[index + 1], aim);
    const epoch = epochRef.current;
    pullRef.current = null;
    setPull(null);
    setImpact(null);
    automaticRef.current = runAll;
    setAutomatic(runAll);
    updatePhase("flying");
    setMessage(`正在连接${STAGES[index].name}与${STAGES[index + 1].name}。`);

    const land = () => {
      if (epoch !== epochRef.current) return;
      rafRef.current = null;
      const next = index + 1;
      positionsRef.current = positionsRef.current.map((x, i) => i === next ? flight.end.x : x);
      activeRef.current = next;
      setPositions([...positionsRef.current]);
      setActive(next);
      setFrame(null);
      setImpact(reducedRef.current ? null : flight.end);
      updatePhase(next === 3 ? "complete" : "landed");
      setMessage(next === 3 ? "问题 → 数据 → 洞察 → 行动，一条证据链已点亮。" : `${STAGES[next].name}已点亮。${STAGES[next].detail}。`);
      if (next === 3) {
        automaticRef.current = false;
        setAutomatic(false);
      }
      timerRef.current = setTimeout(() => {
        if (epoch !== epochRef.current) return;
        timerRef.current = null;
        setImpact(null);
        if (next === 3) return;
        updatePhase("idle");
        if (runAll && automaticRef.current) fly({ x: next === 1 ? 42 : -42, y: 40 }, true);
      }, reducedRef.current ? 320 : 420);
    };

    if (reducedRef.current) {
      land();
      return;
    }
    let started: number | null = null;
    const tick = (now: number) => {
      if (epoch !== epochRef.current) return;
      if (started === null) started = now;
      const fraction = Math.min(1, (now - started) / (flight.duration * 1000));
      if (fraction >= 1) land();
      else {
        setFrame({ flight, fraction });
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    setFrame({ flight, fraction: 0 });
    rafRef.current = requestAnimationFrame(tick);
  }, [updatePhase]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setPreference = () => {
      reducedRef.current = media.matches;
      setReducedMotion(media.matches);
      if (phaseRef.current === "flying" || phaseRef.current === "aiming" || automaticRef.current) {
        stop("动效偏好已更新，可以继续连接节点。");
      }
    };
    setPreference();
    media.addEventListener("change", setPreference);
    const hidden = () => { if (document.hidden) stop("演示已暂停。回到页面后可继续发射。"); };
    const blur = () => {
      if (dragRef.current) stop("已取消蓄力，可重新拖动圆点。");
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    return () => {
      cancelMotion();
      media.removeEventListener("change", setPreference);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
    };
  }, [cancelMotion, stop]);

  const pointerPoint = (event: PointerEvent<HTMLButtonElement>): Point => {
    const rect = arenaRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * ARENA.width, y: (event.clientY - rect.top) / rect.height * ARENA.height };
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || activeRef.current >= 3 || automaticRef.current || phaseRef.current !== "idle") return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const origin = { x: positionsRef.current[activeRef.current], y: LANE_Y[activeRef.current] };
    dragRef.current = { id: event.pointerId, element: event.currentTarget, start: pointerPoint(event), origin };
    event.currentTarget.setPointerCapture(event.pointerId);
    pullRef.current = { x: 0, y: 0 };
    setPull(pullRef.current);
    updatePhase("aiming");
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const point = pointerPoint(event);
    pullRef.current = constrainPull(drag.origin, { x: point.x - drag.start.x, y: point.y - drag.start.y });
    setPull(pullRef.current);
  };

  const releaseDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    moveDrag(event);
    const aim = pullRef.current ?? DEFAULT_PULL;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    launch(Math.hypot(aim.x, aim.y) < 5 ? DEFAULT_PULL : aim, false);
  };

  const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.id === event.pointerId) stop("已取消蓄力，可重新拖动圆点。");
  };

  const keyAim = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stop("已取消蓄力。");
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || automaticRef.current || (phaseRef.current !== "idle" && phaseRef.current !== "aiming")) return;
    event.preventDefault();
    const aim = pullRef.current ?? DEFAULT_PULL;
    const next = { x: aim.x + (event.key === "ArrowLeft" ? -8 : event.key === "ArrowRight" ? 8 : 0), y: aim.y + (event.key === "ArrowUp" ? -8 : event.key === "ArrowDown" ? 8 : 0) };
    pullRef.current = constrainPull({ x: positionsRef.current[activeRef.current], y: LANE_Y[activeRef.current] }, next);
    setPull(pullRef.current);
    updatePhase("aiming");
  };

  const play = () => {
    if (automaticRef.current) { stop("演示已暂停，可手动继续。"); return; }
    reset();
    launch(DEFAULT_PULL, true);
  };
  const origin = { x: positions[active], y: LANE_Y[active] };
  const preview = pull && active < 3 ? createFlight(origin, LANE_Y[active + 1], pull) : null;
  const point = frame ? sampleFlight(frame.flight, frame.fraction) : null;
  const complete = active === 3;
  const busy = phase === "flying" || phase === "landed" || automatic;
  const power = pull ? Math.min(100, Math.hypot(pull.x, pull.y) / 80 * 100) : 0;

  return (
    <section className={`${styles.panel} ${complete ? styles.completed : ""}`} aria-labelledby="evidence-flight-title" data-testid="evidence-flight" data-phase={phase} data-stage={STAGES[active].code}>
      <div className={styles.topline}><span className={styles.wordmark}>Evidence playground</span><span className={styles.badge}>互动演示</span></div>
      <h2 className={styles.heading} id="evidence-flight-title">让证据，走完最后一程。</h2>
      <p className={styles.subtitle}>一次轻轻的拖动，连接问题与行动。</p>
      <div className={styles.stageStrip} aria-label="演示节点">
        {STAGES.map((stage, i) => <span key={stage.code} className={`${styles.stageChip} ${i === active ? styles.stageCurrent : ""} ${i < active ? styles.stageDone : ""}`} aria-current={i === active ? "step" : undefined}>{stage.code}<span>{stage.name}</span></span>)}
      </div>
      <div className={styles.arena} ref={arenaRef}>
        <svg className={styles.drawing} viewBox={`0 0 ${ARENA.width} ${ARENA.height}`} aria-hidden="true">
          {STAGES.map((stage, i) => <g key={stage.code}>
            <text x="28" y={LANE_Y[i] + 5} className={styles.railCode}>{stage.code}</text>
            <text x={ARENA.left} y={LANE_Y[i] - 20} className={styles.railLabel}>{stage.detail}</text>
            <text x={ARENA.right} y={LANE_Y[i] - 20} textAnchor="end" className={styles.railMeta}>0{i + 1}</text>
            <path d={`M ${ARENA.left} ${LANE_Y[i]} H ${ARENA.right}`} className={styles.rail} />
            <path d={`M ${ARENA.left} ${LANE_Y[i]} H ${positions[i]}`} className={styles.railFill} opacity={i <= active ? 1 : 0.18} />
            {[0, 1, 2, 3, 4].map(tick => <path key={tick} d={`M ${ARENA.left + tick * (ARENA.right - ARENA.left) / 4} ${LANE_Y[i] + 8} v 3`} className={styles.rail} />)}
          </g>)}
          {preview && <g>
            <path d={`M ${origin.x - 6} ${origin.y} L ${preview.start.x} ${preview.start.y} L ${origin.x + 6} ${origin.y}`} className={styles.tether} />
            <path d={flightPath(preview)} className={styles.aimPath} />
            <circle cx={preview.end.x} cy={preview.end.y} r="12" className={styles.targetRing} />
            <circle cx={preview.end.x} cy={preview.end.y} r="3" className={styles.targetPoint} />
          </g>}
          {frame && point && <g>
            {Array.from({ length: 9 }, (_, i) => {
              const dot = sampleFlight(frame.flight, Math.max(0, frame.fraction - (i + 1) * 0.026));
              return <circle key={i} cx={dot.x} cy={dot.y} r={3 - i * 0.23} opacity={(1 - i / 10) * 0.55} className={styles.trail} />;
            })}
            <circle cx={point.x} cy={point.y} r="6" className={styles.projectile} />
          </g>}
          {impact && <circle key={`${active}-${positions[active]}`} cx={impact.x} cy={impact.y} r="17" className={styles.impact} />}
        </svg>
        {STAGES.map((stage, i) => {
          const isActive = i === active && !complete;
          const location = isActive && pull ? { x: positions[i] + pull.x, y: LANE_Y[i] + pull.y } : { x: positions[i], y: LANE_Y[i] };
          return <button key={stage.code} type="button" className={`${styles.handle} ${isActive ? styles.handleActive : i <= active ? styles.handleVisited : styles.handleDormant} ${isActive && pull ? styles.handleDragging : ""}`} style={{ left: `${location.x / ARENA.width * 100}%`, top: `${location.y / ARENA.height * 100}%`, visibility: isActive && phase === "flying" ? "hidden" : undefined }} disabled={!isActive || busy} aria-label={`${stage.name}节点：拖动蓄力或按回车发射`} aria-describedby="flight-keyboard-help" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={releaseDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onKeyDown={keyAim} onClick={event => { if (event.detail === 0 && !busy) launch(pullRef.current ?? DEFAULT_PULL, false); }}><span className={styles.handleDot} /></button>;
        })}
      </div>
      <div className={styles.powerTrack} aria-hidden="true"><span className={styles.powerFill} style={{ width: `${power}%` }} /></div>
      <p className={styles.statusLine} role="status" aria-live="polite"><span className={styles.statusDot} aria-hidden="true" />{message}</p>
      <div className={styles.controls}>
        <button className={styles.primary} type="button" disabled={busy || complete} onClick={() => launch(pullRef.current ?? DEFAULT_PULL, false)}>{complete ? "证据链已点亮" : `发射到${STAGES[Math.min(active + 1, 3)].name}`}<span aria-hidden="true"> ↗</span></button>
        <button className={styles.secondary} type="button" onClick={play}>{automatic ? "暂停演示" : "一键演示"}</button>
        <button className={styles.secondary} type="button" onClick={reset}>重置</button>
      </div>
      <p className={styles.keyboardHint} id="flight-keyboard-help">{reducedMotion ? "已遵循减少动态效果设置，节点直接点亮。" : "也可点击发射 · 方向键调整 · Enter 发射 · Esc 取消蓄力"}</p>
      <p className={styles.note}>仅为交互演示，不代表真实项目进度。</p>
    </section>
  );
}
