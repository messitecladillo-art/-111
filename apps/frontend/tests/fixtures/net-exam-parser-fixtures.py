
import sys, importlib.util
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('exam_parser',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source={'id':'fixture','filename':'fixture.docx','sha256':'a'*64}
def records(texts):return [{'ref':'paragraph-'+str(i+1),'text':t} for i,t in enumerate(texts)]
items,_=m.line_candidates(records(['1-题目：以下判断方式合适的是（ ）。[题型：单选题][答案：B]','1-选项：','（A）第一方法','（B）第二方法']),source)
assert len(items)==1 and items[0]['answer']==['B'] and items[0]['type']=='single' and not items[0]['reviewReasons']
assert '答案' not in items[0]['stem']
items,_=m.line_candidates(records(['10、（单选题，1.0分） A','---------------------','季度平均人数是多少（ ）？','A. 2588人','B. 2590人','C. 2608人','D. 2614人']),source)
assert len(items)==1 and items[0]['answer']==['A'] and not items[0]['stem'].startswith('-') and items[0]['sourceRefs'][0]['answerLocator']=='paragraph-1'
items,_=m.line_candidates(records(['1、统计描述请选择（ ）。','A. 众数\nB. 均值\nC. 中位数','正确答案：AC']),source)
assert len(items)==1 and items[0]['answer']==['A','C'] and len(items[0]['options'])==3 and items[0]['type']=='multiple'
items,_=m.line_candidates(records(['1、样本一定等于总体。[题型：判断题][答案：B]','A. 对','B. 错']),source)
assert items[0]['type']=='boolean' and items[0]['answer']==['false'] and [o['id'] for o in items[0]['options']]==['true','false']
questions=[]
for n in range(1,11):questions.extend([str(n)+'、请选择研究方法（ ）。','A. 方法甲','B. 方法乙'])
tail=['模拟试题答案：','1 2 3 4 5 6 7 8 9 10','0 A B A B A B A B A B']
items,detail=m.line_candidates(records(questions+tail),source)
assert detail['gridAnswerCount']==10 and not detail['gridRejectedForAmbiguousScope']
assert len(items)==10 and items[0]['answer']==['A'] and items[1]['answer']==['B']
items,detail=m.line_candidates(records(questions+['1、另一个同编号题目（ ）。','A. 方法甲','B. 方法乙']+tail),source)
assert detail['gridRejectedForAmbiguousScope'] and detail['gridAnswerCount']==0
assert all(not q['answer'] for q in items)
r=[{'ref':col+'!'+cell,'text':text} for col,cell,text in [('卷','A1','题型'),('卷','B1','题干'),('卷','C1','答案'),('卷','D1','A'),('卷','E1','B'),('卷','A2','单选'),('卷','B2','研究对象如何选择？'),('卷','C2','A'),('卷','D2','按目标条件'),('卷','E2','随意选择')]]
items,detail=m.spreadsheet_candidates(r,source)
assert len(items)==1 and items[0]['answer']==['A'] and not items[0]['reviewReasons']
q1=m.make_candidate('请选择研究方法', [{'id':'A','text':'甲方法'},{'id':'B','text':'乙方法'}],'A',source,['p1'],'p1')
q2=m.make_candidate('请选择研究方法', [{'id':'A','text':'乙方法'},{'id':'B','text':'甲方法'}],'A',{**source,'id':'other'},['p2'],'p2')
good,review=m.dedupe([q1,q2]);assert not good and len(review)==2 and all(q['answerStatus']=='conflict' for q in review)
q2['answer']=['B'];good,review=m.dedupe([q1,q2]);assert len(good)==1 and len(good[0]['sourceRefs'])==2 and not review
q3=m.make_candidate('依据下图作出判断', [{'id':'A','text':'甲方法'},{'id':'B','text':'乙方法'}],'A',source,['p3'],'p3')
assert 'requires-unavailable-figure-or-table' in q3['reviewReasons']
q4=m.make_candidate('总体的均值E( )是多少', [{'id':'A','text':'甲方法'},{'id':'B','text':'乙方法'}],'A',source,['p4'],'p4')
assert 'unrepresented-formula-variable' in q4['reviewReasons']
from unittest.mock import patch
from pathlib import Path
class MemoryArchive:
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def namelist(self):return ['word/document.xml']
 def read(self,name):return b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:p><m:oMath/></w:p></w:document>'
with patch.object(m.zipfile,'ZipFile',return_value=MemoryArchive()):
 assert m.source_asset_refs(Path('suffixless'), 'docx')=={'word/document.xml#paragraph-1'}
q5=m.make_candidate('请选择合适判断', [{'id':'A','text':'True'},{'id':'B','text':'False'}],'A',source,['p5'],'p5',qtype='boolean')
assert not q5['reviewReasons'] and q5['answer']==['true']
q6=m.make_candidate('请选择合适判断', [{'id':'A','text':'甲'},{'id':'B','text':'乙'}],'A',source,['p6'],'p6',qtype='boolean')
assert 'invalid-boolean-options' in q6['reviewReasons']
conflicted_questions=questions.copy();conflicted_questions[0]+='[答案：B]'
items,detail=m.line_candidates(records(conflicted_questions+tail),source)
assert detail['gridAnswerCount']==10 and items[0]['answerStatus']=='conflict' and 'explicit-key-grid-conflict' in items[0]['reviewReasons']

assert m.normalize_chapter('问卷及量表设计')=='问卷与量表'
assert m.normalize_chapter('单变量数据分析')=='描述统计'
assert m.normalize_chapter('多变量分析(2)')=='统计分析与推断'
assert m.normalize_chapter('调查组织实施')=='调查与数据采集'
assert m.normalize_chapter('unknown')=='综合练习'
card=m.make_candidate('如何设计量表',[{'id':'A','text':'甲'},{'id':'B','text':'乙'}],'A',source,['p7'],'p7',chapter='问卷及量表设计')
assert card['chapter']=='问卷与量表' and card['sourceChapter']=='问卷及量表设计'
for stem in ['假设随机变量,且未知,从中随机抽取样本,并经计算取得其均值为,那么如何估计?','假设随机变量,从中随机抽取样本,那么服从的散布为( )。','样本容量为,检验统计量为,请选择']:
 card=m.make_candidate(stem,[{'id':'A','text':'甲'},{'id':'B','text':'乙'}],'A',source,['p8'],'p8')
 assert 'unrepresented-mathematical-condition' in card['reviewReasons']

for stem in ['设计效应 deff=。请计算样本量','的置信区间时所依据的统计量为( )。','另一题的结论。 21、回归系数的作用是什么?']:
 card=m.make_candidate(stem,[{'id':'A','text':'甲'},{'id':'B','text':'乙'}],'A',source,['p9'],'p9')
 assert set(card['reviewReasons']) & {'unrepresented-mathematical-condition','fragmented-or-merged-question'}

for stem,option in [('回归公式为 ŷ=β0+β1+ε','甲'),('请选择比例方差条件','比例越接近于,方差越大'),('样本阈值(通常 )','甲')]:
 card=m.make_candidate(stem,[{'id':'A','text':option},{'id':'B','text':'乙'}],'A',source,['p10'],'p10')
 assert 'unrepresented-mathematical-condition' in card['reviewReasons']
print('parser fixture checks passed')




# End-to-end archive integrity checks use only owned synthetic files.
import contextlib
import copy
import hashlib
import io
import json
import tempfile
import zipfile

probe_parent=Path(sys.argv[1]).resolve().parents[1]/'.collab/runs/20261011-materials-ingest/exam/fixture-probes'
probe_parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='archive-integrity-',dir=probe_parent) as task_dir:
    task_root=Path(task_dir).resolve()
    assert task_root.is_relative_to(probe_parent.resolve())
    original_root=task_root/'source'
    extraction=task_root/'extraction'
    original_root.mkdir()
    extraction.mkdir()
    member_name='synthetic.xlsx'
    member_stream=io.BytesIO()
    with zipfile.ZipFile(member_stream,'w') as workbook:
        workbook.writestr('xl/worksheets/sheet1.xml','<worksheet><sheetData/></worksheet>')
    member_bytes=member_stream.getvalue()
    archive_path=original_root/'01_fixture.zip'
    with zipfile.ZipFile(archive_path,'w') as archive:
        archive.writestr(member_name,member_bytes)
    archive_bytes=archive_path.read_bytes()
    archive_sha=hashlib.sha256(archive_bytes).hexdigest()
    member_sha=hashlib.sha256(member_bytes).hexdigest()
    cell_values={'A1':'题型','B1':'题干','C1':'答案','D1':'A','E1':'B',
                 'A2':'单选','B2':'合成练习应当先做什么?','C2':'A','D2':'明确研究问题','E2':'跳过设计'}
    archive_records=[{'ref':'zip-member:'+member_name+'/Sheet1!'+cell,'text':text}
                     for cell,text in cell_values.items()]
    text_path=extraction/'member.jsonl'
    text_bytes=('\n'.join(json.dumps(rec,ensure_ascii=False) for rec in archive_records)+'\n').encode('utf8')
    text_path.write_bytes(text_bytes)
    manifest={'source_root':str(original_root),'entries':[{
        'id':'material-042','source_relative':archive_path.name,'sha256':archive_sha,
        'status':'archive_inventory','format':'zip'}]}
    member_receipt={'archive_id':'material-042','archive_sha256':archive_sha,
                    'member':member_name,'sha256':member_sha,'status':'extracted',
                    'format':'xlsx','text_path':'member.jsonl',
                    'text_sha256':hashlib.sha256(text_bytes).hexdigest()}
    (extraction/'manifest.json').write_text(json.dumps(manifest),encoding='utf8')

    def run_archive_case(name,receipt,expected_message=None,expected_type=ValueError):
        (extraction/'archive-members.json').write_text(json.dumps({'entries':[receipt]}),encoding='utf8')
        output=task_root/'outputs'/name/'bank.json'
        args=['build-net-exam-bank.py','--extraction',str(extraction),'--output',str(output),
              '--review-output',str(output.with_name('review.json'))]
        with patch.object(sys,'argv',args),contextlib.redirect_stdout(io.StringIO()):
            if expected_message is None:
                m.main()
                bank=json.loads(output.read_text(encoding='utf8'))
                assert len(bank['questions'])==1
                assert bank['coverage']['sourceCoverage'][-1]['memberHashVerified'] is True
            else:
                try:
                    m.main()
                except expected_type as error:
                    assert expected_message in str(error),(name,str(error))
                else:
                    raise AssertionError(name+' accepted tampered receipt')
                assert not output.exists(),name+' wrote an invalid bank'

    run_archive_case('good',member_receipt)
    altered=copy.deepcopy(member_receipt)
    altered['archive_sha256']='0'*64
    run_archive_case('container-mismatch',altered,'archive source hash mismatch')
    altered=copy.deepcopy(member_receipt)
    altered.pop('archive_sha256')
    run_archive_case('container-missing',altered,'archive source hash mismatch')
    altered=copy.deepcopy(member_receipt)
    altered['sha256']='0'*64
    run_archive_case('member-mismatch',altered,'archive member hash mismatch')
    altered=copy.deepcopy(member_receipt)
    altered.pop('sha256')
    run_archive_case('member-missing',altered,'sha256',KeyError)
    text_path.write_bytes(text_bytes+b'\n')
    run_archive_case('text-tampered',member_receipt,'archive text receipt hash mismatch')
    text_path.write_bytes(text_bytes)
    altered=copy.deepcopy(member_receipt)
    altered.pop('text_sha256')
    run_archive_case('text-hash-missing',altered,'archive text receipt hash mismatch')
    changed_records=[{**rec,'ref':rec['ref'].replace('zip-member:synthetic.xlsx/','zip-member:other.xlsx/')}
                     for rec in archive_records]
    changed_text=('\n'.join(json.dumps(rec,ensure_ascii=False) for rec in changed_records)+'\n').encode('utf8')
    text_path.write_bytes(changed_text)
    altered=copy.deepcopy(member_receipt)
    altered['text_sha256']=hashlib.sha256(changed_text).hexdigest()
    run_archive_case('locator-tampered',altered,'archive member locator mismatch')
    text_path.write_bytes(text_bytes)
    archive_path.write_bytes(archive_bytes+b'tamper')
    run_archive_case('original-container-tampered',member_receipt,'original source hash or boundary mismatch')
