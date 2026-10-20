/** Offline public calibration. Never imported by product UI or ranker training. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { rejectDuplicateMembers } from '../lib/questionnaire.ts';
import { parseTopicProfile, parseTopicCandidate, parseTopicBundle, stableStringify } from '../lib/topic-advisor/parse.ts';
import { recommendTopics, assessTopicPattern, evaluateCandidate, eventLeadsForProfile, extractTopicFeatures } from '../lib/topic-advisor/core.ts';
import { FEATURE_NAMES } from '../lib/topic-advisor/types.ts';

export const PRODUCTION_FILES = Object.freeze([
  'apps/frontend/lib/topic-advisor/core.ts', 'apps/frontend/lib/topic-advisor/types.ts',
  'apps/frontend/lib/topic-advisor/parse.ts', 'apps/frontend/lib/topic-advisor/geography.ts',
  'apps/frontend/lib/topic-advisor/regions.ts', 'apps/frontend/lib/questionnaire.ts',
  'apps/frontend/lib/topic-advisor/training.ts', 'apps/frontend/scripts/train-topic-advisor.mjs',
  ...['catalog', 'sources', 'hotspot-events', 'ranker', 'train', 'regions.catalog'].map(n => `apps/frontend/content/topic-advisor/${n}.json`),
]);
const ARCHIVED_MANIFEST = 'evals/topic-advisor/manifest-v1.json';
export const EVALUATION_FILES = Object.freeze([
  'evals/topic-advisor/scenarios-v1.json', 'evals/topic-advisor/labels-v1.json', 'evals/topic-advisor/reviews-v1.json',
  'evals/topic-advisor/reviewer-bindings-v1.json', '.gitattributes',
  'apps/frontend/scripts/topic-evaluation.mjs', 'apps/frontend/scripts/evaluate-topic-advisor.mjs',
  ARCHIVED_MANIFEST,
]);
// Only packaging/verifier bytes changed. Labels, reviews, training and scoring code retain the v1 hashes.
const MIGRATION_CHANGED_FILES = Object.freeze(['.gitattributes', 'apps/frontend/scripts/topic-evaluation.mjs']);
const archivedPath = relative => relative.replace(/^apps\/frontend\//u, 'apps/evi-x-platform/');
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/u;
const SHA = /^[0-9a-f]{64}$/u;
const SPLITS = ['calibration', 'development', 'final'];
const CHECK_FIELDS = Object.freeze({
  feasibility: ['patternId', 'status'], pairwise: ['preferredPatternId', 'rejectedPatternId'], event: ['eventId', 'status'],
  no_ready: [], abstain: [], school_invariant: [], no_current_events: [], profile_rejected: [], candidate_status: ['status'], candidate_unscored: [],
});
const expectationKey = e => stableStringify(Object.fromEntries(['kind', ...(CHECK_FIELDS[e.kind] ?? [])].map(k => [k, e[k]])));
const fail = message => { throw new Error(`Topic evaluation: ${message}`); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function strictJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024) fail('JSON size limit');
  rejectDuplicateMembers(text);
  return JSON.parse(text);
}
function object(value, keys, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${where}: object required`);
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string' || !keys.includes(k) || !Object.getOwnPropertyDescriptor(value, k).enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value'))) fail(`${where}: unknown or dynamic member`);
  return value;
}
function identifier(value, where) { if (typeof value !== 'string' || !ID.test(value)) fail(`${where}: invalid ID`); return value; }
function text(value, where, max = 1600) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${where}: invalid text`); return value; }
function list(value, where, max = 100) {
  if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail(`${where}: invalid list`);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(`${where}: sparse or dynamic list`);
  }
  return value;
}
function ids(value, where) { const result = list(value, where).map(v => identifier(v, where)); if (new Set(result).size !== result.length) fail(`${where}: duplicate ID`); return result; }
function choice(value, allowed, where) { if (!allowed.includes(value)) fail(`${where}: unsupported value`); return value; }
function hash(value, where) { if (typeof value !== 'string' || !SHA.test(value)) fail(`${where}: invalid SHA-256`); return value; }
function dateTime(value, where) { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/u.test(value) || !Number.isFinite(Date.parse(value))) fail(`${where}: timezone-aware timestamp required`); return value; }

/** Ignores school/discipline/title dressing when looking for duplicate tasks. */
function canonicalTask(scenario) {
  const profile = parseTopicProfile(scenario.profile);
  const task = { ...scenario.task }; delete task.counterfactualSchool;
  const set = values => [...new Set(values.map(v => v.normalize('NFKC').trim().toLowerCase()))].sort();
  for (const key of ['schoolContext', 'interests', 'domains']) profile[key] = set(profile[key]);
  if (profile.schemaVersion === 2) { profile.region = ''; profile.city = ''; }
  else { profile.region = profile.region.normalize('NFKC').trim(); profile.city = profile.city.normalize('NFKC').trim(); }
  for (const key of ['comparePatternIds', 'eventIds']) if (task[key]) task[key] = [...task[key]].sort();
  if (task.candidate) {
    task.candidate = parseTopicCandidate(task.candidate);
    for (const key of ['accessNeeds', 'resourceNeeds', 'differentiators']) task.candidate[key] = set(task.candidate[key]);
  }
  return { profile: { ...profile, school: '', discipline: '' }, task };
}
function tokens(value, prefix = '', out = new Set()) {
  if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) tokens(entry, `${prefix}.${key}`, out);
  else if (value !== '' && value !== null) out.add(`${prefix}=${JSON.stringify(value)}`);
  return out;
}
export function auditScenarioIsolation(scenarios) {
  const seen = new Set(), semantic = new Map(), nearDuplicates = [];
  for (const s of scenarios) {
    if (seen.has(s.id)) fail(`duplicate scenario ID ${s.id}`); seen.add(s.id);
    choice(s.split, SPLITS, 'split');
    const key = stableStringify(canonicalTask(s));
    if (semantic.has(key)) fail(`duplicate semantic scenario ${semantic.get(key)} / ${s.id}`);
    semantic.set(key, s.id);
  }
  for (let i = 0; i < scenarios.length; i++) for (let j = i + 1; j < scenarios.length; j++) {
    const a = scenarios[i], b = scenarios[j], cross = a.split !== b.split;
    if (cross) {
      if (a.familyId === b.familyId) fail(`cross-split scenario family ${a.id} / ${b.id}`);
      if (a.grouping.regionFamily === b.grouping.regionFamily) fail(`cross-split region family ${a.id} / ${b.id}`);
      for (const key of ['sourceFamilies', 'eventFamilies']) if (a.grouping[key].some(v => b.grouping[key].includes(v))) fail(`cross-split ${key} ${a.id} / ${b.id}`);
    }
    const at = tokens(canonicalTask(a)), bt = tokens(canonicalTask(b));
    const intersection = [...at].filter(v => bt.has(v)).length;
    const similarity = intersection / Math.max(1, at.size + bt.size - intersection);
    if (similarity >= .9) {
      const row = { a: a.id, b: b.id, similarity: Number(similarity.toFixed(6)), crossSplit: cross };
      if (cross) fail(`cross-split near duplicate ${a.id} / ${b.id}`);
      nearDuplicates.push(row);
    }
  }
  return { duplicateScenarios: 0, crossSplitFamilyLeaks: 0, crossSplitNearDuplicates: 0, withinSplitNearDuplicates: nearDuplicates, threshold: .9 };
}

