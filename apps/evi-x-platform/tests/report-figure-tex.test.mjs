import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createPlanNode,runPlanNode} from '../lib/analysis-plan.ts';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
import {buildChartSnapshot} from '../lib/chart-data.ts';
import {figureFromSnapshot,figureFromResult,REPORT_FIGURE_KINDS,assertFormalFigureCapacity,reportFigureSVG} from '../lib/report-figure.ts';
import {figureTexPreamble,registryMacroNames} from '../lib/report-figure-tex.ts';
import {snapshotRecipe} from '../lib/research-quality.ts';

const style={schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1};
const source={title:'图形回归用例',sourceName:'合成测试',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'};
async function sample(raw,method,x=0,y=null){const table=parseSurveyCsv(raw),node={...createPlanNode(method,'test'),x,y},value=runPlanNode(table,node,[]);return {result:await snapshotRecipe(value,source),snapshot:buildChartSnapshot(table,node,value,[],{dataHash:source.sourceHash,signature:'synthetic',computedAt:'2026-10-17T00:00:00Z'})};}
async function fixtures(){
 const out=[];
 for(const data of [await sample('类别\n甲\n乙\n甲','frequency'),await sample('组,选择\n甲,是\n甲,否\n乙,是\n乙,是\n乙,否','crosstab',0,1),await sample('数值\n0\n1\n2\n3\n100','numeric')])for(const kind of REPORT_FIGURE_KINDS){try{out.push(figureFromSnapshot(data.snapshot,kind,{id:`f-${out.length}`,resultId:data.result.id,resultHash:data.result.resultHash,title:data.result.title}));}catch{ /* Unsupported forms are intentionally absent, never fabricated. */ }}
 return out;
}
function python(figures,visual=style){
 const script='import json,sys\nfrom evix_api.report_figure_template import figure_tex_preamble\nx=json.load(sys.stdin)\njson.dump(figure_tex_preamble(x["figures"],x["style"]),sys.stdout,ensure_ascii=False)';
 const run=spawnSync(process.env.EVIX_PYTHON||(process.platform==='win32'?'python':'python3'),['-B','-X','utf8','-c',script],{input:JSON.stringify({figures,style:visual}),encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:4_000_000,env:{...process.env,PYTHONPATH:fileURLToPath(new URL('../../evi-x-api/src/',import.meta.url)),PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(run.status,0,run.error?.message||run.stderr);return JSON.parse(run.stdout);
}

test('all eight trusted TeX renderers and project colours are byte-identical across TypeScript and Python',async()=>{
 const figures=await fixtures();assert.deepEqual(new Set(figures.map(f=>f.kind)),new Set(REPORT_FIGURE_KINDS));
 for(const paletteId of ['blue','forest','ref_zhihu_14']){const visual={...style,paletteId},front=figureTexPreamble(figures,visual),back=python(figures,visual);assert.deepEqual(back,front);}
 const source=figureTexPreamble(figures,style).join('\n');assert.match(source,/\\ResearchFigure/);assert.match(source,/ResearchFigureColour0\}\{HTML\}\{255D87/);assert.match(source,/\\toprule\[1.5bp\]/);assert.match(source,/\\midrule\[0.75bp\]/);assert.match(source,/\\bottomrule\[1.5bp\]/);assert.match(source,/\\begin\{tabular\}\{ccccc\}/);
});

test('literal labels cannot become body commands or alter trusted macro definitions',async()=>{
 const {result}=await sample('类\n甲\n甲\n乙','frequency'),figure=figureFromResult(result,'bar',1,'literal');
 figure.title='中文 \\input{secret} % & # _ ^ ~ $';figure.labels[0]='^^5cinput{file}';figure.note='\\end{tikzpicture}\n\\write18{no}';
 const out=figureTexPreamble([figure],style),source=out.join('\n');assert.deepEqual(python([figure]),out);
 assert.match(source,/\\textbackslash\{\}input\\\{secret\\\}/);assert.match(source,/\\textasciicircum\{\}\\textasciicircum\{\}5cinput/);
 assert.doesNotMatch(source,/\\input\{secret\}|\\write18\{no\}/);
});

test('binary64 decimal rounding, negative values and constant bins have matching geometry/text',async()=>{
 const {result}=await sample('类\n甲\n甲\n乙','frequency'),base=figureFromResult(result,'horizontal_bar',1,'rounding');
 const figures=[0,1,2,3,6].map(decimals=>({...structuredClone(base),style:{...base.style,decimals},series:[{name:'数值',values:[.125,-.145]}]}));
 const constant=await sample('数值\n7\n7\n7','numeric');figures.push(figureFromSnapshot(constant.snapshot,'histogram',{id:'constant',resultId:constant.result.id,resultHash:constant.result.resultHash,title:'常量分箱'}));
 assert.deepEqual(python(figures),figureTexPreamble(figures,style));
});

test('registry indices and physical capacity fail explicitly rather than inventing a fallback',async()=>{
 assert.deepEqual(registryMacroNames(3),['ResearchFigure0','ResearchFigure1','ResearchFigure2']);assert.throws(()=>registryMacroNames(121));
 const {result}=await sample('类\n甲\n乙\n甲','frequency'),f=figureFromResult(result,'bar',1,'dense');
 f.labels=Array.from({length:21},(_,i)=>`类别${i}`);f.series=[{name:'频数',values:f.labels.map(()=>1)}];
 assert.throws(()=>assertFormalFigureCapacity(f),/分拆/);assert.throws(()=>figureTexPreamble([f],style),/分拆/);assert.throws(()=>reportFigureSVG(f,style),/分拆/);
});
