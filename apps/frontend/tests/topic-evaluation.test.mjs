import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { extractTopicFeatures } from '../lib/topic-advisor/core.ts';
import { parseTopicBundle, stableStringify } from '../lib/topic-advisor/parse.ts';
import { strictJson, sha256, parseScenarioPack, parseLabels as parseReviewLabels, auditScenarioIsolation, verifyManifest, loadFrozenEvaluation, evaluateFrozen, wilsonInterval, PRODUCTION_FILES, EVALUATION_FILES } from '../scripts/topic-evaluation.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = p => strictJson(fs.readFileSync(path.join(root, p), 'utf8'));
const content = 'apps/frontend/content/topic-advisor/';
const bundle = parseTopicBundle({ catalog: read(content + 'catalog.json'), sources: read(content + 'sources.json'), events: read(content + 'hotspot-events.json'), model: read(content + 'ranker.json') });
const pack = read('evals/topic-advisor/scenarios-v1.json'), labels = read('evals/topic-advisor/labels-v1.json'), reviews = read('evals/topic-advisor/reviews-v1.json');
const bindings = read('evals/topic-advisor/reviewer-bindings-v1.json'), frozenAt = read('evals/topic-advisor/manifest-v1.json').frozenAt;
const parseLabels = (l, p, b, r, registry = bindings, time = frozenAt) => parseReviewLabels(l, p, b, r, registry, time);
const clone = structuredClone;
const refreshReviewHashes = (receipts, registry) => receipts.forEach(r => { r.reviewSha256 = sha256(Buffer.from(stableStringify(r.review))); if (registry) registry.reviewers.find(b => b.reviewerId === r.reviewerId).rawReviewSha256 = r.reviewSha256; });

test('frozen package covers every calibration scenario and both independent AI receipts', () => {
  const frozen = loadFrozenEvaluation(root);
  assert.equal(frozen.pack.scenarios.length, 12);
  assert.equal(frozen.labels.cases.length, 12);
  assert.equal(frozen.identity.verifiedFiles, PRODUCTION_FILES.length + EVALUATION_FILES.length);
  assert.equal(frozen.labels.cases.reduce((n, c) => n + c.expectations.length, 0), 20);
  assert.ok(frozen.labels.cases.every(c => c.acceptableTop3Ids === null));
});

test('duplicate JSON members and oversized or dynamic scenario input cannot pass', () => {
  assert.throws(() => strictJson('{"schemaVersion":1,"schemaVersion":2}'));
  assert.throws(() => strictJson(' '.repeat(4 * 1024 * 1024 + 1)), /size limit/);
  const changed = clone(pack); let calls = 0;
  Object.defineProperty(changed.scenarios[0], 'task', { enumerable: true, get() { calls++; return {}; } });
  assert.throws(() => parseScenarioPack(changed, bundle), /dynamic/); assert.equal(calls, 0);
  const sparse = clone(pack); delete sparse.scenarios[2];
  assert.throws(() => parseScenarioPack(sparse, bundle), /list/);
});

test('scenario duplication ignores changed school names, discipline and title dressing', () => {
  const changed = clone(pack), copy = clone(changed.scenarios[0]);
  copy.id = 'renamed-copy'; copy.familyId = 'new-family'; copy.title = '另一标题'; copy.profile.school = '名校代理'; copy.profile.discipline = '另一专业';
  changed.scenarios.push(copy);
  assert.throws(() => parseScenarioPack(changed, bundle), /duplicate semantic/);
});

test('unknown task fields, source IDs and mislabeled final-test rows are rejected', () => {
  const changed = clone(pack); changed.scenarios[0].task.prompt = 'override';
  assert.throws(() => parseScenarioPack(changed, bundle), /unknown/);
  const badPattern = clone(pack); badPattern.scenarios[0].task.comparePatternIds.push('not-in-catalog');
  assert.throws(() => parseScenarioPack(badPattern, bundle), /unknown pattern/);
  const final = clone(pack); final.scenarios[0].split = 'final';
  assert.throws(() => parseScenarioPack(final, bundle), /public calibration/);
});