export function parseScenarioPack(raw, bundle) {
  const p = object(raw, ['schemaVersion', 'packId', 'dataClass', 'purpose', 'targetIndependentScenarios', 'labelPolicy', 'scenarios'], 'pack');
  if (p.schemaVersion !== 1 || p.dataClass !== 'authored_synthetic' || p.purpose !== 'public_calibration') fail('only authored public calibration v1 is supported; no sealed-test claim');
  identifier(p.packId, 'packId'); text(p.labelPolicy, 'labelPolicy');
  if (!Number.isInteger(p.targetIndependentScenarios) || p.targetIndependentScenarios < 1) fail('invalid future coverage target');
  const patterns = new Set(bundle.catalog.patterns.map(v => v.id)), events = new Set(bundle.events.events.map(v => v.id));
  const patternId = id => { if (!patterns.has(id)) fail(`unknown pattern ${id}`); };
  for (const s of list(p.scenarios, 'scenarios', 500)) {
    object(s, ['id', 'familyId', 'stratum', 'title', 'classification', 'split', 'grouping', 'profile', 'task', 'designRationale'], 'scenario');
    identifier(s.id, 'scenario ID'); identifier(s.familyId, 'family ID'); identifier(s.stratum, 'stratum'); text(s.title, 'title'); text(s.designRationale, 'rationale');
    if (s.classification !== 'authored_synthetic' || s.split !== 'calibration') fail('public calibration cannot contain a training or final-test row');
    object(s.grouping, ['regionFamily', 'sourceFamilies', 'eventFamilies'], 'grouping');
    identifier(s.grouping.regionFamily, 'region family'); ids(s.grouping.sourceFamilies, 'source families'); ids(s.grouping.eventFamilies, 'event families');
    parseTopicProfile(s.profile); // Old directory references are valid historical inputs; execution may reject them.
    const t = object(s.task, ['kind', 'patternId', 'eventIds', 'candidate', 'comparePatternIds', 'counterfactualSchool'], 'task');
    choice(t.kind, ['recommendations', 'pattern', 'events', 'candidate', 'profile'], 'task kind');
    const allowed = { recommendations: ['kind', 'comparePatternIds', 'counterfactualSchool'], pattern: ['kind', 'patternId'], events: ['kind', 'eventIds'], candidate: ['kind', 'candidate'], profile: ['kind'] }[t.kind];
    if (Object.keys(t).some(key => !allowed.includes(key))) fail('task fields do not match kind');
    if (t.kind === 'pattern') patternId(t.patternId);
    if (t.comparePatternIds) ids(t.comparePatternIds, 'comparison patterns').forEach(patternId);
    if (t.counterfactualSchool) text(t.counterfactualSchool, 'counterfactual school', 120);
    if (t.eventIds) for (const id of ids(t.eventIds, 'event IDs')) if (!events.has(id)) fail(`unknown event ${id}`);
    if (t.kind === 'candidate') parseTopicCandidate(t.candidate);
  }
  if (!p.scenarios.length) fail('empty calibration pack');
  auditScenarioIsolation(p.scenarios);
  return p;
}

