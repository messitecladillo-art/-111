'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import {
  blendStageLayout, buildChronicleField, chronicleVisualState, CHRONICLE_GLYPHS, CHRONICLE_LAST_STAGE,
  CHRONICLE_MAX_DPR, CHRONICLE_MOBILE_PARTICLE_COUNT, CHRONICLE_PARTICLE_COUNT, type GlyphMask,
} from '../../lib/landing-chronicle';

export type ChronicleSceneProps = {
  progressRef: RefObject<number>;
  paused: boolean;
  reducedMotion: boolean;
  onReady?: (ready: boolean) => void;
};

const FOV = 36;
const CAMERA_Z = 7.2;
const GLYPH_MASK_SIZE = 220;
const GLYPH_FONT = '"Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC","Source Han Serif CN","Songti SC","STSong","SimSun","Noto Serif CJK TC",serif';

const vertexShader = /* glsl */ `
  attribute vec3 aP1;
  attribute vec3 aP2;
  attribute vec3 aP3;
  attribute vec3 aP4;
  attribute vec3 aP5;
  attribute vec3 aP6;
  attribute vec4 aSeed;
  attribute float aKind;
  uniform float uProgress;
  uniform float uTime;
  uniform float uMotion;
  uniform vec3 uTransition;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform vec4 uLayout;
  uniform vec2 uView;
  uniform vec2 uPointer;
  uniform float uPointerForce;
  uniform vec3 uRipple;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPixel;
  const float PI = 3.14159265;
  void main() {
    float p = clamp(uProgress, 0.0, 6.0);
    vec3 f = mix(position, aP1, smoothstep(0.0, 1.0, p));
    f = mix(f, aP2, smoothstep(1.0, 2.0, p));
    f = mix(f, aP3, smoothstep(2.0, 3.0, p));
    f = mix(f, aP4, smoothstep(3.0, 4.0, p));
    f = mix(f, aP5, smoothstep(4.0, 5.0, p));
    f = mix(f, aP6, smoothstep(5.0, 6.0, p));
    float directed = step(0.5, uTransition.x);
    float focus = uTransition.z;
    float phase = aSeed.x * 6.2831853;
    vec3 world;
    if (aKind > 0.5) {
      world = vec3(f.x * uView.x * 1.12, f.y * uView.y * 1.12, f.z * 2.4 - 1.4);
      world.x += cos(uTime * 0.05 + phase) * 0.06 * uMotion;
      world.y += sin(uTime * 0.07 + phase) * 0.08 * uMotion;
    } else {
      // Each route follows persistent particle IDs using only the current scroll position.
      // Keep these offsets in step with chronicleParticlePosition's CPU reference.
      if (directed > 0.5) {
        vec3 from = position, to = aP1;
        if (uTransition.x > 1.5) { from = aP1; to = aP2; }
        if (uTransition.x > 2.5) { from = aP2; to = aP3; }
        if (uTransition.x > 3.5) { from = aP3; to = aP4; }
        if (uTransition.x > 4.5) { from = aP4; to = aP5; }
        if (uTransition.x > 5.5) { from = aP5; to = aP6; }
        f = mix(from, to, uTransition.y);
        if (uTransition.x < 1.5 || (uTransition.x > 4.5 && uTransition.x < 5.5)) {
          vec2 delta = to.xy - from.xy;
          vec2 normal = length(delta) > 0.0001 ? vec2(-delta.y, delta.x) / length(delta) : vec2(0.0);
          f.xy += normal * focus * (uTransition.x < 1.5 ? 0.10 : 0.18) * (0.35 + aSeed.w * 0.65);
          f.z += focus * sin(phase) * 0.06;
        } else if (uTransition.x < 2.5) {
          f.x += sin(from.y * PI + phase * 0.2) * focus * 0.09;
          f.y += cos(phase) * focus * 0.025;
          f.z += focus * (aSeed.y - 0.5) * 0.12;
        } else if (uTransition.x < 3.5) {
          f.x += sign(from.x + 0.00001) * focus * 0.15;
          f.y += sin(phase) * focus * 0.035;
          f.z += focus * cos(phase) * 0.08;
        } else if (uTransition.x < 4.5) {
          f.x += focus * sin(from.y * PI) * 0.08;
          f.y += focus * sin(phase) * 0.02;
          f.z += focus * (abs(from.x) - 0.4) * 0.24;
        } else {
          float angle = atan(to.y, to.x) + (1.0 - uTransition.y) * 0.7;
          f.xy += vec2(cos(angle), sin(angle)) * focus * 0.14;
          f.z += focus * sin(phase) * 0.04;
        }
      }
      world = vec3(f.xy * uLayout.z + uLayout.xy, f.z * uLayout.z * 0.4);
    }
    // The cursor parts the dust like a lamp passed over gold leaf; a click sends out one ring.
    vec2 toPointer = world.xy - uPointer;
    float pointerDistance = length(toPointer);
    vec2 away = pointerDistance > 0.0001 ? toPointer / pointerDistance : vec2(0.0);
    float near = uPointerForce * step(0.5, aKind) * (1.0 - smoothstep(0.0, 0.72, pointerDistance));
    near *= near;
    world.xy += (away * 0.26 + vec2(-away.y, away.x) * 0.1 * (aSeed.z - 0.5)) * near;
    world.z += near * 0.5 * aSeed.w;
    vec2 toRipple = world.xy - uRipple.xy;
    float rippleDistance = length(toRipple);
    float wave = step(0.5, aKind) * step(0.0, uRipple.z) * exp(-pow((rippleDistance - uRipple.z * 2.8) * 4.0, 2.0)) * exp(-uRipple.z * 1.5);
    world.xy += (rippleDistance > 0.0001 ? toRipple / rippleDistance : vec2(0.0)) * wave * 0.3;
    vec4 view = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    float dust = step(0.5, aKind);
    vPixel = focus * (1.0 - dust);
    // A few larger motes read as sparks against the fine dust.
    float spark = step(0.972, aSeed.y) * (1.0 - dust);
    float size = uPointSize * mix(0.55 + aSeed.y * 0.9 + spark * 1.6, 0.85, vPixel) * mix(1.0, 0.85, dust);
    gl_PointSize = size * uPixelRatio * (${CAMERA_Z.toFixed(1)} / max(0.5, -view.z));
    vec3 gold = vec3(0.957, 0.725, 0.259);
    vec3 pale = vec3(1.0, 0.89, 0.66);
    vec3 teal = vec3(0.0, 0.70, 0.64);
    vec3 colour = aSeed.z < 0.1 ? teal : (aSeed.z < 0.3 ? pale : gold);
    vColor = mix(colour, mix(pale, teal, step(0.62, aSeed.z)) * 0.8, dust);
    vColor = mix(vColor, gold, vPixel);
    float twinkle = mix(1.0, 0.7 + 0.3 * sin(uTime * (0.7 + aSeed.w * 1.7) + phase * 3.0), uMotion * (1.0 - directed));
    float lit = clamp(near * 1.8 + wave * 1.6, 0.0, 2.0);
    vColor = mix(vColor, pale, clamp(lit, 0.0, 1.0) * 0.6);
    vAlpha = mix(0.82 * uLayout.w, 0.34, dust) * twinkle * (1.0 + lit);
    // A sparse gold trace carries the morph; surrounding dust recedes instead of bursting out.
    float sparse = mix(0.06, 1.0, step(aSeed.x, 0.22));
    vAlpha *= mix(1.0, mix(sparse, 0.12, dust), focus);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPixel;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = mix(length(d), max(abs(d.x), abs(d.y)), vPixel);
    if (r > 0.5) discard;
    float glow = mix(pow(1.0 - r * 2.0, 1.7), 1.0 - smoothstep(0.34, 0.5, r), vPixel);
    gl_FragColor = vec4(vColor * (0.85 + glow * 0.5), glow * vAlpha);
  }
`;

