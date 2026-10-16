/**
 * Parsing of data pasted into the sampling calculators. Lines may be separated by tabs (copied from a
 * spreadsheet), commas (also Chinese ，；) or spaces; a first line whose numeric fields do not parse is
 * treated as a header. Errors name the line so the user can fix it.
 */
export type Parsed<T> = { rows: T[]; header: string[] | null; errors: string[] };

function cells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  if (/[,，;；]/.test(line)) return line.split(/[,，;；]/).map(c => c.trim());
  return line.trim().split(/\s+/);
}
const toNumber = (text: string) => { const t = text.replace(/[\s,]/g, ''); if (t === '') return NaN; const v = Number(t); return Number.isFinite(v) ? v : NaN; };

/**
 * Generic parser: `spec` lists for each column whether it is a label or a number. Extra columns are ignored.
 */
export function parseTable(text: string, spec: ('label' | 'number')[]): Parsed<(string | number)[]> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean), rows: (string | number)[][] = [], errors: string[] = [];
  let header: string[] | null = null;
  lines.forEach((line, index) => {
    const parts = cells(line);
    if (parts.length < spec.length) { errors.push(`第 ${index + 1} 行只有 ${parts.length} 列，需要 ${spec.length} 列。`); return; }
    const values = spec.map((kind, k) => kind === 'label' ? parts[k] : toNumber(parts[k]));
    const bad = spec.findIndex((kind, k) => kind === 'number' && !Number.isFinite(values[k] as number));
    if (bad >= 0) {
      if (index === 0) { header = parts.slice(0, spec.length); return; }
      errors.push(`第 ${index + 1} 行第 ${bad + 1} 列「${parts[bad]}」不是数值。`); return;
    }
    if (spec.some((kind, k) => kind === 'label' && !(values[k] as string))) { errors.push(`第 ${index + 1} 行缺少名称。`); return; }
    rows.push(values);
  });
  return { rows, header, errors };
}

export function parsePairs(text: string): Parsed<{ x: number; y: number }> {
  const p = parseTable(text, ['number', 'number']);
  return { ...p, rows: p.rows.map(([x, y]) => ({ x: x as number, y: y as number })) };
}
export function parseLabeled(text: string): Parsed<{ label: string; value: number }> {
  const p = parseTable(text, ['label', 'number']);
  return { ...p, rows: p.rows.map(([label, value]) => ({ label: label as string, value: value as number })) };
}
export function parseLabeledPairs(text: string): Parsed<{ label: string; x: number; y: number }> {
  const p = parseTable(text, ['label', 'number', 'number']);
  return { ...p, rows: p.rows.map(([label, x, y]) => ({ label: label as string, x: x as number, y: y as number })) };
}
