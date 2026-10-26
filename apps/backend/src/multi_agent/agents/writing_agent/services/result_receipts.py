"""Bounded aggregate calculation receipts. Validation is not statistical attestation."""
import math
import re
from shared.errors import ApiError
from shared.contracts import object_fields, text

METHODS = ('frequency', 'numeric', 'groups', 'crosstab', 'pearson', 'spearman', 'alpha')
ROUTING_COUNTS = ('eligibleAnswered', 'eligibleMissing', 'ineligibleBlank', 'ineligibleAnswered', 'unknownBlank', 'unknownAnswered')


def number(value, minimum=-1e100, maximum=1e100, integral=False):
    if type(value) not in (int, float):
        raise ApiError()
    try:
        valid = math.isfinite(value) and minimum <= value <= maximum and (not integral or value == math.trunc(value))
    except (OverflowError, ValueError):
        valid = False
    if not valid:
        raise ApiError()
    return value


def count(value, maximum=5000):
    return number(value, 0, maximum, True)


def label(value, maximum, required=False):
    text(value, maximum)
    if '\x7f' in value or required and not value.strip('\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'):
        raise ApiError()
    return value


def items(value, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise ApiError()
    return value


def digest(value):
    if not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value):
        raise ApiError()


def interval(value):
    if value is None:
        return
    x = object_fields(value, ('lower', 'upper'))
    if number(x['lower']) > number(x['upper']):
        raise ApiError()


def test_report(value):
    x = object_fields(value, ('name', 'line', 'p'), ('effect', 'statistic'))
    label(x['name'], 160, True); label(x['line'], 2000, True)
    if x['p'] is not None:
        number(x['p'], 0, 1)
    if 'statistic' in x:
        statistic = object_fields(x['statistic'], ('label', 'value'), ('df',))
        label(statistic['label'], 160, True)
        number(statistic['value'])
        if 'df' in statistic:
            for degrees in items(statistic['df'], 2):
                number(degrees, 5e-324)
    if 'effect' in x:
        e = object_fields(x['effect'], ('name', 'value'), ('interval',))
        label(e['name'], 160, True)
        if e['value'] is not None:
            number(e['value'])
        if 'interval' in e:
            interval(e['interval'])


def inference(value):
    x = object_fields(value, ('primary', 'robustness', 'notes'), ('comparisons',))
    test_report(x['primary'])
    for test in items(x['robustness'], 10):
        test_report(test)
    for note in items(x['notes'], 30):
        label(note, 1000)
    if 'comparisons' in x:
        for comparison in items(x['comparisons'], 190):
            c = object_fields(comparison, ('a', 'b', 'difference', 't', 'df', 'p', 'adjusted'))
            label(c['a'], 2000, True); label(c['b'], 2000, True)
            number(c['difference']); number(c['t']); number(c['df'], 5e-324)
            number(c['p'], 0, 1); number(c['adjusted'], 0, 1)
            if c['a'] == c['b'] or c['adjusted'] + 1e-14 < c['p']:
                raise ApiError()


def routing(value, original_rows):
    if value is None:
        return
    x = object_fields(value, ('schema', 'policy', 'totalRows', 'eligibleRows', 'ineligibleRows', 'unknownRows', 'contradictionRows', 'questionCounts'))
    if x['schema'] != 'row-eligibility/v1' or x['policy'] not in ('strict', 'exclude'):
        raise ApiError()
    total = count(x['totalRows'])
    eligible = count(x['eligibleRows'], total); excluded = count(x['ineligibleRows'], total)
    unknown = count(x['unknownRows'], total); contradiction = count(x['contradictionRows'], excluded)
    if total != original_rows or eligible + excluded + unknown != total or x['policy'] == 'strict' and (unknown or contradiction):
        raise ApiError()
    ids = []
    for question in items(x['questionCounts'], 80):
        q = object_fields(question, ('questionId', *ROUTING_COUNTS))
        label(q['questionId'], 64, True)
        if not re.fullmatch('[A-Za-z0-9_-]+', q['questionId']) or sum(count(q[k], total) for k in ROUTING_COUNTS) != total:
            raise ApiError()
        ids.append(q['questionId'])
    if not ids or len(ids) != len(set(ids)):
        raise ApiError()


def indices(value):
    values = [count(v, 119) for v in items(value, 30)]
    if len(set(values)) != len(values):
        raise ApiError()
    return values