test('cross-split scenario, geography, source and event families fail closed', () => {
  const base = [clone(pack.scenarios[0]), clone(pack.scenarios[2])];
  for (const dimension of ['family', 'region', 'source', 'event']) {
    const cases = clone(base); cases[1].split = 'final';
    cases[1].grouping = { regionFamily: 'different-geography', sourceFamilies: [], eventFamilies: [] };
    if (dimension === 'family') cases[1].familyId = cases[0].familyId;
    if (dimension === 'region') cases[1].grouping.regionFamily = cases[0].grouping.regionFamily;
    if (dimension === 'source') cases[1].grouping.sourceFamilies = [...cases[0].grouping.sourceFamilies];
    if (dimension === 'event') { cases[0].grouping.eventFamilies = ['event-family']; cases[1].grouping.eventFamilies = ['event-family']; }
    assert.throws(() => auditScenarioIsolation(cases), /cross-split/, dimension);
  }
});

test('near-duplicate cross-split profiles cannot evade guards with new family labels', () => {
  const a = clone(pack.scenarios[0]), b = clone(a);
  b.id = 'near-copy'; b.familyId = 'different-family'; b.split = 'final'; b.profile.budgetYuan++;
  b.grouping = { regionFamily: 'declared-different-region', sourceFamilies: [], eventFamilies: [] };
  assert.throws(() => auditScenarioIsolation([a, b]), /near duplicate/);
});

test('reordering membership-only fields cannot create another independent research scenario', () => {
  const a = clone(pack.scenarios[0]);
  a.profile.schoolContext = ['campus', 'service', 'retail']; a.profile.domains = ['economy', 'society']; a.profile.interests = ['餐食', '排队', '价格'];
  const b = clone(a); b.id = 'reordered'; b.familyId = 'unrelated';
  for (const key of ['schoolContext', 'domains', 'interests']) b.profile[key].reverse();
  b.task.comparePatternIds.reverse();
  for (const p of bundle.catalog.patterns) assert.deepEqual(extractTopicFeatures(p, a.profile, bundle.events, bundle.sources), extractTopicFeatures(p, b.profile, bundle.events, bundle.sources));
  assert.throws(() => auditScenarioIsolation([a, b]), /duplicate semantic/);
  b.split = 'final'; b.grouping = { regionFamily: 'unrelated-region', sourceFamilies: [], eventFamilies: [] };
  assert.throws(() => auditScenarioIsolation([a, b]), /duplicate semantic/);
});

test('v2 leftover region text and interest width/case do not evade equivalence guards', () => {
  const a = clone(pack.scenarios[0]); a.profile.interests = ['ＡＩ'];
  const b = clone(a); b.id = 'other-display'; b.profile.region = '残留省份'; b.profile.city = '残留城市'; b.profile.interests = ['ai'];
  assert.throws(() => auditScenarioIsolation([a, b]), /duplicate semantic/);
});

test('pending, missing and duplicate label rows cannot be counted as evaluated', () => {
  const pending = clone(labels); pending.status = 'pending';
  assert.throws(() => parseLabels(pending, pack, bundle, reviews), /pending/);
  const missing = clone(labels); missing.cases.pop();
  assert.throws(() => parseLabels(missing, pack, bundle, reviews), /every scenario/);
  const duplicate = clone(labels); duplicate.cases.push(clone(duplicate.cases[0]));
  assert.throws(() => parseLabels(duplicate, pack, bundle, reviews), /duplicate/);
});

test('self-review, duplicated actors and drifted independent review bodies are rejected', () => {
  const self = clone(labels); self.adjudicator = self.reviewerIds[0];
  assert.throws(() => parseLabels(self, pack, bundle, reviews), /distinct independent/);
  const actors = clone(reviews); actors[1].actor = actors[0].actor;
  assert.throws(() => parseLabels(labels, pack, bundle, actors), /distinct actors|binding/);
  const changed = clone(reviews); changed[0].review.cases[0].expectations[0].status = 'blocked';
  assert.throws(() => parseLabels(labels, pack, bundle, changed), /body hash drift/);
});

