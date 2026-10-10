export type EvidenceState = 'missing' | 'documented' | 'proposed';
export type DefenseDraft = { answer:string; evidence:string; boundary:string; nextStep:string; owner:string; evidenceState:EvidenceState };
export const EMPTY_DEFENSE_DRAFT:DefenseDraft={answer:'',evidence:'',boundary:'',nextStep:'',owner:'',evidenceState:'missing'};
export const DEFENSE_FIELDS = [
  {id:'answer',label:'直接回应',placeholder:'先回答被问到的具体问题，不自动补写结果。'},
  {id:'evidence',label:'证据定位',placeholder:'填写真实文件、页码、表号或记录编号；没有证据就明确写“尚无”。'},
  {id:'boundary',label:'适用边界与影响',placeholder:'结论适用于谁？这个限制会影响哪项判断？'},
  {id:'nextStep',label:'下一步核验或修复',placeholder:'写明待做动作；不要把未来计划写成已完成。'},
  {id:'owner',label:'主答与备份角色',placeholder:'如：设计负责人主答、数据负责人补充（无需真实姓名）。'},
] as const;
// Scaffolds are prompts, not generated answers or evidence verification.
export const DEFENSE_SCAFFOLDS:Record<EvidenceState,{title:string;steps:readonly string[]}>={
  missing:{title:'证据暂缺：先说明能回答到哪里',steps:[
    '直接指出哪一项判断暂时无法确认，不补写数据、访谈或效果。',
    '把现有结论缩小到证据实际支持的范围，说明缺口影响。',
    '提出尚待执行的核验动作、负责角色和完成标准。',
  ]},
  documented:{title:'已有记录：先定位，再解释',steps:[
    '先回答具体问题，再指出可打开的文件版本、页码或表号。',
    '说明统计口径、实际完成的步骤和仍存在的限制。',
    '请另一位成员复核记录与回答是否一致；有记录不等于已验证。',
  ]},
  proposed:{title:'尚未执行：用未来式讲清计划',steps:[
    '明确这是准备实施的方案，不称为已调查、已采纳或已见效。',
    '说明拟解决的问题、计划方法、负责角色和资源条件。',
    '说明将收集什么证据、如何判断继续或调整；未知效果保持未知。',
  ]},
};
export function reviewDefenseDraft(draft:DefenseDraft){
  const missing=DEFENSE_FIELDS.filter(field=>!draft[field.id].trim()).map(field=>field.label);
  const warnings:string[]=[];
  if(draft.evidenceState!=='documented')warnings.push(draft.evidenceState==='proposed'?'当前依据仅为计划，不得说成已调查、已验证或已采纳。':'当前缺少证据。明确不能回答到哪里，再安排补证。');
  const matches=(pattern:RegExp)=>DEFENSE_FIELDS.filter(field=>field.id!=='owner'&&pattern.test(draft[field.id])).map(field=>field.label);
  const statistical=matches(/R[²2]|R\^2|信度|效度|稳健/);
  const sampling=matches(/代表性|加权|异常值/);
  if(statistical.length)warnings.push(`【${statistical.join('、')}】出现拟合或信效度相关表述：请人工核查是否误把单个指标当作整体有效或稳健的证明。提示也可能命中否定句。`);
  if(sampling.length)warnings.push(`【${sampling.join('、')}】出现代表性或修正相关表述：核对实际入样机制、修正依据和未解决的偏差。提示也可能命中否定句。`);
  return {missing,warnings,status:missing.length?'incomplete' as const:'needs_human_review' as const,verified:false as const};
}
export const PITCH_BLOCKS=[
  {id:'problem',label:'问题与决策',prompt:'研究对象、现实矛盾、谁需要做决定',weight:12},
  {id:'design',label:'研究可信度',prompt:'抽样、问卷、实地过程与关键限制',weight:18},
  {id:'insight',label:'关键发现',prompt:'用少量可复核证据解释主洞察',weight:40},
  {id:'action',label:'行动方案',prompt:'人群、负责人、优先级与验证计划',weight:24},
  {id:'close',label:'边界与收束',prompt:'承认限制，回到最初的决策问题',weight:6},
] as const;
export function allocatePitch(total:number,reserve:number,weights:number[]){
  if(!Number.isInteger(total)||total<120||total>1800||!Number.isInteger(reserve)||reserve<0||reserve>90||reserve>=total)throw Error('练习总时长为 120–1800 秒，预留为 0–90 秒。');
  if(weights.length!==PITCH_BLOCKS.length||weights.some(n=>!Number.isFinite(n)||n<1||n>100))throw Error('每段相对权重需为 1–100。');
  const usable=total-reserve,sum=weights.reduce((a,b)=>a+b,0),raw=weights.map(w=>usable*w/sum),seconds=raw.map(Math.floor);
  const order=raw.map((n,i)=>({i,fraction:n-seconds[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
  for(let i=0,remaining=usable-seconds.reduce((a,b)=>a+b,0);i<remaining;i++)seconds[order[i].i]++;
  if(seconds.some(n=>n<1))throw Error('有段落不足 1 秒，请提高该段权重、增加总时长或减少预留；不要省略关键证据与限制。');
  let end=0;return PITCH_BLOCKS.map((block,i)=>({...block,weight:weights[i],seconds:seconds[i],start:end,end:end+=seconds[i]}));
}
export function formatDuration(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function hasDefenseDraftChanges(draft:DefenseDraft|undefined){
  return !!draft&&(draft.evidenceState!=='missing'||DEFENSE_FIELDS.some(field=>!!draft[field.id].trim()));
}
export function defenseExport(cards:readonly {id:string;title:string}[],drafts:Record<string,DefenseDraft>,plan:ReturnType<typeof allocatePitch>,total:number,reserve:number,corpusVersion:string){
  const entries=cards.filter(card=>hasDefenseDraftChanges(drafts[card.id])).map(card=>({cardId:card.id,title:card.title,...drafts[card.id],check:reviewDefenseDraft(drafts[card.id])}));
  return {schema:'evix-defense-practice/v1',corpusVersion,contentClass:'user_authored_practice_not_verified',notice:'训练笔记，不是已核验研究结论、官方规则或可直接提交的答辩稿。依据状态由用户声明；导出前请去标识。',entries,timing:{kind:'user_configured_practice_not_official_rule',total,reserve,plan}};
}
