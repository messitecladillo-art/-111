import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as topic from '../lib/topic-advisor/index.ts';
import {parseTopicBundle} from '../lib/topic-advisor/parse.ts';
import {readTopicBackup,topicDraftFor,MAX_TOPIC_BACKUP_BYTES} from '../components/topic-advisor/draft.ts';

const ts=createRequire(import.meta.url)('typescript');
const compiled=ts.transpileModule(fs.readFileSync(new URL('../components/topic-advisor/TopicAdvisor.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const json=name=>JSON.parse(fs.readFileSync(new URL(`../content/topic-advisor/${name}.json`,import.meta.url),'utf8'));
const bundle=parseTopicBundle({catalog:json('catalog'),sources:json('sources'),model:json('ranker'),events:json('hotspot-events')});
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const label=node=>node==null?'':Array.isArray(node)?node.map(label).join(''):typeof node==='object'?label(node.props?.children):String(node);
const button=(s,text)=>{const node=nodes(s.tree).find(v=>v.type==='button'&&label(v)===text);assert.ok(node,text);return node;};
const profile={...structuredClone(topic.EMPTY_TOPIC_PROFILE),region:'湖北',city:'武汉',referenceDate:'2026-10-15'};
const recommendations=topic.recommendTopics(profile,bundle,6).items;
function make({pinnedComparisonId='',shortlistIds=[],managed=true,initialProfile=profile,cacheNamespace='global',initialDrafts=new Map(),readOnly=false}={}){
  let cells=[],index=0,effects=[],dirty=true,tree,alive=true;
  const changes=[],drafts=initialDrafts,adoptions=[];
  let props={initialWorkspace:{profile:initialProfile,candidate:null,shortlistIds,selectedId:''},workspaceRevision:0,pinnedComparisonId,cacheNamespace,readOnly,onUseTopic:value=>adoptions.push(plain(value)),...(managed?{onWorkspaceChange:workspace=>changes.push(plain(workspace))}:{})};
  const hooks={useState(initial){const at=index++;if(!cells[at])cells[at]={value:typeof initial==='function'?initial():initial};return[cells[at].value,value=>{assert.ok(alive);const next=typeof value==='function'?value(cells[at].value):value;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},useRef(initial){const at=index++;return cells[at]??={current:initial};},useEffect(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}}};
  const wrapped={...topic};for(const name of['parseTopicDraft','profileFingerprint','profileRegionStatus','regionPath','recommendTopics','evaluateCandidate','eventLeadsForProfile'])wrapped[name]=(...args)=>topic[name](...args.map(plain));
  const jsx=(type,props,key)=>({type,props,key});
  const imports={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/hosted/HostedSession':{useHostedSession:()=>({session:{user:{id:'account-a'}},identityEpoch:1,getDraft:key=>drafts.get(key),cacheDraft:(key,value)=>drafts.set(key,value),setUnsaved(){},isCurrentAccount:(id,epoch)=>id===auth.session.user.id&&epoch===auth.identityEpoch})},'@/components/workbench/shell-kit':{useWorkbenchTheme:()=> 'light'},'@/lib/topic-advisor':wrapped,'@/lib/topic-advisor/client-bundle':{TOPIC_BUNDLE:bundle},'./TopicAdvisor.module.css':{default:{}},'./RegionPicker':{default:'RegionPicker'},'./draft':{readTopicBackup,topicDraftFor:(...args)=>topicDraftFor(...args.map(plain)),MAX_TOPIC_BACKUP_BYTES}};
  imports['./PublishedCountyEvidence']={default:'PublishedCountyEvidence'};
  // Stable auth callbacks mirror the real context and prevent false rerender loops.
  const auth=imports['@/components/hosted/HostedSession'].useHostedSession();imports['@/components/hosted/HostedSession'].useHostedSession=()=>auth;
  const box={exports:{},require:name=>{assert.ok(name in imports,name);return imports[name];},JSON,Date,Intl,console,crypto,structuredClone,queueMicrotask,document:{getElementById:()=>null}};vm.runInNewContext(compiled,box);
  const s={get tree(){return tree;},changes,drafts,adoptions,async settle(){for(let n=0;n<40;n++){index=0;dirty=false;tree=box.exports.default(props);const queue=effects;effects=[];queue.forEach(fn=>fn());await tick();if(!dirty&&!effects.length)return;}throw Error('Unstable effects');},update(patch){props={...props,...patch};},switchAccount(id){auth.session={user:{id}};auth.identityEpoch++;},picker(){return nodes(tree).find(v=>v.type==='RegionPicker');},async importBackup(value){const input=nodes(tree).find(v=>v.props?.['aria-label']==='重新打开选题草稿');assert.ok(input);const raw=JSON.stringify(value);await input.props.onChange({target:{value:'file',files:[{size:Buffer.byteLength(raw),text:async()=>raw}]}});await s.settle();},async recommend(){button(s,'发现适合我的方向↗').props.onClick();await s.settle();},checkbox(id){const item=nodes(tree).find(v=>v.type==='article'&&v.key===id);assert.ok(item,id);return nodes(item).find(v=>v.type==='input'&&v.props.type==='checkbox');},unmount(){cells.forEach(c=>c.cleanup?.());alive=false;}};return s;
}

test('county evidence receives the current profile independently of a recommendation run and never adopts a topic',async()=>{
  const initialProfile={...structuredClone(profile),schemaVersion:2,regionRef:{code:'421222',catalogVersion:topic.TOPIC_REGION_CATALOG.catalogVersion}};
  const s=make({initialProfile});await s.settle();
  const evidence=()=>nodes(s.tree).find(node=>node.type==='PublishedCountyEvidence');
  assert.equal(evidence().props.profile.regionRef.code,'421222');assert.equal(s.adoptions.length,0);
  s.picker().props.onChange({code:'320623',catalogVersion:topic.TOPIC_REGION_CATALOG.catalogVersion});await s.settle();
  assert.equal(evidence().props.profile.regionRef.code,'320623');assert.equal(s.adoptions.length,0);s.unmount();
});

test('adopted comparison stays checked, cannot be removed, and clear retains exactly that ID',async()=>{
  const pin=recommendations[0].patternId,s=make({pinnedComparisonId:pin});await s.settle();await s.recommend();assert.equal(s.checkbox(pin).props.checked,true);assert.equal(s.checkbox(pin).props.disabled,true);assert.ok(label(s.tree).includes('已采用'));
  s.checkbox(pin).props.onChange();await s.settle();assert.deepEqual(s.changes.at(-1).shortlistIds,[pin]);
  s.checkbox(recommendations[1].patternId).props.onChange();await s.settle();assert.deepEqual(s.changes.at(-1).shortlistIds,[pin,recommendations[1].patternId]);
  button(s,'清空对比').props.onClick();await s.settle();assert.deepEqual(s.changes.at(-1).shortlistIds,[pin]);assert.equal(s.checkbox(pin).props.checked,true);s.unmount();
});
test('pin change is reflected immediately in both visible checks and emitted workspace within three slots',async()=>{
  const pin=recommendations[0].patternId,s=make({pinnedComparisonId:pin});await s.settle();await s.recommend();for(const item of recommendations.slice(1,3)){s.checkbox(item.patternId).props.onChange();await s.settle();}
  assert.equal(s.changes.at(-1).shortlistIds.length,3);assert.equal(s.checkbox(recommendations[3].patternId).props.disabled,true);
  const nextPin=recommendations[3].patternId;s.update({pinnedComparisonId:nextPin});await s.settle();const ids=s.changes.at(-1).shortlistIds;assert.equal(ids[0],nextPin);assert.equal(ids.length,3);assert.equal(s.checkbox(nextPin).props.checked,true);assert.equal(s.checkbox(nextPin).props.disabled,true);assert.equal(s.checkbox(recommendations[2].patternId).props.checked,false);s.unmount();
});
test('global behavior without a pin can uncheck all comparisons and preserves its original cache key',async()=>{
  const s=make({managed:false});await s.settle();await s.recommend();const first=recommendations[0].patternId;s.checkbox(first).props.onChange();await s.settle();assert.equal(s.checkbox(first).props.disabled,false);assert.equal(s.checkbox(first).props.checked,true);button(s,'清空对比').props.onClick();await s.settle();assert.equal(s.checkbox(first).props.checked,false);assert.ok(s.drafts.has('topic-advisor:v1:account-a'));s.unmount();
});

const countyRef={code:'420111',catalogVersion:topic.TOPIC_REGION_CATALOG.catalogVersion};
test('explicit county selection upgrades the workspace and result heading retains the full path',async()=>{
  const s=make();await s.settle();s.picker().props.onChange(countyRef);await s.settle();
  const next=s.changes.at(-1).profile;assert.equal(next.schemaVersion,2);assert.deepEqual(next.regionRef,countyRef);assert.equal(next.region,'湖北省');assert.equal(next.city,'武汉市');assert.deepEqual(next.access,{});assert.equal(next.school,'');
  await s.recommend();assert.ok(label(s.tree).includes('湖北省 · 武汉市 · 洪山区'));const adopt=nodes(s.tree).find(n=>n.type==='button'&&label(n).startsWith('选定方向，带入准备度诊断'));assert.ok(adopt);adopt.props.onClick();assert.equal(s.adoptions[0].geography,'湖北省 · 武汉市 · 洪山区');s.unmount();
});
test('clearing an explicit region emits unset v2 instead of falling back to old text',async()=>{
  const s=make({initialProfile:{...profile,schemaVersion:2,regionRef:countyRef}});await s.settle();s.picker().props.onChange(null);await s.settle();const next=s.changes.at(-1).profile;assert.equal(next.schemaVersion,2);assert.equal(next.regionRef,null);assert.equal(next.region,'');assert.equal(next.city,'');assert.deepEqual(next.access,{});s.unmount();
});
test('picker identity follows project and account generation and old callbacks cannot edit a new account',async()=>{
  const s=make({cacheNamespace:'project-a'});await s.settle();const first=s.picker(),oldChange=first.props.onChange;s.update({cacheNamespace:'project-b'});await s.settle();assert.notEqual(s.picker().key,first.key);assert.notEqual(s.picker().props.scopeKey,first.props.scopeKey);const afterProject=s.picker().props.scopeKey;s.switchAccount('account-b');await s.settle();assert.notEqual(s.picker().props.scopeKey,afterProject);const before=s.changes.length;oldChange(countyRef);await s.settle();assert.equal(s.changes.length,before);s.unmount();
});
test('stale references restore visibly without recalculating or losing saved candidate choices',async()=>{
  const old={...profile,schemaVersion:2,regionRef:{...countyRef,catalogVersion:'cn-admin-2024-old'}},drafts=new Map([['topic-advisor:v1:account-a',{ownerId:'account-a',dirty:true,snapshot:{profile:old,candidate:null,analysisProfile:old,selectedId:'keep-id',compareIds:['keep-id']}}]]);
  const s=make({managed:false,initialDrafts:drafts});await s.settle();assert.equal(s.picker().props.regionRef.catalogVersion,'cn-admin-2024-old');assert.ok(label(s.tree).includes('原地区引用已保留'));assert.equal(button(s,'发现适合我的方向↗').props.disabled,true);const cached=drafts.get('topic-advisor:v1:account-a').snapshot;assert.equal(cached.selectedId,'keep-id');assert.deepEqual(plain(cached.compareIds),['keep-id']);s.picker().props.onChange(countyRef);await s.settle();assert.equal(button(s,'发现适合我的方向↗').props.disabled,false);s.unmount();
});
test('opening an old-region backup preserves handwritten fields and requires explicit migration',async()=>{
  const old={...profile,schemaVersion:2,regionRef:{...countyRef,catalogVersion:'cn-admin-2024-old'}},candidate={...topic.EMPTY_TOPIC_CANDIDATE,title:'手写候选题，保留'};
  const s=make({managed:false});await s.settle();await s.importBackup({kind:'evix-topic-advisor',schemaVersion:1,ownerId:'account-a',exportedAt:'2026-10-15T06:00:00Z',contentVersion:'old',modelVersion:'old',draft:{schemaVersion:2,profile:old,candidate},analysisProfile:old,compareIds:['keep-id'],selectedId:'keep-id'});assert.ok(label(s.tree).includes('原地区引用和候选已保留'));const saved=s.drafts.get('topic-advisor:v1:account-a').snapshot;assert.equal(saved.candidate.title,candidate.title);assert.equal(saved.selectedId,'keep-id');assert.equal(saved.profile.regionRef.catalogVersion,'cn-admin-2024-old');s.unmount();
});
test('Wuhan exploration is an explicit city choice with all school and channels still unknown',async()=>{
  const s=make();await s.settle();button(s,'从武汉开始探索 →').props.onClick();await s.settle();const next=s.changes.at(-1).profile;assert.deepEqual(next.regionRef,{code:'420100',catalogVersion:topic.TOPIC_REGION_CATALOG.catalogVersion});assert.equal(next.schemaVersion,2);assert.equal(next.school,'');assert.deepEqual(next.access,{});assert.deepEqual(next.resources,{});s.unmount();
});
