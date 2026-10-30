/**
 * Importance–performance analysis for "满意度与服务评价" sections. Each attribute's mean performance against its
 * importance, split at the means of both (or at fixed lines the caller gives, such as a scale midpoint) into four
 * quadrants: 继续保持 (important, performing), 重点改进 (important, lagging), 低优先 (neither), 过度投入 (performing
 * beyond its importance). Importance is either stated (rated by respondents) or derived: the standardized β of each
 * attribute's performance when overall satisfaction is regressed on all of them (implicit IPA). Pure computation on
 * complete cases; the caller chooses the attributes and the rows.
 */
import { linearRegression, type RegressionRefusal } from './regression.ts';

export type Quadrant = '继续保持' | '重点改进' | '低优先' | '过度投入';
export type IpaPoint = { name: string; importance: number; performance: number; quadrant: Quadrant };
export type Ipa = {
  mode: 'stated' | 'derived'; n: number;
  points: IpaPoint[];
  /** Where the quadrants split. */
  lines: { importance: number; performance: number };
  /** For derived importance, how much of overall satisfaction the attributes account for. */
  r2: number | null;
};
export type IpaRefusal = { refused: 'too-few-attributes' | 'uneven-columns' | 'no-cases' | 'no-importance' } | RegressionRefusal;

const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;

export function quadrant(importance: number, performance: number, lines: { importance: number; performance: number }): Quadrant {
  const important = importance >= lines.importance, performing = performance >= lines.performance;
  return important ? (performing ? '继续保持' : '重点改进') : (performing ? '过度投入' : '低优先');
}

/**
 * IPA from per-respondent ratings. With `importance` on every attribute, stated importance is the mean rating; without
 * it and with `overall`, importance is derived as the standardized β. `lines` fixes the split; otherwise the means of
 * the points are used.
 */
export function ipa(
  attributes: readonly { name: string; performance: readonly number[]; importance?: readonly number[] }[],
  options: { overall?: readonly number[]; lines?: { importance: number; performance: number } } = {},
): Ipa | IpaRefusal {
  if (attributes.length < 2) return { refused: 'too-few-attributes' };
  const n = attributes[0].performance.length;
  if (!n) return { refused: 'no-cases' };
  if (attributes.some(a => a.performance.length !== n || (a.importance && a.importance.length !== n)) || (options.overall && options.overall.length !== n)) return { refused: 'uneven-columns' };
  const stated = attributes.every(a => a.importance);
  let importance: number[], r2: number | null = null;
  if (stated) importance = attributes.map(a => mean(a.importance!));
  else if (options.overall) {
    const fit = linearRegression(options.overall, attributes.map(a => ({ name: a.name, values: a.performance })));
    if ('refused' in fit) return fit;
    importance = fit.coefficients.slice(1).map(c => c.standardized!);
    r2 = fit.r2;
  } else return { refused: 'no-importance' };
  const performance = attributes.map(a => mean(a.performance));
  const lines = options.lines ?? { importance: mean(importance), performance: mean(performance) };
  return {
    mode: stated ? 'stated' : 'derived', n, lines, r2,
    points: attributes.map((a, i) => ({ name: a.name, importance: importance[i], performance: performance[i], quadrant: quadrant(importance[i], performance[i], lines) })),
  };
}
