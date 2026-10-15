import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as core from '../lib/topic-questionnaire.ts';
import {emptyTopicBrief} from '../lib/topic-project.ts';
import {exampleQuestionnaire} from '../lib/questionnaire.ts';
import {stableStringify} from '../lib/topic-advisor/parse.ts';

// Production handlers/effects with real deterministic core. This does not certify browser layout/focus.
const ts=createRequire(import.meta.url)('typescript');
const compiled=ts.transpileModule(fs.readFileSync(new URL('../components/topic-advisor/TopicQuestionnaireProposal.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)),tick=()=>new Promise(resolve=>setImmediate(resolve));
const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const label=node=>node==null?'':Array.isArray(node)?node.map(label).join(''):typeof node==='object'?label(node.props?.children):String(node);
const text=s=>label(s.tree);
function field(s,aria){const result=nodes(s.tree).find(n=>n.props?.['aria-label']===aria);assert.ok(result,aria);return result;}
function button(s,name){const result=nodes(s.tree).find(n=>n.type==='button'&&(typeof name==='string'?label(n)===name:name.test(label(n))));assert.ok(result,String(name));return result;}
function fixture(){return{source:{brief:{...emptyTopicBrief(),title:'武汉社区服务研究 🧭',decisionOwner:'拟沟通的服务负责人',decision:'决定先核查哪些困难',population:'拟调查使用过服务的居民',geography:'武汉',evidencePlan:'拟开展认知访谈，尚未实施',questions:[{id:'rq-clarity',text:'说明清晰程度与办理困难如何关联？'}],constructs:[{id:'c-clarity',name:'说明清晰度',questionIds:['rq-clarity']}],firstWeekPlan:['先核对访谈渠道']},version:{id:'topic-v-1',revision:1,contentHash:'a'.repeat(64),createdAt:'2026-10-15T08:00:00Z',createdBy:'account-a'},dirty:false,decisionRevision:1},target:{design:exampleQuestionnaire(),pending:false,versionId:'questionnaire-v-2',revision:2},binding:null,scopeKey:'account-a:project-a',writable:true};}
function make({props:initialProps={},holdPreview=false,holdApply=false,parentApply}={}){
  let cells=[],index=0,effects=[],dirty=true,tree,alive=true,writesAfterUnmount=0,props,closeCount=0;
  const applications=[],coreCalls=[],pending={preview:[],apply:[]};
  const hooks={useState(initial){const at=index++;if(!cells[at])cells[at]={value:typeof initial==='function'?initial():initial};return[cells[at].value,value=>{if(!alive)writesAfterUnmount++;const next=typeof value==='function'?value(cells[at].value):value;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},useRef(initial){const at=index++;return cells[at]??={current:initial};},useEffect(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}}};
  hooks.useLayoutEffect=hooks.useEffect;
  const jsx=(type,props,key)=>({type,props,key});
  const wrap=(name,phase,hold)=>(...args)=>{coreCalls.push({name,args:plain(args)});const actual=core[name](...args.map(plain));return hold?actual.then(value=>new Promise((resolve,reject)=>pending[phase].push({resolve:()=>resolve(value),reject}))):actual;};
  const imports={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/topic-questionnaire':{...core,prepareTopicQuestionnaire:wrap('prepareTopicQuestionnaire','preview',holdPreview),applyTopicQuestionnaire:wrap('applyTopicQuestionnaire','apply',holdApply)},'@/lib/topic-advisor/parse':{stableStringify},'./TopicQuestionnaireProposal.module.css':{default:{}}};
  const box={exports:{},require:name=>{assert.ok(name in imports,name);return imports[name];},JSON,console,crypto,structuredClone};vm.runInNewContext(compiled,box);
  props={...fixture(),onApply:async application=>{applications.push(application);if(parentApply)await parentApply(application);},onClose:()=>closeCount++,...initialProps};
  const s={get tree(){return tree;},get props(){return props;},applications,coreCalls,get closeCount(){return closeCount;},get writesAfterUnmount(){return writesAfterUnmount;},get pendingPreview(){return pending.preview.length;},get pendingApply(){return pending.apply.length;},
    async settle(){for(let n=0;n<40;n++){index=0;dirty=false;tree=box.exports.default(props);const queue=effects;effects=[];queue.forEach(fn=>fn());await tick();if(!dirty&&!effects.length)return;}throw Error('Unstable effects');},
    async until(predicate){for(let n=0;n<100;n++){await s.settle();if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Expected panel state did not arrive');},
    update(patch){props={...props,...patch};},releasePreview(at=0){assert.ok(pending.preview[at]);pending.preview.splice(at,1)[0].resolve();},rejectPreview(at=0,error=Error('旧预览失败')){assert.ok(pending.preview[at]);pending.preview.splice(at,1)[0].reject(error);},releaseApply(){assert.ok(pending.apply.length);pending.apply.shift().resolve();},unmount(){alive=false;cells.forEach(c=>c.cleanup?.());}};return s;
}
async function preview(s){await s.settle();button(s,/^(?:重新)?预览字段变化$/).props.onClick();await s.until(()=>text(s).includes('本提案绑定来源'));}
async function select(s,id){const input=field(s,`采用字段 ${id}`);assert.equal(input.props.disabled,false);input.props.onChange({target:{checked:true}});await s.settle();}
async function mapping(s,kind,id){field(s,`题目 demo-experience 关联${kind} ${id}`).props.onChange({target:{checked:true}});await s.settle();}

test('preview never applies automatically and explicit partial adoption preserves all questions and untouched fields',async()=>{
  const s=make(),before=plain(s.props.target);await preview(s);assert.equal(s.applications.length,0);assert.equal(button(s,/^采用 0 个所选字段$/).props.disabled,true);
  await select(s,'brief:title');const apply=button(s,'采用 1 个所选字段');apply.props.onClick();apply.props.onClick();await s.until(()=>s.applications.length===1&&text(s).includes('交给问卷工作区'));
  const result=s.applications[0];assert.equal(result.after.title,s.props.source.brief.title);assert.equal(result.after.objective,before.design.objective);assert.deepEqual(result.after.questions,before.design.questions);assert.deepEqual(s.props.target,before);assert.equal(button(s,'采用 1 个所选字段').props.disabled,true);assert.ok(!text(s).includes('云端保存成功'));s.unmount();
});

test('existing-question RQ and construct selectors preserve stable IDs and only selected mapping fields change',async()=>{
  const s=make();await s.settle();await mapping(s,'研究问题','rq-clarity');await mapping(s,'概念','c-clarity');await preview(s);
  assert.ok(text(s).includes('说明清晰程度与办理困难如何关联？'));await select(s,'question:demo-experience:construct');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);
  const result=s.applications[0],before=s.props.target.design.questions.find(q=>q.id==='demo-experience'),after=result.after.questions.find(q=>q.id==='demo-experience');
  assert.equal(after.construct,'说明清晰度');assert.equal(after.researchQuestion,before.researchQuestion);assert.deepEqual(after.condition,before.condition);assert.deepEqual(after.choices,before.choices);assert.equal(result.after.questions.length,s.props.target.design.questions.length);
  assert.deepEqual(result.provenance.changes[0].researchQuestionIds,['rq-clarity']);assert.deepEqual(result.provenance.changes[0].constructIds,['c-clarity']);s.unmount();
});

test('blank mapping issues remain readable, cannot be selected, and do not block a valid separate brief field',async()=>{
  const f=fixture();f.source.brief.questions[0].text=' \t\n ';f.source.brief.constructs[0].name='';const s=make({props:f});await s.settle();await mapping(s,'研究问题','rq-clarity');await mapping(s,'概念','c-clarity');await preview(s);
  assert.ok(text(s).includes('文字为空或仅含空白'));for(const id of ['question:demo-experience:researchQuestion','question:demo-experience:construct'])assert.equal(field(s,`采用字段 ${id}`).props.disabled,true);
  await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);assert.deepEqual(s.applications[0].after.questions,f.target.design.questions);s.unmount();
});

test('overlong Chinese field diffs preserve complete proposed text and display the actual field limit',async()=>{
  const f=fixture();f.source.brief.population='人'.repeat(180);const s=make({props:f});await preview(s);assert.ok(text(s).includes(f.source.brief.population));assert.ok(text(s).includes('180 / 160 字符'));assert.ok(text(s).includes('未截断'));assert.equal(field(s,'采用字段 brief:population').props.disabled,true);assert.equal(s.applications.length,0);s.unmount();
});

test('zero-question questionnaires can preview all five brief fields without creating fake survey items',async()=>{
  const f=fixture();f.target.design.questions=[];const s=make({props:f});await preview(s);assert.ok(text(s).includes('不会自动创建调查题目或答案'));
  for(const id of ['title','objective','population','geography','pilotNotes'])await select(s,`brief:${id}`);
  button(s,'采用 5 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);assert.deepEqual(s.applications[0].after.questions,[]);s.unmount();
});

test('read-only users may preview but cannot edit mappings or adopt fields even through disabled handlers',async()=>{
  const s=make({props:{writable:false}});await preview(s);assert.ok(text(s).includes('只读模式'));field(s,'采用字段 brief:title').props.onChange({target:{checked:true}});await s.settle();button(s,'采用 0 个所选字段').props.onClick();await s.settle();assert.equal(s.applications.length,0);assert.equal(s.coreCalls.filter(c=>c.name==='applyTopicQuestionnaire').length,0);s.unmount();
});

test('source or target edits keep old diffs readable and permanently stale until a fresh preview, including edit-undo',async()=>{
  for(const kind of ['source','target','binding']){
    const s=make();await preview(s);await select(s,'brief:title');const before=s.props;
    const changed=kind==='source'?{source:{...before.source,version:{...before.source.version,id:'topic-v-2',revision:2}}}:kind==='target'?{target:{...before.target,design:{...before.target.design,pilotNotes:'后续预试编辑'}}}:{binding:{schema:'topic-questionnaire-binding/v1',classification:'proposed',sources:[],applications:[]}};
    s.update(changed);await s.settle();assert.ok(text(s).includes('旧提案保留供核对'));assert.ok(text(s).includes(before.source.brief.title));assert.equal(button(s,'采用 1 个所选字段').props.disabled,true);
    s.update(before);await s.settle();assert.equal(button(s,'采用 1 个所选字段').props.disabled,true);assert.equal(s.applications.length,0);s.unmount();
  }
});

test('mapping edits invalidate the old preview and require a new comparison',async()=>{
  const s=make();await preview(s);await select(s,'brief:title');await mapping(s,'研究问题','rq-clarity');assert.equal(button(s,'采用 1 个所选字段').props.disabled,true);assert.ok(text(s).includes('关联选择已变化'));s.unmount();
});

test('explicit clear lets users recover mappings whose source IDs or target questions were removed',async()=>{
  const s=make();await s.settle();await mapping(s,'研究问题','rq-clarity');await preview(s);const p=s.props;
  s.update({source:{...p.source,brief:{...p.source.brief,questions:[],constructs:[]}},target:{...p.target,design:{...p.target.design,questions:[]}}});await s.settle();
  button(s,'重新预览字段变化').props.onClick();await s.until(()=>text(s).includes('已删除或不存在'));assert.equal(s.applications.length,0);
  button(s,'清空题目关联选择').props.onClick();await s.settle();button(s,'重新预览字段变化').props.onClick();await s.until(()=>text(s).includes('请逐项选择要采用的字段'));await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);assert.deepEqual(s.applications[0].after.questions,[]);s.unmount();
});

test('late core application never reaches parent after source, target, binding or account scope changes',async()=>{
  for(const boundary of ['source','target','binding','scope']){
    const s=make({holdApply:true});await preview(s);await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.pendingApply===1);
    const p=s.props;if(boundary==='source')s.update({source:{...p.source,brief:{...p.source.brief,title:'新版简报'}}});else if(boundary==='target')s.update({target:{...p.target,design:{...p.target.design,title:'新版问卷'}}});else if(boundary==='binding')s.update({binding:{schema:'topic-questionnaire-binding/v1',classification:'proposed',sources:[],applications:[]}});else s.update({scopeKey:'account-b:project-b',source:null});
    await s.settle();s.releaseApply();await tick();await s.settle();assert.equal(s.applications.length,0,boundary);assert.ok(!text(s).includes('交给问卷工作区'));if(boundary==='scope')assert.ok(!text(s).includes('本提案绑定来源'));else assert.ok(text(s).includes('输入发生变化'));s.unmount();
  }
});

test('late preview remains stale after target changes and cannot be adopted',async()=>{
  const s=make({holdPreview:true});await s.settle();button(s,'预览字段变化').props.onClick();await s.until(()=>s.pendingPreview===1);s.update({target:{...s.props.target,design:{...s.props.target.design,title:'等待期间编辑'}}});await s.settle();s.releasePreview();await s.until(()=>text(s).includes('本提案绑定来源'));assert.ok(text(s).includes('预览期间输入发生变化'));assert.equal(button(s,'采用 0 个所选字段').props.disabled,true);assert.equal(s.applications.length,0);s.unmount();
});

test('callback identity changes alone keep a preview current and use the latest parent callback',async()=>{
  const s=make({holdApply:true}),latest=[];await preview(s);await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.pendingApply===1);s.update({onApply:application=>latest.push(application),onClose:()=>{}});await s.settle();s.releaseApply();await s.until(()=>latest.length===1);assert.equal(s.applications.length,0);s.unmount();
});

test('parent apply failures preserve the readable preview and show no persistence success',async()=>{
  const s=make({parentApply:async()=>{throw Error('原子保存失败，尚未确认提交');}});await preview(s);await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>text(s).includes('原子保存失败'));assert.ok(text(s).includes('尚未确认应用完成'));assert.ok(text(s).includes('本提案绑定来源'));assert.equal(button(s,'采用 1 个所选字段').props.disabled,true);assert.ok(!text(s).includes('交给问卷工作区'));s.unmount();
});

test('input guards also fence the await of parent commit and do not claim its persistence result',async()=>{
  let finish;const parent=new Promise(resolve=>{finish=resolve;}),s=make({parentApply:()=>parent});await preview(s);await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);s.update({target:{...s.props.target,design:{...s.props.target.design,title:'父级更新后的问卷'}}});await s.settle();finish();await s.until(()=>text(s).includes('请在问卷工作区核对结果'));assert.ok(!text(s).includes('交给问卷工作区'));s.unmount();
});

test('unmount and close during asynchronous work never call parent late or write after unmount',async()=>{
  for(const boundary of ['unmount','close']){
    const s=make({holdApply:true});await preview(s);await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.pendingApply===1);if(boundary==='unmount')s.unmount();else button(s,'关闭提案').props.onClick();s.releaseApply();await tick();if(boundary==='close')await s.settle();assert.equal(s.applications.length,0);assert.equal(s.writesAfterUnmount,0);if(boundary==='close'){assert.equal(s.closeCount,1);s.unmount();}
  }
});

