import { rejectDuplicateMembers } from './questionnaire.ts';

/** Self-declared claim categories, not a progress ladder or evidence certification. */
export type ActionStage = 'unknown' | 'proposed' | 'prototype' | 'feedback' | 'adopted' | 'implemented' | 'observed_change' | 'attributable_effect';
export type ActionField = 'title' | 'finding' | 'audience' | 'owner' | 'artifactVersion' | 'claim' | 'periodScope' | 'evidence' | 'limitations' | 'nextStep' | 'metrics' | 'comparison' | 'counterEvidence';
export type ActionEvidenceCard = { id: string; stage: ActionStage } & Record<ActionField, string>;
export const MAX_ACTION_CARDS = 20;
export const MAX_ACTION_IMPORT_BYTES = 393216;

export const ACTION_STAGES: readonly Readonly<{id: ActionStage; label: string; prompt: string; boundary: string}>[] = Object.freeze([
  {id:'unknown',label:'未声明',prompt:'先确认现有材料究竟支持哪类主张；不清楚时保留未声明。',boundary:'未声明不代表做过试点、取得采纳或产生效果。不要用完成度替代真实性。'},
  {id:'proposed',label:'方案（尚未执行）',prompt:'说明拟解决的问题、负责人、资源条件和未来验收计划。',boundary:'方案只说明准备怎么做，不能写成已有反馈、已采纳或已见效。'},
  {id:'prototype',label:'原型或演示（自报）',prompt:'定位原型版本、展示范围与实际完成的演示记录。',boundary:'原型、概念演示或情景表演不证明真实部署、使用效果或企业采纳。'},
  {id:'feedback',label:'收到反馈（自报）',prompt:'说明反馈对象、时间、接触条件及可定位记录，保留不同意见。',boundary:'反馈或致谢不等于正式采纳；概念意向也不等于真实体验效果。'},
  {id:'adopted',label:'获得采纳（自报）',prompt:'定位谁在何时采纳了哪一部分，并区分意向、批准与实际承诺。',boundary:'采纳、意向或预算批准不等于已经实施，更不能证明实施后产生收益。'},
  {id:'implemented',label:'已经实施（自报）',prompt:'定位执行主体、实际日期、覆盖范围与执行记录。',boundary:'实施记录只支持相应范围内的执行事实；实施不自动等于观察到改善或证明效果。'},
  {id:'observed_change',label:'观察到变化（自报）',prompt:'说明指标定义、基线、观察期、样本口径和变化记录。',boundary:'同期变化可能有其他原因；前后变化本身不证明由该方案造成。'},
  {id:'attributable_effect',label:'效果归因主张（待核验）',prompt:'说明适合问题的因果设计、比较依据、识别假设、不确定性和反证。',boundary:'比较依据和字段齐全仍不证明因果成立。归因需独立核验设计、假设、替代解释和适用范围。'},
].map(stage=>Object.freeze(stage)) as Readonly<{id: ActionStage; label: string; prompt: string; boundary: string}>[]);

export const ACTION_FIELDS: readonly Readonly<{id: ActionField; label: string; placeholder: string; maxLength: number}>[] = Object.freeze([
  {id:'title',label:'行动名称',placeholder:'为这条行动起一个便于辨认的名称。',maxLength:120},
  {id:'finding',label:'对应发现',placeholder:'哪项实际发现或尚待确认的问题支持这条行动？',maxLength:1200},
  {id:'audience',label:'对象与适用范围',placeholder:'适用于哪些人群、机构或场景？不覆盖谁？',maxLength:300},
  {id:'owner',label:'负责角色',placeholder:'填写责任角色，不必填写真实姓名。',maxLength:120},
  {id:'artifactVersion',label:'报告或方案版本（自报）',placeholder:'填写你要对应的版本标签；系统不会打开文件或核对指纹。',maxLength:160},
  {id:'claim',label:'当前有限主张',placeholder:'针对被问到的问题，现在最多能说到哪一步？',maxLength:800},
  {id:'periodScope',label:'时间与覆盖范围',placeholder:'计划或实际发生的时间、地点、对象与范围；未知部分明确保留。',maxLength:300},
  {id:'evidence',label:'证据定位（未核验）',placeholder:'填写真实文件、记录编号、页码或表号；不要填写受访者身份或原始敏感数据。',maxLength:1800},
  {id:'limitations',label:'限制及其影响',placeholder:'哪些部分仍不能确认？它们会怎样缩小当前主张？',maxLength:1000},
  {id:'nextStep',label:'下一步核验或修复',placeholder:'写明尚待执行的动作、负责角色与完成标准。',maxLength:1000},
  {id:'metrics',label:'指标与验收口径',placeholder:'计划阶段写未来验收；已观察变化时写定义、基线、时间窗与数据位置。',maxLength:800},
  {id:'comparison',label:'比较与归因依据',placeholder:'说明与问题相匹配的比较设计、识别假设及不确定性，不只填模型名称。',maxLength:1200},
  {id:'counterEvidence',label:'反证与替代解释',placeholder:'有哪些不利结果、冲突材料或其他原因？如何核对？',maxLength:1000},
].map(field=>Object.freeze(field)) as Readonly<{id: ActionField; label: string; placeholder: string; maxLength: number}>[]);

