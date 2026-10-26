import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/landing/LandingPage.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const countSource = source.slice(source.indexOf('function CountUp('), source.indexOf('\nfunction Persona('));
const compiledCount = ts.transpileModule(countSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'jsx' },
}).outputText;

// Execute the real private component with controlled hooks, observers and animation frames.
// Browser acceptance separately checks React hydration, CSS and the actual pause button.
function counterHarness(value = 120) {
  const node = { textContent: String(value) };
  const refs = [{ current: node }, { current: null }];
  const frames = new Map();
  const observers = [];
  let cursor = 0, nextFrame = 0, pendingEffect, previousDeps, cleanup;
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; this.unobserved = false; observers.push(this); }
    observe() {}
    unobserve() { this.unobserved = true; }
    disconnect() { this.disconnected = true; }
    fire(isIntersecting) { this.callback([{ isIntersecting, target: node }]); }
  }
  const Count = vm.runInNewContext(`${compiledCount}\nCountUp;`, {
    useRef: () => refs[cursor++],
    useEffect: (effect, deps) => { pendingEffect = { effect, deps }; },
    jsx: () => null,
    IntersectionObserver: Observer,
    performance: { now: () => 0 },
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  return {
    node, frames, observers,
    render(animate, nextValue = value) {
      cursor = 0;
      Count({ value: nextValue, animate });
      const { effect, deps } = pendingEffect;
      if (!previousDeps || deps.some((entry, index) => !Object.is(entry, previousDeps[index]))) {
        cleanup?.();
        cleanup = effect();
        previousDeps = deps;
      }
    },
    frame(time) { const scheduled = [...frames.values()]; frames.clear(); for (const callback of scheduled) callback(time); },
    unmount() { cleanup?.(); cleanup = undefined; },
  };
}

test('pausing a count cancels pending work and settles the exact final value without replay', () => {
  const harness = counterHarness();
  harness.render(true);
  harness.observers[0].fire(true);
  harness.frame(100);
  assert.ok(Number(harness.node.textContent) > 0 && Number(harness.node.textContent) < 120);
  assert.equal(harness.frames.size, 1);
  harness.render(false);
  assert.equal(harness.node.textContent, '120');
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.observers[0].disconnected, true);
  harness.render(true);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.observers.length, 1);
  assert.equal(harness.node.textContent, '120');
});

test('leaving the viewport interrupts a count and re-entry does not restart it', () => {
  const harness = counterHarness();
  harness.render(true);
  const observer = harness.observers[0];
  observer.fire(false);
  assert.equal(harness.frames.size, 0);
  observer.fire(true);
  harness.frame(200);
  observer.fire(false);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.node.textContent, '120');
  assert.equal(observer.unobserved, true);
  observer.fire(true);
  assert.equal(harness.frames.size, 0);
});

test('late observer and frame callbacks cannot mutate a disposed count', () => {
  const harness = counterHarness();
  harness.render(true);
  const observer = harness.observers[0];
  observer.fire(true);
  const staleFrame = [...harness.frames.values()][0];
  harness.unmount();
  observer.fire(true);
  staleFrame(300);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.node.textContent, '120');
  assert.equal(observer.disconnected, true);
});

test('disabled motion starts with the real value; an updated metric can animate once', () => {
  const harness = counterHarness();
  harness.render(false);
  assert.equal(harness.node.textContent, '120');
  assert.equal(harness.frames.size, 0);
  harness.observers[0].fire(false);
  harness.render(true);
  harness.observers[1].fire(true);
  harness.frame(1600);
  assert.equal(harness.node.textContent, '120');
  assert.equal(harness.frames.size, 0);
  harness.render(true, 32);
  harness.observers[2].fire(true);
  harness.frame(1600);
  assert.equal(harness.node.textContent, '32');
});

test('a number already seen while paused is never counted again after resume', () => {
  const harness = counterHarness();
  harness.render(false);
  harness.observers[0].fire(true);
  assert.equal(harness.node.textContent, '120');
  assert.equal(harness.frames.size, 0);
  harness.render(true);
  assert.equal(harness.observers.length, 1);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.node.textContent, '120');
});

test('page visibility subscription reports hidden and visible transitions and unsubscribes', () => {
  const listeners = new Set();
  const document = {
    hidden: false,
    addEventListener: (type, listener) => { assert.equal(type, 'visibilitychange'); listeners.add(listener); },
    removeEventListener: (type, listener) => { assert.equal(type, 'visibilitychange'); listeners.delete(listener); },
  };
  const start = source.indexOf('function subscribeVisibility(');
  const end = source.indexOf('\n\n', start);
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { subscribe, snapshot } = vm.runInNewContext(`${js}\n({subscribe:subscribeVisibility,snapshot:pageVisibleSnapshot});`, { document });
  const values = [];
  const unsubscribe = subscribe(() => values.push(snapshot()));
  document.hidden = true;
  for (const listener of listeners) listener();
  document.hidden = false;
  for (const listener of listeners) listener();
  assert.deepEqual(values, [false, true]);
  unsubscribe();
  assert.equal(listeners.size, 0);
});
