import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtypicaFlowBlueprint, FLOW_CHECKLIST_STEPS, RIGHT_VIEW_OPTIONS } from '../lib/silicon/live-flow.ts';
import { siliconExampleQuestionnaire } from '../lib/silicon/example.ts';
import { generatePanel, PANEL_TEMPLATES } from '../lib/silicon/persona.ts';
import { demoRun } from '../lib/silicon/run.ts';

test('Atypica 1:1 live flow blueprint synthesizes all 11 views and grounds metrics in real EVI-X silicon run', () => {
  const design = siliconExampleQuestionnaire();
  const attributes = PANEL_TEMPLATES.students.attributes;
  const personas = generatePanel({ attributes, size: 24, allocation: 'quota', seed: 9, background: '在校大学生' });
  const settings = {
    engine: 'demo',
    memory: 'carry',
    shuffleOptions: false,
    scenarios: [{ id: 's1', label: '晚间高峰', text: '周末晚间高峰时段' }],
    models: [],
  };
  const run = demoRun(design, attributes, personas, settings, new Date('2026-11-18T00:00:00Z'));

  const bp = buildAtypicaFlowBlueprint({ design, attributes, personas, settings, run });

  assert.equal(FLOW_CHECKLIST_STEPS.length, 11);
  assert.equal(RIGHT_VIEW_OPTIONS.length, 11);
  assert.equal(bp.enrichedPersonas.length, 24);
  assert.equal(bp.studyTitle, design.title);
  assert.ok(bp.planCard.goals.length >= 3);
  assert.ok(bp.evidenceCards.length >= 4);
  assert.ok(bp.groundingFindings.length >= 2);
  assert.ok(bp.discussionTurns.length >= 5);
  assert.ok(bp.discussionTurns.some(t => t.speakerType === 'persona' && Boolean(t.routingReason)));

  for (const roundKey of ['interview_1', 'interview_2', 'interview_3']) {
    const round = bp.interviewRounds[roundKey];
    assert.ok(round.questions.length >= 1, `${roundKey} should contain questions`);
    assert.ok(round.matrixRows.length === 10, `${roundKey} spotlight matrix should track 10 respondents`);
    const firstPid = round.respondentIds[0];
    assert.ok(round.transcriptsByPersona[firstPid].length === round.questions.length);
  }

  assert.equal(bp.report.metrics.responses, 24);
  assert.ok(bp.report.personaSnap.length >= 4);
  assert.ok(bp.report.followupChips.length === 3);

  // Hygiene & UX integrity checks: no dev jargon or static-pilot checklist boilerplate exposed
  const checklistText = bp.report.actionChecklist.join('\n');
  assert.ok(!checklistText.includes('核对变量插槽'));
  assert.ok(!checklistText.includes('填了文字也不代表预试已验证'));
  assert.ok(!bp.interviewRounds.interview_1.matrixHeader.some(h => h.includes('personaId')));
  assert.ok(!bp.deepResearchSections.some(s => s.body.includes('stageLayout()')));
  assert.ok(!bp.planCard.methods.some(m => m.includes('personaId')));
});

test('Agent router and studios integrate Atypica × silicon theater seamlessly without breaking existing room commands', async () => {
  const { route } = await import('../lib/agent/router.ts');
  const { illuminate } = await import('../lib/agent/illumination.ts');
  const { buildSiliconTheaterCardData } = await import('../lib/agent/studios.ts');

  const design = siliconExampleQuestionnaire();
  const baseCtx = { room: null, light: illuminate({ design: null, dataset: null, report: null, resultPending: false }), traces: [] };

  const slashRouted = route('/硅基推演 川渝辣文化体验', baseCtx);
  assert.ok('turn' in slashRouted);
  assert.equal(slashRouted.turn.cards[0].kind, 'silicon-theater');
  assert.equal(slashRouted.turn.chips[0].action.type, 'siliconTheater');

  const nlpRouted = route('用 Atypica 硅基样本做个 1:1 实时推演', baseCtx);
  assert.ok('turn' in nlpRouted);
  assert.equal(nlpRouted.turn.cards[0].kind, 'silicon-theater');

  // Plain room command still opens right-hand SiliconLab panel cleanly and offers theater chip
  const openRoom = route('打开硅基样本', baseCtx);
  assert.ok('turn' in openRoom);
  assert.deepEqual(openRoom.turn.act, { type: 'open', room: 'silicon' });
  assert.equal(openRoom.turn.chips[0].action.type, 'siliconTheater');

  // Card questionCount matches actual auto-built demo questionnaire (20) when unbound
  const unboundCard = buildSiliconTheaterCardData(baseCtx, '高校图书馆空间满意度');
  assert.equal(unboundCard.hasBoundDesign, false);
  assert.equal(unboundCard.questionCount, 20);

  const studentCard = buildSiliconTheaterCardData(
    { ...baseCtx, design, projectTitle: '大学生校园 AI 学习助手满意度调查' },
    '',
  );
  assert.equal(studentCard.templateKey, 'students');
  assert.equal(studentCard.hasBoundDesign, true);
  assert.equal(studentCard.questionCount, design.questions.length);

  const seniorCard = buildSiliconTheaterCardData(baseCtx, '银发群体社区助餐服务满意度');
  assert.equal(seniorCard.templateKey, 'seniors');

  // Demographic aliases and age/gender choices stay consistent with persona traits
  const { buildDemoQuestionnaire, decomposeTopic } = await import('../lib/agent/demo-study.ts');
  const { synthesizePersonaProfile } = await import('../lib/silicon/persona.ts');
  const attrs = PANEL_TEMPLATES.residents.attributes;
  const panel = generatePanel({ attributes: attrs, size: 24, allocation: 'quota', seed: 42, background: '城市居民' });
  for (const p of panel) {
    const prof = synthesizePersonaProfile(p, attrs);
    if (p.traits.gender === '女') {
      assert.ok(!/老周|陈先生|大伟|周伯|陈叔|张工|赵明/u.test(prof.alias), `unexpected male alias ${prof.alias} for female persona`);
    }
    if (p.traits.gender === '男') {
      assert.ok(!/陈姐|陈奶奶|周阿姨|刘阿姨|许芳|若晴/u.test(prof.alias), `unexpected female alias ${prof.alias} for male persona`);
    }
  }
  const demoDesign = buildDemoQuestionnaire(decomposeTopic('社区养老服务体验'));
  const residentRun = demoRun(demoDesign, attrs, panel, { engine: 'demo', memory: 'carry', shuffleOptions: false, scenarios: [], models: [] }, new Date('2026-11-18T00:00:00Z'));
  const q13 = demoDesign.questions.find(q => q.variable === 'Q13');
  assert.ok(q13);
  for (const r of residentRun.responses) {
    const p = panel.find(x => x.id === r.personaId);
    const ans13 = r.answers.find(a => a.questionId === q13.id);
    if (p?.traits.age === '18–24岁' && ans13?.value) {
      assert.equal(ans13.value, '1', '18-24 persona must choose 18-24 option on Q13');
    }
  }
});
