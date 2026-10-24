/**
 * Illumination: how much of the project the evidence reaches. Each lit room scores its own checks; the report room
 * scores by the deterministic report benchmark. A failed check is a blind spot, with the room that can fix it.
 * Only what the shell can actually see counts, so rooms not yet connected have no light rather than invented light.
 */
import { createEditorContent, type EditorContent } from '../editor-model.ts';
import { questionIsMapped, questionnaireIssues, type Questionnaire } from '../questionnaire.ts';
import { benchmarkReport, type BenchmarkResult } from '../report-benchmark.ts';
import { frameGroup } from '../report-insert.ts';
import type { RoomId } from './rooms.ts';

/** What the shell can see of the project: the shared questionnaire and dataset, and the report once its room has opened. */
export type ProjectView = {
  design: Questionnaire | null;
  /** `hash` identifies the loaded data; `screened`: its rows already passed quality control, so they are effective responses. */
  dataset: { name: string; rows: number; simulated: boolean; hash: string; screened?: boolean } | null;
  report: EditorContent | null;
  /** A registered result on its way to the report. */
  resultPending: boolean;
};
/** One check of one room. `go` is where it can be fixed, which is not always the room it lights. */
export type LightCheck = { id: string; room: RoomId; go: RoomId; label: string; passed: boolean; detail: string };
export type RoomLight = { room: RoomId; score: number; checks: LightCheck[]; summary: string };
export type Illumination = { rooms: RoomLight[]; overall: number; blind: LightCheck[]; benchmark: BenchmarkResult | null };

/** The rooms whose light the shell can measure today, in research order. */
export const LIT_ROOMS = ['design', 'sampling', 'analysis', 'editor'] as const satisfies readonly RoomId[];

const TEMPLATE = createEditorContent().report.map(s => [s.title, s.body] as const);
/** A report still equal to the starting template has no writing of its own, whatever the benchmark makes of its prompts. */
export function reportWritten(content: EditorContent): boolean {
  return content.report.length !== TEMPLATE.length
    || content.report.some((s, i) => s.title !== TEMPLATE[i][0] || s.body !== TEMPLATE[i][1] || (s.blocks?.length ?? 0) > 0);
}

const share = (checks: LightCheck[]) => checks.length ? checks.filter(c => c.passed).length / checks.length : 0;

function designLight(d: Questionnaire | null): RoomLight {
  // A question counts once it has a stem: the studio opens with a blank one, which is a form, not evidence.
  const n = d?.questions.length ?? 0, asked = d?.questions.filter(q => q.text.trim()).length ?? 0;
  const check = (id: string, passed: boolean, label: string, detail: string): LightCheck => ({ id: `design.${id}`, room: 'design', go: 'design', label, passed, detail });
  if (!d || !asked) return { room: 'design', score: 0, summary: '还没有题目', checks: [check('questions', false, '问卷还没有题目', '在问卷室写下第一道题，或从选题诊断带入草稿。')] };
  const blockers = questionnaireIssues(d).filter(i => i.level === 'blocker').length, mapped = d.questions.filter(questionIsMapped).length;
  const framed = !!d.objective.trim() && !!d.population.trim();
  const checks = [
    check('questions', true, `问卷已有 ${asked} 道题${asked < n ? `，另有 ${n - asked} 道未写题干` : ''}`, d.title.trim() ? `《${d.title.trim()}》` : '问卷尚未命名'),
    check('blockers', !blockers, blockers ? `${blockers} 处阻断问题` : '没有阻断问题', blockers ? '题干、编码、选项或跳题有错，回收前必须改正。' : '题干、编码、选项与跳题都能通过检查。'),
    check('mapped', mapped === n, mapped === n ? '每道题都对应研究问题与分析计划' : `${n - mapped} 道题没有对应研究问题或分析计划`, `${mapped} / ${n} 道题已映射。`),
    check('frame', framed, framed ? '写明了决策目标与调查对象' : '决策目标或调查对象还没写', framed ? d.population.trim() : '目标与对象决定了抽样框和结论的外推边界。'),
  ];
  return { room: 'design', score: share(checks), checks, summary: `${asked} 道题${blockers ? ` · ${blockers} 处阻断` : ''}` };
}

