import test from 'node:test';
import assert from 'node:assert/strict';
import {newAgentSession,agentOwner,agentCookie,assertAgentOrigin} from '../lib/agent-session.ts';
const secret=crypto.getRandomValues(new Uint8Array(32));
const now=Date.UTC(2026,9,7,0,0,0);
function request(token, options={}) { return new Request('https://app.example/api/agent/services',{method:options.method||'GET',headers:{cookie:`evix_agent_session=${token}`,origin:'https://app.example',...options.headers}}); }
test('signed sessions isolate owners and remain stable across requests',async()=>{
  const one=await newAgentSession(secret,now), two=await newAgentSession(secret,now);
  const owner=await agentOwner(request(one),secret,now);
  assert.match(owner,/^[0-9a-f]{64}$/); assert.equal(owner,await agentOwner(request(one),secret,now+1000));
  assert.notEqual(owner,await agentOwner(request(two),secret,now));
});
test('forged expiry, wrong secret, expired and future sessions are rejected',async()=>{
  const token=await newAgentSession(secret,now);
  await assert.rejects(()=>agentOwner(request(token.replace('.179', '.189')),secret,now));
  await assert.rejects(()=>agentOwner(request(token),crypto.getRandomValues(new Uint8Array(32)),now));
  await assert.rejects(()=>agentOwner(request(token),secret,now+31*86400000));
  await assert.rejects(()=>agentOwner(request(token),secret,now-60000));
});
test('mutations require exact Origin and reject alternate untrusted identities',async()=>{
  const token=await newAgentSession(secret,now);
  await assert.rejects(()=>agentOwner(request(token,{method:'POST',headers:{origin:'https://attacker.example'}}),secret,now));
  assert.throws(()=>assertAgentOrigin(new Request('https://app.example/api/agent/session',{method:'POST'})));
  for(const header of ['x-client-key','oai-authenticated-user-id','oai-authenticated-user-email']) await assert.rejects(()=>agentOwner(request(token,{headers:{[header]:'forged'}}),secret,now));
  await assert.rejects(()=>agentOwner(request(token,{headers:{cookie:`evix_agent_session=${token}; evix_agent_session=${token}`}}),secret,now));
});
test('cookie is HttpOnly, Strict, API scoped, Secure outside loopback',async()=>{
  const token=await newAgentSession(secret,now);
  const cookie=agentCookie(request(token,{method:'POST'}),token);
  for(const text of ['HttpOnly','SameSite=Strict','Path=/api/agent','Secure']) assert.ok(cookie.includes(text));
  assert.throws(()=>assertAgentOrigin(new Request('http://app.example/api/agent/session',{method:'POST',headers:{origin:'http://app.example'}})));
});
