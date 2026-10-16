import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseTopicBundle} from '../lib/topic-advisor/parse.ts';
import {assessTopicPattern,recommendTopics,eventLeadsForProfile} from '../lib/topic-advisor/core.ts';
import {EMPTY_TOPIC_PROFILE,ACCESS_OPTIONS,RESOURCE_OPTIONS} from '../lib/topic-advisor/types.ts';
const load=n=>JSON.parse(readFileSync(new URL(`../content/topic-advisor/${n}.json`,import.meta.url)));
const bundle=parseTopicBundle({catalog:load('catalog'),sources:load('sources'),events:load('hotspot-events'),model:load('ranker')});
const frozenHash='048412a3a0bf9188625635d6ad53e6ec4b1fe5303246f5dff40868a77cc12ac8';
const profile=(p={})=>({...structuredClone(EMPTY_TOPIC_PROFILE),region:'湖北',city:'武汉',referenceDate:'2026-10-15',...p});
const assess=(id,p)=>assessTopicPattern(bundle.catalog.patterns.find(x=>x.id===id),profile(p),bundle);
const full={days:60,budgetYuan:5000,sensitiveData:'approved',access:Object.fromEntries(ACCESS_OPTIONS.map(x=>[x.id,'confirmed'])),resources:Object.fromEntries(RESOURCE_OPTIONS.map(x=>[x.id,'confirmed']))};
// Independent post-freeze behavioral scenarios. No training pairs or fit function imported.
const checks=[
 ['学校名称不代替渠道',()=>assert.equal(assess('p01-campus-food',{school:'武汉大学'}).feasibility,'conditional')],
 ['学校更名不影响排序',()=>assert.deepEqual(recommendTopics(profile({school:'学校甲'}),bundle).items.map(x=>[x.patternId,x.rankScore]),recommendTopics(profile({school:'学校乙'}),bundle).items.map(x=>[x.patternId,x.rankScore]))],
 ['武汉背景不自动可行',()=>assert.ok(recommendTopics(profile(),bundle).items.every(x=>x.feasibility==='conditional'))],
 ['已知不可招募阻断',()=>assert.equal(assess('p01-campus-food',{...full,access:{...full.access,campus_students:'unavailable'}}).feasibility,'blocked')],
 ['可能渠道保持待确认',()=>assert.equal(assess('p01-campus-food',{...full,access:{...full.access,campus_students:'possible'}}).feasibility,'conditional')],
 ['零天阻断',()=>assert.equal(assess('p09-wuhan-coupons',{...full,days:0}).feasibility,'blocked')],
 ['低于预算下限阻断',()=>assert.equal(assess('p10-wuhan-sports',{...full,budgetYuan:999}).feasibility,'blocked')],
 ['最低资源不被过高评分覆盖',()=>assert.ok(!recommendTopics(profile({...full,resources:{...full.resources,interviews:'unavailable'}}),bundle).items.length)],
 ['湖北省级主题不能移植江苏',()=>assert.equal(assess('p14-hubei-biotech-service',{...full,region:'江苏',city:'南京'}).feasibility,'blocked')],
 ['苏州地方线索不当武汉',()=>assert.equal(assess('p18-suzhou-inbound',full).feasibility,'blocked')],
 ['敏感设置独立阻断',()=>assert.equal(assess('p14-hubei-biotech-service',{...full,sensitiveData:'avoid'}).feasibility,'blocked')],
 ['敏感待审不是批准',()=>assert.equal(assess('p14-hubei-biotech-service',{...full,sensitiveData:'review_required'}).feasibility,'conditional')],
 ['未知预算保留缺口',()=>assert.equal(assess('p09-wuhan-coupons',{...full,budgetYuan:null}).feasibility,'conditional')],
 ['确认基础资源可推进',()=>assert.equal(assess('p09-wuhan-coupons',full).feasibility,'ready')],
 ['未知日期不显示当前热点',()=>assert.ok(eventLeadsForProfile(profile({referenceDate:''}),bundle.events,bundle.sources).every(x=>x.temporalStatus!=='current'))],
 ['未发表事件不能回溯成已知',()=>assert.ok(eventLeadsForProfile(profile({referenceDate:'2025-01-01'}),bundle.events,bundle.sources).every(x=>x.temporalStatus!=='current'))],
 ['过期线索停止加分',()=>assert.ok(eventLeadsForProfile(profile({referenceDate:'2035-01-01'}),bundle.events,bundle.sources).every(x=>x.temporalStatus!=='current'))],
 ['领域过滤尊重用户选择',()=>assert.ok(eventLeadsForProfile(profile({domains:['sports']}),bundle.events,bundle.sources).every(x=>x.domain==='sports'))],
 ['全国线索注明本地待核',()=>assert.ok(eventLeadsForProfile(profile(),bundle.events,bundle.sources).filter(x=>x.geography.level==='national').every(x=>x.geographyReason.includes('当地影响尚待验证')))],
 ['零命中城市不借用武汉线索',()=>assert.ok(eventLeadsForProfile(profile({city:'未知城市'}),bundle.events,bundle.sources).every(x=>x.geography.level!=='city'))],
 ['未来日程不写作已发生',()=>assert.ok(eventLeadsForProfile(profile(),bundle.events,bundle.sources).filter(x=>x.eventDate>'2026-10-15').every(x=>x.limitations.some(y=>y.includes('尚未到达'))))],
 ['每条推荐有研究问题和决策方',()=>assert.ok(recommendTopics(profile(),bundle).items.every(x=>x.question&&x.decisionOwner&&x.decision))],
 ['每条推荐来源可追溯',()=>assert.ok(recommendTopics(profile(),bundle).items.every(x=>x.sourceIds.length&&x.sourceIds.every(id=>bundle.sources.sources.some(s=>s.id===id))))],
 ['独立评测未改冻结模型',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../content/topic-advisor/ranker.json',import.meta.url))).digest('hex'),frozenHash)],
];
for(const [name,check] of checks)test(`独立验收：${name}`,check);
