import test from 'node:test';
import assert from 'node:assert/strict';
import { chartDrawFrames, createContentReveal, createKeyedListMotion, drawChartIn, liquidMarkerAt, liquidMarkerFrames, markerBounds } from '../lib/workspace-motion.ts';

// Small DOM harness: geometry and animation progress are controlled independently,
// so interrupted moves can be checked against their visible positions.
function surface(reduced = false) {
  const listeners = new Map();
  const listen = (name, fn) => listeners.set(name, fn);
  const unlisten = (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); };
  const media = { matches: reduced, addEventListener: listen, removeEventListener: unlisten };
  const view = { matchMedia: () => media, addEventListener: listen, removeEventListener: unlisten, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  const doc = { defaultView: view, hidden: false, addEventListener: listen, removeEventListener: unlisten };
  function node(id, x, y, width = 100, height = 30) {
    const result = {
      dataset: { motionId: id }, ownerDocument: doc, parentElement: null, style: {}, hidden: false, calls: [], rect: { left: x, top: y, width, height },
      getBoundingClientRect() { return this.rect; }, getClientRects() { return this.hidden ? [] : [this.rect]; }, closest() { return this.hidden ? this : null; },
      animate(frames, options) {
        const animation = { frames, options, progress: 0, cancelled: false, playState: 'running', effect: { getComputedTiming: () => ({ progress: animation.progress }) }, cancel() { this.cancelled = true; } };
        this.calls.push(animation); return animation;
      },
    };
    return result;
  }
  const root = node('root', 10, 20), marker = node('marker', 0, 0);
  root.scrollLeft = 0; root.scrollTop = 0; root.items = [];
  root.querySelectorAll = () => root.items;
  root.querySelector = () => marker;
  return { root, marker, doc, media, node, preference(value) { media.matches = value; listeners.get('change')?.(); }, visibility(value) { doc.hidden = value; listeners.get('visibilitychange')?.(); }, listeners };
}

test('rapid reverse reorder starts from visible intermediate positions and cancels prior moves', () => {
  const { root, node, marker } = surface();
  const a = node('a', 10, 20), b = node('b', 10, 60);
  root.items = [a, b];
  const motion = createKeyedListMotion(root);
  motion.update(['a', 'b'], 'a', 'vertical', true);
  assert.equal(a.calls.length, 0);
  a.rect.top = 60; b.rect.top = 20; root.items = [b, a];
  motion.update(['b', 'a'], 'b', 'vertical', true);
  assert.equal(a.calls[0].frames[0].transform, 'translate(0px,-40px)');
  assert.equal(b.calls[0].frames[0].transform, 'translate(0px,40px)');
  a.calls[0].progress = b.calls[0].progress = .5;
  a.rect.top = 20; b.rect.top = 60; root.items = [a, b];
  motion.update(['a', 'b'], 'a', 'vertical', true);
  assert.equal(a.calls[0].cancelled, true);
  assert.equal(b.calls[0].cancelled, true);
  assert.equal(a.calls[1].frames[0].transform, 'translate(0px,20px)');
  assert.equal(b.calls[1].frames[0].transform, 'translate(0px,-20px)');
  assert.equal(marker.style.transform, 'translate(0px,0px)');
  motion.dispose();
  assert.equal(a.calls[1].cancelled, true);
});

test('new identities highlight once; filtered identities and unchanged renders do not re-enter', () => {
  const { root, node } = surface();
  const a = node('a', 10, 20), b = node('b', 10, 60);
  root.items = [a];
  const motion = createKeyedListMotion(root);
  motion.update(['a'], 'a', 'vertical', true);
  root.items = [a, b]; motion.update(['a', 'b'], 'b', 'vertical', true);
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].frames[0].opacity, .45);
  motion.update(['a', 'b'], 'b', 'vertical', true);
  assert.equal(b.calls.length, 1);
  root.items = [a]; motion.update(['a'], 'a', 'vertical', true);
  root.items = [a, b]; motion.update(['a', 'b'], 'b', 'vertical', true);
  assert.equal(b.calls.length, 1);
  motion.dispose();
});

test('preference or hidden document cancels active motion and exposes final layout immediately', () => {
  const s = surface(), a = s.node('a', 10, 20), b = s.node('b', 10, 60);
  s.root.items = [a, b];
  const motion = createKeyedListMotion(s.root);
  motion.update(['a', 'b'], 'a', 'vertical', true);
  a.rect.top = 60; b.rect.top = 20; s.root.items = [b, a];
  motion.update(['b', 'a'], 'a', 'vertical', true);
  s.preference(true);
  assert.equal(a.calls[0].cancelled, true);
  assert.equal(s.marker.style.transform, 'translate(0px,40px)');
  a.rect.top = 20; b.rect.top = 60; s.root.items = [a, b];
  motion.update(['a', 'b'], 'b', 'vertical', true);
  assert.equal(a.calls.length, 1);
  assert.equal(s.marker.style.transform, 'translate(0px,40px)');
  s.preference(false); s.visibility(true);
  a.rect.top = 60; b.rect.top = 20; s.root.items = [b, a];
  motion.update(['b', 'a'], 'b', 'vertical', true);
  assert.equal(a.calls.length, 1);
  motion.dispose();
  assert.equal(s.listeners.size, 0);
});

