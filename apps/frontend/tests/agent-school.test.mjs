import test from 'node:test';
import assert from 'node:assert/strict';
import {NET_RADIUS,castNet,catchText,createSchool,fishFor,glyph,resizeSchool,stepSchool} from '../lib/agent/school.ts';
const run=(school,seconds)=>{for(let i=0;i<seconds*60;i++)stepSchool(school,1/60);};
test('a seed always swims the same way, and the school stays in the water',()=>{
  const a=createSchool(900,600),b=createSchool(900,600);run(a,5);run(b,5);
  assert.deepEqual(a.fish.map(f=>[f.x,f.y]),b.fish.map(f=>[f.x,f.y]));
  assert.equal(a.fish.length,fishFor(900,600));
  assert.ok(a.fish.every(f=>f.x>=0&&f.x<900&&f.y>=0&&f.y<600&&Number.isFinite(f.vx)&&Number.isFinite(f.vy)));
});
test('the school is neither crowded in a small window nor empty in a large one',()=>{
  assert.equal(fishFor(200,150),18);assert.equal(fishFor(4000,3000),80);
});
test('a net counts exactly the fish it lands on and says so',()=>{
  const s=createSchool(900,600),x=450,y=300;
  const inside=s.fish.filter(f=>Math.hypot(f.x-x,f.y-y)<=NET_RADIUS).length;
  assert.equal(castNet(s,x,y),inside);
  assert.equal(s.fish.filter(f=>f.caughtUntil>s.time).length,inside);
  assert.equal(catchText(7),'这一网抽到 7 尾');assert.equal(catchText(0),'这一网落空了');
  run(s,3);assert.equal(s.catches.length,0,'the label fades');assert.equal(s.ripples.length,0);
});
test('fish swim away from the cursor and around the page words',()=>{
  const s=createSchool(900,600);s.pointer={x:450,y:300,active:true};run(s,4);
  assert.ok(s.fish.every(f=>Math.hypot(f.x-450,f.y-300)>20),'none lingers under the cursor');
  const t=createSchool(900,600);t.keepOut={x:300,y:220,width:300,height:160};run(t,6);
  const inside=t.fish.filter(f=>f.x>320&&f.x<580&&f.y>240&&f.y<360).length;
  assert.ok(inside<=Math.ceil(t.fish.length*0.08),`${inside} of ${t.fish.length} fish over the words`);
});
test('a resize carries the fish into the new bounds, and each faces the way it swims',()=>{
  const s=createSchool(900,600);resizeSchool(s,450,300);
  assert.ok(s.fish.every(f=>f.x<450&&f.y<300));
  assert.equal(glyph({vx:1,size:0}),'><>');assert.equal(glyph({vx:-1,size:0}),'<><');assert.equal(glyph({vx:-1,size:1}),"<'))><");
});
test('a school keeps its spacing instead of collapsing into a ball, even when squeezed',()=>{
  // A narrow conversation column (a panel open beside it) with the words across nearly all of it.
  const s=createSchool(380,760);s.keepOut={x:10,y:250,width:360,height:300};run(s,30);
  const gap=f=>Math.min(...s.fish.filter(o=>o!==f).map(o=>Math.hypot((o.x-f.x)/2.2,o.y-f.y)));
  const mean=s.fish.reduce((sum,f)=>sum+gap(f),0)/s.fish.length;
  assert.ok(mean>=12,`mean nearest gap ${mean.toFixed(1)}`);
});
test('a large resize scatters the school over the new room rather than stretching a bunch',()=>{
  const s=createSchool(900,600);for(const f of s.fish){f.x=10+f.x%30;f.y=10+f.y%20;}
  resizeSchool(s,300,600);resizeSchool(s,900,600);
  const xs=s.fish.map(f=>f.x);assert.ok(Math.max(...xs)-Math.min(...xs)>450,'spread across the width again');
});
