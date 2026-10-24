import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { parseKnowledgeLookup } from '../lib/knowledge/api-contracts.ts';
import { knownTopicAgentRejection } from '../lib/topic-agent/index.ts';

// Exercise the real component handlers/effects with bounded API promises; no live provider.
const ts = createRequire(import.meta.url)('typescript');
const compiled = ts.transpileModule(fs.readFileSync(new URL('../components/topic-advisor/TopicAgent.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = value => value == null || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
const text = value => value == null ? '' : Array.isArray(value) ? value.map(text).join('') : typeof value === 'object' ? text(value.props?.children) : String(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const versions = { topicDigest: 'a'.repeat(64), regionCatalog: { catalogVersion: 'cn-admin-test', asOf: '2025-12-31', catalogSha256: 'b'.repeat(64) } };
const PROJECT_ONE = '11111111-1111-4111-8111-111111111111', PROJECT_TWO = '22222222-2222-4222-8222-222222222222';
const LOOKUP_ONE = '33333333-3333-4333-8333-333333333333', LOOKUP_TWO = '44444444-4444-4444-8444-444444444444';
const lookupReceipt = (id = LOOKUP_ONE) => ({ id, status: 'ready', query: '武汉 社区公共服务 2026年10月', createdAt: '2026-10-18T09:00:00Z', finishedAt: '2026-10-18T09:00:01Z', results: [{ title: '武汉社区公共服务来源', url: 'https://www.wuhan.gov.cn/example', snippet: '这是已返回的公开网页片段，不代表完整原文。' }], credits: 1, errorCode: null, providerRequestId: 'lookup-fixture' });
const baseProfile = { region: '湖北省', city: '武汉市', school: '', schoolContext: [], discipline: '', interests: [], domains: [], days: 14, budgetYuan: 200, access: {}, resources: {}, sensitiveData: 'avoid', referenceDate: '2026-10-18', competitionWindow: null };
const source = { id: 'source-1', title: '资料一', authority: '登记资料', coverage: 'fulltext', limitations: [] };
const item = { patternId: 'topic-1', title: '社区服务体验的研究', researchQuestion: '服务触点如何改善？', decisionOwner: '服务负责人', decision: '优先改造哪些触点', whyHere: '地区和资料具有关联，渠道尚待确认。', firstWeekPlan: ['确认可触达对象'], unknowns: ['样本渠道'], sourceIds: ['source-1'] };
const comparedItem = { patternId: 'topic-2', title: '青年就业服务触点研究', researchQuestion: '哪些求职支持更需要改进？', decisionOwner: '就业服务负责人', decision: '确定优先试点的服务环节', whyHere: '测试中的第二项解释', firstWeekPlan: ['先确认就业服务访问入口', '核对服务依据'], unknowns: ['单位访问许可', '可触达的求职人群'], sourceIds: ['source-1', 'source-2'] };
const makeTurn = (input, index = 1) => ({ schemaVersion: 1, id: `turn-${index}`, status: 'ready', classification: 'proposed', mode: input.mode ?? 'local', providerMode: input.mode === 'model' ? 'fixture' : 'local', modelCalled: input.mode === 'model', catalogVersion: 'catalog-test', sourceVersions: versions, inputFingerprint: 'c'.repeat(64), profile: structuredClone(input.profile), message: input.message, intent: input.intent, candidateIds: ['topic-1'], parentTurnId: input.previous?.id ?? input.parentTurnId ?? null, turnIndex: index, serviceId: input.serviceId ?? null, serviceRevision: input.serviceRevision ?? null, createdAt: '2026-10-18T09:00:00Z', finishedAt: '2026-10-18T09:00:01Z', assistant: { text: '先核对可触达的调查对象，再决定是否深入。', questions: ['可以联系哪些人群？'], items: [structuredClone(item)] }, tools: [{ name: 'catalog', status: 'complete', summary: '已检索登记的研究方向。', patternIds: ['topic-1'], sourceIds: ['source-1'] }], sources: [source], errorCode: null, ...(Object.hasOwn(input, 'projectId') ? { projectId: input.projectId } : {}) });
function multiItemTurn(input) { const turn = makeTurn(input); turn.assistant.items.push(structuredClone(comparedItem)); turn.candidateIds.push('topic-2'); turn.sources.push({ ...source, id: 'source-2', title: '测试中的第二份资料' }); return turn; }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function modelChain(count = 2, projectId = PROJECT_ONE) {
  const turns = [];
  for (let index = 1; index <= count; index++) turns.push({ ...makeTurn({ profile: baseProfile, projectId, message: `保存的讨论第 ${index} 轮`, intent: 'recommend', mode: 'model', serviceId: 'service-1', serviceRevision: 1, parentTurnId: turns.at(-1)?.id ?? null }, index), id: `history-${index}` });
  return turns;
}

function mount(options = {}) {
  let cells = [], effects = [], layouts = [], at = 0, dirty = true, tree, mountedKey = null, nonce = 0, turnCount = 0;
  const cache = options.cache ?? new Map(), storage = options.storage ?? new Map(), unsaved = new Map(), localCalls = [], posts = [], gets = [], adopted = [], updated = [], verifications = [], navigations = [], focusCalls = [], scrollCalls = [];
  const inputElement = { disabled: false, focus: options => focusCalls.push(structuredClone(options)), scrollIntoView: options => scrollCalls.push(structuredClone(options)) };
  const identity = { ownerId: options.ownerId ?? '', epoch: 0 };
  const serverRecords = new Map((options.conversation ?? []).map(turn => [turn.id, turn]));
  let props = { profile: structuredClone(options.profile ?? baseProfile), projectId: options.projectId ?? null, cacheNamespace: options.cacheNamespace ?? 'project:one', readOnly: false, onChoose: (...args) => adopted.push(args), onProfileChange: profile => updated.push(profile) };
  class ApiError extends Error { constructor(code, status = 400, message = code) { super(message); this.code = code; this.status = status; } }
  const auth = {
    get session() { return identity.ownerId ? { user: { id: identity.ownerId }, mode: 'local_test', authenticated: true } : null; },
    get identityEpoch() { return identity.epoch; },
    isCurrentAccount: (ownerId, epoch) => ownerId === identity.ownerId && epoch === identity.epoch,
    getDraft: key => cache.get(key), cacheDraft: (key, value, _dirty, ownerId) => { if (ownerId === identity.ownerId) cache.set(key, value); }, setUnsaved: (key, value) => unsaved.set(key, value),
    navigate: path => { navigations.push(path); return options.navigateAllowed ?? true; },
    async mutate(path, body) { posts.push({ path, body: structuredClone(body) }); if (options.post) return options.post(body); const parent = serverRecords.get(body.parentTurnId); const turn = { ...makeTurn(body, parent ? parent.turnIndex + 1 : 1), id: body.idempotencyKey }; serverRecords.set(turn.id, turn); return turn; },
  };
  const hooks = {
    useState(init) { const index = at++; cells[index] ??= { value: typeof init === 'function' ? init() : init }; const cell = cells[index]; return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next; dirty = true; }]; },
    useRef(init) { const index = at++; cells[index] ??= { current: init }; return cells[index]; },
    useEffect(fn, deps) { effect(fn, deps, effects); }, useLayoutEffect(fn, deps) { effect(fn, deps, layouts); },
  };
  function effect(fn, deps, queue) { const index = at++, previous = cells[index]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { const cell = cells[index] = { deps }; queue.push(() => { previous?.cleanup?.(); cell.cleanup = fn(); }); } }
  const jsx = (type, values, key) => ({ type, props: values, key });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' }, '@evix/shared': { parseCollection: raw => raw.services, parseService: raw => raw },
    '@/components/hosted/HostedSession': { useHostedSession: () => auth }, '@/components/workbench/shell-kit': { useWorkbenchTheme: () => 'light' },
    '@/components/knowledge/KnowledgeLookupPanel': { default: 'knowledge-lookup-panel' }, '@/lib/knowledge/api-contracts': { parseKnowledgeLookup },
    '@/components/hosted/api-client': { HostedApiError: ApiError, errorMessage: failure => failure.message, hostedRequest: async path => { gets.push(path); if (path === '/api/services') return options.services ? options.services() : { services: [{ id: 'service-1', label: '模型一', provider: 'openai', revision: 1, capabilities: ['research'] }] }; if (options.get) return options.get(path); if (options.conversation) { if (path.split('?')[0] === '/api/topic-agent/turns') return { turns: [...serverRecords.values()].reverse() }; if (path.includes('/conversation?')) return { turns: options.conversation }; const id = path.split('?')[0].split('/').at(-1); if (serverRecords.has(id)) return serverRecords.get(id); } return { ...makeTurn(posts.at(-1).body, 1), id: posts.at(-1).body.idempotencyKey }; } },
    '@/lib/topic-advisor': { profileFingerprint: value => JSON.stringify(value), recommendTopics: () => ({ items: (options.feasibleIds ?? ['topic-1']).map(patternId => ({ patternId, feasibility: 'conditional' })) }) },
    '@/lib/topic-advisor/parse': { stableStringify: value => JSON.stringify(canonical(value)) },
    '@/lib/topic-advisor/client-bundle': { TOPIC_BUNDLE: { catalog: { patterns: [{ id: 'topic-1' }] } } },
    '@/lib/topic-proposal': { TOPIC_SOURCE_VERSIONS: versions, topicGeographyLabel: profile => profile.city },
    '@/lib/topic-agent': {
      async runLocalTopicAgent(input) { localCalls.push(structuredClone(input)); return options.local ? options.local(input) : makeTurn(input, ++turnCount); },
      freezeTopicAgentRequest: input => ({ schemaVersion: 1, idempotencyKey: `nonce-${++nonce}`, catalogVersion: 'catalog-test', ...structuredClone(input) }),
      parseTopicAgentTurn: raw => { if (!raw?.id || !raw?.profile) throw Error('无效回执'); return structuredClone(raw); },
      parseTopicAgentPending: (raw, ownerId, namespace) => { try { const row = typeof raw === 'string' ? JSON.parse(raw) : raw; if (row?.schemaVersion !== 1 || row.ownerId !== ownerId || row.namespace !== namespace || !row.sourceVersions || !row.request) return null; if (Object.hasOwn(row.request, 'projectId') && namespace !== (row.request.projectId ? `project:${row.request.projectId}` : 'global')) throw Error('会话范围不符'); return structuredClone(row); } catch { return null; } },
      verifyTopicAgentTurn: async (turn, request, sourceVersions) => { verifications.push(structuredClone(sourceVersions)); if (turn.id !== request.idempotencyKey || turn.profile.city !== request.profile.city || Object.hasOwn(turn, 'projectId') !== Object.hasOwn(request, 'projectId') || turn.projectId !== request.projectId) throw Error('回执与请求不符'); },
      topicAgentScopeQuery: projectId => projectId == null ? '?scope=global' : `?projectId=${projectId}`,
      parseTopicAgentConversation: (raw, projectId) => { const rows = raw?.turns; if (!Array.isArray(rows) || !rows.length || rows.length > 12 || rows.some((turn, index) => (turn.projectId ?? null) !== (projectId ?? null) || turn.turnIndex !== index + 1 || turn.parentTurnId !== (index ? rows[index - 1].id : null) || turn.mode !== rows[0].mode)) throw Error('讨论链格式无效'); return structuredClone(rows); },
      topicAgentConversationResumable: (turns, projectId) => turns.length > 0 && turns.length < 12 && turns.every(turn => turn.status === 'ready' && turn.mode === 'model' && (turn.projectId ?? null) === (projectId ?? null) && turn.catalogVersion === 'catalog-test' && turn.sourceVersions.topicDigest === versions.topicDigest),
      topicAgentContinuationCandidates: (profile, turns) => turns.length && turns.every(turn => turn.mode === 'model' && turn.status === 'ready' && turn.sourceVersions.topicDigest === versions.topicDigest) && JSON.stringify(profile) === JSON.stringify(turns.at(-1).profile) ? structuredClone(turns.at(-1).assistant?.items ?? []) : [],
      knownTopicAgentRejection,
      inferTopicAgentIntent: value => value.includes('比较') ? 'compare' : 'recommend',
      proposeTopicProfile: (profile, message) => message.includes('预算500') ? { profile: { ...profile, budgetYuan: 500 }, changes: ['预算：500 元'] } : null,
    },
    './TopicAgent.module.css': { default: new Proxy({}, { get: (_target, key) => key }) },
  };
  const box = { exports: {}, require(name) { assert.ok(name in imports, name); return imports[name]; }, structuredClone, console, sessionStorage: { get length() { return storage.size; }, key: index => [...storage.keys()][index] ?? null, getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  vm.runInNewContext(compiled, box);
  const screen = {
    get tree() { return tree; }, localCalls, posts, gets, cache, storage, unsaved, adopted, updated, verifications, navigations, focusCalls, scrollCalls, ApiError,
    async settle() { for (let turn = 0; turn < 50; turn++) { const root = box.exports.default(props); if (root.key !== mountedKey) { for (const cell of cells) cell?.cleanup?.(); cells = []; effects = []; layouts = []; mountedKey = root.key; } at = 0; dirty = false; tree = root.type(root.props); const field = walk(tree).find(node => node.type === 'textarea'); if (field?.props.ref) { inputElement.disabled = Boolean(field.props.disabled); field.props.ref.current = inputElement; } layouts.splice(0).forEach(fn => fn()); effects.splice(0).forEach(fn => fn()); await Promise.resolve(); if (turn >= 8 && !dirty && !effects.length && !layouts.length) { await Promise.resolve(); if (!dirty) return; } } throw Error('Unstable render'); },
    button(label) { const button = walk(tree).find(node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label)); assert.ok(button, `Missing button: ${label}`); return button; },
    click(label) { const button = screen.button(label); assert.ok(!button.props.disabled, `Disabled: ${label}`); return button.props.onClick(); },
    async query(value) { const field = walk(tree).find(node => node.type === 'textarea'); field.props.onChange({ target: { value } }); await screen.settle(); },
    async send(value) { await screen.query(value); screen.click('发送↑'); await screen.settle(); },
    async patch(value) { props = { ...props, ...value }; dirty = true; await screen.settle(); },
    async account(ownerId) { identity.ownerId = ownerId; identity.epoch++; dirty = true; await screen.settle(); },
    textarea() { return walk(tree).find(node => node.type === 'textarea'); },
    lookupPanel() { return walk(tree).find(node => node.type === 'knowledge-lookup-panel'); },
    checkbox(label) { return walk(tree).find(node => node.type === 'input' && node.props['aria-label'] === label); },
    check(label) { const checkbox = walk(tree).find(node => node.type === 'input' && node.props['aria-label'] === label); assert.ok(checkbox, `Missing checkbox: ${label}`); checkbox.props.onChange({ target: { checked: true } }); },
    async modelMode() { screen.click('个人模型'); await screen.settle(); screen.click('读取我的研究模型'); await screen.settle(); const checkbox = walk(tree).find(node => node.type === 'input' && !node.props['aria-label']); assert.ok(checkbox); checkbox.props.onChange({ target: { checked: true } }); await screen.settle(); },
    unmount() { for (const cell of cells) cell?.cleanup?.(); },
  };
  return screen;
}

test('local multi-turn conversation executes no HTTP, preserves its real parent, and adopts only after click', async () => {
  const screen = mount(); await screen.settle(); assert.equal(screen.gets.length, 0); assert.equal(screen.posts.length, 0);
  await screen.send('我想了解社区服务'); assert.equal(screen.localCalls.length, 1); assert.equal(screen.adopted.length, 0);
  assert.match(text(screen.tree), /1 项研究步骤已完成/); assert.match(text(screen.tree), /资料一/);
  screen.click('采用到研究简报 →'); assert.equal(screen.adopted.length, 1); assert.equal(screen.adopted[0][0].researchQuestion, item.researchQuestion);
  await screen.send('帮我比较两个方向'); assert.equal(screen.localCalls.length, 2); assert.equal(screen.localCalls[1].previous.id, 'turn-1'); assert.equal(screen.localCalls[1].intent, 'compare');
  assert.equal(screen.gets.length, 0); assert.equal(screen.posts.length, 0); assert.equal(screen.cache.size, 0);
});

test('comparison intent shows a semantic matrix of exact returned fields, without duplicate cards or automatic adoption', async () => {
  const screen = mount({ local: multiItemTurn, feasibleIds: ['topic-1', 'topic-2'] }); await screen.settle(); await screen.send('比较这两个研究方向');
  const comparison = walk(screen.tree).find(node => node.props?.['aria-label'] === '研究方向对照'); assert.ok(comparison);
  const table = walk(comparison).find(node => node.type === 'table'); assert.ok(table); assert.match(text(table), /社区服务体验的研究/); assert.match(text(table), /青年就业服务触点研究/);
  for (const value of [item.researchQuestion, comparedItem.researchQuestion, comparedItem.decisionOwner, comparedItem.decision, ...comparedItem.unknowns, comparedItem.firstWeekPlan[0]]) assert.ok(text(table).includes(value), value);
  assert.match(text(table), /1 条资料/); assert.match(text(table), /2 条资料/); assert.doesNotMatch(text(table), /测试中的第二项解释|获奖概率|获奖评分/);
  assert.equal(walk(comparison).some(node => node.props?.className === 'proposal'), false); assert.equal(walk(screen.tree).filter(node => node.props?.className === 'proposal').length, 0);
  assert.equal(walk(comparison).find(node => node.props?.role === 'region').props.tabIndex, 0); assert.equal(walk(table).filter(node => node.type === 'th' && node.props.scope === 'col').length, 3);
  assert.equal(screen.adopted.length, 0); screen.click(`采用方向：${comparedItem.title}`); assert.equal(screen.adopted.length, 1); assert.deepEqual(screen.adopted[0][0], comparedItem); assert.equal(screen.adopted[0][2].intent, 'compare'); assert.equal(screen.adopted[0][2].sources.length, 2); assert.equal(screen.gets.length, 0); assert.equal(screen.posts.length, 0);
});

test('matrix adoption retains feasibility, exact input and late account/permission guards while older comparisons stay readable', async () => {
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, local: multiItemTurn, feasibleIds: ['topic-1'] }); await screen.settle(); await screen.send('比较这两个研究方向');
  const rejected = screen.button(`采用方向：${comparedItem.title}`); assert.equal(rejected.props.disabled, true); rejected.props.onClick(); assert.equal(screen.adopted.length, 0);
  const oldAdopt = screen.button(`采用方向：${item.title}`).props.onClick; await screen.query('我想再改变调查边界'); oldAdopt(); assert.equal(screen.adopted.length, 0); assert.equal(screen.button(`采用方向：${item.title}`).props.disabled, true);
  await screen.patch({ readOnly: true }); await screen.patch({ readOnly: false }); oldAdopt(); assert.equal(screen.adopted.length, 0); assert.match(text(screen.tree), /青年就业服务触点研究/);
  await screen.account('bob'); oldAdopt(); assert.equal(screen.adopted.length, 0); assert.doesNotMatch(text(screen.tree), /青年就业服务触点研究/);
});

