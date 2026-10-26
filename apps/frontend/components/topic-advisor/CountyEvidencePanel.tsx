'use client';

import type { TopicProfile } from '@/lib/topic-advisor/types';
import { ACCESS_OPTIONS } from '@/lib/topic-advisor/types';
import type { PublishedCountyProfile } from '@/lib/topic-publication';
import { countySourceEvidence, selectCountyEvidence, type CountyEvidenceSource } from '@/lib/county-evidence';
import styles from './CountyEvidencePanel.module.css';

export type CountyEvidencePanelProps = { profile: TopicProfile; published: readonly PublishedCountyProfile[] };

/** Only displays verified publications supplied by the host. No model calls, adoption or release actions. */
export default function CountyEvidencePanel({ profile, published }: CountyEvidencePanelProps) {
  const selected = selectCountyEvidence(profile, published);
  if (selected.status !== 'ready') return <section className={`${styles.root} ${styles.compact}`} data-self-styled data-county-state={selected.status} aria-label="县域资料">
    <div className={styles.empty} role="status"><h4>县域资料 · {selected.title}</h4>{selected.geography && <p className={styles.geography}>{selected.geography}</p>}<p>{selected.detail}</p></div>
  </section>;
  const { publication, geography, regionRef } = selected, county = publication.profile;
  return <section className={styles.root} data-self-styled data-county-state="ready" data-publication-contract="evix-topic-publication-ui/1" aria-label={`${county.displayName}县域资料`}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>县域资料</p><h4>{county.displayName}</h4><p className={styles.geography} data-evidence-field="geography">{geography}<span className={styles.code}>{regionRef.code}</span></p></div>
      <p className={styles.publication} data-evidence-field="status"><span>已发布资料</span><small>内容版本 {publication.contentVersion}</small></p>
    </header>
    <section className={styles.facts} data-evidence-field="fact" aria-label="历史事实">
      <div className={styles.sectionHeading}><h5>历史记录</h5><span>{county.facts.length} 条</span></div>
      <div className={styles.factGrid}>{county.facts.map((fact, index) => <article className={styles.fact} key={fact.id}>
        <p className={styles.itemMeta}><span>历史参考</span><span>{String(index + 1).padStart(2, '0')}</span></p><p className={styles.factText}>{fact.text}</p>
        <p className={styles.factTime} data-evidence-field="time">事实日期 / 截止日：{fact.asOfDate ? <time dateTime={fact.asOfDate}>{fact.asOfDate}</time> : <span>尚未确认</span>}</p>
        <SourceDetails rows={countySourceEvidence(publication, fact.sourceIds, fact.id)} />
      </article>)}</div>
      {!county.facts.length && <p className={styles.note}>此发布记录未登记历史事实。</p>}
    </section>
    <section className={styles.directions} data-evidence-field="hypothesis" aria-label="拟议研究方向">
      <div className={styles.sectionHeading}><h5>接下来可以调查什么</h5><span>{county.directions.length} 个拟议方向</span></div>
      <p className={styles.note}>研究问题与执行条件仍需验证。</p>
      {county.directions.map((direction, index) => <details className={styles.direction} key={direction.id}>
        <summary><span className={styles.number}>{String(index + 1).padStart(2, '0')}</span><span>{direction.title}</span><small>拟议研究</small></summary>
        <div className={styles.directionBody}><p className={styles.question}>{direction.question}</p>
          <dl className={styles.decision}><div><dt>拟服务的决策方</dt><dd>{direction.decisionOwner}</dd></div><div><dt>拟调查人群</dt><dd>{direction.population}</dd></div><div className={styles.full}><dt>拟支持的决定</dt><dd>{direction.decision}</dd></div></dl>
          <p className={styles.access}>需先确认的渠道：{direction.requiredAccess.length ? direction.requiredAccess.map(id => ACCESS_OPTIONS.find(option => option.id === id)?.label ?? id).join('、') : '未登记'}</p>
          <h6>最低证据要求</h6>{direction.minimumEvidence.length ? <ul>{direction.minimumEvidence.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className={styles.note}>未登记，开展前需补充。</p>}
          <SourceDetails rows={countySourceEvidence(publication, direction.sourceIds)} />
        </div>
      </details>)}
      {!county.directions.length && <p className={styles.note}>此发布记录未登记拟议方向。</p>}
    </section>
    <footer className={styles.footer}>
      <details><summary>仍需核实 · {county.gaps.length} 项</summary><ul>{county.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>
      <details className={styles.version}><summary>资料版本与记录</summary><dl><dt>资料包</dt><dd>{publication.packId}</dd><dt>内容版本</dt><dd>{publication.contentVersion}</dd><dt>包指纹</dt><dd>{publication.packHash}</dd><dt>发布记录指纹</dt><dd>{publication.releaseHash}</dd></dl></details>
    </footer>
  </section>;
}

function SourceDetails({ rows }: { rows: CountyEvidenceSource[] }) {
  return <details className={styles.sources} data-evidence-field="readscope"><summary>来源与阅读范围 · {rows.length}</summary>
    {rows.length ? rows.map(row => <article className={styles.source} key={row.id}>
      <div className={styles.sourceHeading}><strong>{row.title}</strong><span>{row.scopeLabel}</span></div>
      {row.authority && <p className={styles.authority}>{row.authority}</p>}
      <dl className={styles.sourceDates}><div><dt>来源发布</dt><dd>{row.publishedAt ? <time dateTime={row.publishedAt}>{row.publishedAt}</time> : '尚未确认'}</dd></div><div><dt>资料检索</dt><dd>{row.retrievedAt ? <time dateTime={row.retrievedAt}>{row.retrievedAt}</time> : '尚未确认'}</dd></div><div className={styles.full}><dt>实际阅读</dt><dd>{row.readAt ? <time dateTime={row.readAt}>{row.readAt.replace('T', ' ').replace('Z', ' UTC')}</time> : '尚未确认'}</dd></div></dl>
      <p className={styles.support}>{row.supportLabel}</p>
      <p className={styles.locator}>来源定位：{row.sourceLocator || '未登记'}</p><p className={styles.locator}>阅读定位：{row.readLocator || '未登记'}</p>
      {row.url && <a href={row.url} target="_blank" rel="noopener noreferrer">查看原始来源 ↗<span className={styles.srOnly}>（新窗口）</span></a>}
    </article>) : <p className={styles.note}>未登记来源或实际阅读，不作为已核查支持。</p>}
  </details>;
}
