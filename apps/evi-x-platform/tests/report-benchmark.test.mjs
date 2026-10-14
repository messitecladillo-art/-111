import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BENCHMARK_DIMENSIONS, benchmarkReport, isCaption, writtenLines } from '../lib/report-benchmark.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { newProjectReport } from '../lib/project-report.ts';

const section = (id, title, body = '', extra = {}) => ({ id, title, body, source: '', ...extra });
const result = (id, extra = {}) => ({ id, title: '结果' + id, sourceName: '课题组问卷', sourceUrl: '', sourceHash: 'a'.repeat(64), resultHash: 'b'.repeat(64),
  classification: 'user_provided', method: 'crosstab', n: 400, total: 420, headers: ['类别', '人数'], rows: [['甲', 200], ['乙', 200]], metrics: [], warnings: [], ...extra });
const finding = (id, action) => ({ id, title: '发现' + id, question: '问题', evidenceIds: ['r1'], interpretation: '解释', alternatives: '其他解释', scope: '本样本', action, status: 'confirmed', confirmedHashes: { r1: 'b'.repeat(64) } });
const check = (report, id) => report.checks.find(c => c.id === id);

test('guidance blocks are skipped, and captions are told apart from sentences about figures', () => {
  assert.deepEqual(writtenLines('【写作提示】说明\n1. 第一步\n2. 第二步\n\n真正的正文\n  \n第二段'), ['真正的正文', '第二段']);
  assert.ok(isCaption('图 3-1 抽样流程'));
  assert.ok(isCaption('表2 各量表的信度'));
  assert.ok(!isCaption('图3呈现了各群体的分布，城区居民占比更高。'));
});

test('the generic template scores low and its structural gaps point to blueprint sections', () => {
  const report = benchmarkReport(createEditorContent());
  assert.ok(report.score < 35, String(report.score));
  assert.deepEqual(report.dimensions.map(d => d.label), Object.values(BENCHMARK_DIMENSIONS));
  for (const c of report.checks) {
    assert.ok(c.score >= 0 && c.score <= 1, c.id);
    assert.ok(c.detail.length > 4, c.id);
    if (c.status === 'pass' || c.status === 'na') assert.deepEqual(c.fixes, [], c.id);
  }
  assert.ok(check(report, 'chapters').fixes.some(f => f.insert === 'intro'));
  assert.equal(check(report, 'abstract').status, 'fail', 'the old abstract hint is not counted as writing');
  assert.ok(report.checks.length >= 35);
});

test('the blueprint skeleton is structurally complete but does not earn credit for its own guidance', () => {
  const skeleton = benchmarkReport(newProjectReport('骨架'));
  assert.equal(check(skeleton, 'chapters').status, 'pass');
  assert.ok(check(skeleton, 'hints').score < 0.3);
  for (const id of ['questionnaire', 'aiDisclosure', 'reproducible']) {
    assert.equal(check(skeleton, id).status, 'partial', id);
    assert.match(check(skeleton, id).detail, /尚未填写/);
  }
  for (const id of ['abstract', 'references', 'sampling', 'tests', 'models']) assert.equal(check(skeleton, id).status, 'fail', id);
  assert.ok(skeleton.score < 15, `headings alone earn little: ${skeleton.score}`);
});