test('recommendation and single-item comparison keep cards, while an unanswered clarification renders no invented matrix', async () => {
  const recommendation = mount({ local: multiItemTurn }); await recommendation.settle(); await recommendation.send('先推荐方向'); assert.equal(walk(recommendation.tree).filter(node => node.props?.className === 'proposal').length, 2); assert.equal(walk(recommendation.tree).some(node => node.props?.['aria-label'] === '研究方向对照'), false);
  const single = mount(); await single.settle(); await single.send('比较当前这一个方向'); assert.equal(walk(single.tree).filter(node => node.props?.className === 'proposal').length, 1); assert.equal(walk(single.tree).some(node => node.props?.['aria-label'] === '研究方向对照'), false);
  const clarify = mount({ local: input => { const turn = makeTurn(input); turn.assistant.items = []; turn.assistant.text = '还需要确认你希望比较的研究对象。'; return turn; } }); await clarify.settle(); await clarify.send('比较尚未明确的方向'); assert.match(text(clarify.tree), /还需要确认/); assert.equal(walk(clarify.tree).some(node => node.type === 'table'), false); assert.equal(clarify.adopted.length, 0);
});

test('plan intent exposes all returned first-week actions in order and keeps proposed conditions and adoption explicit', async () => {
  const steps = ['确认入口：联系可触达的人群并记录许可。', '核对依据：保留原始链接与未核实项。', '准备探索：列出经历、原因和反例的追问。', '小范围预试：获得同意后记录理解问题与改版。', '作出去留决定：依据支持和反例选择保留、缩小或换题。'];
  const screen = mount({ local: input => { const turn = makeTurn(input); turn.assistant.items[0].firstWeekPlan = steps; return turn; } }); await screen.settle(); screen.click('验证计划'); await screen.settle(); await screen.send('我应该如何安排第一周？');
  const plan = walk(screen.tree).find(node => node.props?.['aria-label'] === '首周验证计划'); assert.ok(plan); assert.equal(walk(plan).some(node => node.type === 'details'), false);
  const list = walk(plan).find(node => node.type === 'ol'); assert.deepEqual(walk(list).filter(node => node.type === 'li').map(text), steps); assert.match(text(plan), /拟执行/); assert.match(text(plan), /样本渠道/);
  assert.equal(screen.localCalls[0].intent, 'plan'); assert.equal(screen.updated.length, 0); assert.equal(screen.adopted.length, 0); screen.click('采用到研究简报 →'); assert.deepEqual(screen.adopted[0][0].firstWeekPlan, steps);
  await screen.patch({ readOnly: true }); assert.equal(screen.button('采用到研究简报 →').props.disabled, true); assert.ok(walk(screen.tree).find(node => node.props?.['aria-label'] === '首周验证计划'));
});

