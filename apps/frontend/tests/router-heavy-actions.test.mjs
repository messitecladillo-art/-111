import assert from 'node:assert/strict';
import test from 'node:test';
import { needsAgentShellHandoff } from '../lib/agent/dock.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { resolveHeavyRouted } from '../lib/agent/router-heavy-actions.ts';
import {
  formatLookupCountyTurn,
  formatRecommendResourceTurn,
  route,
  toolTurn,
} from '../lib/agent/router.ts';

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const HEX_COLOR_RE = /#[0-9A-Fa-f]{6}\b/u;
const BENTO_OR_TAG_RE = /\bBento\b|\[[a-z0-9_-]+\]/iu;

function makeCtx(overrides = {}) {
  const emptyState = { design: null, dataset: null, report: null, resultPending: false };
  return {
    room: null,
    light: illuminate(emptyState),
    traces: [],
    ...overrides,
  };
}

function flattenLines(lines) {
  return (lines ?? [])
    .flat()
    .map((seg) => seg.text)
    .join('');
}

function collectAllVisibleTurnText(turn) {
  const chunks = [flattenLines(turn.lines)];
  for (const card of turn.cards ?? []) {
    chunks.push(card.title ?? '');
    if ('lines' in card && Array.isArray(card.lines)) {
      chunks.push(flattenLines(card.lines));
    }
    if ('links' in card && Array.isArray(card.links)) {
      for (const link of card.links) chunks.push(link.label);
    }
  }
  for (const chip of turn.chips ?? []) {
    chunks.push(chip.label);
  }
  return chunks.join('\n');
}

function assertTurnTextPurity(turn, label) {
  const combined = collectAllVisibleTurnText(turn);
  assert.doesNotMatch(
    combined,
    FORBIDDEN_BRACKETS_RE,
    `${label}: must contain zero lenticular or corner brackets`,
  );
  assert.doesNotMatch(
    combined,
    HEX_COLOR_RE,
    `${label}: must contain zero raw #RRGGBB hex color codes`,
  );
  assert.doesNotMatch(
    combined,
    BENTO_OR_TAG_RE,
    `${label}: must contain zero English Bento jargon or raw bracketed catalog IDs`,
  );
  return combined;
}

test('formatLookupCountyTurn formats curated, baseline, multi-hit clipping, and empty fallback cleanly', () => {
  const missTurn = formatLookupCountyTurn('  未知虚构县  ', []);
  const missText = assertTurnTextPurity(missTurn, 'empty-county-fallback');
  assert.match(missText, /未找到与“未知虚构县”匹配的县区档案/);
  assert.equal(missTurn.cards?.[0]?.title, '区县风物检索');
  assert.match(missText, /未命中区县/);
  assert.deepEqual(missTurn.chips?.[0], {
    label: '打开中国县域风物志',
    action: { type: 'stage', stage: 'library' },
  });

  const longFeature = '甲'.repeat(130);
  const singleCurated = formatLookupCountyTurn('330782', [
    {
      code: '330782',
      name: '义乌市',
      provinceCode: '330000',
      provinceName: '浙江省',
      prefectureCode: '330700',
      prefectureName: '金华市',
      regionBelt: '华东沿海',
      landmarkName: '国际商贸城',
      landmarkIllustrationId: 'yiwu_market',
      dataOrigin: 'curated_benchmark',
      tags: [],
      features: {
        politicsGovernance: longFeature,
        economyIndustry: '全球小商品贸易枢纽与跨境电商集聚地。',
        cultureHeritage: '拨浪鼓商帮文化与鸡鸣阁传统信义精神。',
        societyLivelihood: '外来创业人口与本地社区深度融合。',
        customsLifestyle: '红糖麻花传统节俗与多语种国际社区日常。',
      },
    },
  ]);
  const singleText = assertTurnTextPurity(singleCurated, 'single-curated-county');
  assert.match(singleText, /共命中 1 条中国县域风物档案/);
  assert.match(singleText, /330782 义乌市 · 浙江省 · 金华市 · 代表地标 国际商贸城 · 精选五维档案/);
  assert.match(singleText, /标签 区域基线特征/);
  assert.match(singleText, new RegExp(`政 ${'甲'.repeat(119)}…`, 'u'));

  const multiHits = formatLookupCountyTurn('县域', [
    {
      code: '110101',
      name: '东城区',
      provinceCode: '110000',
      provinceName: '北京市',
      prefectureCode: '110100',
      prefectureName: '市辖区',
      regionBelt: '华北平原',
      landmarkName: '钟鼓楼',
      landmarkIllustrationId: 'bell_tower',
      dataOrigin: 'curated_benchmark',
      tags: ['历史街区', '基层治理'],
      features: {
        politicsGovernance: '乙'.repeat(60),
        economyIndustry: '文化创意与现代服务业。',
        cultureHeritage: '中轴线历史文脉保护。',
        societyLivelihood: '胡同院落老龄化与便民微更新。',
        customsLifestyle: '四合院邻里节庆民俗。',
      },
    },
    {
      code: '130181',
      name: '辛集市',
      provinceCode: '130000',
      provinceName: '河北省',
      prefectureCode: '130100',
      prefectureName: '石家庄市',
      regionBelt: '华北平原',
      landmarkName: '皮都商贸街区',
      landmarkIllustrationId: 'county_center',
      dataOrigin: 'provincial_baseline_synthesis',
      tags: ['县域经济'],
      features: {
        politicsGovernance: '县域商贸治理。',
        economyIndustry: '特色生态皮革与现代农业。',
        cultureHeritage: '农民画民间艺术传统。',
        societyLivelihood: '城乡公共服务一体化。',
        customsLifestyle: '冀中传统庙会与元宵灯会。',
      },
    },
  ]);
  const multiText = assertTurnTextPurity(multiHits, 'multi-county-hits');
  assert.match(multiText, /共命中 2 条中国县域风物档案/);
  assert.match(multiText, /全域基线/);
  assert.match(multiText, new RegExp(`政 ${'乙'.repeat(41)}…`, 'u'));
});

