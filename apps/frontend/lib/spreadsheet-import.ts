import * as XLSX from "xlsx";
import sax, { type QualifiedAttribute, type QualifiedTag } from "sax";
import { SURVEY_LIMITS, type SurveyTable } from "./survey-analysis.ts";

export const SPREADSHEET_PARSER_VERSION = "xlsx-local/v3";
export const XLSX_LIMITS = { entries: 512, inflatedBytes: 32_000_000, entryBytes: 16_000_000, compressionRatio: 1000, parsedCells: 400_000, xmlTags: 1_600_000, xmlDepth: 64, xmlAttributes: 64, xmlAttributeLength: 8192, xmlTextLength: 65536 } as const;
export type SpreadsheetSelection = { sheetId: string; headerRow: number | null; range?: string };
export type SpreadsheetIssue = { code: string; message: string; sheetId?: string; cellRef?: string; count?: number };
export type SpreadsheetColumn = { id: string; label: string; columnIndex: number; columnLetter: string; headerRef: string | null; questionNumber: string | null };
export type SpreadsheetCellMetadata = {
  ref: string; sheetId: string; rawValue: string | number | boolean | null;
  kind: "number" | "string" | "boolean" | "date" | "error" | "blank"; cellType: string;
  formattedValue?: string; numberFormat?: string; formula?: string; formulaState: "none" | "cached" | "missing-cache";
};
export type SpreadsheetSheetInspection = { id: string; name: string; range: string | null; rows: number; columns: number; hidden: boolean; previewRows: Array<{ rowNumber: number; values: string[]; refs: string[] }> };
export type SpreadsheetInspection = { parserVersion: string; sheets: SpreadsheetSheetInspection[]; issues: SpreadsheetIssue[] };
export type SpreadsheetImportResult = { table: SurveyTable; columns: SpreadsheetColumn[]; cellMeta: SpreadsheetCellMetadata[][]; sourceRows: number[]; issues: SpreadsheetIssue[]; selection: { sheetId: string; headerRow: number | null; range: string } };
export type SpreadsheetProgress = "preflight" | "decompress" | "parse" | "inspect";
export type SpreadsheetWorkerRequest = { type: "open"; requestId: string; buffer: ArrayBuffer } | { type: "select"; requestId: string; selection: SpreadsheetSelection } | { type: "dispose"; requestId: string };
export type SpreadsheetWorkerResponse =
  | { type: "opened"; requestId: string; inspection: SpreadsheetInspection }
  | { type: "selected"; requestId: string; result: SpreadsheetImportResult }
  | { type: "disposed"; requestId: string }
  | { type: "progress"; requestId: string; phase: SpreadsheetProgress }
  | { type: "error"; requestId: string; error: { code: string; message: string; details?: Record<string, string | number> } };