test('public lookup is an optional topics panel in model mode; opening it never dispatches a search or model', async () => {
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE }); await screen.settle(); assert.equal(screen.lookupPanel(), undefined); assert.equal(screen.gets.length, 0);
  await screen.send('推荐社区服务方向'); assert.equal(screen.lookupPanel(), undefined); assert.equal(Object.hasOwn(screen.localCalls[0], 'lookupId'), false);
  await screen.modelMode(); const panel = screen.lookupPanel(); assert.ok(panel); assert.equal(panel.props.purpose, 'topics'); assert.match(panel.props.initialQuery, /武汉市/); assert.match(panel.props.initialQuery, /2026-10-18/);
  assert.deepEqual(screen.gets, ['/api/services']); assert.equal(screen.posts.length, 0); assert.match(text(screen.tree), /用于模型研究/);
  await screen.patch({ readOnly: true }); assert.equal(screen.lookupPanel(), undefined); await screen.patch({ readOnly: false }); assert.ok(screen.lookupPanel());
});

test('a ready immutable lookup requires separate attachment and fresh model consent, then travels with the adopted turn', async () => {
  const cited = { id: 'lookup-source-1', title: '武汉社区公共服务来源', url: 'https://www.wuhan.gov.cn/example', authority: '公开网页', coverage: 'search_excerpt', snippet: lookupReceipt().results[0].snippet, retrievedAt: '2026-10-18T09:00:01Z', sha256: 'e'.repeat(64) };
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, post: request => { const turn = { ...makeTurn(request), id: request.idempotencyKey, sources: [cited] }; turn.assistant.items[0].sourceIds = [cited.id]; return turn; } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); screen.lookupPanel().props.onLookupReady(lookupReceipt()); await screen.settle();
  const attachment = screen.checkbox('将检索回执用于本轮模型'); assert.equal(attachment.props.checked, false); assert.match(text(screen.tree), /检索词：武汉 社区公共服务 2026年10月/); assert.equal(screen.posts.length, 0);
  await screen.query('根据这些公开线索，细化研究问题'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); assert.equal(screen.button('发送↑').props.disabled, false);
  screen.check('将检索回执用于本轮模型'); await screen.settle(); assert.equal(screen.button('发送↑').props.disabled, true); assert.equal(screen.checkbox('确认选题 Agent 模型调用').props.checked, false);
  screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.posts.length, 1); assert.equal(screen.posts[0].body.lookupId, LOOKUP_ONE); assert.equal(screen.posts[0].body.projectId, PROJECT_ONE); assert.equal(screen.button('采用到研究简报 →').props.disabled, false);
  assert.match(text(screen.tree), /网页片段/); assert.match(text(screen.tree), /这是已返回的公开网页片段/);
  screen.click('采用到研究简报 →'); assert.equal(screen.adopted.length, 1); assert.equal(screen.adopted[0].length, 3); assert.deepEqual(screen.adopted[0][2].sources, [cited]); assert.equal(screen.adopted[0][2].id, screen.posts[0].body.idempotencyKey);
  await screen.query('下一轮讨论'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.lookupPanel().props.onLookupReady(lookupReceipt(LOOKUP_TWO)); await screen.settle();
  assert.equal(screen.checkbox('将检索回执用于本轮模型').props.checked, false); assert.equal(screen.checkbox('确认选题 Agent 模型调用').props.checked, false); assert.equal(screen.button('采用到研究简报 →').props.disabled, true);
});

