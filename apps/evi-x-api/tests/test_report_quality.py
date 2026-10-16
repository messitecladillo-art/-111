"""Real cross-language fixtures; report storage validates structure, not statistical truth."""
import copy
import json
from pathlib import Path
import subprocess
import pytest
from evix_api.contracts import ApiError
from evix_api.reports import report_content
from evix_api import latex
from .test_reports import content


def v2():
    value = content(); value['version'] = 2
    result = {'id':'r1','title':'渠道分布','sourceName':'合成参考😀','sourceUrl':'https://example.org/reference','sourceHash':'a'*64,'resultHash':'b'*64,'classification':'simulated','method':'frequency','n':2,'total':3,'headers':['渠道','频数'],'rows':[['A',0],['B',2]],'metrics':[{'label':'总数','value':2},{'label':'待核对','value':None}],'warnings':['合成测试']}
    finding = {'id':'f1','title':'发现','question':'哪个渠道？','evidenceIds':['r1'],'interpretation':'当前样本分布','alternatives':'其他解释','scope':'仅当前样本','action':'核对渠道','status':'confirmed','confirmedHashes':{'r1':'b'*64}}
    value['quality'] = {'version':1,'results':[result],'findings':[finding]}
    value['report'][0]['blocks'] = [{'id':'b1','kind':'table','text':'分布','evidenceId':'r1','valueColumn':1}]
    value['slides'][0]['layout'] = 'chart'
    value['slides'][0]['objects'] = [{'id':'o1','kind':'chart','x':5,'y':10,'width':80,'height':75,'rotation':0,'opacity':1,'locked':False,'groupId':'','text':'','fontSize':22,'color':'#255D87','align':'center','evidenceId':'r1','valueColumn':1,'chartType':'bar','assetId':'','shape':'rect'}]
    return value


def bad_cases():
    cases=[]
    def add(name, change):
        value=v2();change(value);cases.append((name,value))
    add('unknown root',lambda v:v.update(svg='<svg/>'))
    add('v1 quality',lambda v:v.update(version=1))
    add('unknown result',lambda v:v['quality']['results'][0].update(rawData=[]))
    add('ragged rows',lambda v:v['quality']['results'][0].update(rows=[['A']]))
    add('boolean cell',lambda v:v['quality']['results'][0].update(rows=[['A',True]]))
    add('nonfinite',lambda v:v['quality']['results'][0].update(rows=[['A',float('inf')]]))
    add('huge integer',lambda v:v['quality']['results'][0].update(n=10**400))
    add('inactive external asset',lambda v:v['slides'][0]['objects'][0].update(assetId='https://evil.test/a.svg'))
    add('unpaired unicode',lambda v:v['quality']['results'][0].update(title='\ud800'))
    add('result bounds',lambda v:v['quality']['results'][0].update(n=4))
    add('http source',lambda v:v['quality']['results'][0].update(sourceUrl='http://example.org'))
    add('NEL url',lambda v:v['quality']['results'][0].update(sourceUrl='https://a\u0085x'))
    add('BOM url',lambda v:v['quality']['results'][0].update(sourceUrl='https://a\ufeffx'))
    add('upper hash',lambda v:v['quality']['results'][0].update(resultHash='B'*64))
    add('duplicate result',lambda v:v['quality']['results'].append(copy.deepcopy(v['quality']['results'][0])))
    add('missing finding reference',lambda v:v['quality']['findings'][0].update(evidenceIds=['unknown']))
    add('missing confirmed hash',lambda v:v['quality']['findings'][0].update(confirmedHashes={}))
    add('unknown confirmed hash',lambda v:v['quality']['findings'][0]['confirmedHashes'].update(other='c'*64))
    add('unknown block',lambda v:v['report'][0]['blocks'][0].update(extra=1))
    add('missing block result',lambda v:v['report'][0]['blocks'][0].update(evidenceId='unknown'))
    add('block duplicate',lambda v:v['report'][0]['blocks'].append(copy.deepcopy(v['report'][0]['blocks'][0])))
    add('objects overflow',lambda v:v['slides'][0].update(objects=[copy.deepcopy(v['slides'][0]['objects'][0])]*61))
    add('off slide',lambda v:v['slides'][0]['objects'][0].update(x=30,width=80))
    add('zero width',lambda v:v['slides'][0]['objects'][0].update(width=0))
    add('rotation',lambda v:v['slides'][0]['objects'][0].update(rotation=181))
    add('opacity',lambda v:v['slides'][0]['objects'][0].update(opacity=-.1))
    add('wrong color',lambda v:v['slides'][0]['objects'][0].update(color='red'))
    add('external vector',lambda v:v['slides'][0]['objects'][0].update(kind='vector',assetId='https://evil.test/asset.svg'))
    add('missing vector',lambda v:v['slides'][0]['objects'][0].update(kind='vector',assetId=''))
    add('arbitrary svg',lambda v:v['slides'][0]['objects'][0].update(svg='<svg/>'))
    add('missing object result',lambda v:v['slides'][0]['objects'][0].update(evidenceId='missing'))
    add('unicode length',lambda v:v['quality']['results'][0].update(title='😀'*76))
    add('delete control',lambda v:v['quality']['results'][0].update(title='x\x7f'))
    return cases


