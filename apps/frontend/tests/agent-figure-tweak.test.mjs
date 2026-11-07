import test from 'node:test';
import assert from 'node:assert/strict';
import {runPlanNode,filterPlanSample} from '../lib/analysis-plan.ts';
import {calculationReceipt} from '../lib/analysis-result-receipt.ts';
import {snapshotRecipe} from '../lib/research-quality.ts';
import {createEditorContent,parseEditorContent} from '../lib/editor-model.ts';
import {appendQualityResult} from '../lib/quality-layouts.ts';
import {applyFigureChange,figureOf,parseFigureRequest} from '../lib/agent/figure-tweak.ts';
// Synthetic fixture only.
const table={headers:['渠道','满意度','组别'],rows:[['校园','4','甲'],['社区','5','乙'],['校园','3','甲'],['校园','4','乙'],['社区','2','甲'],['线上','5','乙']]};
async function registered(method,x,y=null){
  const node={id:'n',method,x,y,question:'合成',branch:'全部',filter:null,scale:null};
  const {table:t,evidence}=filterPlanSample(table,null,[]),result=runPlanNode(t,node,[]);
  return snapshotRecipe(result,{title:'受访者渠道',sourceName:'合成.csv',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'},'r1',calculationReceipt(node,table.headers,[],'c'.repeat(64),null,evidence,result.total,null,null));
}
const withResult=async(method='frequency',x=0,y=null)=>appendQualityResult(createEditorContent(),await registered(method,x,y));

test('a sentence about a figure is read into a change; other sentences are left to the agent',()=>{
  assert.deepEqual(parseFigureRequest('把图换成横向条形图，配色换成青色'),{change:{kind:'horizontal_bar',paletteId:'teal'},unsupported:[]});
  assert.deepEqual(parseFigureRequest('去掉数值标签，保留 1 位小数').change,{showLabels:false,decimals:1});
  assert.deepEqual(parseFigureRequest('显示网格线，加上边框').change,{showGrid:true,showBorder:true});
  assert.equal(parseFigureRequest('配色换成晴雾五色').change.paletteId,'ref_zhihu_02');
  assert.equal(parseFigureRequest('下一步做什么'),null);
  assert.equal(parseFigureRequest('/图表'),null);
});
test('what a figure does not carry is said, not pretended',()=>{
  const big=parseFigureRequest('把图的字号调大一些');
  assert.deepEqual(big.change,{});assert.match(big.unsupported[0],/字号/);
  assert.match(parseFigureRequest('配色换成红色').unsupported[0],/研究蓝/);
  assert.match(parseFigureRequest('换成箱线图').unsupported[0],/原始分布/);
});
test('a change lands on the report figure as one checked step, with what changed',async()=>{
  const content=await withResult();
  const first=applyFigureChange(content,'r1',{kind:'horizontal_bar',showLabels:false});
  assert.deepEqual(first.changes,['图型 柱形图 → 条形图','隐藏数值标签']);
  assert.equal(first.content.version,3);
  assert.equal(figureOf(first.content,first.content.quality.results[0]).kind,'horizontal_bar');
  assert.deepEqual(parseEditorContent(JSON.parse(JSON.stringify(first.content))),first.content,'the draft still parses');
  const second=applyFigureChange(first.content,'r1',{kind:'bar',paletteId:'teal'});
  assert.equal(second.figure.id,first.figure.id,'the same figure is changed, not a new one added');
  assert.equal(second.content.figures.length,1);
  assert.equal(second.figure.style.showLabels,false,'its other settings carry over');
  assert.equal(second.content.visualStyle.paletteId,'teal');
  assert.match(second.changes.join('；'),/整份报告的图一起换/);
});
test('a new kind shows the same values the figure showed, not the default column',async()=>{
  const content=await withResult();
  const counts=applyFigureChange(content,'r1',{kind:'bar'});
  // Start from a figure of the counts column (the default for this result is the percentage column).
  const start={...content,version:3,visualStyle:{schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1},
    figures:[{...counts.figure,series:[{name:'频数',values:content.quality.results[0].rows.map(r=>r[1])}],yLabel:'频数'}]};
  const turned=applyFigureChange(parseEditorContent(JSON.parse(JSON.stringify(start))),'r1',{kind:'horizontal_bar'});
  assert.equal(turned.figure.series[0].name,'频数');
});
test('nothing to change changes nothing; an impossible kind or a fixed frame is refused in words',async()=>{
  const content=await withResult();
  const same=applyFigureChange(content,'r1',{showLabels:true});
  assert.deepEqual(same.changes,[]);assert.equal(same.content,content);
  assert.throws(()=>applyFigureChange(content,'r1',{kind:'grouped_bar'}),/画不成分组柱形图：该图形需要交叉表/);
  assert.throws(()=>applyFigureChange(content,'nope',{kind:'bar'}),/不在当前报告/);
  const framed={...content,reportFrame:{status:'approved'}};
  assert.throws(()=>applyFigureChange(framed,'r1',{paletteId:'teal'}),/页框配色已经定稿/);
});
test('a cross-tab can switch between its own kinds',async()=>{
  const content=await withResult('crosstab',0,2);
  const stacked=applyFigureChange(content,'r1',{kind:'percent_stacked'});
  assert.equal(stacked.figure.kind,'percent_stacked');
  assert.equal(applyFigureChange(stacked.content,'r1',{kind:'heatmap'}).figure.kind,'heatmap');
});