export class SpreadsheetImportError extends Error {
  readonly code: string;
  readonly details: Record<string, string | number>;
  constructor(code: string, message: string, details: Record<string, string | number> = {}) {
    super(message); this.name = "SpreadsheetImportError"; this.code = code; this.details = details;
  }
}
function fail(code: string, message: string, details?: Record<string, string | number>): never { throw new SpreadsheetImportError(code, message, details); }
type ZipEntry = { name: string; flags: number; method: number; crc: number; packed: number; size: number; start: number; end: number; local: number };
type FormulaCache = { cached: boolean; formula: string };
const utf8 = new TextDecoder("utf-8", { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); return c >>> 0; });
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const v of bytes) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function safePath(name: string): boolean { return !!name && !/[\\\u0000-\u001f\u007f]/u.test(name) && !/^(?:\/|[A-Za-z]:)/u.test(name) && name.split("/").every((part, i, all) => part !== ".." && part !== "." && (!!part || i === all.length - 1)); }
function extras(view: DataView, start: number, length: number): void {
  const end = start + length;
  while (start < end) { if (start + 4 > end) fail("ZIP_INVALID", "XLSX ZIP 扩展字段损坏。"); const tag = view.getUint16(start, true), size = view.getUint16(start + 2, true); if (start + 4 + size > end) fail("ZIP_INVALID", "XLSX ZIP 扩展字段损坏。"); if (tag === 1 || tag === 0x7075) fail("ZIP_UNSUPPORTED", "暂不支持 ZIP64 或重命名扩展的工作簿。"); start += 4 + size; }
}
function preflight(bytes: Uint8Array): ZipEntry[] {
  if (bytes.byteLength > SURVEY_LIMITS.bytes) fail("FILE_LIMIT", "文件超过 2 MB，请拆分后再分析。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) fail("XLSX_REQUIRED", "请选择 .xlsx 工作簿；首批不支持 .xls、.xlsm 或加密文件。");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  if (end < 0) fail("ZIP_INVALID", "工作簿 ZIP 目录缺失或损坏。");
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true), directoryStart = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || directorySize === 0xffffffff || directoryStart === 0xffffffff) fail("ZIP_UNSUPPORTED", "暂不支持分卷或 ZIP64 工作簿。");
  if (!count || count > XLSX_LIMITS.entries) fail("ZIP_ENTRY_LIMIT", "工作簿包含过多 ZIP 条目。", { limit: XLSX_LIMITS.entries });
  if (directoryStart + directorySize !== end) fail("ZIP_INVALID", "工作簿 ZIP 目录范围不一致。");
  const entries: ZipEntry[] = [], names = new Set<string>(); let pos = directoryStart, declaredTotal = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) fail("ZIP_INVALID", "工作簿 ZIP 条目损坏。");
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), crc = view.getUint32(pos + 16, true), packed = view.getUint32(pos + 20, true), size = view.getUint32(pos + 24, true);
    const nl = view.getUint16(pos + 28, true), el = view.getUint16(pos + 30, true), cl = view.getUint16(pos + 32, true), local = view.getUint32(pos + 42, true);
    if (pos + 46 + nl + el + cl > end || !nl || local === 0xffffffff || packed === 0xffffffff || size === 0xffffffff) fail("ZIP_INVALID", "工作簿 ZIP 条目范围不合法。");
    let name: string; try { name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + nl)); } catch { fail("ZIP_INVALID", "工作簿 ZIP 文件名编码损坏。"); }
    if (!safePath(name) || names.has(name)) fail("ZIP_PATH_INVALID", "工作簿包含重复或不安全的 ZIP 路径。"); names.add(name);
    if ((flags & 0x41) || view.getUint16(pos + 34, true) !== 0) fail("ZIP_UNSUPPORTED", "暂不支持加密或分卷工作簿。");
    if (method !== 0 && method !== 8) fail("ZIP_UNSUPPORTED", "工作簿使用了不支持的压缩方式。");
    if (/vbaProject|(?:^|\/)activeX\/|(?:^|\/)embeddings\/|(?:^|\/)macrosheets\//iu.test(name)) fail("MACRO_UNSUPPORTED", "请选择不含宏或嵌入程序的 .xlsx 工作簿。");
    declaredTotal += size;
    if (size > XLSX_LIMITS.entryBytes || declaredTotal > XLSX_LIMITS.inflatedBytes || (size > 0 && (!packed || size / packed > XLSX_LIMITS.compressionRatio))) fail("ZIP_EXPANSION_LIMIT", "工作簿解压尺寸超过读取预算。", { limit: XLSX_LIMITS.inflatedBytes });
    extras(view, pos + 46 + nl, el);
    if (local + 30 > directoryStart || view.getUint32(local, true) !== 0x04034b50) fail("ZIP_INVALID", "工作簿 ZIP 本地条目缺失。");
    const ln = view.getUint16(local + 26, true), le = view.getUint16(local + 28, true), start = local + 30 + ln + le;
    if (start > directoryStart || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || ln !== nl || !bytes.subarray(local + 30, local + 30 + ln).every((v, k) => v === bytes[pos + 46 + k])) fail("ZIP_INVALID", "ZIP 本地条目与目录不一致。");
    extras(view, local + 30 + ln, le);
    if (!(flags & 8) && (view.getUint32(local + 14, true) !== crc || view.getUint32(local + 18, true) !== packed || view.getUint32(local + 22, true) !== size)) fail("ZIP_INVALID", "ZIP 本地尺寸与目录不一致。");
    if (start + packed > directoryStart) fail("ZIP_INVALID", "工作簿 ZIP 内容范围不合法。");
    entries.push({ name, flags, method, crc, packed, size, start, end: start + packed, local }); pos += 46 + nl + el + cl;
  }
  if (pos !== end) fail("ZIP_INVALID", "ZIP 条目数量与目录长度不一致。");
  const ordered = entries.map(e => ({ start: e.local, end: e.end })).sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) if (ordered[i].start < ordered[i - 1].end) fail("ZIP_INVALID", "工作簿 ZIP 条目相互重叠。");
  if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) fail("XLSX_REQUIRED", "文件不是受支持的 .xlsx 工作簿。");
  return entries;
}
async function inflate(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const packed = bytes.subarray(entry.start, entry.end);
  if (entry.method === 0) { if (packed.length !== entry.size || crc32(packed) !== entry.crc) fail("ZIP_INTEGRITY", "工作簿 ZIP 内容校验失败。", { entry: entry.name }); return packed; }
  let stream: ReadableStream<Uint8Array>;
  try { stream = new Blob([new Uint8Array(packed)]).stream().pipeThrough(new DecompressionStream("deflate-raw")); }
  catch { fail("DECOMPRESSION_UNAVAILABLE", "当前浏览器不支持安全的 XLSX 解压，请使用新版桌面浏览器。"); }
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; total += next.value.length; if (total > entry.size || total > XLSX_LIMITS.entryBytes) { await reader.cancel(); fail("ZIP_EXPANSION_LIMIT", "工作簿实际解压尺寸超过声明预算。", { entry: entry.name }); } chunks.push(next.value); }
  } catch (error) { if (error instanceof SpreadsheetImportError) throw error; fail("ZIP_INTEGRITY", "工作簿压缩内容损坏。", { entry: entry.name }); }
  const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  if (total !== entry.size || crc32(output) !== entry.crc) fail("ZIP_INTEGRITY", "工作簿解压尺寸或校验值不一致。", { entry: entry.name });
  return output;
}
type XmlAttribute = { name: string; local: string; uri: string; value: string };
type XmlElement = { name: string; local: string; uri: string; attributes: Map<string, XmlAttribute>; textLength: number };
type XmlHandlers = { open?: (element: XmlElement, ancestors: XmlElement[]) => void; close?: (element: XmlElement, ancestors: XmlElement[]) => void; text?: (value: string, element: XmlElement | undefined) => void };
const SPREADSHEET_NAMESPACES = new Set(["http://schemas.openxmlformats.org/spreadsheetml/2006/main", "http://purl.oclc.org/ooxml/spreadsheetml/main"]);
const DOCUMENT_REL_NAMESPACES = new Set(["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"]);
const PACKAGE_REL_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPE_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
function xmlAttribute(element: XmlElement, name: string): string | null { return element.attributes.get(name)?.value ?? null; }
function relationshipId(element: XmlElement): string | null { for (const attribute of element.attributes.values()) if (attribute.local === "id" && DOCUMENT_REL_NAMESPACES.has(attribute.uri)) return attribute.value; return null; }
/** Strict SAX plus explicit duplicate-attribute/root and resource checks. Never search malformed XML with cross-tag regex. */
function scanXml(text: string, entry: string, handlers: XmlHandlers = {}): void {
  const saxOptions = { xmlns: true, strictEntities: true, position: false };
  const parser = sax.parser(true, saxOptions);
  const stack: XmlElement[] = []; let attributes = new Map<string, XmlAttribute>(), expanded = new Set<string>(), tags = 0, roots = 0;
  parser.onerror = () => fail("XML_INVALID", "工作簿 XML 结构损坏。", { entry });
  parser.ondoctype = () => fail("XML_UNSUPPORTED", "工作簿包含不支持的 XML 实体声明。", { entry });
  parser.onsgmldeclaration = () => fail("XML_UNSUPPORTED", "工作簿包含不支持的 XML 声明。", { entry });
  parser.onopentagstart = tag => { if (tag.name.length > 256) fail("XML_BUDGET", "XML 标签超过读取预算。", { entry }); attributes = new Map(); expanded = new Set(); };
  parser.onattribute = raw => {
    const attribute = raw as QualifiedAttribute, name = attribute.name, key = attribute.uri + "\u0000" + attribute.local;
    if (attributes.has(name) || expanded.has(key)) fail("XML_ATTRIBUTE_DUPLICATE", "XML 标签含重复属性。", { entry, attribute: name });
    if (attributes.size >= XLSX_LIMITS.xmlAttributes || name.length > 256 || attribute.value.length > XLSX_LIMITS.xmlAttributeLength) fail("XML_BUDGET", "XML 属性超过读取预算。", { entry });
    attributes.set(name, { name, local: attribute.local, uri: attribute.uri, value: attribute.value }); expanded.add(key);
  };
  parser.onopentag = raw => {
    const tag = raw as QualifiedTag;
    if (++tags > XLSX_LIMITS.xmlTags || stack.length >= XLSX_LIMITS.xmlDepth) fail("XML_BUDGET", "XML 结构超过读取预算。", { entry });
    if (!stack.length && ++roots !== 1) fail("XML_INVALID", "XML 含多个根元素。", { entry });
    const element: XmlElement = { name: tag.name, local: tag.local, uri: tag.uri, attributes, textLength: 0 };
    handlers.open?.(element, stack); stack.push(element);
  };
  parser.onclosetag = () => { const element = stack.pop(); if (!element) fail("XML_INVALID", "XML 元素不匹配。", { entry }); handlers.close?.(element, stack); };
  const textHandler = (value: string) => {
    const element = stack.at(-1);
    if (!element && value.trim()) fail("XML_INVALID", "XML 根元素之外包含文字。", { entry });
    if (element && (element.textLength += value.length) > XLSX_LIMITS.xmlTextLength) fail("XML_BUDGET", "XML 文本超过读取预算。", { entry });
    handlers.text?.(value, element);
  };
  parser.ontext = textHandler; parser.oncdata = textHandler;
  try { for (let offset = 0; offset < text.length; offset += 16384) parser.write(text.slice(offset, offset + 16384)); parser.close(); }
  catch (error) { if (error instanceof SpreadsheetImportError) throw error; fail("XML_INVALID", "工作簿 XML 结构损坏。", { entry }); }
  if (roots !== 1 || stack.length) fail("XML_INVALID", "XML 根元素缺失或未闭合。", { entry });
}
function resolvePartTarget(target: string): string {
  if (!target || /[\\\u0000-\u001f?#%]/u.test(target) || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)) fail("RELATIONSHIP_INVALID", "工作簿内部关系路径不合法。");
  const parts = target.startsWith("/") ? [] : ["xl"];
  for (const part of target.split("/")) { if (!part || part === ".") continue; if (part === "..") { if (!parts.length) fail("RELATIONSHIP_INVALID", "工作簿内部关系路径越界。"); parts.pop(); } else parts.push(part); }
  const path = parts.join("/"); if (!safePath(path)) fail("RELATIONSHIP_INVALID", "工作簿内部关系路径不合法。"); return path;
}
type SheetDirectoryEntry = { name: string; sheetId: string; relationshipId: string; part: string };
type RawCell = { ref: string; type: string; hasFormula: boolean; formula: string; hasValue: boolean; value: string; hasInline: boolean; cached: boolean };
function validateCellLexeme(cell: RawCell, sheetId: string): void {
  const value = cell.value.trim(), details = { sheetId, cellRef: cell.ref };
  if ((cell.hasInline && cell.type !== "inlineStr") || (cell.hasValue && cell.type === "inlineStr")) fail("CELL_VALUE_INVALID", "单元格原值与声明类型不一致。", details);
  // An empty non-string formula cache is an unknown result, never a guessed zero/false.
  if (cell.hasFormula && value === "" && cell.type !== "str") return;
  if (cell.type === "n" && value !== "" && (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/u.test(value) || !Number.isFinite(Number(value)))) fail("CELL_VALUE_INVALID", "单元格原始数值格式不合法。", details);
  if (cell.type === "b" && !["0", "1", "true", "false"].includes(value)) fail("CELL_VALUE_INVALID", "单元格原始布尔值格式不合法。", details);
  if (cell.type === "s" && cell.hasValue && (!/^\+?[0-9]+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 0)) fail("CELL_VALUE_INVALID", "单元格共享字符串索引不合法。", details);
}
function scanWorksheet(text: string, entry: string, sheetIndex: number, onCell: () => void): { cells: Map<string, RawCell>; caches: Map<string, FormulaCache> } {
  const cells = new Map<string, RawCell>(), caches = new Map<string, FormulaCache>(), rows = new Set<number>();
  const sheetId = "sheet-" + sheetIndex; let namespace = "", dimension: XLSX.Range | null = null, sawDimension = false, current: RawCell | null = null, rowNumber: number | null = null;
  scanXml(text, entry, {
    open(element, ancestors) {
      const parent = ancestors.at(-1);
      if (current && parent?.uri === namespace && ["v", "f"].includes(parent.local)) fail("CELL_VALUE_INVALID", "单元格数值或公式不能包含嵌套元素。", { sheetId, cellRef: current.ref });
      if (!parent) { if (element.local !== "worksheet" || !SPREADSHEET_NAMESPACES.has(element.uri)) fail("WORKSHEET_INVALID", "所选目录不是受支持的工作表。", { entry }); namespace = element.uri; }
      if (["worksheet", "dimension", "sheetData", "row", "c", "f", "v", "is"].includes(element.local) && element.uri !== namespace) fail("WORKSHEET_NAMESPACE", "工作表关键元素的命名空间不一致。", { entry });
      if (element.uri !== namespace) return;
      if (element.local === "dimension") { if (parent?.local !== "worksheet" || sawDimension) fail("DECLARED_RANGE_MISMATCH", "工作表范围声明重复或位置有误。", { entry }); sawDimension = true; const ref = xmlAttribute(element, "ref"); if (!ref) fail("DECLARED_RANGE_MISMATCH", "工作表范围声明缺失。", { entry }); dimension = normalizedRange(ref); }
      if (element.local === "row") {
        if (parent?.local !== "sheetData") fail("WORKSHEET_INVALID", "工作表行位置有误。", { entry });
        const number = xmlAttribute(element, "r"); rowNumber = number === null ? null : Number(number);
        if (number !== null && (!/^[1-9][0-9]{0,6}$/u.test(number) || !rowNumber || rowNumber > 1048576 || rows.has(rowNumber))) fail("ROW_REFERENCE_INVALID", "工作表行定位重复或不合法。", { entry });
        if (rowNumber !== null) rows.add(rowNumber);
      }
      if (element.local === "c") {
        const ref = xmlAttribute(element, "r");
        if (parent?.local !== "row" || current) fail("WORKSHEET_INVALID", "单元格位置有误。", { entry });
        if (!ref || !/^[A-Z]{1,3}[1-9][0-9]{0,6}$/u.test(ref)) fail("CELL_REFERENCE_INVALID", "工作簿包含不合法的单元格定位。", { sheetId, cellRef: ref ?? "", entry });
        const at = XLSX.utils.decode_cell(ref);
        if (at.r >= 1048576 || at.c >= 16384 || (rowNumber !== null && at.r + 1 !== rowNumber)) fail("CELL_REFERENCE_INVALID", "单元格定位与行或 Excel 范围不一致。", { sheetId, cellRef: ref, entry });
        if (cells.has(ref)) fail("CELL_REFERENCE_DUPLICATE", "工作表包含重复单元格定位。", { sheetId, cellRef: ref, entry });
        const type = xmlAttribute(element, "t") ?? "n";
        if (!["n", "s", "str", "b", "e", "d", "inlineStr"].includes(type)) fail("CELL_VALUE_UNSUPPORTED", "单元格使用了不支持的值类型。", { sheetId, cellRef: ref });
        onCell(); current = { ref, type, hasFormula: false, formula: "", hasValue: false, value: "", hasInline: false, cached: false }; cells.set(ref, current);
      }
      if (["f", "v", "is"].includes(element.local)) {
        if (!current || parent?.local !== "c") fail("WORKSHEET_INVALID", "单元格内容位置有误。", { entry });
        if (element.local === "f") { if (current.hasFormula) fail("CELL_CONTENT_DUPLICATE", "单元格包含多个公式。", { sheetId, cellRef: current.ref }); current.hasFormula = true; }
        if (element.local === "v") { if (current.hasValue || current.hasInline) fail("CELL_CONTENT_DUPLICATE", "单元格包含多个值。", { sheetId, cellRef: current.ref }); current.hasValue = true; }
        if (element.local === "is") { if (current.hasInline || current.hasValue) fail("CELL_CONTENT_DUPLICATE", "单元格包含多个值。", { sheetId, cellRef: current.ref }); current.hasInline = true; }
      }
    },
    text(value, element) {
      if (!current || element?.uri !== namespace) return;
      if (element.local === "f") { current.formula += value; if (current.formula.length > 8192) fail("CELL_VALUE_UNSUPPORTED", "公式超过 Excel 长度范围。", { sheetId, cellRef: current.ref }); }
      if (element.local === "v") { current.value += value; if (current.value.length > XLSX_LIMITS.xmlTextLength) fail("XML_BUDGET", "单元格缓存超过读取预算。", { sheetId, cellRef: current.ref }); }
    },
    close(element) {
      if (element.uri !== namespace) return;
      if (element.local === "c" && current) { validateCellLexeme(current, sheetId); current.cached = current.hasValue && (current.value.trim() !== "" || current.type === "str"); if (current.hasFormula) caches.set(current.ref, { cached: current.cached, formula: current.formula }); current = null; }
      if (element.local === "row") rowNumber = null;
    }
  });
  for (const ref of cells.keys()) { const at = XLSX.utils.decode_cell(ref); if (!dimension || !contains(dimension, { s: at, e: at })) fail("DECLARED_RANGE_MISMATCH", "实际单元格位于工作表声明范围之外。", { sheetId, cellRef: ref }); }
  return { cells, caches };
}
function normalizedRange(text: string): XLSX.Range {
  if (typeof text !== "string" || !/^\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9][0-9]{0,6})?$/u.test(text)) fail("RANGE_INVALID", "请输入有效的单元格范围，例如 A1:H200。");
  const range = XLSX.utils.decode_range(text.replace(/\$/g, "").toUpperCase());
  if (range.s.r > range.e.r || range.s.c > range.e.c || range.e.r >= 1048576 || range.e.c >= 16384) fail("RANGE_INVALID", "单元格范围超出 Excel 范围或起止顺序有误。"); return range;
}
function contains(outer: XLSX.Range, inner: XLSX.Range): boolean { return inner.s.r >= outer.s.r && inner.s.c >= outer.s.c && inner.e.r <= outer.e.r && inner.e.c <= outer.e.c; }
function questionNumber(label: string): string | null { const match = /^(?:Q\s*|第\s*)([0-9]{1,3})(?:\s*题|\s*[.、:：\s])/iu.exec(label.trim()) || /^([0-9]{1,3})\s*[.、]/u.exec(label.trim()); return match?.[1] ?? null; }
function valueText(meta: SpreadsheetCellMetadata): string { return meta.rawValue === null ? "" : String(meta.rawValue); }

