'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { parseSession } from '@evix/shared';
import { errorMessage, hostedRequest } from '@/components/hosted/api-client';
import { useHostedSession } from '@/components/hosted/HostedSession';
import { HostedReceipt } from '@/components/hosted/HostedFrame';
import { useContentReveal, useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

const RESEND_SECONDS = 60;

function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/login')) return null;
  return trimmed;
}

function SearchParamsRedirectSync({ onResolved }: { onResolved: (path: string | null) => void }) {
  const searchParams = useSearchParams();
  const nextParam = sanitizeNextPath(searchParams.get('next'));
  useEffect(() => {
    onResolved(nextParam);
  }, [nextParam, onResolved]);
  return null;
}

const subscribeNoop = () => () => {};

function readLocationNext(): string | null {
  try {
    return sanitizeNextPath(new URLSearchParams(window.location.search).get('next'));
  } catch {
    return null;
  }
}

function readReferrerIsAgent(): boolean {
  try {
    if (!document.referrer) return false;
    const refUrl = new URL(document.referrer);
    return refUrl.origin === window.location.origin && (refUrl.pathname === '/agent' || refUrl.pathname.startsWith('/agent/'));
  } catch {
    return false;
  }
}

export default function LoginClient() {
  const auth = useHostedSession();
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [queryNext, setQueryNext] = useState<string | null>(null);
  const locationNext = useSyncExternalStore(subscribeNoop, readLocationNext, () => null);
  const referrerAgent = useSyncExternalStore(subscribeNoop, readReferrerIsAgent, () => false);
  const sentEmail = useRef('');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const destination = queryNext ?? locationNext ?? (referrerAgent ? '/agent' : '/projects');
  const fromAgent = destination === '/agent' || destination.startsWith('/agent/') || destination.startsWith('/agent?') || destination.startsWith('/agent#');

  const steps = useKeyedListMotion<HTMLDivElement>({
    ids: ['email', 'verify', 'project'],
    activeId: challenge ? 'verify' : 'email',
  });
  const codeLabel = useContentReveal<HTMLSpanElement>({ token: challenge || null });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (challenge && resendCooldown > 0) return;
    setBusy(true);
    setError('');
    try {
      const normalized = email.trim().toLowerCase();
      const result = (await hostedRequest('/api/auth/code', {
        method: 'POST',
        body: { email: normalized, ...(invite.trim() ? { inviteCode: invite.trim() } : {}) },
      })) as { challengeId?: unknown };
      if (typeof result.challengeId !== 'string') throw Error('验证码请求未收到可核对的回执。');
      sentEmail.current = normalized;
      setChallenge(result.challengeId);
      setResendCooldown(RESEND_SECONDS);
      setCode('');
      setNotice('受邀邮箱或凭有效邀请码注册的邮箱将收到验证码，十分钟内有效；60 秒后可重新获取。');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (sentEmail.current !== email.trim().toLowerCase()) throw Error('邮箱已经改变，请重新获取验证码。');
      if (!/^\d{6}$/.test(code)) throw Error('请输入六位验证码。');
      const value = parseSession(
        await hostedRequest('/api/auth/verify', {
          method: 'POST',
          body: { challengeId: challenge, code },
        }),
      );
      auth.accept(value);
      await auth.refresh();
      auth.announce();
      setCode('');
      auth.navigate(destination);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const resendLocked = Boolean(challenge) && resendCooldown > 0;

  return (
    <section className="hosted-login-card">
      <Suspense fallback={null}>
        <SearchParamsRedirectSync onResolved={setQueryNext} />
      </Suspense>
      <div className="hosted-login-intro">
        <span className="hosted-kicker">证见 EVI-X</span>
        <h2>让研究有据可循。</h2>
        <p>登录证见 EVI-X 账号后管理团队项目、保存问卷与报告版本，并接入个人模型服务。</p>
        <div className="hosted-steps" ref={steps}>
          <i className="hosted-step-marker" data-motion-marker aria-hidden="true" hidden />
          <span data-motion-id="email" data-active={!challenge} aria-current={!challenge ? 'step' : undefined}>
            01 邮箱与邀请码
          </span>
          <span data-motion-id="verify" data-active={!!challenge} aria-current={challenge ? 'step' : undefined}>
            02 验证身份
          </span>
          <span data-motion-id="project">{fromAgent ? '03 返回研究主工作台' : '03 进入研究工作区'}</span>
        </div>
        {fromAgent && (
          <p className="hosted-small" style={{ marginTop: 12 }}>
            验证完成后将直接返回 <Link href={destination}>证见 EVI-X 研究主工作台</Link>。
          </p>
        )}
      </div>
      <div>
        <form onSubmit={send} aria-busy={busy}>
          <label>
            邮箱
            <input
              type="email"
              value={email}
              maxLength={254}
              autoComplete="email"
              required
              disabled={busy}
              onChange={e => {
                setEmail(e.target.value);
                setChallenge('');
                setResendCooldown(0);
                setNotice('');
              }}
            />
          </label>
          <label>
            邀请码（首次注册时填写）
            <input
              value={invite}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              placeholder="例如 ABCD-EFGH-JKMN"
              disabled={busy}
              onChange={e => {
                setInvite(e.target.value);
                setChallenge('');
                setResendCooldown(0);
                setNotice('');
              }}
            />
          </label>
          <button
            className="hosted-secondary"
            data-pending={busy || undefined}
            disabled={busy || !email.trim() || resendLocked}
          >
            {busy
              ? '正在处理…'
              : challenge
                ? resendCooldown > 0
                  ? `重新获取验证码（${resendCooldown}s）`
                  : '重新获取验证码'
                : '获取验证码'}
          </button>
        </form>
        {challenge && (
          <form onSubmit={verify} aria-busy={busy}>
            <label>
              <span ref={codeLabel}>六位验证码</span>
              <input
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                disabled={busy}
                onChange={e => setCode(e.target.value)}
              />
            </label>
            <button className="hosted-primary" data-pending={busy || undefined} disabled={busy || code.length !== 6}>
              {fromAgent ? '验证并返回研究工作台' : '验证并进入'}
            </button>
          </form>
        )}
        <HostedReceipt text={notice} />
        <HostedReceipt text={error} tone="alert" />
        <p className="hosted-small">
          内测仅限受邀邮箱或持有邀请码的新成员。已注册的证见 EVI-X 账号直接用邮箱登录；未收到验证码时，请核对邮箱与邀请码，或联系管理员。
        </p>
      </div>
    </section>
  );
}
