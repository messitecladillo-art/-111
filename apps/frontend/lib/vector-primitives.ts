export type VectorPrimitive = {
  shape:'rect'|'roundRect'|'ellipse'|'line'; x:number;y:number;width:number;height:number;
  fill?:string;stroke?:string;lineWidth?:number;opacity?:number;rotation?:number;
};
/** Shared 320 × 240 geometry for native Office shapes and SVG masters. */
export function getVectorPrimitives(id:string,color='#255D87'):VectorPrimitive[] {
  if(!/^#[a-fA-F0-9]{6}$/.test(color))throw Error('素材颜色无效。');
  const rect=(x:number,y:number,width:number,height:number,opacity=1,fill=color):VectorPrimitive=>({shape:'rect',x,y,width,height,opacity,fill});
  const line=(x:number,y:number,width:number,height:number,opacity=1,lineWidth=3,stroke=color):VectorPrimitive=>({shape:'line',x,y,width,height,opacity,lineWidth,stroke});
  if(id==='mosaic-edge')return [rect(208,8,104,56,.12),rect(112,72,96,72,.22),rect(232,80,80,80,.6),rect(8,152,80,64,.14),rect(104,168,104,64,.36),rect(232,184,72,48,.18)];
  if(id==='path-ribbon')return [
    ...[[200,88,128,176,56,.3],[216,104,144,192,72,.65],[232,120,160,208,88,1]].flatMap(([bottom,first,middle,second,top,opacity])=>[line(8,bottom,first-8,0,opacity),line(first,middle,0,bottom-middle,opacity),line(first,middle,second-first,0,opacity),line(second,top,0,middle-top,opacity),line(second,top,312-second,0,opacity)]),
    {shape:'ellipse',x:82,y:122,width:12,height:12,fill:color},{shape:'ellipse',x:170,y:50,width:12,height:12,fill:color},
    line(296,46,16,10),line(296,66,16,-10),
  ];
  if(id==='focus-loop')return [
    {shape:'roundRect',x:24,y:81,width:118,height:137,fill:color,opacity:.12},
    {shape:'roundRect',x:36,y:68,width:118,height:137,fill:'#FFFFFF',stroke:color,lineWidth:2},
    ...[92,106,134,148,162].map((y,i)=>line(54,y,i===4?49:74,0,.35,3)),rect(54,181,43,5,1,'#B79048'),
    {shape:'roundRect',x:103,y:37,width:112,height:145,fill:'#FFFFFF',stroke:color,lineWidth:2.5},
    ...[60,74,101,115].map((y,i)=>line(119,y,i===1?43:77,0,.45,3)),rect(119,149,12,16,.25),rect(140,137,12,28,.45),rect(161,125,12,40),
    {shape:'ellipse',x:171,y:60,width:112,height:112,fill:'#FFFFFF',stroke:color,lineWidth:6},
    {shape:'ellipse',x:182,y:71,width:90,height:90,stroke:color,lineWidth:2,opacity:.16},
    {shape:'roundRect',x:267,y:151,width:14,height:60,fill:color,rotation:-39},
    line(202,116,18,16,1,5,'#B79048'),line(220,132,32,-37,1,5,'#B79048'),
  ];
  if(id==='prism-compass')return [
    {shape:'ellipse',x:70,y:30,width:180,height:180,stroke:'#B79048',lineWidth:2,opacity:.45},
    {shape:'ellipse',x:92,y:52,width:136,height:136,stroke:color,lineWidth:3,opacity:.85},
    {shape:'ellipse',x:122,y:82,width:76,height:76,fill:color,opacity:.14,stroke:'#B79048',lineWidth:2},
    line(160,14,0,212,.55,2,'#B79048'),line(54,120,212,0,.55,2,'#B79048'),
    line(96,56,128,128,.35,2,color),line(96,184,128,-128,.35,2,color),
    {shape:'roundRect',x:146,y:106,width:28,height:28,fill:'#B79048',rotation:45},
    {shape:'ellipse',x:154,y:24,width:12,height:12,fill:'#B79048'},
    {shape:'ellipse',x:250,y:114,width:12,height:12,fill:color},
    {shape:'ellipse',x:154,y:204,width:12,height:12,fill:'#B79048'},
    {shape:'ellipse',x:58,y:114,width:12,height:12,fill:color},
  ];
  if(id==='xiejian-seal')return [
    {shape:'roundRect',x:76,y:36,width:168,height:168,fill:'#FAF6EE',stroke:'#9E2A2B',lineWidth:4},
    {shape:'roundRect',x:88,y:48,width:144,height:144,stroke:'#B79048',lineWidth:2,opacity:.75},
    line(144,48,0,144,.45,2,'#9E2A2B'),line(176,48,0,144,.45,2,'#9E2A2B'),
    line(88,96,144,0,.45,2,'#9E2A2B'),line(88,144,144,0,.45,2,'#9E2A2B'),
    rect(102,62,28,22,.85,'#9E2A2B'),rect(150,62,20,22,.7,color),rect(190,62,28,22,.85,'#9E2A2B'),
    rect(102,108,28,24,.7,color),rect(148,106,24,28,.95,'#B79048'),rect(190,108,28,24,.7,color),
    rect(102,156,28,22,.85,'#9E2A2B'),rect(150,156,20,22,.7,color),rect(190,156,28,22,.85,'#9E2A2B'),
  ];
  throw Error('矢量素材不存在。');
}
export function vectorPrimitivesSvg(id:string,color:string):string {
  const body=getVectorPrimitives(id,color).map(p=>{
    const attrs='fill="'+(p.fill??'none')+'" stroke="'+(p.stroke??'none')+'" stroke-width="'+(p.lineWidth??0)+'" opacity="'+(p.opacity??1)+'"'+(p.rotation?' transform="rotate('+p.rotation+' '+(p.x+p.width/2)+' '+(p.y+p.height/2)+')"':'');
    if(p.shape==='line')return '<line x1="'+p.x+'" y1="'+p.y+'" x2="'+(p.x+p.width)+'" y2="'+(p.y+p.height)+'" stroke-linecap="round" '+attrs+'/>';
    if(p.shape==='ellipse')return '<ellipse cx="'+(p.x+p.width/2)+'" cy="'+(p.y+p.height/2)+'" rx="'+p.width/2+'" ry="'+p.height/2+'" '+attrs+'/>';
    return '<rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'"'+(p.shape==='roundRect'?' rx="7"':'')+' '+attrs+'/>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">'+body+'</svg>';
}
