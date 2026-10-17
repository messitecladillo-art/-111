"""Real browser calculation fixtures, accepted unchanged by the report storage contract."""
import copy
import json
from pathlib import Path
import subprocess
import pytest
from evix_api.contracts import ApiError
from evix_api.reports import report_content
from .test_report_quality import ts_parse


def generated():
    platform = Path(__file__).resolve().parents[2] / 'evi-x-platform'
    script = r"""
import {runPlanNode,filterPlanSample} from './lib/analysis-plan.ts';
import {calculationReceipt} from './lib/analysis-result-receipt.ts';
import {snapshotRecipe} from './lib/research-quality.ts';
import {createEditorContent} from './lib/editor-model.ts';
const table={headers:['组别','S1','S2'],rows:[['甲','1','5'],['甲','2','4'],['甲','4','2'],['乙','2','4'],['乙','3','3'],['乙','5','1'],['丙','3','3'],['丙','4','2'],['丙','5','1'],['甲','','x'],['乙','NA','4']]};
const fixtures=[];
for(const method of ['frequency','numeric','groups','crosstab','pearson','spearman','alpha']){
  const node={id:method,method,x:method==='alpha'?null:['numeric','pearson','spearman'].includes(method)?1:0,y:['groups','crosstab'].includes(method)?1:['pearson','spearman'].includes(method)?2:null,question:'软件合成验收',branch:'全部',filter:null,scale:method==='alpha'?{columns:[1,2],reverse:[2],min:1,max:5,construct:'软件合成构念'}:null};
  const value=runPlanNode(table,node,['NA']);
  const sample=filterPlanSample(table,null,['NA']).evidence;
  const calculation=calculationReceipt(node,table.headers,['NA'],'a'.repeat(64),null,sample,value.total,null,null);
  const snapshot=await snapshotRecipe(value,{title:method,sourceName:'合成参考😀',sourceHash:'c'.repeat(64),sourceUrl:'',classification:'simulated'},method,calculation);
  const content={...createEditorContent(),version:2,quality:{version:1,results:[snapshot],findings:[]}};
  fixtures.push(content);
}
process.stdout.write(JSON.stringify(fixtures));
"""
    result = subprocess.run(['node', '--experimental-strip-types', '--input-type=module', '-e', script], cwd=platform, capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture(scope='module')
def receipts():
    return generated()


def test_all_methods_structured_inference_and_calculation_roundtrip(receipts):
    for value, parsed in zip(receipts, ts_parse(receipts), strict=True):
        assert parsed['ok'] and parsed['content'] == report_content(value) == value
        r = value['quality']['results'][0]
        assert r['receipt']['sample']['analysisRows'] == r['n']
        assert r['receipt']['calculation']['missingCodes'] == ['NA']
    grouped = next(v['quality']['results'][0] for v in receipts if v['quality']['results'][0]['method'] == 'groups')
    assert len(grouped['receipt']['inference']['comparisons']) == 3
    assert grouped['receipt']['inference']['primary']['p'] is not None
    assert grouped['receipt']['inference']['robustness']


def mutations():
    return [
        ('raw rows', lambda r: r.update(rawRows=[])),
        ('unknown receipt field', lambda r: r['receipt'].update(serverVerified=True)),
        ('version boolean', lambda r: r['receipt'].update(version=True)),
        ('sample mismatch', lambda r: r['receipt']['sample'].update(analysisRows=0)),
        ('negative exclusion', lambda r: r['receipt']['sample'].update(excludedRows=-1)),
        ('wrong percentage basis', lambda r: r['receipt'].update(percentageBasis='effective-sample')),
        ('unknown method', lambda r: r['receipt']['calculation'].update(method='kmeans')),
        ('unknown engine', lambda r: r['receipt']['calculation'].update(algorithmVersion='future')),
        ('raw variables', lambda r: r['receipt']['calculation']['variables'][0].update(values=['respondent'])),
        ('duplicate columns', lambda r: r['receipt']['calculation']['variables'][1].update(column=0)),
        ('range instead of filter', lambda r: r['receipt']['calculation'].update(filter={'column': 0, 'min': 0})),
        ('filter over limit', lambda r: r['receipt']['calculation'].update(filter={'column': 0, 'values': ['A']*51})),
        ('missing as filter value', lambda r: r['receipt']['calculation'].update(filter={'column': 0, 'values': ['NA']})),
        ('oversized missing values', lambda r: r['receipt']['calculation'].update(missingCodes=['x']*21)),
        ('scale on group method', lambda r: r['receipt']['calculation'].update(scale={'columns': [0, 1], 'reverse': [], 'min': 1, 'max': 5, 'construct': 'x'})),
        ('bad chain', lambda r: r['receipt']['calculation']['sample'].update(originalRows=1)),
        ('bad interpretation identity', lambda r: r['receipt']['calculation'].update(interpretationHash='A'*64)),
        ('raw mapping', lambda r: r['receipt']['calculation'].update(mapping={'questionnaireHash': 'a'*64, 'mappingHash': 'b'*64, 'responses': []})),
        ('deep inference', lambda r: r['receipt']['inference']['primary'].update(p={'p': .5})),
        ('p too high', lambda r: r['receipt']['inference']['primary'].update(p=1.1)),
        ('effect interval order', lambda r: r['receipt']['inference']['primary']['effect'].update(interval={'lower': 2, 'upper': 1})),
        ('posthoc df', lambda r: r['receipt']['inference']['comparisons'][0].update(df=0)),
        ('posthoc adjusted', lambda r: r['receipt']['inference']['comparisons'][0].update(adjusted=-1)),
        ('extra comparison row', lambda r: r['receipt']['inference']['comparisons'][0].update(rawRows=[])),
        ('extra text budget', lambda r: r['receipt'].update(interpretation='x'*3001)),
        ('invalid unicode', lambda r: r['receipt'].update(interpretation='\ud800')),
        ('explicit null inference', lambda r: r['receipt'].update(inference=None)),
        ('explicit null calculation', lambda r: r['receipt'].update(calculation=None)),
    ]


def test_nested_receipt_allowlists_and_budgets_match_ts(receipts):
    groups = next(v for v in receipts if v['quality']['results'][0]['method'] == 'groups')
    values = []
    for name, change in mutations():
        value = copy.deepcopy(groups)
        change(value['quality']['results'][0]); values.append((name, value))
    for (name, value), parsed in zip(values, ts_parse([v for _, v in values]), strict=True):
        with pytest.raises(ApiError):
            report_content(value)
        assert not parsed['ok'], name


@pytest.mark.parametrize('bad', [float('nan'), float('inf'), -float('inf'), True, 10**400])
def test_nonfinite_receipt_numbers_are_rejected(receipts, bad):
    value = copy.deepcopy(receipts[2])
    value['quality']['results'][0]['receipt']['inference']['primary']['p'] = bad
    with pytest.raises(ApiError):
        report_content(value)


def test_receipt_storage_never_rewrites_registered_result_hash(receipts):
    value = copy.deepcopy(receipts[2])
    result = value['quality']['results'][0]
    previous = result['resultHash']
    result['receipt']['interpretation'] += '（用户草稿修改）'
    assert report_content(value)['quality']['results'][0]['resultHash'] == previous