test('saved parsed lookup receipts reopen unchecked without automatic lookup or model; older and malformed drafts preserve the conversation', async () => {
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE }); await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); screen.lookupPanel().props.onLookupReady(lookupReceipt()); await screen.settle(); screen.check('将检索回执用于本轮模型'); await screen.query('尚未发送的新问题');
  const cache = new Map(screen.cache); screen.unmount(); const restored = mount({ ownerId: 'alice', projectId: PROJECT_ONE, cache }); await restored.settle();
  assert.equal(restored.posts.length, 0); assert.equal(restored.gets.length, 0); assert.equal(restored.textarea().props.value, '尚未发送的新问题'); assert.match(text(restored.tree), /社区服务体验的研究/);
  await restored.modelMode(); assert.equal(restored.checkbox('将检索回执用于本轮模型').props.checked, false); assert.equal(restored.checkbox('将检索回执用于本轮模型').props.disabled, false); assert.equal(restored.posts.length, 0); assert.deepEqual(restored.gets, ['/api/services']);
  for (const variant of ['old', 'invalid']) {
    const draftCache = new Map(screen.cache); for (const [key, raw] of draftCache) { const draft = structuredClone(raw); if (variant === 'old') delete draft.lookup; else draft.lookup.receipt.credits = null; draftCache.set(key, draft); }
    const reopened = mount({ ownerId: 'alice', projectId: PROJECT_ONE, cache: draftCache }); await reopened.settle(); assert.match(text(reopened.tree), /社区服务体验的研究/); assert.equal(reopened.textarea().props.value, '尚未发送的新问题'); await reopened.modelMode(); assert.equal(reopened.checkbox('将检索回执用于本轮模型'), undefined); assert.equal(reopened.posts.length, 0);
  }
});

test('late lookup callbacks fail closed across owner, project, profile/date, permission and research-reference changes', async () => {
  for (const change of ['owner', 'project', 'profile', 'date', 'permission', 'intent', 'candidate']) {
    const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE }); await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); const receive = screen.lookupPanel().props.onLookupReady;
    if (change === 'owner') await screen.account('bob');
    else if (change === 'project') await screen.patch({ projectId: PROJECT_TWO });
    else if (change === 'profile') { await screen.patch({ profile: { ...baseProfile, city: '宜昌市' } }); await screen.patch({ profile: structuredClone(baseProfile) }); }
    else if (change === 'date') { await screen.patch({ profile: { ...baseProfile, referenceDate: '2026-10-19' } }); await screen.patch({ profile: structuredClone(baseProfile) }); }
    else if (change === 'permission') { await screen.patch({ readOnly: true }); await screen.patch({ readOnly: false }); }
    else if (change === 'intent') { await screen.query('已写好的问题'); screen.click('细化问题'); await screen.settle(); screen.click('发现方向'); await screen.settle(); }
    else { const candidate = () => walk(screen.tree).find(node => node.type === 'input' && !node.props['aria-label']); candidate().props.onChange({ target: { checked: false } }); await screen.settle(); candidate().props.onChange({ target: { checked: true } }); await screen.settle(); }
    receive(lookupReceipt()); await screen.settle(); assert.equal(screen.checkbox('将检索回执用于本轮模型'), undefined, change); assert.equal(screen.posts.length, 0); assert.equal(screen.adopted.length, 0);
  }
});

test('unknown, nonready and invalid lookup callbacks never become attachable model evidence', async () => {
  const screen = mount({ ownerId: 'alice' }); await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); const receive = screen.lookupPanel().props.onLookupReady;
  for (const status of ['queued', 'running', 'failed', 'outcome_unknown']) { receive({ ...lookupReceipt(), status }); await screen.settle(); assert.equal(screen.checkbox('将检索回执用于本轮模型'), undefined); }
  receive({ ...lookupReceipt(), credits: null }); await screen.settle(); assert.equal(screen.checkbox('将检索回执用于本轮模型'), undefined); assert.match(text(screen.tree), /尚未核实用量/);
  receive({ ...lookupReceipt(), results: [{ title: '无效来源', snippet: '不能采用', url: 'javascript:alert(1)' }] }); await screen.settle(); assert.equal(screen.checkbox('将检索回执用于本轮模型'), undefined);
  receive({ ...lookupReceipt(), results: [] }); await screen.settle(); assert.equal(screen.checkbox('将检索回执用于本轮模型').props.disabled, true); assert.equal(screen.posts.length, 0);
});

