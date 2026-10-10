'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { buildLandingShapes, resolveLandingProgress, LANDING_MAX_DPR, LANDING_MOBILE_PARTICLE_COUNT, LANDING_PARTICLE_COUNT, sampleLandingCamera } from '../../lib/landing-scene';

export type PixelSceneProps = {
  progressRef: RefObject<number>;
  paused: boolean;
  reducedMotion: boolean;
  expanded: boolean;
  onReady?: (ready: boolean) => void;
};

const vertexShader = /* glsl */ `
  attribute vec3 aPosition0;
  attribute vec3 aPosition1;
  attribute vec3 aPosition2;
  attribute vec3 aPosition3;
  attribute vec3 aColor0;
  attribute vec3 aColor1;
  attribute vec3 aColor2;
  attribute vec3 aColor3;
  attribute vec4 aSizes;
  attribute float aSeed;
  uniform float uProgress;
  uniform float uTime;
  uniform float uExpanded;
  uniform float uStatic;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  varying float vEdge;
  void main() {
    float p = clamp(uProgress, 0.0, 3.0);
    float t0 = smoothstep(0.0, 1.0, p);
    float t1 = smoothstep(1.0, 2.0, p);
    float t2 = smoothstep(2.0, 3.0, p);
    vec3 place = mix(aPosition0, aPosition1, t0);
    place = mix(place, aPosition2, t1);
    place = mix(place, aPosition3, t2);
    vec3 color = mix(aColor0, aColor1, t0);
    color = mix(color, aColor2, t1);
    color = mix(color, aColor3, t2);
    float size = mix(aSizes.x, aSizes.y, t0);
    size = mix(size, aSizes.z, t1);
    size = mix(size, aSizes.w, t2);
    // Corresponding voxels travel along shallow arcs instead of dissolving between images.
    float travel = sin(fract(p) * 3.14159265);
    float phase = aSeed * 6.2831853;
    place.x += sin(phase + p * 2.1) * travel * 0.28;
    place.y += cos(phase + p * 1.6) * travel * 0.20;
    place.z += sin(phase * 2.0) * travel * 0.24;
    float network = smoothstep(1.3, 1.9, p) * (1.0 - smoothstep(2.3, 2.9, p));
    place.xz *= 1.0 + network * uExpanded * 0.30;
    place.y += network * uExpanded * (aSeed - 0.5) * 0.20;
    // The advancing lens breaks into the sample lattice as the camera approaches.
    float tunnel = uStatic > 0.5 ? 0.0 : sin(clamp((p - 1.05) / 0.75, 0.0, 1.0) * 3.14159265);
    place.z += tunnel * (1.0 - t1) * 2.0;
    place.y += sin(uTime * 0.42 + phase) * 0.015;
    vec3 transformed = place + position * size;
    vec4 view = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * view;
    vColor = color;
    vNormal = normalize(normalMatrix * normal);
    vDepth = -view.z;
    vEdge = aSeed;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uFogOffset;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  varying float vEdge;
  void main() {
    vec3 key = normalize(vec3(-0.35, 0.8, 1.0));
    float diffuse = max(dot(normalize(vNormal), key), 0.0);
    float rim = pow(1.0 - abs(vNormal.z), 3.0) * 0.17;
    vec3 color = vColor * (0.39 + diffuse * 0.94 + rim);
    color += vColor * step(0.965, vEdge) * 0.30;
    color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 0.38);
    float fog = smoothstep(8.0 + uFogOffset, 20.0 + uFogOffset, vDepth);
    color = mix(color, vec3(0.012, 0.018, 0.014), fog);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** One GPU-morphed canvas; the accessible narrative and static fallback belong to the page. */
export default function PixelScene({ progressRef, paused, reducedMotion, expanded, onReady }: PixelSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ paused, reducedMotion, expanded, onReady });
  const invalidateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    settingsRef.current = { paused, reducedMotion, expanded, onReady };
    invalidateRef.current?.();
  }, [paused, reducedMotion, expanded, onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.InstancedBufferGeometry | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let disposed = false;
    let lost = false;
    let intersecting = true;
    let ready = false;
    let width = 0, height = 0;
    let mobile = false;
    let raf = 0;
    let pendingFrames = 0;
    let lastTime = 0;
    let activeTime = 0;
    let pointerX = 0, pointerY = 0;
    let smoothedPointerX = 0, smoothedPointerY = 0;
    let frameCount = 0;
    let lastDriftTime: number | null = null;
    let frameIntervalTotal = 0;
    let frameIntervalCount = 0;
    let bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const cameraSample = new Float32Array(5);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.12, 40);
    const group = new THREE.Group();
    scene.add(group);

    const reportReady = (value: boolean) => {
      if (ready === value) return;
      ready = value;
      settingsRef.current.onReady?.(value);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
      lastDriftTime = null;
      frameIntervalTotal = 0;
      frameIntervalCount = 0;
    };
    const fail = () => {
      lost = true;
      stop();
      canvas.dataset.renderer = 'fallback';
      reportReady(false);
    };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power', stencil: false, depth: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      renderer.debug.onShaderError = fail;
      const small = window.innerWidth < 700 && window.innerHeight > window.innerWidth;
      const shapes = buildLandingShapes(small ? LANDING_MOBILE_PARTICLE_COUNT : LANDING_PARTICLE_COUNT);
      const box = new THREE.BoxGeometry(1, 1, 1);
      geometry = new THREE.InstancedBufferGeometry();
      geometry.index = box.index?.clone() ?? null;
      geometry.setAttribute('position', box.attributes.position.clone());
      geometry.setAttribute('normal', box.attributes.normal.clone());
      box.dispose();
      const sizes = new Float32Array(shapes.count * 4);
      for (let stage = 0; stage < 4; stage++) {
        geometry.setAttribute(`aPosition${stage}`, new THREE.InstancedBufferAttribute(shapes.stages[stage].positions, 3));
        geometry.setAttribute(`aColor${stage}`, new THREE.InstancedBufferAttribute(shapes.stages[stage].colors, 3));
        for (let i = 0; i < shapes.count; i++) sizes[i * 4 + stage] = shapes.stages[stage].sizes[i];
      }
      geometry.setAttribute('aSizes', new THREE.InstancedBufferAttribute(sizes, 4));
      geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(shapes.seeds, 1));
      geometry.instanceCount = shapes.count;
      material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uExpanded: { value: settingsRef.current.expanded ? 1 : 0 }, uStatic: { value: settingsRef.current.reducedMotion ? 1 : 0 }, uFogOffset: { value: 0 } },
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false; // Instance positions are supplied by the morph shader.
      group.add(mesh);
      canvas.dataset.particles = String(shapes.count);
    } catch {
      fail();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      settingsRef.current.onReady?.(false);
      return;
    }

    const canRender = () => !disposed && !lost && intersecting && !document.hidden && width > 0 && height > 0;
    const queue = () => {
      if (!raf && canRender()) raf = requestAnimationFrame(draw);
    };
    const invalidate = () => {
      // Two frames also observe a progress ref updated by the page's own scroll RAF.
      pendingFrames = Math.max(pendingFrames, 2);
      queue();
    };
    function draw(now: number) {
      raf = 0;
      if (!canvas || !canRender() || !renderer || !material) return;
      const settings = settingsRef.current;
      const drifting = !settings.paused && !settings.reducedMotion;
      const dt = lastTime ? Math.min(0.05, Math.max(0, (now - lastTime) / 1000)) : 0;
      lastTime = now;
      if (drifting) activeTime += dt;
      if (drifting) {
        if (lastDriftTime !== null) {
          // Measure the unbounded RAF interval, independently of the capped animation clock.
          frameIntervalTotal += now - lastDriftTime;
          frameIntervalCount++;
        }
        lastDriftTime = now;
      } else {
        lastDriftTime = null;
        frameIntervalTotal = 0;
        frameIntervalCount = 0;
      }
      const progress = resolveLandingProgress(progressRef.current, settings.reducedMotion);
      material.uniforms.uProgress.value = progress;
      material.uniforms.uTime.value = activeTime;
      material.uniforms.uExpanded.value = settings.expanded ? 1 : 0;
      material.uniforms.uStatic.value = settings.reducedMotion ? 1 : 0;
      sampleLandingCamera(progress, mobile, cameraSample, settings.reducedMotion, camera.aspect);
      // Framing a narrow viewport must not darken the object by moving it deeper into the fog.
      material.uniforms.uFogOffset.value = Math.max(0, cameraSample[2] - 8.3);
      if (drifting) {
        smoothedPointerX += (pointerX - smoothedPointerX) * 0.05;
        smoothedPointerY += (pointerY - smoothedPointerY) * 0.05;
      }
      const parallaxX = settings.reducedMotion ? 0 : smoothedPointerX;
      const parallaxY = settings.reducedMotion ? 0 : smoothedPointerY;
      camera.position.set(cameraSample[0] + parallaxX * 0.12, cameraSample[1] + parallaxY * 0.10, cameraSample[2]);
      camera.lookAt(0, cameraSample[3], 0);
      const visibleHeight = 2 * Math.tan(42 * Math.PI / 360) * cameraSample[2];
      group.position.set(mobile ? 0 : visibleHeight * camera.aspect * 0.08, mobile ? -visibleHeight * 0.10 : -visibleHeight * 0.015, 0);
      group.rotation.set(0.035 + parallaxY * 0.016, cameraSample[4] + parallaxX * 0.055, 0);
      try {
        renderer.render(scene, camera);
        if (!lost) {
          canvas.dataset.renderer = 'webgl';
          // Diagnostics are sampled, never React state or a per-frame allocation.
          frameCount++;
          if (frameCount === 1 || frameCount % 60 === 0) canvas.dataset.frames = String(frameCount);
          if (frameIntervalCount >= 60) {
            canvas.dataset.frameMs = (frameIntervalTotal / frameIntervalCount).toFixed(2);
            frameIntervalTotal = 0;
            frameIntervalCount = 0;
          }
          reportReady(true);
        }
      } catch { fail(); return; }
      pendingFrames = Math.max(0, pendingFrames - 1);
      if (drifting || pendingFrames > 0) queue();
      else lastTime = 0;
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      width = Math.floor(rect.width); height = Math.floor(rect.height);
      mobile = width < 700 && height > width;
      if (width <= 0 || height <= 0) { stop(); return; }
      renderer?.setPixelRatio(Math.min(LANDING_MAX_DPR, Math.max(1, window.devicePixelRatio || 1)));
      renderer?.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      invalidate();
    };
    const scroll = () => {
      // Canvas is usually fixed. A rectangle refresh keeps parallax bounded in embedded use.
      const rect = canvas.getBoundingClientRect();
      bounds.left = rect.left; bounds.right = rect.right; bounds.top = rect.top; bounds.bottom = rect.bottom;
      invalidate();
    };
    const pointer = (event: PointerEvent) => {
      const settings = settingsRef.current;
      if (!finePointer.matches || settings.paused || settings.reducedMotion || !intersecting || document.hidden || event.pointerType === 'touch') return;
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { pointerX = 0; pointerY = 0; return; }
      pointerX = width ? (event.clientX - bounds.left) / width * 2 - 1 : 0;
      pointerY = height ? -((event.clientY - bounds.top) / height * 2 - 1) : 0;
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
    const intersection = new IntersectionObserver(([entry]) => {
      intersecting = !!entry?.isIntersecting;
      if (intersecting) invalidate(); else stop();
    }, { threshold: 0 });
    intersection.observe(canvas);
    window.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('pointerout', resetPointer, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
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
      intersection.disconnect();
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('pointerout', resetPointer);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
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
