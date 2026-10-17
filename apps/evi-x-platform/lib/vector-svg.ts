import sax from 'sax';

const SVG_NS='http://www.w3.org/2000/svg',XMLNS='http://www.w3.org/2000/xmlns/';
const ELEMENTS=new Set(['svg','g','defs','clipPath','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','title','desc','linearGradient','radialGradient','stop']);
const ATTRIBUTES=new Set(['id','width','height','viewBox','preserveAspectRatio','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','dx','dy','d','points','transform','fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','stroke-miterlimit','opacity','clip-path','clip-rule','font-family','font-size','font-style','font-weight','text-anchor','dominant-baseline','alignment-baseline','textLength','lengthAdjust','role','aria-label','style','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','spreadMethod']);
const STYLE_PROPERTIES=new Set(['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','stroke-miterlimit','opacity','clip-path','font','font-family','font-size','font-style','font-weight','text-anchor','dominant-baseline','alignment-baseline']);
const NUMERIC=new Set(['width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','dx','dy','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-miterlimit','fill-opacity','opacity','font-size','textLength','offset','stop-opacity']);
const IDENTIFIER=/^[A-Za-z_][A-Za-z0-9_.-]{0,100}$/;
const fail=():never=>{throw Error('素材必须是无外部资源、无位图和脚本的真实 SVG。');};

/** Strict XML validation for generated vector art, including local clipping IDs. */
export function assertTrueVector(svg:string):string{
 if(typeof svg!=='string'||new TextEncoder().encode(svg).length>2_000_000||!/^\s*<svg\b/.test(svg)||/<!|<\?/.test(svg))return fail();
 const ids=new Map<string,string>(),references:{id:string;property:string}[]=[];
 let depth=0,nodes=0;const resourceStack:boolean[]=[];
 const checkValue=(name:string,value:string)=>{
  if(value.length>100_000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))return fail();
  if(/url\s*\(/i.test(value)){
   const match=/^url\(#([A-Za-z_][A-Za-z0-9_.-]{0,100})\)$/.exec(value);
   if(!match||!['fill','stroke','clip-path'].includes(name)||resourceStack.at(-1))return fail();references.push({id:match[1],property:name});
  }else if(name==='clip-path'&&value!=='none')return fail();
  if(/(?:javascript|data|file|https?)\s*:|expression\s*\(|@|\\/i.test(value))return fail();
  if(NUMERIC.has(name)&&value!=='none'){
   if(!/^[0-9eE+.,\-\s%a-zA-Z]*$/.test(value))return fail();
   const numbers=value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g);
   if(!numbers?.length||numbers.some(part=>!Number.isFinite(Number(part))||Math.abs(Number(part))>1e9))return fail();
   if(/NaN|Infinity/i.test(value))return fail();
  }
  if(['d','points','viewBox','transform','gradientTransform'].includes(name)){
   if(!/^[0-9eE+.,\-\sA-Za-z()]*$/.test(value))return fail();
   if(/NaN|Infinity/i.test(value))return fail();
   const numbers=value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g)??[];
   if(numbers.some(part=>!Number.isFinite(Number(part))||Math.abs(Number(part))>1e9))return fail();
  }
 };
 const options={xmlns:true,strictEntities:true},parser=sax.parser(true,options);
 parser.onopentag=input=>{const node=input as sax.QualifiedTag;
  depth++;nodes++;if(depth>64||nodes>20_000||node.uri!==SVG_NS||!ELEMENTS.has(node.local)||(depth===1&&node.local!=='svg')||(depth>1&&node.local==='svg'))return fail();
  resourceStack.push(resourceStack.at(-1)===true||['clipPath','linearGradient','radialGradient'].includes(node.local));
  for(const attribute of Object.values(node.attributes)){
   const attr=attribute as sax.QualifiedAttribute;
   if(attr.uri===XMLNS){if(attr.value!==SVG_NS&&attr.value!=='http://www.w3.org/1999/xlink')return fail();continue;}
   if(attr.uri||attr.prefix||!ATTRIBUTES.has(attr.name))return fail();
   if(attr.name==='id'){if(!IDENTIFIER.test(attr.value)||ids.has(attr.value))return fail();ids.set(attr.value,node.local);}
   else if(attr.name==='style'){
    for(const declaration of attr.value.split(';').filter(value=>value.trim())){const colon=declaration.indexOf(':');if(colon<1)return fail();const name=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim();if(!STYLE_PROPERTIES.has(name))return fail();checkValue(name,value);}
   }else if(!['aria-label','role','font-family'].includes(attr.name))checkValue(attr.name,attr.value);
  }
 };
 parser.onclosetag=()=>{depth--;resourceStack.pop();};
 parser.onerror=()=>fail();
 try{parser.write(svg).close();}catch{return fail();}
 if(depth!==0||nodes===0)return fail();
 for(const reference of references){const tag=ids.get(reference.id);if(!tag||(reference.property==='clip-path'?tag!=='clipPath':!['linearGradient','radialGradient'].includes(tag)))return fail();}
 return svg;
}