def ts_parse(fixtures):
    platform=Path(__file__).resolve().parents[2]/'evi-x-platform'
    script="import {parseEditorContent} from './lib/editor-model.ts';let t='';for await(const c of process.stdin)t+=c;const out=JSON.parse(t).map(x=>{try{return {ok:true,content:parseEditorContent(x)}}catch{return {ok:false}}});process.stdout.write(JSON.stringify(out));"
    process=subprocess.run(['node','--experimental-strip-types','--input-type=module','-e',script],cwd=platform,input=json.dumps(fixtures,ensure_ascii=True),capture_output=True,text=True,encoding='utf-8',timeout=30)
    assert process.returncode==0,process.stderr
    return json.loads(process.stdout)


def test_quality_fixture_positive_ts_python_preserves_old_versions_and_objects():
    fixtures=[content(),v2()]
    for layout in ('cover','problem','chart','comparison','segments','insight','action','closing'):
        v=v2();v['slides'][0]['layout']=layout;fixtures.append(v)
    for asset in ('mosaic-edge','focus-loop','path-ribbon'):
        v=v2();v['slides'][0]['objects'][0].update(kind='vector',assetId=asset);fixtures.append(v)
    stale=v2();stale['quality']['findings'][0]['confirmedHashes']['r1']='c'*64;fixtures.append(stale)
    for fixture,parsed in zip(fixtures,ts_parse(fixtures),strict=True):
        assert parsed['ok'] and report_content(fixture)==fixture and parsed['content']==fixture


def test_quality_fixture_negative_ts_python_reject_same_structures():
    cases=bad_cases();parsed=ts_parse([v for name,v in cases if name!='nonfinite'])
    for (name,value),receipt in zip([c for c in cases if c[0]!='nonfinite'],parsed,strict=True):
        with pytest.raises(ApiError):report_content(value)
        assert not receipt['ok'],name
    with pytest.raises(ApiError):report_content(dict(bad_cases())['nonfinite'])


def test_quality_no_statistical_verification_claim_or_hash_rewrite():
    value=v2();value['quality']['results'][0]['rows'][1][1]=999
    assert report_content(value)['quality']['results'][0]['resultHash']=='b'*64


def test_quality_v2_2mb_and_utf16_budget():
    value=v2();value['quality']['results'][0]['rows']=[['中'*2000,i]for i in range(360)]
    with pytest.raises(ApiError) as error:report_content(value)
    assert error.value.status==413
    value['quality']['results'][0]['rows']=value['quality']['results'][0]['rows'][:300]
    assert len(report_content(value)['quality']['results'][0]['rows'])==300


