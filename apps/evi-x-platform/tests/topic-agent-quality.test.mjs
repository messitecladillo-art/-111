import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMPTY_TOPIC_PROFILE } from '../lib/topic-advisor/types.ts';
import { runLocalTopicAgent, interpretTopicResearchFocus, buildTopicFirstWeekPlan } from '../lib/topic-agent/index.ts';
import { topicResearchScopeIssue } from '../lib/topic-agent/research.ts';
const catalog=JSON.parse(fs.readFileSync(new URL('../content/topic-advisor/catalog.json',import.meta.url),'utf8'));
const domain=id=>catalog.patterns.find(row=>row.id===id)?.domain;
const profile=()=>({...structuredClone(EMPTY_TOPIC_PROFILE),region:'湖北',city:'武汉',referenceDate:'2026-10-19'});
const ask=(message,more={})=>runLocalTopicAgent({profile:profile(),message,intent:'recommend',...more});

test('specific employment focus outranks repeated city terms, without guessing team resources',async()=>{
  const p=profile(),before=structuredClone(p),turn=await ask('武汉武汉，请推荐武汉就业相关的选题',{profile:p});
  assert.ok(turn.assistant.items.length>0);assert.ok(turn.assistant.items.every(item=>domain(item.patternId)==='employment'));
  assert.deepEqual(p,before);assert.deepEqual(turn.profile.access,{});assert.deepEqual(turn.profile.resources,{});
});
test('multiple subjects retain representation; a specific phrase does not become a broad nested subject',async()=>{
  const turn=await ask('就业与文化消费，各给我一些可研究的方向');
  const domains=turn.assistant.items.map(item=>domain(item.patternId));
  assert.ok(domains.includes('employment'));assert.ok(domains.includes('entertainment'));assert.ok(!domains.includes('economy'));
});
test('explicit exclusion, postposed exclusion and broadening have different meanings',async()=>{
  const exclude=await ask('不要就业和金融，其他都行');
  assert.ok(exclude.assistant.items.length>0);assert.ok(exclude.assistant.items.every(item=>!['employment','finance'].includes(domain(item.patternId))));
  assert.deepEqual(interpretTopicResearchFocus('就业除外，推荐其他方向',profile()).excluded,['employment']);
  assert.ok(!interpretTopicResearchFocus('不要只研究就业，也看看文旅',profile()).excluded.includes('employment'));
  assert.ok(!interpretTopicResearchFocus('不是不想做就业',profile()).excluded.includes('employment'));
});
test('English subjects have word boundaries and mixed-language queries keep their intended field',async()=>{
  const turn=await ask('Please recommend employment topics in 武汉');
  assert.ok(turn.assistant.items.length>0);assert.ok(turn.assistant.items.every(item=>domain(item.patternId)==='employment'));
  assert.ok(!interpretTopicResearchFocus('retail',profile()).included.includes('technology'));
});
test('explicit subject switch reroutes ordinary refinement, but an ordinary follow-up preserves the chosen IDs',async()=>{
  const first=await ask('推荐就业方向');
  const compare=await ask('比较这些方向的执行难度',{previous:first,intent:'compare'});
  assert.deepEqual(compare.candidateIds,first.candidateIds);
  const switcher=await ask('换成文旅方向，继续细化',{previous:first,intent:'refine'});
  assert.ok(switcher.assistant.items.length>0);assert.ok(switcher.assistant.items.every(item=>domain(item.patternId)==='tourism'));
  assert.equal(switcher.parentTurnId,first.id);
});
test('unsupported concrete themes ask for scope and sources without inventing adjacent recommendations',async()=>{
  const turn=await ask('想研究量子引力波探测器的校准误差');
  assert.equal(turn.assistant.items.length,0);assert.ok(turn.assistant.questions.length>0);
  assert.match(turn.assistant.text,/资料库没有/);assert.equal(turn.sources.length,0);
});
test('explicit selections and hard feasibility retain authority over subject heuristics',async()=>{
  const selected=await ask('推荐就业方向',{candidateIds:['p24-wuhan-community-sport']});
  assert.deepEqual(selected.candidateIds,['p24-wuhan-community-sport']);assert.ok(selected.assistant.questions.some(q=>q.includes('当前所选方向')));
  const blocked=await ask('我很想做就业方向',{profile:{...profile(),access:{jobseekers:'unavailable'}}});
  assert.ok(blocked.assistant.items.every(item=>domain(item.patternId)!=='employment'));
});
test('plan proposals contain five actual actions, traceable outputs and a keep/narrow/change checkpoint',async()=>{
  const turn=await ask('就业方向第一周怎么做',{intent:'plan'});
  assert.ok(turn.assistant.items.length>0);
  for(const item of turn.assistant.items){
    assert.equal(item.firstWeekPlan.length,5);
    assert.match(item.firstWeekPlan[0],/确认入口.*同意方式/);
    assert.match(item.firstWeekPlan[1],/原始链接.*未核实项/);
    assert.match(item.firstWeekPlan[3],/获得同意后.*修改前后版本/);
    assert.match(item.firstWeekPlan[4],/支持、反例和证据缺口.*保留、缩小范围或换题/);
    assert.ok(item.firstWeekPlan.every(step=>step.length<=300));
  }
  const p=structuredClone(catalog.patterns[0]);p.question='🧭'.repeat(400);
  const plan=buildTopicFirstWeekPlan(profile(),p);assert.ok(plan.every(step=>step.length<=300&&!/[\uD800-\uDBFF]$/.test(step)));
});
test('refinement asks a concrete boundary question rather than asserting a new subgroup',async()=>{
  const turn=await ask('就业研究问题继续细化',{intent:'refine'});
  assert.ok(turn.assistant.questions.some(question=>/明确人群、使用情境/.test(question)));
  assert.equal(turn.profile.school,'');assert.deepEqual(turn.profile.access,{});
});