test('busy and unresolved model turns cannot launch or accept new lookup work; exact frozen replay keeps its original lookup', async () => {
  let dispatches = 0;
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, post: request => { if (++dispatches === 1) throw Error('连接中断'); return { ...makeTurn(request), id: request.idempotencyKey }; }, get: () => { throw new screen.ApiError('not_found', 404); } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); const receive = screen.lookupPanel().props.onLookupReady; receive(lookupReceipt()); await screen.settle(); screen.check('将检索回执用于本轮模型'); await screen.query('附带这些公开来源'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.lookupPanel(), undefined); assert.equal(screen.posts[0].body.lookupId, LOOKUP_ONE); receive(lookupReceipt(LOOKUP_TWO)); await screen.settle(); assert.equal([...screen.cache.values()][0].lookup.receipt.id, LOOKUP_ONE);
  await screen.patch({ profile: { ...baseProfile, city: '宜昌市' } }); screen.click('核对原请求'); await screen.settle(); screen.check('确认按原材料重试同一请求'); await screen.settle(); screen.click('重试原请求'); await screen.settle();
  assert.equal(screen.posts.length, 2); assert.deepEqual(screen.posts[1].body, screen.posts[0].body); assert.equal(screen.posts[1].body.lookupId, LOOKUP_ONE); assert.equal(screen.posts[1].body.profile.city, '武汉市');
});

test('a service-loading busy interval unmounts lookup and invalidates its late callback without creating a model operation', async () => {
  const pending = deferred(), screen = mount({ ownerId: 'alice', services: () => pending.promise }); await screen.settle(); screen.click('个人模型'); await screen.settle();
  const receive = screen.lookupPanel().props.onLookupReady; screen.click('读取我的研究模型'); await screen.settle(); assert.equal(screen.lookupPanel(), undefined); assert.equal(screen.storage.size, 0);
  receive(lookupReceipt()); await screen.settle(); assert.equal(screen.checkbox('将检索回执用于本轮模型'), undefined);
  pending.resolve({ services: [{ id: 'service-1', label: '模型一', provider: 'openai', revision: 1, capabilities: ['research'] }] }); await screen.settle(); receive(lookupReceipt()); await screen.settle(); assert.ok(screen.lookupPanel()); assert.equal(screen.checkbox('将检索回执用于本轮模型'), undefined); assert.equal(screen.posts.length, 0);
});

test('composer/input drift and profile/read-only away-back transitions cannot re-enable an older proposal', async () => {
  const screen = mount(); await screen.settle(); await screen.send('社区服务有哪些方向');
  assert.equal(screen.button('采用到研究简报 →').props.disabled, false);
  await screen.query('我想换个范围'); assert.equal(screen.button('采用到研究简报 →').props.disabled, true);
  await screen.query(''); assert.equal(screen.button('采用到研究简报 →').props.disabled, true);
  await screen.send('按这些条件重新推荐');
  const adoptionButtons = () => walk(screen.tree).filter(node => node.type === 'button' && text(node) === '采用到研究简报 →');
  assert.equal(adoptionButtons().at(-1).props.disabled, false);
  await screen.patch({ readOnly: true }); await screen.patch({ readOnly: false }); assert.equal(adoptionButtons().at(-1).props.disabled, true);
  await screen.patch({ profile: { ...baseProfile, city: '宜昌市' } }); await screen.patch({ profile: structuredClone(baseProfile) }); assert.equal(adoptionButtons().at(-1).props.disabled, true);
});

test('Chinese composition Enter never dispatches; explicit team-condition adoption remains opt-in', async () => {
  const screen = mount(); await screen.settle(); await screen.query('预算500，怎么选题');
  let prevented = 0; const field = screen.textarea(); field.props.onCompositionStart(); field.props.onKeyDown({ key: 'Enter', shiftKey: false, keyCode: 229, nativeEvent: { isComposing: true }, preventDefault() { prevented++; } });
  await screen.settle(); assert.equal(screen.localCalls.length, 0); assert.equal(prevented, 0);
  screen.textarea().props.onCompositionEnd(); screen.textarea().props.onKeyDown({ key: 'Enter', shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, preventDefault() { prevented++; } }); await screen.settle();
  assert.equal(screen.localCalls.length, 1); assert.equal(screen.updated.length, 0); assert.equal(prevented, 1);
  screen.click('更新团队条件'); assert.equal(screen.updated[0].budgetYuan, 500); assert.equal(screen.localCalls[0].profile.budgetYuan, 200);
});

test('a late response is retained only in its account/project; read-only changes disable adoption permanently', async () => {
  const pending = deferred(), screen = mount({ local: () => pending.promise }); await screen.settle(); await screen.send('社区服务方向');
  await screen.patch({ readOnly: true }); pending.resolve(makeTurn({ profile: baseProfile, message: '社区服务方向', intent: 'recommend' })); await screen.settle();
  await screen.patch({ readOnly: false }); assert.equal(screen.button('采用到研究简报 →').props.disabled, true);
  await screen.patch({ cacheNamespace: 'project:two' }); assert.doesNotMatch(text(screen.tree), /社区服务体验的研究/);
  assert.equal(screen.cache.size, 0);
});

test('unknown model calls freeze a nonce and reconcile by GET without another provider dispatch', async () => {
  let unknown = true;
  const screen = mount({ ownerId: 'alice', post: () => { throw Error('连接中断'); }, get: () => { const request = screen.posts[0].body; return { ...makeTurn(request, 2), id: request.idempotencyKey, ...(unknown ? { status: 'outcome_unknown', assistant: null, errorCode: 'provider_unknown' } : {}) }; } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); await screen.query('细化这个问题'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.posts.length, 1); assert.equal(screen.posts[0].body.parentTurnId, null); assert.equal(screen.posts[0].body.consent, true);
  assert.equal(screen.button('发送↑').props.disabled, true); screen.click('核对原请求'); await screen.settle();
  assert.equal(screen.posts.length, 1); assert.equal(screen.gets.at(-1), '/api/topic-agent/turns/nonce-1?scope=global'); assert.match(text(screen.tree), /原调用结果待核对/);
  unknown = false; screen.click('核对原请求'); await screen.settle(); assert.equal(screen.posts.length, 1); assert.doesNotMatch(text(screen.tree), /原调用结果待核对/);
  assert.match(text(screen.tree), /合成模型验收/); assert.equal(screen.button('采用到研究简报 →').props.disabled, false);
});

test('predispatch research-scope rejection clears its pending nonce and recovery UI, preserves the question and permits an explicitly changed request', async () => {
  const explanation = '当前资料尚未覆盖这个研究范围。请调整关注领域或补充可调查的对象后重试。'; let dispatches = 0;
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, post: request => { if (++dispatches === 1) throw new screen.ApiError('research_scope_unavailable', 422, explanation); return { ...makeTurn(request), id: request.idempotencyKey }; } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); await screen.query('研究资料尚未覆盖的主题'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.posts.length, 1); assert.equal(screen.storage.size, 0); assert.equal([...screen.cache.values()][0].pending, null); assert.equal(screen.textarea().props.disabled, false); assert.equal(screen.textarea().props.value, '研究资料尚未覆盖的主题');
  assert.match(text(screen.tree), /请调整关注领域或补充可调查的对象后重试/); assert.doesNotMatch(text(screen.tree), /原调用结果待核对/); assert.equal(walk(screen.tree).some(node => node.type === 'button' && text(node) === '核对原请求'), false); assert.equal(screen.checkbox('确认选题 Agent 模型调用').props.checked, false);
  await screen.query('改用可覆盖的社区公共服务方向'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.posts.length, 2); assert.notEqual(screen.posts[1].body.idempotencyKey, screen.posts[0].body.idempotencyKey); assert.equal(screen.posts[1].body.message, '改用可覆盖的社区公共服务方向'); assert.equal(screen.gets.filter(path => path.includes('/api/topic-agent/')).length, 0); assert.equal(screen.storage.size, 0); assert.doesNotMatch(text(screen.tree), /当前资料尚未覆盖这个研究范围/);
});

