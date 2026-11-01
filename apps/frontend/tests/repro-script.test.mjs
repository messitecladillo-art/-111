import test from 'node:test';
import assert from 'node:assert/strict';
import {runPlanNode,filterPlanSample} from '../lib/analysis-plan.ts';
import {calculationReceipt} from '../lib/analysis-result-receipt.ts';
import {snapshotRecipe} from '../lib/research-quality.ts';
import {reproScript,scriptText} from '../lib/repro-script.ts';
// Synthetic fixture. The generated scripts were run with pandas 2.3 / SciPy 1.13 / statsmodels 0.14 on a 90-row
// synthetic table and reproduced n, Welch t/F, Mann–Whitney, Kruskal–Wallis, Holm, χ², Cramér V, Pearson CI,
// Spearman and every α item statistic of the system to the printed precision.
const table={headers:['组别','数值','另一"数值"\n第二行','L1','L2','L3'],rows:[['A','1','4','1','2','5'],['A','3','5','2','2','4'],['B','6','7','4','5','2'],['B','2','1','3','3','3'],['A','99','6','5','4','1'],['B','8','','4','4','2']]};
const node=(method,x,y=null,filter=null,scale=null)=>({id:'n',method,x,y,question:'合成',branch:'全部',filter,scale});
const source={title:'满意度/回归: 第 1 版',sourceName:'问卷数据.xlsx',sourceUrl:'',sourceHash:'a'.repeat(64),classification:'simulated'};
async function registered(n,missing=['99'],routing=null){
  const {table:branch,evidence}=filterPlanSample(table,n.filter,missing),result=runPlanNode(branch,n,missing);
  const mapping=routing?{questionnaireHash:'d'.repeat(64),mappingHash:'e'.repeat(64)}:null;
  return snapshotRecipe(result,source,'r1',calculationReceipt(n,table.headers,missing,'c'.repeat(64),mapping,evidence,result.total,routing,null));
}
test('every basic method yields a script whose marks separate safe styling from what decides the conclusion',async()=>{
  for(const n of [node('frequency',0),node('numeric',1),node('groups',0,1),node('crosstab',0,3),node('pearson',1,2),node('spearman',1,2),node('alpha',null,null,null,{columns:[3,4,5],reverse:[5],min:1,max:5,construct:'满意'})]){
    const s=reproScript(await registered(n));
    assert.ok(s&&s.exact&&!s.gaps.length,n.method);
    const styles=s.lines.filter(l=>l.kind==='style'),risks=s.lines.filter(l=>l.kind==='risk');
    assert.ok(styles.some(l=>/^COLOR|^COLORMAP/.test(l.text))&&styles.some(l=>l.text.startsWith('FIG_SIZE'))&&styles.some(l=>l.text.startsWith('FONT_SIZE')),n.method);
    assert.ok(risks.some(l=>l.text.startsWith('MISSING = ["99"]')),n.method);
    assert.ok([...styles,...risks].every(l=>l.note&&!/\n/.test(l.note)),'every mark explains itself');
    assert.ok(s.lines.every(l=>!/\n/.test(l.text)),'one line is one line');
    assert.ok(s.lines.some(l=>/^assert .* == \d+,/.test(l.text)),'the script checks it reached the registered sample');
    assert.match(s.lines.find(l=>l.text.startsWith('df = ')).text,/read_excel/);
  }
});
test('the file form keeps every note as a comment above its line',async()=>{
  const s=reproScript(await registered(node('groups',0,1))),text=scriptText(s);
  assert.match(text,/# ✎ 可以放心改：颜色：[^\n]*\nCOLOR = "#2F6B4F"\n/);
  assert.match(text,/ {4}# ▲ 改了会影响结论：主要检验：Welch t[^\n]*\n {4}print\(stats\.ttest_ind/);
  assert.ok(text.endsWith('\n')&&!text.includes('undefined'));
});
test('labels with quotes and line breaks cannot break out of a string or a comment',async()=>{
  const s=reproScript(await registered(node('pearson',1,2)));
  assert.ok(s.lines.some(l=>l.text==='y = df.iloc[:, 2]  # 第 3 列「另一"数值" 第二行」'));
  assert.ok(s.lines.some(l=>l.text==='ax.set_ylabel("另一\\"数值\\" 第二行", fontsize=FONT_SIZE)'));
  assert.equal(s.fileName,'满意度_回归_第_1_版.py');
});
test('a branch filter and reverse items are spelled out as decisions',async()=>{
  const f=reproScript(await registered(node('numeric',1,null,{column:0,values:['A']})));
  assert.ok(f.lines.some(l=>l.kind==='risk'&&l.text==='FILTER = ["A"]'));
  const a=reproScript(await registered(node('alpha',null,null,null,{columns:[3,4,5],reverse:[5],min:1,max:5,construct:'满意'})));
  assert.ok(a.lines.some(l=>l.kind==='risk'&&l.text==='REVERSE = [5]')&&a.lines.some(l=>l.kind==='risk'&&l.text==='LOW, HIGH = 1, 5'));
});
test('what the script cannot repeat is said, and no sample check is asserted then',async()=>{
  const routing={schema:'row-eligibility/v1',policy:'exclude',totalRows:6,eligibleRows:6,ineligibleRows:0,unknownRows:0,contradictionRows:0,questionCounts:[{questionId:'q1',eligibleAnswered:6,eligibleMissing:0,ineligibleBlank:0,ineligibleAnswered:0,unknownBlank:0,unknownAnswered:0}]};
  const s=reproScript(await registered(node('frequency',0),[],routing));
  assert.equal(s.exact,false);assert.match(s.gaps[0],/跳题/);
  assert.ok(!s.lines.some(l=>l.text.startsWith('assert ')));
  assert.match(scriptText(s),/^# 注意：系统还按问卷跳题逻辑/);
});
test('results without a calculation receipt get no script rather than a guessed one',async()=>{
  const r=await registered(node('frequency',0));
  assert.equal(reproScript({...r,receipt:{...r.receipt,calculation:undefined}}),null);
  assert.equal(reproScript({...r,receipt:undefined}),null);
  assert.equal(reproScript({...r,method:'kmeans'}),null);
});
