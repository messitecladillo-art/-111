import test from 'node:test';
import assert from 'node:assert/strict';

import { auditStatisticalMethodGuardrails } from '../lib/agent/numeric-verifier.ts';

test('auditStatisticalMethodGuardrails catches 7 documented modeling bad cases and passes clean drafts', () => {
  const flawedFindings = auditStatisticalMethodGuardrails({
    sections: [
      {
        title: '三、抽样方案',
        body: '采用多阶段方便抽样获取样本，按简单随机抽样公式 Z^2*p(1-p)/e^2 估算样本量，有效样本 n = 56。本研究结果直接导致消费者购买意愿显著上升。',
      },
      {
        title: '四、实证建模',
        body: '基于 n = 56 执行验证性因子分析 CFA 与 SEM，报告 RMSEA = 0.118，CFI = 0.84，整体模型拟合良好。Logistic 回归变量标准误 SE = 32.4。再用 K-Means 聚类标签作为目标训练随机森林预测准确率 97%。',
      },
      {
        title: '五、文本挖掘',
        body: '通过 SnowNLP 与词云图梳理高频情绪词汇，情感得分整体偏积极。',
      },
    ],
    results: [
      {
        id: 'logit-1',
        method: 'logistic',
        title: '二元 Logistic 回归系数表',
        classification: 'computed',
        headers: ['自变量', 'β', 'SE', 'OR', 'p'],
        rows: [['高收入高学历交互项', 4.12, 19.8, 185.4, 0.91]],
        facts: ['Logistic result'],
        resultHash: 'h-logit-1',
        code: '',
        dataSignature: 'sig-1',
      },
    ],
  });

  const codes = new Set(flawedFindings.map(f => f.code));
  assert.ok(codes.has('causal_overreach'), 'detects cross-sectional causal overreach');
  assert.ok(codes.has('complete_separation_se'), 'detects complete separation SE/OR');
  assert.ok(codes.has('micro_sample_factor_model'), 'detects micro-sample factor/SEM');
  assert.ok(codes.has('sem_fit_overreach'), 'detects over-threshold SEM spin');
  assert.ok(codes.has('srs_on_convenience_sample'), 'detects SRS formula without Deff');
  assert.ok(codes.has('circular_cluster_classifier'), 'detects circular KMeans->classifier');
  assert.ok(codes.has('orphan_nlp_section'), 'detects orphan NLP section');

  const cleanFindings = auditStatisticalMethodGuardrails({
    sections: [
      {
        title: '三、抽样设计与方法',
        body: '采用多阶段分层配额抽样并乘以设计效应 Deff = 1.4 确定有效样本 n = 520。SEM 模型 RMSEA = 0.042，CFI = 0.953，TLI = 0.941，模型拟合良好。',
      },
      {
        title: '四、讨论与建议',
        body: '横截面调查中统计显著相关尚不能直接确立因果关系，但在多组对照中具有稳健正向关联。词云结果与问卷 Q14 满意度维度均值趋势一致。',
      },
    ],
    results: [],
  });
  assert.equal(cleanFindings.length, 0);
});