def test_full_report_capacity_matches_browser_limits():
    value=v2()
    section=value['report'][0]
    value['report']=[section]+[{'id':f's{i}','title':f'（{i}）小节','body':'正文','source':''} for i in range(99)]
    assert len(report_content(value)['report'])==100
    with pytest.raises(ApiError):report_content({**value,'report':value['report']+[{'id':'extra','title':'多余','body':'','source':''}]})
    result=value['quality']['results'][0]
    value['quality']['results']=[result]+[{**result,'id':f'x{i}'} for i in range(119)]
    assert len(report_content(value)['quality']['results'])==120
    with pytest.raises(ApiError):report_content({**value,'quality':{**value['quality'],'results':value['quality']['results']+[{**result,'id':'x-extra'}]}})
    # A finding may cite every registered result, as the browser parser allows.
    ids=[r['id'] for r in value['quality']['results']]
    finding={**value['quality']['findings'][0],'evidenceIds':ids,'confirmedHashes':{i:'b'*64 for i in ids}}
    cited={**value,'quality':{**value['quality'],'findings':[finding]}}
    assert len(report_content(cited)['quality']['findings'][0]['evidenceIds'])==120
    with pytest.raises(ApiError):report_content({**value,'slides':[{**value['slides'][-1],'id':f'p{i}'} for i in range(41)]})


def generated_latex(fixture):
    platform=Path(__file__).resolve().parents[2]/'evi-x-platform'
    script="import {parseEditorContent} from './lib/editor-model.ts';import {generateLatexBody,buildLatexSource} from './lib/latex-report.ts';let t='';for await(const c of process.stdin)t+=c;const c=parseEditorContent(JSON.parse(t)),body=generateLatexBody(c);const input={title:c.title,subtitle:c.subtitle,body,options:c.reportFormat.options};process.stdout.write(JSON.stringify({body,source:buildLatexSource(input)}));"
    process=subprocess.run(['node','--experimental-strip-types','--input-type=module','-e',script],cwd=platform,input=json.dumps(fixture,ensure_ascii=False),capture_output=True,text=True,encoding='utf-8',timeout=30)
    assert process.returncode==0,process.stderr
    return json.loads(process.stdout)


@pytest.mark.parametrize('accent', ['teal','blue','burgundy'])
def test_generated_vector_chart_table_closed_language_and_source_byte_parity(accent):
    value=v2();value['accent']=accent
    value['quality']['results'][0]['rows']=[[r'A,{x}%\\[]',0],['中文😀 ~^_ #&$',-2.5]]
    value['report'][0]['blocks'].append({'id':'b2','kind':'chart','text':'分布图','evidenceId':'r1','valueColumn':1})
    generated=generated_latex(value)
    latex.validate_body(generated['body'])
    assert latex.build_source(value['title'],value['subtitle'],generated['body'],value['reportFormat']['options'])==generated['source']
    assert r'\usepackage{pgfplots}' in generated['source'] and r'\pgfplotsset{compat=1.18}' in generated['source']
    assert generated['body'].count(r'\toprule[1.5bp]')==1 and generated['body'].count(r'\midrule[0.75bp]')==1


def pgf_fixture():
    return r'''\begin{figure}[htbp]
\centering
\definecolor{ResearchAccent}{HTML}{0F766E}
\begin{tikzpicture}
\begin{axis}[width=13cm,height=8cm,ybar,bar width=12pt,xtick={0,1},xticklabels={{A},{B}},x tick label style={rotate=35,anchor=east},ylabel={频数},enlarge x limits=0.12,nodes near coords,point meta=explicit symbolic]
\addplot[fill=ResearchAccent,draw=ResearchAccent] coordinates {(0,0) [0] (1,2) [2]};
\end{axis}
\end{tikzpicture}
\caption{分布}
\end{figure}'''


@pytest.mark.parametrize('before,after', [
    ('{HTML}{0F766E}','{HTML}{FFFFFF}'),
    ('{ResearchAccent}{HTML}','{Custom}{HTML}'),
    ('fill=ResearchAccent','fill=red'),
    ('coordinates {(0,0) [0] (1,2) [2]}','table {private.csv}'),
    ('coordinates {(0,0) [0] (1,2) [2]}','{x^2}'),
    ('width=13cm','width=100000cm'),
    ('ybar,bar width','ybar,execute at begin axis={\\input{secret}},bar width'),
    ('xticklabels={{A},{B}}','xticklabels={{\\input{secret}},{B}}'),
    ('xticklabels={{A},{B}}','xticklabels={{A},xlabel={B}}'),
    ('xticklabels={{A},{B}}','xticklabels={{A}}'),
    ('xtick={0,1}','xtick={0,2}'),
    ('(1,2) [2]','(1,2) [3]'),
    ('(1,2) [2]','(1,1e99) [1e99]'),
    ('(1,2) [2]','(1,nan) [nan]'),
    ('(0,0) [0] (1,2) [2]','(0,0) [0]'),
    ('\\begin{tikzpicture}','\\begin{tikzpicture}[scale=99999]'),
    ('[htbp]','[99999]'),
    ('\\end{axis}','\\addplot[fill=ResearchAccent,draw=ResearchAccent] coordinates {(0,0) [0] (1,2) [2]};\\end{axis}'),
    ('\\addplot[fill=ResearchAccent,draw=ResearchAccent] coordinates {(0,0) [0] (1,2) [2]};',''),
])
def test_generated_pgf_rejects_file_expression_custom_keys_or_unbounded_variants(settings,monkeypatch,before,after):
    source=pgf_fixture();assert before in source
    latex.validate_body(source)
    monkeypatch.setattr(latex,'run_pass',lambda *_:pytest.fail('unsafe chart reached compiler'))
    result=latex.LatexCompiler(settings).compile('合成','',source.replace(before,after),content()['reportFormat']['options'])
    assert result['status']=='error' and result['pdfBase64'] is None


