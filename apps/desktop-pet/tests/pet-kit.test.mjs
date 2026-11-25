import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LINES,
  PET_STATES,
  SLASH_COMMANDS,
  mapAgentEventToPetState,
  resolvePetSkin,
  validateSkinManifest,
} from '../src/pet-contract.js';
import {
  petRigCss,
  renderPetFrameOrVector,
  renderVectorRigSvg,
} from '../src/vector-rig.js';
import {
  filterSlashCommands,
  petWidgetCss,
  resolveSpriteFrameUrl,
} from '../src/pet-widget.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KIT_ROOT = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('built-in evix-hound skin and persona validate cleanly', () => {
  const manifest = validateSkinManifest(
    readJson(path.join(KIT_ROOT, 'skins', 'evix-hound', 'skin.json')),
  );
  const persona = readJson(
    path.join(KIT_ROOT, 'skins', 'evix-hound', 'persona.json'),
  );
  const resolved = resolvePetSkin(manifest, persona);

  assert.equal(resolved.id, 'evix-hound');
  assert.equal(resolved.renderer, 'vector-rig');
  assert.equal(resolved.copyrightNotice, 'original-evix-mascot-asset');
  assert.equal(resolved.canvasSize.width, 220);
  assert.equal(resolved.canvasSize.height, 240);
  assert.ok(resolved.persona.displayName.length > 0);
  for (const state of PET_STATES) {
    assert.ok(
      Array.isArray(resolved.persona.lines[state]) &&
        resolved.persona.lines[state].length > 0,
      `missing lines for state: ${state}`,
    );
  }
});

test('local ~/.evix/pet-skins/brian template validates if present on disk', () => {
  const brianDir = path.join(os.homedir(), '.evix', 'pet-skins', 'brian');
  const skinPath = path.join(brianDir, 'skin.json');
  const personaPath = path.join(brianDir, 'persona.json');
  if (!fs.existsSync(skinPath) || !fs.existsSync(personaPath)) return;

  const manifest = validateSkinManifest(readJson(skinPath));
  const persona = readJson(personaPath);
  const resolved = resolvePetSkin(manifest, persona);

  assert.equal(resolved.id, 'brian-local');
  assert.equal(resolved.renderer, 'sprite-frames');
  for (const state of PET_STATES) {
    assert.ok(resolved.states[state]?.frames?.length >= 1, `missing frames for ${state}`);
  }
});

test('renderVectorRigSvg produces articulated SVG and hit zones for all 8 states', () => {
  const manifest = readJson(path.join(KIT_ROOT, 'skins', 'evix-hound', 'skin.json'));
  const resolved = resolvePetSkin(manifest, {});
  const propStates = new Set(['idle', 'working', 'awaiting_approval', 'error', 'done']);
  const fxStates = new Set(['working', 'redteam_alert', 'error', 'thinking', 'done']);

  for (const state of PET_STATES) {
    const svg = renderVectorRigSvg({ state, skin: resolved });
    assert.match(svg, /^<svg\b/);
    assert.ok(svg.includes(`data-state="${state}"`), `missing data-state=${state}`);
    assert.ok(svg.includes('data-bone="head"'), `missing head bone in ${state}`);
    assert.ok(svg.includes('data-bone="torso"'), `missing torso bone in ${state}`);
    assert.ok(svg.includes('data-hit="head"'), `missing head hitzone in ${state}`);
    assert.ok(svg.includes('data-hit="body"'), `missing body hitzone in ${state}`);
    if (propStates.has(state)) {
      assert.ok(svg.includes('data-hit="prop"'), `missing prop hitzone in ${state}`);
    }
    if (fxStates.has(state)) {
      assert.ok(svg.includes('data-bone="fx"'), `missing fx bone in ${state}`);
    }
  }
});