function rawEnvelope(review) {
  const get = names => {
    const present = names.filter(n => Object.hasOwn(review, n));
    if (present.length !== 1) fail(`raw review envelope missing or ambiguous ${names[0]}`);
    return review[present[0]];
  };
  return {
    protocol: get(['protocolVersion', 'protocol_version']), runId: get(['runId', 'run_id']), taskId: get(['taskId', 'task_id']),
    sender: get(['sender', 'sender_id']), receiver: get(['receiver', 'recipient_id']), nonce: get(['nonce']),
    idempotencyKey: get(['idempotencyKey', 'idempotency_key']), issuedAt: get(['issuedAt', 'issued_at']),
    expiresAt: get(['expiry', 'expires_at']), baseRevision: get(['baseRevision', 'base_revision']),
    scenarioSha256: get(['scenarioSha256']), state: get(['resultStatus', 'status']),
  };
}
export function parseLabels(raw, pack, bundle, reviews, bindings, frozenAt) {
  const l = object(raw, ['schemaVersion', 'packId', 'scenarioSha256', 'status', 'labelClass', 'adjudicator', 'reviewerIds', 'cases'], 'labels');
  if (l.schemaVersion !== 1 || l.packId !== pack.packId || l.status !== 'reviewed' || l.labelClass !== 'ai_editorial_calibration') fail('labels are pending, mismatched, or misclassified');
  hash(l.scenarioSha256, 'scenario hash'); identifier(l.adjudicator, 'adjudicator');
  const reviewerIds = ids(l.reviewerIds, 'reviewer IDs');
  if (reviewerIds.length < 2 || reviewerIds.includes(l.adjudicator)) fail('two distinct independent reviewers required');
  if (!Array.isArray(reviews) || reviews.length !== reviewerIds.length) fail('review receipts missing');
  object(bindings, ['schemaVersion', 'packId', 'baseRevision', 'issuedAt', 'reviewers'], 'reviewer bindings');
  if (bindings.schemaVersion !== 1 || bindings.packId !== pack.packId || !/^[a-f0-9]{40}$/u.test(bindings.baseRevision)) fail('invalid reviewer binding registry');
  dateTime(bindings.issuedAt, 'dispatch time'); dateTime(frozenAt, 'freeze time');
  list(bindings.reviewers, 'reviewer registry', 10);
  if (bindings.reviewers.length !== reviewerIds.length || new Set(bindings.reviewers.map(r => r.reviewerId)).size !== reviewerIds.length) fail('reviewer registry coverage');
  const rawSenders = new Set(), nonces = new Set(), attempts = new Set();
  for (const r of reviews) {
    object(r, ['reviewerId', 'actor', 'kind', 'scenarioSha256', 'status', 'issuedAt', 'reviewSha256', 'review'], 'review receipt');
    if (!reviewerIds.includes(r.reviewerId) || r.kind !== 'ai' || r.status !== 'completed' || r.scenarioSha256 !== l.scenarioSha256) fail('review identity/status/input mismatch');
    identifier(r.actor, 'review actor'); dateTime(r.issuedAt, 'review time'); hash(r.reviewSha256, 'review hash');
    if (sha256(Buffer.from(stableStringify(r.review))) !== r.reviewSha256) fail('review body hash drift');
    const binding = bindings.reviewers.find(b => b.reviewerId === r.reviewerId);
    if (!binding) fail('unknown review binding');
    object(binding, ['reviewerId', 'actor', 'protocol', 'runId', 'taskId', 'sender', 'receiver', 'nonce', 'idempotencyKey', 'rawReviewSha256'], 'review binding');
    if (binding.actor !== r.actor || binding.rawReviewSha256 !== r.reviewSha256) fail('review body does not match coordinator-pinned binding');
    const envelope = rawEnvelope(r.review);
    for (const key of ['protocol', 'runId', 'taskId', 'sender', 'receiver', 'nonce', 'idempotencyKey']) {
      text(envelope[key], `raw ${key}`, 300);
      if (envelope[key] !== binding[key]) fail(`raw review ${key} binding mismatch`);
    }
    if (envelope.protocol !== 'agent-collab/v1' || envelope.state !== 'PRODUCED' || envelope.baseRevision !== bindings.baseRevision || envelope.scenarioSha256 !== l.scenarioSha256 || envelope.issuedAt !== r.issuedAt) fail('raw review state/scenario/base/time mismatch');
    dateTime(envelope.expiresAt, 'review expiry');
    if (Date.parse(r.issuedAt) < Date.parse(bindings.issuedAt) || Date.parse(r.issuedAt) > Date.parse(frozenAt) || Date.parse(frozenAt) > Date.parse(envelope.expiresAt)) fail('review chronology is outside dispatch/freeze/expiry');
    if (rawSenders.has(envelope.sender) || nonces.has(envelope.nonce) || attempts.has(envelope.idempotencyKey)) fail('replayed raw review identity or attempt');
    rawSenders.add(envelope.sender); nonces.add(envelope.nonce); attempts.add(envelope.idempotencyKey);
    const caseIds = r.review.cases?.map(c => c.scenarioId);
    if (!Array.isArray(caseIds) || caseIds.length !== pack.scenarios.length || new Set(caseIds).size !== pack.scenarios.length || pack.scenarios.some(s => !caseIds.includes(s.id))) fail('review does not cover all scenario IDs');
  }
  if (new Set(reviews.map(r => r.reviewerId)).size !== reviewerIds.length || new Set(reviews.map(r => r.actor)).size !== reviewerIds.length || reviews.some(r => r.actor === l.adjudicator)) fail('reviewers must have distinct actors independent from adjudicator');
  const patternIds = new Set(bundle.catalog.patterns.map(v => v.id)), eventIds = new Set(bundle.events.events.map(v => v.id));
  const scenarioMap = new Map(pack.scenarios.map(s => [s.id, s]));
  const found = new Set(), pairDirections = new Map();
  for (const row of list(l.cases, 'label cases', 500)) {
    object(row, ['scenarioId', 'expectations', 'acceptableTop3Ids', 'reviewerIds', 'status', 'adjudication'], 'label case');
    const scenario = scenarioMap.get(row.scenarioId);
    if (!scenario || found.has(row.scenarioId)) fail('unknown or duplicate labelled scenario'); found.add(row.scenarioId);
    if (row.status !== 'reviewed' || !reviewerIds.every(id => row.reviewerIds?.includes(id))) fail('case not reviewed by both reviewers');
    text(row.adjudication, 'adjudication');
    if (row.acceptableTop3Ids !== null) {
      if (!['recommendations'].includes(scenario.task.kind)) fail('Top3 label on a non-ranking task');
      if (!ids(row.acceptableTop3Ids, 'acceptable Top3').length) fail('empty Top3 label must be null');
      if (row.acceptableTop3Ids.some(id => !patternIds.has(id))) fail('unknown Top3 pattern');
      if (!reviews.every(r => row.acceptableTop3Ids.every(id => r.review.cases.find(c => c.scenarioId === row.scenarioId)?.acceptableTop3Ids?.includes(id)))) fail('Top3 label lacks both independent reviews');
    }
    const checks = list(row.expectations, 'expectations', 50), seenChecks = new Set(), statusClaims = new Map();
    if (!checks.length) fail('empty reviewed expectations');
    for (const e of checks) {
      object(e, ['kind', 'patternId', 'status', 'preferredPatternId', 'rejectedPatternId', 'eventId', 'rationale', 'sourceRefs', 'confidence', 'reviewerIds'], 'expectation');
      if (!Object.hasOwn(CHECK_FIELDS, e.kind)) fail('unknown expectation kind');
      const fields = CHECK_FIELDS[e.kind];
      if (fields.some(key => !Object.hasOwn(e, key))) fail('missing expectation field');
      const allowed = ['kind', 'rationale', 'sourceRefs', 'confidence', 'reviewerIds', ...fields];
      if (Object.keys(e).some(key => !allowed.includes(key))) fail('expectation fields do not match kind');
      text(e.rationale, 'expectation rationale');
      if (!list(e.sourceRefs, 'source references', 20).length) fail('nonempty source references required');
      e.sourceRefs.forEach(v => text(v, 'source reference', 300));
      choice(e.confidence, ['high', 'medium', 'low'], 'confidence');
      if (e.confidence === 'low' || !reviewerIds.every(id => e.reviewerIds?.includes(id))) fail('unresolved or unreviewed expectation');
      for (const key of ['patternId', 'preferredPatternId', 'rejectedPatternId']) if (e[key] && !patternIds.has(e[key])) fail('unknown expected pattern');
      if (e.kind === 'feasibility' || e.kind === 'candidate_status') choice(e.status, ['ready', 'conditional', 'blocked'], 'feasibility');
      if (e.kind === 'event') { if (!eventIds.has(e.eventId)) fail('unknown expected event'); choice(e.status, ['absent', 'current', 'historical', 'unverified'], 'event status'); }
      const taskKinds = { feasibility: ['recommendations', 'pattern'], pairwise: ['recommendations'], event: ['events', 'recommendations'], no_ready: ['recommendations'], abstain: ['recommendations'], school_invariant: ['recommendations'], no_current_events: ['events', 'recommendations'], profile_rejected: ['profile'], candidate_status: ['candidate'], candidate_unscored: ['candidate'] };
      if (!taskKinds[e.kind].includes(scenario.task.kind) || e.kind === 'school_invariant' && !scenario.task.counterfactualSchool) fail('expectation incompatible with task');
      const key = expectationKey(e);
      if (seenChecks.has(key)) fail('duplicate expectation'); seenChecks.add(key);
      const claim = `${e.kind}|${e.patternId ?? e.eventId ?? ''}`;
      if (e.status && statusClaims.has(claim) && statusClaims.get(claim) !== e.status) fail('contradictory expected status');
      if (e.status) statusClaims.set(claim, e.status);
      if (!reviews.every(r => r.review.cases.find(c => c.scenarioId === row.scenarioId)?.expectations?.some(v => expectationKey(v) === key && (v.expected === undefined || v.expected === true) && ['high', 'medium'].includes(v.confidence) && typeof v.rationale === 'string' && v.rationale.trim() && Array.isArray(v.sourceRefs) && v.sourceRefs.length))) fail('expectation lacks both independent reviews');
      const cited = new Set(reviews.flatMap(r => r.review.cases.find(c => c.scenarioId === row.scenarioId).expectations.filter(v => expectationKey(v) === key).flatMap(v => v.sourceRefs ?? [])));
      if (e.sourceRefs.some(ref => !cited.has(ref))) fail('adjudicated reference absent from retained reviews');
      if (e.kind === 'pairwise') {
        if (e.preferredPatternId === e.rejectedPatternId) fail('self preference');
        const context = stableStringify({ ...parseTopicProfile(scenario.profile), school: '', discipline: '' });
        const pair = [e.preferredPatternId, e.rejectedPatternId].sort().join('|'), identity = `${context}|${pair}`;
        if (pairDirections.has(identity) && pairDirections.get(identity) !== e.preferredPatternId) fail('reversed preference in identical context');
        pairDirections.set(identity, e.preferredPatternId);
      }
    }
  }
  if (found.size !== pack.scenarios.length) fail('not every scenario has reviewed labels');
  return l;
}

