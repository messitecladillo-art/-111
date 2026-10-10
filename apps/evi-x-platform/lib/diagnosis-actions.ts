/** Deterministic, proposed brief transfer only. No evidence certification or control-plane mutation. */
import { PROJECT_STAGES, type ProjectStage } from '../data/control-plane-contract.generated.ts';
import { parseQuestionnaire, type Questionnaire } from './questionnaire.ts';

type DiagnosisAction = { title: string; target: '#diagnose'|'#rules'|'#design'|'#analysis'|'#workspace'; input: string; output: string; review: string };
const ACTION_ENTRIES: Record<string, DiagnosisAction> = {
  problem_underdefined: {title:'明确待决策问题',target:'#diagnose',input:'实际决策主体、选项与期限',output:'具体的问题陈述，再重新诊断',review:'确认问题可被真实调研回答，不预设结论'},
  decision_owner_unclear: {title:'锁定决策主体',target:'#diagnose',input:'真实委托方或职能角色',output:'明确到角色的决策主体',review:'不能把泛称机构当作已获得合作或授权'},
  population_too_broad: {title:'细化调查对象',target:'#design',input:'自报目标人群与可接触对象',output:'纳入、排除条件的拟议问卷简介',review:'目标总体与实际招募样本分开，不能自动声称代表性'},
  geography_unbounded: {title:'补齐地理边界',target:'#design',input:'实际可开展调查的城市或场景',output:'明确地理范围的拟议问卷简介',review:'研究范围不等于可外推范围'},
  evidence_missing: {title:'规划探索与预试',target:'#design',input:'真实问题与尚缺的证据',output:'待实施的研究简介与预试计划',review:'计划不是已完成田野、有效问卷或实际数据'},
  evidence_not_verified: {title:'复核证据来源与口径',target:'#analysis',input:'已获授权的数据、字典与来源记录',output:'本页计算的汇总及可核对的限制',review:'上传前审查隐私；计算结果不认证原始数据真实'},
  stage_evidence_mismatch: {title:'核对当前证据缺口',target:'#workspace',input:'自报阶段及实际已有材料',output:'所需材料与当前权威状态的对照',review:'不自动降级或推进状态，不把自报成熟度当作 Gate'},
  rule_or_problem_gate_open: {title:'锁定本项目适用规则',target:'#rules',input:'届次、组别、地区、赛道、赛段',output:'适用规则、来源与未知项',review:'旧届或经验材料不能代替当前官方通知'},
  method_fit_unassessed: {title:'审查问卷与分析用途',target:'#design',input:'研究问题、变量、题目与拟用方法',output:'逐题用途映射和结构检查清单',review:'结构检查不能认证信度、效度、伦理或正式发放资格'},
};
/** Null prototype excludes inherited names; each descriptor is fixed to its internal module. */
export const DIAGNOSIS_ACTIONS: Readonly<Record<string, Readonly<DiagnosisAction>>> = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(Object.entries(ACTION_ENTRIES).map(([key,value])=>[key,Object.freeze(value)]))));

export type DiagnosisBriefInput = {title:string; problem:string; decisionOwner:string; population:string; geography:string; stage:ProjectStage; evidenceStatus:'none'|'proposed'|'partial'|'verified'};
export type DiagnosisBriefSource = {id:string; input:DiagnosisBriefInput};
export type BriefField = 'title'|'population'|'geography'|'objective';
export type BriefProposal = {sourceId:string; sourceKey:string; baseKey:string; fields:Array<{key:BriefField;label:string;before:string;after:string;max:number;error:string}>};
const FIELDS: ReadonlyArray<{key:BriefField;label:string;max:number}> = [{key:'title',label:'问卷名称',max:160},{key:'population',label:'调查对象与纳入条件',max:160},{key:'geography',label:'地理范围',max:160},{key:'objective',label:'决策目标',max:600}];

