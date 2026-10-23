import { FEATURE_NAMES } from './types.ts';
import type { TopicTraining, TopicCatalog, TopicEvents, TopicSources, TopicRankerModel } from './types.ts';
import { extractTopicFeatures } from './core.ts';
import { validateTopicReferences, stableStringify, TopicInputError } from './parse.ts';

export const TRAINING_CONFIG = { epochs: 2400, learningRate: .12, l2: .015 } as const;
export type TrainingHashes = Pick<TopicRankerModel['training'], 'trainSha256' | 'catalogSha256' | 'eventsSha256' | 'sourcesSha256'>;
/** Deterministic batch gradient descent; projected nonnegative weights preserve feature monotonicity. */
export function trainTopicRanker(training: TopicTraining, catalog: TopicCatalog, events: TopicEvents, sources: TopicSources, hashes: TrainingHashes): TopicRankerModel {
  if (training.split !== 'train' || training.dataClass !== 'authored_synthetic' || !training.pairs.length) throw new TopicInputError('排序器只接受明确标注的合成训练集。');
  validateTopicReferences(catalog, sources, events, training);
  const patterns = new Map(catalog.patterns.map(p => [p.id, p])), seen = new Set<string>();
  const rows = [...training.pairs].sort((a, b) => a.id.localeCompare(b.id)).map(pair => {
    const identity = stableStringify({ context: { ...pair.context, school: '' }, a: pair.preferredPatternId, b: pair.rejectedPatternId });
    if (seen.has(identity)) throw new TopicInputError(`重复训练场景：${pair.id}`);
    seen.add(identity);
    const positive = extractTopicFeatures(patterns.get(pair.preferredPatternId)!, pair.context, events, sources);
    const negative = extractTopicFeatures(patterns.get(pair.rejectedPatternId)!, pair.context, events, sources);
    return FEATURE_NAMES.map(name => positive[name] - negative[name]);
  });
  const weights = FEATURE_NAMES.map(() => 0);
  const { epochs, learningRate, l2 } = TRAINING_CONFIG;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradient = weights.map(w => l2 * w);
    for (const row of rows) {
      const margin = row.reduce((sum, value, i) => sum + value * weights[i], 0);
      const error = -1 / (1 + Math.exp(Math.max(-60, Math.min(60, margin))));
      for (let i = 0; i < weights.length; i++) gradient[i] += error * row[i] / rows.length;
    }
    for (let i = 0; i < weights.length; i++) weights[i] = Math.max(0, weights[i] - learningRate * gradient[i]);
  }
  const rounded = weights.map(w => Number(w.toFixed(12)));
  const margins = rows.map(row => row.reduce((s, x, i) => s + x * rounded[i], 0));
  const loss = margins.reduce((sum, margin) => sum + Math.max(0, -margin) + Math.log1p(Math.exp(-Math.abs(margin))), 0) / margins.length;
  const pairAccuracy = margins.filter(m => m > 1e-12).length / margins.length;
  return {
    schemaVersion: 1, modelVersion: `topic-pairwise-v1-${[hashes.trainSha256, hashes.catalogSha256, hashes.eventsSha256, hashes.sourcesSha256].map(h => h.slice(0, 8)).join('-')}`, algorithm: 'projected_pairwise_logistic_v1', featureNames: [...FEATURE_NAMES], weights: rounded,
    training: { dataClass: 'authored_synthetic', pairCount: rows.length, ...hashes, ...TRAINING_CONFIG, loss: Number(loss.toFixed(12)), pairAccuracy: Number(pairAccuracy.toFixed(12)) },
    limitations: [
      '训练标签由作者基于来源与研究设计原则编写，属于合成偏好，不是真实比赛评分、获奖结果或受访者数据。',
      '该模型仅为透明线性排序器，未微调任何大语言模型；训练集一致率不能代表外部泛化或真实选题质量。',
      '只有 train.json 参与训练；独立留出测试应在训练完成后单独运行，不能据其结果反复调参后仍称为盲测。',
      '学校名称、学校层次和身份不进入特征；缺失渠道不会由地点或学校推断。',
      '渠道不可得、必要资源缺失、地域冲突和明确时间预算不足，由模型外的硬检查阻止推荐。',
      '时效只是事件线索与所选日期的匹配，不证明问题强度、市场规模或调查可行性。',
    ],
  };
}
