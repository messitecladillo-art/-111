import type { Questionnaire } from '../questionnaire.ts';
import { estimateMinutes } from './assess.ts';
import type { SiliconRun } from './run.ts';

/** Every exported row carries this column so simulated data cannot quietly pass as fieldwork. */
export const SILICON_ORIGIN_COLUMN = '__origin';
export const SILICON_ORIGIN_VALUE = 'silicon_simulated';

const cell = (value: string) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Wide CSV: one row per persona × scenario × model; codes for closed items, text for open ones; blank = not shown, refused or invalid. */
export function siliconCsv(design: Questionnaire, run: SiliconRun): string {
  const header = [SILICON_ORIGIN_COLUMN, '__run', 'persona', 'scenario', 'model', ...run.attributes.map(a => `attr_${a.key}`), ...design.questions.map(q => q.variable || q.id)];
  const personaOf = new Map(run.personas.map(p => [p.id, p]));
  const scenarioOf = new Map(run.settings.scenarios.map(s => [s.id, s.label]));
  const rows = run.responses.filter(r => r.status === 'ok').map(r => {
    const persona = personaOf.get(r.personaId);
    const answers = new Map(r.answers.map(a => [a.questionId, a]));
    return [SILICON_ORIGIN_VALUE, run.id, persona?.code ?? r.personaId, scenarioOf.get(r.scenarioId) ?? r.scenarioId, r.model,
      ...run.attributes.map(a => persona?.traits[a.key] ?? ''),
      ...design.questions.map(q => { const a = answers.get(q.id); if (!a || !a.shown || a.refused || a.value === null) return ''; return Array.isArray(a.value) ? a.value.join(';') : String(a.value); })];
  });
  return '﻿' + [header, ...rows].map(row => row.map(v => cell(String(v))).join(',')).join('\r\n') + '\r\n';
}

export function siliconRunJson(run: SiliconRun): string {
  return JSON.stringify({ ...run, notice: '模拟数据（硅基样本）：由离线演示引擎或语言模型扮演虚构受访者生成，不是调查数据，不得作为调研结果、填补或扩充真实样本。' }, null, 2);
}

/** True when a table carries the silicon origin column; its presence alone marks the data as simulated. */
export function isSiliconTable(header: readonly string[]): boolean {
  return header.some(h => h.replace(/^﻿/, '').trim().toLowerCase() === SILICON_ORIGIN_COLUMN);
}

/** A methods-section paragraph describing what was simulated and what it was not used for. */
export function disclosureText(design: Questionnaire, run: SiliconRun): string {
  const ok = run.responses.filter(r => r.status === 'ok').length;
  const models = run.engine === 'demo' ? '离线演示引擎（不调用语言模型）' : run.settings.models.join('、');
  const scenarios = run.settings.scenarios.filter(s => s.id !== 'base').map(s => s.label);
  const time = estimateMinutes(design);
  return [
    `【AI 使用说明 · 预测试】在问卷「${design.title || '未命名问卷'}」定稿前，研究团队使用 ${models} 扮演 ${run.personas.length} 位虚构受访者（硅基样本）作答，共得到 ${ok} 份模拟回答${scenarios.length ? `，覆盖 ${scenarios.join('、')} 等情境` : ''}。`,
    `模拟回答仅用于发现题目表述不清、选项缺失、跳题逻辑与作答时长（估计 ${time.low}–${time.high} 分钟）等问题，并据此修订问卷；所有模拟数据均未进入正式样本，未用于填补或扩充真实数据，也未作为本报告的任何调查结果。`,
    '画像属性与配额由研究团队设定，不代表真实人口结构；语言模型对较低学历、农村及少数民族语言人群的模拟通常更不可靠。',
    '【请据实填写：上述修订是否以及如何经过真实受访者预调查复核】',
  ].join('\n');
}