/** Exact canonical JSON, not a cryptographic hash. Kept in page memory, not a trust certificate. */
function canonical(value: unknown): string {
  let nodes=0;
  function encode(v:unknown,depth:number):string {
    if(++nodes>20000||depth>16)throw new Error('输入结构超出范围。');
    if(v===null||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='string'){if(v.length>300000)throw new Error('输入文本超出范围。');return JSON.stringify(v);}
    if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
    if(!v||typeof v!=='object')throw new Error('输入必须为普通 JSON 数据。');
    if(Object.getOwnPropertySymbols(v).length)throw new Error('输入不能包含符号字段。');
    if(Array.isArray(v)){
      if(v.length>2000||Object.keys(v).length!==v.length||Object.getOwnPropertyNames(v).length!==v.length+1)throw new Error('输入数组无效。');
      return '['+Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))throw new Error('输入不能包含空项或访问器。');return encode(d.value,depth+1);}).join(',')+']';
    }
    if(Object.getPrototypeOf(v)!==Object.prototype)throw new Error('输入必须为普通对象。');
    return '{'+Object.keys(v).sort().map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw new Error('输入不能包含访问器。');return JSON.stringify(k)+':'+encode(d.value,depth+1);}).join(',')+'}';
  }
  const text=encode(value,0);if(new TextEncoder().encode(text).length>1_000_000)throw new Error('输入总大小超出范围。');return text;
}
function exactKeys(value:Record<string,unknown>,keys:string[],label:string){if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw new Error(`${label} 字段缺失或包含未知字段。`);}
function sourceCopy(raw:DiagnosisBriefSource):DiagnosisBriefSource {
  const source=JSON.parse(canonical(raw));
  if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('诊断来源无效。');
  exactKeys(source,['id','input'],'诊断来源');
  const input=source.input;
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('诊断输入无效。');
  exactKeys(input,['title','problem','decisionOwner','population','geography','stage','evidenceStatus'],'诊断输入');
  function text(v:unknown,max:number,label:string){if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/u.test(v.replace(/\r?\n|\t/g,'')))throw new Error(`${label} 为空、过长或含控制字符。`);}
  text(source.id,120,'来源版本');
  for(const [key,max] of [['title',120],['problem',1000],['decisionOwner',120],['population',200],['geography',120]] as const)text(input[key],max,key);
  if(!PROJECT_STAGES.includes(input.stage)||!['none','proposed','partial','verified'].includes(input.evidenceStatus))throw new Error('自报阶段或证据成熟度不支持。');
  return source as DiagnosisBriefSource;
}
function draftCopy(d:Questionnaire):Questionnaire{return parseQuestionnaire(canonical(d));}

export function prepareDiagnosisBrief(source:DiagnosisBriefSource,currentDesign:Questionnaire):BriefProposal {
  const safeSource=sourceCopy(source),design=draftCopy(currentDesign),input=safeSource.input;
  const candidates={title:input.title,population:input.population,geography:input.geography,objective:`决策主体：${input.decisionOwner}\n决策问题：${input.problem}`};
  return {sourceId:safeSource.id,sourceKey:canonical(safeSource),baseKey:canonical(design),fields:FIELDS.map(field=>({...field,before:design[field.key],after:candidates[field.key],error:candidates[field.key].length>field.max?`诊断内容为 ${candidates[field.key].length} 字，超过此字段 ${field.max} 字上限；未截断，请修改诊断输入或不选择此字段。`:''}))};
}

export function applyDiagnosisBrief(proposal:BriefProposal,source:DiagnosisBriefSource,currentDesign:Questionnaire,selectedFields:readonly BriefField[]):Questionnaire {
  const expected=prepareDiagnosisBrief(source,currentDesign);
  if(canonical(proposal)!==canonical(expected))throw new Error('诊断来源、问卷或提案已变化；请重新预览，未应用任何修改。');
  // Do not invoke caller-supplied array methods, iterators or accessors during validation/application.
  const selection:unknown=JSON.parse(canonical(selectedFields));
  if(!Array.isArray(selection)||selection.length===0||selection.length>FIELDS.length||new Set(selection).size!==selection.length||selection.some(k=>!FIELDS.some(f=>f.key===k)))throw new Error('请选择不重复的有效简介字段，未应用任何修改。');
  const next=draftCopy(currentDesign);
  for(const field of expected.fields.filter(f=>selection.includes(f.key))){if(field.error)throw new Error(field.error);next[field.key]=field.after;}
  return draftCopy(next);
}
