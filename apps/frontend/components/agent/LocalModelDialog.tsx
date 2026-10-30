'use client';

import { useEffect, useState } from 'react';
import { PROVIDER_BASES } from '@evix/shared';
import { LOCAL_PROVIDERS, localModel, type LocalModelConfig } from './local-model';
import styles from './AgentShell.module.css';

const DEFAULTS = { provider: 'deepseek' as const, model: 'deepseek-chat', maxOutputTokens: 2048 };

export default function LocalModelDialog({ onClose, onSaved, onCleared }: { onClose: () => void; onSaved: () => void; onCleared: () => void }) {
  const existing = localModel.view();
  const [provider, setProvider] = useState<LocalModelConfig['provider']>(existing?.provider ?? DEFAULTS.provider);
  const [model, setModel] = useState(existing?.model ?? DEFAULTS.model);
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '');
  const [error, setError] = useState('');
  const baseUrl = PROVIDER_BASES[provider];
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  const chooseProvider = (next: LocalModelConfig['provider']) => {
    setProvider(next);
    setModel(LOCAL_PROVIDERS[next].model);
    setError('');
  };
  const save = () => {
    try {
      localModel.save({
        provider, baseUrl, model: model.trim(), apiKey: apiKey.trim(),
        label: `${LOCAL_PROVIDERS[provider].label} · ${model.trim()}`.slice(0, 80), maxOutputTokens: DEFAULTS.maxOutputTokens,
      });
      onSaved();
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '本地模型配置无效。'); }
  };
  return <div className={styles.localOverlay} role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.localDialog} role="dialog" aria-modal="true" aria-labelledby="local-model-title">
      <header><div><h2 id="local-model-title">本地模型</h2><p>不登录也能对话；API Key 只保存在此浏览器。</p></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭本地模型设置">×</button></header>
      <label><span>服务商</span><select value={provider} onChange={event => chooseProvider(event.target.value as LocalModelConfig['provider'])}>
        {Object.entries(LOCAL_PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
      </select></label>
      <label><span>模型</span><input value={model} spellCheck={false} maxLength={160} onChange={event => setModel(event.target.value)} /></label>
      <label><span>API Key</span><input type="password" value={apiKey} autoFocus autoComplete="off" spellCheck={false} maxLength={512} placeholder="粘贴服务商 API Key"
        onChange={event => setApiKey(event.target.value)} onFocus={event => event.currentTarget.select()} /></label>
      <p className={styles.localNote}>请求经由本地 <code>/api/local-agent</code> 转发给 {LOCAL_PROVIDERS[provider].label}，不会写入对话记录。共用电脑请用完清除；Key 以明文保存在本浏览器。</p>
      <p className={styles.localBase}>{baseUrl}</p>
      {error && <p className={styles.localError} role="alert">{error}</p>}
      <footer>
        {existing && <button type="button" className={styles.localClear} onClick={() => { localModel.clear(); onCleared(); onClose(); }}>清除</button>}
        <span className={styles.spacer} />
        <button type="button" className={styles.localCancel} onClick={onClose}>取消</button>
        <button type="button" className={styles.localSave} disabled={!apiKey.trim() || !model.trim()} onClick={save}>保存并使用</button>
      </footer>
    </section>
  </div>;
}