def calculation(value, method, calculation_rows):
    x = object_fields(value, ('engine', 'algorithmVersion', 'method', 'variables', 'missingCodes', 'filter', 'scale', 'interpretationHash', 'mapping', 'sample', 'routing'))
    if x['engine'] != 'analysis-plan/v1' or x['algorithmVersion'] != '2026-10-inference/v1' or x['method'] != method or method not in METHODS:
        raise ApiError()
    columns = []
    for variable in items(x['variables'], 30):
        v = object_fields(variable, ('column', 'name'))
        columns.append(count(v['column'], 119)); label(v['name'], 160, True)
    if not columns or len(set(columns)) != len(columns) or method != 'alpha' and len(columns) != (1 if method in ('frequency', 'numeric') else 2):
        raise ApiError()
    missing = [label(v, 40, True) for v in items(x['missingCodes'], 20)]
    if len(set(missing)) != len(missing):
        raise ApiError()
    if x['filter'] is not None:
        f = object_fields(x['filter'], ('column', 'values'))
        count(f['column'], 119)
        values = [label(v, 2000, True) for v in items(f['values'], 50)]
        if not values or len(set(values)) != len(values) or any(v in missing for v in values):
            raise ApiError()
    if x['scale'] is not None:
        s = object_fields(x['scale'], ('columns', 'reverse', 'min', 'max', 'construct'))
        selected = indices(s['columns']); reverse = indices(s['reverse'])
        number(s['min'], -1e6, 1e6); number(s['max'], -1e6, 1e6); label(s['construct'], 120, True)
        if len(selected) < 2 or selected != columns or s['min'] >= s['max'] or any(v not in selected for v in reverse):
            raise ApiError()
    if (method == 'alpha') != (x['scale'] is not None):
        raise ApiError()
    digest(x['interpretationHash'])
    if x['mapping'] is not None:
        m = object_fields(x['mapping'], ('questionnaireHash', 'mappingHash'))
        digest(m['questionnaireHash']); digest(m['mappingHash'])
    s = object_fields(x['sample'], ('originalRows', 'branchRows', 'commonEligibleRows', 'filterExcludedRows', 'filterMissingRows'))
    original = count(s['originalRows']); branch = count(s['branchRows'], original); common = count(s['commonEligibleRows'], branch)
    excluded = count(s['filterExcludedRows'], original); missing_rows = count(s['filterMissingRows'], excluded)
    if common != calculation_rows or original - branch != excluded or x['filter'] is None and (branch != original or missing_rows):
        raise ApiError()
    r = object_fields(x['routing'], ('analysis', 'filter'))
    for key in ('analysis', 'filter'):
        routing(r[key], original)
        if r[key] is not None and common > r[key]['eligibleRows']:
            raise ApiError()
    if x['filter'] is None and r['filter'] is not None:
        raise ApiError()
    if (r['analysis'] is not None or r['filter'] is not None) and x['mapping'] is None:
        raise ApiError()


def result_receipt(value, result):
    x = object_fields(value, ('version', 'interpretation', 'sample', 'percentageBasis'), ('inference', 'calculation'))
    basis = 'effective-sample' if result['method'] == 'frequency' else 'row-total' if result['method'] == 'crosstab' else 'none'
    if type(x['version']) is not int or x['version'] != 1 or x['percentageBasis'] != basis:
        raise ApiError()
    label(x['interpretation'], 3000)
    s = object_fields(x['sample'], ('calculationRows', 'analysisRows', 'excludedRows', 'missingRows', 'invalidRows', 'outOfRangeRows'))
    total = count(s['calculationRows']); n = count(s['analysisRows'], total); excluded = count(s['excludedRows'], total)
    missing = count(s['missingRows'], excluded); invalid = count(s['invalidRows'], excluded)
    if s['outOfRangeRows'] is not None:
        count(s['outOfRangeRows'], excluded)
    if total != result['total'] or n != result['n'] or total - n != excluded or excluded > missing + invalid + (s['outOfRangeRows'] or 0) or (result['method'] == 'alpha') != (s['outOfRangeRows'] is not None):
        raise ApiError()
    if 'inference' in x:
        if result['method'] not in ('groups', 'crosstab', 'pearson', 'spearman'):
            raise ApiError()
        inference(x['inference'])
    if 'calculation' in x:
        calculation(x['calculation'], result['method'], total)
