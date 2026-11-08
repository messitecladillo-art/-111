import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareResearchIntake } from '../lib/agent/research-intake.ts';
import { prepareTopicDiagnosis } from '../lib/agent/research-plan.ts';
import { diagnoseProject } from '../lib/project-diagnosis.ts';
import { proposeTopicProfile } from '../lib/topic-agent/index.ts';
import { EMPTY_TOPIC_PROFILE } from '../lib/topic-advisor/types.ts';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import { prepareDiagnosisBrief, applyDiagnosisBrief } from '../lib/diagnosis-actions.ts';

test('confirmed intake actually invokes the shared diagnosis and yields an applicable, proposed brief', async()=>{
  const message='我在武汉市，预算500元，有30天，可以联系商户。想研究湖北地方特产。';
  const profile=proposeTopicProfile(EMPTY_TOPIC_PROFILE,message).profile;
  const intake=await prepareResearchIntake(message,profile,null);
  assert.ok(intake.candidates.length);
  const document=intake.candidates[0].document, before=structuredClone(document);
  const diagnosis=prepareTopicDiagnosis(document,'local-confirmation-1');
  assert.deepEqual(diagnosis.result,diagnoseProject(diagnosis.source.input));
  assert.equal(diagnosis.source.input.evidenceStatus,'proposed');
  assert.equal(diagnosis.source.input.stage,'intake');
  assert.equal(diagnosis.source.input.geography,document.brief.geography);
  const design=newQuestionnaire();
  const proposal=prepareDiagnosisBrief(diagnosis.source,design);
  const changed=applyDiagnosisBrief(proposal,diagnosis.source,design,['title','geography','objective']);
  assert.equal(changed.title,document.brief.title);
  assert.match(changed.objective,new RegExp(document.brief.decisionOwner));
  assert.deepEqual(document,before);
  assert.notEqual(changed,design);
});

test('unknown geography, blank decisions and overlong titles block diagnosis rather than fabricate fields', async()=>{
  const intake=await prepareResearchIntake('想研究地方特产',structuredClone(EMPTY_TOPIC_PROFILE),null);
  assert.ok(intake.candidates.length);
  const document=intake.candidates[0].document;
  assert.throws(()=>prepareTopicDiagnosis({...document,brief:{...document.brief,geography:''}}),/调查地区/);
  assert.throws(()=>prepareTopicDiagnosis({...document,brief:{...document.brief,title:'长'.repeat(121)}}),/题目/);
  assert.throws(()=>prepareTopicDiagnosis({...document,brief:{...document.brief,geography:'武汉市'}},''),/来源版本|为空/);
  assert.throws(()=>prepareTopicDiagnosis({...document,brief:{...document.brief,decisionOwner:''}}),/决策主体/);
});
