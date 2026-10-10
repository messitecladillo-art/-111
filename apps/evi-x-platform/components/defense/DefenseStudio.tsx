"use client";

import {useEffect,useRef,useState} from 'react';
import corpus from '@/data/defense-corpus.json';
import {allocatePitch,defenseExport,DEFENSE_FIELDS,DEFENSE_SCAFFOLDS,EMPTY_DEFENSE_DRAFT,formatDuration,hasDefenseDraftChanges,PITCH_BLOCKS,reviewDefenseDraft,type DefenseDraft,type EvidenceState} from '@/lib/defense-training';
import {MAX_DEFENSE_IMPORT_BYTES,mergeDefenseImport,parseDefenseImport} from '@/lib/defense-import';
import styles from './DefenseStudio.module.css';
import PitchRehearsal from './PitchRehearsal';
import ActionEvidence from './ActionEvidence';

export default function DefenseStudio(){
  const [category,setCategory]=useState('全部主题');
  const [selected,setSelected]=useState(corpus.cards[0].id);
  const [drafts,setDrafts]=useState<Record<string,DefenseDraft>>({});
  const [total,setTotal]=useState('600'),[reserve,setReserve]=useState('30');
  const [weights,setWeights]=useState<string[]>(PITCH_BLOCKS.map(b=>String(b.weight)));
  const [feedback,setFeedback]=useState('');
  const [importError,setImportError]=useState('');
  const [reading,setReading]=useState(false);
  const [pending,setPending]=useState<{name:string;revision:number;data:ReturnType<typeof parseDefenseImport>}|null>(null);
  const [includeTiming,setIncludeTiming]=useState(true);
  const [versionAcknowledged,setVersionAcknowledged]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null),importButton=useRef<HTMLButtonElement>(null),preview=useRef<HTMLElement>(null);
  const readToken=useRef(0),contentRevision=useRef(0);
  const restoreImportFocus=useRef(false);
  useEffect(()=>()=>{readToken.current++;},[]);
  useEffect(()=>{if(pending)preview.current?.focus();},[pending]);
  useEffect(()=>{if(!reading&&!pending&&restoreImportFocus.current){restoreImportFocus.current=false;importButton.current?.focus();}},[reading,pending]);
  const cards=corpus.cards.filter(card=>category==='全部主题'||card.category===category);
  const card=cards.find(c=>c.id===selected)||cards[0];
  const draft=drafts[card.id]||EMPTY_DEFENSE_DRAFT;
  const check=reviewDefenseDraft(draft);
  const scaffold=DEFENSE_SCAFFOLDS[draft.evidenceState];
  const filled=corpus.cards.filter(c=>hasDefenseDraftChanges(drafts[c.id])).length;
  let plan:ReturnType<typeof allocatePitch>=[],planError='';
  try{plan=allocatePitch(total.trim()?Number(total):NaN,reserve.trim()?Number(reserve):NaN,weights.map(w=>w.trim()?Number(w):NaN));}catch(error){planError=error instanceof Error?error.message:'请检查时间设置。';}
  const invalidateImport=()=>{
    readToken.current++;contentRevision.current++;
    setPending(null);setReading(false);setImportError('');
    setFeedback(pending||reading?'内容已修改，导入预览已取消。请重新选择文件，确认最新替换范围。':'');
  };
  const patch=(update:Partial<DefenseDraft>)=>{invalidateImport();setDrafts(current=>({...current,[card.id]:{...(current[card.id]||EMPTY_DEFENSE_DRAFT),...update}}));};
  const cancelImport=()=>{readToken.current++;restoreImportFocus.current=true;setPending(null);setReading(false);setImportError('');setFeedback('已取消导入，当前笔记与时间设置未变。');};
  const readImport=async(file:File)=>{
    const token=++readToken.current,revision=contentRevision.current;
    setPending(null);setReading(true);setImportError('');setFeedback('');
    try{
      if(file.size>MAX_DEFENSE_IMPORT_BYTES)throw new Error('文件超过 384 KiB 上限，请选择本系统导出的练习笔记。');
      const data=parseDefenseImport(new Uint8Array(await file.arrayBuffer()),corpus.cards,corpus.version);
      if(token!==readToken.current||revision!==contentRevision.current)return;
      setIncludeTiming(true);setVersionAcknowledged(false);setPending({name:file.name,revision,data});
    }catch(error){if(token===readToken.current)setImportError(error instanceof Error?error.message:'文件读取失败，当前内容未变，请重新选择文件。');}
    finally{if(token===readToken.current)setReading(false);}
  };
  const replaced=pending?.data.cardIds.filter(id=>Object.hasOwn(drafts,id))||[];
  const confirmImport=()=>{
    if(!pending||pending.revision!==contentRevision.current||(pending.data.corpusMismatch&&!versionAcknowledged))return;
    setDrafts(current=>mergeDefenseImport(current,pending.data.drafts));
    if(includeTiming){setTotal(String(pending.data.total));setReserve(String(pending.data.reserve));setWeights(pending.data.weights.map(String));}
    setCategory('全部主题');setSelected(pending.data.cardIds[0]);
    setFeedback(`已导入 ${pending.data.cardIds.length} 题，替换 ${replaced.length} 题，其余笔记保留。${includeTiming?'已恢复文件中的练习时间。':'保留当前练习时间。'}结构检查已重新计算，证据仍未核验。`);
    readToken.current++;contentRevision.current++;setPending(null);setImportError('');importButton.current?.focus();
  };
  const exportNotes=()=>{
    if(!filled||planError)return;
    try{
      const content=defenseExport(corpus.cards,drafts,plan,Number(total),Number(reserve),corpus.version);
      const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='EVI-X-答辩练习-未核验.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setFeedback('已发起下载，请确认练习包已保存后再刷新页面。依据状态是你的声明，仍需人工核验；请勿把未执行计划写成既成事实。');
    }catch{setFeedback('导出失败，当前页面内容仍在，请稍后重试。');}
  };
  return <section className={styles.studio} id="defense" aria-labelledby="defense-title">
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>演练 · 定位 · 修订</span><h2 id="defense-title">路演与答辩</h2><p>先回答问题，再打开证据。把难题练成清楚、诚实的回应。</p></div>
      <div className={styles.export}><span>{filled} / {corpus.cards.length} 题已记笔记</span><button ref={importButton} className={styles.secondary} type="button" onClick={()=>fileInput.current?.click()} disabled={reading}>导入练习笔记</button><button type="button" onClick={exportNotes} disabled={!filled||!!planError}>导出练习笔记</button></div>
    </header>
    <input ref={fileInput} className={styles.fileInput} type="file" accept=".json,application/json" aria-label="选择答辩练习 JSON 文件" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void readImport(file);}}/>
    <p className={styles.localNotice}>内容仅保留在当前页面内存，不上传、不自动保存。刷新或关闭页面会丢失未导出的笔记，请先导出并确认文件已保存，下次可导入继续练习；不要填写受访者身份或敏感资料。</p>
    {reading&&<div className={styles.reading}><p role="status">正在本地检查文件，尚未更改任何笔记…</p><button type="button" onClick={cancelImport}>取消读取</button></div>}
    {importError&&<p className={styles.error} role="alert">{importError} 当前笔记与时间设置未变。</p>}
    {pending&&<section ref={preview} tabIndex={-1} className={styles.importPreview} aria-labelledby="defense-import-title">
      <div className={styles.previewHeading}><div><span className={styles.eyebrow}>本地恢复 · 确认后生效</span><h3 id="defense-import-title">检查这次导入</h3></div><span className={styles.badge}>证据未核验</span></div>
      <p className={styles.filename}>{pending.name}</p>
      <p>导入 {pending.data.cardIds.length} 题：新增 {pending.data.cardIds.length-replaced.length} 题，替换 {replaced.length} 题。未列出的现有笔记保留；替换会覆盖该题的全部回答字段，建议先导出备份。</p>
      <ul className={styles.importList}>{pending.data.cardIds.map(id=><li key={id}><span>{corpus.cards.find(c=>c.id===id)!.title}</span><strong>{replaced.includes(id)?'替换现有笔记':'新增笔记'}</strong></li>)}</ul>
      <label className={styles.checkbox}><input type="checkbox" checked={includeTiming} onChange={e=>setIncludeTiming(e.target.checked)}/><span>同时恢复文件的时间编排：总时长 {formatDuration(pending.data.total)}，预留 {formatDuration(pending.data.reserve)}（当前总时长 {planError?'设置待修正':formatDuration(Number(total))}）</span></label>
      {pending.data.corpusMismatch&&<div className={styles.versionWarning}><p>文件题库版本 {pending.data.corpusVersion} 与当前版本 {corpus.version} 不同。问题编号可识别，但请按当前题意重新检查回答。</p><label className={styles.checkbox}><input type="checkbox" checked={versionAcknowledged} onChange={e=>setVersionAcknowledged(e.target.checked)}/><span>我会复核版本差异，按当前题库继续练习</span></label></div>}
      <p className={styles.importBoundary}>导入不代表证据已核验。文件内的检查结论不沿用，系统仅重新检查回答结构；练习时间不是官方规则。</p>
      <div className={styles.importActions}><button type="button" className={styles.secondary} onClick={cancelImport}>取消，保留当前内容</button><button type="button" onClick={confirmImport} disabled={pending.data.corpusMismatch&&!versionAcknowledged}>{replaced.length?`确认导入并替换 ${replaced.length} 题`:`确认导入 ${pending.data.cardIds.length} 题`}</button></div>
    </section>}
    <p className={styles.feedback} role="status">{feedback}</p>
    <div className={styles.workspace}>
      <aside className={styles.bank} aria-label="答辩练习题库">
        <div className={styles.bankHeader}><strong>选择一个薄弱环节</strong><label>主题筛选<select value={category} onChange={e=>{setCategory(e.target.value);setFeedback('');}}>{['全部主题',...new Set(corpus.cards.map(c=>c.category))].map(value=><option key={value}>{value}</option>)}</select></label></div>
        <div className={styles.cards}>{cards.map((item,index)=><button key={item.id} type="button" aria-pressed={card.id===item.id} onClick={()=>{setSelected(item.id);setFeedback('');}}><span>{String(index+1).padStart(2,'0')} · {item.category}</span><strong>{item.title}</strong><small>{hasDefenseDraftChanges(drafts[item.id])?'已记笔记 · 未核验':'待练习'}</small></button>)}</div>
      </aside>
      <article className={styles.practice} aria-label="当前问题与回答">
        <div className={styles.question}><span>{card.category}</span><h3>{card.question}</h3><p>{card.followUp}</p></div>
        <div className={styles.evidenceChecklist}><h4>回答前，先找这三类证据</h4><ul>{card.evidencePrompts.map(prompt=><li key={prompt}>{prompt}</li>)}</ul></div>
        <div className={styles.pitfall}><strong>不要这样回答</strong><p>{card.pitfall}</p></div>
        <div className={styles.form}>
          <label>当前依据状态<select value={draft.evidenceState} onChange={e=>patch({evidenceState:e.target.value as EvidenceState})}><option value="missing">缺少证据，暂不能确认</option><option value="documented">有记录可定位，尚待人工核验</option><option value="proposed">仅为计划，尚未执行</option></select></label>
          <div className={styles.scaffold} aria-label="按依据状态组织回答">
            <strong>{scaffold.title}</strong><ol>{scaffold.steps.map(step=><li key={step}>{step}</li>)}</ol>
            <p>这是组织思路的支架，不是万能答案。切换状态不会改写你的笔记，也不会核验任何证据。</p>
          </div>
          {DEFENSE_FIELDS.map((field,index)=><label key={field.id}><span><i>{index+1}</i>{field.label}</span>{field.id==='owner'?<input maxLength={120} value={draft[field.id]} placeholder={field.placeholder} onChange={e=>patch({[field.id]:e.target.value})}/>:<textarea rows={field.id==='answer'?4:2} maxLength={1800} value={draft[field.id]} placeholder={field.placeholder} onChange={e=>patch({[field.id]:e.target.value})}/>}</label>)}
        </div>
        <div className={styles.review} aria-label="回答结构检查"><strong>{check.status==='incomplete'?'还有信息需要补齐':'结构已填写，证据仍待人工复核'}</strong><p>{check.missing.length?`待补：${check.missing.join('、')}。`:'这不是正确性评分，也不代表已通过赛事或项目质量门禁。'}</p>{check.warnings.length>0&&<ul>{check.warnings.map(w=><li key={w}>{w}</li>)}</ul>}</div>
        <details className={styles.sources}><summary>方法来源与使用边界</summary><p>独立改写的练习题，不是历史现场提问原文。来源页码按 PDF 物理页计。</p>{card.sourceRefs.map(ref=>{const source=corpus.sources.find(s=>s.id===ref.id)!;return <p key={ref.id}>{source.label} · 第 {ref.pages.join('、')} 页<br/><small>{source.scope}</small></p>;})}<p>{corpus.notice}</p></details>
      </article>
    </div>
    <ActionEvidence/>
    <section className={styles.timing} aria-labelledby="pitch-timing-title">
      <div className={styles.timingHeading}><div><span className={styles.eyebrow}>自由编排</span><h3 id="pitch-timing-title">让时间跟着你的重点走</h3><p>这是可调整的练习分配，不是官方时限。总时长请先核对适用通知。</p></div><a href="#rules">核对赛事规则</a></div>
      <div className={styles.timeInputs}><label>练习总时长（秒）<input type="number" min={120} max={1800} step={1} value={total} onChange={e=>{invalidateImport();setTotal(e.target.value);}}/></label><label>预留时间（秒）<input type="number" min={0} max={90} step={1} value={reserve} onChange={e=>{invalidateImport();setReserve(e.target.value);}}/></label><p>初始比例只是编排起点。重点可以改变，关键证据和限制不能被压掉。</p></div>
      {planError&&<p className={styles.error} role="alert">{planError}</p>}
      <div className={styles.timeline}>{PITCH_BLOCKS.map((block,i)=><div key={block.id}><span>0{i+1}</span><h4>{block.label}</h4><p>{block.prompt}</p><label>相对权重<input aria-label={`${block.label}权重`} type="number" min={1} max={100} value={weights[i]} onChange={e=>{invalidateImport();setWeights(values=>values.map((value,j)=>j===i?e.target.value:value));}}/></label><strong>{plan[i]?formatDuration(plan[i].seconds):'—'}</strong><small>{plan[i]?`${formatDuration(plan[i].start)} 至 ${formatDuration(plan[i].end)}`:'等待有效设置'}</small></div>)}</div>
      {!planError&&<p className={styles.timeTotal}>讲述 {formatDuration(Number(total)-Number(reserve))} + 预留 {formatDuration(Number(reserve))} = 总时长 {formatDuration(Number(total))}</p>}
    </section>
    <PitchRehearsal total={total.trim()?Number(total):NaN} reserve={reserve.trim()?Number(reserve):NaN} weights={weights.map(w=>w.trim()?Number(w):NaN)} corpusVersion={corpus.version} planError={planError}/>
    <details className={styles.learned}><summary>本次吸收了什么，哪些没有照搬？</summary><p>3 份资料共 126 页，已保留出处和指纹。只抽象训练机制，不公开原件、完整讲稿、案例数字或联系方式。</p><div className={styles.rejections}>{corpus.rejectedShortcuts.map(item=><article key={item.id}><h4>{item.reason}</h4><p>{item.replacement}</p></article>)}</div><p>“国一”等描述来自资料自述，未据此新增已核验获奖案例。历史经验不能替代当前届次、组别、赛区、赛道和阶段的正式通知。</p><div className={styles.references}>{corpus.verificationReferences.map(ref=><a key={ref.id} href={ref.url} target="_blank" rel="noreferrer">{ref.label}</a>)}</div></details>
    <details className={styles.sources}><summary>资料自身有哪些限制？</summary><ul>{corpus.sourceLimitations.map(item=><li key={item}>{item}</li>)}</ul></details>
  </section>;
}