print('archive integrity fixture checks passed: good plus 8 rejections')


# An explicit short-choice question is valid; missing labels are a separate layout defect.
word_source={**source,'format':'docx'}
clear=records(['1、请选择恰当方法( )。','A. 第一方法','B. 第二方法','答案：B'])
cards,_=m.line_candidates(clear,word_source)
assert len(cards)==1 and not cards[0]['reviewReasons'] and len(cards[0]['options'])==2
clear3=records(['1、请选择恰当方法( )。','A. 第一方法','B. 第二方法','C. 第三方法','答案：C'])
cards,_=m.line_candidates(clear3,word_source)
assert not cards[0]['reviewReasons'] and len(cards[0]['options'])==3
broken=records(['1、样本优质品成数是多少( )。','A. 100%','B. 98%','2%','无法计算正确答案：B'])
cards,_=m.line_candidates(broken,word_source)
assert 'short-option-layout-needs-review' in cards[0]['reviewReasons']
assert cards[0]['options'][1]['text']=='98%'
same_paragraph=[{'ref':'p1','text':'1、请选择恰当方法( )。'},
                {'ref':'p2','text':'A. 第一方法\n具体说明属于该方法'},
                {'ref':'p3','text':'B. 第二方法'},
                {'ref':'p4','text':'答案：A'}]
