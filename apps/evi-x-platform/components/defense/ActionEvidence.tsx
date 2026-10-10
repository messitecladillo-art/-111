"use client";

import {useEffect, useRef, useState} from 'react';
import {
  ACTION_FIELDS, ACTION_STAGES, MAX_ACTION_CARDS, MAX_ACTION_IMPORT_BYTES,
  actionEvidenceExport, mergeActionEvidence, newActionEvidenceCard,
  parseActionEvidenceImport, reviewActionEvidence,
  type ActionEvidenceCard, type ActionField, type ActionStage,
} from '@/lib/action-evidence';
import styles from './ActionEvidence.module.css';
import {useContentReveal,useKeyedListMotion} from '../motion/useWorkspaceMotion';

const groups: {title:string; hint:string; fields:ActionField[]}[] = [
  {title:'从哪条发现出发', hint:'把研究依据、对象和责任人放在同一张卡里。', fields:['title','finding','audience','owner','artifactVersion']},
  {title:'这次最多能说到哪里', hint:'写下有限的成果声明，不用演示或认可代替真实实施记录。', fields:['claim','periodScope','evidence']},
  {title:'留下反证与下一步', hint:'用指标、对照和限制说明如何复核。', fields:['metrics','comparison','counterEvidence','limitations','nextStep']},
];