test('selection marker follows wrapped rows and a horizontally scrolling narrow directory', () => {
  assert.deepEqual(markerBounds({ x: 124, y: 4, width: 116, height: 52 }, 'vertical'), { x: 124, y: 4, width: 3, height: 52 });
  const s = surface(), a = s.node('a', 130, 64, 90, 40);
  s.root.scrollLeft = 30; s.root.scrollTop = 10; s.root.items = [a];
  const motion = createKeyedListMotion(s.root);
  motion.update(['a'], 'a', 'horizontal', true);
  assert.equal(s.marker.style.transform, 'translate(150px,92px)');
  assert.equal(s.marker.style.width, '90px');
  motion.dispose();
});

test('first result reveals, same token does not replay, new result replaces animation and preference cancels it', () => {
  const s = surface();
  const reveal = createContentReveal(s.root);
  reveal.update(null, true);
  reveal.update('result:1', true);
  assert.equal(s.root.calls.length, 1);
  reveal.update('result:1', true);
  assert.equal(s.root.calls.length, 1);
  reveal.update('result:2', true);
  assert.equal(s.root.calls[0].cancelled, true);
  assert.equal(s.root.calls.length, 2);
  s.preference(true);
  assert.equal(s.root.calls[1].cancelled, true);
  reveal.update('result:3', true);
  assert.equal(s.root.calls.length, 2);
  reveal.dispose();
  assert.equal(s.listeners.size, 0);
});

test('liquid marker leads with the edge facing its destination and settles exactly', () => {
  const left = { x: 0, y: 40, width: 80, height: 2 }, right = { x: 200, y: 40, width: 60, height: 2 };
  const frames = liquidMarkerFrames(left, right, 'horizontal');
  assert.deepEqual(frames[0], left); assert.deepEqual(frames.at(-1), right);
  const mid = liquidMarkerAt(left, right, 'horizontal', .4);
  // Moving right: the right edge has travelled further than the left edge, so the marker stretches.
  assert.ok((mid.x + mid.width - 80) / (260 - 80) > (mid.x - 0) / 200);
  assert.ok(mid.width > 80 && mid.width > 60);
  assert.equal(mid.y, 40); assert.equal(mid.height, 2);
  const back = liquidMarkerAt(right, left, 'horizontal', .4);
  assert.ok((200 - back.x) / 200 > (260 - (back.x + back.width)) / (260 - 80));
  for (const p of frames) { assert.ok(p.x >= 0 && p.x + p.width <= 260.01); assert.ok(p.width >= 1); }
  const down = liquidMarkerAt({ x: 0, y: 0, width: 3, height: 30 }, { x: 0, y: 120, width: 3, height: 30 }, 'vertical', .4);
  assert.equal(down.x, 0); assert.equal(down.width, 3); assert.ok(down.height > 30);
});

test('selection marker runs liquid frames and an interrupted move restarts from its visible shape', () => {
  const s = surface(), a = s.node('a', 10, 20, 80, 30), b = s.node('b', 210, 20, 60, 30), c = s.node('c', 310, 20, 60, 30);
  s.root.items = [a, b, c];
  const motion = createKeyedListMotion(s.root);
  motion.update(['a', 'b', 'c'], 'a', 'horizontal', true);
  motion.update(['a', 'b', 'c'], 'b', 'horizontal', true);
  const first = s.marker.calls[0];
  assert.equal(first.options.easing, 'linear');
  assert.ok(first.frames.length > 2);
  assert.equal(first.frames[0].transform, 'translate(0px,28px)');
  assert.equal(first.frames.at(-1).transform, 'translate(200px,28px)');
  first.progress = .4;
  motion.update(['a', 'b', 'c'], 'c', 'horizontal', true);
  assert.equal(first.cancelled, true);
  const visible = liquidMarkerAt({ x: 0, y: 28, width: 80, height: 2 }, { x: 200, y: 28, width: 60, height: 2 }, 'horizontal', .4);
  assert.equal(s.marker.calls[1].frames[0].transform, `translate(${visible.x}px,${visible.y}px)`);
  assert.equal(s.marker.calls[1].frames[0].width, `${visible.width}px`);
  assert.equal(s.marker.style.transform, 'translate(300px,28px)');
  motion.dispose();
});

test('charts draw in from their value axis or centre, and stay still under reduced motion', () => {
  assert.equal(chartDrawFrames('bar')[0].clipPath, 'inset(100% 0 0 0)');
  assert.equal(chartDrawFrames('horizontal_bar')[0].clipPath, 'inset(0 100% 0 0)');
  assert.equal(chartDrawFrames('scatter')[0].clipPath, 'inset(0 100% 0 0)');
  assert.match(chartDrawFrames('donut')[0].clipPath, /^circle\(0%/);
  assert.equal(chartDrawFrames('heatmap')[0].opacity, .4);
  for (const kind of ['bar', 'pie', 'heatmap', 'ecdf']) assert.deepEqual(Object.values(chartDrawFrames(kind).at(-1)).some(v => /100%|0 0 0 0|75%|1|blur\(0px\)/.test(String(v))), true);
  const s = surface(), host = s.node('host', 0, 0);
  assert.ok(drawChartIn(host, 'bar'));
  assert.equal(host.calls[0].options.duration, 560);
  s.media.matches = true;
  assert.equal(drawChartIn(host, 'bar'), null);
  s.media.matches = false; s.doc.hidden = true;
  assert.equal(drawChartIn(host, 'bar'), null);
});
