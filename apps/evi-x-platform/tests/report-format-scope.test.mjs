import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REPORT_FORMAT_SETTINGS, DEFAULT_REPORT_OPTIONS, REPORT_FORMAT_PROFILES,
  evaluateReportFormat, parseReportFormatOptions, parseReportFormatSettings,
} from '../lib/report-format.ts';

const defaults = () => structuredClone(DEFAULT_REPORT_FORMAT_SETTINGS);
const scoped = () => ({ ...defaults(), group: '本科组', region: '湖北', track: '自主选题', stage: '校赛' });

test('edition 17 starts with explicit unbound scope and no inherited page limit', () => {
  assert.equal(defaults().edition, '第十七届');
  assert.equal(defaults().profileId, 'research-default');
  const result = evaluateReportFormat(defaults());
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.missingScope, ['group', 'region', 'track', 'stage']);
  assert.equal(result.pageLimit, null);
});

test('completing scope does not turn a product layout into an official rule', () => {
  const result = evaluateReportFormat(scoped());
  assert.equal(result.status, 'reference_only');
  assert.equal(result.pageLimit, null);
  assert.deepEqual(result.missingScope, []);
});

test('cross-edition archived layout is not applicable even with a complete scope', () => {
  const result = evaluateReportFormat({ ...scoped(), profileId: 'ahpu-16-report-layout-v1' });
  assert.equal(result.status, 'not_applicable');
  assert.equal(result.pageLimit, null);
  assert.match(result.detail, /第十七届.*第十六届/u);
});

test('same-edition university attachments remain scoped references, not national approval', () => {
  for (const [edition, profileId] of [['第十六届', 'ahpu-16-report-layout-v1'], ['第十七届', 'btbu-17-report-layout-v1']]) {
    const result = evaluateReportFormat({ ...scoped(), edition, profileId });
    assert.equal(result.status, 'reference_only');
    assert.equal(result.pageLimit, null);
  }
  const btbu = REPORT_FORMAT_PROFILES.find(p => p.id === 'btbu-17-report-layout-v1');
  assert.match(btbu.sourceTitle, /第十六届立丰杯/u);
  assert.match(btbu.scope, /全国第十七届/u);
});

test('scope/settings round trip preserves Chinese, Unicode and options without aliasing', () => {
  const input = { ...scoped(), region: '内蒙古自治区 🧭', options: { ...DEFAULT_REPORT_OPTIONS, part: 'appendix', includeCover: false } };
  const result = parseReportFormatSettings(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.notEqual(result.options, input.options);
  result.options.numberPages = false;
  assert.equal(input.options.numberPages, true);
});

test('settings reject missing/extra keys, arrays, invalid editions and profile IDs', () => {
  const missingStage = defaults(); delete missingStage.stage;
  for (const value of [null, [], '', 17, missingStage, { ...defaults(), extra: true },
    { ...defaults(), edition: '' }, { ...defaults(), edition: '第十八届' },
    { ...defaults(), profileId: 'official17' }, { ...defaults(), profileId: '__proto__' },
    { ...defaults(), options: null }, { ...defaults(), region: 420000 }]) {
    assert.throws(() => parseReportFormatSettings(value), Error);
  }
});

test('scope bounds count UTF-16 units and reject control/line characters', () => {
  assert.equal(parseReportFormatSettings({ ...defaults(), region: '中'.repeat(80) }).region.length, 80);
  assert.equal(parseReportFormatSettings({ ...defaults(), region: '🧭'.repeat(40) }).region.length, 80);
  for (const region of ['中'.repeat(81), '🧭'.repeat(41), '湖北\n', '\t湖北', '湖北\u0000', '湖北\u007f', '湖北\u0085', '湖北\u2028', '湖北\u2029']) {
    assert.throws(() => parseReportFormatSettings({ ...defaults(), region }), Error);
  }
  assert.ok(evaluateReportFormat({ ...scoped(), region: '   ' }).missingScope.includes('region'));
});

test('existing options contract keeps strict field types and accepts independent cover/TOC choices', () => {
  assert.deepEqual(parseReportFormatOptions(DEFAULT_REPORT_OPTIONS), DEFAULT_REPORT_OPTIONS);
  const missingPages = {...DEFAULT_REPORT_OPTIONS}; delete missingPages.numberPages;
  for (const value of [null, [], missingPages, { ...DEFAULT_REPORT_OPTIONS, extra: true },
    { ...DEFAULT_REPORT_OPTIONS, includeCover: 'false' }, { ...DEFAULT_REPORT_OPTIONS, includeToc: 0 },
    { ...DEFAULT_REPORT_OPTIONS, firstLineChars: '2' }, { ...DEFAULT_REPORT_OPTIONS, firstLineChars: 1 },
    { ...DEFAULT_REPORT_OPTIONS, numberPages: 1 }]) assert.throws(() => parseReportFormatOptions(value), Error);
  const appendix = { part: 'appendix', includeCover: false, includeToc: false, firstLineChars: 0, numberPages: false };
  assert.deepEqual(parseReportFormatOptions(appendix), appendix);
  assert.deepEqual(parseReportFormatOptions({...appendix,part:'main'}), {...appendix,part:'main'});
});