test('formatRecommendResourceTurn enforces slice caps, contextual lead-in, and clean labels', () => {
  const makeEntry = (prefix, count, keyName) =>
    Array.from({ length: count }, (_, idx) => ({
      item: { [keyName]: `${prefix}样例${idx + 1}` },
      score: 90 - idx,
      reasonBadge: `匹配度验证${idx + 1}`,
    }));

  const mockBundle = {
    contextSummary: '测试上下文',
    detectedSignals: ['回归'],
    charts: makeEntry('统计图', 6, 'title'),
    tables: makeEntry('三线表', 4, 'title'),
    diagrams: makeEntry('机制框图', 4, 'title'),
    infographics: makeEntry('版式图板', 4, 'label'),
    palettes: makeEntry('学术色板', 4, 'label'),
  };

  const withQuery = formatRecommendResourceTurn('  多元回归  ', mockBundle);
  const withQueryText = assertTurnTextPurity(withQuery, 'format-recommend-with-query');
  assert.match(withQueryText, /已围绕“多元回归”智能匹配研究资料库资源。/);
  assert.equal(withQuery.cards?.[0]?.title, '资源推荐 · 图表/三线表/框图/配色');
  // 4 charts + 2 tables + 2 diagrams + 2 infographics + 2 palettes = 12 rows
  assert.equal(withQuery.cards?.[0]?.lines.length, 12);
  assert.doesNotMatch(withQueryText, /统计图样例5|三线表样例3|机制框图样例3|版式图板样例3|学术色板样例3/);

  const withoutQuery = formatRecommendResourceTurn(undefined, mockBundle);
  const withoutQueryText = assertTurnTextPurity(withoutQuery, 'format-recommend-default');
  assert.match(withoutQueryText, /已结合当前研究上下文与登记结果匹配研究资料库资源。/);
  assert.deepEqual(withoutQuery.chips?.[0], {
    label: '进入研究资料库浏览全部例图',
    action: { type: 'stage', stage: 'library' },
  });
});

