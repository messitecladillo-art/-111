"""Trusted Data Agent tools over collected survey releases.

The tools read SurveyResponse rows owned by the task's project and return only
aggregate statistics. Raw rows, response ids, timestamps and open-text answers
never leave this module, so a model only ever sees bounded aggregates.
A consented preview binds each dataset snapshot hash; a changed snapshot stops
the tool instead of silently analysing different data.
"""
import math
import re
from statistics import mean, median, stdev

from sqlalchemy import select

from infrastructure.database.models import SurveyRelease, SurveyResponse, Version
from multi_agent.agents.contracts import ToolResult
from shared.contracts import fingerprint

TOOL_VERSION = 'survey-release-aggregates/v1'
REF = re.compile(r'survey-release:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
MAX_DATASETS = 5
MAX_CATEGORIES = 30


class DataToolError(ValueError):
    pass


def release_id(ref):
    match = REF.fullmatch(ref) if isinstance(ref, str) else None
    return match.group(1) if match else None


def supported_refs(refs):
    return bool(refs) and len(refs) <= MAX_DATASETS and all(release_id(ref) for ref in refs)


def _read(session, project_id, ref):
    rid = release_id(ref)
    if rid is None:
        raise DataToolError('unsupported_dataset_reference')
    release = session.execute(select(SurveyRelease).where(SurveyRelease.id == rid, SurveyRelease.project_id == project_id)
                              .execution_options(populate_existing=True)).scalar_one_or_none()
    if release is None:
        raise DataToolError('dataset_not_found')
    version = session.get(Version, release.version_id)
    responses = session.scalars(select(SurveyResponse).where(SurveyResponse.release_id == rid)
                                .order_by(SurveyResponse.created_at, SurveyResponse.id)).all()
    snapshot = fingerprint({'releaseId': release.id, 'versionId': release.version_id,
                            'classification': release.classification,
                            'responses': [[r.id, r.answers, r.visibility] for r in responses]})
    return release, version.design, responses, snapshot


def snapshot(session, project_id, ref):
    """Consent material: identity, size and hash of the exact rows, no content."""
    release, design, responses, digest = _read(session, project_id, ref)
    return {'ref': ref, 'title': release.public_design['title'], 'status': release.status,
            'classification': release.classification, 'rowCount': len(responses),
            'variables': len(design['questions']), 'sha256': digest}


def _r(value):
    return None if value is None else round(float(value), 4)


def _quantile(values, q):
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def _column(question, responses):
    qid, kind = question['id'], question['type']
    shown = [r for r in responses if r.visibility.get(qid)]
    answered = [r.answers.get(qid) for r in shown if r.answers.get(qid) is not None]
    base = {'variable': question['variable'], 'question': question['text'][:200], 'type': kind,
            'n_shown': len(shown), 'n_valid': len(answered), 'n_missing': len(shown) - len(answered)}
    labels = {c['code']: c['label'] for c in question['choices']}
    if kind in ('single', 'multi'):
        counts = {code: 0 for code in labels}
        for value in answered:
            for code in (value if kind == 'multi' else [value]):
                if code in counts:
                    counts[code] += 1
        denominator = len(answered) or 1
        base['frequencies'] = [{'code': code, 'label': labels[code][:80], 'count': count,
                                'percent': _r(100 * count / denominator)}
                               for code, count in list(counts.items())[:MAX_CATEGORIES]]
        if kind == 'multi':
            base['percent_base'] = 'respondents_answering'
    elif kind in ('number', 'likert'):
        numbers = [float(v) for v in answered]
        if numbers:
            base.update({'mean': _r(mean(numbers)), 'sd': _r(stdev(numbers)) if len(numbers) > 1 else None,
                         'min': _r(min(numbers)), 'q1': _r(_quantile(numbers, .25)), 'median': _r(median(numbers)),
                         'q3': _r(_quantile(numbers, .75)), 'max': _r(max(numbers))})
        if kind == 'likert':
            lo, hi = int(question['min']), int(question['max'])
            base['scale'] = {'min': lo, 'max': hi, 'minLabel': question['minLabel'][:60], 'maxLabel': question['maxLabel'][:60],
                             'reverse': question['reverse']}
            base['frequencies'] = [{'code': str(v), 'label': str(v), 'count': sum(1 for x in numbers if x == v),
                                    'percent': _r(100 * sum(1 for x in numbers if x == v) / (len(numbers) or 1))}
                                   for v in range(lo, hi + 1)]
    else:
        base['content'] = 'withheld_open_text'
    return base


class SurveyDataTools:
    """Synchronous tools for DataAgent; each call opens its own fenced Session."""

    def __init__(self, *, open_session, project_id, expected):
        self.open_session, self.project_id = open_session, project_id
        self.expected = {item['ref']: item['sha256'] for item in expected}

    def _datasets(self, refs):
        if not supported_refs(refs) or set(refs) != set(self.expected):
            raise DataToolError('dataset_references_changed')
        loaded = []
        with self.open_session() as session:
            for ref in refs:
                release, design, responses, digest = _read(session, self.project_id, ref)
                if digest != self.expected[ref]:
                    raise DataToolError('dataset_changed_since_consent')
                loaded.append((ref, release, design, responses, digest))
        return loaded

    def load_dataset(self, *, artifact_refs):
        datasets = self._datasets(list(artifact_refs))
        schema = [{'ref': ref, 'title': release.public_design['title'], 'classification': release.classification,
                   'status': release.status, 'rowCount': len(responses), 'sha256': digest,
                   'variables': [{'variable': q['variable'], 'type': q['type'], 'required': q['required'],
                                  'conditional': q['condition'] is not None, 'purpose': q['purpose'],
                                  'analysis': q['analysis'],
                                  'n_valid': sum(1 for r in responses if r.visibility.get(q['id']) and r.answers.get(q['id']) is not None)}
                                 for q in design['questions']]}
                  for ref, release, design, responses, digest in datasets]
        return ToolResult(classification='actual', artifact_refs=list(artifact_refs),
                          data={'tool': TOOL_VERSION, 'datasets': schema})

    def analyze_dataset(self, *, artifact_refs):
        datasets = self._datasets(list(artifact_refs))
        findings, stats, charts, limitations = [], [], [], []
        cleaning = [{'rule': 'hidden_questions_excluded_from_denominator', 'affected_rows': 0,
                     'reason': '跳题未显示的题目不计入该题有效样本。'},
                    {'rule': 'open_text_not_disclosed', 'affected_rows': 0,
                     'reason': '开放题原文不进入模型，仅统计作答人数，编码需人工完成。'}]
        for ref, release, design, responses, digest in datasets:
            findings.append({'ref': ref, 'rows': len(responses), 'variables': len(design['questions']),
                             'classification': release.classification, 'sha256': digest})
            if release.classification != 'actual':
                limitations.append(f'{release.public_design["title"][:60]}：本地测试环境回收的合成数据，不代表实际调查。')
            if release.status == 'open':
                limitations.append(f'{release.public_design["title"][:60]}：问卷仍在回收，结果对应同意时的 {len(responses)} 份快照。')
            if len(responses) < 30:
                limitations.append(f'{release.public_design["title"][:60]}：有效样本 {len(responses)} 份，少于 30，结论仅作描述。')
            for question in design['questions']:
                column = _column(question, responses)
                stats.append({'ref': ref, **column})
                if column.get('frequencies') and column['n_valid']:
                    charts.append({'kind': 'bar', 'ref': ref, 'variable': column['variable'],
                                   'title': column['question'][:80],
                                   'categories': [f['label'] for f in column['frequencies']],
                                   'values': [f['count'] for f in column['frequencies']]})
        limitations.append('本工具仅输出描述统计；差异检验、回归等推断分析须按研究假设在分析工作台执行并登记。')
        deliverable = {'data_status': 'analyzed' if any(f['rows'] for f in findings) else 'needs_data',
                       'input_artifact_refs': list(artifact_refs), 'schema_findings': findings,
                       'cleaning_log': cleaning, 'descriptive_statistics': stats[:500], 'tests': [],
                       'charts': charts[:100], 'limitations': limitations[:100]}
        return ToolResult(classification='actual', artifact_refs=list(artifact_refs),
                          data={'tool': TOOL_VERSION, 'deliverable': deliverable})

    def tools(self):
        return {'load_dataset': self.load_dataset, 'analyze_dataset': self.analyze_dataset}
