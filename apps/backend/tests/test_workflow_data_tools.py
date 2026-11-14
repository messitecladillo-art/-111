"""Data Agent model steps over trusted survey aggregates; no DB, no provider."""
import json
from types import SimpleNamespace
from contextlib import contextmanager

import pytest

import application.workflow_data_tools as data_tools
from application.workflow_data_tools import SurveyDataTools, DataToolError, supported_refs, _column
from application.workflow_model_adapter import model_handler
from multi_agent.agents.contracts import AgentRole
from multi_agent.workflow import create_workflow

REF = 'survey-release:00000000-0000-4000-8000-000000000001'
SECRET_TEXT = 'synthetic-private-open-answer'


def question(qid, variable, kind, **extra):
    base = {'id': qid, 'variable': variable, 'text': f'题目 {variable}', 'type': kind, 'required': False,
            'purpose': 'research', 'analysis': 'description', 'choices': [], 'min': None, 'max': None,
            'minLabel': '', 'maxLabel': '', 'reverse': False, 'condition': None}
    return {**base, **extra}


DESIGN = {'questions': [
    question('q1', 'gender', 'single', choices=[{'code': 'm', 'label': '男'}, {'code': 'f', 'label': '女'}]),
    question('q2', 'channels', 'multi', choices=[{'code': 'a', 'label': '线上'}, {'code': 'b', 'label': '线下'}]),
    question('q3', 'score', 'likert', min=1, max=5, minLabel='低', maxLabel='高'),
    question('q4', 'spend', 'number', condition={'questionId': 'q1', 'codes': ['f']}),
    question('q5', 'note', 'text'),
]}


def response(i, gender, channels, score, spend, note):
    answers = {'q1': gender, 'q2': channels, 'q3': score, 'q4': spend if gender == 'f' else None, 'q5': note}
    visibility = {'q1': True, 'q2': True, 'q3': True, 'q4': gender == 'f', 'q5': True}
    return SimpleNamespace(id=f'resp-{i}', answers=answers, visibility=visibility)


RESPONSES = [response(1, 'm', ['a'], 2, None, SECRET_TEXT), response(2, 'f', ['a', 'b'], 4, 100, None),
             response(3, 'f', ['b'], 5, None, None), response(4, 'm', ['a'], 3, None, None)]
RELEASE = SimpleNamespace(id=REF.split(':')[1], version_id='v', classification='actual', status='closed',
                          public_design={'title': '合成消费调查'})


@pytest.fixture
def tools(monkeypatch):
    monkeypatch.setattr(data_tools, '_read', lambda session, project, ref: (RELEASE, DESIGN, RESPONSES, 'a' * 64))

    @contextmanager
    def session():
        yield None

    return SurveyDataTools(open_session=session, project_id='p', expected=[{'ref': REF, 'sha256': 'a' * 64}])


def test_column_statistics_respect_visibility_and_withhold_text():
    gender = _column(DESIGN['questions'][0], RESPONSES)
    assert [(f['code'], f['count'], f['percent']) for f in gender['frequencies']] == [('m', 2, 50.0), ('f', 2, 50.0)]
    channels = _column(DESIGN['questions'][1], RESPONSES)
    assert [f['count'] for f in channels['frequencies']] == [3, 2] and channels['percent_base'] == 'respondents_answering'
    score = _column(DESIGN['questions'][2], RESPONSES)
    assert (score['n_valid'], score['mean'], score['median'], score['min'], score['max']) == (4, 3.5, 3.5, 2.0, 5.0)
    assert [f['count'] for f in score['frequencies']] == [0, 1, 1, 1, 1]
    spend = _column(DESIGN['questions'][3], RESPONSES)
    assert (spend['n_shown'], spend['n_valid'], spend['n_missing'], spend['sd']) == (2, 1, 1, None)
    note = _column(DESIGN['questions'][4], RESPONSES)
    assert note['content'] == 'withheld_open_text' and note['n_valid'] == 1 and SECRET_TEXT not in json.dumps(note)


def test_only_backend_survey_refs_are_supported():
    assert supported_refs([REF])
    assert not supported_refs([]) and not supported_refs(['artifact:provided-data'])
    assert not supported_refs([REF.upper()]) and not supported_refs([REF] * 6)


def test_snapshot_change_or_ref_change_stops_tools(tools, monkeypatch):
    with pytest.raises(DataToolError):
        tools.load_dataset(artifact_refs=['survey-release:00000000-0000-4000-8000-000000000002'])
    monkeypatch.setattr(data_tools, '_read', lambda session, project, ref: (RELEASE, DESIGN, RESPONSES, 'b' * 64))
    with pytest.raises(DataToolError):
        tools.analyze_dataset(artifact_refs=[REF])


def test_data_role_uses_tool_values_and_model_only_writes_summary(tools):
    seen = []

    def invoke(step, messages):
        seen.append((step, messages))
        if step == 'data.analyze_data':
            # A model that rewrites the numbers is ignored for the deliverable.
            return json.dumps({'summary': '评分均值约 3.5。', 'deliverable': {'data_status': 'analyzed',
                               'input_artifact_refs': [REF], 'descriptive_statistics': [{'mean': 99}]}})
        return json.dumps({'note': step})

    handler = model_handler(AgentRole.DATA, invoke, tools.tools())
    state = create_workflow(project_id='p', task_type='data_analysis', requirements={}, input_artifact_refs=[REF])
    result = handler(state)
    assert not result.errors, result.errors
    deliverable = result.output.deliverable.model_dump(mode='json')
    assert deliverable == tools.analyze_dataset(artifact_refs=[REF]).data['deliverable']
    assert result.output.summary == '评分均值约 3.5。'
    assert [step for step, _ in seen] == ['data.inspect_data', 'data.clean_data', 'data.analyze_data']
    inspect, analyze = seen[0][1], seen[2][1]
    assert len(inspect) == 3 and '<tool-json>' in inspect[2]['content'] and len(analyze) == 3
    assert all(m['role'] in ('system', 'user') for _, ms in seen for m in ms)
    sent = json.dumps([ms for _, ms in seen], ensure_ascii=False)
    assert SECRET_TEXT not in sent and 'resp-1' not in sent


def test_data_role_refuses_to_build_without_both_tools():
    with pytest.raises(ValueError):
        model_handler(AgentRole.DATA, lambda step, messages: '{}')
    with pytest.raises(ValueError):
        model_handler(AgentRole.DATA, lambda step, messages: '{}', {'load_dataset': lambda **_: None})
