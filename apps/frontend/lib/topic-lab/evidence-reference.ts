/** Metadata provenance only. This reference contains neither a literature corpus nor proof of fulltext review. */
import type { LiteratureEvidenceReference } from './workspace.ts';
export type { LiteratureEvidenceReference } from './workspace.ts';

export const MAX_LITERATURE_EVIDENCE_REFERENCE_BYTES = 1024 * 1024;
const KEYS = ['schema', 'classification', 'corpusHash', 'parameterHash', 'snapshotHash', 'sourceIds', 'selectedTerms'];
function fail(): never { throw Error('文献证据引用格式、大小或版本无效。'); }
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}
function list(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail();
  const result = Array.from({ length: value.length }, (_, i) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    return text(descriptor.value, length);
  });
  if (new Set(result).size !== result.length) fail();
  return result;
}
export function parseLiteratureEvidenceReference(value: unknown): LiteratureEvidenceReference {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== KEYS.length || Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !KEYS.includes(key) || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) fail();
  const raw = value as Record<string, unknown>;
  if (raw.schema !== 'literature-evidence/v1' || raw.classification !== 'metadata_analysis') fail();
  const hash = (value: unknown): string => { const result = text(value, 64); if (!/^[a-f0-9]{64}$/u.test(result)) fail(); return result; };
  const result: LiteratureEvidenceReference = { schema: 'literature-evidence/v1', classification: 'metadata_analysis',
    corpusHash: hash(raw.corpusHash), parameterHash: hash(raw.parameterHash), snapshotHash: hash(raw.snapshotHash),
    sourceIds: list(raw.sourceIds, 100000, 160), selectedTerms: list(raw.selectedTerms, 2000, 240) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_LITERATURE_EVIDENCE_REFERENCE_BYTES) fail();
  return result;
}

export function literatureEvidenceReferencesEqual(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(parseLiteratureEvidenceReference(left)) === JSON.stringify(parseLiteratureEvidenceReference(right)); }
  catch { return false; }
}
