import test from 'node:test';
import assert from 'node:assert/strict';
import {runRecipe,averageRanks,pairedCorrelation,exportRecipeResult} from '../lib/analysis-recipes.ts';
import {parseSurveyCsv} from '../lib/survey-analysis.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const r=(method,x=0,y=1)=>({id:'test',method,x,y,question:'synthetic fixture'});
// Independent SciPy 1.13.1 + exact-rational oracle, not fieldwork.
const mixed=parseSurveyCsv('group,x,y,choice\nA,1,2,Yes\nA,2,1,No\nA,2,4,Yes\nB,4,3,No\nB,5,5,No\nB,,6,Yes\nA,7,,Yes\n,8,8,Yes\nA,no,3,NA\nB,99,99,Yes');
test('recipes use exact analysis-specific n and Type7 descriptives',()=>{
 const missing=['NA','99'],f=runRecipe(mixed,r('frequency',3),missing);assert.equal(f.n,9);assert.equal(f.missingRows,1);near(f.rows[0][2],100*6/9);
 const d=runRecipe(mixed,r('numeric',1),missing);assert.equal(d.n,7);assert.equal(d.excluded,3);near(d.metrics[0].value,29/7);near(d.rows[1][1],Math.sqrt(50/7));assert.equal(d.rows[3][1],2);assert.equal(d.rows[5][1],6);
 const g=runRecipe(mixed,r('groups',0,1),missing);assert.equal(g.n,6);assert.equal(g.rows[0][1],4);near(g.rows[0][2],3);near(g.rows[1][2],4.5);
});
test('Pearson and tied Spearman agree with independent mixed-data oracle',()=>{
 const p=runRecipe(mixed,r('pearson',1,2),['NA','99']),s=runRecipe(mixed,r('spearman',1,2),['NA','99']);assert.equal(p.n,6);assert.equal(p.missingRows,3);assert.equal(p.invalidRows,1);near(p.metrics[0].value,.8941854212452625);near(s.metrics[0].value,.8116794499134278);
 assert.deepEqual(averageRanks([1,2,2,4,5]),[1,2.5,2.5,4,5]);near(pairedCorrelation(averageRanks([1,2,2,4,5]),averageRanks([5,1,3,2,4])),-.20519567041703085);
});
function contingency(cells){return {headers:['a','b'],delimiter:',',skippedBlankLines:0,rows:cells.flatMap((row,i)=>row.flatMap((count,j)=>Array.from({length:count},()=>[String(i),String(j)])))};}
test('uncorrected chi-square and Cramer V respect rectangular dimension',()=>{
 for(const [cells,chi,df,v] of [[[[20,10],[10,20]],20/3,1,1/3],[[[10,5,5],[5,10,5],[5,5,10]],7.5,4,.25],[[[5,5],[5,5]],0,1,0],[[[10,0],[0,10]],20,1,1]]){
 const a=runRecipe(contingency(cells),r('crosstab'),[]);near(a.metrics[0].value,chi);assert.equal(a.metrics[1].value,df);near(a.metrics[2].value,v);assert.equal(a.rows.reduce((n,row)=>n+row[2],0),a.n);
 }
});
test('sparse expected counts and single-active-level association are explicit',()=>{
 const a=runRecipe(contingency([[3,1],[2,2]]),r('crosstab'),[]);near(a.metrics[0].value,8/15);assert.equal(a.metrics[3].value,4);assert.ok(a.warnings.some(w=>w.includes('稀疏')));
 const b=runRecipe(parseSurveyCsv('a,b\nA,x\nA,y\nB,'),r('crosstab'),[]);assert.equal(b.n,2);assert.equal(b.metrics[0].value,null);assert.equal(b.metrics[2].value,null);
});
test('zero valid groups, constants, no pairs, singleton and two-pair caution',()=>{
 const g=runRecipe(parseSurveyCsv('g,v\nA,\nB,no\nC,1'),r('groups'),[]);assert.deepEqual(g.rows.slice(0,2).map(row=>row.slice(0,3)),[['A',0,null],['B',0,null]]);
 for(const csv of ['x,y\n1,2\n1,3','x,y\n1,2','x,y\n,2\n1,'])assert.equal(runRecipe(parseSurveyCsv(csv),r('pearson'),[]).metrics[0].value,null);
 assert.ok(runRecipe(parseSurveyCsv('x,y\n1,2\n2,4'),r('pearson'),[]).warnings.some(w=>w.includes('2 个有效')));
});
test('overlapping exclusions counted once; true zero not implicit missing',()=>{
 const d=runRecipe(parseSurveyCsv('x,y\n,no\n0,0\n1,2'),r('pearson'),[]);assert.equal(d.excluded,1);assert.equal(d.missingRows,1);assert.equal(d.invalidRows,1);assert.equal(d.n,2);
});
test('scale and translation invariance avoids underflow',()=>{
 near(pairedCorrelation([1e-200,2e-200,3e-200],[3e-200,2e-200,1e-200]),-1);
 near(pairedCorrelation([1e12,1e12-.001,1e12-.002],[0,1,2]),-1);
});
test('invalid indexes, self-association, identifiers and high cardinality fail closed',()=>{
 assert.throws(()=>runRecipe(mixed,r('pearson',1,1),[]));assert.throws(()=>runRecipe(mixed,r('numeric',null),[]));assert.throws(()=>runRecipe(mixed,r('numeric',99),[]));
 assert.throws(()=>runRecipe(parseSurveyCsv('姓名,v\n2,4'),r('numeric'),[]),/标识/);
 const table={headers:['a','b'],rows:Array.from({length:51},(_,i)=>[String(i),'1']),skippedBlankLines:0,delimiter:','};
 for(const method of ['groups','crosstab','frequency'])assert.throws(()=>runRecipe(table,r(method),[]));
});
test('export replaces category labels without mutating on-screen results',()=>{
 const a=runRecipe(parseSurveyCsv('group,choice\n__proto__,<script>\nconstructor,x'),r('crosstab'),[]),before=JSON.stringify(a),out=exportRecipeResult(a);
 assert.equal(JSON.stringify(a),before);assert.ok(!JSON.stringify(out).includes('<script>'));assert.ok(!JSON.stringify(out).includes('__proto__'));assert.ok(out.rows[0][0].startsWith('类别'));
});
