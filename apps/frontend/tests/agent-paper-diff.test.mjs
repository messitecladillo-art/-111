import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaperSectionDiffs,
  diffParagraphLines,
  locateArtifactTarget,
  locateCheckSectionId,
} from '../lib/agent/paper-diff.ts';

function makeContent() {
  return {
    version: 3,
    title: '新能源汽车充电服务满意度调查',
    subtitle: '研究报告',
    accent: 'teal',
    slides: [],
    report: [
      { id: 'sec-abstract', title: '摘要', body: '本文围绕城市公共充电设施利用率展开调查。', source: 'manual' },
      { id: 'sec-design', title: '二、调查方案与问卷', body: '采用分层多阶段抽样确定目标社区。', source: 'manual' },
      {
        id: 'sec-data',
        title: '三、数据质量与分析',
        body: '回收有效样本 1,240 份。',
        source: 'manual',
        blocks: [
          {
            id: 'blk-fig-1',
            kind: 'figure',
            title: '各线级城市满意度对比',
            caption: '图 1 满意度对比',
            figureId: 'fig-sat-1',
            evidenceId: 'ev-sat-1',
          },
        ],
      },
      { id: 'sec-plan', title: '四、发现与行动建议', body: '建议在高频商圈加密快充桩配比。', source: 'manual' },
      { id: 'sec-refs', title: '参考文献', body: '[1] 国家能源局. 电动汽车充电基础设施统计年报.', source: 'manual' },
      { id: 'sec-app-ai', title: '附录：AI 工具使用情况说明', body: '按比赛规范记录工具与核验过程。', source: 'manual' },
    ],
  };
}

test('diffParagraphLines computes added, removed, changed, and large-section fallback diffs', () => {
  const small = diffParagraphLines(
    ['第一行保留', '旧的第二行', '第三行保留', '将被删除的第四行'],
    ['第一行保留', '新的第二行', '第三行保留', '新增结尾行', '追加末段'],
  );
  assert.equal(small.totalChanged, 3);
  assert.deepEqual(small.chunks, [
    { kind: 'changed', index: 1, before: '旧的第二行', after: '新的第二行' },
    { kind: 'changed', index: 3, before: '将被删除的第四行', after: '新增结尾行' },
    { kind: 'added', index: 4, after: '追加末段' },
  ]);

  const pureTail = diffParagraphLines(['段一', '段二'], ['段一']);
  assert.deepEqual(pureTail.chunks, [{ kind: 'removed', index: 1, before: '段二' }]);

  const bigBefore = Array.from({ length: 70 }, (_, i) => `old-${i}`);
  const bigAfter = Array.from({ length: 70 }, (_, i) => (i < 10 ? `new-${i}` : `old-${i}`));
  const large = diffParagraphLines(bigBefore, bigAfter);
  assert.equal(large.totalChanged, 10);
  assert.equal(large.chunks.length, 6);
  assert.equal(large.chunks[0].kind, 'changed');
});

test('buildPaperSectionDiffs prioritizes candidate changes, applies locks, and appends non-conflicting revisions', () => {
  const diffs = buildPaperSectionDiffs({
    changes: [
      {
        sectionId: 'sec-data',
        title: '三、数据质量与分析',
        changeType: 'updated',
        before: '回收有效样本 1,240 份。',
        after: '回收有效样本 1,240 份（有效率 92.5%）。',
        details: ['补充有效率口径'],
      },
      {
        sectionId: 'sec-new',
        title: '五、稳健性检验',
        changeType: 'added',
        before: '',
        after: '采用 Bootstrap 重抽样验证结论。',
      },
    ],
    lockedSectionIds: ['sec-data'],
    revision: {
      active: true,
      sectionId: 'sec-plan',
      title: '四、发现与行动建议',
      original: ['建议在高频商圈加密快充桩配比。'],
      proposed: ['建议按高峰排队时长优先增设 120kW 快充桩。'],
    },
  });

  assert.equal(diffs.length, 3);
  assert.equal(diffs[0].mode, 'candidate');
  assert.equal(diffs[0].locked, true);
  assert.deepEqual(diffs[0].details, ['补充有效率口径']);
  assert.equal(diffs[1].changeType, 'added');
  assert.equal(diffs[2].mode, 'revision');
  assert.equal(diffs[2].sectionId, 'sec-plan');

  // When candidate already targets the same sectionId, candidate takes precedence.
  const overlapping = buildPaperSectionDiffs({
    changes: [
      {
        sectionId: 'sec-plan',
        title: '四、发现与行动建议',
        changeType: 'updated',
        before: '旧建议',
        after: '新建议',
      },
    ],
    revision: {
      active: true,
      sectionId: 'sec-plan',
      title: '四、发现与行动建议',
      original: ['A'],
      proposed: ['B'],
    },
  });
  assert.equal(overlapping.length, 1);
  assert.equal(overlapping[0].mode, 'candidate');
});

test('locateCheckSectionId resolves report sections for structural and analytical benchmark checks', () => {
  const content = makeContent();
  assert.equal(locateCheckSectionId(content, 'abstract'), 'sec-abstract');
  assert.equal(locateCheckSectionId(content, 'references'), 'sec-refs');
  assert.equal(locateCheckSectionId(content, 'aiDisclosure'), 'sec-app-ai');
  assert.equal(locateCheckSectionId(content, 'sampling'), 'sec-design');
  assert.equal(locateCheckSectionId(content, 'tests'), 'sec-data');
  assert.equal(locateCheckSectionId(content, 'findings'), 'sec-plan');
  assert.equal(locateCheckSectionId(content, 'nonexistent-check'), 'sec-abstract');
});

test('locateArtifactTarget maps cover, frame, block, figure, text, and section artifacts onto paper sections', () => {
  const content = makeContent();

  assert.deepEqual(
    locateArtifactTarget(content, { familyId: 'cover', value: { type: 'cover' } }),
    { sectionId: null, pageZero: true },
  );
  assert.deepEqual(
    locateArtifactTarget(content, { familyId: 'frame', value: { type: 'frame' } }),
    { sectionId: null, pageZero: true },
  );
  assert.deepEqual(
    locateArtifactTarget(content, { familyId: 'block:sec-data:blk-fig-1', value: { type: 'block', block: { id: 'blk-fig-1' } } }),
    { sectionId: 'sec-data', xrefBlockId: 'blk-fig-1' },
  );
  assert.deepEqual(
    locateArtifactTarget(content, {
      familyId: 'figure:fig-sat-1',
      value: { type: 'figure', figure: { id: 'fig-sat-1' }, result: { id: 'ev-other' } },
    }),
    { sectionId: 'sec-data', xrefBlockId: 'blk-fig-1' },
  );
  assert.deepEqual(
    locateArtifactTarget(content, {
      familyId: 'text:sec-plan',
      value: { type: 'text', section: { id: 'missing-id', title: '四、发现与行动建议' } },
    }),
    { sectionId: 'sec-plan' },
  );
  assert.deepEqual(
    locateArtifactTarget(content, {
      familyId: 'section:sec-design',
      value: { type: 'text', section: { id: 'missing', title: 'missing' } },
    }),
    { sectionId: 'sec-design' },
  );
  assert.deepEqual(
    locateArtifactTarget(content, {
      familyId: 'figure:unplaced',
      value: { type: 'figure', figure: { id: 'fig-999' }, result: { id: 'ev-999' } },
    }),
    { sectionId: null },
  );
});
