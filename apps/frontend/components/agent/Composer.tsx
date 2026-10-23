'use client';

import { useLayoutEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import { matchCommands } from '@/lib/agent/router';
import styles from './AgentShell.module.css';

/**
 * The command line. Plain sentences and slash commands share one input; a bare slash word opens the command list
 * (↑ ↓ to choose, Tab to complete, Enter to run). ↑ on an empty line recalls what was sent before, as in a terminal.
 * Enter never sends while an input method is still composing.
 */
export default function Composer({ onSend, inputRef }: { onSend: (text: string) => void; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [recall, setRecall] = useState(-1);
  const word = /^[/／]\S*$/u.test(value) ? value.slice(1) : null;
  const options = word !== null && dismissed !== value ? matchCommands(word) : [];
  const selected = options.length ? Math.min(active, options.length - 1) : -1;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }, [value, inputRef]);

  const change = (next: string) => { setValue(next); setActive(0); setRecall(-1); };
  const send = (text: string) => {
    if (!text.trim()) return;
    onSend(text);
    setHistory(list => [...list.filter(item => item !== text), text].slice(-50));
    change('');
  };
  const complete = (index: number, run: boolean) => {
    const command = options[index];
    if (!command) return;
    if (run && !command.args) send(`/${command.name}`);
    else change(`/${command.name} `);
  };
  const key = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (options.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((selected + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        return;
      }
      if (event.key === 'Tab') { event.preventDefault(); complete(selected, false); return; }
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); complete(selected, true); return; }
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(value); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(value); return; }
    if (event.key === 'Escape') { event.currentTarget.blur(); return; }
    // History only while the line is empty or already showing a recalled entry, so the caret still moves in a draft.
    const browsing = value === '' || (recall >= 0 && value === history[recall]);
    if (browsing && history.length && (event.key === 'ArrowUp' || (event.key === 'ArrowDown' && recall >= 0))) {
      event.preventDefault();
      const next = event.key === 'ArrowUp' ? (recall < 0 ? history.length - 1 : Math.max(0, recall - 1)) : recall + 1;
      if (next >= history.length) { setValue(''); setRecall(-1); } else { setValue(history[next]); setRecall(next); }
    }
  };

  return <form className={styles.command} onSubmit={event => { event.preventDefault(); send(value); }}>
    {options.length > 0 && <div className={styles.popover} id="agent-commands" role="listbox" aria-label="命令">
      {options.map((command, i) => <div key={command.name} id={`agent-command-${i}`} role="option" aria-selected={i === selected} className={styles.option}
        onPointerDown={event => event.preventDefault()} onPointerEnter={() => setActive(i)} onClick={() => complete(i, true)}>
        <code>/{command.name}{command.args && <small> ‹{command.args}›</small>}</code><span>{command.line}</span>
      </div>)}
    </div>}
    <span className={styles.prompt} aria-hidden="true">›</span>
    <textarea ref={inputRef} id="agent-command-line" rows={1} value={value} spellCheck={false} enterKeyHint="send"
      placeholder="说出要做的事，或输入 / 查看命令" aria-label="对证见说" aria-autocomplete="list"
      aria-controls={options.length ? 'agent-commands' : undefined}
      aria-activedescendant={selected >= 0 ? `agent-command-${selected}` : undefined}
      onChange={event => change(event.target.value)} onKeyDown={key} />
    <button type="submit" className={styles.send} disabled={!value.trim()} aria-label="发送">↵</button>
  </form>;
}