export function verifyManifest(root, manifest) {
  object(manifest, ['schemaVersion', 'packId', 'baseRevision', 'evaluationClass', 'frozenAt', 'sealedAt', 'files', 'migration'], 'manifest');
  if (manifest.schemaVersion !== 2 || manifest.evaluationClass !== 'public_calibration') fail('manifest class/version');
  if (!/^[a-f0-9]{40}$/u.test(manifest.baseRevision)) fail('manifest base revision');
  identifier(manifest.packId, 'manifest pack'); dateTime(manifest.frozenAt, 'frozen time');
  dateTime(manifest.sealedAt, 'artifact seal time');
  if (Date.parse(manifest.sealedAt) < Date.parse(manifest.frozenAt)) fail('artifact seal predates label freeze');
  const expected = [...PRODUCTION_FILES, ...EVALUATION_FILES].sort();
  object(manifest.files, expected, 'manifest files');
  if (Object.keys(manifest.files).length !== expected.length || expected.some(p => !Object.hasOwn(manifest.files, p))) fail('manifest omits required implementation or input');
  const canonicalRoot = realpathSync(root);
  for (const relative of expected) {
    hash(manifest.files[relative], `file ${relative}`);
    let file = canonicalRoot;
    for (const part of relative.split('/')) {
      file = path.join(file, part);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1) fail(`linked input forbidden ${relative}`);
    }
    if (!realpathSync(file).startsWith(canonicalRoot + path.sep)) fail('input escapes root');
    if (!lstatSync(file).isFile() || lstatSync(file).size > 4 * 1024 * 1024) fail('input size/type');
    if (sha256(readFileSync(file)) !== manifest.files[relative]) fail(`frozen file hash drift: ${relative}`);
  }
  // The original receipt remains an exact-byte input; a path migration cannot reapprove or relabel it.
  const source = strictJson(readFileSync(path.join(canonicalRoot, ARCHIVED_MANIFEST), 'utf8'));
  object(source, ['schemaVersion', 'packId', 'baseRevision', 'evaluationClass', 'frozenAt', 'sealedAt', 'files'], 'archived manifest');
  if (source.schemaVersion !== 1) fail('archived manifest version');
  for (const field of ['packId', 'baseRevision', 'evaluationClass', 'frozenAt']) {
    if (source[field] !== manifest[field]) fail(`migration changed original ${field}`);
  }
  dateTime(source.sealedAt, 'archived artifact seal time');
  if (Date.parse(source.sealedAt) < Date.parse(source.frozenAt) || Date.parse(manifest.sealedAt) < Date.parse(source.sealedAt)) fail('migration seal predates archived seal');
  const mapped = expected.filter(relative => relative !== ARCHIVED_MANIFEST);
  object(source.files, mapped.map(archivedPath), 'archived manifest files');
  if (Object.keys(source.files).length !== mapped.length || mapped.some(relative => !Object.hasOwn(source.files, archivedPath(relative)))) fail('archived manifest omits required implementation or input');
  for (const relative of mapped) hash(source.files[archivedPath(relative)], `archived file ${relative}`);
  const migration = object(manifest.migration, ['kind', 'sourceManifestSha256', 'repositoryRevision', 'changedFiles'], 'migration');
  if (migration.kind !== 'repository-layout-v1' || !/^[a-f0-9]{40}$/u.test(migration.repositoryRevision)) fail('migration kind/revision');
  hash(migration.sourceManifestSha256, 'source manifest hash');
  if (migration.sourceManifestSha256 !== manifest.files[ARCHIVED_MANIFEST]) fail('migration source manifest hash mismatch');
  const changed = list(migration.changedFiles, 'migration changed files');
  const actualChanges = mapped.filter(relative => source.files[archivedPath(relative)] !== manifest.files[relative]);
  if (stableStringify(changed) !== stableStringify(MIGRATION_CHANGED_FILES) || stableStringify(actualChanges) !== stableStringify(MIGRATION_CHANGED_FILES)) fail('migration must preserve all original data, reviews and production hashes');
  return {
    verifiedFiles: expected.length, manifestSha256: sha256(Buffer.from(stableStringify(manifest))),
    migration: { ...migration, sourceSealedAt: source.sealedAt, sealedAt: manifest.sealedAt },
  };
}

