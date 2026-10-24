"""v3 visual additions from actual TypeScript calculations, never handmade result numbers."""
import copy
import json
from pathlib import Path
import subprocess
import pytest
from evix_api.contracts import ApiError
from evix_api.report_visuals import validate_report_visuals, VISUAL_PALETTES
from evix_api.reports import report_content
from .test_reports import content as legacy_content


PLATFORM = Path(__file__).resolve().parents[2] / 'evi-x-platform'


def node(script, value=None):
    result = subprocess.run(['node', '--experimental-strip-types', '--input-type=module', '-e', script], cwd=PLATFORM,
                            input=json.dumps(value, ensure_ascii=True) if value is not None else None,
                            capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture(scope='module')
def fixtures():
    return node(r"""
import {createEditorContent,parseEditorContent} from './lib/editor-model.ts';
import {snapshotRecipe,makeSlideObject} from './lib/research-quality.ts';
import {createPlanNode,runPlanNode} from './lib/analysis-plan.ts';
import {parseSurveyCsv} from './lib/survey-analysis.ts';
import {buildChartSnapshot} from './lib/chart-data.ts';
import {CHART_THEMES} from './lib/chart-theme.ts';
import {figureFromResult,figureFromSnapshot} from './lib/report-figure.ts';
import {createReportFrame,approveReportFrame} from './lib/report-frame.ts';
const visual={schema:'ProjectVisualStyle/v1',paletteId:'blue',version:1};
async function compute(csv,method,x=0,y=null){const table=parseSurveyCsv(csv),node={...createPlanNode(method,'test'),x,y},value=runPlanNode(table,node,[]);return {result:await snapshotRecipe(value,{title:'软件合成图形😀',sourceName:'合成参考',sourceHash:'a'.repeat(64),sourceUrl:'',classification:'simulated'},method+'-'+csv.length),snapshot:buildChartSnapshot(table,node,value,[],{dataHash:'a'.repeat(64),signature:'test',computedAt:'2026-10-17T00:00:00Z'})};}
const frequency=await compute('类别\n甲\n乙\n甲\n丙\n甲\n乙','frequency');
const cross=await compute('人群,选择\n甲,是\n甲,否\n乙,是\n乙,是\n乙,否','crosstab',0,1);
const numeric=await compute('数值\n0\n1\n2\n3\n100','numeric');
const constant=await compute('数值\n7\n7\n7','numeric');
const figures=[];
for(const kind of ['bar','horizontal_bar','grouped_bar','percent_stacked','heatmap','histogram','boxplot','table']){
  const input=['histogram','boxplot'].includes(kind)?numeric:['grouped_bar','percent_stacked','heatmap'].includes(kind)?cross:frequency;
  figures.push(['histogram','boxplot'].includes(kind)?figureFromSnapshot(input.snapshot,kind,{id:kind,resultId:input.result.id,resultHash:input.result.resultHash,title:'合成'+kind}):figureFromResult(input.result,kind,kind==='table'?1:['grouped_bar','percent_stacked','heatmap'].includes(kind)?2:1,kind));
}
figures.push(figureFromSnapshot(constant.snapshot,'histogram',{id:'constant',resultId:constant.result.id,resultHash:constant.result.resultHash,title:'常量分布'}));
const c={...createEditorContent(),version:3,visualStyle:visual,quality:{version:1,results:[frequency.result,cross.result,numeric.result,constant.result],findings:[]},figures,report:[{id:'section',title:'合成参考',body:'软件验收',source:'',blocks:figures.map(f=>({id:'block-'+f.id,kind:f.kind==='table'?'table':'chart',text:f.title,evidenceId:f.resultId,valueColumn:1,figureId:f.id}))}],slides:[{id:'slide',title:'合成图形',body:'',aside:'',notes:'',layout:'chart',objects:figures.map(f=>makeSlideObject(f.kind==='table'?'table':'chart',{id:'object-'+f.id,figureId:f.id,evidenceId:f.resultId,x:5,y:10,width:90,height:80,fontSize:16}))}]} ;
const frame=createReportFrame(visual),framed={...c,reportFrame:frame},approved={...c,reportFrame:await approveReportFrame(frame,'软件测试复核')};
process.stdout.write(JSON.stringify({plain:parseEditorContent(c),draft:parseEditorContent(framed),approved:parseEditorContent(approved),palettes:CHART_THEMES.map(p=>({id:p.id,colors:p.colors}))}));
""")


def test_visual_palette_registry_matches_typescript(fixtures):
    assert {p['id']: tuple(p['colors']) for p in fixtures['palettes']} == VISUAL_PALETTES


def test_actual_all_eight_kinds_and_constant_histogram_preserve_values(fixtures):
    value = copy.deepcopy(fixtures['plain']); before = copy.deepcopy(value)
    assert validate_report_visuals(value) is value and value == before
    assert {f['kind'] for f in value['figures']} == {'bar', 'horizontal_bar', 'grouped_bar', 'percent_stacked', 'heatmap', 'histogram', 'boxplot', 'table'}
    constant = next(f for f in value['figures'] if f['id'] == 'constant')
    assert constant['bins'] == [{'start': 7, 'end': 7, 'count': 3}]
    assert all('outliers' not in f and 'pairs' not in f and 'rawRows' not in f for f in value['figures'])


def test_legacy_documents_are_unchanged_and_cannot_smuggle_visual_fields(fixtures):
    for version in (1, 2):
        value = legacy_content(); value['version'] = version
        before = copy.deepcopy(value)
        assert validate_report_visuals(value) is value and value == before
        for key, new in [('visualStyle', fixtures['plain']['visualStyle']), ('figures', []), ('reportFrame', None)]:
            with pytest.raises(ApiError):
                validate_report_visuals({**value, key: new})
        for key, field in [('report', 'blocks'), ('slides', 'objects')]:
            changed = copy.deepcopy(value)
            changed[key][0][field] = [{'kind': 'chart', 'evidenceId': 'r', 'figureId': 'bar'}]
            with pytest.raises(ApiError):
                validate_report_visuals(changed)


def figure_cases():
    return [
        ('raw rows', lambda f: f.update(rawRows=[['private']])),
        ('SVG body', lambda f: f.update(svg='<svg/>')),
        ('unknown kind', lambda f: f.update(kind='scatter')),
        ('null title', lambda f: f.update(title=None)),
        ('empty id', lambda f: f.update(id=' ')),
        ('upper hash', lambda f: f.update(resultHash='A'*64)),
        ('ragged series', lambda f: f['series'][0]['values'].append(1)),
        ('hidden point pairs', lambda f: f['series'][0].update(pairs=[[1, 2]])),
        ('boolean value', lambda f: f['series'][0]['values'].__setitem__(0, True)),
        ('nested value', lambda f: f['series'][0]['values'].__setitem__(0, {'value': 1})),
        ('oversized value', lambda f: f['series'][0]['values'].__setitem__(0, 1e13)),
        ('fractional n', lambda f: f.update(n=2.5)),
        ('boolean n', lambda f: f.update(n=True)),
        ('new style flag', lambda f: f['style'].update(showRaw=True)),
        ('numeric boolean', lambda f: f['style'].update(decimals=True)),
        ('too many decimals', lambda f: f['style'].update(decimals=7)),
        ('oversized label', lambda f: f['labels'].__setitem__(0, 'x'*161)),
        ('lone surrogate', lambda f: f.update(note='\ud800')),
        ('table raw answer array', lambda f: f['table'].update(respondents=[])),
        ('ragged table', lambda f: f['table']['rows'][0].append('private')),
        ('too many rows', lambda f: f['table'].update(rows=[f['table']['rows'][0]]*401)),
    ]


def test_unknown_raw_nested_values_and_bounds_reject(fixtures):
    values = []
    for name, change in figure_cases():
        value = copy.deepcopy(fixtures['plain']); change(value['figures'][0])
        values.append((name, value))
        with pytest.raises(ApiError):
            validate_report_visuals(value)
    parsed = node("import{parseEditorContent}from'./lib/editor-model.ts';let s='';for await(const x of process.stdin)s+=x;process.stdout.write(JSON.stringify(JSON.parse(s).map(c=>{try{parseEditorContent(c);return true}catch{return false}})));", [v for _, v in values])
    assert all(not accepted for accepted in parsed), [name for (name, _), accepted in zip(values, parsed, strict=True) if accepted]
    for invalid in (None, {}, True, 'figures'):
        value = copy.deepcopy(fixtures['plain']); value['figures'] = invalid
        with pytest.raises(ApiError):
            validate_report_visuals(value)


@pytest.mark.parametrize('invalid', [float('nan'), float('inf'), -float('inf'), 10**400])
def test_nonfinite_numbers_do_not_reach_output(fixtures, invalid):
    value = copy.deepcopy(fixtures['plain']); value['figures'][0]['series'][0]['values'][0] = invalid
    with pytest.raises(ApiError):
        validate_report_visuals(value)


def test_histogram_chain_box_order_and_percentage_denominators(fixtures):
    for kind, change in [
        ('histogram', lambda f: f['bins'][0].update(count=5000)),
        ('histogram', lambda f: f['bins'][1].update(start=f['bins'][0]['end']+.1)),
        ('histogram', lambda f: f['bins'][0].update(end=f['bins'][0]['start'])),
        ('boxplot', lambda f: f['boxes'][0].update(q1=1e8)),
        ('boxplot', lambda f: f['boxes'][0].update(outliers=[100])),
        ('percent_stacked', lambda f: [s['values'].__setitem__(0, 0) for s in f['series']]),
        ('percent_stacked', lambda f: f['series'][0]['values'].__setitem__(0, None)),
        ('percent_stacked', lambda f: f['series'][0]['values'].__setitem__(0, -1)),
    ]:
        value = copy.deepcopy(fixtures['plain']); change(next(f for f in value['figures'] if f['id'] == kind))
        with pytest.raises(ApiError):
            validate_report_visuals(value)
    value = copy.deepcopy(fixtures['plain']); value['figures'][0]['series'][0]['values'][0] = None
    assert validate_report_visuals(value) == value, 'a non-percentage figure can retain a real null gap'


def test_result_hash_n_and_object_references_are_exact(fixtures):
    for change in [
        lambda c: c['figures'][0].update(resultHash='b'*64),
        lambda c: c['figures'][0].update(n=0),
        lambda c: c['figures'].append(copy.deepcopy(c['figures'][0])),
        lambda c: c.pop('visualStyle'),
        lambda c: c['visualStyle'].update(paletteId='external'),
        lambda c: c['visualStyle'].update(version=0),
        lambda c: c['visualStyle'].update(colors=['#FFFFFF']),
        lambda c: c['report'][0]['blocks'][0].update(figureId='missing'),
        lambda c: c['report'][0]['blocks'][0].update(evidenceId='other'),
        lambda c: c['report'][0]['blocks'][0].update(kind='paragraph'),
        lambda c: c['slides'][0]['objects'][0].update(figureId='table'),
        lambda c: c['slides'][0]['objects'][0].update(figureId=None),
    ]:
        value = copy.deepcopy(fixtures['plain']); change(value)
        with pytest.raises(ApiError):
            validate_report_visuals(value)
    value = copy.deepcopy(fixtures['plain']); hashes = [r['resultHash'] for r in value['quality']['results']]
    value['visualStyle']['paletteId'] = 'forest'; value['visualStyle']['version'] = 2
    validate_report_visuals(value)
    assert [r['resultHash'] for r in value['quality']['results']] == hashes


def test_real_frame_geometry_and_approval_hash_bind_current_palette(fixtures):
    for key in ('draft', 'approved'):
        value = copy.deepcopy(fixtures[key]); before = copy.deepcopy(value)
        assert validate_report_visuals(value) == before and value == before
    stale = copy.deepcopy(fixtures['draft']); stale['visualStyle'].update(paletteId='forest', version=2)
    hashes = [r['resultHash'] for r in stale['quality']['results']]
    assert validate_report_visuals(stale) == stale, 'draft stays available for visual review'
    assert [r['resultHash'] for r in stale['quality']['results']] == hashes
    for change in [
        lambda c: c['visualStyle'].update(paletteId='forest'),
        lambda c: c['visualStyle'].update(version=2),
        lambda c: c['reportFrame'].update(density=.8),
        lambda c: c['reportFrame'].update(guardMm=2.9),
        lambda c: c['reportFrame']['paper'].update(widthMm=211),
        lambda c: c['reportFrame']['marginsMm'].update(left=30),
        lambda c: c['reportFrame'].update(protectedAreas=[{'id':'block-corner','kind':'other','xMm':0,'yMm':0,'widthMm':40,'heightMm':40}]),
        lambda c: c['reportFrame']['review'].update(at='2026-02-30T00:00:00Z'),
        lambda c: c['reportFrame']['review'].update(definitionSha256='b'*64),
        lambda c: c['reportFrame'].update(svg='<svg/>'),
    ]:
        value = copy.deepcopy(fixtures['approved']); change(value)
        with pytest.raises(ApiError):
            validate_report_visuals(value)
    for key in ('reportFrame', 'visualStyle'):
        value = copy.deepcopy(fixtures['plain']); value[key] = None
        with pytest.raises(ApiError):
            validate_report_visuals(value)


def test_draft_registry_palette_triplets_include_short_palettes(fixtures):
    for palette_id, colors in VISUAL_PALETTES.items():
        value = copy.deepcopy(fixtures['draft'])
        value['visualStyle']['paletteId'] = palette_id
        value['reportFrame']['palette'].update(id=palette_id, primary=colors[0], secondary=colors[2 % len(colors)], accent=colors[4 % len(colors)])
        assert validate_report_visuals(value) == value
    for invalid in ('#112233', 'url(https://example.test/asset)', None):
        value = copy.deepcopy(fixtures['draft']); value['reportFrame']['palette']['primary'] = invalid
        with pytest.raises(ApiError):
            validate_report_visuals(value)


def test_null_visual_style_is_not_an_absent_style(fixtures):
    value = copy.deepcopy(fixtures['plain']); value['visualStyle'] = None
    with pytest.raises(ApiError):
        validate_report_visuals(value)


def test_report_parser_keeps_v3_figures_and_single_source_v2_links(fixtures):
    value = copy.deepcopy(fixtures['plain'])
    value['slides'][0]['reportLink'] = {'version': 2, 'sectionId': value['report'][0]['id'], 'sectionHash': 'a'*64, 'slideHash': 'b'*64}
    before = copy.deepcopy(value)
    assert report_content(value) == before and value == before
    for change in (
        lambda c: c.update(reportFrame=None),
        lambda c: c['slides'][0]['reportLink'].update(version=3),
        lambda c: c['slides'][0]['reportLink'].update(sources=[]),
        lambda c: c.update(version=2),
    ):
        changed = copy.deepcopy(before); change(changed)
        with pytest.raises(ApiError):
            report_content(changed)
