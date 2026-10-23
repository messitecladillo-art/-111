/** Scoped notice intelligence, deliberately separate from complete rule/Gate snapshots. */
export const COMPETITION_UPDATE = {
  id: 'edition17-main-notice-20260930',
  edition: '第十七届',
  title: '第十七届总通知已核验，实践赛细则待补齐',
  documentNumber: '中商统〔2026〕33号',
  signedDate: '2026-09-20',
  websitePublishedDate: '2026-09-21',
  verifiedAt: '2026-10-11',
  lastAttempt: {
    date: '2026-10-11',
    result: '主办方与两份高校转载 PDF 字节一致；官网通知列表已核查至 10 月 9 日赛区设置通知。',
    evidencePath: 'corpus-source/official-rules/edition17-format-review-20261011.json',
  },
  status: 'general_notice_only',
  fullRuleSnapshotAvailable: false,
  source: 'https://tjjy.zjgsu.edu.cn/_upload/article/files/1e/80/192f24e5488eb01e7d37c4504776/cf72fd67-01f1-48e1-a214-dc5598bb59fc.pdf',
  sourceLabel: '查看组委会总通知（高校 HTTPS 转载）',
  primarySource: 'http://www.china-cssc.org/show-304-2179-1.html',
  primaryTransport: 'HTTP；另以高校 HTTPS 转载正文交叉核对',
  evidencePath: 'corpus-source/official-rules/edition17-source-review-20260930.json',
  highlights: [
    '每队 3–5 名学生，成员来自同一高校；每名学生只能参加 1 队，指导教师最多指导 5 队。',
    '专科组、本科组通过知识赛网考后，才能组队参加实践赛。',
    '总通知安排于 2026 年 11 月 17 日发布实践赛文件和企业命题；届时须重新核验。',
  ],
  boundary: '本次核验只确认总通知。不能把第十六届的 65 页、匿名处理后果、AI 使用细则直接作为第十七届硬规则；提交要求仍需实践赛、组别及赛区通知确认。',
} as const;