test('an unknown potentially billable API failure retains its frozen nonce and requires reconciliation instead of a new send', async () => {
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, post: () => { throw new screen.ApiError('provider_outcome_unknown', 502, '模型调用结果尚待核对，请先读取原调用回执。'); } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); await screen.query('细化这个研究问题'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.posts.length, 1); assert.equal(screen.storage.size, 1); const frozen = JSON.parse([...screen.storage.values()][0]); assert.deepEqual(frozen.request, screen.posts[0].body); assert.equal([...screen.cache.values()][0].pending.request.idempotencyKey, frozen.request.idempotencyKey);
  assert.equal(screen.button('发送↑').props.disabled, true); assert.equal(screen.textarea().props.disabled, true); assert.ok(screen.button('核对原请求')); assert.match(text(screen.tree), /原调用结果待核对/); assert.equal(screen.gets.filter(path => path.includes('/api/topic-agent/')).length, 0);
});

test('account/project cache keys isolate conversations and stale handlers cannot adopt after an account switch', async () => {
  const screen = mount({ ownerId: 'alice' }); await screen.settle(); await screen.send('社区服务方向'); const oldAdopt = screen.button('采用到研究简报 →').props.onClick;
  assert.equal(screen.cache.size, 1); assert.match([...screen.cache.keys()][0], /alice:project%3Aone/);
  await screen.account('bob'); oldAdopt(); assert.equal(screen.adopted.length, 0); assert.doesNotMatch(text(screen.tree), /社区服务体验的研究/);
  await screen.send('另一个账号的方向'); await screen.patch({ cacheNamespace: 'project:two' }); assert.doesNotMatch(text(screen.tree), /社区服务体验的研究/);
});

test('refresh recovers the original pending nonce and source version without dispatching automatically', async () => {
  const screen = mount({ ownerId: 'alice', post: () => { throw Error('连接中断'); } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); await screen.query('请细化'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.storage.size, 1); const frozen = JSON.parse([...screen.storage.values()][0]); assert.equal(frozen.request.idempotencyKey, screen.posts[0].body.idempotencyKey); assert.deepEqual(frozen.sourceVersions, versions);
  screen.unmount();
  // A newer published source set must not make a historical frozen receipt unrecoverable.
  frozen.sourceVersions.topicDigest = 'd'.repeat(64); const storage = new Map(); storage.set([...screen.storage.keys()][0], JSON.stringify(frozen));
  const restored = mount({ ownerId: 'alice', storage, get: () => ({ ...makeTurn(frozen.request), id: frozen.request.idempotencyKey, sourceVersions: frozen.sourceVersions }) }); await restored.settle();
  assert.equal(restored.gets.length, 0); assert.equal(restored.posts.length, 0); assert.match(text(restored.tree), /原调用结果待核对/);
  restored.click('核对原请求'); await restored.settle(); assert.equal(restored.posts.length, 0); assert.equal(restored.gets[0], `/api/topic-agent/turns/${frozen.request.idempotencyKey}?scope=global`); assert.equal(restored.verifications.at(-1).topicDigest, 'd'.repeat(64));
  assert.equal(restored.storage.size, 0); assert.equal(restored.button('采用到研究简报 →').props.disabled, true);
});

test('a genuinely missing receipt offers an explicitly consented replay of the exact original body', async () => {
  let dispatches = 0;
  const screen = mount({ ownerId: 'alice', post: request => { if (++dispatches === 1) throw Error('连接中断'); return { ...makeTurn(request), id: request.idempotencyKey }; }, get: () => { throw new screen.ApiError('not_found', 404); } });
  await screen.settle(); await screen.send('社区服务方向'); await screen.modelMode(); await screen.query('请细化'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  screen.click('核对原请求'); await screen.settle(); assert.equal(screen.posts.length, 1); assert.equal(screen.button('重试原请求').props.disabled, true);
  screen.check('确认按原材料重试同一请求'); await screen.settle(); screen.click('重试原请求'); await screen.settle();
  assert.equal(screen.posts.length, 2); assert.deepEqual(screen.posts[1].body, screen.posts[0].body); assert.equal(screen.storage.size, 0);
});

test('explicit account history lookup is read-only and cannot silently adopt a receipt into another project', async () => {
  const historical = { ...makeTurn({ profile: baseProfile, message: '历史模型问题', intent: 'recommend', mode: 'model' }), serviceId: 'service-1', serviceRevision: 1 };
  const screen = mount({ ownerId: 'alice', get: path => path === '/api/topic-agent/turns?scope=global' ? { turns: [historical] } : historical }); await screen.settle(); await screen.patch({ readOnly: true });
  assert.equal(screen.gets.length, 0); screen.click('查找会话记录'); await screen.settle(); assert.equal(screen.gets[0], '/api/topic-agent/turns?scope=global'); assert.match(text(screen.tree), /历史模型问题/);
  assert.equal(walk(screen.tree).some(node => node.type === 'button' && text(node) === '采用到研究简报 →'), false); assert.equal(screen.posts.length, 0);
  await screen.patch({ cacheNamespace: 'project:two' }); assert.doesNotMatch(text(screen.tree), /历史模型问题/); assert.equal(screen.adopted.length, 0);
});

for (const count of [21, 30]) test(`history accepts the API's ${count}-receipt page without treating it as invalid`, async () => {
  const turns = Array.from({ length: count }, (_, index) => makeTurn({ profile: baseProfile, message: `会话 ${index + 1}`, intent: 'recommend' }, index + 1));
  const screen = mount({ ownerId: 'alice', get: () => ({ turns }) }); await screen.settle(); screen.click('查找会话记录'); await screen.settle();
  assert.doesNotMatch(text(screen.tree), /记录格式无效/); assert.equal(walk(screen.tree).filter(node => node.type === 'time').length, count); assert.match(text(screen.tree), /会话 1/); assert.equal(screen.posts.length, 0);
});

test('new local and model turns explicitly bind a project and history never falls back to all-account records', async () => {
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, get: path => path.includes('?projectId=') ? { turns: [] } : null });
  await screen.settle(); await screen.send('社区服务方向'); assert.equal(screen.localCalls[0].projectId, PROJECT_ONE);
  screen.click('查找会话记录'); await screen.settle(); assert.equal(screen.gets.at(-1), `/api/topic-agent/turns?projectId=${PROJECT_ONE}`); assert.match(text(screen.tree), /当前项目讨论/);
  assert.equal(screen.gets.includes('/api/topic-agent/turns'), false);
  await screen.patch({ projectId: PROJECT_TWO }); assert.doesNotMatch(text(screen.tree), /社区服务体验的研究/);
  screen.click('查找会话记录'); await screen.settle(); assert.equal(screen.gets.at(-1), `/api/topic-agent/turns?projectId=${PROJECT_TWO}`);
});

