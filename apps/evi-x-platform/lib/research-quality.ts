import type { RecipeResult } from './analysis-recipes.ts';

export type ResultSnapshot = {
  id: string; title: string; sourceName: string; sourceUrl: string; sourceHash: string; resultHash: string;
  classification: 'public' | 'user_provided' | 'simulated'; method: string; n: number; total: number;
  headers: string[]; rows: (string | number | null)[][]; metrics: { label: string; value: number | null }[];
  warnings: string[];
};
export type ResearchFinding = {
  id: string; title: string; question: string; evidenceIds: string[]; interpretation: string;
  alternatives: string; scope: string; action: string; status: 'draft' | 'confirmed';
  confirmedHashes: Record<string, string>;
};
export type ResearchQuality = { version: 1; results: ResultSnapshot[]; findings: ResearchFinding[] };
export type ReportBlock = {
  id: string; kind: 'paragraph' | 'chart' | 'table' | 'formula' | 'citation' | 'callout';
  text: string; evidenceId: string; valueColumn: number;
};
export const QUALITY_LAYOUTS = ['cover', 'problem', 'chart', 'comparison', 'segments', 'insight', 'action', 'closing'] as const;
export type QualityLayout = typeof QUALITY_LAYOUTS[number];
export type SlideObject = {
  id: string; kind: 'text' | 'chart' | 'table' | 'vector' | 'shape';
  x: number; y: number; width: number; height: number; rotation: number; opacity: number;
  locked: boolean; groupId: string;
  text: string; fontSize: number; color: string; align: 'left' | 'center' | 'right';
  bold?:boolean; sourceBlockId?:string;
  evidenceId: string; valueColumn: number; chartType: 'bar' | 'line' | 'pie';
  assetId: string; shape: 'rect' | 'ellipse' | 'line';
};

/** A full competition report carries dozens of figures and tables, each backed by one registered result. */
export const QUALITY_LIMITS = { results: 120, findings: 40 } as const;
const MAX_RESULTS = QUALITY_LIMITS.results, MAX_FINDINGS = QUALITY_LIMITS.findings;
const fail = () => { throw Error('研究成果结构或引用无效。'); };
export function qualityRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key) || !('value' in descriptors[key]) || !descriptors[key].enumerable)) return fail();
  return value as Record<string, unknown>;
}
export function qualityText(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Surrogate}]/u.test(value)) return fail();
  return value;
}
function finite(value: unknown, min: number, max: number, integral = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integral && !Number.isInteger(value))) return fail();
  return value;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return fail(); return value; }
function list<T>(value: unknown, max: number, parser: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) return fail(); return value.map(parser);
}
function unique<T extends { id: string }>(items: T[]): T[] { if (new Set(items.map(x => x.id)).size !== items.length) return fail(); return items; }
const cell = (value: unknown): string | number | null => value === null ? null : typeof value === 'number' ? finite(value, -1e100, 1e100) : qualityText(value, 2000);