def test_real_xelatex_generated_chart_and_centered_three_line_table(settings):
    import base64
    import os
    executable=os.getenv('EVIX_TEST_LATEX_COMPILER')
    if not executable:pytest.skip('Explicit existing XeLaTeX path required')
    value=v2();value['title']='合成质量验收';value['quality']['results'][0]['sourceName']='合成参考'
    value['report'][0]['blocks'].append({'id':'b2','kind':'chart','text':'渠道频数','evidenceId':'r1','valueColumn':1})
    generated=generated_latex(value);settings.latex_compiler=executable
    receipt=latex.LatexCompiler(settings).compile(value['title'],value['subtitle'],generated['body'],value['reportFormat']['options'])
    assert receipt['status']=='compiled',receipt['diagnostics']
    pdf=base64.b64decode(receipt['pdfBase64'])
    assert pdf.startswith(b'%PDF-') and 1000<len(pdf)<=latex.MAX_PDF
    artifact=Path(__file__).resolve().parents[3]/'.collab/runs/20261014-quality-vector/backend'
    (artifact/'real-quality.pdf').write_bytes(pdf)
    (artifact/'real-quality.tex').write_text(receipt['source'],encoding='utf-8')
    (artifact/'real-quality-receipt.json').write_text(json.dumps({k:v for k,v in receipt.items()if k not in ('pdfBase64','source')},ensure_ascii=False,indent=2),encoding='utf-8')



def test_section_finding_references_ts_python_parity():
    linked=v2();linked['report'][0]['findingIds']=['f1'];linked['report'][0]['findingSnapshots']={'f1':'[\"文字版本\"]'}
    empty=content();empty['version']=2;empty['report'][0]['findingIds']=[]
    positives=[linked,empty]
    for fixture,receipt in zip(positives,ts_parse(positives),strict=True):
        assert receipt['ok'] and receipt['content']==report_content(fixture)==fixture
    negatives=[]
    for ids in (['missing'],['f1','f1'],[''],['f1']*41,[1]):
        value=copy.deepcopy(linked);value['report'][0]['findingIds']=ids;negatives.append(value)
    legacy=content();legacy['report'][0]['findingIds']=[];negatives.append(legacy)
    no_quality=copy.deepcopy(empty);no_quality['report'][0]['findingIds']=['f1'];negatives.append(no_quality)
    wrong_array=copy.deepcopy(linked);wrong_array['report'][0]['findingIds']='f1';negatives.append(wrong_array)
    for snapshots in ({}, {'f1':''}, {'f1':1}, {'f1':'x','extra':'x'}, {'f1':'x'*12001}):
        value=copy.deepcopy(linked);value['report'][0]['findingSnapshots']=snapshots;negatives.append(value)
    missing_snapshot=copy.deepcopy(linked);del missing_snapshot['report'][0]['findingSnapshots'];negatives.append(missing_snapshot)
    for fixture,receipt in zip(negatives,ts_parse(negatives),strict=True):
        with pytest.raises(ApiError):report_content(fixture)
        assert not receipt['ok']


