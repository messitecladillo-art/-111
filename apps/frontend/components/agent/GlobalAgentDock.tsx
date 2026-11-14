'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import BrandMark from '@/components/brand/BrandMark';
import { useKnowledge } from '@/components/knowledge/KnowledgeProvider';
import { AGENT_HANDOFF_KEY, buildHandoffPayload, needsAgentShellHandoff, shouldShowGlobalDock } from '@/lib/agent/dock';
import { illuminate } from '@/lib/agent/illumination';
import { lookupTurn, matchCommands, route, type AgentAction, type AgentTurn, type Span } from '@/lib/agent/router';
import { Icon } from './icons';
import styles from './GlobalAgentDock.module.css';

const EMPTY_LIGHT = illuminate({ design: null, dataset: null, report: null, resultPending: false });

function renderSpan(span: Span, key: number) {
  if (span.mark === 'gold') return <span key={key} className={styles.markGold}>{span.text}</span>;
  if (span.mark === 'teal' || span.mark === 'cyan') return <span key={key} className={styles.markTeal}>{span.text}</span>;
  if (span.mark === 'dim') return <span key={key} className={styles.markDim}>{span.text}</span>;
  if (span.mark === 'error') return <span key={key} className={styles.markError}>{span.text}</span>;
  if (span.mark === 'strong') return <strong key={key}>{span.text}</strong>;
  return <span key={key}>{span.text}</span>;
}

export default function GlobalAgentDock() {
  const pathname = usePathname();
  const router = useRouter();
  const knowledge = useKnowledge();
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
      const routed = route(trimmed, { room: null, light: EMPTY_LIGHT });

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
    <div className={styles.dockContainer} role="complementary" aria-label="证见全局 Agent 悬浮窗">
      {openDrawer && inlineTurn && (
        <section className={styles.replyCard} aria-label="全局 Agent 回复">
          <header className={styles.replyHead}>
            <BrandMark size={15} />
            <strong>证见 · 全局大脑</strong>
            <span className={styles.replyHeadSpacer} />
            <button type="button" className={styles.headLink} onClick={() => handoff(inlinePrompt || '下一步做什么')}>
              进入 Agent 主工作台 ↗
            </button>
            <button type="button" className={styles.closeBtn} aria-label="收起悬浮回复" onClick={() => setOpenDrawer(false)}>
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.replyBody}>
            {inlinePrompt && <div className={styles.userEcho}>{inlinePrompt}</div>}
            <div className={styles.turnLines}>
              {inlineTurn.lines.map((line, i) => (
                <p key={i}>{line.map((span, j) => renderSpan(span, j))}</p>
              ))}
            </div>
            {inlineTurn.cards?.map((card, idx) => (
              <div key={idx} className={styles.inlineCard}>
                {'title' in card && card.title && <div className={styles.inlineCardTitle}>{card.title}</div>}
                {card.kind === 'entry' && (
                  <>
                    <div className={styles.inlineCardTitle}>{card.name}{card.english ? ` · ${card.english}` : ''}</div>
                    <div>{card.definition}</div>
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
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {!!commands.length && (
        <div className={styles.commandPalette} role="listbox" aria-label="快捷命令">
          {commands.map((cmd, idx) => (
            <button
              key={cmd.name}
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
              <span>{cmd.line}</span>
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
          type="button"
          className={styles.brandToggle}
          title={inlineTurn ? '展开/收起上次回复' : '打开证见 Agent 主大脑'}
          aria-label="证见全局 Agent"
          onClick={() => (inlineTurn ? setOpenDrawer((open) => !open) : router.push('/agent'))}
        >
          <BrandMark size={16} />
        </button>

        <textarea
          ref={inputRef}
          rows={1}
          className={styles.dockInput}
          value={value}
          aria-label="全局 Agent 输入框"
          placeholder="随时对证见大脑下达研究指令、调出报告/问卷，按 / 唤出快捷命令…"
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
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit(value);
            }
          }}
        />

        <Link href="/agent" className={styles.agentLink}>
          Agent 大脑
        </Link>

        <button type="submit" className={styles.sendBtn} disabled={!value.trim()} aria-label="发送到 Agent">
          <Icon name="up" />
        </button>
      </form>
    </div>
  );
}