function samplingLight(view: ProjectView): RoomLight {
  // A plan becomes evidence once the report carries its frame tables; a draft kept in the sampling room is not yet.
  // Inserting a revised plan registers new frames beside the old ones, so each group counts once, by its latest frame;
  // groups are told apart by their stable ID, never by the name the author can change or reuse. Frames saved before
  // the ID carried a group have only their title to go by, and a later frame of the same title supersedes them.
  const results = view.report?.quality?.results ?? [];
  const placed = new Set((view.report?.report ?? []).flatMap(s => (s.blocks ?? []).map(b => b.evidenceId)));
  const latest = new Map<string, (typeof results)[number]>();
  for (const r of results) if (r.method === 'sampling-frame' && placed.has(r.id)) {
    const group = frameGroup(r.id), key = group ? `group:${group}` : `title:${r.title}`;
    latest.delete(key); latest.set(key, r);
  }
  const revisedTitles = new Set([...latest.entries()].filter(([key]) => key.startsWith('group:')).map(([, r]) => r.title));
  const frames = [...latest.entries()].filter(([key, r]) => key.startsWith('group:') || !revisedTitles.has(r.title)).map(([, r]) => r);
  const check = (id: string, passed: boolean, label: string, detail: string, go: RoomId = 'sampling'): LightCheck => ({ id: `sampling.${id}`, room: 'sampling', go, label, passed, detail });
  if (!frames.length) return { room: 'sampling', score: 0, summary: '方案还没写进报告', checks: [check('frame', false, '抽样方案还没写进报告', '在抽样室定好分阶段方案，一键插入报告的调查方案章节；写进报告的方案才算证据。')] };
  const planned = frames.map(r => r.metrics.find(m => m.label === '计划有效样本')?.value ?? 0);
  const total = planned.reduce((sum, v) => sum + v, 0), stated = planned.every(v => v > 0);
  const nonProbability = frames.filter(r => r.warnings.some(w => /不是概率样本/u.test(w))).length;
  // The plan counts effective responses, so reach is judged on answers that survived quality control: data loaded
  // already screened, or the latest screening registered for exactly the data now loaded. Raw rows, or a screening
  // of other data, leave the check open.
  const data = view.dataset;
  const screening = data ? results.findLast(r => r.method === 'quality-control' && r.sourceHash === data.hash) : undefined;
  const effective = data?.screened ? data.rows : screening ? screening.n : null;
  const reach = effective !== null
    ? check('reach', stated && effective >= total, effective >= total ? `有效 ${effective} 份，达到计划的 ${total} 份` : `有效 ${effective} 份，未达计划的 ${total} 份`,
      effective < total ? '补充回收，或在报告中说明样本不足对估计精度的影响。' : data?.screened ? '有效份数取自已经质量控制的数据。' : '有效份数取自为这份数据登记的质量控制结果。')
    : view.dataset ? check('reach', false, `回收 ${view.dataset.rows} 行，有效份数待质量控制`, '原始行数不等于有效答卷：在分析室筛除无效答卷并登记质量控制结果后再核对计划。', 'analysis')
    : check('reach', false, '还没有回收数据可对照计划', '在分析室载入回收数据并完成质量控制后，按有效份数核对计划样本量。', 'analysis');
  const checks = [
    check('frame', true, `报告写入了 ${frames.length} 个抽样框`, frames.map(r => r.title).join('、')),
    check('size', stated, stated ? `计划有效样本共 ${total} 份` : '有抽样框没写计划有效样本量', '样本量决定估计精度，也是回收率与有效率的分母。'),
    reach,
  ];
  return { room: 'sampling', score: share(checks), checks, summary: `${frames.length} 个抽样框 · 计划 ${total} 份${nonProbability ? ` · ${nonProbability} 个含非概率阶段` : ''}` };
}

