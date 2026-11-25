'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import BrandMark from '@/components/brand/BrandMark';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { matchCommands } from '@/lib/agent/commands';
import { AGENT_HANDOFF_KEY, buildHandoffPayload, needsAgentShellHandoff, shouldShowGlobalDock } from '@/lib/agent/dock';
import type { AgentAction, AgentTurn, Span } from '@/lib/agent/router';
import { Icon } from './icons';
import styles from './GlobalAgentDock.module.css';

function cleanDockText(raw: string): string {
  return raw
    .replace(/[\u300c\u300e]/gu, '“')
    .replace(/[\u300d\u300f]/gu, '”')
    .replace(/\u3010([^\u3011]+)\u3011/gu, '（$1）')
    .replace(/[{}]/gu, '');
}

function renderSpan(span: Span, key: number) {
  const text = cleanDockText(span.text);
  if (span.mark === 'gold') return <span key={key} className={styles.markGold}>{text}</span>;
  if (span.mark === 'teal' || span.mark === 'cyan') return <span key={key} className={styles.markTeal}>{text}</span>;
  if (span.mark === 'dim') return <span key={key} className={styles.markDim}>{text}</span>;
  if (span.mark === 'error') return <span key={key} className={styles.markError}>{text}</span>;
  if (span.mark === 'strong') return <strong key={key}>{text}</strong>;
  return <span key={key}>{text}</span>;
}

