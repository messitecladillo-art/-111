import type { Service } from '@evix/shared';
import { designFingerprint, estimateCalls, NO_SCENARIO, type AnswerValue, type SiliconAnswer, type SiliconResponse, type SiliconRunRequest } from '@/lib/silicon/run';
import type { SiliconRunner } from '@/components/silicon/SiliconLab';
import { hostedRequest, HostedApiError } from './api-client';

type Status = 'running' | 'ready' | 'failed' | 'cancelled' | 'outcome_unknown';
type RunView = { id: string; status: Status; done: number; total: number; services: Array<{ serviceId: string; name: string }>; responses?: SiliconResponse[]; errorCode?: string; createdAt: string };

const isText = (v: unknown, max = 600): v is string => typeof v === 'string' && v.length <= max;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function answer(v: unknown): SiliconAnswer {
  if (!record(v) || !isText(v.questionId, 64) || typeof v.shown !== 'boolean' || typeof v.refused !== 'boolean' || !isText(v.unclear, 400)) throw Error();
  const value = v.value;
  const ok = value === null || (typeof value === 'number' && Number.isFinite(value)) || isText(value, 500) || (Array.isArray(value) && value.length <= 30 && value.every(x => isText(x, 16)));
  if (!ok) throw Error();
  return { questionId: v.questionId, value: value as AnswerValue, shown: v.shown, refused: v.refused, unclear: v.unclear };
}

/** Strictly read a run receipt; anything unexpected is treated as an unverifiable reply, never guessed. */
export function parseRunView(v: unknown): RunView {
  try {
    if (!record(v) || !isText(v.id, 36) || !['running', 'ready', 'failed', 'cancelled', 'outcome_unknown'].includes(v.status as string) || v.classification !== 'simulated') throw Error();
    if (!Number.isInteger(v.done) || !Number.isInteger(v.total) || !Array.isArray(v.services) || !isText(v.createdAt, 40)) throw Error();
    const services = v.services.map(s => { if (!record(s) || !isText(s.serviceId, 36) || !isText(s.name, 240)) throw Error(); return { serviceId: s.serviceId, name: s.name }; });
    const responses = v.responses === undefined ? undefined : (Array.isArray(v.responses) ? v.responses : (() => { throw Error(); })()).map((r): SiliconResponse => {
      if (!record(r) || !isText(r.personaId, 80) || !isText(r.scenarioId, 40) || !isText(r.model, 240) || (r.status !== 'ok' && r.status !== 'failed' && r.status !== 'outcome_unknown') || !Array.isArray(r.answers)) throw Error();
      return { personaId: r.personaId, scenarioId: r.scenarioId, model: r.model, status: r.status, answers: r.answers.map(answer), ...(isText(r.error, 64) ? { error: r.error } : {}) };
    });
    return { id: v.id, status: v.status as Status, done: v.done as number, total: v.total as number, services, responses, createdAt: v.createdAt, ...(isText(v.errorCode, 64) ? { errorCode: v.errorCode } : {}) };
  } catch {
    throw new HostedApiError(200, 'invalid_server_receipt', '运行回执待核对，已发出的调用可能已计费。请稍后查询。');
  }
}

const ERRORS: Record<string, string> = {
  authentication_failed: '模型服务拒绝了密钥，请在「我的模型服务」中检查配置。',
  rate_limited: '模型服务限流，部分画像未能作答。',
  interrupted_run: '运行在服务重启时中断，结果状态未知；已作答的部分保留在运行记录中。',
  unreconciled_calls: '部分调用超时或服务端出错，供应商可能已处理并计费；这些画像的结果未知，未自动重发。其余画像的回答可用。',
  cancelled_by_user: '已停止：尚未发出的调用不会再发出。',
};
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => { const t = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });

/** Display names for services; identical label + model pairs get a short id so they can be told apart. */
export function serviceNames(services: Service[]): Map<string, string> {
  const base = (s: Service) => `${s.label} · ${s.model}`;
  const counts = new Map<string, number>();
  for (const s of services) counts.set(base(s), (counts.get(base(s)) ?? 0) + 1);
  return new Map(services.map(s => [s.id, (counts.get(base(s)) ?? 0) > 1 ? `${base(s)} · ${s.id.slice(0, 6)}` : base(s)]));
}

/** Model engine for the 硅基样本 lab in a hosted project: the server holds keys, prompts and limits. */
export function createSiliconRunner({ projectId, services, localTest, mutate, maxCalls }: { projectId: string; services: Service[]; localTest: boolean; mutate: (path: string, body?: unknown, method?: string) => Promise<unknown>; maxCalls?: number }): SiliconRunner {
  const usable = services.filter(s => s.capabilities.includes('research')), names = serviceNames(usable);
  return {
    models: usable.map(s => ({ id: s.id, label: names.get(s.id)!, detail: `${s.provider} · 配置 v${s.revision}` })),
    maxCalls,
    consentLabel: localTest ? '确认使用合成模型验收本次运行，不产生真实模型费用。' : '同意把画像设定与问卷内容发送给所选模型供应商，由模型扮演虚构受访者作答，并使用我的 API 额度。',
    async run(request: SiliconRunRequest, onProgress, signal) {
      const base = `/api/projects/${projectId}/silicon-runs`;
      const chosen = request.settings.models.map(id => usable.find(s => s.id === id)).filter((s): s is Service => !!s);
      if (!chosen.length) throw Error('请选择至少一个启用研究能力的模型服务。');
      let view = parseRunView(await mutate(base, {
        design: request.design, attributes: request.attributes,
        personas: request.personas.map(p => ({ id: p.id, code: p.code, traits: p.traits, background: p.background })),
        scenarios: request.settings.scenarios, memory: request.settings.memory, shuffleOptions: request.settings.shuffleOptions,
        services: chosen.map(s => ({ serviceId: s.id, serviceRevision: s.revision })),
        expectedCalls: estimateCalls(request.design, request.personas.length, { ...request.settings, models: chosen.map(s => s.id) }),
        idempotencyKey: request.idempotencyKey, consent: true,
      }));
      while (view.status === 'running') {
        onProgress({ done: view.done, total: view.total });
        await sleep(1200, signal);
        if (signal.aborted) { view = parseRunView(await mutate(`${base}/${view.id}/cancel`)); break; }
        view = parseRunView(await hostedRequest(`${base}/${view.id}`));
      }
      if (!view.responses) view = parseRunView(await hostedRequest(`${base}/${view.id}`));
      const ok = (view.responses ?? []).filter(r => r.status === 'ok');
      if (!ok.length) throw Error(ERRORS[view.errorCode ?? ''] || `运行没有得到可用的模拟回答（${view.errorCode || view.status}）。`);
      const names = view.services.map(s => s.name);
      return {
        schema: 'silicon-run/v1', classification: 'simulated', id: view.id, createdAt: view.createdAt, engine: 'model',
        questionnaire: { title: request.design.title, fingerprint: designFingerprint(request.design), questions: request.design.questions.length },
        attributes: request.attributes, personas: request.personas, settings: { ...request.settings, scenarios: request.settings.scenarios.length ? request.settings.scenarios : [NO_SCENARIO], models: names }, responses: view.responses ?? [],
        notes: [
          '语言模型生成的虚构受访者回答，仅用于问卷预测试，不得填补或扩充真实样本。',
          ...(view.status !== 'ready' ? [ERRORS[view.errorCode ?? ''] || `运行状态：${view.status}`] : []),
        ],
      };
    },
  };
}

/** The run list also reports the server's limits; anything unexpected is ignored rather than guessed. */
export function parseSiliconLimits(value: unknown): { maxCalls: number } | null {
  const limits = value && typeof value === 'object' ? (value as { limits?: { maxCalls?: unknown } }).limits : undefined;
  return limits && Number.isInteger(limits.maxCalls) && (limits.maxCalls as number) > 0 ? { maxCalls: limits.maxCalls as number } : null;
}
