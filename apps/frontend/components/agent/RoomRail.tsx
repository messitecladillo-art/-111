'use client';

import Link from 'next/link';
import { Fragment, useState, type CSSProperties } from 'react';
import { percent } from '@/lib/agent/glyphs';
import { roomLight, type Illumination } from '@/lib/agent/illumination';
import { ROOM_GROUPS, ROOMS, type RoomGroup, type RoomId } from '@/lib/agent/rooms';
import { LightBar } from './Glyphs';
import styles from './AgentShell.module.css';

const GROUPS = Object.keys(ROOM_GROUPS) as RoomGroup[];
const MARKS: Record<RoomGroup, string> = { lobby: '◇', path: '○', gallery: '◌', tools: '·' };

/** The rooms, in research order. A room whose light grows is swept by light once (光扫). */
export default function RoomRail({ room, light, onNavigate }: { room: RoomId; light: Illumination; onNavigate: () => void }) {
  const scores = Object.fromEntries(light.rooms.map(r => [r.room, r.score]));
  const [seen, setSeen] = useState(scores);
  const [sweeps, setSweeps] = useState<Record<string, number>>({});
  const changed = light.rooms.filter(r => r.score !== seen[r.room]);
  if (changed.length) {
    setSeen(scores);
    const brighter = changed.filter(r => r.score > (seen[r.room] ?? 0));
    if (brighter.length) setSweeps(current => ({ ...current, ...Object.fromEntries(brighter.map(r => [r.room, (current[r.room] ?? 0) + 1])) }));
  }
  return <nav id="agent-rail" className={styles.rail} aria-label="房间" data-dialog-background>
    {GROUPS.map(group => <Fragment key={group}>
      {ROOM_GROUPS[group] && <div className={styles.railGroup} aria-hidden="true">{ROOM_GROUPS[group]}</div>}
      {ROOMS.filter(r => r.group === group).map(r => {
        const lit = roomLight(light, r.id), here = room === r.id;
        return <a key={r.id} href={`#${r.id}`} className={styles.roomLink} aria-current={here ? 'page' : undefined} title={`${r.name}：${r.line}`} onClick={onNavigate}>
          {sweeps[r.id] ? <span key={sweeps[r.id]} className={styles.sweep} aria-hidden="true" /> : null}
          <span className={styles.roomMark} aria-hidden="true">{here ? '●' : MARKS[group]}</span>
          <span className={styles.roomName}>{r.name}{lit && <span className={styles.srOnly}>，照度 {percent(lit.score)}</span>}</span>
          <span className={styles.roomGlyph} aria-hidden="true" data-lit={lit && lit.score > 0 ? 'true' : undefined}
            style={lit ? { '--glow-line': 0.25 + lit.score * 0.75 } as CSSProperties : undefined}>{r.glyph}</span>
          {lit ? <LightBar score={lit.score} /> : <span aria-hidden="true" />}
        </a>;
      })}
    </Fragment>)}
    <div className={styles.railFoot}>
      照度来自问卷室、分析室<br />与报告室的检查。<br />
      <Link href="/workspace">经典工作台 ↗</Link>
    </div>
  </nav>;
}
