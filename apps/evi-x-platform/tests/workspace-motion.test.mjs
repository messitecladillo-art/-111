import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentReveal, createKeyedListMotion, markerBounds } from '../lib/workspace-motion.ts';

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