test('renderPetFrameOrVector renders sprite wrapper for defined states and falls back to SVG when frames missing', () => {
  const partialSkin = resolvePetSkin({
    schema: 'evix-pet-skin/v1',
    id: 'partial-test',
    name: 'Partial Sprite',
    renderer: 'sprite-frames',
    states: {
      idle: { fps: 5, frames: ['frames/idle_01.png', 'frames/idle_02.png'] },
    },
  });

  const idleMarkup = renderPetFrameOrVector({
    state: 'idle',
    skin: partialSkin,
    spriteBaseUrl: '/skins/partial-test',
  });
  assert.ok(idleMarkup.includes('evix-pet-sprite'));
  assert.ok(idleMarkup.includes('data-fps="5"'));
  assert.ok(idleMarkup.includes('/skins/partial-test/frames/idle_01.png'));

  const workingFallback = renderPetFrameOrVector({
    state: 'working',
    skin: partialSkin,
    spriteBaseUrl: '/skins/partial-test',
  });
  assert.match(workingFallback, /^<svg\b/);
  assert.ok(workingFallback.includes('data-state="working"'));
});

test('mapAgentEventToPetState prioritizes alerts/approvals and attaches quickActions', () => {
  const redteam = mapAgentEventToPetState({
    status: 'drafting',
    redteamIssues: 3,
    summary: '第 4 章疑似因果推断越界',
  });
  assert.equal(redteam.state, 'redteam_alert');
  assert.ok(redteam.quickActions.some((a) => a.command === '/audit'));

  const approval = mapAgentEventToPetState({
    status: 'running',
    awaitingApproval: true,
    summary: '待审批下一步分析',
  });
  assert.equal(approval.state, 'awaiting_approval');
  assert.ok(approval.quickActions.some((a) => a.command === '/approve'));

  const thinking = mapAgentEventToPetState({ status: 'planning' });
  assert.equal(thinking.state, 'thinking');

  const working = mapAgentEventToPetState({ status: 'drafting' });
  assert.equal(working.state, 'working');

  const done = mapAgentEventToPetState({ status: 'completed' });
  assert.equal(done.state, 'done');

  const failed = mapAgentEventToPetState({ status: 'failed' });
  assert.equal(failed.state, 'error');
});

test('slash command filtering, URL resolution, and CSS builders work deterministically', () => {
  assert.ok(SLASH_COMMANDS.length >= 5);
  assert.deepEqual(
    filterSlashCommands('/au').map((item) => item.cmd),
    ['/audit'],
  );
  assert.equal(filterSlashCommands('normal text').length, 0);

  assert.equal(
    resolveSpriteFrameUrl('./frames/idle_01.png', { spriteBaseUrl: '/pet/brian/' }),
    '/pet/brian/frames/idle_01.png',
  );
  assert.equal(
    resolveSpriteFrameUrl('frames/idle_01.png', {
      frameObjectUrls: { 'frames/idle_01.png': 'blob:https://local/123' },
    }),
    'blob:https://local/123',
  );

  assert.ok(petRigCss('.evix-pet-rig').includes('[data-state="redteam_alert"]'));
  assert.ok(petWidgetCss('.evix-pet-shell').includes('.evix-pet-cmdbar'));
});

test('dialogue, persona, widget copy, and workbench HTML emit zero corner brackets, bare Agent copy, or dictionary colons', () => {
  const persona = readJson(path.join(KIT_ROOT, 'skins', 'evix-hound', 'persona.json'));
  const allDialogue = [
    ...Object.values(DEFAULT_LINES).flat(),
    ...Object.values(persona.lines).flat(),
    mapAgentEventToPetState({ status: 'working' }).summary,
    mapAgentEventToPetState({ status: 'awaiting_approval', awaitingApproval: '问卷发布' }).summary,
  ];
  for (const line of allDialogue) {
    assert.doesNotMatch(line, /[\u3010\u3011\u300c\u300d\u300e\u300f]/u);
    assert.doesNotMatch(line, /\bAgent\b/u);
    assert.doesNotMatch(line, /^[\u4e00-\u9fa5A-Za-z0-9]{2,10}：/u);
  }
  const widgetSrc = fs.readFileSync(path.join(KIT_ROOT, 'src', 'pet-widget.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(KIT_ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(widgetSrc, /[\u3010\u3011\u300c\u300d\u300e\u300f]/u);
  assert.doesNotMatch(htmlSrc, /[\u3010\u3011\u300c\u300d\u300e\u300f]|\bAgent\b/u);
});
