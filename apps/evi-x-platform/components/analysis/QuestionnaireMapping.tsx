"use client";
import {useLayoutEffect,useRef,useState} from 'react';
import {parseQuestionnaire,QUESTION_TYPES,questionnaireIssues} from '@/lib/questionnaire';
import {assignmentProblems,canonical,mappingBackup,mappingCurrent,mappingSignature,restoreMapping,scaleSuggestions,snapshotSignature,type DatasetIdentity,type DesignTransfer,type Mapping} from '@/lib/questionnaire-mapping';
import styles from './QuestionnaireMapping.module.css';
import {parseRoundTripManifest,type WjxExportManifest} from '@/lib/questionnaire-platform-export';
import {platformMappingSuggestions,unambiguousPlatformAssignments,importColumnLabel} from '@/lib/survey-import-metadata';

type Scale=ReturnType<typeof scaleSuggestions>[number];
export default function QuestionnaireMapping({mapping,dataset,stale,transfer,allowManual=true,onChange,onScale,frozenRevision}:{mapping:Mapping|null;dataset:DatasetIdentity|null;stale:boolean;transfer:DesignTransfer|null;allowManual?:boolean;onChange:(value:Mapping|null)=>void;onScale:(value:Scale)=>void;frozenRevision?:number}){
  const [query,setQuery]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reading,setReading]=useState(false),[manifest,setManifest]=useState<WjxExportManifest|null>(null);
  const fileInput=useRef<HTMLInputElement>(null),mode=useRef<'design'|'mapping'|'manifest'>('design'),epoch=useRef(0);
  const context=canonical({mapping,dataset,transfer,stale,frozenRevision:frozenRevision??null}),latest=useRef(context),mounted=useRef(true);
  // Commit-only synchronization: abandoned renders cannot alter the read guard.
  // Epoch also rejects A → B → A while a file is being decoded.
  useLayoutEffect(()=>{latest.current=context;epoch.current++;},[context]);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const currentManifest=manifest&&mapping&&canonical(manifest.source.questionnaire)===canonical(mapping.design)?manifest:null;
  const suggestions=mapping&&dataset?platformMappingSuggestions(mapping.design,dataset,currentManifest):[];
  const confirmed=!!mapping&&!!dataset&&mappingCurrent(mapping,dataset,stale);
  const problems=mapping&&dataset?assignmentProblems(mapping,dataset):[];
  const issues=mapping?questionnaireIssues(mapping.design):[];
  const visible=mapping?.design.questions.filter(q=>[q.text,q.variable,q.construct].join(' ').toLowerCase().includes(query.trim().toLowerCase()))||[];
  function change(next:Mapping|null){epoch.current++;setError('');setNotice('');onChange(next);}
  function replace(next:Mapping){if(frozenRevision&&mapping&&canonical(next.design)!==canonical(mapping.design)){setError('回收答卷固定对应发布版本，请使用这一版问卷的对应备份。');return;}if(mapping&&!window.confirm('替换当前问卷对应快照？现有计算将失效。请先下载需要保留的对应备份。'))return;change(frozenRevision&&mapping?{...next,sourceSignature:mapping.sourceSignature}:next);setQuery('');}
  async function read(file:File){
    const token=++epoch.current,captured=context,kind=mode.current;setReading(true);setError('');
    try{
      if(file.size>(kind==='manifest'?2_000_000:kind==='mapping'?500_000:300_000))throw Error('文件超过当前备份大小限制。');
      const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
      if(!mounted.current)return;
      if(token!==epoch.current||captured!==latest.current)throw Error('读取期间当前问卷或数据已变化；未覆盖新内容，请重新选择文件。');
      if(kind==='manifest'){
        if(!mapping)throw Error('请先带入问卷，再读取往返清单。');
        const next=await parseRoundTripManifest(text,mapping.design);
        if(!mounted.current||token!==epoch.current||captured!==latest.current)throw Error('读取期间问卷或数据已变化，请重新选择清单。');
        setManifest(next);setNotice('往返清单已核验。请填入列对应建议，并逐项核对编码与选项顺序。');return;
      }
      if(kind==='mapping'&&!dataset)throw Error('请先读取原数据，再恢复对应备份。');
      const next=kind==='mapping'?restoreMapping(text,dataset!):{design:parseQuestionnaire(text),assignments:[],confirmed:null,sourceSignature:null};
      replace(next);
    }catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)setReading(false);}
  }
  function save(){try{
    if(!mapping||!dataset)return;
    const raw=mappingBackup(mapping,dataset),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='问卷与数据对应备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice('备份包含问卷文字、选项、列名与文件指纹，不含答卷行。恢复时需选择原数据并重新确认。分享前请检查敏感信息。');
  }catch(e){setError((e as Error).message);}}
  return <section className={styles.panel} aria-label="问卷与数据对应">
    <header className={styles.header}><div><span className={styles.eyebrow}>QUESTION → VARIABLE → EVIDENCE</span><h3>核对问卷与数据列</h3><p>先核对题目与数据列，再组合分析。相同列名只作为建议，不自动认定。</p></div><span className={styles.state} data-ready={confirmed}>{!mapping?'尚未关联问卷':stale?'源问卷已变化':confirmed?'本版对应已确认':'对应待确认'}</span></header>
    <div className={styles.tools}>{frozenRevision?<span>发布问卷 v{frozenRevision}</span>:<><a href="#design">前往问卷设计 ↗</a><button type="button" disabled={reading} onClick={()=>{mode.current='design';fileInput.current?.click();}}>导入问卷设计备份</button></>}<button type="button" disabled={reading||!dataset} onClick={()=>{mode.current='mapping';fileInput.current?.click();}}>恢复对应备份</button>{!frozenRevision&&<button type="button" disabled={reading||!mapping} onClick={()=>{mode.current='manifest';fileInput.current?.click();}}>读取问卷星往返清单</button>}{mapping&&dataset&&<button type="button" onClick={save}>下载对应备份</button>}{mapping&&!frozenRevision&&<button type="button" onClick={()=>{if(window.confirm(allowManual?'解除问卷关联？将使当前结果失效，并返回不核验题目语义的手动分析模式。':'解除问卷关联？当前结果将失效；带入问卷并重新确认平台编码后可继续分析。'))change(null);}}>解除关联</button>}<input hidden ref={fileInput} type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void read(file);}}/></div>
    {transfer&&snapshotSignature(transfer.snapshot)!==mapping?.sourceSignature&&<div className={styles.incoming}><div><strong>收到设计页快照：{transfer.snapshot.design.title}</strong><span>{transfer.snapshot.design.questions.length} 道题 · 待实施草稿，不证明实际施测版本</span></div><button type="button" disabled={reading||transfer.snapshot.pending} onClick={()=>replace({design:transfer.snapshot.design,assignments:[],confirmed:null,sourceSignature:snapshotSignature(transfer.snapshot)})}>使用收到的问卷</button></div>}
    {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
    {!mapping?<div className={styles.empty}><b>01 带入问卷</b><span>→</span><b>02 核对数据列</b><span>→</span><b>03 确认后分析</b><p>{allowManual?'也可暂不关联，按原始列手动分析；数字格式不作为题型依据。答卷与问卷仅保留在本页，刷新前请下载备份。':'带入当前问卷，并在平台编码中确认取值、缺失规则和共同应答范围后分析。'}</p></div>:<>
      <div className={styles.summary}><div><strong>{mapping.design.title}</strong><p>{mapping.assignments.length} / {mapping.design.questions.length} 题已选择数据列 · {issues.filter(i=>i.level==='blocker').length} 项设计结构提示</p><small>{frozenRevision?`固定使用发布 v${frozenRevision} 的题目和分支规则。`:mapping.sourceSignature?'来自本页设计快照；设计修改会使关联失效。':'来自导入备份；系统无法感知外部文件的后续修改。'}</small></div>{dataset&&<code title={dataset.interpretationHash}>解析身份 {dataset.interpretationHash.slice(0,12)}…</code>}</div>
      {manifest&&!currentManifest&&<p className={styles.warning}>问卷版本已变化，请重新读取对应的往返清单。</p>}{stale&&<p className={styles.error} role="alert">源问卷已有变化或未应用数值输入。当前快照保留供核对，但旧结果不再用于报告。请回设计页重新发送快照。</p>}
      {!dataset?<p className={styles.notice}>问卷已就位。请先在“数据检查”读取回收数据，再逐题核对对应。</p>:<>
        <div className={styles.mappingTools}><label>查找题目<input type="search" value={query} maxLength={160} placeholder="题干、变量或构念" onChange={e=>setQuery(e.target.value)}/></label><button type="button" onClick={()=>{if(mapping.assignments.length&&!window.confirm('用变量名与题号候选替换当前选择？确认状态和计算结果将失效。'))return;change({...mapping,assignments:unambiguousPlatformAssignments(mapping.design,dataset,currentManifest),confirmed:null});setNotice('已填入唯一候选；重复题号保留待选。请核对编码或选项文字，再确认对应。');}}>填入列对应建议</button><span>显示 {visible.length} 题</span></div>
        <div className={styles.rows}>{visible.map(q=>{const a=mapping.assignments.find(a=>a.questionId===q.id),candidate=suggestions.find(s=>s.questionId===q.id),qi=issues.filter(i=>i.questionId===q.id&&i.level==='blocker');return <article className={styles.row} key={q.id}>
          <div className={styles.question}><div><code>{q.variable||'未编码'}</code><span>{QUESTION_TYPES[q.type]}{q.reverse?' · 反向':''}</span></div><strong>{q.text||'题干尚未填写'}</strong>{candidate?.ambiguous&&<p className={styles.warning}>发现多个同名或同题号候选，请手动选择正确列。</p>}<small>{q.construct||'未定义构念'}{q.type==='likert'||q.type==='number'?` · 范围 ${q.min??'不限'} 至 ${q.max??'不限'}`:''}</small>{q.type==='single'&&<details><summary>查看选项编码</summary><p>{q.choices.map(c=>`${c.code} = ${c.label}`).join('；')}</p></details>}{q.condition&&<p className={styles.warning}>条件题：需在下方确认跳题处理方式；计算时核验父题链与共同应答范围。</p>}{['multi','text'].includes(q.type)&&<p className={styles.warning}>需先{q.type==='multi'?'拆分多选列':'完成文本编码'}，当前分析不自动处理。</p>}{qi.map(i=><p className={styles.warning} key={i.code}>{i.message}</p>)}</div>
          <div className={styles.assignment}><label>{q.variable||'本题'} 对应数据列<select aria-invalid={!!a&&!dataset.headers.includes(a.column)} value={a?.column||''} onChange={e=>{const rest=mapping.assignments.filter(v=>v.questionId!==q.id);change({...mapping,assignments:e.target.value?[...rest,{questionId:q.id,column:e.target.value,representation:a?.representation||'code'}]:rest,confirmed:null});}}><option value="">暂不对应</option>{a&&!dataset.headers.includes(a.column)&&<option value={a.column}>{a.column} · 原列已不存在，请重选</option>}{dataset.headers.map(h=><option key={h} value={h}>{importColumnLabel(dataset,h)} · {h}</option>)}</select></label>{q.type==='single'&&<label>该列存储格式<select value={a?.representation||'code'} disabled={!a} onChange={e=>change({...mapping,assignments:mapping.assignments.map(v=>v.questionId===q.id?{...v,representation:e.target.value as 'code'|'label'}:v),confirmed:null})}><option value="code">选项编码（如 1、2）</option><option value="label">选项文字（如 已就业）</option></select></label>}{a&&!dataset.headers.includes(a.column)&&<p className={styles.warning}>原列已不存在。此题暂不能分析，请重新选择或设为暂不对应。</p>}<small>稳定题目 ID：{q.id}</small></div>
        </article>;})}{!visible.length&&<p>没有匹配题目，清空搜索后重试。</p>}</div>
        {!!problems.length&&<p className={styles.error} role="alert">{problems.join(' ')}</p>}
        <div className={styles.confirm}><div><strong>{confirmed?'对应已确认，计算仍需逐项检查':'核对完成后，确认这一版'}</strong><p>只需对应本次分析的题目；未对应或不支持的题目不参与计算。量表效度需单独检验。</p></div><button type="button" disabled={confirmed||stale||!mapping.assignments.length||!!problems.length} onClick={()=>{change({...mapping,confirmed:mappingSignature(mapping,dataset)});setNotice('本版对应已确认。更换数据、修改对应或源问卷后，需要重新核对与计算。');}}>确认本版对应</button></div>
        {confirmed&&!!scaleSuggestions(mapping,dataset).length&&<div className={styles.scales}><strong>从已对应题项填入量表设置</strong>{scaleSuggestions(mapping,dataset).map(scale=><button type="button" key={scale.construct} disabled={scale.columns.length>30} onClick={()=>onScale(scale)}>{scale.construct} · {scale.columns.length} 题{scale.omitted.length?`（未纳入 ${scale.omitted.length} 题）`:''} →</button>)}<p>仅填入已对应且同计分范围的题项；条件题还需确认跳题策略并使用共同应答范围。未纳入题项意味着这是子集，不代表完整量表。超过 30 项时请在量表区手动选择有理论依据的子集。不会自动计算或删题。</p></div>}
      </>}
    </>}
  </section>;
}
