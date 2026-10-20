/**
 * 第十七届 schedule as printed in the general notice 中商统〔2026〕33号 (archived at
 * corpus-source/official-rules/edition17-main-notice-20260921.pdf, pages 3–5). Dates are the notice's;
 * the practice-round documents due 2026-11-17 may refine them and must be re-verified then.
 */
export type CalendarGroup = 'undergrad' | 'vocational' | 'graduate' | 'international';
export type CalendarEntry = {
  id: string; label: string; start?: string; end: string; page: number; detail: string;
  /** Groups the entry applies to; group-specific dates are separate entries. */
  groups: readonly CalendarGroup[]; kind: 'window' | 'deadline' | 'event';
};

export const CALENDAR_GROUPS: Record<CalendarGroup, string> = { undergrad: '本科组', vocational: '专科组', graduate: '研究生组', international: '在华留学生组' };
const ALL: readonly CalendarGroup[] = ['undergrad', 'vocational', 'graduate', 'international'];

export const EDITION17_CALENDAR = {
  source: { documentNumber: '中商统〔2026〕33号', path: 'corpus-source/official-rules/edition17-main-notice-20260921.pdf', url: 'https://tjjy.zjgsu.edu.cn/_upload/article/files/1e/80/192f24e5488eb01e7d37c4504776/cf72fd67-01f1-48e1-a214-dc5598bb59fc.pdf', verifiedAt: '2026-09-30' },
  boundary: '日期摘自第十七届总通知；实践赛文件与企业命题（2026-11-17 发布）及各赛区通知可能细化安排，届时须重新核验。',
  entries: [
    { id: 'signup', label: '参赛报名截止', end: '2026-10-31', page: 3, kind: 'deadline', groups: ['undergrad', 'vocational'], detail: '即日起至 10 月 31 日。' },
    { id: 'signup-late', label: '参赛报名截止', end: '2026-11-15', page: 6, kind: 'deadline', groups: ['graduate', 'international'], detail: '研究生组与在华留学生组的学生报名可延至 11 月 15 日。' },
    { id: 'mock-exam', label: '知识赛模拟考试', start: '2026-10-20', end: '2026-11-10', page: 3, kind: 'window', groups: ['undergrad', 'vocational'], detail: '每人限一次。' },
    { id: 'knowledge', label: '知识赛（网考）', start: '2026-11-01', end: '2026-11-20', page: 3, kind: 'window', groups: ['undergrad', 'vocational'], detail: '每位考生可考 1–2 次，取最高成绩；60 分及以上为通过，通过后才能组队参加实践赛。' },
    { id: 'practice-notice', label: '实践赛发文 · 企业命题公布', end: '2026-11-17', page: 3, kind: 'event', groups: ALL, detail: '届时须重新核验实践赛规则、报告要求与评分标准。' },
    { id: 'topic-briefing', label: '企业命题解读', start: '2026-11-18', end: '2026-11-30', page: 3, kind: 'window', groups: ['undergrad', 'vocational', 'graduate'], detail: '在华留学生组不设企业命题赛。' },
    { id: 'campus', label: '校赛完成', end: '2027-03-22', page: 3, kind: 'deadline', groups: ['undergrad', 'vocational', 'graduate'], detail: '各校按统一规则选拔晋级省赛团队。' },
    { id: 'campus-intl', label: '校赛完成', end: '2027-03-30', page: 5, kind: 'deadline', groups: ['international'], detail: '每校最多选拔 3 支团队直接进入全国赛初赛。' },
    { id: 'corporate-submit', label: '企业命题赛报告提交', end: '2027-03-31', page: 4, kind: 'deadline', groups: ['undergrad', 'vocational', 'graduate'], detail: '通知写明“2027 年 3 月底”一次性提交报告和附件，此处按月末标示；以企业命题赛通知为准。' },
    { id: 'corporate', label: '企业命题赛评审完成', end: '2027-04-10', page: 4, kind: 'deadline', groups: ['undergrad', 'vocational', 'graduate'], detail: '由全国组委会与命题企业组织报告评审。' },
    { id: 'provincial-voc', label: '省赛完成', end: '2027-04-12', page: 4, kind: 'deadline', groups: ['vocational'], detail: '由省赛组委会组织。' },
    { id: 'provincial-grad', label: '省赛完成', end: '2027-04-20', page: 4, kind: 'deadline', groups: ['graduate'], detail: '由省赛组委会组织。' },
    { id: 'provincial-ug', label: '省赛完成', end: '2027-04-30', page: 4, kind: 'deadline', groups: ['undergrad'], detail: '由省赛组委会组织。' },
    { id: 'national-pre-voc', label: '全国赛初赛结束（报告 + PPT 评审）', end: '2027-04-20', page: 5, kind: 'deadline', groups: ['vocational', 'international'], detail: '报告与 PPT 评审。' },
    { id: 'national-pre-grad', label: '全国赛初赛结束（报告 + PPT 评审）', end: '2027-04-30', page: 5, kind: 'deadline', groups: ['graduate'], detail: '报告与 PPT 评审。' },
    { id: 'national-pre-ug', label: '全国赛初赛结束（报告 + PPT 评审）', end: '2027-05-14', page: 5, kind: 'deadline', groups: ['undergrad'], detail: '报告与 PPT 评审。' },
    { id: 'final-voc', label: '全国总决赛（现场答辩）', start: '2027-05-08', end: '2027-05-09', page: 5, kind: 'event', groups: ['vocational'], detail: '江苏经贸职业技术学院。' },
    { id: 'final-grad', label: '全国总决赛（现场答辩）', start: '2027-05-15', end: '2027-05-16', page: 5, kind: 'event', groups: ['graduate', 'international'], detail: '上海工程技术大学。' },
    { id: 'final-ug', label: '全国总决赛（现场答辩）', start: '2027-05-29', end: '2027-05-30', page: 5, kind: 'event', groups: ['undergrad'], detail: '上海财经大学。' },
  ] satisfies CalendarEntry[],
} as const;

export type EntryState = 'past' | 'current' | 'upcoming';

/** Entries for one group in date order, each marked against `today` (YYYY-MM-DD, local calendar date). */
export function calendarFor(group: CalendarGroup, today: string): Array<CalendarEntry & { state: EntryState; daysLeft: number }> {
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
  const now = day(today);
  return EDITION17_CALENDAR.entries.filter(e => (e.groups as readonly CalendarGroup[]).includes(group))
    .map(e => {
      const start = day(e.start ?? e.end), end = day(e.end);
      const state: EntryState = now > end ? 'past' : now >= start ? 'current' : 'upcoming';
      return { ...e, state, daysLeft: (state === 'upcoming' ? start : end) - now };
    })
    .sort((a, b) => (a.start ?? a.end).localeCompare(b.start ?? b.end) || a.end.localeCompare(b.end));
}
