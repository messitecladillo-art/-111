export const VECTOR_ASSETS = [
  { id:'mosaic-edge', title:'证据拼片', category:'底纹', description:'有限色块组合，适用于封面与分节边缘。' },
  { id:'focus-loop', title:'聚焦轮廓', category:'主题元素', description:'层叠轮廓，适用于研究问题与综合发现。' },
  { id:'path-ribbon', title:'行动路径', category:'边饰', description:'连续的几何路径，适用于建议与结论页。' },
] as const;
export {getVectorPrimitives} from './vector-primitives.ts';
import {vectorPrimitivesSvg} from './vector-primitives.ts';
export function getVectorAsset(id:string,color='#255D87'):string { return vectorPrimitivesSvg(id,color); }
/** The exported library is deliberately self-contained: no bitmap, script, filters or remote resources. */
export function assertTrueVector(svg:string):void {
  if(typeof svg!=='string'||svg.length>200000||!/^<svg\s/u.test(svg)||!/<\/svg>\s*$/u.test(svg)||/<(?:image|script|foreignObject|filter|fe\w+|style|iframe)\b|\b(?:href|on\w+)\s*=|data:|javascript:|url\s*\(|<!DOCTYPE|<!ENTITY/iu.test(svg))throw Error('素材必须是自包含的真实 SVG 图形。');
  const tags=[...svg.matchAll(/<\/?([a-zA-Z][\w:-]*)\b/g)].map(match=>match[1]);
  if(tags.some(tag=>!['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath'].includes(tag)))throw Error('SVG 使用了未支持的元素。');
}