export function loadFrozenEvaluation(root) {
  const read = relative => strictJson(readFileSync(path.join(root, relative), 'utf8'));
  const manifest = read('evals/topic-advisor/manifest-v2.json');
  const identity = verifyManifest(root, manifest);
  const c = 'apps/frontend/content/topic-advisor/';
  const bundle = parseTopicBundle({ catalog: read(`${c}catalog.json`), sources: read(`${c}sources.json`), events: read(`${c}hotspot-events.json`), model: read(`${c}ranker.json`) });
  const pack = parseScenarioPack(read('evals/topic-advisor/scenarios-v1.json'), bundle);
  const reviews = read('evals/topic-advisor/reviews-v1.json');
  const bindings = read('evals/topic-advisor/reviewer-bindings-v1.json');
  const labels = parseLabels(read('evals/topic-advisor/labels-v1.json'), pack, bundle, reviews, bindings, manifest.frozenAt);
  if (bindings.baseRevision !== manifest.baseRevision) fail('review/manifest base mismatch');
  if (manifest.packId !== pack.packId || labels.scenarioSha256 !== manifest.files['evals/topic-advisor/scenarios-v1.json']) fail('pack/scenario identity mismatch');
  return { manifest, identity, bundle, pack, labels, training: read(`${c}train.json`) };
}

