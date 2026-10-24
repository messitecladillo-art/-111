import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseQuestionnaire, newQuestionnaire } from '../src/questionnaire.ts';
import { parseSession, parseService, parseProject, parseProposal, parseQuestionnaireHead, parseProposalSummary, parseVersionPage } from '../src/api-types.ts';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/legacy-questionnaire-goldens.json',import.meta.url),'utf8'));
for(const sample of fixtures.cases){
  test(`legacy questionnaire compatibility: ${sample.name}`,()=>{
    if(sample.accepted)assert.deepEqual(parseQuestionnaire(sample.raw),sample.normalized);
    else assert.throws(()=>parseQuestionnaire(sample.raw));
  });
}
test('shared parser remains byte-identical to canonical legacy questionnaire implementation',()=>{
  const shared=readFileSync(new URL('../src/questionnaire.ts',import.meta.url));
  const old=readFileSync(new URL('../../../apps/frontend/lib/questionnaire.ts',import.meta.url));
  assert.equal(createHash('sha256').update(shared).digest('hex'),createHash('sha256').update(old).digest('hex'));
});
const id='550e8400-e29b-41d4-a716-446655440000', timestamp='2026-10-07T09:20:00.123456+00:00';

test('proposal summaries omit design while ready details require it',()=>{
  const summary={id,projectId:id,serviceId:id,serviceRevision:1,inputRevision:0,status:'ready',createdAt:timestamp,title:'摘要'};
  assert.equal(parseProposalSummary(summary).title,'摘要');
  assert.throws(()=>parseProposalSummary({...summary,design:newQuestionnaire()}));
  assert.throws(()=>parseProposal(summary));
});
test('version pages validate bounded descending rows and exact continuation',()=>{
  const row=revision=>({id,revision,title:'合成版本',createdBy:id,createdAt:timestamp});
  assert.equal(parseVersionPage({versions:[row(101),row(100)],nextBeforeRevision:100}).nextBeforeRevision,100);
  assert.throws(()=>parseVersionPage({versions:[row(2),row(3)],nextBeforeRevision:null}));
  assert.throws(()=>parseVersionPage({versions:[row(2)],nextBeforeRevision:1}));
  assert.throws(()=>parseVersionPage({versions:[],nextBeforeRevision:1}));
  assert.throws(()=>parseVersionPage({versions:Array.from({length:101},(_,i)=>row(101-i)),nextBeforeRevision:1}));
});
test('session rejects identity material on logged-out receipts and requires token on login',()=>{
  assert.deepEqual(parseSession({authenticated:false,mode:'local_test'}),{authenticated:false,mode:'local_test'});
  assert.throws(()=>parseSession({authenticated:false,mode:'local_test',csrfToken:'unexpected'}));
  assert.throws(()=>parseSession({authenticated:true,mode:'production',user:{id,email:'a@example.test'}}));
});
test('service receipt rejects any key field and invalid capability/token bounds',()=>{
  const service={id,label:'synthetic',provider:'openai',baseUrl:'https://api.openai.com/v1',model:'fixture',maxOutputTokens:1024,capabilities:['questionnaire'],revision:1};
  assert.deepEqual(parseService(service),service);
  for(const patch of [{apiKey:'never-return'},{keyHint:'suffix'},{maxOutputTokens:4097},{capabilities:['questionnaire','questionnaire']},{revision:'1'}])assert.throws(()=>parseService({...service,...patch}));
});
test('receipt dates reject normalized invalid dates and resources require UUID IDs',()=>{
  const project={id,title:'synthetic',teamId:id,revision:1,createdAt:timestamp};
  assert.deepEqual(parseProject(project),project);
  for(const patch of [{createdAt:'2026-02-30T00:00:00Z'},{id:'question-id'},{revision:0}])assert.throws(()=>parseProject({...project,...patch}));
});
test('ready proposal requires design, zero input revision is valid, unknown state never fabricates design',()=>{
  const base={id,projectId:id,serviceId:id,serviceRevision:1,inputRevision:0,createdAt:timestamp};
  assert.throws(()=>parseProposal({...base,status:'ready'}));
  assert.equal(parseProposal({...base,status:'outcome_unknown'}).design,undefined);
  assert.deepEqual(parseProposal({...base,status:'ready',design:newQuestionnaire()}).design,newQuestionnaire());
});
test('head receipt retains complete questionnaire including empty editable draft',()=>{
  const design=newQuestionnaire(); design.questions=[];
  assert.deepEqual(parseQuestionnaireHead({id,projectId:id,revision:1,design,updatedAt:timestamp}).design,design);
});