export class SpreadsheetSession {
  private readonly workbook: XLSX.WorkBook;
  private readonly formulaCaches: Map<string, Map<string, FormulaCache>>;
  private readonly inspection: SpreadsheetInspection;
  constructor(workbook: XLSX.WorkBook, formulaCaches: Map<string, Map<string, FormulaCache>>, issues: SpreadsheetIssue[]) {
    this.workbook = workbook; this.formulaCaches = formulaCaches;
    const sheets = workbook.SheetNames.map((name, index): SpreadsheetSheetInspection => {
      const id = "sheet-" + index, sheet = workbook.Sheets[name], ref = sheet["!ref"], range = ref ? normalizedRange(ref) : null;
      const rows = range ? range.e.r - range.s.r + 1 : 0, columns = range ? range.e.c - range.s.c + 1 : 0;
      for (const key of Object.keys(sheet)) {
        if (key.startsWith("!")) continue;
        if (!/^[A-Z]{1,3}[1-9][0-9]*$/u.test(key)) fail("CELL_REFERENCE_INVALID", "工作簿包含不合法的单元格定位。", { sheetId: id, cellRef: key });
        const at = XLSX.utils.decode_cell(key);
        if (!range || !contains(range, { s: at, e: at })) fail("DECLARED_RANGE_MISMATCH", "实际单元格位于工作表声明范围之外。", { sheetId: id, cellRef: key });
      }
      const previewRows: SpreadsheetSheetInspection["previewRows"] = [];
      if (range) for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 5); r++) {
        const values: string[] = [], refs: string[] = [];
        for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 11); c++) { const ref = XLSX.utils.encode_cell({ r, c }); const meta = this.cell(index, ref); values.push(meta.formulaState === "missing-cache" ? "未保存计算结果" : meta.kind === "error" ? (meta.formattedValue ?? "Excel 错误值") : valueText(meta).slice(0, SURVEY_LIMITS.cellLength)); refs.push(ref); }
        previewRows.push({ rowNumber: r + 1, values, refs });
      }
      return { id, name, range: range ? XLSX.utils.encode_range(range) : null, rows, columns, hidden: Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden), previewRows };
    });
    this.inspection = { parserVersion: SPREADSHEET_PARSER_VERSION, sheets, issues };
  }
  inspect(): SpreadsheetInspection { return structuredClone(this.inspection); }
  private cell(index: number, ref: string): SpreadsheetCellMetadata {
    const sheetId = "sheet-" + index, cell = this.workbook.Sheets[this.workbook.SheetNames[index]][ref] as XLSX.CellObject | undefined;
    const cache = this.formulaCaches.get(sheetId)?.get(ref), formula = cell?.f ?? cache?.formula;
    const hasFormula = cache !== undefined || typeof cell?.f === "string";
    const formulaState = hasFormula ? (cache?.cached ? "cached" : "missing-cache") : "none";
    const rawValue = formulaState === "missing-cache" || cell?.v === undefined || cell.t === "z" ? null : cell.v;
    if (rawValue !== null && typeof rawValue !== "number" && typeof rawValue !== "string" && typeof rawValue !== "boolean") fail("CELL_VALUE_UNSUPPORTED", "单元格使用了不支持的值类型。", { sheetId, cellRef: ref });
    const kind = cell?.t === "e" ? "error" : rawValue === null ? "blank" : typeof rawValue === "boolean" ? "boolean" : typeof rawValue === "string" ? "string" : cell?.z && XLSX.SSF.is_date(cell.z) ? "date" : "number";
    return { ref, sheetId, rawValue, kind, cellType: cell?.t ?? "z", formulaState, ...(cell?.w !== undefined ? { formattedValue: cell.w } : {}), ...(cell?.z !== undefined ? { numberFormat: String(cell.z) } : {}), ...(hasFormula ? { formula: formula ?? "" } : {}) };
  }
  select(selection: SpreadsheetSelection): SpreadsheetImportResult {
    if (!selection || typeof selection.sheetId !== "string" || !/^sheet-[0-9]+$/u.test(selection.sheetId)) fail("SELECTION_INVALID", "请选择工作表。");
    const index = Number(selection.sheetId.slice(6)), info = this.inspection.sheets[index];
    if (!info || info.id !== selection.sheetId || !info.range) fail("SHEET_EMPTY", "所选工作表为空或不存在。");
    const declared = normalizedRange(info.range), selected = selection.range === undefined ? declared : normalizedRange(selection.range);
    if (!contains(declared, selected)) fail("RANGE_OUTSIDE_SHEET", "所选范围超出工作表声明范围。", { sheetId: info.id });
    const headerRow = selection.headerRow;
    if (headerRow !== null && (!Number.isInteger(headerRow) || headerRow < selected.s.r + 1 || headerRow > selected.e.r + 1)) fail("HEADER_INVALID", "表头行必须位于所选范围内。");
    const dataStart = headerRow === null ? selected.s.r : headerRow, rows = selected.e.r - dataStart + 1, columnsCount = selected.e.c - selected.s.c + 1;
    if (rows < 1) fail("NO_DATA", "所选表头之后至少需要一条数据记录。");
    if (rows > SURVEY_LIMITS.rows) fail("ROW_LIMIT", "最多支持 5,000 条数据记录。");
    if (columnsCount > SURVEY_LIMITS.columns) fail("COLUMN_LIMIT", "最多支持 80 列。");
    if (rows * columnsCount > SURVEY_LIMITS.cells) fail("CELL_LIMIT", "最多支持 200,000 个数据单元格。");
    const issues = structuredClone(this.inspection.issues), sourceRows: number[] = [], columns: SpreadsheetColumn[] = [], cellMeta: SpreadsheetCellMetadata[][] = [], tableRows: string[][] = [];
    const check = (ref: string, recordIssue = true): SpreadsheetCellMetadata => {
      const meta = this.cell(index, ref);
      if (meta.formulaState === "missing-cache") fail("FORMULA_CACHE_MISSING", "公式没有已保存的计算结果；请在 Excel 中计算并保存后重新导入。", { sheetId: info.id, sheetName: info.name, cellRef: ref });
      if (meta.kind === "error") fail("EXCEL_CELL_ERROR", "所选范围包含 Excel 错误值；请修正后重新导入。", { sheetId: info.id, sheetName: info.name, cellRef: ref, value: meta.formattedValue ?? String(meta.rawValue) });
      const text = valueText(meta);
      if (text.length > SURVEY_LIMITS.cellLength) fail("CELL_LENGTH_LIMIT", "单元格超过 2,000 字。", { sheetId: info.id, cellRef: ref });
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) fail("CELL_CONTROL_CHARACTER", "单元格包含不支持的控制字符。", { sheetId: info.id, cellRef: ref });
      if (typeof meta.rawValue === "number" && !Number.isFinite(meta.rawValue)) fail("CELL_VALUE_UNSUPPORTED", "单元格包含非有限数值。", { sheetId: info.id, cellRef: ref });
      if (recordIssue && meta.formulaState === "cached") issues.push({ code: "FORMULA_CACHED", message: "使用工作簿已保存的公式结果。", sheetId: info.id, cellRef: ref });
      return meta;
    };
    // Prelude rows are not records, but unread formulas/errors inside the chosen range remain visible blockers.
    if (headerRow !== null) for (const ref of Object.keys(this.workbook.Sheets[info.name])) {
      if (ref.startsWith("!")) continue;
      const at = XLSX.utils.decode_cell(ref);
      if (at.r >= selected.s.r && at.r < headerRow - 1 && at.c >= selected.s.c && at.c <= selected.e.c) check(ref, false);
    }
    for (let c = selected.s.c; c <= selected.e.c; c++) {
      const columnLetter = XLSX.utils.encode_col(c), headerRef = headerRow === null ? null : XLSX.utils.encode_cell({ r: headerRow - 1, c }), label = headerRef ? valueText(check(headerRef)) : "";
      columns.push({ id: info.id + ":col-" + columnLetter, label, columnIndex: c, columnLetter, headerRef, questionNumber: questionNumber(label) });
    }
    const labels = columns.map(c => c.label);
    if (labels.some(label => label === "")) issues.push({ code: "BLANK_HEADERS", message: "空白表头保留为独立列。", sheetId: info.id });
    if (new Set(labels.filter(Boolean)).size !== labels.filter(Boolean).length) issues.push({ code: "DUPLICATE_HEADERS", message: "同名表头保留为独立列。", sheetId: info.id });
    for (let r = dataStart; r <= selected.e.r; r++) {
      const metas: SpreadsheetCellMetadata[] = [];
      for (let c = selected.s.c; c <= selected.e.c; c++) metas.push(check(XLSX.utils.encode_cell({ r, c })));
      sourceRows.push(r + 1); cellMeta.push(metas); tableRows.push(metas.map(valueText));
    }
    const sheet = this.workbook.Sheets[info.name];
    if (sheet["!merges"]?.some(merge => !(merge.e.r < selected.s.r || merge.s.r > selected.e.r || merge.e.c < selected.s.c || merge.s.c > selected.e.c))) issues.push({ code: "MERGED_CELLS", message: "合并单元格按实际原值读取，空白位置保持空白。", sheetId: info.id });
    return { table: { headers: columns.map(c => c.id), rows: tableRows, skippedBlankLines: 0, delimiter: "," }, columns, cellMeta, sourceRows, issues, selection: { sheetId: info.id, headerRow, range: XLSX.utils.encode_range(selected) } };
  }
}