test('unmount while parent commit is pending does not update the discarded panel after the callback settles',async()=>{
  let finish;const parent=new Promise(resolve=>{finish=resolve;}),s=make({parentApply:()=>parent});await preview(s);await select(s,'brief:title');button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);s.unmount();finish();await tick();await tick();assert.equal(s.writesAfterUnmount,0);assert.equal(s.applications.length,1);
});

test('missing source, unsaved source and pending numeric target input block preview with explicit notices',async()=>{
  for(const patch of [{source:null},{source:{...fixture().source,dirty:true}},{target:{...fixture().target,pending:true}}]){
    const s=make({props:patch});await s.settle();assert.equal(button(s,'预览字段变化').props.disabled,true);button(s,'预览字段变化').props.onClick();await s.settle();assert.equal(s.coreCalls.length,0);assert.equal(s.applications.length,0);s.unmount();
  }
});

test('retained enabled adopt handlers cannot refresh an old preview fence after target/source/binding/scope edit-undo',async()=>{
  for(const boundary of ['target','source','binding','scope','mapping']){
    const s=make();await preview(s);await select(s,'brief:title');const retained=button(s,'采用 1 个所选字段').props.onClick,p=s.props;
    if(boundary==='target'){s.update({target:{...p.target,design:{...p.target.design,pilotNotes:'修改后再撤销'}}});await s.settle();s.update({target:p.target});}
    else if(boundary==='source'){s.update({source:{...p.source,version:{...p.source.version,id:'topic-v-2',revision:2}}});await s.settle();s.update({source:p.source});}
    else if(boundary==='binding'){s.update({binding:{schema:'topic-questionnaire-binding/v1',classification:'proposed',sources:[],applications:[]}});await s.settle();s.update({binding:p.binding});}
    else if(boundary==='scope'){s.update({scopeKey:'account-b:project-b',source:null});await s.settle();s.update({scopeKey:p.scopeKey,source:p.source});}
    else {await mapping(s,'研究问题','rq-clarity');field(s,'题目 demo-experience 关联研究问题 rq-clarity').props.onChange({target:{checked:false}});}
    await s.settle();if(boundary!=='scope')assert.equal(button(s,'采用 1 个所选字段').props.disabled,true,boundary);retained();await s.settle();await tick();
    assert.equal(s.applications.length,0,boundary);assert.equal(s.coreCalls.filter(c=>c.name==='applyTopicQuestionnaire').length,0,boundary);s.unmount();
  }
});