test('refresh then explicit full discussion restoration enables a confirmed second send with the owned server parent', async () => {
  const chain = modelChain(1), screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, conversation: chain });
  await screen.settle(); assert.equal(screen.gets.length, 0); assert.equal(screen.posts.length, 0);
  screen.click('查找会话记录'); await screen.settle(); assert.equal(screen.gets[0], `/api/topic-agent/turns?projectId=${PROJECT_ONE}`);
  screen.click('继续这段讨论'); await screen.settle(); assert.equal(screen.gets.at(-1), `/api/topic-agent/turns/history-1/conversation?projectId=${PROJECT_ONE}`);
  const transcript = () => walk(screen.tree).find(node => node.props?.['aria-label'] === '选题对话记录');
  assert.match(text(transcript()), /保存的讨论第 1 轮/); assert.equal(screen.posts.length, 0); assert.equal(screen.updated.length, 0); assert.equal(screen.adopted.length, 0);
  assert.equal(screen.button('采用到研究简报 →').props.disabled, true); assert.equal(screen.gets.includes('/api/services'), false);
  // Current validated history candidates replace the otherwise-empty local-corpus draft.
  await screen.modelMode(); await screen.query('继续细化这个问题'); screen.check('确认选题 Agent 模型调用'); await screen.settle(); screen.click('发送↑'); await screen.settle();
  assert.equal(screen.posts.length, 1); assert.equal(screen.posts[0].body.parentTurnId, 'history-1'); assert.equal(screen.posts[0].body.projectId, PROJECT_ONE); assert.equal(screen.posts[0].body.consent, true);
  assert.equal(screen.posts[0].body.serviceId, 'service-1'); assert.equal(screen.updated.length, 0); assert.equal(screen.adopted.length, 0);
  assert.match(text(transcript()), /保存的讨论第 1 轮/); assert.match(text(transcript()), /继续细化这个问题/);
});

test('a complete multi-turn chain is shown in order and restoration keeps the current profile and unsent question', async () => {
  const chain = modelChain(3), profile = { ...baseProfile, city: '宜昌市', budgetYuan: 700 };
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, conversation: chain, profile }); await screen.settle(); await screen.query('我已经写好的新问题');
  screen.click('查找会话记录'); await screen.settle(); screen.click('查看完整讨论'); await screen.settle();
  const complete = () => walk(screen.tree).find(node => node.props?.['aria-label'] === '历史选题完整讨论');
  assert.ok(complete()); const words = text(complete()); assert.ok(words.indexOf('保存的讨论第 1 轮') < words.indexOf('保存的讨论第 2 轮')); assert.ok(words.indexOf('保存的讨论第 2 轮') < words.indexOf('保存的讨论第 3 轮'));
  screen.click('继续这段讨论'); await screen.settle(); assert.equal(screen.textarea().props.value, '我已经写好的新问题'); assert.equal(screen.updated.length, 0);
  assert.match(text(screen.tree), /宜昌市/); assert.equal(screen.posts.length, 0);
  screen.click('读取我的研究模型'); await screen.settle(); assert.match(text(screen.tree), /先使用资料库整理方向/); assert.equal(screen.button('发送↑').props.disabled, true);
});

test('only explicit successful discussion continuation focuses and reveals the composer without replacing its draft', async () => {
  const chain = modelChain(2), screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, conversation: chain });
  await screen.settle(); await screen.query('保留这条尚未发送的问题');
  screen.click('查找会话记录'); await screen.settle();
  const row = walk(screen.tree).find(node => node.type === 'button' && walk(node).some(child => child.props?.className === 'historySnippet'));
  await row.props.onClick(); await screen.settle(); screen.click('查看完整讨论'); await screen.settle();
  assert.equal(screen.focusCalls.length, 0); assert.equal(screen.scrollCalls.length, 0);
  screen.click('继续这段讨论'); await screen.settle();
  assert.equal(screen.textarea().props.value, '保留这条尚未发送的问题'); assert.deepEqual(screen.focusCalls, [{ preventScroll: true }]); assert.deepEqual(screen.scrollCalls, [{ block: 'center', inline: 'nearest' }]);
  assert.equal(screen.posts.length, 0); assert.equal(screen.updated.length, 0);
  screen.click('刷新会话记录'); await screen.settle(); screen.click('查看完整讨论'); await screen.settle();
  assert.equal(screen.focusCalls.length, 1); assert.equal(screen.scrollCalls.length, 1);
});

test('composition suppresses restoration focus rather than moving it after composition ends; local results do not focus automatically', async () => {
  const pending = deferred(), chain = modelChain(1), screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, get: path => path.includes('/conversation?') ? pending.promise : { turns: chain } });
  await screen.settle(); await screen.query('正在补充的问题'); screen.click('查找会话记录'); await screen.settle(); screen.click('继续这段讨论'); await screen.settle();
  screen.textarea().props.onCompositionStart(); pending.resolve({ turns: chain }); await screen.settle();
  assert.equal(screen.textarea().props.value, '正在补充的问题'); assert.equal(screen.focusCalls.length, 0); assert.equal(screen.scrollCalls.length, 0);
  screen.textarea().props.onCompositionEnd(); await screen.settle(); assert.equal(screen.focusCalls.length, 0); assert.equal(screen.scrollCalls.length, 0);
  const local = mount(); await local.settle(); await local.send('先推荐社区服务方向'); await local.send('再比较两个方向');
  assert.equal(local.localCalls.length, 2); assert.equal(local.focusCalls.length, 0); assert.equal(local.scrollCalls.length, 0);
});

test('history rows identify their saved question with a normalized snippet while preserving the original receipt', async () => {
  const chain = modelChain(1); chain[0].message = '  武汉社区\n公共服务   触点，哪些值得研究？  ';
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, conversation: chain }); await screen.settle(); screen.click('查找会话记录'); await screen.settle();
  const snippet = walk(screen.tree).find(node => node.props?.className === 'historySnippet'); assert.equal(text(snippet), '武汉社区 公共服务 触点，哪些值得研究？');
  const receipt = walk(screen.tree).find(node => node.props?.['aria-label'] === '历史选题回执'); assert.match(text(receipt), /武汉社区\n公共服务   触点/); assert.equal(screen.posts.length, 0);
});