export default function GlobalAgentDock() {
  const pathname = usePathname();
  const router = useRouter();
  const knowledge = useKnowledge();
  const dockRef = useRef<HTMLDivElement>(null);
  const brandBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [value, setValue] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [inlinePrompt, setInlinePrompt] = useState('');
  const [inlineTurn, setInlineTurn] = useState<AgentTurn | null>(null);
  const [openDrawer, setOpenDrawer] = useState(false);

  const commandWord = useMemo(() => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith('/') && !trimmed.startsWith('／')) return null;
    const body = trimmed.slice(1);
    return /\s/u.test(body) ? null : body;
  }, [value]);

  const commands = useMemo(
    () => (commandWord !== null && dismissed !== value ? matchCommands(commandWord).slice(0, 8) : []),
    [commandWord, dismissed, value],
  );
  const selectedIndex = commands.length ? Math.min(activeIndex, commands.length - 1) : -1;

  useEffect(() => {
    if (!openDrawer && !commands.length) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) {
        setOpenDrawer(false);
        if (commands.length) setDismissed(value);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (commands.length) {
        setDismissed(value);
        return;
      }
      if (openDrawer) {
        setOpenDrawer(false);
        brandBtnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDrawer, commands.length, value]);

  const handoff = useCallback(
    (text: string) => {
      try {
        window.sessionStorage.setItem(AGENT_HANDOFF_KEY, buildHandoffPayload(text));
      } catch {
        /* Proceed cleanly to /agent even without storage. */
      }
      setValue('');
      setOpenDrawer(false);
      router.push('/agent');
    },
    [router],
  );

  const runAction = useCallback(
    (act: AgentAction) => {
      if (act.type === 'href') {
        setOpenDrawer(false);
        router.push(act.href);
        return;
      }
      if (act.type === 'search') {
        knowledge.openSearch();
        return;
      }
      if (act.type === 'clear') {
        setInlineTurn(null);
        setInlinePrompt('');
        setOpenDrawer(false);
        return;
      }
      if (act.type === 'say') {
        handoff(act.text);
        return;
      }
      handoff(inlinePrompt || '帮助');
    },
    [handoff, inlinePrompt, knowledge, router],
  );

  const submit = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (/^[/／](?:清空|清屏|clear)$/iu.test(trimmed)) {
        setValue('');
        setInlineTurn(null);
        setInlinePrompt('');
        setOpenDrawer(false);
        return;
      }

      const isSlash = /^[/／]/u.test(trimmed);
      const [{ lookupTurn, route }, { illuminate }] = await Promise.all([
        import('@/lib/agent/router'),
        import('@/lib/agent/illumination'),
      ]);
      const emptyLight = illuminate({ design: null, dataset: null, report: null, resultPending: false });
      const routed = route(trimmed, { room: null, light: emptyLight });

      if ('lookupCounty' in routed || 'recommendResource' in routed) {
        handoff(trimmed);
        return;
      }

      if (isSlash) {
        if (needsAgentShellHandoff(routed)) {
          handoff(trimmed);
          return;
        }
        if ('lookup' in routed) {
          const hits = await knowledge.search(routed.lookup);
          setInlinePrompt(trimmed);
          setInlineTurn(lookupTurn(routed.lookup, hits, routed.explicit));
          setOpenDrawer(true);
          setValue('');
          return;
        }
        if ('turn' in routed) {
          if (routed.turn.act?.type === 'href') {
            setValue('');
            router.push(routed.turn.act.href);
            return;
          }
          if (routed.turn.act?.type === 'search') {
            setValue('');
            knowledge.openSearch();
            return;
          }
          setInlinePrompt(trimmed);
          setInlineTurn(routed.turn);
          setOpenDrawer(true);
          setValue('');
          return;
        }
      }

      if ('lookup' in routed && routed.explicit) {
        const hits = await knowledge.search(routed.lookup);
        setInlinePrompt(trimmed);
        setInlineTurn(lookupTurn(routed.lookup, hits, true));
        setOpenDrawer(true);
        setValue('');
        return;
      }

      handoff(trimmed);
    },
    [handoff, knowledge, router],
  );

  if (!shouldShowGlobalDock(pathname)) return null;

  return (
    <div ref={dockRef} className={styles.dockContainer} role="complementary" aria-label="证见快捷研究助手">
      {openDrawer && inlineTurn && (
        <section className={styles.replyCard} aria-label="研究助手回复">
          <header className={styles.replyHead}>
            <BrandMark size={15} />
            <strong>证见 · 研究助手</strong>
            <span className={styles.replyHeadSpacer} />
            <button type="button" className={styles.headLink} onClick={() => handoff(inlinePrompt || '下一步做什么')}>
              进入研究主工作台 ↗
            </button>
            <button type="button" className={styles.closeBtn} aria-label="收起悬浮回复" onClick={() => setOpenDrawer(false)}>
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.replyBody} role="status" aria-live="polite">
            {inlinePrompt && <div className={styles.userEcho}>{cleanDockText(inlinePrompt)}</div>}
            <div className={styles.turnLines}>
              {inlineTurn.lines.map((line, i) => (
                <p key={i}>{line.map((span, j) => renderSpan(span, j))}</p>
              ))}
            </div>
            {inlineTurn.cards?.map((card, idx) => (
              <div key={idx} className={styles.inlineCard}>
                {'title' in card && card.title && <div className={styles.inlineCardTitle}>{cleanDockText(card.title)}</div>}
                {card.kind === 'entry' && (
                  <>
                    <div className={styles.inlineCardTitle}>{cleanDockText(card.name)}{card.english ? ` · ${card.english}` : ''}</div>
                    <div>{cleanDockText(card.definition)}</div>
                  </>
                )}
                {'lines' in card &&
                  card.lines.slice(0, 6).map((line, li) => (
                    <div key={li}>{line.map((span, sj) => renderSpan(span, sj))}</div>
                  ))}
              </div>
            ))}
            {!!inlineTurn.chips?.length && (
              <div className={styles.chipRow}>
                {inlineTurn.chips.slice(0, 4).map((chip, idx) => (
                  <button key={idx} type="button" className={styles.chipButton} onClick={() => runAction(chip.action)}>
                    {cleanDockText(chip.label)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {!!commands.length && (
        <div id="global-dock-commands" className={styles.commandPalette} role="listbox" aria-label="快捷命令">
          {commands.map((cmd, idx) => (
            <button
              key={cmd.name}
              id={`global-dock-cmd-${idx}`}
              type="button"
              role="option"
              aria-selected={idx === selectedIndex}
              data-selected={idx === selectedIndex}
              className={styles.commandOption}
              onClick={() => {
                const next = `/${cmd.name}${cmd.args ? ' ' : ''}`;
                setValue(next);
                setDismissed(null);
                inputRef.current?.focus();
              }}
            >
              <code>/{cmd.name}</code>
              <span>{cleanDockText(cmd.line)}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className={styles.capsule}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(value);
        }}
      >
        <button
          ref={brandBtnRef}
          type="button"
          className={styles.brandToggle}
          title={inlineTurn ? '展开或收起上次回复' : '打开证见研究主工作台'}
          aria-label="证见研究助手"
          aria-expanded={inlineTurn ? openDrawer : undefined}
          onClick={() => (inlineTurn ? setOpenDrawer((open) => !open) : router.push('/agent'))}
        >
          <BrandMark size={16} />
        </button>

        <textarea
          ref={inputRef}
          rows={1}
          className={styles.dockInput}
          value={value}
          aria-label="快捷研究指令输入框"
          aria-autocomplete="list"
          aria-controls={commands.length ? 'global-dock-commands' : undefined}
          aria-activedescendant={selectedIndex >= 0 ? `global-dock-cmd-${selectedIndex}` : undefined}
          placeholder="随时输入研究问题、调出报告或问卷，键入 / 查看快捷指令…"
          onChange={(event) => {
            setValue(event.target.value);
            setDismissed(null);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (commands.length) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((i) => (i + 1) % commands.length);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((i) => (i - 1 + commands.length) % commands.length);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDismissed(value);
                return;
              }
              if (event.key === 'Tab') {
                const picked = commands[selectedIndex >= 0 ? selectedIndex : 0];
                if (picked) {
                  event.preventDefault();
                  setValue(`/${picked.name}${picked.args ? ' ' : ''}`);
                  return;
                }
              }
            } else if (event.key === 'Escape' && openDrawer) {
              event.preventDefault();
              setOpenDrawer(false);
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit(value);
            }
          }}
        />

        <Link href="/agent" className={styles.agentLink}>
          研究工作台
        </Link>

        <button type="submit" className={styles.sendBtn} disabled={!value.trim()} aria-label="发送研究指令">
          <Icon name="up" />
        </button>
      </form>
    </div>
  );
}