export async function loadSpreadsheet(input: ArrayBuffer | Uint8Array, onProgress?: (phase: SpreadsheetProgress) => void): Promise<SpreadsheetSession> {
  if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) fail("FILE_INVALID", "工作簿读取参数不合法。");
  if (input.byteLength > SURVEY_LIMITS.bytes) fail("FILE_LIMIT", "文件超过 2 MB，请拆分后再分析。");
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input.slice(0));
  onProgress?.("preflight"); const entries = preflight(bytes); onProgress?.("decompress");
  const xml = new Map<string, string>(), issues: SpreadsheetIssue[] = [], validated = new Set<string>(); let actualTotal = 0;
  for (const entry of entries) {
    const content = await inflate(bytes, entry); actualTotal += content.length;
    if (actualTotal > XLSX_LIMITS.inflatedBytes) fail("ZIP_EXPANSION_LIMIT", "工作簿实际解压尺寸超过读取预算。");
    if (/\.(?:xml|rels)$/iu.test(entry.name)) { let text: string; try { text = utf8.decode(content); } catch { fail("XML_INVALID", "工作簿 XML 编码损坏。", { entry: entry.name }); } xml.set(entry.name, text); }
  }
  const types = xml.get("[Content_Types].xml") ?? ""; let normalWorkbookType = false;
  scanXml(types, "[Content_Types].xml", { open(element, ancestors) {
    if (!ancestors.length && (element.local !== "Types" || element.uri !== CONTENT_TYPE_NAMESPACE)) fail("XLSX_REQUIRED", "工作簿类型目录不合法。");
    if (element.uri !== CONTENT_TYPE_NAMESPACE) return;
    if (["Override", "Default"].includes(element.local)) {
      const contentType = xmlAttribute(element, "ContentType") ?? "", part = xmlAttribute(element, "PartName"), extension = xmlAttribute(element, "Extension");
      const applies = part ? entries.some(entry => entry.name === part.replace(/^\//u, "")) : extension ? entries.some(entry => entry.name.endsWith("." + extension)) : false;
      if (applies && /macroEnabled|vbaProject|macrosheet/iu.test(contentType)) fail("MACRO_UNSUPPORTED", "请选择不含宏的 .xlsx 工作簿。");
      if (part === "/xl/workbook.xml" && contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml") normalWorkbookType = true;
    }
  } }); validated.add("[Content_Types].xml");
  if (!normalWorkbookType) fail("XLSX_REQUIRED", "文件不是受支持的 .xlsx 工作簿。");
  const relationships = new Map<string, { target: string; type: string; external: boolean }>(); let externalCount = 0;
  for (const [name, text] of xml) if (name.endsWith(".rels")) {
    const ids = new Set<string>();
    scanXml(text, name, { open(element, ancestors) {
      if (!ancestors.length && (element.local !== "Relationships" || element.uri !== PACKAGE_REL_NAMESPACE)) fail("RELATIONSHIP_INVALID", "工作簿关系目录不合法。", { entry: name });
      if (element.local !== "Relationship") return;
      if (element.uri !== PACKAGE_REL_NAMESPACE || ancestors.at(-1)?.local !== "Relationships") fail("RELATIONSHIP_INVALID", "工作簿关系元素位置或命名空间有误。", { entry: name });
      const id = xmlAttribute(element, "Id"), target = xmlAttribute(element, "Target"), type = xmlAttribute(element, "Type"), mode = xmlAttribute(element, "TargetMode");
      if (!id || !target || !type || ids.has(id) || (mode !== null && mode !== "Internal" && mode !== "External")) fail("RELATIONSHIP_INVALID", "关系 ID 重复或配置不完整。", { entry: name }); ids.add(id);
      const external = mode === "External"; if (external) externalCount++;
      if (name === "xl/_rels/workbook.xml.rels") relationships.set(id, { target, type, external });
    } }); validated.add(name);
  }
  if (externalCount) issues.push({ code: "EXTERNAL_LINKS_IGNORED", message: "外部链接保留为文件元信息，不访问外部资源。", count: externalCount });
  const directory: SheetDirectoryEntry[] = [], names = new Set<string>(), sheetIds = new Set<string>(), relIds = new Set<string>(), targets = new Set<string>(); let workbookNamespace = "";
  scanXml(xml.get("xl/workbook.xml") ?? "", "xl/workbook.xml", { open(element, ancestors) {
    if (!ancestors.length) { if (element.local !== "workbook" || !SPREADSHEET_NAMESPACES.has(element.uri)) fail("WORKBOOK_INVALID", "工作簿目录不合法。"); workbookNamespace = element.uri; }
    if (element.local !== "sheet") return;
    if (element.uri !== workbookNamespace || (ancestors.at(-1)?.local !== "sheets" || ancestors.at(-1)?.uri !== workbookNamespace)) fail("WORKBOOK_INVALID", "工作表目录位置或命名空间有误。");
    const name = xmlAttribute(element, "name"), sheetId = xmlAttribute(element, "sheetId"), id = relationshipId(element), relationship = id ? relationships.get(id) : undefined;
    if (!name || name.length > 31 || /[\\/?*\[\]:\u0000-\u001f]/u.test(name) || !sheetId || !/^[1-9][0-9]{0,9}$/u.test(sheetId) || Number(sheetId) > 4294967295 || !id || !relationship || relationship.external || !Array.from(DOCUMENT_REL_NAMESPACES).some(uri => relationship.type === uri + "/worksheet")) fail("WORKBOOK_DIRECTORY_INVALID", "工作表名称、编号或关系配置不合法。");
    const part = resolvePartTarget(relationship.target), nameKey = name.toLowerCase();
    if (names.has(nameKey) || sheetIds.has(sheetId) || relIds.has(id) || targets.has(part)) fail("WORKBOOK_DIRECTORY_DUPLICATE", "工作簿包含重复的工作表名称、编号或目标。");
    if (!xml.has(part)) fail("RELATIONSHIP_INVALID", "工作表关系或内容缺失。");
    names.add(nameKey); sheetIds.add(sheetId); relIds.add(id); targets.add(part); directory.push({ name, sheetId, relationshipId: id, part });
  } }); validated.add("xl/workbook.xml");
  const formulaCaches = new Map<string, Map<string, FormulaCache>>(), rawSheets: Array<Map<string, RawCell>> = []; let parsedCells = 0;
  for (let index = 0; index < directory.length; index++) {
    const part = directory[index].part, scanned = scanWorksheet(xml.get(part)!, part, index, () => { if (++parsedCells > XLSX_LIMITS.parsedCells) fail("PARSED_CELL_LIMIT", "工作簿实际单元格数量超过读取预算。"); });
    formulaCaches.set("sheet-" + index, scanned.caches); rawSheets.push(scanned.cells); validated.add(part);
  }
  for (const [name, text] of xml) if (!validated.has(name)) scanXml(text, name);
  onProgress?.("parse"); let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(bytes, { type: "array", dense: false, cellFormula: true, cellHTML: false, cellNF: true, cellText: true, cellDates: false, sheetStubs: true, bookVBA: false, bookDeps: false, xlfn: true, WTF: true }); }
  catch { fail("WORKBOOK_INVALID", "工作簿内容无法解析，请在 Excel 中另存为 .xlsx 后重试。"); }
  if (workbook.SheetNames.length !== directory.length) fail("RELATIONSHIP_INVALID", "工作表目录与实际内容不一致。");
  for (let index = 0; index < directory.length; index++) {
    const expected = directory[index], name = workbook.SheetNames[index];
    if (name !== expected.name || !Object.prototype.hasOwnProperty.call(workbook.Sheets, name) || workbook.Workbook?.Sheets?.[index]?.name !== expected.name) fail("WORKBOOK_DIRECTORY_MISMATCH", "工作表目录与解析结果不一致。", { sheetId: "sheet-" + index });
    for (const cell of rawSheets[index].values()) {
      const parsed = workbook.Sheets[name][cell.ref] as XLSX.CellObject | undefined;
      const value = cell.value.trim();
      if (cell.type === "n" && value !== "" && (typeof parsed?.v !== "number" || !Object.is(parsed.v, Number(value)))) fail("CELL_VALUE_MISMATCH", "原始数值与解析结果不一致。", { sheetId: "sheet-" + index, cellRef: cell.ref });
      if (cell.type === "b" && value !== "" && (typeof parsed?.v !== "boolean" || parsed.v !== (value === "1" || value === "true"))) fail("CELL_VALUE_MISMATCH", "原始布尔值与解析结果不一致。", { sheetId: "sheet-" + index, cellRef: cell.ref });
      // Source numeric cells with no numeric content are explicit blanks. Formula blanks remain unknown in the cache map.
      if (cell.type === "n" && value === "" && !cell.hasFormula && parsed) { parsed.t = "z"; delete parsed.v; }
      if (cell.hasValue && (cell.value.trim() !== "" || cell.type === "str") && (parsed?.v === undefined || parsed.t === "z")) fail("CELL_VALUE_MISMATCH", "原始单元格值未能正确解析。", { sheetId: "sheet-" + index, cellRef: cell.ref });
    }
  }
  onProgress?.("inspect"); return new SpreadsheetSession(workbook, formulaCaches, issues);
}