const STAGES = new Set<string>(ACTION_STAGES.map(stage=>stage.id));
const CARD_KEYS = new Set(['id','stage',...ACTION_FIELDS.map(field=>field.id)]);
const PACKAGE_KEYS = new Set(['schema','contentClass','entries']);
const RESERVED_IDS = new Set(['__proto__','prototype','constructor']);
const SCHEMA = 'evix-action-evidence/v1';
const CONTENT_CLASS = 'user_authored_practice_not_verified';

function safeId(value: unknown): asserts value is string {
  if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)||RESERVED_IDS.has(value))throw Error('行动卡 ID 无效；请使用 1–80 个字母、数字、下划线或连字符。');
}

/** Inspect own data properties without evaluating user getters or methods. */
function ownData(value: unknown, keys: Set<string>): Record<string, unknown> {
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error('行动卡必须是普通 JSON 对象。');
  const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
  if(names.length!==keys.size)throw Error('行动卡字段不完整或包含不支持的字段。');
  const result:Record<string,unknown>={};
  for(const name of names){
    if(typeof name!=='string'||!keys.has(name))throw Error('行动卡包含不支持的字段。');
    const descriptor=descriptors[name];
    if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw Error('行动卡不接受访问器或隐藏字段。');
    Object.defineProperty(result,name,{value:descriptor.value,enumerable:true,writable:true,configurable:true});
  }
  return result;
}

function copyCard(value: unknown): ActionEvidenceCard {
  const input=ownData(value,CARD_KEYS);safeId(input.id);
  if(typeof input.stage!=='string'||!STAGES.has(input.stage))throw Error('成果状态无效；不能把未知状态自动改成已执行。');
  const card={id:input.id,stage:input.stage as ActionStage} as ActionEvidenceCard;
  for(const field of ACTION_FIELDS){
    const text=input[field.id];
    if(typeof text!=='string'||text.length>field.maxLength)throw Error(`${field.label} 必须是文字，且不超过 ${field.maxLength} 个字符。`);
    card[field.id]=text;
  }
  return card;
}

function copyCards(value: unknown, allowEmpty: boolean): ActionEvidenceCard[] {
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('行动卡列表格式无效。');
  const descriptors=Object.getOwnPropertyDescriptors(value),length=Object.getOwnPropertyDescriptor(value,'length')?.value;
  if(!Number.isInteger(length)||length<(allowEmpty?0:1)||length>MAX_ACTION_CARDS)throw Error('行动卡列表必须包含 1–20 条；合并时当前列表可以为空。');
  if(Reflect.ownKeys(descriptors).length!==length+1)throw Error('行动卡列表不能含稀疏项或附加属性。');
  const cards:ActionEvidenceCard[]=[],ids=new Set<string>();
  for(let index=0;index<length;index++){
    const descriptor=descriptors[String(index)];
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw Error('行动卡列表不能含访问器或稀疏项。');
    const card=copyCard(descriptor.value);
    if(ids.has(card.id))throw Error('行动卡 ID 重复，未选择任一副本。');
    ids.add(card.id);cards.push(card);
  }
  return cards;
}

/** UI supplies distinct IDs when creating multiple cards; no hidden clock or RNG. */
export function newActionEvidenceCard(id='action-1'): ActionEvidenceCard {
  safeId(id);const card={id,stage:'unknown'} as ActionEvidenceCard;
  for(const field of ACTION_FIELDS)card[field.id]='';
  return card;
}

