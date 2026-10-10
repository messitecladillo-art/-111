'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import {
  blendStageLayout, buildChronicleField, resolveChronicleProgress, CHRONICLE_GLYPHS, CHRONICLE_LAST_STAGE,
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
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform vec4 uLayout;
  uniform vec2 uView;
  uniform float uSpin;
  varying vec3 vColor;
  varying float vAlpha;
  const float PI = 3.14159265;
  void main() {
    float p = clamp(uProgress, 0.0, 6.0);
    vec3 f = mix(position, aP1, smoothstep(0.0, 1.0, p));
    f = mix(f, aP2, smoothstep(1.0, 2.0, p));
    f = mix(f, aP3, smoothstep(2.0, 3.0, p));
    f = mix(f, aP4, smoothstep(3.0, 4.0, p));
    f = mix(f, aP5, smoothstep(4.0, 5.0, p));
    f = mix(f, aP6, smoothstep(5.0, 6.0, p));
    float phase = aSeed.x * 6.2831853;
    vec3 world;
    if (aKind > 0.5) {
      world = vec3(f.x * uView.x * 1.12, f.y * uView.y * 1.12, f.z * 2.4 - 1.4);
      world.x += cos(uTime * 0.05 + phase) * 0.06 * uMotion;
      world.y += sin(uTime * 0.07 + phase) * 0.08 * uMotion;
    } else {
      // Mid-morph, particles leave the old figure in a swirling burst and settle into the next.
      float travel = sin(fract(p) * PI) * uMotion;
      float turn = travel * (0.7 + aSeed.y * 0.9) * (aSeed.z > 0.5 ? 1.0 : -1.0);
      float c = cos(turn), s = sin(turn);
      f.xy = vec2(c * f.x - s * f.y, s * f.x + c * f.y);
      f.xy *= 1.0 + travel * (0.12 + aSeed.w * 0.55);
      f.z += travel * (aSeed.x - 0.5) * 2.6;
      f.xy += vec2(sin(uTime * 0.55 + phase), cos(uTime * 0.47 + phase * 1.3)) * 0.0035 * uMotion;
      float cs = cos(uSpin), sn = sin(uSpin);
      f.xy = vec2(cs * f.x - sn * f.y, sn * f.x + cs * f.y);
      world = vec3(f.xy * uLayout.z + uLayout.xy, f.z * uLayout.z * 0.4);
    }
    vec4 view = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    float dust = step(0.5, aKind);
    // A few larger motes read as sparks against the fine dust.
    float spark = step(0.972, aSeed.y) * (1.0 - dust);
    float size = uPointSize * (0.55 + aSeed.y * 0.9 + spark * 1.6) * mix(1.0, 0.85, dust);
    gl_PointSize = size * uPixelRatio * (${CAMERA_Z.toFixed(1)} / max(0.5, -view.z));
    vec3 gold = vec3(0.957, 0.725, 0.259);
    vec3 pale = vec3(1.0, 0.89, 0.66);
    vec3 teal = vec3(0.0, 0.70, 0.64);
    vec3 colour = aSeed.z < 0.1 ? teal : (aSeed.z < 0.3 ? pale : gold);
    vColor = mix(colour, mix(pale, teal, step(0.62, aSeed.z)) * 0.8, dust);
    float twinkle = mix(1.0, 0.7 + 0.3 * sin(uTime * (0.7 + aSeed.w * 1.7) + phase * 3.0), uMotion);
    vAlpha = mix(0.82 * uLayout.w, 0.34, dust) * twinkle;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float glow = pow(1.0 - r * 2.0, 1.7);
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
    let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0, frameCount = 0;
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
          uProgress: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 }, uPointSize: { value: small ? 2.5 : 2.35 }, uSpin: { value: 0 },
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
      const progress = resolveChronicleProgress(progressRef.current ?? 0, settings.reducedMotion);
      const visibleH = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
      const visibleW = visibleH * camera.aspect;
      blendStageLayout(progress, visibleW, visibleH, layout);
      const u = material.uniforms;
      u.uProgress.value = progress;
      u.uTime.value = activeTime;
      u.uMotion.value = settings.reducedMotion ? 0 : 1;
      // Only the ring (prologue and finale) turns; the weight eases it out as it morphs away.
      const ringWeight = 1 - Math.min(1, Math.max(0, progress)) + Math.min(1, Math.max(0, progress - (CHRONICLE_LAST_STAGE - 1)));
      u.uSpin.value = settings.reducedMotion ? 0 : activeTime * 0.022 * ringWeight;
      (u.uLayout.value as THREE.Vector4).set(layout[0], layout[1], layout[2], layout[3]);
      (u.uView.value as THREE.Vector2).set(visibleW / 2, visibleH / 2);
      if (animating) {
        smoothX += (pointerX - smoothX) * 0.04;
        smoothY += (pointerY - smoothY) * 0.04;
      }
      const sway = animating ? Math.sin(activeTime * 0.13) * 0.06 : 0;
      group.rotation.set(settings.reducedMotion ? 0 : -smoothY * 0.05, settings.reducedMotion ? 0 : sway + smoothX * 0.09, 0);
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
      if (animating || pendingFrames > 0) queue();
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
    };
    const resetPointer = () => { pointerX = 0; pointerY = 0; };
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
