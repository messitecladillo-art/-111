/**
 * Zero-dependency schema types, limits, Unicode identity-term normalization, and strict duplicate-key JSON receipt guard
 * for Submission Preflight (`/preflight`). Kept separate from `sax` and `pako` in `submission-preflight.ts` so the
 * main-thread `/preflight` initial bundle stays 100% free of heavy XML/ZIP decompression runtimes and `questionnaire.ts`.
 */

export const PREFLIGHT_LIMITS = Object.freeze({
  input: 20 * 1024 * 1024,
  entries: 2000,
  total: 64 * 1024 * 1024,
  entry: 8 * 1024 * 1024,
  findings: 500,
  xmlNodes: 300_000,
  xmlDepth: 128,
  terms: 128,
});

export type PreflightFinding = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  location: string;
  field?: string;
};

export type PreflightCoverage = {
  id: string;
  label: string;
  status: 'checked' | 'manual' | 'not_checked';
  detail: string;
};

export type PreflightReport = {
  schema: 'submission-preflight/v1';
  name: string;
  format: 'docx' | 'pptx' | 'pdf';
  bytes: number;
  sha256: string;
  scope: 'local-initial' | 'server-deep';
  status: 'issues_found' | 'no_issues_in_checked_scope' | 'incomplete';
  findings: PreflightFinding[];
  coverage: PreflightCoverage[];
  termsHash: string;
  cleanup?: { completed: true; reason: 'temporary-upload' };
};

export type PreflightWorkerRequest = {
  id: string;
  buffer: ArrayBuffer;
  name: string;
  terms: string[];
};

export type PreflightWorkerResponse =
  | { id: string; phase: string }
  | { id: string; result: PreflightReport }
  | { id: string; error: string };

export const normalizePreflightText = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();

export function normalizeIdentityTerms(input: string[]): string[] {
  if (!Array.isArray(input) || input.some((value) => typeof value !== 'string')) {
    throw new Error('身份词必须是文字列表。');
  }
  const terms = [...new Set(input.map(normalizePreflightText).filter(Boolean))];
  if (
    terms.length > PREFLIGHT_LIMITS.terms
    || terms.some((term) => term.length > 64)
    || new TextEncoder().encode(JSON.stringify(terms)).length > 4096
  ) {
    throw new Error('身份词最多 128 项，每项最多 64 个 UTF-16 单元，合计 JSON 文字最多 4 KiB。');
  }
  return terms;
}

/**
 * Inspects JSON tokens for duplicate object member keys and excessive nesting depth so last-key-wins payloads
 * are rejected deterministically before `JSON.parse` output is accepted.
 */
export function rejectDuplicateJsonMembers(raw: string): void {
  const stack: { object: boolean; key: boolean; keys: Set<string> }[] = [];
  const tokens = raw.matchAll(/"(?:\\.|[^"\\])*"|[{}[\],:]/gu);
  for (const match of tokens) {
    const token = match[0];
    const top = stack.at(-1);
    if (token === '{' || token === '[') {
      if (stack.length >= 16) {
        throw new Error('JSON 嵌套过深，不是本工具支持的结构。');
      }
      stack.push({ object: token === '{', key: token === '{', keys: new Set() });
    } else if (token === '}' || token === ']') {
      stack.pop();
    } else if (token === ',' && top?.object) {
      top.key = true;
    } else if (token.startsWith('"') && top?.object && top.key) {
      const key = JSON.parse(token) as string;
      if (top.keys.has(key)) {
        throw new Error('JSON 对象存在重复字段，未选择其中任一值；请核对原始回执。');
      }
      top.keys.add(key);
      top.key = false;
    }
  }
}
