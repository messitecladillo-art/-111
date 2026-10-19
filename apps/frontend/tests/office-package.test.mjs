import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { inspectOfficePackage, OFFICE_PACKAGE_LIMITS as LIMIT } from '../lib/office-package.ts';
import { buildDocx, buildPptx } from '../lib/editor-export.ts';
import { createEditorContent } from '../lib/editor-model.ts';

const NS={ct:'http://schemas.openxmlformats.org/package/2006/content-types',rel:'http://schemas.openxmlformats.org/package/2006/relationships',office:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',w:'http://schemas.openxmlformats.org/wordprocessingml/2006/main',p:'http://schemas.openxmlformats.org/presentationml/2006/main',x:'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};
const CT={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'};
const paths={docx:'word/document.xml',pptx:'ppt/presentation.xml',xlsx:'xl/workbook.xml'};
const body={docx:`<w:document xmlns:w="${NS.w}"><w:body><w:p><w:r><w:t>合成测试</w:t></w:r></w:p></w:body></w:document>`,pptx:`<p:presentation xmlns:p="${NS.p}"/>`,xlsx:`<x:workbook xmlns:x="${NS.x}"/>`};
const types=(kind,extra='')=>`<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="bin" ContentType="application/octet-stream"/><Override PartName="/${paths[kind]}" ContentType="${CT[kind]}"/>${extra}</Types>`;
const rels=(kind,extra='')=>`<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.office}" Target="${paths[kind]}"/>${extra}</Relationships>`;
function parts(kind='docx',overrides={}) { return [{name:'[Content_Types].xml',body:types(kind)},{name:'_rels/.rels',body:rels(kind)},{name:paths[kind],body:body[kind]}].map(p=>({...p,body:overrides[p.name]??p.body})); }
// Independent bit-by-bit CRC implementation for adversarial fixture generation.
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;}
function rawZip(list,{method=8,descriptor=false,signature=true,comment='',prefix=Buffer.alloc(0)}={}){
  const locals=[],centrals=[];let offset=prefix.length;
  for(const item of list){
    const bytes=Buffer.isBuffer(item.body)?item.body:Buffer.from(item.body??''),name=Buffer.from(item.name),fileMethod=item.method??method;
    const packed=item.packed??(fileMethod===8?deflateRawSync(bytes):bytes),flags=item.flags??(0x800|(descriptor?8:0));
    const extra=item.extra??Buffer.alloc(0),localExtra=item.localExtra??extra,size=item.size??bytes.length,check=item.crc??crc(bytes);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(item.version??20,4);l.writeUInt16LE(flags,6);l.writeUInt16LE(fileMethod,8);l.writeUInt32LE(descriptor?0:check,14);l.writeUInt32LE(descriptor?0:packed.length,18);l.writeUInt32LE(descriptor?0:size,22);l.writeUInt16LE(name.length,26);l.writeUInt16LE(localExtra.length,28);
    const desc=descriptor?Buffer.alloc(signature?16:12):Buffer.alloc(0);if(descriptor){let at=0;if(signature){desc.writeUInt32LE(0x08074b50);at=4;}desc.writeUInt32LE(check,at);desc.writeUInt32LE(packed.length,at+4);desc.writeUInt32LE(size,at+8);}
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(item.version??20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(fileMethod,10);central.writeUInt32LE(check,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(extra.length,30);central.writeUInt32LE(item.attrs??0,38);central.writeUInt32LE(offset,42);
    locals.push(l,name,localExtra,packed,desc);centrals.push(central,name,extra);offset+=l.length+name.length+localExtra.length+packed.length+desc.length;
  }
  const central=Buffer.concat(centrals),c=Buffer.from(comment),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(list.length,8);end.writeUInt16LE(list.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(c.length,20);
  return Buffer.concat([prefix,...locals,central,end,c]);
}
function centralRecords(zip){const end=zip.length-22-zip.readUInt16LE(zip.length-2);let p=zip.readUInt32LE(end+16);const records=[];while(p<end){const offset=zip.readUInt32LE(p+42);records.push({at:p,offset});p+=46+zip.readUInt16LE(p+28)+zip.readUInt16LE(p+30)+zip.readUInt16LE(p+32);}return records;}
const rejects=(zip,pattern=/Office 文件结构检查未通过/)=>assert.throws(()=>inspectOfficePackage(zip,'docx'),pattern);

test('native buildDocx/buildPptx outputs accepted; exact input bytes remain unchanged',async()=>{
  for(const [kind,build] of [['docx',buildDocx],['pptx',buildPptx]]){const b=new Uint8Array(await(await build(createEditorContent())).arrayBuffer());const hash=createHash('sha256').update(b).digest('hex');const result=inspectOfficePackage(b,kind);assert.equal(result.kind,kind);assert(result.entries>3);assert.equal(createHash('sha256').update(b).digest('hex'),hash);}
});
test('minimal valid STORE/DEFLATE packages and signed/unsigned data descriptors',()=>{
  for(const kind of ['docx','pptx'])for(const method of [0,8])for(const options of [{},{descriptor:true},{descriptor:true,signature:false}])assert.deepEqual(inspectOfficePackage(rawZip(parts(kind),{method,...options}),kind),{kind,entries:3});
});
test('existing JSZip streaming output and normal archive comments accepted',async()=>{
  const z=new JSZip();for(const p of parts())z.file(p.name,p.body);const bytes=await z.generateAsync({type:'uint8array',compression:'DEFLATE',streamFiles:true,comment:'合成ZIP测试'});assert.equal(inspectOfficePackage(bytes,'docx').kind,'docx');
});
test('fake extension, empty ZIP, arbitrary bytes and swapped expected kind rejected',()=>{
  rejects(Buffer.from('this is not a DOCX'));rejects(rawZip([]));rejects(rawZip([{name:'hello.txt',body:'hello'}]));assert.throws(()=>inspectOfficePackage(rawZip(parts('pptx')),'docx'),/不是 DOCX/);assert.throws(()=>inspectOfficePackage(rawZip(parts()),'pptx'),/不是 PPTX/);
});
test('compressed input, per-entry declaration and cumulative declarations bounded before inflate',()=>{
  rejects(Buffer.alloc(LIMIT.compressed+1),/20 MiB/);
  rejects(rawZip([...parts(),{name:'data.bin',body:'x',size:LIMIT.entry+1}]),/32 MiB/);
  rejects(rawZip([...parts(),...Array.from({length:5},(_,i)=>({name:`data${i}.bin`,body:'x',size:LIMIT.entry}))]),/128 MiB/);
});
test('entry count bounded at 4096 including metadata',()=>{
  const list=Array.from({length:4097},(_,i)=>({name:`f${i}.bin`,body:''}));rejects(rawZip(list),/4096/);
});
test('actual inflate bomb exceeding tiny declared length is bounded and rejected',()=>{
  rejects(rawZip([...parts(),{name:'data.bin',body:Buffer.alloc(1024*1024,65),size:1}]),/解压失败|实际输出/);
});
test('actual length smaller than declaration and CRC corruption rejected',()=>{
  rejects(rawZip([...parts(),{name:'data.bin',body:'abc',size:4}]),/实际长度|CRC/);
  rejects(rawZip([...parts(),{name:'data.bin',body:'abc',crc:0}]),/CRC/);
});
test('compressed stream cannot contain an ignored trailing stream or garbage',()=>{
  for(const tail of [Buffer.from('garbage'),deflateRawSync(Buffer.from('extra'))])rejects(rawZip([...parts(),{name:'data.bin',body:'abc',packed:Buffer.concat([deflateRawSync(Buffer.from('abc')),tail])}]),/尾随|未消费/);
});
test('truncated DEFLATE stream rejected even with otherwise consistent directory',()=>{
  rejects(rawZip([...parts(),{name:'data.bin',body:'abcdef',packed:deflateRawSync(Buffer.from('abcdef')).subarray(0,2)}]),/解压失败|截断/);
});
test('central/local name, flags, CRC and timestamp disagreements rejected',()=>{
  for(const mutate of [(b,r)=>b[r.offset+30]^=1,(b,r)=>b.writeUInt16LE(0,r.offset+6),(b,r)=>b.writeUInt32LE(0,r.offset+14),(b,r)=>b.writeUInt16LE(1,r.offset+10)]){const b=rawZip(parts());mutate(b,centralRecords(b)[0]);rejects(b,/不一致/);}
});
test('descriptor CRC and length are verified, not just its signature',()=>{
  for(const signed of [true,false]){const b=rawZip(parts(),{descriptor:true,signature:signed});const r=centralRecords(b)[0];const at=r.offset+30+b.readUInt16LE(r.offset+26)+b.readUInt32LE(r.at+20)+(signed?4:0);b.writeUInt32LE(0,at);rejects(b,/描述符 CRC/);}
});
test('overlap, shared local offset, wrong central size, truncation and trailing bytes rejected',()=>{
  const a=rawZip(parts());const records=centralRecords(a);a.writeUInt32LE(0,records[1].at+42);rejects(a,/重叠|越界/);
  const b=rawZip(parts());b.writeUInt32LE(b.readUInt32LE(b.length-10)+1,b.length-10);rejects(b,/目录边界/);
  rejects(rawZip(parts()).subarray(0,-1),/结束目录/);rejects(Buffer.concat([rawZip(parts()),Buffer.from('trailer')]),/尾随/);rejects(rawZip(parts(),{prefix:Buffer.from('MZ')}),/前缀/);
});
test('unsupported encryption, ZIP64, methods, flags and disk numbers rejected',()=>{
  for(const patch of [{flags:0x801},{flags:0x840},{method:99},{version:45},{extra:Buffer.from([1,0,0,0])},{extra:Buffer.from([1,0x99,0,0])}])rejects(rawZip([{...parts()[0],...patch},...parts().slice(1)]));
  const z=rawZip(parts());z.writeUInt16LE(1,z.length-18);rejects(z,/分卷/);
  const x=rawZip(parts());x.writeUInt16LE(0xffff,x.length-12);x.writeUInt16LE(0xffff,x.length-14);rejects(x,/ZIP64/);
});
test('unsafe ZIP paths and case-insensitive duplicate names rejected',()=>{
  for(const name of ['../x.bin','/x.bin','word/../x.bin','word\\x.bin','C:/x.bin','word//x.bin','word/%2e%2e/x.bin','word/x.','word/x\0.bin','word/a b.bin'])rejects(rawZip([...parts(),{name,body:'x'}]),/路径|部件/);
  rejects(rawZip([...parts(),{name:'word/document.XML',body:'x'}]),/重复|冲突/);
});
test('special Unix entries and malformed extra fields rejected',()=>{
  rejects(rawZip([...parts(),{name:'link.bin',body:'x',attrs:(0xa1ff<<16)>>>0}]),/符号链接/);
  rejects(rawZip([{...parts()[0],extra:Buffer.from([0x55,0x54,10,0,0])},...parts().slice(1)]),/扩展字段/);
});
test('UTF-8 names explicitly encoded are accepted and ambiguous legacy names rejected',()=>{
  const list=[...parts(),{name:'word/数据.bin',body:'x'}];assert.equal(inspectOfficePackage(rawZip(list),'docx').entries,4);rejects(rawZip([...parts(),{name:'word/数据.bin',body:'x',flags:0}]),/UTF-8/);
});
test('control XML cannot exceed 2 MiB',()=>{
  const first=parts()[0];rejects(rawZip([{...first,body:types('docx')+' '.repeat(LIMIT.controlXml)},...parts().slice(1)]),/2 MiB/);
});
test('content-type and relationship roots require exact namespaces and names',()=>{
  rejects(rawZip(parts('docx',{'[Content_Types].xml':types('docx').replace(NS.ct,'urn:fake')})),/命名空间/);
  rejects(rawZip(parts('docx',{'_rels/.rels':rels('docx').replace('Relationships','Wrong')})));
});
test('duplicate content declarations rejected and missing actual-part type rejected',()=>{
  rejects(rawZip(parts('docx',{'[Content_Types].xml':types('docx',`<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>`)})),/重复/);
  rejects(rawZip(parts('docx',{'[Content_Types].xml':types('docx',`<Default Extension="XML" ContentType="application/xml"/>`)})),/重复/);
  rejects(rawZip([...parts(),{name:'untyped.xyz',body:'x'}]),/缺少内容类型/);
});
test('mixed DOCX/PPTX main parts rejected',()=>{
  const main2={name:paths.pptx,body:body.pptx};const ct=types('docx',`<Override PartName="/${paths.pptx}" ContentType="${CT.pptx}"/>`);rejects(rawZip([...parts('docx',{'[Content_Types].xml':ct}),main2]),/混合/);
});
test('missing, duplicate or external officeDocument relationships rejected',()=>{
  rejects(rawZip(parts('docx',{'_rels/.rels':`<Relationships xmlns="${NS.rel}"/>`})),/恰有一个/);
  rejects(rawZip(parts('docx',{'_rels/.rels':rels('docx',`<Relationship Id="rId2" Type="${NS.office}" Target="word/document.xml"/>`)})),/恰有一个/);
  rejects(rawZip(parts('docx',{'_rels/.rels':rels('docx').replace('Target=','TargetMode="External" Target=')})),/内部主文档/);
});
test('relationship ID duplicate, missing target and traversal out of package rejected',()=>{
  for(const extra of [`<Relationship Id="rId1" Type="urn:x" Target="word/document.xml"/>`,`<Relationship Id="rId2" Type="urn:x" Target="no.xml"/>`,`<Relationship Id="rId2" Type="urn:x" Target="../no.xml"/>`])rejects(rawZip(parts('docx',{'_rels/.rels':rels('docx',extra)})));
});
test('external hyperlink remains inert and is not fetched; normal ../ internal resolution supported',()=>{
  const extra=`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/path?x=1&amp;y=2" TargetMode="External"/>`;
  const local=`<Relationships xmlns="${NS.rel}"><Relationship Id="rIdA" Type="urn:example" Target="../docProps/test.xml"/></Relationships>`;
  const list=[...parts('docx',{'_rels/.rels':rels('docx',extra)}),{name:'word/_rels/document.xml.rels',body:local},{name:'docProps/test.xml',body:'<test/>'}];assert.equal(inspectOfficePackage(rawZip(list),'docx').entries,5);
});
test('macro/ActiveX/attached-template/OLE indicators rejected even on unused declarations',()=>{
  rejects(rawZip(parts('docx',{'[Content_Types].xml':types('docx',`<Override PartName="/unused.bin" ContentType="application/vnd.ms-office.vbaProject"/>`)})),/宏|OLE/);
  rejects(rawZip([...parts(),{name:'word/activeX/control.bin',body:'x'}]),/主动内容|宏/);
  rejects(rawZip(parts('docx',{'_rels/.rels':rels('docx',`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://example.invalid/t.dotm" TargetMode="External"/>`)})),/模板/);
});
test('OLE compound or MZ executable signatures rejected regardless of extension',()=>{
  for(const b of [Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]),Buffer.from('MZexecutable')])rejects(rawZip([...parts(),{name:'word/data.bin',body:b}]),/OLE|可执行/);
});
test('well-formed XML and main-root semantics checked, including every XML part',()=>{
  for(const value of [`<w:wrong xmlns:w="${NS.w}"/>`,`<w:document xmlns:w="urn:fake"><w:body/></w:document>`,`<w:document xmlns:w="${NS.w}"/>`,`<w:document xmlns:w="${NS.w}"><w:body></w:document>`])rejects(rawZip(parts('docx',{'word/document.xml':value})));
  rejects(rawZip([...parts(),{name:'word/other.xml',body:'<broken>'}]),/XML/);
});
test('DTD entities processing instructions malformed entities and duplicate attributes rejected',()=>{
  for(const value of ['<!DOCTYPE x [<!ENTITY a "boom">]>'+body.docx,'<?xml-stylesheet href="https://example.invalid/x"?>'+body.docx,body.docx.replace('合成测试','&fake;'),body.docx.replace('合成测试','&#0;'),body.docx.replace('合成测试','bad & missing'),body.docx.replace('<w:body>','<w:body a="1" a="2">')])rejects(rawZip(parts('docx',{'word/document.xml':value})),/XML|DTD/);
});
test('namespace aliases cannot conceal duplicate expanded attributes',()=>{
  const main=body.docx.replace('<w:body>','<w:body xmlns:a="urn:same" xmlns:b="urn:same" a:x="1" b:x="2">');rejects(rawZip(parts('docx',{'word/document.xml':main})),/等价.*重复/);
});
test('legal comments, CDATA, character references, custom prefixes and strict OOXML namespace accepted',()=>{
  for(const main of [body.docx.replace('合成测试','A&amp;B &#x4e2d; &#25991;'),body.docx.replace('合成测试','<![CDATA[<XML> is text]]>'),body.docx.replace('<w:body>','<!-- real comment --><w:body>'),body.docx.replaceAll('w:','custom:').replace('xmlns:w=','xmlns:custom='),body.docx.replace(NS.w,'http://purl.oclc.org/ooxml/wordprocessingml/main')])assert.equal(inspectOfficePackage(rawZip(parts('docx',{'word/document.xml':main})),'docx').kind,'docx');
});
test('UTF-16LE XML accepted; declaration mismatch and malformed UTF-8 rejected',()=>{
  const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('<?xml version="1.0" encoding="UTF-16"?>'+body.docx,'utf16le')]);assert.equal(inspectOfficePackage(rawZip(parts('docx',{'word/document.xml':utf16})),'docx').kind,'docx');
  rejects(rawZip(parts('docx',{'word/document.xml':'<?xml version="1.0" encoding="UTF-16"?>'+body.docx})),/编码/);
  rejects(rawZip(parts('docx',{'word/document.xml':Buffer.from([0xc3,0x28])})),/编码/);
});
test('XML depth and repeated root/closing errors rejected cleanly',()=>{
  for(const xml of ['<x>'.repeat(257)+'</x>'.repeat(257),body.docx+'<extra/>',body.docx+'</extra>',body.docx.replace('合成测试',']]>')])rejects(rawZip(parts('docx',{'word/document.xml':xml})),/XML/);
});
test('ordinary embedded XLSX accepted under shared resource budget, macro workbook rejected',()=>{
  const outer=(book)=>[...parts('pptx',{'[Content_Types].xml':types('pptx','<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>')}),{name:'ppt/embeddings/chart.xlsx',body:book}];
  assert.equal(inspectOfficePackage(rawZip(outer(rawZip(parts('xlsx')))),'pptx').entries,4);
  const macro=rawZip(parts('xlsx',{'[Content_Types].xml':types('xlsx').replace(CT.xlsx,'application/vnd.ms-excel.sheet.macroEnabled.main+xml')}));assert.throws(()=>inspectOfficePackage(rawZip(outer(macro)),'pptx'),/宏/);
});
test('native PptxGenJS chart embedded Excel workbook remains accepted',async()=>{
  const ppt=new PptxGenJS();ppt.addSlide().addChart(ppt.ChartType.bar,[{name:'合成数据',labels:['A','B'],values:[1,2]}],{x:1,y:1,w:6,h:4});const blob=await ppt.write({outputType:'blob',compression:true});assert.equal(inspectOfficePackage(new Uint8Array(await blob.arrayBuffer()),'pptx').kind,'pptx');
});
test('embedded non-XLSX archives and nested embeddings rejected',()=>{
  rejects(rawZip([...parts(),{name:'word/embeddings/data.bin',body:'test'}]),/嵌入对象/);
  const inner=rawZip([...parts('xlsx'),{name:'xl/embeddings/data.bin',body:'test'}]);const outer=[...parts('pptx',{'[Content_Types].xml':types('pptx','<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>')}),{name:'ppt/embeddings/chart.xlsx',body:inner}];assert.throws(()=>inspectOfficePackage(rawZip(outer),'pptx'),/嵌入对象/);
});
test('ZIP filename BOM cannot alias the mandatory content-types path',()=>{
  const list=parts();list[0].name='\uFEFF[Content_Types].xml';rejects(rawZip(list),/缺少/);
});
test('control XML text and CDATA are not mistaken for valid empty control records',()=>{
  for(const inserted of ['unexpected','<![CDATA[hidden]]>'])rejects(rawZip(parts('docx',{'[Content_Types].xml':types('docx').replace('</Types>',inserted+'</Types>')})),/XML/);
  rejects(rawZip(parts('docx',{'word/document.xml':'<?xml encoding="UTF-8" version="1.0"?>'+body.docx})),/声明/);
});
test('embedded workbook checks do not depend on conventional embeddings directory',()=>{
  const outer=book=>[...parts('pptx',{'[Content_Types].xml':types('pptx','<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>')}),{name:'ppt/media/chart.xlsx',body:book}];
  assert.equal(inspectOfficePackage(rawZip(outer(rawZip(parts('xlsx')))),'pptx').kind,'pptx');
  const macro=rawZip(parts('xlsx',{'[Content_Types].xml':types('xlsx').replace(CT.xlsx,'application/vnd.ms-excel.sheet.macroEnabled.main+xml')}));assert.throws(()=>inspectOfficePackage(rawZip(outer(macro)),'pptx'),/宏/);
  rejects(rawZip([...parts(),{name:'hidden.bin',body:rawZip(parts('xlsx'))}]),/嵌入对象/);
});
test('relationship semantics cannot bypass screening through a renamed extension',()=>{
  const ct=types('docx','<Override PartName="/word/hidden.bin" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>');
  rejects(rawZip([...parts('docx',{'[Content_Types].xml':ct}),{name:'word/hidden.bin',body:`<Relationships xmlns="${NS.rel}"/>`}]),/关系部件路径/);
  rejects(rawZip([...parts(),{name:'word/_rels/document.xml.RELS',body:`<Relationships xmlns="${NS.rel}"/>`}]),/关系部件路径/);
});