test('a report that shows its evidence passes the checks built for it', () => {
  const content = createEditorContent();
  content.version = 2;
  content.quality = { version: 1, results: [result('r1'), result('r2', { classification: 'simulated' })], findings: [finding('f1', '由运营部门牵头，按月跟踪到场率指标'), finding('f2', '学校宣传部门负责，评估转化率'), finding('f3', '平台方执行，监测复购')] };
  content.report = [
    section('a', '摘要', '本研究面向城市居民开展问卷调查。'.repeat(60) + '\n关键词：满意度；抽样调查；Logistic 回归；IPA；聚类'),
    section('c1', '一、研究项目简介'), section('s11', '（一）研究背景', '近年来居民文化消费持续增长[1]，相关研究指出线下活动参与度仍有提升空间[2-3]。'),
    section('c2', '二、调查方案设计与实施'),
    section('s21', '（一）调查目的', '本次调查目的有三：识别影响参与意愿的因素，评价现有服务，提出改进方案。调查对象为在本市居住满半年的 18 岁以上居民。'),
    section('s22', '（二）抽样设计', '采用分层两阶段抽样。第一阶段按城区人口规模以 PPS 方式抽取街道，第二阶段在入样街道内系统抽取住户，样本量按比例估计的公式计算，置信水平 95%，允许误差 5%，计算得到最低样本量 385 份，考虑 10% 的无效率后计划发放 430 份。'.repeat(2),
      { blocks: [{ id: 'f', kind: 'formula', text: 'n_0=\\frac{z^2p(1-p)}{e^2}', evidenceId: '', valueColumn: 0 }, { id: 't', kind: 'table', text: '表 2-1 各阶段入样单位', evidenceId: 'r1', valueColumn: 1 }] }),
    section('s23', '（三）质量控制', '质量控制贯穿设计、实施、录入与清洗：问卷经两轮专家审阅与预调查修改；访员统一培训并使用标准话术；录入采用双人校验；清洗阶段剔除注意力题答错与作答时长过短的问卷。现场督导每日抽查 10% 的问卷并回访核实，发现问题当日纠正；数据录入后按编码表逐项核对，异常值回查原始问卷。所有调查员签署保密承诺，问卷编号与受访者信息分开保存。'),
    section('c3', '三、调查数据处理及检验'),
    section('s31', '（一）预调查', '预调查共发放问卷 60 份，回收有效问卷 56 份，据此删除了两道表述含糊的题目。'),
    section('s32', '（二）正式调查数据处理', '正式调查共发放 430 份，回收有效问卷 402 份，有效回收率为 93.5%。剔除规则包括注意力题答错、作答时长低于 90 秒以及逻辑矛盾。'),
    section('s33', '（三）正式调查数据检验', '各量表的 Cronbach α 系数均在 0.82 以上，KMO 值为 0.87，Bartlett 球形检验显著，适合进一步分析。'),
    section('c4', '四、影响因素分析'),
    section('s41', '（一）差异检验与相关分析', '卡方检验显示不同年龄组的参与频率存在显著差异（χ²=18.4，p<0.001）。如图 4-1 所示，结合表 4-1 可知青年组参与更频繁。\n图 4-1 各年龄组参与频率\n表 4-1 卡方检验结果',
      { blocks: [{ id: 'c', kind: 'chart', text: '图 4-2 参与频率', evidenceId: 'r1', valueColumn: 1 }] }),
    section('s42', '（二）回归模型分析', '多分类 Logistic 回归的伪 R² 为 0.21，似然比检验显著，未发现严重的多重共线性（VIF 均小于 3）。'),
    section('c5', '五、评价与问题诊断'), section('s51', '（一）满意度与绩效评价', 'IPA 分析显示导览服务重要性高而满意度低，应优先改进。'),
    section('c6', '六、结论与建议'),
    section('s61', '（一）对策建议', '建议由街道文化站牵头、社区协会配合开展周末活动，以季度到场人次作为评估指标。'),
    section('s62', '（二）研究局限与展望', '本研究样本限于一个城市，结论外推需谨慎。'),
    section('r', '参考文献', '[1] 张某. 城市文化消费研究[J]. 统计研究, 2024, 41(2): 1-10.\n[2] 李某. 抽样调查[M]. 北京: 某出版社, 2020.\n[3] 王某. 居民活动参与[D]. 某大学, 2023.'),
    section('ap1', '附录1 调查问卷', '卷首语与全部题目。'), section('ap2', '附录2 数据与处理说明', '变量编码表。'), section('ap3', '附录3 人工智能工具使用说明', '使用某大模型润色第四章文字，人工核验全部数字。'),
  ];
  const report = benchmarkReport(content);
  for (const id of ['abstract', 'keywords', 'chapters', 'objectives', 'sampling', 'sampleSize', 'validRate', 'pilot', 'qualityControl', 'cleaning', 'reliability', 'validity',
    'tests', 'models', 'diagnostics', 'findings', 'findingActions', 'executable', 'limitations', 'causal', 'questionnaire', 'aiDisclosure', 'referenceFormat', 'reproducible', 'captions']) {
    assert.equal(check(report, id).status, 'pass', `${id}: ${check(report, id).detail}`);
  }
  assert.equal(check(report, 'simulated').status, 'na', 'the simulated result is registered but not used');
  assert.match(check(report, 'figureReferences').detail, /引用图表 2 次/);
  assert.ok(report.score > benchmarkReport(newProjectReport('骨架')).score);
});

test('correlation written as causation and undeclared simulated data are both flagged', () => {
  const content = createEditorContent();
  content.version = 2;
  content.quality = { version: 1, results: [result('r1', { classification: 'simulated' })], findings: [] };
  const body = '运动频率与观赛意愿显著相关，这导致高频运动者更愿意观赛。';
  content.report = [section('s', '一、分析', body, { blocks: [{ id: 'c', kind: 'chart', text: '分布', evidenceId: 'r1', valueColumn: 1 }] })];
  let report = benchmarkReport(content);
  assert.equal(check(report, 'causal').status, 'partial');
  assert.equal(check(report, 'simulated').status, 'fail');
  content.report[0].body = '【教学模拟数据，不能作为实际调查结果】\n' + body;
  report = benchmarkReport(content);
  assert.equal(check(report, 'simulated').status, 'pass');
});

test('figure references count sentences that cite a number, not words such as 代表', () => {
  const content = createEditorContent();
  content.report = [section('s', '一、分析', '如图 3-1 所示，结合表2与图4可知两组差异明显，代表3类人群。\n图 3-1 抽样流程\n表 2 信度检验')];
  assert.match(check(benchmarkReport(content), 'figureReferences').detail, /引用图表 3 次，图表共 2 个/);
});