export function reviewActionEvidence(value: ActionEvidenceCard): {missing:string[];warnings:string[];status:'incomplete'|'needs_human_review';verified:false} {
  const card=copyCard(value),required=new Set<ActionField>(['title','finding','audience','owner','artifactVersion','claim','periodScope','limitations','nextStep']);
  if(card.stage!=='unknown'&&card.stage!=='proposed')required.add('evidence');
  if(['proposed','observed_change','attributable_effect'].includes(card.stage))required.add('metrics');
  if(card.stage==='attributable_effect'){required.add('comparison');required.add('counterEvidence');}
  const missing=ACTION_FIELDS.filter(field=>required.has(field.id)&&!card[field.id].trim()).map(field=>field.label);
  if(card.stage==='unknown')missing.unshift('成果状态（请明确选择）');
  const stage=ACTION_STAGES.find(stage=>stage.id===card.stage)!;
  const warnings=[stage.boundary,'状态、版本标签和证据定位均由用户填写；系统未打开或核验来源，字段齐全也不代表真实、有效或通过质量门禁。'];
  const flagged=(pattern:RegExp)=>ACTION_FIELDS.filter(field=>field.id!=='owner'&&pattern.test(card[field.id])).map(field=>field.label);
  const metrics=flagged(/R[²2]|R\^2|\balpha\b|Cronbach|信度|效度|稳健|显著/i);
  if(metrics.length)warnings.push(`【${metrics.join('、')}】有统计指标相关用语：请核查是否把指标当作代表性、实施或效果归因的证明。这里只提示位置，也可能命中否定句或引用。`);
  const action=flagged(/采纳|实施|试点|上线|落地|见效|因果|导致|证明/);
  if(action.length)warnings.push(`【${action.join('、')}】有实施或归因相关用语：请逐句与自报状态和记录核对。关键词不能判断事件真假，可能命中计划、否定或引用，也不能穷尽风险。`);
  return {missing,warnings,status:missing.length?'incomplete':'needs_human_review',verified:false};
}

export function actionEvidenceExport(cards: ActionEvidenceCard[]) {
  const value={schema:SCHEMA,contentClass:CONTENT_CLASS,entries:copyCards(cards,false)};
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_ACTION_IMPORT_BYTES)throw Error('行动卡导出包超过 384 KiB，请先减少内容；未截断或删除任何卡片。');
  return value;
}

export function parseActionEvidenceImport(bytes: Uint8Array): ActionEvidenceCard[] {
  if(!(bytes instanceof Uint8Array)||!ArrayBuffer.isView(bytes))throw Error('请选择行动证据卡 JSON 文件。');
  // Intrinsic length/copy prevent custom byteLength getters from bypassing limits.
  const typedArrayPrototype=Object.getPrototypeOf(Uint8Array.prototype);
  const length=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteLength')!.get!.call(bytes) as number;
  if(length<1||length>MAX_ACTION_IMPORT_BYTES)throw Error('行动卡文件为空或超过 384 KiB，当前卡片未改动。');
  const snapshot=new Uint8Array(length);Uint8Array.prototype.set.call(snapshot,bytes);
  let text:string,parsed:unknown;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(snapshot);parsed=JSON.parse(text);}catch{throw Error('行动卡文件必须是有效 UTF-8 JSON。');}
  rejectDuplicateMembers(text);
  const pack=ownData(parsed,PACKAGE_KEYS);
  if(pack.schema!==SCHEMA||pack.contentClass!==CONTENT_CLASS)throw Error('文件不是当前版本的未核验行动证据卡；不能导入审批或其他练习包。');
  return copyCards(pack.entries,false);
}

/** Pure merge. The caller must preview and explicitly confirm before applying it. */
export function mergeActionEvidence(current: ActionEvidenceCard[], incoming: ActionEvidenceCard[]): ActionEvidenceCard[] {
  const merged=copyCards(current,true),updates=copyCards(incoming,false),positions=new Map(merged.map((card,index)=>[card.id,index]));
  for(const card of updates){const index=positions.get(card.id);if(index===undefined){positions.set(card.id,merged.length);merged.push(card);}else merged[index]=card;}
  if(merged.length>MAX_ACTION_CARDS)throw Error('合并后超过 20 条行动卡；当前内容未更改，请先导出备份并自行整理。');
  return merged;
}
