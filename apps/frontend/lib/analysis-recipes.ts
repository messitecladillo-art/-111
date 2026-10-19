import { categoryCounts, describeNumbers, finiteNumber, isMissing, profileSurvey, type SurveyTable } from './survey-analysis.ts';
import { correlationTest, fisherExact, formatCoefficient, formatP, formatStat, holm, kruskalWallis, mannWhitney, meanInterval, oneWayAnova, chiSquareUpper, welchAnova, welchT, wilsonInterval, type Interval } from './inference.ts';

export const ANALYSIS_BLOCKS = [
  {id:'frequency',title:'频数与比例',tag:'样本结构',roles:['分类变量'],use:'回答样本由哪些人、选择或状态组成。',boundary:'单列分类题；多选题须先按选项拆列，不能将组合文本当作选项占比。'},
  {id:'numeric',title:'数值分布',tag:'描述水平',roles:['数值变量'],use:'同时查看均值、标准差、中位数和四分位数。',boundary:'数字编码不自动等于连续变量；先核对单位、范围与异常值。'},
  {id:'groups',title:'分组比较',tag:'组间差异',roles:['分组变量','数值变量'],use:'并排比较各组的样本数、均值与离散程度，并检验组间差异。',boundary:'两组用 Welch t 检验，三组及以上用 Welch 方差分析，均不假定方差相等；另给秩检验作稳健性对照，多组两两比较用 Holm 校正。检验不证明因果。'},
  {id:'crosstab',title:'交叉表与关联强度',tag:'分类关联',roles:['行分类变量','列分类变量'],use:'查看交叉频数、行内比例、Pearson χ² 检验和 Cramér V。',boundary:'χ² 不作连续性校正；期望频数小于 5 的格较多时，2×2 表以 Fisher 精确检验为准，其他表按研究依据合并类别后再检验。'},
  {id:'pearson',title:'Pearson 相关',tag:'线性关联',roles:['数值变量 X','数值变量 Y'],use:'考察两个数值变量在当前配对样本中的线性关联，附双侧检验与 95% 区间。',boundary:'区间用 Fisher z 变换；先检查线性关系和异常值，相关不证明因果。'},
  {id:'spearman',title:'Spearman 秩相关',tag:'单调关联',roles:['有序 / 数值 X','有序 / 数值 Y'],use:'按有效配对重新排序，以平均秩处理并列值。',boundary:'p 值用 t 近似；有序编码需保持真实顺序；不适用于无序类别，也不证明因果。'},
] as const;
export type AnalysisMethod = typeof ANALYSIS_BLOCKS[number]['id'];
export type Recipe = {id:string;method:AnalysisMethod;x:number|null;y:number|null;question:string};
/** One reported test: a ready-to-cite line plus the numbers behind it. */
export type TestReport = { name:string; line:string; p:number|null; effect?:{name:string;value:number|null;interval?:Interval|null} };
export type PairwiseComparison = { a:string; b:string; difference:number; t:number; df:number; p:number; adjusted:number };
export type Inference = { primary:TestReport; robustness:TestReport[]; comparisons?:PairwiseComparison[]; notes:string[] };
export type RecipeResult = {
  method:AnalysisMethod; n:number; total:number; excluded:number; missingRows:number; invalidRows:number;
  metrics:{label:string;value:number|null}[]; headers:string[]; rows:(string|number|null)[][];
  warnings:string[]; interpretation:string; inference?:Inference;
};
const SAMPLING_NOTE='p 值和区间以随机抽样（或随机分配）为前提；便利或配额招募的样本只作参考，不据此推断总体。';
const MULTIPLE_NOTE='同一批数据做多次检验会增加偶然显著的机会；请在分析前写明主要假设。';
const pct=(v:number)=>v*100;
const MAX_LEVELS=20;
export function averageRanks(values:number[]) {
  const order=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value), ranks:number[]=[];
  for(let i=0;i<order.length;){let j=i+1;while(j<order.length&&order[j].value===order[i].value)j++;const rank=(i+1+j)/2;for(let k=i;k<j;k++)ranks[order[k].index]=rank;i=j;}
  return ranks;
}
/** Shift and scale each vector separately; avoids squaring raw tiny or huge differences. */
export function pairedCorrelation(x:number[],y:number[]):number|null {
  if(x.length!==y.length||x.length<2)return null;
  const normalized=(values:number[])=>{const shifted=values.map(v=>v-values[0]),scale=Math.max(...shifted.map(Math.abs));return scale?shifted.map(v=>v/scale):null;};
  const a=normalized(x),b=normalized(y);if(!a||!b)return null;
  const ax=a.reduce((s,v)=>s+v,0)/a.length,by=b.reduce((s,v)=>s+v,0)/b.length;
  let xx=0,yy=0,xy=0;for(let i=0;i<a.length;i++){const dx=a[i]-ax,dy=b[i]-by;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
  return Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));
}
const intervalText=(i:Interval|null|undefined,digits=2)=>i?`[${formatStat(i.lower,digits)}, ${formatStat(i.upper,digits)}]`:'';
/** Welch tests as the primary result, rank tests as a robustness check, Holm for pairwise follow-up. */
function groupInference(entries:[string,number[]][]):Inference|undefined {
  const observed=entries.filter(([,values])=>values.length>0);
  if(observed.length<2)return undefined;
  const notes=[SAMPLING_NOTE,MULTIPLE_NOTE];
  if(observed.length<entries.length)notes.push(`${entries.length-observed.length} 组没有有效数值，不参与检验。`);
  const undefinedPrimary=(reason:string):Inference=>({primary:{name:'差异检验',line:`检验不定义：${reason}`,p:null},robustness:[],notes});
  if(observed.some(([,values])=>values.length<2))return undefinedPrimary('至少一组少于 2 个有效数值，无法估计组内方差。');
  const values=observed.map(([,v])=>v),small=values.some(v=>v.length<15);
  if(small)notes.push('有组少于 15 个有效值：均值检验对偏态和异常值敏感，请对照秩检验结果，结论不一致时以更保守者为准。');
  if(observed.length===2){
    const w=welchT(values[0],values[1]);
    if(!w)return undefinedPrimary('两组数值都没有变异。');
    const mw=mannWhitney(values[0],values[1]);
    const primary:TestReport={name:'Welch t 检验',line:`Welch t(${formatStat(w.df,1)}) = ${formatStat(w.t)}, ${formatP(w.p)}, 均值差（表中第 1 组 − 第 2 组）= ${formatStat(w.difference)}, 95% CI ${intervalText(w.ci)}${w.hedgesG===null?'':`, Hedges g = ${formatStat(w.hedgesG)}`}`,p:w.p,effect:{name:'Hedges g',value:w.hedgesG,interval:w.gInterval}};
    const robustness:TestReport[]=mw?[{name:'Mann–Whitney U 检验',line:`U = ${formatStat(mw.u,1)}, ${formatP(mw.p)}（${mw.method==='exact'?'精确分布':'正态近似，含并列与连续性校正'}），秩二列相关 r = ${formatCoefficient(mw.rankBiserial)}`,p:mw.p,effect:{name:'秩二列相关 r',value:mw.rankBiserial}}]:[];
    notes.push('Hedges g 的区间为正态近似。');
    return {primary,robustness,notes};
  }
  const welch=welchAnova(values),classic=oneWayAnova(values),kw=kruskalWallis(values);
  if(!welch)return undefinedPrimary('至少一组数值没有变异，Welch 方差分析不定义。');
  const primary:TestReport={name:'Welch 方差分析',line:`Welch F(${welch.df1}, ${formatStat(welch.df2,1)}) = ${formatStat(welch.f)}, ${formatP(welch.p)}`,p:welch.p,...(classic?{effect:{name:'η²（经典方差分析）',value:classic.etaSquared}}:{})};
  const robustness:TestReport[]=[];
  if(classic)robustness.push({name:'经典方差分析',line:`F(${classic.df1}, ${classic.df2}) = ${formatStat(classic.f)}, ${formatP(classic.p)}, η² = ${formatCoefficient(classic.etaSquared)}（假定各组方差相等）`,p:classic.p,effect:{name:'η²',value:classic.etaSquared}});
  if(kw)robustness.push({name:'Kruskal–Wallis 检验',line:`H(${kw.df}) = ${formatStat(kw.h)}, ${formatP(kw.p)}, ε² = ${formatCoefficient(kw.epsilonSquared)}（含并列校正）`,p:kw.p,effect:{name:'ε²',value:kw.epsilonSquared}});
  const pairs:Omit<PairwiseComparison,'adjusted'>[]=[];
  for(let i=0;i<observed.length;i++)for(let j=i+1;j<observed.length;j++){const w=welchT(values[i],values[j]);if(w)pairs.push({a:observed[i][0],b:observed[j][0],difference:w.difference,t:w.t,df:w.df,p:w.p});}
  const adjusted=holm(pairs.map(p=>p.p));
  notes.push('两两比较为 Welch t 检验，p 值经 Holm 校正；仅在整体检验支持差异时作为解释依据。');
  return {primary,robustness,comparisons:pairs.map((p,i)=>({...p,adjusted:adjusted[i]})),notes};
}
export function runRecipe(table:SurveyTable,recipe:Recipe,missingCodes:string[]):RecipeResult {
  const meta=ANALYSIS_BLOCKS.find(b=>b.id===recipe.method);if(!meta)throw new Error('分析方法无效。');
  const columns=meta.roles.length===1?[recipe.x]:[recipe.x,recipe.y];
  if(columns.some(c=>c===null||!Number.isInteger(c)||c<0||c>=table.headers.length))throw new Error('请为每个变量位置选择有效列。');
  if(columns.length===2&&recipe.x===recipe.y)throw new Error('请选两个不同的变量，避免自相关或自交叉。');
  const profile=profileSurvey(table,missingCodes);
  if(columns.some(c=>profile.columns[c!].likelyIdentifier))throw new Error('疑似标识列不参与分析，请先完成去标识审查。');
  const x=recipe.x!,y=recipe.y!;
  const result:RecipeResult={method:recipe.method,n:0,total:table.rows.length,excluded:0,missingRows:0,invalidRows:0,metrics:[],headers:[],rows:[],warnings:[meta.boundary],interpretation:''};
  if(recipe.method==='frequency'){
    const counts=categoryCounts(table,x,missingCodes);result.n=counts.n;result.missingRows=counts.missing;
    if(counts.values.length>50)throw new Error('该变量超过 50 类，可能是开放文本或识别信息，请先编码后分析。');
    result.headers=['类别','频数','有效样本占比 (%)','95% CI 下限 (%)','95% CI 上限 (%)'];
    result.rows=counts.values.map(v=>{const ci=wilsonInterval(v.count,counts.n);return [v.label,v.count,counts.n?v.count/counts.n*100:null,ci?pct(ci.lower):null,ci?pct(ci.upper):null];});
    result.metrics=[{label:'有效类别数',value:counts.values.length}];result.interpretation='比例的分母是该列非缺失样本。区间为 Wilson 95% 区间，只在随机抽样前提下描述总体比例；便利或配额样本只作参考。';
  }else{
    const a:number[]=[],b:number[]=[],pairs:[string,string][]=[],groups=new Map<string,number[]>();
    table.rows.forEach(row=>{
      // Keep observed groups even when every outcome in that group is missing/invalid.
      if(recipe.method==='groups'&&!isMissing(row[x],missingCodes)&&!groups.has(row[x].trim()))groups.set(row[x].trim(),[]);
      const missing=columns.some(c=>isMissing(row[c!],missingCodes));
      const numericColumns=recipe.method==='crosstab'?[]:recipe.method==='groups'?[y]:recipe.method==='numeric'?[x]:[x,y];
      const invalid=numericColumns.some(c=>!isMissing(row[c],missingCodes)&&finiteNumber(row[c])===null);
      if(missing)result.missingRows++;if(invalid)result.invalidRows++;
      if(missing||invalid)return;result.n++;
      if(recipe.method==='crosstab')pairs.push([row[x].trim(),row[y].trim()]);
      else if(recipe.method==='groups'){groups.get(row[x].trim())!.push(finiteNumber(row[y])!);}
      else {a.push(finiteNumber(row[x])!);if(recipe.method!=='numeric')b.push(finiteNumber(row[y])!);}
    });
    if(recipe.method==='numeric'){
      const d=describeNumbers(a),ci=meanInterval(a);result.headers=['指标','数值'];result.rows=d?[["均值",d.mean],["样本标准差",d.sd],["最小值",d.min],["Q1",d.q1],["中位数",d.median],["Q3",d.q3],["最大值",d.max],["均值 95% CI 下限",ci?.lower??null],["均值 95% CI 上限",ci?.upper??null]]:[];
      result.metrics=[{label:'均值',value:d?.mean??null},{label:'中位数',value:d?.median??null}];result.interpretation='标准差使用 n−1；四分位数采用 Type 7；均值区间用 t 分布，以随机抽样为前提。缺失与不可解析数值不进入计算。';
    }else if(recipe.method==='groups'){
      if(groups.size>MAX_LEVELS)throw new Error('分组超过 20 类，请先按研究依据合并或重新选择分组变量。');
      result.headers=['组别','n','均值','样本标准差','中位数','Q1','Q3'];result.rows=[...groups].map(([label,values])=>{const d=describeNumbers(values);return[label,values.length,d?.mean??null,d?.sd??null,d?.median??null,d?.q1??null,d?.q3??null];});
      result.metrics=[{label:'有效分组数',value:groups.size}];result.interpretation='每组只使用该组的有效数值。组大小不平衡、招募和混杂因素均需解释；显著差异不等于因果，也不说明差异大小是否重要。';
      if([...groups.values()].some(v=>v.length<5))result.warnings.push('至少一组不足 5 人，描述可能不稳定，且小组可能有重识别风险；5 不是合格线。');
      const inference=groupInference([...groups]);
      if(inference){result.inference=inference;result.metrics.push({label:inference.primary.name.startsWith('Welch t')?'p 值（Welch t）':'p 值（Welch F）',value:inference.primary.p});if(inference.primary.effect)result.metrics.push({label:inference.primary.effect.name,value:inference.primary.effect.value});}
    }else if(recipe.method==='crosstab'){
      const rowLabels=[...new Set(pairs.map(p=>p[0]))],colLabels=[...new Set(pairs.map(p=>p[1]))];
      if(rowLabels.length>MAX_LEVELS||colLabels.length>MAX_LEVELS)throw new Error('交叉表每侧最多 20 类，请先按研究依据重新编码。');
      const cells=rowLabels.map(()=>colLabels.map(()=>0));pairs.forEach(([r,c])=>cells[rowLabels.indexOf(r)][colLabels.indexOf(c)]++);
      const rt=cells.map(row=>row.reduce((s,v)=>s+v,0)),ct=colLabels.map((_,j)=>cells.reduce((s,row)=>s+row[j],0));
      let chi=0,low=0,belowOne=0;const expected:number[][]=[];
      cells.forEach((row,i)=>{expected[i]=[];row.forEach((o,j)=>{const e=rt[i]*ct[j]/result.n;expected[i][j]=e;chi+=(o-e)**2/e;if(e<5)low++;if(e<1)belowOne++;});});
      const valid=rowLabels.length>=2&&colLabels.length>=2,df=(rowLabels.length-1)*(colLabels.length-1);
      result.headers=['行类别','列类别','频数','行内占比 (%)','期望频数'];result.rows=cells.flatMap((row,i)=>row.map((v,j)=>[rowLabels[i],colLabels[j],v,v/rt[i]*100,expected[i][j]]));
      result.metrics=[{label:'Pearson χ²',value:valid?chi:null},{label:'自由度',value:valid?df:null},{label:'Cramér V',value:valid?Math.sqrt(chi/(result.n*Math.min(rowLabels.length-1,colLabels.length-1))):null},{label:'期望频数 <5 的单元格',value:low}];
      if(!valid)result.warnings.push('至少一侧不足 2 个有效类别，χ² 与 V 不定义。');
      if(low)result.warnings.push(`${low} / ${rowLabels.length*colLabels.length} 格期望频数小于 5，其中 ${belowOne} 格小于 1。稀疏表不作渐近显著性解释。`);
      result.interpretation='每个百分比以所在行类别的有效配对人数为分母；V 是常规未偏差校正的关联强度，不等于因果。';
      if(valid){
        const v=Math.sqrt(chi/(result.n*Math.min(rowLabels.length-1,colLabels.length-1))),p=chiSquareUpper(chi,df),sparse=low/(rowLabels.length*colLabels.length)>0.2||belowOne>0;
        const chiReport:TestReport={name:'Pearson χ² 检验',line:`χ²(${df}, N = ${result.n}) = ${formatStat(chi)}, ${formatP(p)}, Cramér V = ${formatCoefficient(v)}`,p,effect:{name:'Cramér V',value:v}};
        const notes=[SAMPLING_NOTE];let primary=chiReport;const robustness:TestReport[]=[];
        if(rowLabels.length===2&&colLabels.length===2){
          const fp=fisherExact(cells[0][0],cells[0][1],cells[1][0],cells[1][1]),fisher:TestReport={name:'Fisher 精确检验',line:`Fisher 精确检验（双侧）${formatP(fp)}`,p:fp};
          if(low){primary={...fisher,effect:chiReport.effect};robustness.push(chiReport);notes.push('2×2 表存在期望频数小于 5 的格，以 Fisher 精确检验为主要结果。');}else robustness.push(fisher);
        }else if(sparse)notes.push('超过 20% 的格期望频数小于 5，或有格小于 1：χ² 的 p 值不可靠。请按研究依据合并类别后再检验，不要为追求显著而合并。');
        result.inference={primary,robustness,notes};
        result.metrics.push({label:primary.name==='Fisher 精确检验'?'p 值（Fisher 精确）':'p 值（χ² 渐近）',value:primary.p});
      }
    }else{
      const rank=recipe.method==='spearman',value=pairedCorrelation(rank?averageRanks(a):a,rank?averageRanks(b):b);
      result.metrics=[{label:rank?'Spearman ρ':'Pearson r',value}];result.headers=['指标','数值'];result.rows=[[rank?'Spearman ρ':'Pearson r',value],['有效配对数',result.n]];
      if(value===null)result.warnings.push('有效配对不足 2 对，或至少一个变量无变异，相关系数不定义。');
      if(result.n===2&&value!==null)result.warnings.push('只有 2 个有效配对时，非恒定变量的相关代数上必为 ±1，不能视为稳定关系。');
      result.interpretation=rank?'先剔除不完整配对，再对有效配对取平均秩，计算秩的 Pearson 相关。':'相关系数描述当前有效配对的线性关联；极端值、非线性关系或混杂会改变解释。';
      const tested=value===null?null:correlationTest(value,result.n,!rank);
      if(value!==null&&tested){
        const symbol=rank?'ρ':'r',interval=tested.ci,line=`${symbol}(${tested.df}) = ${formatCoefficient(value)}, ${formatP(tested.p)}${interval?`, 95% CI [${formatCoefficient(interval.lower)}, ${formatCoefficient(interval.upper)}]`:''}${rank?'（t 近似）':''}`;
        const notes=[SAMPLING_NOTE];if(result.n<10)notes.push('有效配对少于 10 对，相关系数和 p 值都很不稳定，区间会很宽。');
        if(rank&&new Set(a).size+new Set(b).size<a.length+b.length)notes.push('数据中有并列值；Spearman 的 p 值为 t 近似，并列较多时偏保守或偏宽松都有可能。');
        result.inference={primary:{name:rank?'Spearman 秩相关检验':'Pearson 相关检验',line,p:tested.p,effect:{name:rank?'Spearman ρ':'Pearson r',value,interval}},robustness:[],notes};
        result.metrics.push({label:'p 值（双侧）',value:tested.p});
        if(interval){result.metrics.push({label:'95% CI 下限',value:interval.lower},{label:'95% CI 上限',value:interval.upper});result.rows.push(['95% CI 下限（Fisher z）',interval.lower],['95% CI 上限（Fisher z）',interval.upper]);}
        result.rows.push(['p 值（双侧）',tested.p]);
      }
    }
  }
  result.excluded=result.total-result.n;
  if(!result.n)result.warnings.push('没有满足当前设置的有效样本；请核对变量与缺失代码。');
  result.warnings.push('未加权、未自动删除重复行、未插补；原因计数可能重叠。没有正式抽样设计，不给出总体代表性结论。');
  return result;
}

/** Category labels are omitted from downloaded summaries; raw rows are never included. */
export function exportRecipeResult(result:RecipeResult):RecipeResult {
  const labels=new Map<string,string>();const alias=(value:string)=>{if(!labels.has(value))labels.set(value,`类别 ${labels.size+1}`);return labels.get(value)!;};
  const rows=result.rows.map(row=>row.map((cell,i)=>typeof cell==='string'&&((['frequency','groups'].includes(result.method)&&i===0)||(result.method==='crosstab'&&i<2))?alias(cell):cell));
  if(!result.inference?.comparisons)return {...result,rows};
  return {...result,rows,inference:{...result.inference,comparisons:result.inference.comparisons.map(c=>({...c,a:alias(c.a),b:alias(c.b)}))}};
}
