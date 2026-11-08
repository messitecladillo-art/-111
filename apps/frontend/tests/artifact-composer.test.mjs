import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../components/agent/Composer.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const slots=[],layouts=[],effects=[],timers=new Map(),sent=[];let index=0,id=0,tree,writer;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(initial){const i=index++;return slots[i]??={current:initial};}};
 for(const [name,queue]of [['useLayoutEffect',layouts],['useEffect',effects]])hooks[name]=(fn,deps)=>{const i=index++,old=slots[i];if(!old||!same(old.deps,deps))queue.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});};
 const jsx=(type,props,key)=>({type,key,props:props??{}}),exports={};
 vm.runInNewContext(compiled,{exports,require:name=>name==='react'?hooks:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='next/link'?{default:'a'}:name.includes('/router')?{matchCommands:()=>[]}:name==='./icons'?{Icon:'Icon'}:{default:{}},window:{setTimeout:fn=>{timers.set(++id,fn);return id;},addEventListener(){},removeEventListener(){}},document:{getElementById:()=>null}});
 const inputRef={current:{style:{},scrollHeight:40,focus(){}}};let register=write=>{writer=write;return()=>{writer=null;};};
 const props={onSend:text=>sent.push(text),inputRef,account:'ready',onNeedLists(){},projects:[],projectId:'a',onProject(){},services:[],serviceId:'',onService(){},mode:'command',onMode(){},chatLabel:'',onOpen(){}};
 const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}return null;}return predicate(node)?node:find(node.props?.children,predicate);};
 const h={sent,render(){index=0;layouts.length=0;effects.length=0;tree=exports.default({...props,onDraftWriter:register});for(const fn of layouts.splice(0))fn();for(const fn of effects.splice(0))fn();return tree;},input:()=>find(tree,n=>n.type==='textarea').props,insert:text=>writer(text),flush(){for(const [key,fn]of [...timers]){timers.delete(key);fn();}h.render();},changeScope(){register=write=>{writer=write;return()=>{writer=null;};};h.render();},unmount(){for(const slot of slots)slot?.cleanup?.();}};
 h.render();return h;
}
test('IME-completed commands preserve current unsent text and never auto-send',()=>{
 const h=harness();h.input().onChange({target:{value:'原草稿'}});h.render();h.input().onCompositionStart();assert.equal(h.insert('素材精确版本修改指令'),true);h.input().onCompositionEnd();h.input().onChange({target:{value:'原草稿中文'}});h.render();h.flush();assert.equal(h.input().value,'原草稿中文\n\n素材精确版本修改指令');assert.equal(h.sent.length,0);
});
test('scope replacement revokes an already queued composition completion timer',()=>{
 const h=harness();h.input().onChange({target:{value:'保留草稿'}});h.render();h.input().onCompositionStart();h.insert('旧项目素材指令');h.input().onCompositionEnd();h.changeScope();h.flush();assert.equal(h.input().value,'保留草稿');assert.equal(h.sent.length,0);
});
test('unmount revokes queued composition completion rather than mutating the retired composer',()=>{
 const h=harness();h.input().onCompositionStart();h.insert('旧标签内容');h.input().onCompositionEnd();h.unmount();h.flush();assert.equal(h.input().value,'');assert.equal(h.sent.length,0);
});