function analysisLight(view: ProjectView): RoomLight {
  // Sampling frames are registered as results too, but they are the sampling room's evidence, not an analysis.
  const results = (view.report?.quality?.results ?? []).filter(r => r.method !== 'sampling-frame'), confirmed = (view.report?.quality?.findings ?? []).filter(f => f.status === 'confirmed').length;
  const registered = results.length + (view.resultPending ? 1 : 0);
  const data = view.dataset;
  const checks: LightCheck[] = [
    { id: 'analysis.data', room: 'analysis', go: 'analysis', passed: !!data, label: data ? `已载入「${data.name}」` : '还没有载入数据',
      detail: data ? `${data.rows} 行 · ${data.simulated ? '教学模拟数据' : '用户提供数据'}${data.screened ? ' · 已质量控制' : ''}` : '在分析室导入回收的问卷数据；没有数据时可用硅基样本生成教学模拟数据。' },
    { id: 'analysis.results', room: 'analysis', go: 'analysis', passed: registered > 0, label: registered ? `已登记 ${registered} 项分析结果` : '还没有登记分析结果',
      detail: registered ? '登记的结果带着来源与计算过程进入报告。' : '在分析室完成一项描述、检验或图表，发送到报告即登记。' },
    { id: 'analysis.findings', room: 'analysis', go: 'editor', passed: confirmed > 0, label: confirmed ? `已确认 ${confirmed} 条研究发现` : '还没有确认研究发现',
      detail: confirmed ? '已确认的发现可以写成结论与建议。' : '在报告室的研究发现面板里，把结果整理成发现并逐条确认。' },
  ];
  return { room: 'analysis', score: share(checks), checks, summary: data ? `${data.rows} 行 · ${registered} 项结果` : '还没有数据' };
}

function reportLight(content: EditorContent | null): [RoomLight, BenchmarkResult | null] {
  // The editor's checklist gives the bare template some structure points; light starts with the first words of the report's own.
  if (!content || !reportWritten(content)) return [{ room: 'editor', score: 0, summary: '仍是空白模板', checks: [
    { id: 'report.body', room: 'editor', go: 'editor', passed: false, label: '报告仍是空白模板', detail: '走进报告室按蓝图写第一章；分析结果、抽样方案与公式都能一键插入。模板自带的结构分不算光。' }] }, null];
  const benchmark = benchmarkReport(content);
  const checks = benchmark.checks.filter(c => c.status !== 'na').map((c): LightCheck => ({
    id: `report.${c.id}`, room: 'editor', go: c.fixes.find(f => f.module)?.module ?? 'editor', label: c.label, passed: c.status === 'pass', detail: c.detail,
  }));
  const passed = checks.filter(c => c.passed).length;
  // The benchmark reports its total out of 100; light is a share.
  return [{ room: 'editor', score: benchmark.score / 100, checks, summary: `体检 ${passed} / ${checks.length} 项通过` }, benchmark];
}

/** Light for every measurable room, the overall share, and the blind spots in research order. */
export function illuminate(view: ProjectView): Illumination {
  const [report, benchmark] = reportLight(view.report);
  const rooms = [designLight(view.design), samplingLight(view), analysisLight(view), report];
  return {
    rooms, benchmark,
    overall: rooms.reduce((sum, r) => sum + r.score, 0) / rooms.length,
    // A report check counts as a blind spot only when it fails outright; partial credit is light that is still arriving.
    blind: rooms.flatMap(r => r.checks.filter(c => !c.passed && (r.room !== 'editor' || c.id === 'report.body' || benchmark?.checks.find(b => `report.${b.id}` === c.id)?.status === 'fail'))),
  };
}

export const roomLight = (light: Illumination, room: RoomId) => light.rooms.find(r => r.room === room) ?? null;
