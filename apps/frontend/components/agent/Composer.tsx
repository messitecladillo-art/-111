'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { matchCommands } from '@/lib/agent/router';
import type { RoomId } from '@/lib/agent/rooms';
import { Icon } from './icons';
import styles from './AgentShell.module.css';

type Choice = { id: string; label: string; detail?: string };
type Props = {
  onSend: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  account: 'loading' | 'guest' | 'ready';
  /** Opening a menu that needs the account's projects or services asks for them once. */
  onNeedLists: () => void;
  projects: Choice[]; projectId: string | null; onProject: (id: string | null) => void;
  services: Choice[]; serviceId: string; onService: (id: string) => void;
  /** 指令模式 answers here; 用模型对话 sends sentences to `chatLabel`, a service that can talk. */
  mode: 'command' | 'model'; onMode: (mode: 'command' | 'model') => void; chatLabel: string;
  onOpen: (room: RoomId) => void;
};
type MenuName = 'project' | 'model' | 'attach' | null;

/**
 * The composer. Sentences and slash commands share one input; a bare slash word opens the command list (↑ ↓ to choose,
 * Tab to complete, Enter to run), ↑ on an empty line recalls what was sent, and Enter never sends while an input
 * method is composing. Above it, the project the conversation is filed under and where its work is kept; below it,
 * what may be attached, how the agent acts, and which model service drafts for it.
 */
