"""Same synthetic owner fixture as the frontend; no DB/HTTP or TeX engine needed."""
import copy
import json
from pathlib import Path
import pytest
from shared.errors import ApiError
from multi_agent.agents.writing_agent.services.reports import report_content

FIXTURE = Path(__file__).resolve().parents[2] / 'frontend/tests/fixtures/report-storyboard/source-owner.json'


def content():
    return json.loads(FIXTURE.read_text(encoding='utf-8'))['content']


def legacy_v2():
    value = content()
    value['version'] = 2
    value.pop('figures')
    value.pop('visualStyle')
    for section in value['report']:
        for block in section.get('blocks', []):
            block.pop('figureId', None)
    for slide in value['slides']:
        slide.pop('reportLink', None)
        for obj in slide.get('objects', []):
            obj.pop('figureId', None)
    return value


def test_shared_scoped_owner_fixture_survives_python_json_storage_roundtrip():
    value = content()
    before = copy.deepcopy(value)
    decoded = report_content(value)
    assert decoded == before == value
    stored = json.loads(json.dumps(decoded, ensure_ascii=False))
    assert report_content(stored) == before
    assert [obj['sourceSectionId'] for obj in stored['slides'][0]['objects'] if 'sourceSectionId' in obj] == ['A', 'B']
    assert report_content(json.loads(json.dumps(decoded, ensure_ascii=False, sort_keys=True))) == before


def test_old_v2_rejects_new_owner_but_preserves_ownerless_content():
    value = legacy_v2()
    with pytest.raises(ApiError):
        report_content(value)
    for slide in value['slides']:
        for obj in slide.get('objects', []):
            obj.pop('sourceSectionId', None)
    assert report_content(value) == value


@pytest.mark.parametrize('case', ['missing-block', 'text-object', 'empty', 'bom-only', 'control', 'over-limit'])
def test_invalid_owner_fields_match_frontend_rejections(case):
    value = content()
    obj = next(obj for obj in value['slides'][0]['objects'] if obj['kind'] == 'chart')
    if case == 'missing-block':
        obj.pop('sourceBlockId')
    elif case == 'text-object':
        obj['kind'] = 'text'
        obj.pop('figureId')
    else:
        obj['sourceSectionId'] = {'empty': '', 'bom-only': '\ufeff', 'control': '\x7f', 'over-limit': 'a' * 81}[case]
    with pytest.raises(ApiError):
        report_content(value)
