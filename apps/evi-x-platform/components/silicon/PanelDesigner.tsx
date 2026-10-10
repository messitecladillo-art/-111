'use client';

import { useState } from 'react';
import type { LabConfig } from '@/lib/silicon/config';
import { PANEL_TEMPLATES, SILICON_LIMITS, attributeIssues, fidelityRisk, panelMarginals, quotaCounts, type Persona, type PersonaAttribute } from '@/lib/silicon/persona';
import PersonaAvatar from './PersonaAvatar';
import styles from './SiliconLab.module.css';
import { useKeyedListMotion } from '@/components/motion/useWorkspaceMotion';

type Props = {
  config: LabConfig;
  update: (patch: Partial<LabConfig>) => void;
  personas: Persona[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const newKey = (attributes: PersonaAttribute[]) => { let i = attributes.length + 1; while (attributes.some(a => a.key === `attr${i}`)) i++; return `attr${i}`; };
const ROSTER_PREVIEW = 18;

export default function PanelDesigner({ config, update, personas, selectedId, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visiblePersonas = showAll ? personas : personas.slice(0, ROSTER_PREVIEW);
  const rosterRef = useKeyedListMotion<HTMLUListElement>({ ids: visiblePersonas.map(p => p.id), activeId: selectedId });
  const templateRef = useKeyedListMotion<HTMLDivElement>({ ids: Object.keys(PANEL_TEMPLATES), activeId: config.template, markerAxis: 'horizontal' });
  const issues = attributeIssues(config.attributes);
  const marginals = panelMarginals(personas, config.attributes);
  const risks = personas.map(fidelityRisk);
  const elevated = risks.filter(r => r.level === 'elevated').length;
  const reasons = [...new Set(risks.flatMap(r => r.reasons))];
  const setAttributes = (attributes: PersonaAttribute[]) => update({ attributes });
  const editAttr = (index: number, patch: Partial<PersonaAttribute>) => setAttributes(config.attributes.map((a, i) => i === index ? { ...a, ...patch } : a));
  const applyTemplate = (key: string) => {
    if (key === config.template) return;
    if (!window.confirm(`换成「${PANEL_TEMPLATES[key].label}」模板？当前的属性与配额会被替换（个人外观设置保留）。`)) return;
    update({ template: key, attributes: JSON.parse(JSON.stringify(PANEL_TEMPLATES[key].attributes)) });
  };

  return <div className={styles.designer}>
    <section className={styles.block} aria-labelledby="sx-template">
      <div className={styles.blockHead}><h3 id="sx-template">选择画像模板</h3><p>按研究对象调整画像属性与配额。</p></div>
      <div ref={templateRef} className={styles.templateRow} role="radiogroup" aria-label="画像模板"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>
        {Object.entries(PANEL_TEMPLATES).map(([key, t]) => <button type="button" key={key} data-motion-id={key} role="radio" aria-checked={config.template === key} className={styles.templateCard} onClick={() => applyTemplate(key)}>
          <strong>{t.label}</strong><small>{t.description}</small><span>{t.attributes.map(a => a.label).join(' · ')}</span>
        </button>)}
      </div>
    </section>

    <section className={styles.block} aria-labelledby="sx-size">
      <div className={styles.blockHead}><h3 id="sx-size">样本规模与分配</h3><p>从少量画像开始，检查题目与作答流程。</p></div>
      <div className={styles.sizeRow}>
        <label className={styles.sizeField}><span>硅基受访者人数</span>
          <span className={styles.sizeControl}><input type="range" min={1} max={SILICON_LIMITS.personas} value={config.size} onChange={e => update({ size: Number(e.target.value) })} aria-describedby="sx-size-hint"/><input type="number" min={1} max={SILICON_LIMITS.personas} value={config.size} onChange={e => update({ size: Math.max(1, Math.min(SILICON_LIMITS.personas, Number(e.target.value) || 1)) })} aria-label="人数"/></span>
          <small id="sx-size-hint">上限 {SILICON_LIMITS.personas} 位。</small>
        </label>
        <fieldset className={styles.segmented}><legend>分配方式</legend>
          <label><input type="radio" name="sx-allocation" checked={config.allocation === 'quota'} onChange={() => update({ allocation: 'quota' })}/><span>精确配额<small>每个属性的边际比例严格对齐</small></span></label>
          <label><input type="radio" name="sx-allocation" checked={config.allocation === 'random'} onChange={() => update({ allocation: 'random' })}/><span>独立抽取<small>按比例随机，会有波动</small></span></label>
        </fieldset>
        <div className={styles.seedBox}><span>随机种子 <code>{config.seed}</code></span><button type="button" onClick={() => update({ seed: Math.floor(Math.random() * 2 ** 31) })}>换一批画像</button><small>相同设定与种子可复现同一批画像。</small></div>
      </div>
      <label className={styles.wideField}><span>共同背景（可选）</span><textarea rows={2} maxLength={SILICON_LIMITS.background} value={config.background} onChange={e => update({ background: e.target.value })} placeholder="例如：就读于华东某综合性大学，住在校内宿舍。会写进每位硅基受访者的设定。"/></label>
    </section>

    <section className={styles.block} aria-labelledby="sx-attrs">
      <div className={styles.blockHead}><h3 id="sx-attrs">画像属性与配额</h3><p>最多 {SILICON_LIMITS.attributes} 个属性、每个 {SILICON_LIMITS.levels} 个取值。比例填相对权重，0 表示不出现。</p></div>
      <div className={styles.attrGrid}>
        {config.attributes.map((a, ai) => {
          const counts = quotaCounts(a.levels.map(l => l.weight), config.size);
          const actual = marginals[ai]?.levels ?? [];
          return <article key={a.key} className={styles.attrCard}>
            <div className={styles.attrHead}>
              <input value={a.label} maxLength={SILICON_LIMITS.label} aria-label={`属性 ${ai + 1} 名称`} onChange={e => editAttr(ai, { label: e.target.value })}/>
              <button type="button" className={styles.iconButton} aria-label={`删除属性「${a.label || ai + 1}」`} disabled={config.attributes.length <= 1} onClick={() => setAttributes(config.attributes.filter((_, i) => i !== ai))}>×</button>
            </div>
            <ul className={styles.levelList}>
              {a.levels.map((l, li) => <li key={li}>
                <input value={l.label} maxLength={40} aria-label={`${a.label} 取值 ${li + 1}`} onChange={e => editAttr(ai, { levels: a.levels.map((x, i) => i === li ? { ...x, label: e.target.value, value: e.target.value } : x) })}/>
                <input type="number" min={0} step={1} value={l.weight} aria-label={`${l.label || '该取值'} 的比例权重`} onChange={e => editAttr(ai, { levels: a.levels.map((x, i) => i === li ? { ...x, weight: Math.max(0, Number(e.target.value) || 0) } : x) })}/>
                <span className={styles.levelCount} title={config.allocation === 'quota' ? '配额人数' : '本批实际人数'}>{config.allocation === 'quota' ? counts[li] : actual[li]?.count ?? 0}</span>
                <button type="button" className={styles.iconButton} aria-label={`删除取值「${l.label || li + 1}」`} disabled={a.levels.length <= 2} onClick={() => editAttr(ai, { levels: a.levels.filter((_, i) => i !== li) })}>×</button>
              </li>)}
            </ul>
            <button type="button" className={styles.linkButton} disabled={a.levels.length >= SILICON_LIMITS.levels} onClick={() => editAttr(ai, { levels: [...a.levels, { value: '', label: '', weight: 1 }] })}>＋ 添加取值</button>
          </article>;
        })}
        <button type="button" className={styles.addCard} disabled={config.attributes.length >= SILICON_LIMITS.attributes} onClick={() => setAttributes([...config.attributes, { key: newKey(config.attributes), label: '', levels: [{ value: '', label: '', weight: 1 }, { value: '', label: '', weight: 1 }] }])}><span aria-hidden="true">＋</span>添加属性</button>
      </div>
      {issues.length > 0 && <ul className={styles.issueList} role="status">{issues.map(i => <li key={i}>{i}</li>)}</ul>}
    </section>

    <section className={styles.block} aria-labelledby="sx-roster">
      <div className={styles.blockHead}><h3 id="sx-roster">硅基受访者名册</h3><p>点选人物可调整外观与背景；外观只供辨认，不进入模型设定。</p></div>
      {elevated > 0 && <p className={styles.riskNote}><b>画像核验</b>{elevated} 位画像涉及{reasons.join('、')}，需结合真人预调查核对。</p>}
      <ul ref={rosterRef} className={styles.roster}>
        {visiblePersonas.map((p, i) => <li key={p.id} data-motion-id={p.id}>
          <button type="button" aria-pressed={selectedId === p.id} onClick={() => onSelect(p.id)}>
            <PersonaAvatar appearance={p.appearance} size={42}/>
            <span><strong>{p.code}{risks[i].level === 'elevated' && <i className={styles.riskDot} title={`保真度风险：${risks[i].reasons.join('、')}`} aria-label="保真度风险较高"/>}</strong><small>{config.attributes.map(a => p.traits[a.key]).filter(Boolean).join(' · ')}</small></span>
          </button>
        </li>)}
      </ul>
      {personas.length > ROSTER_PREVIEW && <button type="button" className={styles.linkButton} onClick={() => setShowAll(v => !v)}>{showAll ? '收起名册' : `显示全部 ${personas.length} 位`}</button>}
    </section>
  </div>;
}
