import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createEditorContent} from '../lib/editor-model.ts';
import {buildDocx} from '../lib/editor-export.ts';
import {DEFAULT_REPORT_OPTIONS} from '../lib/report-format.ts';
const content=createEditorContent();
content.title='校园服务流程研究排版合成验收';content.subtitle='用于软件排版测试的合成文本';
content.report=[{id:'abstract',title:'摘要',body:'本文件使用合成文字验证报告排版程序，不包含实际调查记录或研究发现。重点检查中文字体、标题层级、段间距、跨页正文与目录页码。'.repeat(4),source:''},
  ...Array.from({length:4},(_,i)=>({id:`body-${i}`,title:`${['一','二','三','四'][i]}、${['研究问题与范围','调查设计与工具','数据处理与分析方法','讨论及行动建议'][i]}`,body:'（一）研究内容与边界\n'+Array.from({length:7},(_,n)=>`${n+1}. 合成段落 ${n+1}\n`+'这是一段用于排版验收的中文合成文字。每段保留清楚的对象、时间范围与分析口径，避免使用无法核对的结论。这里的文字只用于检查换行、段前半行间距、首行缩进和页末孤行控制，不代表真实受访者、数据或实地调查。'.repeat(3)).join('\n'),source:'合成测试文字，无实际文献引用。'})),
  {id:'references',title:'参考文献',body:'[1] 格式验收占位条目[M]. 本条不代表真实出版物，正式报告须替换为实际引用来源。',source:''},
  {id:'appendix',title:'附录 1 排版检查说明',body:'附录单独导出。本段检查正文与附录分离，确保正文文件不带入仅属附录的文字。\n本页全部内容为合成验收说明。',source:''}];
const out=new URL('./fixtures/report-format/',import.meta.url);await mkdir(out,{recursive:true});
const results=[];
for(const part of ['main','appendix']){const bytes=new Uint8Array(await (await buildDocx(content,{...DEFAULT_REPORT_OPTIONS,part})).arrayBuffer());const name=`synthetic-${part}.docx`;await writeFile(new URL(name,out),bytes);results.push({path:fileURLToPath(new URL(name,out)),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,classification:'synthetic-layout-test'});}
await writeFile(new URL('fixture-manifest.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