def test_fractional_pgf_generated_display_rounding_matches_js_binary64():
    values=[1/3,-1/3,1.0625,-1.0625,0.0005,-0.0005,0.000499999999,-0.000499999999,1.2345,-1.2345,999999999999.999,-999999999999.999,1e12,-1e12,5e-324,-5e-324]
    value=v2();value['quality']['results'][0]['rows']=[[f'中文⅓😀 第{i} _{{x}},[] %',v]for i,v in enumerate(values)]
    value['report'][0]['blocks']=[{'id':'fraction-chart','kind':'chart','text':'三位显示验收','evidenceId':'r1','valueColumn':1}]
    body=generated_latex(value)['body']
    assert '(0,0.3333333333333333) [0.333]' in body
    assert '(1,-0.3333333333333333) [-0.333]' in body
    assert '(2,1.0625) [1.063]' in body and '(3,-1.0625) [-1.063]' in body
    latex.validate_body(body)


@pytest.mark.parametrize('label',['0.334','0.332','0.3330000000000001','0.3330','3.33e-1','-0.333','\\input{file}','nan'])
def test_fractional_pgf_display_cannot_forge_value_or_execute_text(settings,monkeypatch,label):
    value=v2();value['quality']['results'][0]['rows']=[['⅓中文😀',1/3]]
    value['report'][0]['blocks']=[{'id':'c','kind':'chart','text':'分布','evidenceId':'r1','valueColumn':1}]
    body=generated_latex(value)['body']
    monkeypatch.setattr(latex,'run_pass',lambda *_:pytest.fail('forged chart reached compiler'))
    receipt=latex.LatexCompiler(settings).compile('合成','',body.replace('[0.333]',f'[{label}]'),value['reportFormat']['options'])
    assert receipt['status']=='error' and receipt['pdfBase64'] is None


def test_three_decimal_display_policy_matches_ts_for_seeded_binary64_reference():
    import math
    import random
    from decimal import localcontext
    rng=random.Random(20261014)
    values=[rng.uniform(-1,1)*10**rng.randrange(-12,13)for _ in range(2048)]
    for n in range(-32,33):
        center=(n+.5)/1000
        values.extend([math.nextafter(center,-math.inf),center,math.nextafter(center,math.inf)])
    platform=Path(__file__).resolve().parents[2]/'evi-x-platform'
    script="import{valueText}from'./lib/quality-export.ts';let t='';for await(const c of process.stdin)t+=c;process.stdout.write(JSON.stringify(JSON.parse(t).map(valueText)));"
    process=subprocess.run(['node','--experimental-strip-types','--input-type=module','-e',script],cwd=platform,input=json.dumps(values),capture_output=True,text=True,encoding='utf-8',timeout=30)
    assert process.returncode==0,process.stderr
    expected=json.loads(process.stdout)
    assert [latex.chart_display_number(v)for v in values]==expected
    with localcontext() as context:
        context.prec=4
        assert latex.chart_display_number(999999999999.999)== '999999999999.999'


def test_finding_snapshot_version_field_and_unicode_parity():
    linked=v2();linked['report'][0].update(findingIds=['f1'],findingSnapshots={'f1':'["确认版本😀"]'})
    empty=content();empty['version']=2;empty['report'][0]['findingSnapshots']={}
    for value,receipt in zip([linked,empty],ts_parse([linked,empty]),strict=True):
        assert receipt['ok'] and receipt['content']==report_content(value)==value
    negatives=[]
    for invalid in ('\ud800','x\x7f'):
        value=copy.deepcopy(linked);value['report'][0]['findingSnapshots']['f1']=invalid;negatives.append(value)
    legacy=content();legacy['report'][0]['findingSnapshots']={};negatives.append(legacy)
    unknown=copy.deepcopy(empty);unknown['report'][0]['findingSnapshots']={'unknown':'snapshot'};negatives.append(unknown)
    proto=copy.deepcopy(linked);proto['quality']['findings'][0].update(id='__proto__',status='draft',confirmedHashes={});proto['report'][0].update(findingIds=['__proto__'],findingSnapshots={'__proto__':'snapshot'});negatives.append(proto)
    for value,receipt in zip(negatives,ts_parse(negatives),strict=True):
        with pytest.raises(ApiError):report_content(value)
        assert not receipt['ok']


