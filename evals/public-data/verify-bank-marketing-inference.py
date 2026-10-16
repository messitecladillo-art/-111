"""Check the workbench's inferential statistics on the public UCI Bank Marketing subset.

SciPy and statsmodels recompute every p-value, interval and effect size from the raw CSV;
the TypeScript engine is run through public-data-engine.mjs. Requires:
  uv run --no-project --with scipy==1.16.2 --with statsmodels==0.14.5 python -X utf8 \
    evals/public-data/verify-bank-marketing-inference.py --csv <bank.csv> --output <dir>
No raw data is written to the output.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import subprocess

import numpy as np
import scipy
from scipy import stats
import statsmodels
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.oneway import anova_oneway

EXPECTED_SHA256 = 'dc8d576e9bda0f41ee891251bd84bab9a39ce576cba715aac08adc2374a01fde'
HERE = Path(__file__).absolute().parent
REPO = HERE.parent.parent
REL = 1e-9


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    payload = args.csv.read_bytes()
    require(hashlib.sha256(payload).hexdigest() == EXPECTED_SHA256, 'Unexpected dataset SHA-256.')
    records = list(csv.DictReader(io.StringIO(payload.decode('utf-8')), delimiter=';'))
    node = shutil.which('node')
    require(node is not None, 'Node.js is required.')
    engine = json.loads(subprocess.run([node, '--experimental-strip-types', str(HERE / 'public-data-engine.mjs'), '--csv', str(args.csv)],
                                       cwd=REPO, capture_output=True, text=True, encoding='utf-8', timeout=60, check=True).stdout)
    checked, worst = 0, 0.0

    def equal(actual, expected, label):
        nonlocal checked, worst
        checked += 1
        require(actual is not None and math.isfinite(actual), f'{label}: engine value {actual!r}')
        error = abs(actual - expected)
        worst = max(worst, error / max(abs(expected), 1e-300))
        require(math.isclose(actual, expected, rel_tol=REL, abs_tol=1e-300) or error <= 1e-15,
                f'{label}: {actual!r} != {expected!r}')

    summary = []
    for case in engine['results']:
        method, x, y, missing, result = case['method'], case['x'], case['y'], set(case['missingCodes']), case['result']
        columns = [x] if y is None else [x, y]
        valid = [row for row in records if all(row[c].strip() and row[c].strip() not in missing for c in columns)]
        label = case['id']
        if method == 'numeric':
            values = np.array([float(row[x]) for row in valid])
            low, high = stats.t.interval(0.95, len(values) - 1, loc=values.mean(), scale=stats.sem(values))
            rows = {row[0]: row[1] for row in result['rows']}
            equal(rows['均值 95% CI 下限'], low, f'{label}/mean lower'); equal(rows['均值 95% CI 上限'], high, f'{label}/mean upper')
        elif method == 'groups':
            groups = defaultdict(list)
            for row in valid:
                groups[row[x].strip()].append(float(row[y]))
            names = list(groups)
            arrays = [np.array(groups[name]) for name in names]
            inference = result['inference']
            welch = anova_oneway(arrays, use_var='unequal', welch_correction=True)
            equal(inference['primary']['p'], float(welch.pvalue), f'{label}/welch anova p')
            classic, kw = stats.f_oneway(*arrays), stats.kruskal(*arrays)
            robust = {r['name']: r for r in inference['robustness']}
            equal(robust['经典方差分析']['p'], float(classic.pvalue), f'{label}/anova p')
            equal(robust['Kruskal–Wallis 检验']['p'], float(kw.pvalue), f'{label}/kw p')
            pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
            raw = [float(stats.ttest_ind(groups[a], groups[b], equal_var=False).pvalue) for a, b in pairs]
            adjusted = multipletests(raw, method='holm')[1]
            engine_pairs = {(c['a'], c['b']): c for c in inference['comparisons']}
            require(set(engine_pairs) == set(pairs), f'{label}: pairwise set differs')
            for (a, b), p, adj in zip(pairs, raw, adjusted):
                equal(engine_pairs[a, b]['p'], p, f'{label}/{a}-{b} p'); equal(engine_pairs[a, b]['adjusted'], float(adj), f'{label}/{a}-{b} holm')
        elif method == 'crosstab':
            rows_, cols_ = sorted({row[x] for row in valid}), sorted({row[y] for row in valid})
            table = [[sum(1 for row in valid if row[x] == r and row[y] == c) for c in cols_] for r in rows_]
            chi = stats.chi2_contingency(table, correction=False)
            equal(result['inference']['primary']['p'], float(chi.pvalue), f'{label}/chi p')
        elif method in ('pearson', 'spearman'):
            a, b = [float(row[x]) for row in valid], [float(row[y]) for row in valid]
            primary = result['inference']['primary']
            if method == 'pearson':
                res = stats.pearsonr(a, b); ci = res.confidence_interval(0.95)
                equal(primary['p'], float(res.pvalue), f'{label}/r p')
                equal(primary['effect']['interval']['lower'], float(ci.low), f'{label}/r lower')
                equal(primary['effect']['interval']['upper'], float(ci.high), f'{label}/r upper')
            else:
                equal(primary['p'], float(stats.spearmanr(a, b).pvalue), f'{label}/rho p')
        summary.append({'id': label, 'n': result['n'], 'primary': (result.get('inference') or {}).get('primary', {}).get('line')})
    require(checked > 0, 'No inference values were checked.')
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'status': 'pass', 'checked_at': datetime.now(timezone.utc).isoformat(), 'scalar_checks': checked,
              'max_relative_error': worst, 'relative_tolerance': REL, 'reference': {'scipy': scipy.__version__, 'statsmodels': statsmodels.__version__},
              'source': {'url': 'https://archive.ics.uci.edu/dataset/222/bank+marketing', 'doi': '10.24432/C5K306', 'license': 'CC BY 4.0', 'sha256': EXPECTED_SHA256},
              'cases': summary}
    (args.output / 'bank-marketing-inference-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'pass', 'scalar_checks': checked, 'max_relative_error': worst}))


if __name__ == '__main__':
    main()