/** A local, user-authored worksheet. No file resolution, review approval or Gate transition. */
export default function ActionEvidence() {
  const [cards,setCards] = useState<ActionEvidenceCard[]>([]);
  const [selected,setSelected] = useState('');
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [reading,setReading] = useState(false);
  const [pending,setPending] = useState<{name:string; revision:number; entries:ActionEvidenceCard[]} | null>(null);
  const [removeId,setRemoveId] = useState('');
  const records = useRef<ActionEvidenceCard[]>([]);
  const revision = useRef(0), readToken = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const focusTitle = useRef(false);
  const card = cards.find(item=>item.id===selected) || cards[0];
  const check = card ? reviewActionEvidence(card) : null;
  const stage = ACTION_STAGES.find(item=>item.id===card?.stage);
  const replacements = pending?.entries.filter(item=>cards.some(current=>current.id===item.id)).length || 0;

  useEffect(()=>{
    const tokenRef=readToken; // Capture the counter ref, not its value; invalidate late reads on unmount.
    const warn=(event:BeforeUnloadEvent)=>{if(records.current.length){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return ()=>{tokenRef.current++;window.removeEventListener('beforeunload',warn);};
  },[]);
  useEffect(()=>{if(pending)preview.current?.focus();},[pending]);
  useEffect(()=>{if(focusTitle.current&&card){focusTitle.current=false;titleInput.current?.focus();}},[card]);

  const invalidate = () => {
    revision.current++; readToken.current++;
    setPending(null);setReading(false);setRemoveId('');setError('');
    setNotice(pending||reading?'内容已修改，已取消旧导入预览。请重新选择文件。':'');
  };
  const publish = (next:ActionEvidenceCard[]) => {records.current=next;setCards(next);};
  const add = () => {
    if(records.current.length>=MAX_ACTION_CARDS)return;
    const item=newActionEvidenceCard(`action-${crypto.randomUUID()}`);invalidate();publish([...records.current,item]);
    focusTitle.current=true;setSelected(item.id);
  };
  const patch = (update:Partial<Pick<ActionEvidenceCard,ActionField|'stage'>>) => {
    if(!card)return;
    invalidate();publish(records.current.map(item=>item.id===card.id?{...item,...update}:item));
  };
  const remove = () => {
    if(!removeId||!records.current.some(item=>item.id===removeId))return;
    const next=records.current.filter(item=>item.id!==removeId);
    invalidate();publish(next);setSelected(next[0]?.id||'');
    setNotice('已移除此卡。可从此前导出的文件恢复；其他卡片、答辩笔记和彩排记录保留。');
  };
  const cancelImport = () => {
    readToken.current++;setReading(false);setPending(null);setError('');
    setNotice('已取消导入，当前卡片保持不变。');importButton.current?.focus();
  };
  const readImport = async (file:File) => {
    const token=++readToken.current,at=revision.current;
    setPending(null);setRemoveId('');setReading(true);setError('');setNotice('');
    try {
      if(file.size>MAX_ACTION_IMPORT_BYTES)throw Error('文件超过 384 KiB 上限，请选择本面板导出的成果卡。');
      const entries=parseActionEvidenceImport(new Uint8Array(await file.arrayBuffer()));
      if(token!==readToken.current||at!==revision.current)return;
      mergeActionEvidence(records.current,entries); // Capacity/shape check only. Never apply on read.
      setPending({name:file.name,revision:at,entries});
    } catch(reason) {
      if(token===readToken.current)setError(reason instanceof Error?reason.message:'读取失败，请重新选择文件。');
    } finally {if(token===readToken.current)setReading(false);}
  };
  const confirmImport = () => {
    if(!pending||pending.revision!==revision.current)return;
    try {
      const next=mergeActionEvidence(records.current,pending.entries),first=pending.entries[0].id;
      invalidate();publish(next);setSelected(first);importButton.current?.focus();
      setNotice('已按预览合并成果卡，未列出的卡片保留。声明类别、材料版本均来自填写者，证据仍未核验。');
    } catch(reason) {setError(reason instanceof Error?reason.message:'导入未完成，当前卡片保持不变。');}
  };
  const exportCards = (single?:ActionEvidenceCard) => {
    if(!records.current.length)return;
    try {
      const content=actionEvidenceExport(single?[single]:records.current);
      const url=URL.createObjectURL(new Blob([JSON.stringify(content)],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='成果声明证据卡-未核验.json';
      link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice('已发起成果卡下载，请确认文件保存成功。此文件可在本面板导入；不包含答辩笔记和彩排记录。');setError('');
    } catch(reason) {setError(reason instanceof Error?reason.message:'导出失败，当前页面内容仍在。');}
  };

  const cardMotion=useKeyedListMotion<HTMLElement>({ids:cards.map(item=>item.id),activeId:card?.id??null});
  const stageReveal=useContentReveal<HTMLDivElement>({token:card?`${card.id}:${card.stage}`:null});
  return <section className={styles.panel} aria-labelledby="action-evidence-title">
    <header className={styles.heading}>
      <div><span className={styles.kicker}>从建议到记录</span><h3 id="action-evidence-title">建议落地证据卡</h3><p>每张卡记录一项行动的进展与依据。</p></div>
      <span className={styles.badge}>用户声明 · 证据未核验</span>
    </header>
    <p className={styles.boundary}>材料版本、日期和页码由你填写，未核验文件或绑定项目修订。原型、反馈、采纳、实施与效果各需依据，不能互相推出。</p>
    <div className={styles.toolbar}>
      <strong>{cards.length} / {MAX_ACTION_CARDS} 张卡</strong>
      <button type="button" className={styles.primary} onClick={add} disabled={cards.length>=MAX_ACTION_CARDS}>新增成果卡</button>
      <button type="button" ref={importButton} onClick={()=>fileInput.current?.click()} disabled={reading}>导入成果卡</button>
      <button type="button" onClick={()=>exportCards()} disabled={!cards.length}>导出全部成果卡</button>
      <button type="button" onClick={()=>{if(card)exportCards(card);}} disabled={!card}>仅导出当前卡</button>
      {cards.length>=MAX_ACTION_CARDS&&<span>已达上限，不会自动丢弃旧卡。</span>}
    </div>
    <input ref={fileInput} className={styles.fileInput} type="file" accept=".json,application/json" aria-label="选择成果卡 JSON 文件" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void readImport(file);}}/>
    <p className={styles.local}>仅在页面内存保存，不上传。刷新或关闭会丢失未导出的卡片；请单独导出并确认保存。不要填写受访者身份或敏感资料。</p>
    {reading&&<div className={styles.importBox}><p role="status">正在本地检查文件，尚未修改卡片…</p><button type="button" onClick={cancelImport}>取消读取成果卡</button></div>}
    {pending&&<section className={styles.importBox} ref={preview} tabIndex={-1} aria-labelledby="action-import-title">
      <h4 id="action-import-title">确认成果卡导入范围</h4><p className={styles.filename}>{pending.name}</p>
      <p>新增 {pending.entries.length-replacements} 张，替换 {replacements} 张同编号卡片。其余保留；替换会覆盖整张卡，请先导出备份。</p>
      <ul>{pending.entries.map(item=><li key={item.id}>{item.title||'未命名成果卡'} · {cards.some(current=>current.id===item.id)?'替换现有卡片':'新增卡片'}</li>)}</ul>
      <p>只恢复文字与用户声明，不沿用任何核验或批准。答辩笔记和计时设置不受影响。</p>
      <div className={styles.toolbar}><button type="button" onClick={cancelImport}>取消成果卡导入</button><button type="button" className={styles.primary} onClick={confirmImport}>确认合并成果卡</button></div>
    </section>}
    {error&&<p role="alert" className={styles.error}>{error} 当前卡片未被导入覆盖。</p>}
    <p className={styles.notice} role="status">{notice}</p>
    {!card?<div className={styles.empty}><strong>选择一条准备在答辩中展示的建议</strong><p>新增成果卡，填写支撑这条建议的发现。</p></div>:<div className={styles.workspace}>
      <aside ref={cardMotion} className={styles.cards} aria-label="成果卡列表"><span className={styles.motionMarker} data-motion-marker aria-hidden="true"/>{cards.map((item,index)=><button type="button" key={item.id} data-motion-id={item.id} aria-pressed={card.id===item.id} onClick={()=>{setSelected(item.id);setRemoveId('');}}><span>行动 {String(index+1).padStart(2,'0')}</span><strong>{item.title||'未命名成果卡'}</strong><small>{ACTION_STAGES.find(s=>s.id===item.stage)?.label} · 未核验</small></button>)}</aside>
      <article className={styles.editor} aria-label="成果卡编辑区">
        <fieldset className={styles.stages}><legend>选择声明类别 · 自报</legend><div>{ACTION_STAGES.map(item=><label key={item.id} data-selected={card.stage===item.id}><input type="radio" name={`action-stage-${card.id}`} value={item.id} checked={card.stage===item.id} onChange={()=>patch({stage:item.id as ActionStage})}/><span>{item.label}</span></label>)}</div></fieldset>
        <div ref={stageReveal} className={styles.stageNote}><strong>{stage?.prompt}</strong><p>{stage?.boundary}</p></div>
        {groups.map(group=><section key={group.title} className={styles.group}><h4>{group.title}</h4><p>{group.hint}</p><div className={styles.fields}>{group.fields.map(id=>{
          const field=ACTION_FIELDS.find(item=>item.id===id)!;
          const short=['title','owner','artifactVersion','audience'].includes(id);
          return <label key={id} className={short?styles.short:styles.wide}><span>{field.label}</span>{short?<input ref={id==='title'?titleInput:undefined} maxLength={field.maxLength} value={card[id]} placeholder={field.placeholder} onChange={event=>patch({[id]:event.target.value})}/>:<textarea maxLength={field.maxLength} rows={id==='evidence'?3:2} value={card[id]} placeholder={field.placeholder} onChange={event=>patch({[id]:event.target.value})}/>}</label>;
        })}</div></section>)}
        <div className={styles.review} aria-label="成果卡结构提醒"><strong>{check?.status==='incomplete'?'还有信息待补充':'结构已填写，证据待复核'}</strong>{!!check?.missing.length&&<p>待补：{check.missing.join('、')}。</p>}<ul>{check?.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></div>
        <div className={styles.cardFooter}><button type="button" onClick={()=>setRemoveId(card.id)}>移除当前成果卡</button></div>
        {removeId===card.id&&<div className={styles.removeBox}><p>确认移除“{card.title||'未命名成果卡'}”？此操作只删除页面内存中的这一张卡。未导出的内容无法恢复。</p><div className={styles.toolbar}><button type="button" onClick={()=>setRemoveId('')}>保留此卡</button><button type="button" onClick={remove}>确认移除此卡</button></div></div>}
      </article>
    </div>}
  </section>;
}