def test_slide_composition_optional_fields_ts_python_preserve_legacy_absence():
    fixtures=[v2()]
    for bold in (True,False):
        for block_id in ('报告图1-城区反馈', '😀'*40, '\u0085', '\u200b', '\ufeff图1'):
            value=v2()
            value['slides'][0]['objects'][0].update(bold=bold,sourceBlockId=block_id)
            fixtures.append(value)
    for field,setting in (('bold',False),('sourceBlockId','b1')):
        value=v2();value['slides'][0]['objects'][0][field]=setting;fixtures.append(value)
    for value,receipt in zip(fixtures,ts_parse(fixtures),strict=True):
        assert receipt['ok'] and receipt['content']==report_content(value)==value
    assert 'bold' not in fixtures[0]['slides'][0]['objects'][0]
    assert 'sourceBlockId' not in fixtures[0]['slides'][0]['objects'][0]


def test_slide_composition_optional_fields_ts_python_reject_invalid_values():
    negatives=[]
    for field,invalids in (
        ('bold',(None,0,1,'true',[],{})),
        ('sourceBlockId',(None,True,1,'','  ','\ufeff','\u00a0\u3000','中'*81,'😀'*41,'\ud800','x\x7f','x\x00')),
    ):
        for invalid in invalids:
            value=v2();value['slides'][0]['objects'][0][field]=invalid;negatives.append(value)
    unknown=v2();unknown['slides'][0]['objects'][0]['sourceBlockHash']='a'*64;negatives.append(unknown)
    duplicate=v2();duplicate['slides'][0]['objects'].append(copy.deepcopy(duplicate['slides'][0]['objects'][0]));negatives.append(duplicate)
    for value,receipt in zip(negatives,ts_parse(negatives),strict=True):
        with pytest.raises(ApiError):report_content(value)
        assert not receipt['ok']


def test_report_slide_link_v2_ts_python_version_gate_and_unicode_roundtrip():
    fixtures=[]
    for content_version,link_version in ((1,1),(2,1),(2,2)):
        value=content() if content_version==1 else v2()
        value['slides'][0]['reportLink']={'version':link_version,'sectionId':'摘要-图表😀','sectionHash':'a'*64,'slideHash':'b'*64}
        fixtures.append(value)
    for section_id in ('\u0085', '\u200b', '\ufeff摘要'):
        value=copy.deepcopy(fixtures[-1]);value['slides'][0]['reportLink']['sectionId']=section_id;fixtures.append(value)
    for value,receipt in zip(fixtures,ts_parse(fixtures),strict=True):
        assert receipt['ok'] and receipt['content']==report_content(value)==value
    negatives=[]
    for invalid in (None,True,0,3,'2'):
        value=copy.deepcopy(fixtures[-1]);value['slides'][0]['reportLink']['version']=invalid;negatives.append(value)
    legacy=content();legacy['slides'][0]['reportLink']=copy.deepcopy(fixtures[-1]['slides'][0]['reportLink']);negatives.append(legacy)
    for field,invalids in (
        ('sectionId',('', ' ', '\ufeff', '\u00a0\u3000', '中'*81, '😀'*41, '\ud800', 'x\n')),
        ('sectionHash',(None,'A'*64,'a'*63)),
        ('slideHash',(1,'b'*65)),
    ):
        for invalid in invalids:
            value=copy.deepcopy(fixtures[-1]);value['slides'][0]['reportLink'][field]=invalid;negatives.append(value)
    unknown=copy.deepcopy(fixtures[-1]);unknown['slides'][0]['reportLink']['objectsHash']='a'*64;negatives.append(unknown)
    missing=copy.deepcopy(fixtures[-1]);del missing['slides'][0]['reportLink']['slideHash'];negatives.append(missing)
    for value,receipt in zip(negatives,ts_parse(negatives),strict=True):
        with pytest.raises(ApiError):report_content(value)
        assert not receipt['ok'],repr(value['slides'][0]['reportLink'])


@pytest.mark.parametrize('fragment',[
    '"bold":true,"bold":false',
    '"sourceBlockId":"b1","sourceBlockId":"b2"',
    '"version":1,"version":2',
])
def test_composition_new_fields_reject_duplicate_raw_json_before_validation(fragment):
    from evix_api.contracts import strict_json
    with pytest.raises(ApiError) as error:
        strict_json('{"content":{"nested":{'+fragment+'}}}')
    assert error.value.code=='duplicate_members'
