import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as topic from '../lib/topic-advisor/index.ts';
import {parseTopicBundle} from '../lib/topic-advisor/parse.ts';

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
function make({pinnedComparisonId='',shortlistIds=[],managed=true}={}){
  let cells=[],index=0,effects=[],dirty=true,tree,alive=true;
  const changes=[],drafts=new Map();
  let props={initialWorkspace:{profile,candidate:null,shortlistIds,selectedId:''},workspaceRevision:0,pinnedComparisonId,...(managed?{onWorkspaceChange:workspace=>changes.push(plain(workspace))}:{})};
  const hooks={useState(initial){const at=index++;if(!cells[at])cells[at]={value:typeof initial==='function'?initial():initial};return[cells[at].value,value=>{assert.ok(alive);const next=typeof value==='function'?value(cells[at].value):value;if(!Object.is(next,cells[at].value)){cells[at].value=next;dirty=true;}}];},useRef(initial){const at=index++;return cells[at]??={current:initial};},useEffect(fn,deps){const at=index++;if(!cells[at]||!sameDeps(cells[at].deps,deps)){const old=cells[at];cells[at]={deps};effects.push(()=>{old?.cleanup?.();cells[at].cleanup=fn();});}}};
  const wrapped={...topic};for(const name of['parseTopicDraft','profileFingerprint','recommendTopics','evaluateCandidate','eventLeadsForProfile'])wrapped[name]=(...args)=>topic[name](...args.map(plain));
  const jsx=(type,props,key)=>({type,props,key});
  const imports={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/hosted/HostedSession':{useHostedSession:()=>({session:{user:{id:'account-a'}},identityEpoch:1,getDraft:key=>drafts.get(key),cacheDraft:(key,value)=>drafts.set(key,value),setUnsaved(){},isCurrentAccount:()=>true})},'@/components/workbench/shell-kit':{useWorkbenchTheme:()=> 'light'},'@/lib/topic-advisor':wrapped,'@/lib/topic-advisor/client-bundle':{TOPIC_BUNDLE:bundle},'./TopicAdvisor.module.css':{default:{}},'./draft':{readTopicBackup(){throw Error('unused');},MAX_TOPIC_BACKUP_BYTES:128000}};
  // Stable auth callbacks mirror the real context and prevent false rerender loops.
  const auth=imports['@/components/hosted/HostedSession'].useHostedSession();imports['@/components/hosted/HostedSession'].useHostedSession=()=>auth;
  const box={exports:{},require:name=>{assert.ok(name in imports,name);return imports[name];},JSON,Date,Intl,console,crypto,structuredClone,queueMicrotask,document:{getElementById:()=>null}};vm.runInNewContext(compiled,box);
  const s={get tree(){return tree;},changes,drafts,async settle(){for(let n=0;n<40;n++){index=0;dirty=false;tree=box.exports.default(props);const queue=effects;effects=[];queue.forEach(fn=>fn());await tick();if(!dirty&&!effects.length)return;}throw Error('Unstable effects');},update(patch){props={...props,...patch};},async recommend(){button(s,'发现适合我的方向↗').props.onClick();await s.settle();},checkbox(id){const item=nodes(tree).find(v=>v.type==='article'&&v.key===id);assert.ok(item,id);return nodes(item).find(v=>v.type==='input'&&v.props.type==='checkbox');},unmount(){cells.forEach(c=>c.cleanup?.());alive=false;}};return s;
}

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
