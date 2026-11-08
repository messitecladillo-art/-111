/** Research tools share the API's calculation. These receipts never advance a competition Gate. */
import { diagnoseProject } from '../project-diagnosis.ts';
import { parseDiagnosisBriefSource, type DiagnosisBriefSource } from '../diagnosis-actions.ts';
import { parseTopicProjectDocument, type TopicProjectDocument } from '../topic-project.ts';

export function prepareTopicDiagnosis(raw: TopicProjectDocument, id: string = crypto.randomUUID()) {
  const document = parseTopicProjectDocument(raw), brief = document.brief;
  const input: DiagnosisBriefSource['input'] = {
    title: brief.title.trim(), decisionOwner: brief.decisionOwner.trim(), population: brief.population.trim(),
    geography: brief.geography.trim(), problem: [brief.decision, ...brief.questions.map(q => q.text)].filter(Boolean).join('\n'),
    stage: 'intake', evidenceStatus: 'proposed',
  };
  for (const [key, max] of [['title', 120], ['decisionOwner', 120], ['population', 200], ['geography', 120], ['problem', 1000]] as const) {
    if (!input[key].trim() || input[key].length > max) throw Error(`请补全${({title:'题目',decisionOwner:'决策主体',population:'调查人群',geography:'调查地区',problem:'研究问题'})[key]}，并控制在 ${max} 字以内。`);
  }
  const source: DiagnosisBriefSource = parseDiagnosisBriefSource({ id, input });
  return { source, result: diagnoseProject(input) };
}