test('scope-mismatched history and conversation responses are rejected without project adoption or provider dispatch', async () => {
  const foreign = modelChain(1, PROJECT_TWO), own = modelChain(1);
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, get: path => path.includes('/conversation?') ? { turns: foreign } : { turns: own } }); await screen.settle(); screen.click('查找会话记录'); await screen.settle(); screen.click('继续这段讨论'); await screen.settle();
  assert.match(text(screen.tree), /讨论链格式无效/); assert.equal(screen.posts.length, 0); assert.equal(screen.updated.length, 0); assert.equal(screen.adopted.length, 0);
  const mixed = mount({ ownerId: 'alice', projectId: PROJECT_ONE, get: () => ({ turns: foreign }) }); await mixed.settle(); mixed.click('查找会话记录'); await mixed.settle(); assert.match(text(mixed.tree), /会话记录与当前项目不一致/);
  assert.equal(walk(mixed.tree).some(node => node.props?.['aria-label'] === '历史选题回执'), false);
});

test('permission, project and account changes suppress a late full-conversation restore', async () => {
  for (const change of ['permission', 'project', 'account']) {
    const pending = deferred(), chain = modelChain(1), screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, get: path => path.includes('/conversation?') ? pending.promise : { turns: chain } });
    await screen.settle(); screen.click('查找会话记录'); await screen.settle(); screen.click('继续这段讨论'); await screen.settle();
    if (change === 'permission') { await screen.patch({ readOnly: true }); await screen.patch({ readOnly: false }); }
    else if (change === 'project') await screen.patch({ projectId: PROJECT_TWO }); else await screen.account('bob');
    pending.resolve({ turns: chain }); await screen.settle(); const transcript = walk(screen.tree).find(node => node.props?.['aria-label'] === '选题对话记录'); assert.doesNotMatch(text(transcript), /保存的讨论第/); assert.equal(screen.posts.length, 0); assert.equal(screen.adopted.length, 0); assert.equal(screen.focusCalls.length, 0); assert.equal(screen.scrollCalls.length, 0);
  }
});

for (const kind of ['unknown', 'failed', 'outdated', 'twelve']) test(`${kind} conversation is readable but cannot continue or call a provider`, async () => {
  const chain = modelChain(kind === 'twelve' ? 12 : 1);
  if (kind === 'unknown') Object.assign(chain.at(-1), { status: 'outcome_unknown', assistant: null, errorCode: 'provider_unknown' });
  if (kind === 'failed') Object.assign(chain.at(-1), { status: 'failed', assistant: null, errorCode: 'provider_failed' });
  if (kind === 'outdated') chain[0].sourceVersions = { ...versions, topicDigest: 'd'.repeat(64) };
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, conversation: chain }); await screen.settle(); screen.click('查找会话记录'); await screen.settle(); screen.click('查看完整讨论'); await screen.settle();
  assert.ok(walk(screen.tree).find(node => node.props?.['aria-label'] === '历史选题完整讨论')); assert.equal(screen.button('继续这段讨论').props.disabled, true); assert.equal(screen.posts.length, 0);
  assert.match(text(screen.tree), kind === 'unknown' ? /先核对原调用/ : kind === 'failed' ? /未完成，保留记录后可以开始新讨论/ : kind === 'outdated' ? /资料版本已更新/ : /已满 12 轮/);
});

test('legacy unscoped pending reconciles in global scope without exposing its transcript as project history', async () => {
  const request = { schemaVersion: 1, idempotencyKey: 'legacy-nonce', catalogVersion: 'catalog-test', profile: baseProfile, candidateIds: ['topic-1'], message: '旧版独立讨论私有内容', intent: 'recommend', parentTurnId: null, mode: 'model', serviceId: 'service-1', serviceRevision: 1, consent: true };
  const original = { schemaVersion: 1, ownerId: 'alice', namespace: `project:${PROJECT_ONE}`, request, context: 'legacy-context', sourceVersions: versions };
  const storage = new Map([[`evix.topic.agent.pending.v1:alice:project%3A${PROJECT_ONE}`, JSON.stringify(original)]]);
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, cacheNamespace: `project:${PROJECT_ONE}`, storage, get: () => ({ ...makeTurn(request), id: request.idempotencyKey }) }); await screen.settle();
  assert.match(text(screen.tree), /旧版独立讨论的待核对调用/); assert.doesNotMatch(text(screen.tree), /旧版独立讨论私有内容/);
  screen.click('核对原请求'); await screen.settle(); assert.equal(screen.gets[0], '/api/topic-agent/turns/legacy-nonce?scope=global'); assert.equal(screen.posts.length, 0); assert.equal(screen.storage.size, 0); assert.doesNotMatch(text(screen.tree), /旧版独立讨论私有内容/); assert.equal(screen.adopted.length, 0);
});

test('legacy recovery transfer preserves the nonce and source bytes, respects navigation cancel, and refuses to overwrite another global pending call', async () => {
  const request = { schemaVersion: 1, idempotencyKey: 'legacy-nonce', catalogVersion: 'catalog-test', profile: baseProfile, candidateIds: ['topic-1'], message: '旧版独立讨论私有内容', intent: 'recommend', parentTurnId: null, mode: 'model', serviceId: 'service-1', serviceRevision: 1, consent: true };
  const original = { schemaVersion: 1, ownerId: 'alice', namespace: `project:${PROJECT_ONE}`, request, context: 'legacy-context', sourceVersions: versions }, oldKey = `evix.topic.agent.pending.v1:alice:project%3A${PROJECT_ONE}`, globalKey = 'evix.topic.agent.pending.v1:alice:global';
  const screen = mount({ ownerId: 'alice', projectId: PROJECT_ONE, cacheNamespace: `project:${PROJECT_ONE}`, storage: new Map([[oldKey, JSON.stringify(original)]]), navigateAllowed: false }); await screen.settle(); screen.click('到独立讨论核对'); await screen.settle();
  assert.equal(screen.storage.has(oldKey), true); const transferred = JSON.parse(screen.storage.get(globalKey)); assert.deepEqual(transferred.request, request); assert.deepEqual(transferred.sourceVersions, versions); assert.match(transferred.context, /^recovered-independent:/); assert.equal(Object.hasOwn(transferred.request, 'projectId'), false); assert.equal(screen.posts.length, 0);
  const blocked = mount({ ownerId: 'alice', projectId: PROJECT_ONE, cacheNamespace: `project:${PROJECT_ONE}`, storage: new Map([[oldKey, JSON.stringify(original)], [globalKey, JSON.stringify({ ...original, namespace: 'global', request: { ...request, idempotencyKey: 'other-nonce' } })]]) }); await blocked.settle(); blocked.click('到独立讨论核对'); await blocked.settle(); assert.equal(blocked.navigations.length, 0); assert.equal(JSON.parse(blocked.storage.get(globalKey)).request.idempotencyKey, 'other-nonce'); assert.match(text(blocked.tree), /已有待核对/);
  for (const conflict of [{ request: { ...request, message: '同一标识但不同材料' } }, { sourceVersions: { ...versions, topicDigest: 'e'.repeat(64) } }]) {
    const global = { ...original, namespace: 'global', ...conflict }, raw = JSON.stringify(global);
    const scoped = mount({ ownerId: 'alice', projectId: PROJECT_ONE, cacheNamespace: `project:${PROJECT_ONE}`, storage: new Map([[oldKey, JSON.stringify(original)], [globalKey, raw]]) }); await scoped.settle(); scoped.click('到独立讨论核对'); await scoped.settle();
    assert.equal(scoped.navigations.length, 0); assert.equal(scoped.storage.get(globalKey), raw); assert.equal(scoped.storage.has(oldKey), true); assert.match(text(scoped.tree), /已有待核对/);
  }
});