/** Rasterise each chronicle glyph with the visitor's own serif fonts; missing canvas support falls back to a cloud. */
function rasteriseGlyphs(): (GlyphMask | null)[] {
  return CHRONICLE_GLYPHS.map(glyph => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = GLYPH_MASK_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, GLYPH_MASK_SIZE, GLYPH_MASK_SIZE);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(GLYPH_MASK_SIZE * 0.86)}px ${GLYPH_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const metrics = ctx.measureText(glyph);
      const ascent = metrics.actualBoundingBoxAscent || GLYPH_MASK_SIZE * 0.7;
      const descent = metrics.actualBoundingBoxDescent || GLYPH_MASK_SIZE * 0.1;
      const left = metrics.actualBoundingBoxLeft || 0, right = metrics.actualBoundingBoxRight || 0;
      const x = GLYPH_MASK_SIZE / 2 + (left - right) / 2;
      const y = GLYPH_MASK_SIZE / 2 + (ascent - descent) / 2;
      ctx.fillText(glyph, x, y);
      const data = ctx.getImageData(0, 0, GLYPH_MASK_SIZE, GLYPH_MASK_SIZE).data;
      const alpha = new Uint8Array(GLYPH_MASK_SIZE * GLYPH_MASK_SIZE);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      return { alpha, size: GLYPH_MASK_SIZE };
    } catch {
      return null;
    }
  });
}