export default function Composer({ onSend, inputRef, account, onNeedLists, projects, projectId, onProject, services, serviceId, onService, mode, onMode, chatLabel, onOpen }: Props) {
  const [value, setValue] = useState('');
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [recall, setRecall] = useState(-1);
  const [menu, setMenu] = useState<MenuName>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const word = /^[/／]\S*$/u.test(value) ? value.slice(1) : null;
  const options = word !== null && dismissed !== value ? matchCommands(word) : [];
  const selected = options.length ? Math.min(active, options.length - 1) : -1;
  const project = projects.find(p => p.id === projectId) ?? null;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  }, [value, inputRef]);
  // Focus stays in the input while ↑ ↓ move through the commands, so the highlighted one is kept in sight here.
  useEffect(() => { if (selected >= 0) document.getElementById(`agent-command-${selected}`)?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  // A menu closes on a click elsewhere or on Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setMenu(null); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', escape); };
  }, [menu]);
  const toggle = (name: MenuName) => { if (name !== 'attach') onNeedLists(); setMenu(menu === name ? null : name); };

  const change = (next: string) => { setValue(next); setActive(0); setRecall(-1); };
  const send = (text: string) => {
    if (!text.trim()) return;
    onSend(text);
    setHistory(list => [...list.filter(item => item !== text), text].slice(-50));
    change('');
  };
  // Enter runs a command typed in full, even one that can take an argument (/来处 alone lists the exhibits);
  // a partial name, or Tab, completes it and leaves room for the argument.
  const complete = (index: number, run: boolean) => {
    const command = options[index];
    if (!command) return;
    if (run && (!command.args || word === command.name)) send(`/${command.name}`);
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
  // A choice is a radio item and an action a plain one. Section labels are read through their group, notes through
  // the menu's description, so a menu holds nothing but items and groups.
  const item = (key: string, label: ReactNode, onClick: () => void, extra: { checked?: boolean; note?: string } = {}) =>
    <button key={key} type="button" role={extra.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={extra.checked} className={styles.menuItem}
      onClick={() => { onClick(); setMenu(null); }}>{label}{extra.note && <small>{extra.note}</small>}</button>;

  return <div ref={wrap} className={styles.composerWrap}>
    <div className={styles.contextRow}>
      <button type="button" className={styles.contextChip} aria-haspopup="menu" aria-expanded={menu === 'project'} onClick={() => toggle('project')}>
        <Icon name="folder" />{project ? project.label : '选择项目'}
      </button>
      <span className={styles.contextChip} data-static="true" title={project ? '这段对话归入云端项目，模型提案存在项目里' : '对话和模块里的草稿都留在这台电脑的浏览器里'}>
        <Icon name={project ? 'cloud' : 'monitor'} />{project ? '云端项目' : '本地草稿'}
      </span>
    </div>
    {menu === 'project' && <div className={styles.menu} data-place="above" role="menu" aria-label="选择项目" aria-describedby={account !== 'ready' ? 'agent-project-note' : undefined} style={{ left: 10 }}>
      {account !== 'ready' ? <>
        <p id="agent-project-note" className={styles.menuNote} aria-hidden="true">登录后，可以把对话归入你的项目；模型提案也会存进项目。</p>
        <Link role="menuitem" className={styles.menuItem} href="/login">邮箱登录 ↗</Link>
      </> : <>
        <div role="group" aria-label="归入项目">
          <p className={styles.menuLabel} aria-hidden="true">归入项目</p>
          {item('none', '不归入项目', () => onProject(null), { checked: !projectId, note: '本地草稿' })}
          {projects.map(p => item(p.id, p.label, () => onProject(p.id), { checked: p.id === projectId }))}
          {!projects.length && <p className={styles.menuNote}>还没有项目。</p>}
        </div>
        <Link role="menuitem" className={styles.menuItem} href="/projects">新建或管理项目 ↗</Link>
      </>}
    </div>}
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); send(value); }}>
      {options.length > 0 && <div className={styles.menu} data-place="above" id="agent-commands" role="listbox" aria-label="命令" style={{ left: 8, right: 8, maxWidth: 'none' }}>
        {options.map((command, i) => <div key={command.name} id={`agent-command-${i}`} role="option" aria-selected={i === selected} className={styles.option}
          onPointerDown={event => event.preventDefault()} onPointerEnter={() => setActive(i)} onClick={() => complete(i, true)}>
          <code>/{command.name}{command.args && <small> ‹{command.args}›</small>}</code><span>{command.line}</span>
        </div>)}
      </div>}
      <textarea ref={inputRef} id="agent-command-line" rows={1} value={value} spellCheck={false} enterKeyHint="send"
        placeholder="随心输入，或输入 / 调出命令" aria-label="对证见说" aria-autocomplete="list"
        aria-controls={options.length ? 'agent-commands' : undefined} aria-activedescendant={selected >= 0 ? `agent-command-${selected}` : undefined}
        onChange={event => change(event.target.value)} onKeyDown={key} />
      <div className={styles.toolbar}>
        <span style={{ position: 'relative' }}>
          <button type="button" className={styles.toolButton} aria-label="添加文件或数据" title="添加文件或数据" aria-haspopup="menu" aria-expanded={menu === 'attach'} onClick={() => toggle('attach')}><Icon name="plus" /></button>
          {menu === 'attach' && <div className={styles.menu} data-place="above" role="menu" aria-label="添加：在右侧打开对应模块" style={{ left: 0 }}>
            <p className={styles.menuLabel} aria-hidden="true">在右侧打开对应模块添加</p>
            {item('analysis', '导入调查数据', () => onOpen('analysis'), { note: '数据分析' })}
            {item('design', '导入或编辑问卷', () => onOpen('design'), { note: '问卷设计' })}
            {item('preflight', '检查要提交的文件', () => onOpen('preflight'), { note: '提交前体检' })}
          </div>}
        </span>
        <span className={styles.modeChip} title="读取与计算直接进行；调用模型、写入报告或改动项目之前，都会先请你确认。"><Icon name="info" />改动前确认</span>
        <span className={styles.spacer} />
        <span className={styles.chipSlot}>
          <button type="button" className={styles.modelChip} aria-haspopup="menu" aria-expanded={menu === 'model'} onClick={() => toggle('model')}>
            <Icon name="bolt" /><span className={styles.chipText}>{mode === 'model' ? (chatLabel ? `${chatLabel} · 对话` : '用模型对话') : '指令模式'}</span><Icon name="down" />
          </button>
          {menu === 'model' && <div className={styles.menu} data-place="above" role="menu" aria-label="模型服务" aria-describedby="agent-model-note" style={{ right: 0 }}>
            <p id="agent-model-note" className={styles.menuLabel} aria-hidden="true">当前对话</p>
            {account !== 'ready' ? <Link role="menuitem" className={styles.menuItem} href="/login">登录后选择模型服务 ↗</Link> : <>
              <div role="group" aria-label="对话方式">
                <p className={styles.menuLabel} aria-hidden="true">对话方式</p>
                {item('command', '指令模式', () => onMode('command'), { checked: mode === 'command', note: '不调用模型' })}
                {item('model', '用模型对话', () => onMode('model'), { checked: mode === 'model', note: chatLabel ? '先确认再发送' : '需要「研究」能力' })}
              </div>
              <div role="group" aria-label="当前对话模型">
                {services.map(s => item(s.id, s.label, () => onService(s.id), { checked: s.id === serviceId, note: s.detail }))}
                {!services.length && <p className={styles.menuNote}>先接入一个研究模型。</p>}
              </div>
              {item('manage', '模型设置与任务分工 →', () => onOpen('services'))}
            </>}
          </div>}
        </span>
        <button type="submit" className={styles.send} disabled={!value.trim()} aria-label="发送"><Icon name="up" /></button>
      </div>
    </form>
  </div>;
}
