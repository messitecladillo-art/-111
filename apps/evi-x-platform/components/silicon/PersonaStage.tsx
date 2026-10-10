'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE_PALETTE, HAIR_TONES, SILICON_LIMITS, type AccessoryKind, type Appearance, type HatKind } from '@/lib/silicon/persona';
import { stageLayout } from '@/lib/silicon/stage-layout';
import styles from './SiliconLab.module.css';

export type FigureActivity = 'idle' | 'queued' | 'thinking' | 'done' | 'flagged' | 'failed';
export type StageFigure = { id: string; code: string; appearance: Appearance; group: string; halo: string | null; activity: FigureActivity };
export type StageTip = { title: string; meta: string; lines: string[]; flag?: string };
type Props = {
  figures: StageFigure[];
  groups: ReadonlyArray<{ key: string; label: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  describe: (id: string) => StageTip | null;
  reducedMotion: boolean;
  onFallback: () => void;
  label: string;
  /** Stacked theatre: the title sits above the canvas, so the picture is centred instead of pushed down. */
  stacked?: boolean;
};

const MAX = SILICON_LIMITS.personas;
const FOV = 30;
const MOVE_MS = 950;
const TARGET_Y = 0.48;
const HATS: Exclude<HatKind, 'none'>[] = ['cap', 'beret', 'hardhat', 'bucket', 'top'];
const ACCESSORIES: Exclude<AccessoryKind, 'none'>[] = ['glasses', 'scarf', 'backpack', 'satchel'];

type FigureState = {
  id: string; from: THREE.Vector2; to: THREE.Vector2; pos: THREE.Vector2; start: number; spawn: number;
  yaw: number; phase: number; pop: number; activity: FigureActivity; figure: StageFigure;
};

/* ───────────── geometry, built once per stage ───────────── */

function at(geometry: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return geometry.applyMatrix4(m);
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map(p => { const g = p.index ? p.toNonIndexed() : p; g.deleteAttribute('uv'); return g; });
  return mergeGeometries(clean, false)!;
}

function buildGeometries() {
  const body = new THREE.LatheGeometry([
    [0, 0.02], [0.165, 0.025], [0.185, 0.07], [0.17, 0.16], [0.145, 0.32], [0.128, 0.46], [0.118, 0.53], [0.085, 0.585], [0.03, 0.605], [0, 0.61],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const arms = merge([
    at(new THREE.CapsuleGeometry(0.038, 0.2, 4, 10), -0.158, 0.4, 0.01, 0, 0, 0.2),
    at(new THREE.CapsuleGeometry(0.038, 0.2, 4, 10), 0.158, 0.4, 0.01, 0, 0, -0.2),
  ]);
  const head = at(new THREE.IcosahedronGeometry(0.16, 1), 0, 0.78, 0);
  const eyes = merge([
    at(new THREE.SphereGeometry(0.022, 10, 8), -0.055, 0.79, 0.142),
    at(new THREE.SphereGeometry(0.022, 10, 8), 0.055, 0.79, 0.142),
  ]);
  const hair = at(new THREE.SphereGeometry(0.168, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), 0, 0.8, -0.012, -0.32, 0, 0, 1, 0.92, 1.04);
  const hats: Record<Exclude<HatKind, 'none'>, THREE.BufferGeometry> = {
    cap: merge([
      at(new THREE.SphereGeometry(0.172, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.84, 0),
      at(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 20, 1, false, -Math.PI / 2, Math.PI), 0, 0.85, 0.1, 0, 0, 0, 1, 1, 1.2),
    ]),
    beret: at(new THREE.SphereGeometry(0.19, 20, 10), 0.02, 0.92, -0.01, 0.15, 0, -0.18, 1, 0.34, 1),
    hardhat: merge([
      at(new THREE.SphereGeometry(0.18, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.85, 0),
      at(new THREE.CylinderGeometry(0.225, 0.225, 0.016, 28), 0, 0.855, 0.012),
      at(new THREE.BoxGeometry(0.03, 0.03, 0.34), 0, 1.0, 0),
    ]),
    bucket: merge([
      at(new THREE.CylinderGeometry(0.135, 0.165, 0.12, 22), 0, 0.92, 0),
      at(new THREE.CylinderGeometry(0.165, 0.235, 0.04, 22, 1, true), 0, 0.85, 0),
    ]),
    top: merge([
      at(new THREE.CylinderGeometry(0.115, 0.12, 0.24, 22), 0, 1.0, 0),
      at(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 26), 0, 0.885, 0),
    ]),
  };
  const accessories: Record<Exclude<AccessoryKind, 'none'>, THREE.BufferGeometry> = {
    glasses: merge([
      at(new THREE.TorusGeometry(0.042, 0.009, 6, 18), -0.058, 0.79, 0.15),
      at(new THREE.TorusGeometry(0.042, 0.009, 6, 18), 0.058, 0.79, 0.15),
      at(new THREE.BoxGeometry(0.03, 0.008, 0.008), 0, 0.795, 0.155),
    ]),
    scarf: merge([
      at(new THREE.TorusGeometry(0.1, 0.034, 8, 24), 0, 0.6, 0, Math.PI / 2 - 0.1),
      at(new THREE.BoxGeometry(0.06, 0.16, 0.03), 0.06, 0.5, 0.11, 0.1, 0, 0.12),
    ]),
    backpack: merge([
      at(new THREE.BoxGeometry(0.22, 0.24, 0.1), 0, 0.38, -0.155),
      at(new THREE.BoxGeometry(0.16, 0.09, 0.04), 0, 0.31, -0.215),
    ]),
    satchel: merge([
      at(new THREE.BoxGeometry(0.15, 0.12, 0.055), 0.17, 0.28, 0.05, 0, 0.3, 0),
      at(new THREE.TorusGeometry(0.2, 0.01, 4, 40, Math.PI * 0.95), 0, 0.42, 0.02, 0, 0, Math.PI * 0.62, 1, 1.15, 0.9),
    ]),
  };
  const orbit = merge([0, 1, 2].map(i => at(new THREE.SphereGeometry(0.026, 8, 6), Math.cos(i * 2.094) * 0.24, 1.04 + (i - 1) * 0.02, Math.sin(i * 2.094) * 0.24)));
  const flag = at(new THREE.OctahedronGeometry(0.06, 0), 0, 1.1, 0, 0, 0, 0, 0.8, 1.4, 0.8);
  const halo = at(new THREE.CircleGeometry(0.52, 40), 0, 0.004, 0, -Math.PI / 2);
  const plinth = at(new THREE.CylinderGeometry(0.24, 0.26, 0.022, 6), 0, 0.006, 0);
  return { body, arms, head, eyes, hair, hats, accessories, orbit, flag, halo, plinth };
}

function radialTexture(stops: Array<[number, string]>, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const backOut = (t: number) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const angleLerp = (a: number, b: number, k: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

/** Interactive 3D stage: one instanced draw per body part, so 120 figures cost the same as one. */
export default function PersonaStage({ figures, groups, selectedId, onSelect, describe, reducedMotion, onFallback, label, stacked = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ label: (text: string) => void; stacked: (on: boolean) => void; sync: (figures: StageFigure[], groups: ReadonlyArray<{ key: string; label: string }>) => void; select: (id: string | null) => void; motion: (reduced: boolean) => void; zoom: (factor: number) => void; reset: () => void; spin: (on: boolean) => void } | null>(null);
  const callbacks = useRef({ onSelect, describe, onFallback });
  const [hover, setHover] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  useEffect(() => { callbacks.current = { onSelect, describe, onFallback }; });

  useEffect(() => {
    const host = hostRef.current, labelHost = labelsRef.current;
    if (!host) return;
    // Probe first so a browser without WebGL falls back quietly instead of logging renderer errors.
    const probe = document.createElement('canvas');
    const probeContext = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!probeContext) { callbacks.current.onFallback(); return; }
    probeContext.getExtension('WEBGL_lose_context')?.loseContext();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      callbacks.current.onFallback();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = styles.stageCanvas;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', label);
    host.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07111c, 16, 46);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
    scene.add(new THREE.HemisphereLight(0xd8ecff, 0x20160a, 1.05));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.1); key.position.set(4, 9, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0x4fd1c1, 1.4); rim.position.set(-7, 4, -8); scene.add(rim);
    const warm = new THREE.PointLight(0xf4b942, 6, 16, 1.6); warm.position.set(0, 0.6, 3.5); scene.add(warm);

    const disposables: Array<{ dispose: () => void }> = [];
    const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

    // Ground: a soft pool of light, engraved survey rings and a faint dust of points.
    const floorTex = keep(radialTexture([[0, 'rgba(38,74,96,0.95)'], [0.35, 'rgba(17,40,58,0.85)'], [0.7, 'rgba(9,22,34,0.55)'], [1, 'rgba(7,17,28,0)']]));
    const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(30, 72)), keep(new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false })));
    floor.rotation.x = -Math.PI / 2; floor.renderOrder = -2; scene.add(floor);
    const ringMat = keep(new THREE.LineBasicMaterial({ color: 0xf4b942, transparent: true, opacity: 0.16 }));
    for (const r of [3, 6, 10, 15, 21]) {
      const pts = Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2) * r, 0.004, Math.sin(i / 128 * Math.PI * 2) * r));
      const line = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(pts)), ringMat);
      scene.add(line);
    }
    const tickGeo = keep(new THREE.BufferGeometry());
    const ticks: number[] = [];
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, r0 = i % 6 ? 10.25 : 9.9, r1 = 10.55; ticks.push(Math.cos(a) * r0, 0.004, Math.sin(a) * r0, Math.cos(a) * r1, 0.004, Math.sin(a) * r1); }
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
    scene.add(new THREE.LineSegments(tickGeo, keep(new THREE.LineBasicMaterial({ color: 0x4fd1c1, transparent: true, opacity: 0.22 }))));

    const dustCount = 260, dustPos = new Float32Array(dustCount * 3), dustSeed = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.sqrt(Math.random()) * 16;
      dustPos.set([Math.cos(a) * r, Math.random() * 6, Math.sin(a) * r], i * 3); dustSeed[i] = Math.random();
    }
    const dustGeo = keep(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({ color: 0xffe3a6, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
    scene.add(dust);

    // Figures: every part is an InstancedMesh sharing the same per-figure transform.
    const geo = buildGeometries();
    const matte = (opts: THREE.MeshStandardMaterialParameters = {}) => keep(new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.08, ...opts }));
    const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      keep(geometry);
      const mesh = new THREE.InstancedMesh(geometry, material, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.setColorAt(0, new THREE.Color());
      scene.add(mesh); return mesh;
    };
    const parts = {
      plinth: instanced(geo.plinth, matte({ color: 0x15283a, roughness: 0.35, metalness: 0.5 })),
      // A pool of light under each figure, tinted by its answer when the stage groups by a question.
      halo: instanced(geo.halo, keep(new THREE.MeshBasicMaterial({ map: keep(radialTexture([[0, 'rgba(255,255,255,1)'], [0.32, 'rgba(255,255,255,0.55)'], [0.7, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']], 128)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))),
      body: instanced(geo.body, matte()),
      arms: instanced(geo.arms, matte()),
      head: instanced(geo.head, matte({ flatShading: true, roughness: 0.2, metalness: 0.15, emissive: 0x0b2a33, emissiveIntensity: 0.6 })),
      eyes: instanced(geo.eyes, keep(new THREE.MeshBasicMaterial())),
      hair: instanced(geo.hair, matte({ roughness: 0.7 })),
      orbit: instanced(geo.orbit, keep(new THREE.MeshBasicMaterial({ color: 0xf4b942 }))),
      flag: instanced(geo.flag, keep(new THREE.MeshBasicMaterial({ color: 0xff8a8e }))),
    };
    parts.halo.renderOrder = 1;
    const hatMeshes = Object.fromEntries(HATS.map(k => [k, instanced(geo.hats[k], matte({ roughness: k === 'hardhat' ? 0.3 : 0.62 }))])) as Record<Exclude<HatKind, 'none'>, THREE.InstancedMesh>;
    const accMeshes = Object.fromEntries(ACCESSORIES.map(k => [k, instanced(geo.accessories[k], matte({ roughness: 0.55 }))])) as Record<Exclude<AccessoryKind, 'none'>, THREE.InstancedMesh>;
    const selection = new THREE.Mesh(keep(new THREE.RingGeometry(0.33, 0.37, 48)), keep(new THREE.MeshBasicMaterial({ color: 0xf4b942, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
    selection.rotation.x = -Math.PI / 2; selection.visible = false; scene.add(selection);

    // Group outlines rebuilt when the grouping changes.
    let groupLines: THREE.Line[] = [];
    const groupMat = keep(new THREE.LineBasicMaterial({ color: 0x4fd1c1, transparent: true, opacity: 0.3 }));
    let groupMeta: Array<{ key: string; label: string; count: number; x: number; z: number; radius: number; cx: number; cz: number; el: HTMLSpanElement }> = [];

    const states = new Map<string, FigureState>();
    let order: FigureState[] = [];
    let lastInput: { figs: StageFigure[]; groupOrder: ReadonlyArray<{ key: string; label: string }> } | null = null;
    let portrait = false, centred = stacked;
    let viewShift = 0, extent = 3, halfW = 2, zNear = 1, zFar = -1, motion = !reducedMotion, spin = false, selected: string | null = null, hovered: string | null = null;
    const view = { azimuth: 0, elevation: 0.5, zoom: 1, targetAz: 0, targetEl: 0.5, targetZoom: 1, focus: new THREE.Vector3(0, TARGET_Y, 0) };

    const tmpColor = new THREE.Color(), white = new THREE.Color(0xffffff), ink = new THREE.Color(0x0a1f33), glow = new THREE.Color(0x7ff5e6);
    const colorFigure = (i: number, f: StageFigure, lift: number) => {
      const base = new THREE.Color(FIGURE_PALETTE[f.appearance.hue % FIGURE_PALETTE.length]);
      parts.body.setColorAt(i, tmpColor.copy(base).lerp(white, lift));
      parts.arms.setColorAt(i, tmpColor.copy(base).multiplyScalar(0.82).lerp(white, lift));
      parts.head.setColorAt(i, tmpColor.copy(base).lerp(white, 0.72 + lift * 0.2));
      parts.hair.setColorAt(i, tmpColor.set(HAIR_TONES[f.appearance.hair % HAIR_TONES.length]));
      parts.plinth.setColorAt(i, tmpColor.set(0x15283a));
      for (const k of HATS) hatMeshes[k].setColorAt(i, tmpColor.set(k === 'hardhat' ? 0xf4b942 : k === 'top' ? 0x151b24 : k === 'beret' ? 0x2b3a55 : k === 'bucket' ? 0xcbbd93 : base.clone().multiplyScalar(0.6).getHex()));
      for (const k of ACCESSORIES) accMeshes[k].setColorAt(i, tmpColor.set(k === 'glasses' ? 0x0a1f33 : k === 'scarf' ? FIGURE_PALETTE[(f.appearance.hue + 3) % FIGURE_PALETTE.length] : k === 'satchel' ? 0x8a5a3c : base.clone().multiplyScalar(0.5).getHex()));
    };
    const markColors = () => {
      for (const mesh of [parts.body, parts.arms, parts.head, parts.hair, parts.plinth, parts.halo, parts.eyes, ...Object.values(hatMeshes), ...Object.values(accMeshes)]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    let lastSig = '';
    // Activity-only updates (the answer reveal ticks ~11×/s) recolour figures without re-laying out the stage.
    const relayout = (figs: StageFigure[], groupOrder: ReadonlyArray<{ key: string; label: string }>, now: number) => {
      lastInput = { figs, groupOrder };
      const sig = `${portrait ? 'p' : 'l'}${groupOrder.map(g => `${g.key}\u0001${g.label}`).join('\u0002')}\u0003${figs.map(f => `${f.id}\u0001${f.group}`).join('\u0002')}`;
      const moved = sig !== lastSig;
      lastSig = sig;
      const layout = moved ? stageLayout(figs.map(f => f.group), groupOrder, { columns: portrait ? 2 : undefined }) : null;
      if (layout) {
        extent = layout.extent;
        halfW = Math.max(1.2, ...layout.slots.map(p => Math.abs(p.x) + 0.45));
        zNear = Math.max(0.6, ...layout.slots.map(p => p.z + 0.45));
        zFar = Math.min(-0.6, ...layout.slots.map(p => p.z - 0.45));
      }
      const seen = new Set<string>();
      order = figs.map((f, i) => {
        seen.add(f.id);
        let s = states.get(f.id);
        const slot = layout?.slots[i] ?? (s ? { x: s.to.x, z: s.to.y } : { x: 0, z: 0 });
        if (!s) {
          s = { id: f.id, from: new THREE.Vector2(slot.x, slot.z), to: new THREE.Vector2(slot.x, slot.z), pos: new THREE.Vector2(slot.x, slot.z), start: now, spawn: now + Math.min(900, i * 9), yaw: 0, phase: Math.random() * Math.PI * 2, pop: 0, activity: f.activity, figure: f };
          states.set(f.id, s);
        } else if (Math.abs(s.to.x - slot.x) > 1e-3 || Math.abs(s.to.y - slot.z) > 1e-3) {
          s.from.copy(s.pos); s.to.set(slot.x, slot.z); s.start = now + Math.min(520, i * 6);
        }
        if (s.activity !== f.activity && (f.activity === 'done' || f.activity === 'flagged')) s.pop = now;
        s.activity = f.activity; s.figure = f;
        return s;
      });
      for (const id of [...states.keys()]) if (!seen.has(id)) states.delete(id);
      order.forEach((s, i) => colorFigure(i, s.figure, s.id === hovered ? 0.22 : 0));
      order.forEach((s, i) => {
        parts.halo.setColorAt(i, tmpColor.set(s.figure.halo ?? '#2a6f7a').multiplyScalar(s.figure.halo ? 1 : 0.32));
        parts.eyes.setColorAt(i, s.figure.activity === 'thinking' ? glow : ink);
      });
      const count = order.length;
      for (const mesh of [parts.plinth, parts.halo, parts.body, parts.arms, parts.head, parts.eyes, parts.hair, parts.orbit, parts.flag, ...Object.values(hatMeshes), ...Object.values(accMeshes)]) mesh.count = count;
      markColors();
      if (hovered && !states.has(hovered)) hovered = null;
      if (!layout) return;

      for (const line of groupLines) { scene.remove(line); line.geometry.dispose(); }
      groupLines = [];
      labelHost?.replaceChildren();
      groupMeta = layout.groups.length > 1 ? layout.groups.map(g => {
        const pts = Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * (g.radius + 0.12), 0.006, Math.sin(i / 96 * Math.PI * 2) * (g.radius + 0.12)));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), groupMat);
        line.position.set(g.x, 0, g.z); scene.add(line); groupLines.push(line);
        const el = document.createElement('span');
        el.className = styles.stageGroupLabel;
        el.style.opacity = '0';
        const name = document.createElement('strong'); name.textContent = g.label;
        const n = document.createElement('small'); n.textContent = `${g.count} 位`;
        el.append(name, n);
        labelHost?.append(el);
        const prev = groupMeta.find(m => m.key === g.key);
        return { ...g, cx: prev?.cx ?? g.x, cz: prev?.cz ?? g.z, el };
      }) : [];
    };

    const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
    let pointerInside = false, pointerDirty = false, drag: { x: number; y: number; az: number; el: number; moved: boolean } | null = null;
    const pick = (): string | null => {
      parts.body.computeBoundingSphere(); parts.head.computeBoundingSphere();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([parts.head, parts.body], false)[0];
      return hit && hit.instanceId !== undefined ? order[hit.instanceId]?.id ?? null : null;
    };
    const setHovered = (id: string | null) => {
      if (id === hovered) return;
      const prev = order.findIndex(s => s.id === hovered);
      if (prev >= 0) colorFigure(prev, order[prev].figure, 0);
      hovered = id;
      const next = order.findIndex(s => s.id === id);
      if (next >= 0) colorFigure(next, order[next].figure, 0.22);
      markColors();
      renderer.domElement.style.cursor = id ? 'pointer' : drag ? 'grabbing' : 'grab';
      setHover(id);
    };
    const toPointer = (event: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      toPointer(event);
      drag = { x: event.clientX, y: event.clientY, az: view.targetAz, el: view.targetEl, moved: false };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      toPointer(event); pointerInside = true; pointerDirty = true;
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; spin = false; setSpinning(false); }
      if (drag.moved) {
        view.targetAz = Math.max(-1.1, Math.min(1.1, drag.az - dx * 0.006));
        view.targetEl = Math.max(0.16, Math.min(1.05, drag.el + dy * 0.004));
        renderer.domElement.style.cursor = 'grabbing';
      }
    };
    const onUp = (event: PointerEvent) => {
      if (!drag) return;
      const clicked = !drag.moved;
      drag = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (clicked) { toPointer(event); callbacks.current.onSelect(pick()); }
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    };
    const onLeave = () => { pointerInside = false; if (!drag) setHovered(null); };
    const onKey = (event: KeyboardEvent) => {
      const k = event.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { view.targetAz = Math.max(-1.1, Math.min(1.1, view.targetAz + (k === 'ArrowLeft' ? 0.12 : -0.12))); event.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') { view.targetEl = Math.max(0.16, Math.min(1.05, view.targetEl + (k === 'ArrowUp' ? 0.08 : -0.08))); event.preventDefault(); }
      else if (k === '+' || k === '=') view.targetZoom = Math.max(0.45, view.targetZoom * 0.85);
      else if (k === '-' || k === '_') view.targetZoom = Math.min(1.6, view.targetZoom / 0.85);
      else if (k === 'Escape') callbacks.current.onSelect(null);
    };
    const canvas = renderer.domElement;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);

    let width = 1, height = 1;
    const resize = () => {
      const r = host.getBoundingClientRect();
      width = Math.max(1, r.width); height = Math.max(1, r.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      const nextPortrait = width / height < 1.15;
      if (nextPortrait !== portrait) { portrait = nextPortrait; if (lastInput) relayout(lastInput.figs, lastInput.groupOrder, performance.now()); }
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();
    let visible = true;
    const io = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); }, { threshold: 0.01 });
    io.observe(host);

    const look = new THREE.Vector3(), m4 = new THREE.Matrix4(), spinM = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const project = (x: number, y: number, z: number) => { v.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, behind: v.z > 1 }; };
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      if (spin && motion) view.targetAz = Math.sin(t * 0.18) * 0.9;
      const k = motion ? 1 - Math.pow(0.0015, dt) : 1;
      view.azimuth += (view.targetAz - view.azimuth) * k;
      view.elevation += (view.targetEl - view.elevation) * k;
      view.zoom += (view.targetZoom - view.zoom) * k;
      const sel = selected ? states.get(selected) : undefined;
      view.focus.lerp(v.set(sel ? sel.pos.x * 0.4 : 0, TARGET_Y, sel ? sel.pos.y * 0.4 : 0), k * 0.6);
      // Frame the cluster's bounding box: width against the horizontal FOV (nearest row is closest to the
      // camera), depth against the vertical FOV, leaving the top band for the title overlay.
      const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), tanH = tanV * camera.aspect;
      const span = Math.max(halfW, extent * 0.55);
      const byWidth = span / (0.9 * tanH) + zNear * Math.cos(view.elevation);
      const byDepth = (((zNear - zFar) / 2) * Math.sin(view.elevation) + 0.55) / ((centred ? 0.82 : 0.62) * tanV);
      const dist = Math.max(3.4, byWidth, byDepth) * view.zoom;
      camera.position.set(view.focus.x + Math.sin(view.azimuth) * Math.cos(view.elevation) * dist, view.focus.y + Math.sin(view.elevation) * dist, view.focus.z + Math.cos(view.azimuth) * Math.cos(view.elevation) * dist);
      camera.lookAt(look.set(view.focus.x, view.focus.y + (centred ? 0 : dist * 0.045), view.focus.z));
      // With the inspector open on wide stages, slide the picture left so the selected figure stays in view.
      const shiftTarget = selected && width > 900 ? Math.min(220, width * 0.15) : 0;
      viewShift += (shiftTarget - viewShift) * k;
      if (Math.abs(viewShift) > 0.5) camera.setViewOffset(width, height, viewShift, 0, width, height);
      else if (camera.view?.enabled) camera.clearViewOffset();

      if (pointerInside && pointerDirty && !drag) { pointerDirty = false; setHovered(pick()); }

      order.forEach((s, i) => {
        const p = Math.max(0, Math.min(1, (now - s.start) / MOVE_MS));
        const moving = motion && p > 0 && p < 1;
        const e = motion ? ease(p) : 1;
        s.pos.set(s.from.x + (s.to.x - s.from.x) * e, s.from.y + (s.to.y - s.from.y) * e);
        if (p >= 1) s.from.copy(s.to);
        const faceCamera = Math.atan2(camera.position.x - s.pos.x, camera.position.z - s.pos.y);
        const heading = moving ? Math.atan2(s.to.x - s.from.x, s.to.y - s.from.y) : faceCamera;
        s.yaw = motion ? angleLerp(s.yaw, heading, 1 - Math.pow(0.002, dt)) : faceCamera;
        const spawnP = motion ? Math.max(0, Math.min(1, (now - s.spawn) / 520)) : 1;
        const popP = motion ? Math.max(0, 1 - (now - s.pop) / 500) : 0;
        const thinking = s.figure.activity === 'thinking';
        const breathe = motion ? Math.sin(t * 2.1 + s.phase) * 0.014 : 0;
        const hop = moving ? Math.sin(Math.PI * p) * 0.26 : thinking && motion ? Math.abs(Math.sin(t * 6 + s.phase)) * 0.05 : 0;
        const hoverLift = s.id === hovered ? 1.08 : 1;
        const scale = s.figure.appearance.height * (spawnP > 0 ? backOut(spawnP) : 0) * hoverLift * (1 + popP * 0.14);
        q.setFromAxisAngle(up, s.yaw + (thinking && motion ? Math.sin(t * 5 + s.phase) * 0.12 : 0));
        m4.compose(v.set(s.pos.x, hop, s.pos.y), q, sc.set(scale, scale * (1 + breathe), scale));
        parts.body.setMatrixAt(i, m4); parts.arms.setMatrixAt(i, m4); parts.head.setMatrixAt(i, m4); parts.eyes.setMatrixAt(i, m4); parts.hair.setMatrixAt(i, m4);
        for (const kind of HATS) hatMeshes[kind].setMatrixAt(i, s.figure.appearance.hat === kind ? m4 : zero);
        for (const kind of ACCESSORIES) accMeshes[kind].setMatrixAt(i, s.figure.appearance.accessory === kind ? m4 : zero);
        const base = s.figure.appearance.height * (spawnP > 0 ? backOut(spawnP) : 0);
        m4.compose(v.set(s.pos.x, 0, s.pos.y), q.identity(), sc.set(base, 1, base));
        parts.plinth.setMatrixAt(i, m4);
        const haloPulse = s.figure.halo ? 1 + (motion ? Math.sin(t * 2 + s.phase) * 0.04 : 0) + popP * 0.5 : 0.9;
        m4.compose(v.set(s.pos.x, 0, s.pos.y), q, sc.set(base * haloPulse, 1, base * haloPulse));
        parts.halo.setMatrixAt(i, m4);
        if (thinking) {
          m4.compose(v.set(s.pos.x, hop, s.pos.y), q.identity(), sc.set(scale, scale, scale));
          spinM.makeRotationY(motion ? t * 3.2 + s.phase : 0);
          parts.orbit.setMatrixAt(i, m4.multiply(spinM));
        } else parts.orbit.setMatrixAt(i, zero);
        if (s.figure.activity === 'flagged' || s.figure.activity === 'failed') {
          m4.compose(v.set(s.pos.x, hop + (motion ? Math.sin(t * 3 + s.phase) * 0.03 : 0), s.pos.y), q.setFromAxisAngle(up, motion ? t * 1.6 : 0), sc.set(scale, scale, scale));
          parts.flag.setMatrixAt(i, m4);
        } else parts.flag.setMatrixAt(i, zero);
      });
      for (const mesh of [parts.plinth, parts.halo, parts.body, parts.arms, parts.head, parts.eyes, parts.hair, parts.orbit, parts.flag, ...Object.values(hatMeshes), ...Object.values(accMeshes)]) mesh.instanceMatrix.needsUpdate = true;

      if (sel) {
        selection.visible = true;
        selection.position.set(sel.pos.x, 0.02, sel.pos.y);
        const s = sel.figure.appearance.height * (1 + (motion ? Math.sin(t * 3) * 0.05 : 0));
        selection.scale.set(s, s, s);
      } else selection.visible = false;

      if (motion) {
        const arr = dustGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < dustCount; i++) { arr[i * 3 + 1] += dt * (0.08 + dustSeed[i] * 0.16); if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0; }
        dustGeo.attributes.position.needsUpdate = true;
      }
      groupMeta.forEach((g, i) => {
        g.cx += (g.x - g.cx) * k; g.cz += (g.z - g.cz) * k;
        groupLines[i]?.position.set(g.cx, 0, g.cz);
        const pt = project(g.cx, 0, g.cz + g.radius + 0.42);
        g.el.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) translate(-50%, 0)`;
        g.el.style.opacity = pt.behind ? '0' : '1';
      });
      const tip = tipRef.current;
      const hs = hovered ? states.get(hovered) : undefined;
      if (tip && hs) {
        const pt = project(hs.pos.x, 1.15 * hs.figure.appearance.height, hs.pos.y);
        const flip = pt.x > width - 240;
        tip.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) translate(${flip ? 'calc(-100% - 14px)' : '14px'}, -50%)`;
      }
      renderer.render(scene, camera);
    };

    apiRef.current = {
      label: text => canvas.setAttribute('aria-label', text),
      stacked: on => { centred = on; },
      sync: (figs, groupOrder) => relayout(figs, groupOrder, performance.now()),
      select: id => { selected = id; },
      motion: reduced => { motion = !reduced; if (reduced) { spin = false; setSpinning(false); } },
      zoom: factor => { view.targetZoom = Math.max(0.45, Math.min(1.6, view.targetZoom * factor)); },
      reset: () => { view.targetAz = 0; view.targetEl = 0.5; view.targetZoom = 1; callbacks.current.onSelect(null); },
      spin: on => { spin = on && motion; },
    };
    raf = requestAnimationFrame(frame);

    const onLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(raf); callbacks.current.onFallback(); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const line of groupLines) line.geometry.dispose();
      for (const mesh of [...Object.values(parts), ...Object.values(hatMeshes), ...Object.values(accMeshes)]) mesh.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose(); canvas.remove();
      labelHost?.replaceChildren();
      apiRef.current = null;
    };
    // The scene is built once; props flow in through apiRef below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Declared after the scene effect, so on mount they run once the scene exists.
  useEffect(() => { apiRef.current?.label(label); }, [label]);
  useEffect(() => { apiRef.current?.sync(figures, groups); }, [figures, groups]);
  useEffect(() => { apiRef.current?.select(selectedId); }, [selectedId]);
  useEffect(() => { apiRef.current?.motion(reducedMotion); }, [reducedMotion]);
  useEffect(() => { apiRef.current?.stacked(stacked); }, [stacked]);

  const tip = hover ? describe(hover) : null;
  return <div className={styles.stageHost} ref={hostRef}>
    <div className={styles.stageLabels} ref={labelsRef} aria-hidden="true"/>
    <div className={styles.stageTip} ref={tipRef} hidden={!tip} aria-hidden="true">
      {tip && <><strong>{tip.title}</strong><small>{tip.meta}</small><ul>{tip.lines.map(line => <li key={line}>{line}</li>)}</ul>{tip.flag && <em>{tip.flag}</em>}</>}
    </div>
    <div className={styles.stageControls}>
      <button type="button" onClick={() => apiRef.current?.zoom(0.82)} aria-label="拉近视角" title="拉近">＋</button>
      <button type="button" onClick={() => apiRef.current?.zoom(1 / 0.82)} aria-label="拉远视角" title="拉远">－</button>
      <button type="button" onClick={() => apiRef.current?.reset()} aria-label="复位视角" title="复位">⟲</button>
      {!reducedMotion && <button type="button" aria-pressed={spinning} onClick={() => { const next = !spinning; setSpinning(next); apiRef.current?.spin(next); }} aria-label="自动环视" title="自动环视">◎</button>}
    </div>
  </div>;
}
