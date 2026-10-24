/** Versioned, compact client-supplied provenance; NOT a server attestation of raw data or administration. */
export type ResearchBinding={questionId:string;variable:string;questionHash:string;column:number;type:'single'|'multi'|'likert'|'number'|'text';representation:'code'|'label';construct:string;min:number|null;max:number|null;reverse:boolean;conditional:boolean};
export type ResearchLink={schema:'questionnaire-mapping/v1';questionnaireHash:string;interpretationHash:string;mappingHash:string;bindings:ResearchBinding[]};
function exact(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error('问卷关联字段缺失或包含未知字段。');
  return value as Record<string,unknown>;
}
function hash(x:unknown):string{if(typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x))throw Error('问卷关联指纹无效。');return x;}
function line(x:unknown,max:number):string{if(typeof x!=='string'||x.length>max||/[\u0000-\u001f\u007f]/u.test(x))throw Error('关联字段不是受限单行文字。');return x;}
export function parseResearchLink(value:unknown,allowConditional=false):ResearchLink{
  const x=exact(value,['schema','questionnaireHash','interpretationHash','mappingHash','bindings']);
  if(x.schema!=='questionnaire-mapping/v1'||!Array.isArray(x.bindings)||x.bindings.length<1||x.bindings.length>30)throw Error('关联版本或所选题目数量无效。');
  const bindings=x.bindings.map(v=>{
    const b=exact(v,['questionId','variable','questionHash','column','type','representation','construct','min','max','reverse','conditional']);
    const questionId=line(b.questionId,64),variable=line(b.variable,32),construct=line(b.construct,120);
    if(!/^[A-Za-z0-9_-]+$/.test(questionId)||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(variable)||!Number.isSafeInteger(b.column)||(b.column as number)<0||(b.column as number)>79||typeof b.type!=='string'||!['single','likert','number'].includes(b.type)||typeof b.representation!=='string'||!['code','label'].includes(b.representation)||typeof b.reverse!=='boolean'||typeof b.conditional!=='boolean'||(!allowConditional&&b.conditional))throw Error('当前证据仅支持已对应、无跳题的单选/量表/数值题。');
    for(const bound of [b.min,b.max])if(bound!==null&&(typeof bound!=='number'||!Number.isFinite(bound)||Math.abs(bound)>1e9))throw Error('关联题目范围无效。');
    if(b.type!=='single'&&b.representation!=='code')throw Error('数值或量表须使用数值编码。');
    if(b.type!=='likert'&&b.reverse)throw Error('非量表不能反向计分。');
    if(b.type==='likert'&&(!Number.isInteger(b.min)||!Number.isInteger(b.max)||(b.max as number)<=(b.min as number)||(b.max as number)-(b.min as number)>14))throw Error('量表须使用 2–15 个整数计分点。');
    if(b.type==='number'&&b.min!==null&&b.max!==null&&(b.min as number)>(b.max as number))throw Error('数值范围次序无效。');
    return {...b,questionId,variable,construct,questionHash:hash(b.questionHash)} as ResearchBinding;
  });
  if(new Set(bindings.map(b=>b.column)).size!==bindings.length||new Set(bindings.map(b=>b.questionId)).size!==bindings.length||new Set(bindings.map(b=>b.variable.toLowerCase())).size!==bindings.length)throw Error('关联列、题目或变量存在重复。');
  return {schema:'questionnaire-mapping/v1',questionnaireHash:hash(x.questionnaireHash),interpretationHash:hash(x.interpretationHash),mappingHash:hash(x.mappingHash),bindings};
}
