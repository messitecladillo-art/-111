import test from 'node:test';
import assert from 'node:assert/strict';
import {sendAgentLoginCode} from '../lib/agent-mail.ts';
const settings={apiKey:'synthetic-mail-only',from:'login@example.invalid',email:'invited@example.invalid',code:'246801',challengeId:crypto.randomUUID()};
test('email adapter uses pinned destination, single text email and idempotency',async()=>{
  let calls=0;
  await sendAgentLoginCode(settings,async(url,init)=>{
    calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,`Bearer ${settings.apiKey}`);assert.ok(init.headers['idempotency-key']);
    const body=JSON.parse(init.body);assert.deepEqual(body.to,[settings.email]);assert.equal(body.from,settings.from);assert.ok(body.text.includes(settings.code));assert.equal(body.html,undefined);
    return Response.json({id:'synthetic-receipt'});
  });assert.equal(calls,1);
});
test('mail failure and malformed/oversized response return fixed error without credentials',async()=>{
  for(const response of [new Response('upstream-'+settings.apiKey,{status:401}),Response.json({}),new Response('x'.repeat(8200),{status:200})]){
    await assert.rejects(()=>sendAgentLoginCode(settings,async()=>response),e=>e.message==='验证码邮件暂未发出，请稍后重试。');
  }
  await assert.rejects(()=>sendAgentLoginCode({...settings,from:'x\ny@example.invalid'},async()=>{throw new Error('should not call');}));
});
