import { ROOMS } from './rooms.ts';

export type Command = { name: string; args?: string; line: string; words: readonly string[] };

const ROOM_COMMANDS: Command[] = ROOMS.map(r => ({ name: r.command, line: `打开${r.name}`, words: [r.id] }));

export const COMMANDS: readonly Command[] = [
  { name: '下一步', line: '按研究动线给出最该做的一件事', words: ['next'] },
  { name: '自主探索', line: '自动核查问卷数据质量、关键结论与统计风险', words: ['autonomous', 'react'] },
  { name: '全报告', args: '课题或留空', line: '根据当前研究资料起草报告候选稿，保留逐节回执供审阅', words: ['fullreport', 'autoreport'] },
  { name: '密钥', line: '打开个人服务设置，安全配置报告服务', words: ['apikey', 'key'] },
  { name: '铸造', args: '任意课题或留空', line: '生成一套教学模拟研究，涵盖问卷、模拟作答以及基于模拟数据实际计算的结果与报告', words: ['forge', 'award', 'benchmark', 'demo'] },
  { name: '硅基推演', args: '人群或课题', line: '在当前流程内唤起样本预测试演播室（分层受访画像、一对一深访、焦点小组与预测试诊断）', words: ['atypica', 'theater', 'silicon'] },
  { name: '备赛', line: '市调大赛备赛八个阶段与下一步', words: ['coach', 'guide'] },
  { name: '绘图', args: '图题或维度', line: '把已登记结果画成图（5 类图型 · 4 套配色 · 可编辑标签）', words: ['plot', 'chart'] },
  { name: '编程', args: '方法或语言', line: 'Python / R / SPSS 分析脚本与 LaTeX 三线表（取自已登记结果）', words: ['code', 'script'] },
  { name: '撰稿', args: '章节或模板', line: '章节写作模板、事实胶囊注入与合规体检', words: ['compose', 'polish'] },
  { name: '照度', line: '各模块的证据完整度', words: ['status'] },
  { name: '印鉴', line: '生成九门循证核验码与四阶证据摘要', words: ['seal', 'certificate'] },
  { name: '盲区', line: '光到不了的角落，以及去哪里补', words: ['gaps', 'blind'] },
  { name: '来处', args: '图表编号', line: '沿光路回溯报告里一个图表的数字从哪里来', words: ['trace', 'origin'] },
  { name: '结果', args: '标题或方法', line: '查看已登记的分析结果、统计方法、有效样本与主要统计量', words: ['results'] },
  { name: '写入', line: '把还没写进报告的登记结果按蓝图写进对应章节，改动前确认', words: ['place'] },
  { name: '写报告', line: '按蓝图逐节看报告写到哪、缺什么，下一步做什么', words: ['plan'] },
  { name: '起草', args: '章节', line: '用你的模型服务按本项目的事实起草一节，数字只从登记结果填入', words: ['write'] },
  { name: '生成', args: '研究需求', line: '用你的模型服务起草问卷，确认后才调用', words: ['generate', 'draft'] },
  { name: '查', args: '概念或方法', line: '在知识镜中查定义、公式与出处', words: ['lookup', 'search'] },
  ...ROOM_COMMANDS,
  { name: '夜', line: '切换到深色主题', words: ['dark'] },
  { name: '昼', line: '切换到浅色主题', words: ['day'] },
  { name: '清空', line: '删除这段对话，项目数据不受影响', words: ['clear'] },
  { name: '经典', line: '打开经典工作台', words: ['classic'] },
  { name: '帮助', line: '全部命令与常用说法', words: ['help', '?'] },
];

/** Commands whose name or English word starts with what follows the slash; all of them for a bare slash. */
export function matchCommands(prefix: string): Command[] {
  const p = prefix.trim().toLowerCase();
  return COMMANDS.filter(c => !p || c.name.startsWith(p) || c.words.some(w => w.startsWith(p)));
}