/** One fixed GPU particle field; the accessible narrative and static fallback live in the page. */
export default function ChronicleScene({ progressRef, paused, reducedMotion, onReady }: ChronicleSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ paused, reducedMotion, onReady });
  const invalidateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    settingsRef.current = { paused, reducedMotion, onReady };
    invalidateRef.current?.();
  }, [paused, reducedMotion, onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let disposed = false, lost = false, ready = false;
    let width = 0, height = 0, raf = 0, pendingFrames = 0, lastTime = 0, activeTime = 0;
    let pointerX = 0, pointerY = 0, frameCount = 0;
    let pointerInside = false, pointerForce = 0, rippleX = 0, rippleY = 0, rippleStart = -1;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const layout = new Float32Array(4);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    camera.position.set(0, 0, CAMERA_Z);
    const group = new THREE.Group();
    scene.add(group);

    const reportReady = (value: boolean) => {
      if (ready === value) return;
      ready = value;
      settingsRef.current.onReady?.(value);
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; lastTime = 0; };
    const fail = () => { lost = true; stop(); canvas.dataset.renderer = 'fallback'; reportReady(false); };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power', stencil: false, depth: false });
      renderer.setClearColor(0x000000, 0);
      renderer.debug.onShaderError = fail;
      const small = Math.min(window.innerWidth, window.innerHeight) < 700;
      const field = buildChronicleField(small ? CHRONICLE_MOBILE_PARTICLE_COUNT : CHRONICLE_PARTICLE_COUNT, rasteriseGlyphs());
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(field.stages[0], 3));
      for (let stage = 1; stage <= CHRONICLE_LAST_STAGE; stage++) geometry.setAttribute(`aP${stage}`, new THREE.BufferAttribute(field.stages[stage], 3));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(field.seeds, 4));
      geometry.setAttribute('aKind', new THREE.BufferAttribute(field.kinds, 1));
      material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 }, uTransition: { value: new THREE.Vector3() }, uPointSize: { value: small ? 2.5 : 2.35 },
          uPointer: { value: new THREE.Vector2(99, 99) }, uPointerForce: { value: 0 }, uRipple: { value: new THREE.Vector3(0, 0, -1) },
          uPixelRatio: { value: 1 }, uLayout: { value: new THREE.Vector4(0, 0, 1, 1) }, uView: { value: new THREE.Vector2(1, 1) },
        },
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false; // Positions are produced by the morph shader.
      group.add(points);
      canvas.dataset.particles = String(field.count);
    } catch {
      fail();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      return;
    }

    const canRender = () => !disposed && !lost && !document.hidden && width > 0 && height > 0;
    const queue = () => { if (!raf && canRender()) raf = requestAnimationFrame(draw); };
    const invalidate = () => { pendingFrames = Math.max(pendingFrames, 2); queue(); };

    function draw(now: number) {
      raf = 0;
      if (!canvas || !canRender() || !renderer || !material) return;
      const settings = settingsRef.current;
      const animating = !settings.paused && !settings.reducedMotion;
      const dt = lastTime ? Math.min(0.05, Math.max(0, (now - lastTime) / 1000)) : 0;
      lastTime = now;
      if (animating) activeTime += dt;
      const visual = chronicleVisualState(progressRef.current ?? 0, width, settings.reducedMotion);
      const progress = visual.progress;
      // Mouse light affects only background dust. The six formations remain independent
      // of elapsed time, pointer history and scrolling direction, including the closing ring.
      const idleWeight = 1 - visual.emphasis;
      const visibleH = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
      const visibleW = visibleH * camera.aspect;
      blendStageLayout(progress, visibleW, visibleH, layout);
      const u = material.uniforms;
      u.uProgress.value = progress;
      u.uTime.value = activeTime;
      u.uMotion.value = settings.reducedMotion ? 0 : 1;
      (u.uTransition.value as THREE.Vector3).set(visual.segment, visual.mix, visual.emphasis);
      (u.uLayout.value as THREE.Vector4).set(layout[0], layout[1], layout[2], layout[3]);
      (u.uView.value as THREE.Vector2).set(visibleW / 2, visibleH / 2);
      pointerForce += ((animating && pointerInside ? 1 : 0) - pointerForce) * (animating ? 0.08 : 1);
      u.uPointerForce.value = pointerForce * idleWeight;
      (u.uPointer.value as THREE.Vector2).set(pointerX * visibleW / 2, pointerY * visibleH / 2);
      const rippleAge = rippleStart < 0 ? -1 : (now - rippleStart) / 1000;
      if (rippleAge > 2.6) rippleStart = -1;
      (u.uRipple.value as THREE.Vector3).set(rippleX * visibleW / 2, rippleY * visibleH / 2, animating && idleWeight > 0.99 ? rippleAge : -1);
      canvas.dataset.chronicleProgress = progress.toFixed(4);
      canvas.dataset.chronicleTransition = visual.transition;
      canvas.dataset.chronicleMode = visual.mode;
      try {
        renderer.render(scene, camera);
        if (!lost) {
          canvas.dataset.renderer = 'webgl';
          frameCount++;
          if (frameCount === 1 || frameCount % 60 === 0) canvas.dataset.frames = String(frameCount);
          reportReady(true);
        }
      } catch { fail(); return; }
      pendingFrames = Math.max(0, pendingFrames - 1);
      if (animating || pendingFrames > 0 || pointerForce > 0.01) queue();
      else lastTime = 0;
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.floor(rect.width); height = Math.floor(rect.height);
      if (width <= 0 || height <= 0) { stop(); return; }
      const ratio = Math.min(CHRONICLE_MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
      renderer?.setPixelRatio(ratio);
      renderer?.setSize(width, height, false);
      if (material) material.uniforms.uPixelRatio.value = ratio;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      invalidate();
    };
    const pointer = (event: PointerEvent) => {
      const settings = settingsRef.current;
      if (!finePointer.matches || settings.paused || settings.reducedMotion || event.pointerType === 'touch' || !width || !height) return;
      pointerX = event.clientX / width * 2 - 1;
      pointerY = -(event.clientY / height * 2 - 1);
      pointerInside = true;
    };
    const ripple = (event: PointerEvent) => {
      const settings = settingsRef.current;
      if (!finePointer.matches || settings.paused || settings.reducedMotion || event.pointerType === 'touch' || event.button !== 0 || !width || !height) return;
      rippleX = event.clientX / width * 2 - 1;
      rippleY = -(event.clientY / height * 2 - 1);
      rippleStart = performance.now();
      invalidate();
    };
    const resetPointer = () => { pointerX = 0; pointerY = 0; pointerInside = false; };
    const visibility = () => { if (document.hidden) stop(); else invalidate(); };
    const contextLost = (event: Event) => { event.preventDefault(); fail(); };
    const contextRestored = () => {
      if (disposed) return;
      lost = false;
      if (material) material.needsUpdate = true;
      resize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('pointerdown', ripple, { passive: true });
    document.documentElement.addEventListener('pointerleave', resetPointer);
    window.addEventListener('scroll', invalidate, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    invalidateRef.current = invalidate;
    resize();

    return () => {
      disposed = true;
      stop();
      invalidateRef.current = null;
      observer.disconnect();
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('pointerdown', ripple);
      document.documentElement.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('scroll', invalidate);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      geometry?.dispose();
      material?.dispose();
      scene.clear();
      renderer?.renderLists.dispose();
      renderer?.dispose();
      reportReady(false);
    };
  }, [progressRef]);

  return <canvas ref={canvasRef} aria-hidden="true" data-renderer="initializing" style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
