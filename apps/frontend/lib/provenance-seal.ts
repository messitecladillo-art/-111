import { assertTrueVector } from './vector-svg.ts';

export type SealGateStatus = 'passed' | 'pending' | 'blocked';

export interface SealGateEntry {
  id: string;
  name: string;
  status: SealGateStatus;
  metric?: string;
}

export interface SealQdiaCounts {
  questions: number;
  sampleRows: number;
  results: number;
  findings: number;
}

export interface ProvenanceSealInput {
  gates: readonly SealGateEntry[];
  qdia: SealQdiaCounts;
  verifiedDate?: string;
}

export interface ProvenanceReceipt {
  schema: 'evix.provenance-seal.v1';
  digest: string;
  canonicalPayload: string;
  status: 'all-passed' | 'blocked' | 'in-progress';
  passedCount: number;
  totalGates: number;
  gates: readonly SealGateEntry[];
  qdia: SealQdiaCounts;
  verifiedDate: string;
}

const xmlEscape = (value: string): string =>
  value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);

function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function serializeSealPayload(input: ProvenanceSealInput): string {
  const gatePart = input.gates
    .map(g => `${g.id.trim()}:${g.status}:${(g.metric ?? '').trim()}`)
    .join('|');
  const { questions, sampleRows, results, findings } = input.qdia;
  const datePart = (input.verifiedDate ?? '2026-11-01').trim();
  return `v1#gates=${gatePart}#qdia=${questions},${sampleRows},${results},${findings}#date=${datePart}`;
}

/**
 * Deterministic cross-runtime seal digest formatted as EVX-9G-XXXX-XXXX.
 */
export function computeSealDigest(input: ProvenanceSealInput): string {
  const payload = serializeSealPayload(input);
  const hi = fnv1a32(payload, 0x811c9dc5).toString(16).toUpperCase().padStart(8, '0');
  const lo = fnv1a32(payload + '#evix-prism', 0x9e3779b9).toString(16).toUpperCase().padStart(8, '0');
  return `EVX-9G-${hi.slice(0, 4)}-${lo.slice(0, 4)}`;
}

export function buildProvenanceReceipt(input: ProvenanceSealInput): ProvenanceReceipt {
  const canonicalPayload = serializeSealPayload(input);
  const digest = computeSealDigest(input);
  const passedCount = input.gates.filter(g => g.status === 'passed').length;
  const hasBlocked = input.gates.some(g => g.status === 'blocked');
  const totalGates = input.gates.length;
  const status = hasBlocked ? 'blocked' : passedCount === totalGates && totalGates > 0 ? 'all-passed' : 'in-progress';
  return {
    schema: 'evix.provenance-seal.v1',
    digest,
    canonicalPayload,
    status,
    passedCount,
    totalGates,
    gates: input.gates,
    qdia: input.qdia,
    verifiedDate: (input.verifiedDate ?? '2026-11-01').trim(),
  };
}

/**
 * Generates a self-contained, strict-XML pure vector SVG (validated by assertTrueVector)
 * representing the Song-Edition Nine-Gate Seal & Prism Astrolabe ("无征不信 · 证见九门核验").
 */