test('coordinator cannot add an expectation absent from either independent receipt', () => {
  const receipts = clone(reviews), registry = clone(bindings);
  receipts[1].review.cases[0].expectations = receipts[1].review.cases[0].expectations.filter(e => e.kind !== 'school_invariant');
  refreshReviewHashes(receipts, registry);
  assert.throws(() => parseLabels(labels, pack, bundle, receipts, registry), /lacks both/);
});

test('embedded review replay and incomplete envelopes are rejected even if a new body hash is computed', () => {
  const copied = clone(reviews), registry = clone(bindings); copied[1].review = clone(copied[0].review);
  refreshReviewHashes(copied, registry);
  assert.throws(() => parseLabels(labels, pack, bundle, copied, registry), /binding mismatch|replayed/);
  const bare = clone(reviews), bareRegistry = clone(bindings); bare[1].review = { cases: bare[1].review.cases };
  refreshReviewHashes(bare, bareRegistry);
  assert.throws(() => parseLabels(labels, pack, bundle, bare, bareRegistry), /envelope missing/);
});

test('embedded scenario/base identities and review chronology must match the actual frozen receipt', () => {
  for (const [field, value] of [['scenarioSha256', '0'.repeat(64)], ['baseRevision', '0'.repeat(40)]]) {
    const r = clone(reviews), registry = clone(bindings); r[0].review[field] = value; refreshReviewHashes(r, registry);
    assert.throws(() => parseLabels(labels, pack, bundle, r, registry), /scenario\/base\/time/);
  }
  const future = clone(reviews), registry = clone(bindings); future[0].issuedAt = future[0].review.issuedAt = '2027-01-01T00:00:00Z';
  refreshReviewHashes(future, registry);
  assert.throws(() => parseLabels(labels, pack, bundle, future, registry), /chronology/);
  assert.throws(() => parseLabels(labels, pack, bundle, reviews, bindings, '2026-10-15T19:59:00Z'), /chronology/);
});

test('missing or unknown embedded confidence and empty provenance cannot become reviewed labels', () => {
  for (const confidence of [undefined, 'unrecognized']) {
    const r = clone(reviews), registry = clone(bindings);
    for (const receipt of r) for (const c of receipt.review.cases) for (const e of c.expectations) {
      if (confidence === undefined) delete e.confidence; else e.confidence = confidence;
    }
    refreshReviewHashes(r, registry);
    assert.throws(() => parseLabels(labels, pack, bundle, r, registry), /lacks both/);
  }
  const noRefs = clone(labels); noRefs.cases[0].expectations[0].sourceRefs = [];
  assert.throws(() => parseLabels(noRefs, pack, bundle, reviews), /nonempty/);
  const invented = clone(labels); invented.cases[0].expectations[0].sourceRefs.push('invented-source');
  assert.throws(() => parseLabels(invented, pack, bundle, reviews), /reference absent/);
});

test('unsupported Top3 labels cannot manufacture a quality denominator', () => {
  const changed = clone(labels); changed.cases[0].acceptableTop3Ids = ['p01-campus-food'];
  assert.throws(() => parseLabels(changed, pack, bundle, reviews), /Top3 label lacks both/);
});

test('missing fields and opposing preferences are rejected even with edited receipts', () => {
  const missing = clone(labels); delete missing.cases[0].expectations[0].patternId;
  assert.throws(() => parseLabels(missing, pack, bundle, reviews), /missing expectation/);
  const changed = clone(labels), receipts = clone(reviews), registry = clone(bindings), original = changed.cases[0].expectations.find(e => e.kind === 'pairwise');
  const opposite = { ...original, preferredPatternId: original.rejectedPatternId, rejectedPatternId: original.preferredPatternId };
  changed.cases[0].expectations.push(opposite);
  for (const r of receipts) r.review.cases[0].expectations.push(clone(opposite));
  refreshReviewHashes(receipts, registry);
  assert.throws(() => parseLabels(changed, pack, bundle, receipts, registry), /reversed preference/);
});

test('a review cannot contain contradictory status claims', () => {
  const changed = clone(labels), receipts = clone(reviews), registry = clone(bindings), opposite = { ...changed.cases[0].expectations[0], status: 'blocked' };
  changed.cases[0].expectations.push(opposite);
  for (const r of receipts) r.review.cases[0].expectations.push(clone(opposite));
  refreshReviewHashes(receipts, registry);
  assert.throws(() => parseLabels(changed, pack, bundle, receipts, registry), /contradictory/);
});