cards,_=m.line_candidates(same_paragraph,word_source)
assert not cards[0]['reviewReasons'] and '具体说明' in cards[0]['options'][0]['text']
same_numeric=[{'ref':'p1','text':'1、样本优质品成数是多少( )。'},
              {'ref':'p2','text':'A. 100%\nB. 98%\n2%'},
              {'ref':'p3','text':'答案：B'}]
cards,_=m.line_candidates(same_numeric,word_source)
assert 'short-option-layout-needs-review' in cards[0]['reviewReasons']
isolated=records(['1、请选择恰当方法( )。','A. 第一方法','B. 第二方法','C','第三方法','正确答案：B'])
cards,_=m.line_candidates(isolated,word_source)
assert 'ambiguous-isolated-option-label' in cards[0]['reviewReasons']
complete=records(['1、样本优质品成数是多少( )。','A. 100%','B. 98%','C. 2%','D. 无法计算','正确答案：B'])
cards,_=m.line_candidates(complete,word_source)
assert not cards[0]['reviewReasons'] and cards[0]['answer']==['B'] and len(cards[0]['options'])==4
print('short-option integrity fixture checks passed')

assert m.clean_stem('量表两端是极端性答案，在两端间划分若干阶段。这样的量表称为( )。').endswith('这样的量表称为( )。')
legacy=[{'ref':'p1','text':'1、优质品成数是多少( )。\vA. 100%\vB. 98%\v2%\v无法计算\v正确答案：B'}]
cards,_=m.line_candidates(legacy,{**word_source,'format':'doc'})
assert 'short-option-layout-needs-review' in cards[0]['reviewReasons']
assert cards[0]['options'][1]['text']=='98%'
print('ordinary answer word and legacy orphan-choice fixtures passed')

