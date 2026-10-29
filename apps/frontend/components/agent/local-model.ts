'use client';

import { PROVIDER_BASES, type ServiceProvider } from '@evix/shared';

export type LocalModelConfig = {
  provider: Exclude<ServiceProvider, 'compatible'>;
  baseUrl: string;
  model: string;
  apiKey: string;
  label: string;
  maxOutputTokens: number;
};

const KEY = 'evix.agent.local-model.v1';
const listeners = new Set<() => void>();
export const LOCAL_PROVIDERS: Record<LocalModelConfig['provider'], { label: string; model: string }> = {
  deepseek: { label: 'DeepSeek', model: 'deepseek-chat' },
  openai: { label: 'OpenAI', model: 'gpt-4o-mini' },
  qwen: { label: '通义千问', model: 'qwen-plus' },
};

function valid(value: unknown): value is LocalModelConfig {
  const item = value as Partial<LocalModelConfig> | null;
  return !!item && typeof item === 'object'
    && typeof item.provider === 'string' && item.provider in PROVIDER_BASES
    && typeof item.baseUrl === 'string' && item.baseUrl === PROVIDER_BASES[item.provider as keyof typeof PROVIDER_BASES]
    && typeof item.model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u.test(item.model)
    && typeof item.apiKey === 'string' && item.apiKey.length >= 8 && item.apiKey.length <= 512 && !/\s/u.test(item.apiKey)
    && typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 80
    && item.maxOutputTokens === 2048;
}
function read(): LocalModelConfig | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown;
    return valid(value) ? value : null;
  } catch { return null; }
}
let config: LocalModelConfig | null | undefined;
const notify = () => { for (const listener of listeners) listener(); };

export const localModel = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  view(): LocalModelConfig | null {
    if (config === undefined) config = typeof window === 'undefined' ? null : read();
    return config;
  },
  serverSnapshot: (): LocalModelConfig | null => null,
  save(input: LocalModelConfig): LocalModelConfig {
    if (!valid(input)) throw new Error('本地模型配置无效。');
    config = input;
    try { window.localStorage.setItem(KEY, JSON.stringify(input)); } catch { /* the key lasts for this page */ }
    notify();
    return input;
  },
  clear() {
    config = null;
    try { window.localStorage.removeItem(KEY); } catch { /* nothing to remove */ }
    notify();
  },
};