test('manifest requires exact frozen implementation, catalogue, training and review files', () => {
  const manifest = read('evals/topic-advisor/manifest-v1.json');
  const drift = clone(manifest); drift.files[PRODUCTION_FILES[0]] = '0'.repeat(64);
  assert.throws(() => verifyManifest(root, drift), /hash drift/);
  const missing = clone(manifest); delete missing.files[PRODUCTION_FILES[0]];
  assert.throws(() => verifyManifest(root, missing), /omits/);
  const escape = clone(manifest); escape.files['../secret'] = '0'.repeat(64);
  assert.throws(() => verifyManifest(root, escape), /unknown/);
});

test('hard-linked evaluation input is rejected; scratch cleanup stays inside created temp directory', t => {
  const prefix = 'evix-topic-eval-', dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => {
    const absolute = path.resolve(dir);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir())); assert.ok(path.basename(absolute).startsWith(prefix));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  const manifest = read('evals/topic-advisor/manifest-v1.json');
  for (const relative of [...PRODUCTION_FILES, ...EVALUATION_FILES]) {
    const target = path.join(dir, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, relative), target);
  }
  fs.linkSync(path.join(dir, PRODUCTION_FILES[0]), path.join(dir, 'linked-copy.ts'));
  assert.throws(() => verifyManifest(dir, manifest), /linked input/);
});

test('Wilson intervals distinguish zero measured cases from zero successful cases', () => {
  assert.equal(wilsonInterval(0, 0), null);
  assert.ok(wilsonInterval(0, 10).upper > 0); assert.ok(wilsonInterval(10, 10).lower < 1);
  assert.throws(() => wilsonInterval(11, 10), /counts/);
});

test('two frozen baselines retain honesty, abstention and constant-feature diagnostics', () => {
  const before = fs.readFileSync(path.join(root, content, 'ranker.json'));
  const report = evaluateFrozen(loadFrozenEvaluation(root));
  assert.equal(report.trainingPerformed, false); assert.equal(report.productionRankerChanged, false);
  assert.equal(report.independentFinalTestScenarios, 0); assert.equal(report.plannedIndependentScenarios, 90);
  assert.equal(report.editorialCalibrationScenarios, 12);
  for (const baseline of report.baselines) {
    assert.equal(baseline.scenarios, 12); assert.equal(baseline.checks, 20);
    assert.equal(baseline.top3.denominator, 0); assert.equal(baseline.top3.rate, null); assert.equal(baseline.top3.interval95, null);
    assert.equal(baseline.pairwise.bothEligiblePairs, 0);
    assert.equal(baseline.recommendationScenarios, 3);
    assert.deepEqual(baseline.abstentions, { emptyRecommendations: 1, denominator: 3, expectedScenarios: 1, honoured: 1 });
    assert.ok(baseline.cases.filter(c => c.taskKind !== 'recommendations').every(c => !Object.hasOwn(c, 'top3')));
    assert.equal(baseline.cases.find(c => c.id === 'cal04-zero-days').offered, 0);
    const candidate = baseline.cases.find(c => c.id === 'cal11-free-topic').candidate;
    assert.equal(candidate.trainedQualityScore, null); assert.equal(candidate.feasibility, 'conditional');
  }
  for (const name of ['decisionClarity', 'evidenceDesign', 'differentiation', 'actionability']) {
    const row = report.featureAudit.find(r => r.name === name);
    assert.equal(row.minimum, 1); assert.equal(row.maximum, 1); assert.equal(row.weight, 0); assert.equal(row.nonzeroPreferenceDifferences, 0);
  }
  assert.deepEqual(fs.readFileSync(path.join(root, content, 'ranker.json')), before);
});