test('resolveHeavyRouted resolves 6-digit codes (330782 Yiwu, 522630 Taijiang), fuzzy names, and unmatched fallbacks', async () => {
  const ctx = makeCtx();

  // 1. 330782 义乌市 exact 6-digit lookup via toolTurn
  const yiwuRouted = toolTurn({ tool: 'lookup_county', args: { query: '330782' } }, ctx);
  assert.deepEqual(yiwuRouted, { lookupCounty: '330782' });
  assert.equal(needsAgentShellHandoff(yiwuRouted), true);
  const yiwuTurn = await resolveHeavyRouted(yiwuRouted);
  const yiwuText = assertTurnTextPurity(yiwuTurn, 'county-330782-yiwu');
  assert.equal(yiwuTurn.cards?.[0]?.title, '区县风物检索');
  assert.match(yiwuText, /330782 义乌市/);
  assert.match(yiwuText, /浙江省/);
  assert.match(yiwuText, /精选五维档案/);
  for (const dim of ['政 ', '经 ', '文 ', '社 ', '俗 ']) {
    assert.ok(yiwuText.includes(dim), `expected dimension "${dim}" in 330782 output`);
  }

  // 2. 522630 台江县 exact 6-digit lookup
  const taijiangRouted = toolTurn({ tool: 'lookup_county', args: { query: '522630' } }, ctx);
  assert.deepEqual(taijiangRouted, { lookupCounty: '522630' });
  const taijiangTurn = await resolveHeavyRouted(taijiangRouted);
  const taijiangText = assertTurnTextPurity(taijiangTurn, 'county-522630-taijiang');
  assert.match(taijiangText, /522630 台江县/);
  assert.match(taijiangText, /贵州省/);
  assert.match(taijiangText, /精选五维档案/);
  for (const dim of ['政 ', '经 ', '文 ', '社 ', '俗 ']) {
    assert.ok(taijiangText.includes(dim), `expected dimension "${dim}" in 522630 output`);
  }

  // 3. Natural-language route() fuzzy county name lookup & multi-hit search
  const phraseRouted = route('查一下台江县县域风物志', ctx);
  assert.ok('lookupCounty' in phraseRouted, 'natural county phrase must route to lookupCounty descriptor');
  assert.equal(needsAgentShellHandoff(phraseRouted), true);
  const phraseTurn = await resolveHeavyRouted(phraseRouted);
  const phraseText = assertTurnTextPurity(phraseTurn, 'county-fuzzy-phrase');
  assert.match(phraseText, /522630 台江县/);

  const fuzzyMultiTurn = await resolveHeavyRouted({ lookupCounty: '朝阳' });
  const fuzzyMultiText = assertTurnTextPurity(fuzzyMultiTurn, 'county-fuzzy-multi');
  assert.match(fuzzyMultiText, /共命中 [1-4] 条中国县域风物档案/);

  // 4. Unmatched 6-digit code & unmatched fuzzy county name fallbacks
  for (const missingQuery of ['999999', '绝不存在的虚构县9999']) {
    const missRouted = toolTurn({ tool: 'lookup_county', args: { query: missingQuery } }, ctx);
    assert.deepEqual(missRouted, { lookupCounty: missingQuery });
    const missTurn = await resolveHeavyRouted(missRouted);
    const missText = assertTurnTextPurity(missTurn, `county-miss-${missingQuery}`);
    assert.equal(missTurn.cards?.[0]?.title, '区县风物检索');
    assert.match(missText, /未命中区县/);
    assert.ok(missText.includes(missingQuery));
  }
});

test('resolveHeavyRouted resolves regression, clustering, KANO, and context-driven 4-catalog recommendations with zero forbidden tokens', async () => {
  const richCtx = makeCtx({
    projectTitle: '银发群体社区智慧康养服务满意度与需求分层调查',
    results: {
      results: [{ id: 'r1', title: '年龄组与智慧养老意愿交叉检验', method: 'crosstab' }],
      findings: [{ id: 'f1', title: '社区助餐与跌倒预警呈显著正向关联', summary: '高龄独居群体敏感度最高' }],
    },
  });

  const scenarios = [
    { label: 'regression', query: '多元线性回归与有序 Logit 影响机制检验', ctx: makeCtx() },
    { label: 'clustering', query: 'K-Means 潜类别受众聚类分群画像', ctx: makeCtx() },
    { label: 'kano', query: 'KANO 魅力需求四象限与 Better-Worse 优先级矩阵', ctx: makeCtx() },
    { label: 'contextual-default', query: undefined, ctx: richCtx },
  ];

  for (const scenario of scenarios) {
    const routed = toolTurn(
      {
        tool: 'recommend_resource',
        args: scenario.query ? { query: scenario.query } : {},
      },
      scenario.ctx,
    );
    assert.ok('recommendResource' in routed, `${scenario.label}: must return recommendResource descriptor`);
    assert.equal(needsAgentShellHandoff(routed), true);

    const turn = await resolveHeavyRouted(routed);
    const allText = assertTurnTextPurity(turn, `recommend-${scenario.label}`);
    assert.equal(turn.cards?.[0]?.title, '资源推荐 · 图表/三线表/框图/配色');
    for (const categoryPrefix of ['图表 ', '三线表 ', '框架图 ', '信息图板 ', '配色板 ']) {
      assert.ok(
        allText.includes(categoryPrefix),
        `${scenario.label}: expected "${categoryPrefix}" in recommendation card`,
      );
    }
    assert.deepEqual(turn.chips?.[0], {
      label: '进入研究资料库浏览全部例图',
      action: { type: 'stage', stage: 'library' },
    });
  }
});
