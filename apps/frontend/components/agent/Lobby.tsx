'use client';

import { useState, type CSSProperties, type Ref } from 'react';
import { percent } from '@/lib/agent/glyphs';
import { roomLight, type Illumination, type ProjectView } from '@/lib/agent/illumination';
import { roomById, type RoomId } from '@/lib/agent/rooms';
import { questionIsMapped, questionnaireIssues } from '@/lib/questionnaire';
import { LightBar } from './Glyphs';
import styles from './AgentShell.module.css';

/** The research path drawn as a house plan: left to right, down, and back, so it reads as one corridor. */
const PLAN: readonly (readonly RoomId[])[] = [['diagnose', 'rules', 'design', 'sampling'], ['defense', 'editor', 'canvas', 'analysis']];
const ORDER: readonly RoomId[] = [...PLAN[0], ...[...PLAN[1]].reverse()];

/** 前厅: where the light reaches, where it does not, and the evidence chain it rests on. Everything here is read from the project. */
export default function Lobby({ light, view, onOpen, headingRef }: { light: Illumination; view: ProjectView; onOpen: (room: RoomId) => void; headingRef: Ref<HTMLHeadingElement> }) {
  const [allSpots, setAllSpots] = useState(false);
  const score = (id: RoomId) => roomLight(light, id)?.score ?? 0;
  // Light leaves a lit room along the corridor; it is drawn on the wire to the next room only.
  const upstreamLit = (id: RoomId) => { const i = ORDER.indexOf(id); return i > 0 && score(ORDER[i - 1]) > 0; };
  const spots = allSpots ? light.blind : light.blind.slice(0, 6);
  const design = view.design, issues = design ? questionnaireIssues(design) : [], asked = design?.questions.filter(q => q.text.trim()).length ?? 0;
  const blockers = issues.filter(i => i.level === 'blocker').length, mapped = design?.questions.filter(questionIsMapped).length ?? 0;
  const results = view.report?.quality?.results.length ?? 0, confirmed = view.report?.quality?.findings.filter(f => f.status === 'confirmed').length ?? 0;
  const benchmark = light.benchmark, report = roomLight(light, 'editor');

  return <div className={styles.lobby}>
    <header className={styles.lobbyHead}>
      <b>前厅 · 镜室</b>
      <h1 ref={headingRef} tabIndex={-1}>每一个数字，都有来处。</h1>
      <p>研究是一间镜室：证据是光，结论是房间，盲区是光到不了的角落。这里看到的每一格光，都来自项目里真实的问卷、数据与报告。</p>
    </header>

    <section className={styles.section} aria-labelledby="lobby-map">
      <div className={styles.sectionHead}><h2 id="lobby-map">照度图</h2><span>整体照度 <b>{percent(light.overall)}</b> · 盲区 <b>{light.blind.length}</b></span></div>
      <div className={styles.plan}>
        {PLAN.map((row, r) => row.map((id, c) => {
          const lit = roomLight(light, id), room = roomById(id);
          return <button key={id} type="button" className={styles.node} onClick={() => onOpen(id)}
            data-wired={lit ? 'true' : 'false'} data-lit={lit && lit.score > 0 ? 'true' : undefined} data-end={c === row.length - 1 ? 'true' : undefined}
            // The wire to this node's right carries light from whichever end is upstream on the corridor.
            data-wire={c < row.length - 1 && (r === 0 ? score(id) > 0 : upstreamLit(id)) ? 'lit' : undefined}
            style={{ '--glow': lit ? (lit.score * 0.16).toFixed(3) : 0, '--order': ORDER.indexOf(id) } as CSSProperties}
            aria-label={`${room.name}${lit ? `，照度 ${percent(lit.score)}，${lit.summary}` : '，照度尚未接入'}`}>
            <strong>{room.name}</strong>
            {lit ? <><LightBar score={lit.score} /><small>{percent(lit.score)} · {lit.summary}</small></> : <small>照度待接入</small>}
            {r === 0 && c === row.length - 1 && <span className={styles.turn} aria-hidden="true" />}
          </button>;
        }))}
      </div>
      <p className={styles.legend} aria-label="图例">
        <span><i>·</i> 无证据</span><span><b>░</b> 微弱</span><span><b>▒</b> 部分</span><span><b>▓</b> 充分</span><span><b>█</b> 全部通过</span>
      </p>
      <p className={styles.note}>照度来自问卷室、分析室与报告室的检查；虚线框的房间接入 Agent 主循环后再点亮。</p>
      <div className={styles.gallery}><span>镜廊</span>
        <a href="#cases">案例库</a><a href="#silicon">硅基样本</a><span className={styles.note}>只映照，不替你下结论。</span>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="lobby-blind">
      <div className={styles.sectionHead}><h2 id="lobby-blind">盲区</h2><span>光到不了的角落，按研究动线排列</span></div>
      {light.blind.length ? <ul className={styles.spots}>
        {spots.map(spot => <li key={spot.id}>
          <b aria-hidden="true">✕</b><span>{roomById(spot.room).name}</span>
          <div><strong>{spot.label}</strong><small>{spot.detail}</small></div>
          <button type="button" className={styles.go} onClick={() => onOpen(spot.go)}>去{roomById(spot.go).name} →</button>
        </li>)}
      </ul> : <p className={styles.clear}>没有盲区：三间房的检查全部通过。</p>}
      {light.blind.length > 6 && <button type="button" className={styles.go} style={{ marginTop: 12 }} onClick={() => setAllSpots(!allSpots)}>{allSpots ? '收起' : `展开全部 ${light.blind.length} 处`}</button>}
    </section>

    <section className={styles.section} aria-labelledby="lobby-chain">
      <div className={styles.sectionHead}><h2 id="lobby-chain">证据链</h2><span>问卷 → 数据 → 结果 → 报告</span></div>
      <div className={styles.chain}>
        <div className={styles.link} data-empty={!asked}>
          <span>问卷</span>
          <strong>{design && asked ? (design.title.trim() || '未命名问卷') : '还没有题目'}</strong>
          {design && asked > 0 && <small><b>{asked}</b> 道题 · <b>{blockers}</b> 处阻断 · <b>{mapped}</b>/{design.questions.length} 已映射</small>}
        </div>
        <div className={styles.link} data-empty={!view.dataset}>
          <span>数据</span>
          <strong>{view.dataset ? view.dataset.name : '还没有数据'}</strong>
          {view.dataset && <small><b>{view.dataset.rows}</b> 行 · {view.dataset.simulated ? '教学模拟数据' : '用户提供数据'}</small>}
        </div>
        <div className={styles.link} data-empty={!results && !view.resultPending}>
          <span>结果与发现</span>
          <strong>{results || view.resultPending ? `${results + (view.resultPending ? 1 : 0)} 项已登记的结果` : '还没有登记结果'}</strong>
          {(results > 0 || view.resultPending) && <small><b>{confirmed}</b> 条研究发现已确认{view.resultPending ? ' · 1 项正送往报告' : ''}</small>}
        </div>
        <div className={styles.link} data-empty={!benchmark}>
          <span>报告体检</span>
          <strong>{benchmark && report ? `${percent(report.score)} · ${report.summary}` : '报告仍是空白模板'}</strong>
          {benchmark && <div className={styles.dims} aria-label="体检各维度">
            {benchmark.dimensions.map(d => <div key={d.id}><span>{d.label}</span>{d.score === null ? <span>不适用</span> : <><LightBar score={d.score} cells={8} /><b>{percent(d.score)}</b></>}</div>)}
          </div>}
        </div>
      </div>
    </section>
  </div>;
}