export function renderProvenanceSealSvg(input: ProvenanceSealInput): string {
  const receipt = buildProvenanceReceipt(input);
  const cx = 120;
  const cy = 120;
  const ringR = 76;
  const gates = input.gates.slice(0, 9);
  const total = Math.max(1, gates.length);

  const gateNodes: string[] = [];
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[i];
    const angleDeg = -90 + (i * 360) / total;
    const rad = (angleDeg * Math.PI) / 180;
    const gx = Number((cx + ringR * Math.cos(rad)).toFixed(2));
    const gy = Number((cy + ringR * Math.sin(rad)).toFixed(2));
    const tx = Number((cx + (ringR + 17) * Math.cos(rad)).toFixed(2));
    const ty = Number((cy + (ringR + 17) * Math.sin(rad) + 3.5).toFixed(2));
    const ix1 = Number((cx + (ringR - 12) * Math.cos(rad)).toFixed(2));
    const iy1 = Number((cy + (ringR - 12) * Math.sin(rad)).toFixed(2));
    const ix2 = Number((cx + (ringR - 5) * Math.cos(rad)).toFixed(2));
    const iy2 = Number((cy + (ringR - 5) * Math.sin(rad)).toFixed(2));

    const fill = gate.status === 'passed' ? '#00796F' : gate.status === 'blocked' ? '#B83239' : '#C8902F';
    const stroke = gate.status === 'passed' ? '#3DD6C6' : gate.status === 'blocked' ? '#F28B82' : '#F4B942';
    gateNodes.push(
      `<line x1="${ix1}" y1="${iy1}" x2="${ix2}" y2="${iy2}" stroke="${stroke}" stroke-width="1.5" stroke-opacity="0.75"/>`,
      `<circle cx="${gx}" cy="${gy}" r="6.5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      `<text x="${tx}" y="${ty}" font-family="monospace" font-size="8.5" font-weight="700" fill="#85590A" text-anchor="middle">${xmlEscape(gate.id)}</text>`,
    );
  }

  const sealStampText = receipt.status === 'all-passed' ? '九门全准' : `核验 ${receipt.passedCount}/${receipt.totalGates}`;
  const statusColor = receipt.status === 'all-passed' ? '#00796F' : receipt.status === 'blocked' ? '#B83239' : '#85590A';

  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="证见九门循证核验数字印鉴">',
    '<rect x="4" y="4" width="232" height="232" rx="16" fill="#FAF6EE" stroke="#C8902F" stroke-width="2.5"/>',
    '<rect x="11" y="11" width="218" height="218" rx="11" fill="none" stroke="#85590A" stroke-width="1" stroke-dasharray="4 3" stroke-opacity="0.65"/>',
    '<path d="M18 30V18H30M210 18H222V30M222 210V222H210M30 222H18V210" fill="none" stroke="#00796F" stroke-width="2" stroke-linecap="square"/>',
    `<circle cx="${cx}" cy="${cy}" r="94" fill="none" stroke="#C8902F" stroke-width="0.8" stroke-opacity="0.45"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="#00796F" stroke-width="1.2" stroke-dasharray="3 3" stroke-opacity="0.55"/>`,
    `<circle cx="${cx}" cy="${cy}" r="56" fill="#F4EFE3" stroke="#85590A" stroke-width="1.5"/>`,
    '<polygon points="120,21 124,26 120,31 116,26" fill="#C8902F"/>',
    '<polygon points="219,120 214,124 209,120 214,116" fill="#00796F"/>',
    '<polygon points="120,219 124,214 120,209 116,214" fill="#C8902F"/>',
    '<polygon points="21,120 26,124 31,120 26,116" fill="#00796F"/>',
    ...gateNodes,
    '<rect x="82" y="82" width="76" height="76" rx="6" fill="#FAF6EE" stroke="#B83239" stroke-width="2" stroke-opacity="0.82"/>',
    '<line x1="120" y1="82" x2="120" y2="158" stroke="#B83239" stroke-width="0.9" stroke-opacity="0.35"/>',
    '<line x1="82" y1="120" x2="158" y2="120" stroke="#B83239" stroke-width="0.9" stroke-opacity="0.35"/>',
    '<text x="101" y="108" font-family="serif" font-size="18" font-weight="900" fill="#9E2A2B" text-anchor="middle">无</text>',
    '<text x="139" y="108" font-family="serif" font-size="18" font-weight="900" fill="#9E2A2B" text-anchor="middle">征</text>',
    '<text x="101" y="144" font-family="serif" font-size="18" font-weight="900" fill="#9E2A2B" text-anchor="middle">不</text>',
    '<text x="139" y="144" font-family="serif" font-size="18" font-weight="900" fill="#9E2A2B" text-anchor="middle">信</text>',
    `<text x="120" y="172" font-family="sans-serif" font-size="9.5" font-weight="700" fill="${statusColor}" text-anchor="middle">${xmlEscape(sealStampText)}</text>`,
    `<text x="120" y="228" font-family="monospace" font-size="8.5" font-weight="700" fill="#536677" text-anchor="middle">${xmlEscape(receipt.digest)}</text>`,
    '</svg>',
  ];

  return assertTrueVector(parts.join(''));
}