test('disclosed review failures remain topical across ordinary wording, English and specific research objects',async()=>{
  for(const [message,expected] of [
    ['武汉应届生找工作有哪些值得调查的问题？','employment'],
    ['Wuhan graduate recruitment and job seeking services','employment'],
    ['small business digital transformation adoption barriers','technology'],
    ['汉超看球的人为什么看完就走，体育赛事能带来什么？','sports'],
    ['想调查居民健身时段和社区运动场的使用冲突。','sports'],
    ['tourism visitors and the last-bus return experience','tourism'],
    ['NO tourism please. Focus on employment and job search.','employment'],
    ['武汉武汉，武汉本地，我最关心武汉毕业生就业与招聘。','employment'],
    ['校招时投了很多简历，面试反馈少，这个能做选题吗？','employment'],
    ['球迷比赛散场后为什么不在周边消费？','sports'],
    ['校园办事小程序层层跳转，学生使用体验能研究吗？','technology'],
  ]){
    const turn=await ask(message);assert.ok(turn.assistant.items.length>0,message);
    assert.equal(domain(turn.assistant.items[0].patternId),expected,message);
  }
  const first=await ask('先看看武汉消费券的使用问题。');
  const switched=await ask('我改主意了，不看消费券，现在只研究就业服务。',{previous:first,intent:'compare'});
  assert.ok(switched.assistant.items.length>0);assert.ok(switched.assistant.items.every(item=>domain(item.patternId)==='employment'));
});

test('unsupported requested deliverables clarify scope even when a broad catalog domain matches',async()=>{
  for(const message of ['AI模型梯度收敛证明，不做市场调查','旅游行业机翼气动设计和湍流方程求解','生物领域临床随机试验，比较人体用药疗效','我要做算法正确性证明，不接触用户消费场景。','生物化学里的药物分子结构合成路线，要设计实验反应工艺。']){
    const turn=await ask(message,{profile:{...profile(),sensitiveData:'review_required'}});
    assert.equal(turn.assistant.items.length,0,message);assert.equal(turn.sources.length,0,message);
    assert.ok(turn.assistant.questions.length>0,message);assert.match(turn.assistant.text,/当前方向库没有/);
    const selected=await ask(message,{candidateIds:['p03-campus-digital']});
    assert.deepEqual(selected.candidateIds,['p03-campus-digital']);assert.equal(selected.assistant.items.length,0);
    assert.ok(!selected.assistant.text.includes('不可行')); // scope is distinct from a resource/access blocker
  }
});
test('negated and referential technical tasks remain eligible for service or understanding surveys',()=>{
  for(const message of [
    '不做梯度收敛证明，只研究AI客服使用体验',
    '不开展临床试验，只研究中试咨询服务体验',
    '不进行临床实验，只调查用户服务需求',
    '不实施人体用药，调查就医体验',
    '无需机翼设计，只研究游客服务需求',
    '不用求解方程，调查居民对算法的理解',
    '调查居民对开展临床试验的认知',
    '研究大学生对方程求解工具的使用体验',
    '调查用户对空气动力设计软件的使用体验',
    '调查用户对分子合成工具的使用体验',
    '不设计分子合成路线，只调查中试服务需求',
    '不合成药物分子，只调查中试服务需求',
    '不证明收敛定理，只研究AI服务需求',
  ]) assert.equal(topicResearchScopeIssue(message),null,message);
  assert.equal(topicResearchScopeIssue('调查居民认知并开展临床试验'),'临床实验或用药疗效验证');
  assert.equal(topicResearchScopeIssue('调查用户体验，同时请帮我求解方程'),'数学证明或方程求解');
  assert.equal(topicResearchScopeIssue('不是不证明收敛定理'),'数学证明或方程求解');
});