assert m.clean_stem('开放式问题让受访者自由表达答案，调查员记录完整内容。')=='开放式问题让受访者自由表达答案,调查员记录完整内容。'
mixed=records(['1、请选择方法( )。','A. 第一方法','B. 第二方法','正确答案：A','解析：后续内容','正确答案：B'])
cards,_=m.line_candidates(mixed,word_source)
assert 'conflicting-source-answers-in-block' in cards[0]['reviewReasons']
assert cards[0]['answer']==['A'] and cards[0]['sourceRefs'][0]['answerLocator']=='paragraph-4'
print('same-block distinct key guard fixture passed')

anchored_hash=next(k[1] for k in m.SOURCE_EXCLUSIONS if k[0]=='material-007' and k[2]=='word/document.xml#paragraph-3721')
anchored_source={**source,'id':'material-007','sha256':anchored_hash}
anchored=m.make_candidate('恢复完整原句后ID会改变( )',[{'id':'A','text':'甲'},{'id':'B','text':'乙'}],'A',anchored_source,['word/document.xml#paragraph-3721'],'word/document.xml#paragraph-3731')
assert 'suspected-answer-error' in anchored['reviewReasons']
print('stable reviewed source-anchor exclusion fixture passed')

different_source=m.make_candidate('恢复完整原句后ID会改变( )',[{'id':'A','text':'甲'},{'id':'B','text':'乙'}],'A',{**anchored_source,'sha256':'b'*64},['word/document.xml#paragraph-3721'],'word/document.xml#paragraph-3731')
assert 'suspected-answer-error' not in different_source['reviewReasons']

# A shared PDF page is a layout boundary, not a semantic error for every question.
pdf_source={**source,'id':'fixture-pdf','format':'pdf'}
page_anchor=(pdf_source['id'],pdf_source['sha256'],'page-9')
m.SOURCE_EXCLUSIONS[page_anchor]='suspected-answer-error'
pdf_card=m.make_candidate('共享页上的完整独立题目( )',[{'id':'A','text':'第一方法'},{'id':'B','text':'第二方法'}],'A',pdf_source,['page-9'],'page-9')
assert pdf_card['reviewReasons']==['pdf-layout-needs-review']
clean_card=m.make_candidate('共享页上的完整独立题目( )',[{'id':'A','text':'第一方法'},{'id':'B','text':'第二方法'}],'A',{**source,'id':'fixture-docx','format':'docx'},['paragraph-9'],'paragraph-12')
good,pending=m.dedupe([pdf_card,clean_card])
assert len(good)==1 and len(pending)==1 and pending[0]['reviewReasons']==['pdf-layout-needs-review']
assert good[0]['sourceRefs'][0]['sourceId']=='fixture-docx'
m.SOURCE_EXCLUSIONS.pop(page_anchor)
assert all(not key[2].startswith('page-') for key in m.SOURCE_EXCLUSIONS)
print('PDF page layout quarantine does not contaminate clean content copies')