test('controlled positive-denominator metric probes keep ranking scope and make Top3 misses fail', () => {
  // Tests metric arithmetic only; these in-memory mutations are not new reviewed calibration labels.
  const frozen = loadFrozenEvaluation(root), changed = clone(frozen);
  changed.labels.cases[0].acceptableTop3Ids = ['p18-suzhou-inbound'];
  const report = evaluateFrozen(changed);
  assert.equal(report.passed, false);
  for (const b of report.baselines) {
    assert.equal(b.top3.denominator, 1); assert.equal(b.top3.coverage, 1 / 3); assert.equal(b.top3.successes, 0);
    assert.equal(b.cases[0].passed, false); assert.equal(b.cases[0].checks.find(c => c.kind === 'top3_acceptable').passed, false);
  }
});

test('ties between two eligible directions do not become wins through alphabetical ID order', () => {
  const changed = clone(loadFrozenEvaluation(root));
  const scenario = changed.pack.scenarios[0], label = changed.labels.cases[0];
  changed.pack.scenarios = [scenario]; changed.labels.cases = [label];
  label.expectations = [{ kind: 'pairwise', preferredPatternId: 'p01-campus-food', rejectedPatternId: 'p02-campus-reuse' }];
  label.acceptableTop3Ids = null; changed.bundle.model.weights.fill(0);
  const b = evaluateFrozen(changed).baselines[0];
  assert.equal(b.pairwise.bothEligiblePairs, 1); assert.equal(b.pairwise.ties, 1); assert.equal(b.pairwise.wins, 0);
  assert.equal(b.cases[0].passed, false);
});

test('inherited property names cannot drop a stratum or alter built-in objects', () => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    const changed = clone(loadFrozenEvaluation(root)); changed.pack.scenarios[0].stratum = name;
    const before = Object.getOwnPropertyDescriptors(Object);
    for (const b of evaluateFrozen(changed).baselines) {
      assert.equal(Object.values(b.strata).reduce((n, s) => n + s.scenarios, 0), 12);
      assert.equal(Object.hasOwn(b.strata, name), true); assert.equal(b.strata[name].scenarios, 1);
    }
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object), before);
  }
});

test('all frozen inputs survive Git clean filters with an explicit byte policy', () => {
  for (const file of PRODUCTION_FILES) {
    const blob = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
    assert.deepEqual(fs.readFileSync(path.join(root, file)), blob, file);
  }
  const frozenFiles = [...PRODUCTION_FILES, ...EVALUATION_FILES];
  const reviewedRawFixture = 'evals/topic-advisor/scenarios-v1.json';
  for (const file of frozenFiles) {
    const bytes = fs.readFileSync(path.join(root, file));
    const options = { cwd: root, input: bytes, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 };
    const stored = execFileSync('git', ['hash-object', '--path', file, '--stdin'], options).trim();
    const raw = execFileSync('git', ['hash-object', '--no-filters', '--stdin'], options).trim();
    assert.equal(stored, raw, `Git would transform frozen bytes: ${file}`);
    const attributes = execFileSync('git', ['check-attr', 'text', 'eol', '--', file], { cwd: root, encoding: 'utf8' });
    if (file === reviewedRawFixture) {
      assert.match(attributes, /: text: unset/u);
      assert.match(attributes, /: eol: unset/u);
    } else assert.match(attributes, /: eol: lf/u);
  }
});

test('artifact seal time cannot precede archived label freeze', () => {
  const manifest = clone(read('evals/topic-advisor/manifest-v1.json'));
  manifest.sealedAt = '2020-01-01T00:00:00Z';
  assert.throws(() => verifyManifest(root, manifest), /seal predates/u);
  delete manifest.sealedAt;
  assert.throws(() => verifyManifest(root, manifest), /artifact seal time/u);
});

test('CLI is cwd-independent, deterministic and rejects arbitrary input/output paths', () => {
  const script = path.join(root, 'apps/frontend/scripts/evaluate-topic-advisor.mjs');
  const run = (...args) => spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], { cwd: os.tmpdir(), encoding: 'utf8', windowsHide: true });
  const verify = run('--verify'); assert.equal(verify.status, 0, verify.stderr); assert.equal(JSON.parse(verify.stdout).status, 'verified');
  const first = run(), second = run(); assert.equal(first.status, second.status); assert.equal(first.stdout, second.stdout);
  const bad = run('--output', '../unexpected.json'); assert.equal(bad.status, 2);
});
