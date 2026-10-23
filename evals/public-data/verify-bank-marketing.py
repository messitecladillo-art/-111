"""Offline cross-language acceptance check against a fixed public UCI CSV.

Python's csv/statistics/Counter reference is independent from the application
TypeScript engine. No raw data is downloaded, changed or included in outputs.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import sys


EXPECTED_SHA256 = 'dc8d576e9bda0f41ee891251bd84bab9a39ce576cba715aac08adc2374a01fde'
CASES = (
    ('frequency', 'job', None), ('numeric', 'balance', None),
    ('groups', 'education', 'balance'), ('crosstab', 'education', 'y'),
    ('pearson', 'age', 'balance'), ('spearman', 'age', 'balance'),
    ('numeric', 'pdays', None),
)
POLICIES = ((), ('unknown',))
REL_TOLERANCE = ABS_TOLERANCE = 1e-10
HERE = Path(__file__).absolute().parent
REPO = HERE.parent.parent
ENGINE_FILES = (
    'apps/frontend/lib/survey-analysis.ts',
    'apps/frontend/lib/analysis-recipes.ts',
    'apps/frontend/lib/inference.ts',
)
# Inference outputs appended after the descriptive results. Their values are checked
# independently with SciPy/statsmodels by verify-bank-marketing-inference.py.
INFERENCE_METRICS = {'p 值（Welch t）', 'p 值（Welch F）', 'Hedges g', 'η²（经典方差分析）', 'p 值（χ² 渐近）',
                     'p 值（Fisher 精确）', 'p 值（双侧）', '95% CI 下限', '95% CI 上限'}
INFERENCE_ROWS = {'均值 95% CI 下限', '均值 95% CI 上限', '95% CI 下限（Fisher z）', '95% CI 上限（Fisher z）', 'p 值（双侧）'}
Z975 = statistics.NormalDist().inv_cdf(0.975)


def wilson(count, total):
    p, z2 = count / total, Z975 * Z975
    centre = (p + z2 / (2 * total)) / (1 + z2 / total)
    half = Z975 / (1 + z2 / total) * math.sqrt(p * (1 - p) / total + z2 / (4 * total * total))
    return max(0.0, centre - half) * 100, min(1.0, centre + half) * 100


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def quantile(values, probability):
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    lower, upper = int(index), min(int(index) + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def describe(values):
    return {
        'mean': statistics.mean(values),
        'sd': statistics.stdev(values) if len(values) > 1 else None,
        'min': min(values), 'q1': quantile(values, .25),
        'median': statistics.median(values), 'q3': quantile(values, .75),
        'max': max(values),
    }


def average_ranks(values):
    groups = defaultdict(list)
    for index, value in enumerate(values):
        groups[value].append(index)
    output, next_rank = [0] * len(values), 1
    for value in sorted(groups):
        indices = groups[value]
        rank = next_rank + (len(indices) - 1) / 2
        for index in indices:
            output[index] = rank
        next_rank += len(indices)
    return output


def reference(records, method, x, y, missing):
    columns = [x] if y is None else [x, y]
    valid = [row for row in records if all(
        row[column].strip() and row[column].strip() not in missing
        for column in columns
    )]
    output = {
        'n': len(valid), 'total': len(records),
        'excluded': len(records) - len(valid),
        'missingRows': len(records) - len(valid), 'invalidRows': 0,
    }
    if method == 'frequency':
        counts = Counter(row[x].strip() for row in valid)
        output['rows'] = [[label, count, count / len(valid) * 100, *wilson(count, len(valid))] for label, count in counts.items()]
        output['metrics'] = [len(counts)]
    elif method == 'numeric':
        values = describe([float(row[x]) for row in valid])
        output['rows'] = [[label, values[key]] for label, key in (
            ('均值', 'mean'), ('样本标准差', 'sd'), ('最小值', 'min'),
            ('Q1', 'q1'), ('中位数', 'median'), ('Q3', 'q3'), ('最大值', 'max'),
        )]
        output['metrics'] = [values['mean'], values['median']]
    elif method == 'groups':
        groups = defaultdict(list)
        for row in valid:
            groups[row[x]].append(float(row[y]))
        output['rows'] = []
        for label, values in groups.items():
            summary = describe(values)
            output['rows'].append([
                label, len(values), summary['mean'], summary['sd'],
                summary['median'], summary['q1'], summary['q3'],
            ])
        output['metrics'] = [len(groups)]
    elif method == 'crosstab':
        row_counts = Counter(row[x] for row in valid)
        column_counts = Counter(row[y] for row in valid)
        observed = Counter((row[x], row[y]) for row in valid)
        chi_square, below_five = 0, 0
        output['rows'] = []
        for row_label, row_count in row_counts.items():
            for column_label, column_count in column_counts.items():
                expected = row_count * column_count / len(valid)
                count = observed[row_label, column_label]
                chi_square += (count - expected) ** 2 / expected
                below_five += expected < 5
                output['rows'].append([row_label, column_label, count, count / row_count * 100, expected])
        output['metrics'] = [
            chi_square, (len(row_counts) - 1) * (len(column_counts) - 1),
            math.sqrt(chi_square / (len(valid) * min(len(row_counts) - 1, len(column_counts) - 1))),
            below_five,
        ]
    else:
        first = [float(row[x]) for row in valid]
        second = [float(row[y]) for row in valid]
        if method == 'spearman':
            first, second = average_ranks(first), average_ranks(second)
        correlation = statistics.correlation(first, second)
        output['metrics'] = [correlation]
        output['rows'] = [
            ['Spearman ρ' if method == 'spearman' else 'Pearson r', correlation],
            ['有效配对数', len(valid)],
        ]
    return output


def case_id(method, x, y, missing):
    return '/'.join((method, x, y or '', 'unknown_missing' if missing else 'original_codes'))


def verify(csv_path):
    require(sys.version_info >= (3, 10), 'Python 3.10 or newer is required for statistics.correlation.')
    payload = csv_path.read_bytes()
    require(hashlib.sha256(payload).hexdigest() == EXPECTED_SHA256,
            'Unexpected dataset SHA-256; use the unchanged 4,521-row bank.csv subset, not bank-full.csv.')
    reader = csv.DictReader(io.StringIO(payload.decode('utf-8')), delimiter=';')
    headers, records = reader.fieldnames, list(reader)
    require(len(records) == 4521 and len(headers) == 17, 'Expected exactly 4,521 rows and 17 columns.')
    hashes = {path: fingerprint(REPO / path) for path in ENGINE_FILES}
    node = shutil.which('node')
    require(node is not None, 'Node.js is required; use the repository supported Node 22.13+ runtime.')
    process = subprocess.run(
        [node, '--experimental-strip-types', str(HERE / 'public-data-engine.mjs'), '--csv', str(csv_path)],
        cwd=REPO, capture_output=True, text=True, encoding='utf-8', timeout=60, check=True,
    )
    actual = json.loads(process.stdout)
    require((actual['sha256'], actual['rows'], actual['columns']) == (EXPECTED_SHA256, 4521, 17),
            'TypeScript parser identity or dimensions differ from the independent reference.')
    expected_cases = {(method, x, y, missing) for missing in POLICIES for method, x, y in CASES}
    require(len(actual['results']) == len(expected_cases), 'Engine returned an incomplete case set.')
    returned_cases = {(case['method'], case['x'], case['y'], tuple(case['missingCodes'])) for case in actual['results']}
    require(returned_cases == expected_cases, 'Engine returned unexpected or duplicate analysis cases.')
    checked, max_absolute_error = 0, 0.0

    def equal(first, second, location):
        nonlocal checked, max_absolute_error
        checked += 1
        numeric = lambda value: isinstance(value, (int, float)) and not isinstance(value, bool)
        if numeric(first) and numeric(second):
            error = abs(first - second)
            max_absolute_error = max(max_absolute_error, error)
            require(math.isclose(first, second, rel_tol=REL_TOLERANCE, abs_tol=ABS_TOLERANCE),
                    f'{location}: {first!r} != {second!r} (absolute difference {error!r})')
        else:
            require(type(first) is type(second) and first == second,
                    f'{location}: {first!r} != {second!r}')

    summary = []
    for case in actual['results']:
        identifier = case_id(case['method'], case['x'], case['y'], case['missingCodes'])
        require(case['id'] == identifier, 'Case identity does not match its variable/policy settings.')
        expected = reference(records, case['method'], case['x'], case['y'], case['missingCodes'])
        result = case['result']
        require(result['method'] == case['method'], 'Result method does not match the requested method.')
        for key in ('n', 'total', 'excluded', 'missingRows', 'invalidRows'):
            equal(result[key], expected[key], f'{identifier}/{key}')
        descriptive = len(expected['metrics'])
        extra = [metric['label'] for metric in result['metrics'][descriptive:]]
        require(set(extra) <= INFERENCE_METRICS, f'{identifier}: unexpected metrics {extra!r}')
        metrics = [metric['value'] for metric in result['metrics'][:descriptive]]
        equal(len(metrics), len(expected['metrics']), f'{identifier}/metric_count')
        for index, (first, second) in enumerate(zip(metrics, expected['metrics'])):
            equal(first, second, f'{identifier}/metric/{index}')
        sort_key = lambda row: tuple(str(value) for value in row[:2 if case['method'] == 'crosstab' else 1])
        appended = [row for row in result['rows'] if case['method'] in ('numeric', 'pearson', 'spearman') and row[0] in INFERENCE_ROWS]
        require(len(appended) <= len(INFERENCE_ROWS), f'{identifier}: duplicated inference rows')
        rows = [row for row in result['rows'] if row not in appended]
        actual_rows, expected_rows = sorted(rows, key=sort_key), sorted(expected['rows'], key=sort_key)
        equal(len(actual_rows), len(expected_rows), f'{identifier}/row_count')
        for row_index, (row, expected_row) in enumerate(zip(actual_rows, expected_rows)):
            equal(len(row), len(expected_row), f'{identifier}/width/{row_index}')
            for column_index, (first, second) in enumerate(zip(row, expected_row)):
                equal(first, second, f'{identifier}/row/{row_index}/{column_index}')
        summary.append({'id': identifier, 'n': result['n'], 'excluded': result['excluded'], 'metrics': result['metrics']})

    pdays_negative_one = sum(row['pdays'] == '-1' for row in records)
    require(pdays_negative_one == 3705, 'Unexpected pdays sentinel count.')
    require(all(case['result']['n'] == 4521 for case in actual['results'] if case['x'] == 'pdays'),
            'pdays=-1 was incorrectly treated as a global missing code.')
    require(fingerprint(csv_path) == EXPECTED_SHA256, 'The input CSV changed during verification.')
    require({path: fingerprint(REPO / path) for path in ENGINE_FILES} == hashes,
            'Application calculation source changed during verification; rerun on the finished revision.')
    report = {
        'status': 'pass', 'checked_at': datetime.now(timezone.utc).isoformat(),
        'source': {'url': 'https://archive.ics.uci.edu/dataset/222/bank+marketing',
                   'doi': '10.24432/C5K306', 'license': 'CC BY 4.0', 'sha256': EXPECTED_SHA256},
        'rows': 4521, 'columns': 17, 'cases': len(summary), 'scalar_checks': checked,
        'max_absolute_error': max_absolute_error, 'relative_tolerance': REL_TOLERANCE,
        'absolute_tolerance': ABS_TOLERANCE, 'pdays_minus_one_retained': pdays_negative_one,
        'unknown_counts': {column: sum(row[column] == 'unknown' for row in records)
                           for column in headers if any(row[column] == 'unknown' for row in records)},
        'cases_summary': summary, 'calculation_source_hashes': hashes,
        'runtime': {'python': platform.python_version(), 'node': actual['node']},
        'interpretation': [
            'Original codes retain unknown as a category. The alternate policy explicitly treats unknown as missing; it is a sensitivity setting, not a correction of the source data.',
            'pdays=-1 means no previous contact and remains present; it is not a global missing code.',
            'Historical bank data validate calculation behavior, not competition fieldwork, a psychometric scale, significance, causal or population inference.',
            'Python csv/statistics/Counter formulas are independent of the TypeScript calculation implementations.',
        ],
    }
    return report, actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, required=True, help='Unmodified UCI bank.csv (4,521-row subset); read only.')
    parser.add_argument('--output', type=Path, required=True, help='Directory for aggregate reference and engine JSON receipts.')
    args = parser.parse_args()
    try:
        report, actual = verify(args.csv.absolute())
        args.output.mkdir(parents=True, exist_ok=True)
        for name, data in (('public-data-reference.json', report), ('public-data-engine-results.json', actual)):
            (args.output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f'Bank Marketing verification failed: {error}', file=sys.stderr)
        return 1
    print(json.dumps({key: report[key] for key in (
        'status', 'cases', 'scalar_checks', 'max_absolute_error', 'pdays_minus_one_retained', 'unknown_counts',
    )}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
