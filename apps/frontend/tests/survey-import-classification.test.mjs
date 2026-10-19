import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import {parseSavImport} from '../lib/platform-data-mapping.ts';
import {importedDatasetIdentity,withImportLabels} from '../lib/survey-import-metadata.ts';
import {loadSpreadsheet,SPREADSHEET_PARSER_VERSION} from '../lib/spreadsheet-import.ts';
import {isSiliconTable} from '../lib/silicon/export.ts';

// Run the genuine adoption actions with the real identity and label helpers.
// Controlled setters replace React only; all input files and rows are synthetic.
const source=readFileSync(new URL('../components/analysis/SurveyLab.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('SurveyLab.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SurveyLab');
function harness(name,identity=importedDatasetIdentity){
  const fn=component?.body?.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(fn,`Actual adoption function ${name} must exist`);
  const code=ts.transpileModule(fn.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const state={adopted:[],notices:[],sections:[]},readEpoch={current:0};
  const call=new Function('importedDatasetIdentity','withImportLabels','isSiliconTable','state','readEpoch',`const dataset=null;const adopt=value=>state.adopted.push(value),setNotice=value=>state.notices.push(value),setSection=value=>state.sections.push(value);${code};return ${name};`)(identity,withImportLabels,isSiliconTable,state,readEpoch);
  return {call,state,readEpoch};
}
const sourceHash='e'.repeat(64);
function sav(name='__origin',label='数据来源'){
  return parseSavImport(JSON.stringify({
    schema:'survey-import/sav-v1',format:'sav',parser:'pyreadstat/1.3.6',sourceSha256:sourceHash,
    bytes:1000,rowCount:1,columnCount:1,fileEncoding:'UTF-8',
    columns:[{name,label,measurement:'nominal',originalFormat:'A20',storageType:'string',alignment:'left',valueLabels:[],userMissingValues:[],userMissingRanges:[],dateEncoding:null,systemMissingCount:0}],
    rows:[['silicon_simulated']],cleanup:{completed:true,reason:'temporary-upload'}
  }));
}
async function actualSpreadsheet(header){
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[header],['silicon_simulated']]),'合成');
  const result=(await loadSpreadsheet(XLSX.write(book,{type:'array',bookType:'xlsx',compression:true}))).select({sheetId:'sheet-0',headerRow:1});
  return {name:'synthetic.xlsx',sourceHash,parserVersion:SPREADSHEET_PARSER_VERSION,result};
}
async function adopted(name,input){
  const h=harness(name);
  assert.equal(await h.call(input,new AbortController().signal),true);
  assert.equal(h.state.adopted.length,1);
  return h.state.adopted[0];
}

test('real normalized SAV variable __origin remains simulated despite a nonempty display label',async()=>{
  const data=sav(),before=structuredClone(data),input={name:'synthetic.sav',data};
  assert.equal(data.metadata.columns[0].id,'__origin');
  assert.equal(data.metadata.columns[0].variableName,'__origin');
  assert.equal(isSiliconTable(data.metadata.columns.map(c=>c.label)),false,'Display labels alone hide this genuine variable marker');
  const result=await adopted('adoptSav',input);
  assert.equal(result.kind,'simulated');
  assert.equal(result.silicon,true);
  assert.equal(result.table,data.table);
  assert.deepEqual(data,before);
});

test('SAV dictionary aliases and labels are independently considered rather than choosing one display field',async()=>{
  for(const field of ['variableName','label']){
    const data=structuredClone(sav('ORIGINAL','数据来源'));
    data.metadata.columns[0][field]='\uFEFF __ORIGIN ';
    const result=await adopted('adoptSav',{name:'synthetic-alias.sav',data});
    assert.equal(result.kind,'simulated',field);
    assert.equal(result.silicon,true,field);
  }
});

test('SAV marker-like names and a simulated-looking answer value do not classify an unmarked source',async()=>{
  const data=sav('__origin_score','统计来源 __origin');
  assert.equal(data.table.rows[0][0],'silicon_simulated');
  const result=await adopted('adoptSav',{name:'synthetic-near-match.sav',data});
  assert.equal(result.kind,'user_provided');
  assert.equal(result.silicon,false);
});

test('actual XLSX parser preserves a marker header as a label on a stable canonical column ID',async()=>{
  const input=await actualSpreadsheet('__origin'),before=structuredClone(input.result);
  assert.deepEqual(input.result.table.headers,['sheet-0:col-A']);
  assert.equal(input.result.columns[0].label,'__origin');
  const result=await adopted('adoptSpreadsheet',input);
  assert.equal(result.kind,'simulated');
  assert.equal(result.silicon,true);
  assert.equal(result.table.columnLabels['sheet-0:col-A'],'__origin');
  assert.deepEqual(input.result,before);
});

test('compatible spreadsheet dictionary IDs retain an origin marker even with an unrelated label',async()=>{
  const input=await actualSpreadsheet('数据来源');
  // Compatible imported dictionary shape, separate from the current parser's
  // sheet/column IDs; covers the adoption boundary's canonical-name fallback.
  input.result.table.headers[0]='__origin';input.result.columns[0].id='__origin';
  const result=await adopted('adoptSpreadsheet',input);
  assert.equal(result.kind,'simulated');
  assert.equal(result.silicon,true);
  assert.equal(result.table.columnLabels.__origin,'数据来源');
});

test('ordinary XLSX labels and marker substrings stay user provided',async()=>{
  for(const header of ['数据来源','__origin_score','统计来源 __origin']){
    const result=await adopted('adoptSpreadsheet',await actualSpreadsheet(header));
    assert.equal(result.kind,'user_provided',header);
    assert.equal(result.silicon,false,header);
  }
});

test('cancelled or superseded classification cannot adopt SAV or spreadsheet data',async()=>{
  const inputs=[['adoptSav',{name:'synthetic.sav',data:sav()}],['adoptSpreadsheet',await actualSpreadsheet('__origin')]];
  for(const [name,input] of inputs){
    const cancelled=new AbortController();cancelled.abort();
    const early=harness(name);
    assert.equal(await early.call(input,cancelled.signal),false);
    assert.deepEqual(early.state.adopted,[]);
    for(const cause of ['abort','epoch']){
      let release;const deferred=new Promise(resolve=>{release=resolve;});
      const late=harness(name,async(...args)=>{const value=await importedDatasetIdentity(...args);await deferred;return value;});
      const controller=new AbortController(),running=late.call(input,controller.signal);
      if(cause==='abort')controller.abort();else late.readEpoch.current++;
      release();assert.equal(await running,false,`${name}/${cause}`);
      assert.deepEqual(late.state.adopted,[]);
    }
  }
});
