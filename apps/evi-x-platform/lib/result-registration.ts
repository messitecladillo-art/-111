import {parseEditorContent,type EditorContent} from './editor-model.ts';
import {appendQualityResult} from './quality-layouts.ts';
import type {ResultSnapshot} from './research-quality.ts';
import type {ReportFigure,ProjectVisualStyle} from './report-figure.ts';
export type ResultRegistration={result:ResultSnapshot;figures?:ReportFigure[];visualStyle?:ProjectVisualStyle};
export function appendRegisteredResult(content:EditorContent,registration:ResultRegistration){
 const next=appendQualityResult(content,registration.result);
 if(!registration.figures?.length)return next;
 const figures=[...(next.figures??[])];
 for(const figure of registration.figures){const previous=figures.find(f=>f.id===figure.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(figure))throw Error('图形标识已使用，请登记新版本。');if(!previous)figures.push(figure);}
 const visualStyle=next.visualStyle??registration.visualStyle;
 return parseEditorContent({...next,version:3,figures,visualStyle});
}