test('retained handlers cannot apply a superseded field selection, repeat submission or bypass a new preview reset',async()=>{
  const s=make();await preview(s);await select(s,'brief:title');const old=button(s,'采用 1 个所选字段').props.onClick;
  field(s,'采用字段 brief:title').props.onChange({target:{checked:false}});await s.settle();await select(s,'brief:objective');old();await s.settle();assert.equal(s.applications.length,0);assert.equal(s.coreCalls.filter(c=>c.name==='applyTopicQuestionnaire').length,0);
  const fresh=button(s,'采用 1 个所选字段').props.onClick;fresh();await s.until(()=>s.applications.length===1&&text(s).includes('交给问卷工作区'));assert.deepEqual(s.applications[0].provenance.changes.map(c=>c.id),['brief:objective']);fresh();await s.settle();assert.equal(s.applications.length,1);
  button(s,'重新预览字段变化').props.onClick();await s.until(()=>text(s).includes('请逐项选择要采用的字段'));assert.equal(button(s,'采用 0 个所选字段').props.disabled,true);fresh();await s.settle();assert.equal(s.applications.length,1);s.unmount();
});

test('superseded old preview success or error after scope A→B→A cannot replace fresh preview or clear fresh selection',async()=>{
  for(const outcome of ['success','error']){
    const s=make({holdPreview:true});await s.settle();const initial=s.props;button(s,'预览字段变化').props.onClick();await s.until(()=>s.pendingPreview===1);
    s.update({scopeKey:'account-b:project-b',source:null});await s.settle();s.update({scopeKey:initial.scopeKey,source:initial.source});await s.settle();button(s,'预览字段变化').props.onClick();await s.until(()=>s.pendingPreview===2);
    s.releasePreview(1);await s.until(()=>text(s).includes('本提案绑定来源'));await select(s,'brief:title');assert.equal(button(s,'采用 1 个所选字段').props.disabled,false);
    if(outcome==='success')s.releasePreview(0);else s.rejectPreview(0,Error('过时的旧预览错误'));await tick();await s.settle();
    assert.equal(field(s,'采用字段 brief:title').props.checked,true,outcome);assert.equal(button(s,'采用 1 个所选字段').props.disabled,false,outcome);assert.ok(!text(s).includes('旧提案保留供核对'));assert.ok(!text(s).includes('过时的旧预览错误'));assert.equal(s.applications.length,0);
    button(s,'采用 1 个所选字段').props.onClick();await s.until(()=>s.applications.length===1);s.unmount();
  }
});

test('superseded old completion cannot clear the busy state of a newer preview',async()=>{
  for(const outcome of ['success','error']){
    const s=make({holdPreview:true});await s.settle();const initial=s.props;button(s,'预览字段变化').props.onClick();await s.until(()=>s.pendingPreview===1);s.update({scopeKey:'account-b:project-b',source:null});await s.settle();s.update({scopeKey:initial.scopeKey,source:initial.source});await s.settle();button(s,'预览字段变化').props.onClick();await s.until(()=>s.pendingPreview===2);
    if(outcome==='success')s.releasePreview(0);else s.rejectPreview(0);await tick();await s.settle();assert.equal(button(s,'正在比较…').props.disabled,true,outcome);assert.ok(!text(s).includes('本提案绑定来源'));assert.ok(!text(s).includes('旧预览失败'));
    s.releasePreview(0);await s.until(()=>text(s).includes('本提案绑定来源'));assert.equal(button(s,'重新预览字段变化').props.disabled,false);s.unmount();
  }
});