export function parseResultSnapshot(value: unknown): ResultSnapshot {
  const x = qualityRecord(value, ['id','title','sourceName','sourceUrl','sourceHash','resultHash','classification','method','n','total','headers','rows','metrics','warnings']);
  const headers = list(x.headers, 30, v => qualityText(v, 160, true));
  if (!headers.length || !['public','user_provided','simulated'].includes(x.classification as string)) return fail();
  const rows = list(x.rows, 400, v => { const row = list(v, headers.length, cell); if (row.length !== headers.length) return fail(); return row; });
  const n = finite(x.n, 0, 5000, true), total = finite(x.total, n, 5000, true);
  const sourceUrl = qualityText(x.sourceUrl, 512);
  if (sourceUrl && (!/^https:\/\/[^\s<>]+$/.test(sourceUrl)||/[\u0085\ufeff]/u.test(sourceUrl))) return fail();
  return { id:qualityText(x.id,80,true), title:qualityText(x.title,150,true), sourceName:qualityText(x.sourceName,240,true), sourceUrl,
    sourceHash:hash(x.sourceHash), resultHash:hash(x.resultHash), classification:x.classification as ResultSnapshot['classification'], method:qualityText(x.method,80,true), n,total,headers,rows,
    metrics:list(x.metrics,40,v=>{const m=qualityRecord(v,['label','value']);return {label:qualityText(m.label,160,true),value:m.value===null?null:finite(m.value,-1e100,1e100)};}),
    warnings:list(x.warnings,30,v=>qualityText(v,1000)) };
}
export function parseResearchQuality(value: unknown): ResearchQuality {
  const x=qualityRecord(value,['version','results','findings']); if(x.version!==1)return fail();
  const results=unique(list(x.results,MAX_RESULTS,parseResultSnapshot));
  const findings=unique(list(x.findings,MAX_FINDINGS,v=>{
    const f=qualityRecord(v,['id','title','question','evidenceIds','interpretation','alternatives','scope','action','status','confirmedHashes']);
    const evidenceIds=list(f.evidenceIds,MAX_RESULTS,e=>qualityText(e,80,true));
    if(new Set(evidenceIds).size!==evidenceIds.length||evidenceIds.some(e=>!results.some(r=>r.id===e))||!['draft','confirmed'].includes(f.status as string))return fail();
    const h=qualityRecord(f.confirmedHashes,evidenceIds), confirmedHashes:Record<string,string>={};
    for(const [key,val] of Object.entries(h)){ if(['__proto__','constructor','prototype'].includes(key))return fail();confirmedHashes[key]=hash(val); }
    if(f.status==='confirmed'&&(!evidenceIds.length||evidenceIds.some(e=>!confirmedHashes[e])))return fail();
    return {id:qualityText(f.id,80,true),title:qualityText(f.title,150),question:qualityText(f.question,1000),evidenceIds,
      interpretation:qualityText(f.interpretation,3000),alternatives:qualityText(f.alternatives,1500),scope:qualityText(f.scope,1500),action:qualityText(f.action,1500),
      status:f.status as ResearchFinding['status'],confirmedHashes};
  }));
  return {version:1,results,findings};
}
export function parseReportBlock(value:unknown):ReportBlock {
  const b=qualityRecord(value,['id','kind','text','evidenceId','valueColumn']);
  if(!['paragraph','chart','table','formula','citation','callout'].includes(b.kind as string))return fail();
  return {id:qualityText(b.id,80,true),kind:b.kind as ReportBlock['kind'],text:qualityText(b.text,12000),evidenceId:qualityText(b.evidenceId,80),valueColumn:finite(b.valueColumn,0,29,true)};
}
export function parseSlideObject(value:unknown):SlideObject {
  const o=qualityRecord(value,['id','kind','x','y','width','height','rotation','opacity','locked','groupId','text','fontSize','color','align','evidenceId','valueColumn','chartType','assetId','shape','bold','sourceBlockId']);
  if(Object.hasOwn(o,'bold')&&typeof o.bold!=='boolean')return fail();
  const optional={...(Object.hasOwn(o,'bold')?{bold:o.bold as boolean}:{}),...(Object.hasOwn(o,'sourceBlockId')?{sourceBlockId:qualityText(o.sourceBlockId,80,true)}:{})};
  if(!['text','chart','table','vector','shape'].includes(o.kind as string)||typeof o.locked!=='boolean'||!['left','center','right'].includes(o.align as string)||!['bar','line','pie'].includes(o.chartType as string)||!['rect','ellipse','line'].includes(o.shape as string)||typeof o.color!=='string'||!/^#[a-fA-F0-9]{6}$/.test(o.color))return fail();
  if((o.kind==='vector'||o.assetId!=='')&&!['mosaic-edge','focus-loop','path-ribbon'].includes(o.assetId as string))return fail();
  const x=finite(o.x,0,100),y=finite(o.y,0,100),width=finite(o.width,.1,100),height=finite(o.height,.1,100);
  if(x+width>100.001||y+height>100.001)return fail();
  return {id:qualityText(o.id,80,true),kind:o.kind as SlideObject['kind'],x,y,width,height,rotation:finite(o.rotation,-180,180),opacity:finite(o.opacity,0,1),locked:o.locked,groupId:qualityText(o.groupId,80),text:qualityText(o.text,6000),fontSize:finite(o.fontSize,10,72),color:o.color,align:o.align as SlideObject['align'],evidenceId:qualityText(o.evidenceId,80),valueColumn:finite(o.valueColumn,0,29,true),chartType:o.chartType as SlideObject['chartType'],assetId:qualityText(o.assetId,80),shape:o.shape as SlideObject['shape'],...optional};
}
export function makeSlideObject(kind:SlideObject['kind'],patch:Partial<SlideObject>={}):SlideObject {
  return parseSlideObject({id:crypto.randomUUID(),kind,x:7,y:25,width:60,height:50,rotation:0,opacity:1,locked:false,groupId:'',text:'',fontSize:22,color:'#255D87',align:'left',evidenceId:'',valueColumn:1,chartType:'bar',assetId:'',shape:'rect',...patch});
}
export function resultPayload(result:ResultSnapshot) {
  const {resultHash: _resultHash,...payload}=result; void _resultHash; return payload;
}
export async function digestText(value:string):Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function snapshotRecipe(result:Omit<RecipeResult,'method'> & {method:string},source:Pick<ResultSnapshot,'title'|'sourceName'|'sourceUrl'|'sourceHash'|'classification'>,id=crypto.randomUUID()):Promise<ResultSnapshot> {
  const candidate=parseResultSnapshot({id,...source,resultHash:'0'.repeat(64),method:result.method,n:result.n,total:result.total,headers:result.headers,rows:result.rows,metrics:result.metrics,warnings:result.warnings});
  return {...candidate,resultHash:await digestText(JSON.stringify(resultPayload(candidate)))};
}
export async function verifyResearchQuality(quality:ResearchQuality):Promise<void> {
  const parsed=parseResearchQuality(quality);
  for(const r of parsed.results)if(await digestText(JSON.stringify(resultPayload(r)))!==r.resultHash)throw Error('分析结果指纹不一致，请重新登记计算结果。');
}
export function findingNeedsReview(finding:ResearchFinding,quality:ResearchQuality):boolean {
  return finding.status!=='confirmed'||finding.evidenceIds.some(id=>finding.confirmedHashes[id]!==quality.results.find(r=>r.id===id)?.resultHash);
}
/** Exact wording snapshot; data fingerprints remain in confirmedHashes. */
export function findingSignature(finding:ResearchFinding):string {
  return JSON.stringify([finding.title,finding.question,finding.evidenceIds,finding.interpretation,finding.alternatives,finding.scope,finding.action]);
}
export function findingReportBody(finding:ResearchFinding):string {
  return [finding.question,finding.interpretation,finding.alternatives,finding.scope,finding.action].filter(Boolean).join('\n\n');
}
export function confirmFinding(finding:ResearchFinding,quality:ResearchQuality):ResearchFinding {
  if(!finding.title.trim()||!finding.question.trim()||!finding.interpretation.trim()||!finding.scope.trim()||!finding.evidenceIds.length)throw Error('请填写发现标题、研究问题、解释、适用范围并关联结果。');
  const confirmedHashes:Record<string,string>={};for(const id of finding.evidenceIds){const result=quality.results.find(r=>r.id===id);if(!result)throw Error('关联结果不存在。');confirmedHashes[id]=result.resultHash;}
  return {...finding,status:'confirmed',confirmedHashes};
}
export function chartData(result:ResultSnapshot,valueColumn=1):{labels:string[];values:number[]} {
  if(valueColumn<1||valueColumn>=result.headers.length)throw Error('请选择有效数值列。');
  const labels:string[]=[],values:number[]=[];
  for(const row of result.rows){if(typeof row[valueColumn]!=='number')throw Error('图表所选列含缺失或非数值，请改用表格。');labels.push(result.method==='crosstab'?String(row[0])+' · '+String(row[1]):String(row[0]));values.push(row[valueColumn] as number);}
  if(!labels.length||labels.length>50)throw Error('图表需要 1–50 个有效类别。');
  return {labels,values};
}
export function resultFor(quality:ResearchQuality|undefined,id:string):ResultSnapshot {
  const result=quality?.results.find(r=>r.id===id);if(!result)throw Error('成果引用的分析结果不存在。');return result;
}
export function defaultFinding(result:ResultSnapshot):ResearchFinding {
  return {id:crypto.randomUUID(),title:result.title,question:'',evidenceIds:[result.id],interpretation:'',alternatives:'',scope:`当前有效样本 n=${result.n}，总记录 ${result.total}。`,action:'',status:'draft',confirmedHashes:{}};
}