export function wilsonInterval(successes, total) {
  if (!Number.isInteger(total) || !Number.isInteger(successes) || total < 0 || successes < 0 || successes > total) fail('invalid binomial counts');
  if (!total) return null;
  const z = 1.959963984540054, p = successes / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius), confidence: .95, method: 'Wilson score' };
}

function observe(scenario, bundle) {
  if (scenario.task.kind === 'profile') {
    try { recommendTopics(scenario.profile, bundle, 50); return { profileRejected: false }; }
    catch (error) { return { profileRejected: true, rejectionName: error.name, rejectionMessage: error.message }; }
  }
  if (scenario.task.kind === 'candidate') return { candidate: evaluateCandidate(scenario.task.candidate, scenario.profile, bundle) };
  if (scenario.task.kind === 'events') return { events: eventLeadsForProfile(scenario.profile, bundle.events, bundle.sources) };
  if (scenario.task.kind === 'pattern') {
    const p = bundle.catalog.patterns.find(p => p.id === scenario.task.patternId);
    return { assessments: new Map([[p.id, assessTopicPattern(p, scenario.profile, bundle)]]) };
  }
  const all = recommendTopics(scenario.profile, bundle, 50);
  const assessments = new Map([...all.items, ...all.excluded].map(r => [r.patternId, r]));
  const events = eventLeadsForProfile(scenario.profile, bundle.events, bundle.sources);
  const counterfactual = scenario.task.counterfactualSchool ? recommendTopics({ ...scenario.profile, school: scenario.task.counterfactualSchool }, bundle, 50) : null;
  return { all, assessments, events, counterfactual };
}
function checkExpectation(e, observed) {
  switch (e.kind) {
    case 'profile_rejected': return observed.profileRejected === true && /地区|迁移/u.test(observed.rejectionMessage ?? '');
    case 'feasibility': return observed.assessments.get(e.patternId)?.feasibility === e.status;
    case 'no_ready': return observed.all.items.every(r => r.feasibility !== 'ready');
    case 'abstain': return observed.all.items.length === 0;
    case 'school_invariant': return stableStringify(observed.all.items.map(r => [r.patternId, r.feasibility, r.rankScore])) === stableStringify(observed.counterfactual.items.map(r => [r.patternId, r.feasibility, r.rankScore]));
    case 'event': return (observed.events.find(r => r.id === e.eventId)?.temporalStatus ?? 'absent') === e.status;
    case 'no_current_events': return observed.events.every(r => r.temporalStatus !== 'current');
    case 'candidate_status': return observed.candidate.feasibility === e.status;
    case 'candidate_unscored': return observed.candidate.rankScore === 0 && observed.candidate.patternId === 'user-candidate';
    case 'pairwise': {
      const a = observed.assessments.get(e.preferredPatternId), b = observed.assessments.get(e.rejectedPatternId);
      if (!a || !b || a.feasibility === 'blocked') return false;
      if (b.feasibility === 'blocked') return true;
      if (a.feasibility === b.feasibility && Math.abs(a.rankScore - b.rankScore) <= 1e-12) return false;
      const rank = observed.all.items.map(r => r.patternId);
      return rank.indexOf(a.patternId) < rank.indexOf(b.patternId);
    }
    default: return fail('unhandled expectation');
  }
}
function baselineReport(name, bundle, pack, labels) {
  const cases = [], strata = Object.create(null);
  const recommendationScenarios = pack.scenarios.filter(s => s.task.kind === 'recommendations').length;
  let passedChecks = 0, checks = 0, pairWins = 0, pairTies = 0, pairLosses = 0, bothEligiblePairs = 0, top3Successes = 0, top3EligibleScenarios = 0, abstentions = 0, expectedAbstentions = 0, honouredAbstentions = 0;
  for (const scenario of pack.scenarios) {
    const label = labels.cases.find(c => c.scenarioId === scenario.id), observed = observe(scenario, bundle);
    const results = label.expectations.map(e => ({ kind: e.kind, passed: checkExpectation(e, observed), ...(e.patternId ? { patternId: e.patternId } : {}), ...(e.eventId ? { eventId: e.eventId } : {}) }));
    if (scenario.task.kind === 'recommendations' && observed.all.items.length === 0) abstentions++;
    if (label.expectations.some(e => e.kind === 'abstain')) { expectedAbstentions++; if (observed.all.items.length === 0) honouredAbstentions++; }
    for (const e of label.expectations.filter(e => e.kind === 'pairwise')) {
      const a = observed.assessments.get(e.preferredPatternId), b = observed.assessments.get(e.rejectedPatternId);
      if (!a || !b || a.feasibility === 'blocked' || b.feasibility === 'blocked') continue;
      bothEligiblePairs++;
      if (a.feasibility === b.feasibility && Math.abs(a.rankScore - b.rankScore) <= 1e-12) pairTies++;
      else if (checkExpectation(e, observed)) pairWins++;
      else pairLosses++;
    }
    let top3Acceptable = null;
    if (label.acceptableTop3Ids !== null) {
      top3EligibleScenarios++;
      top3Acceptable = observed.all.items.slice(0, 3).some(r => label.acceptableTop3Ids.includes(r.patternId));
      if (top3Acceptable) top3Successes++;
      results.push({ kind: 'top3_acceptable', passed: top3Acceptable });
    }
    const passed = results.every(r => r.passed);
    const stratum = strata[scenario.stratum] ??= { scenarios: 0, passedScenarios: 0 }; stratum.scenarios++; if (passed) stratum.passedScenarios++;
    checks += results.length; passedChecks += results.filter(r => r.passed).length;
    const details = observed.profileRejected !== undefined ? { profileRejected: observed.profileRejected }
      : observed.candidate ? { candidate: { feasibility: observed.candidate.feasibility, trainedQualityScore: null, internalUnscoredSentinel: observed.candidate.rankScore } }
      : scenario.task.kind === 'pattern' ? { pattern: { patternId: scenario.task.patternId, feasibility: observed.assessments.get(scenario.task.patternId).feasibility } }
      : scenario.task.kind === 'events' ? { events: (scenario.task.eventIds ?? observed.events.map(e => e.id)).map(id => ({ eventId: id, status: observed.events.find(e => e.id === id)?.temporalStatus ?? 'absent' })) }
      : { top3: observed.all.items.slice(0, 3).map(r => ({ patternId: r.patternId, feasibility: r.feasibility })), offered: observed.all.items.length, excluded: observed.all.excluded.length };
    cases.push({ id: scenario.id, taskKind: scenario.task.kind, stratum: scenario.stratum, passed, checks: results, top3Acceptable, ...details });
  }
  if (Object.values(strata).reduce((n, s) => n + s.scenarios, 0) !== cases.length) fail('stratum counts do not reconcile');
  return { name, scenarios: cases.length, recommendationScenarios, passedScenarios: cases.filter(r => r.passed).length, checks, passedChecks, failedChecks: checks - passedChecks, abstentions: { emptyRecommendations: abstentions, denominator: recommendationScenarios, expectedScenarios: expectedAbstentions, honoured: honouredAbstentions }, pairwise: { bothEligiblePairs, wins: pairWins, ties: pairTies, losses: pairLosses, rate: bothEligiblePairs ? pairWins / bothEligiblePairs : null }, top3: { successes: top3Successes, denominator: top3EligibleScenarios, coverage: recommendationScenarios ? top3EligibleScenarios / recommendationScenarios : null, rate: top3EligibleScenarios ? top3Successes / top3EligibleScenarios : null, interval95: wilsonInterval(top3Successes, top3EligibleScenarios) }, strata, cases };
}
export function evaluateFrozen({ manifest, identity, bundle, pack, labels, training }) {
  const baseline = { ...bundle, model: { ...bundle.model, modelVersion: 'resource-only-v1', weights: FEATURE_NAMES.map(n => ['possibleAccess', 'resourceFit'].includes(n) ? 1 : 0) } };
  const reports = [baselineReport('frozen-current-ranker', bundle, pack, labels), baselineReport('resource-only-v1', baseline, pack, labels)];
  const featureAudit = FEATURE_NAMES.map(name => {
    const values = [], differences = [];
    for (const scenario of pack.scenarios.filter(s => s.task.kind !== 'profile')) {
      for (const pattern of bundle.catalog.patterns) values.push(extractTopicFeatures(pattern, scenario.profile, bundle.events, bundle.sources)[name]);
      for (const e of labels.cases.find(c => c.scenarioId === scenario.id).expectations.filter(e => e.kind === 'pairwise')) {
        const pair = [e.preferredPatternId, e.rejectedPatternId].map(id => bundle.catalog.patterns.find(p => p.id === id));
        differences.push(extractTopicFeatures(pair[0], scenario.profile, bundle.events, bundle.sources)[name] - extractTopicFeatures(pair[1], scenario.profile, bundle.events, bundle.sources)[name]);
      }
    }
    const min = Math.min(...values), max = Math.max(...values);
    return { name, minimum: min, maximum: max, constantAcrossEvaluatedContexts: max - min <= 1e-12, weight: bundle.model.weights[FEATURE_NAMES.indexOf(name)], reviewedPreferencePairs: differences.length, nonzeroPreferenceDifferences: differences.filter(v => Math.abs(v) > 1e-12).length };
  });
  const semanticProfiles = pack.scenarios.map(s => stableStringify({ ...parseTopicProfile(s.profile), school: '', discipline: '' }));
  const trainingProfiles = new Set(training.pairs.map(p => stableStringify({ ...parseTopicProfile(p.context), school: '', discipline: '' })));
  const exactTrainingProfileOverlap = semanticProfiles.map((p, i) => trainingProfiles.has(p) ? pack.scenarios[i].id : null).filter(Boolean);
  return {
    schemaVersion: 1, packId: pack.packId, evaluationClass: 'public_calibration', frozenAt: manifest.frozenAt,
    identity, modelVersion: bundle.model.modelVersion, productionModelSha256: manifest.files['apps/frontend/content/topic-advisor/ranker.json'],
    productionRankerChanged: false, trainingPerformed: false, independentFinalTestScenarios: 0, plannedIndependentScenarios: pack.targetIndependentScenarios,
    editorialCalibrationScenarios: pack.scenarios.length, labelClass: labels.labelClass,
    validation: auditScenarioIsolation(pack.scenarios), trainingExposure: { exactProfileOverlap: exactTrainingProfileOverlap, sharedCatalog: true, independentGeneralizationClaimAllowed: false },
    baselines: reports, featureAudit,
    passed: reports.every(r => r.failedChecks === 0),
    limitations: ['Twelve public AI-reviewed synthetic calibration cases are not human expert gold, a sealed final test, or observed team outcomes.', 'Known catalog and scenario families remain exposed; these results do not measure external topic quality or award probability.', 'Top3 counts only independently labelled ranking cases; missing labels are excluded from its explicit denominator.', 'Resource baseline shares production hard constraints and feasibility ordering; it isolates only ranking weights.', 'Free candidates retain no trained comparable quality score; zero is an internal unscored sentinel only.', 'Constant structural features do not learn substantive research value; retain them until a separately reviewed revision is evaluated.', 'No preference expansion or production tuning is permitted on the basis of a blind-test claim from this calibration pack.'],
  };
}
