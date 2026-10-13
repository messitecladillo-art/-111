import sax, { type QualifiedAttribute, type QualifiedTag } from "sax";

export const PREFLIGHT_LIMITS = Object.freeze({ input: 20 * 1024 * 1024, entries: 2000, total: 64 * 1024 * 1024, entry: 8 * 1024 * 1024, findings: 500, xmlNodes: 300_000, xmlDepth: 128, terms: 128 });
export type PreflightFinding = { level: "error" | "warning"; code: string; message: string; location: string; field?: string };
export type PreflightCoverage = { id: string; label: string; status: "checked" | "manual" | "not_checked"; detail: string };
export type PreflightReport = { schema: "submission-preflight/v1"; name: string; format: "docx" | "pptx" | "pdf"; bytes: number; sha256: string; scope: "local-initial" | "server-deep"; status: "issues_found" | "no_issues_in_checked_scope" | "incomplete"; findings: PreflightFinding[]; coverage: PreflightCoverage[]; termsHash: string; cleanup?: { completed: true; reason: "temporary-upload" } };
export type PreflightWorkerRequest = { id: string; buffer: ArrayBuffer; name: string; terms: string[] };
export type PreflightWorkerResponse = { id: string; phase: string } | { id: string; result: PreflightReport } | { id: string; error: string };

const normalized = (value: string) => value.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
export function normalizeIdentityTerms(input: string[]): string[] {
  if (!Array.isArray(input) || input.some(value => typeof value !== "string")) throw new Error("身份词必须是文字列表。");
  const terms = [...new Set(input.map(normalized).filter(Boolean))];
  if (terms.length > PREFLIGHT_LIMITS.terms || terms.some(term => term.length > 64) || new TextEncoder().encode(JSON.stringify(terms)).length > 4096) throw new Error("身份词最多 128 项，每项最多 64 个 UTF-16 单元，合计 JSON 文字最多 4 KiB。");
  return terms;
}
class InspectionError extends Error {
  readonly code: string;
  readonly location: string;
  constructor(code: string, message: string, location = "package") { super(message); this.code = code; this.location = location; }
}
function fail(code: string, message: string, location?: string): never { throw new InspectionError(code, message, location); }
async function hash(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const value = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))].map(n => n.toString(16).padStart(2, "0")).join("");
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function utf8(bytes: Uint8Array, location: string): string { try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return fail("encoding_invalid", "文字编码损坏，请重新导出文件。", location); } }
type Entry = { name: string; rawName: Uint8Array; flags: number; method: number; version: number; crc: number; packed: number; size: number; offset: number; start: number; directory: boolean; time: number; date: number };
function safePath(name: string, directory = false): string {
  const path = directory && name.endsWith("/") ? name.slice(0, -1) : name;
  if (!path || path.length > 2048 || /[\\:%?#\u0000-\u001f\u007f]/u.test(normalized(path)) || normalized(path).startsWith("/") || normalized(path).split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p))) fail("zip_path_invalid", "文件包含不安全或歧义路径，请从原软件重新导出。", "package");
  return normalized(path);
}
function zipExtra(bytes: Uint8Array, start: number, size: number, rawName: Uint8Array, name: string): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = start + size, seen = new Set<number>();
  while (start < end) {
    if (start + 4 > end) fail("zip_invalid", "ZIP 扩展记录截断。", name);
    const tag = view.getUint16(start, true), len = view.getUint16(start + 2, true); start += 4;
    if (start + len > end || seen.has(tag)) fail("zip_invalid", "ZIP 扩展记录越界或重复。", name);
    seen.add(tag);
    if ([1, 0x17, 0x9901].includes(tag)) fail("zip_unsupported", "暂不支持 ZIP64 或加密文件，请重新导出普通 DOCX/PPTX。", name);
    if (tag === 0x7075 && (len < 5 || bytes[start] !== 1 || view.getUint32(start + 1, true) !== crc32(rawName) || utf8(bytes.subarray(start + 5, start + len), name) !== name)) fail("zip_path_invalid", "ZIP 路径扩展与目录不一致。", name);
    start += len;
  }
}
/** Validate all central/local records before any decompression. No extraction or filesystem writes. */
function inspectZip(bytes: Uint8Array): { entries: Entry[]; comment: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) fail("zip_invalid", "文件不是完整的 Office ZIP 包，或带有额外前缀。");
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
  if (end < 0) fail("zip_invalid", "ZIP 结束目录缺失、截断或有尾随内容。");
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || size === 0xffffffff || start === 0xffffffff) fail("zip_unsupported", "暂不支持分卷或 ZIP64 文件。");
  if (!count || count > PREFLIGHT_LIMITS.entries) fail("zip_entry_limit", "包内条目超过 2,000 项或为空。");
  if (start < 30 || start + size !== end) fail("zip_invalid", "ZIP 中央目录边界不一致。");
  const entries: Entry[] = [], names = new Set<string>(); let at = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) fail("zip_invalid", "ZIP 中央目录条目截断。");
    const version = view.getUint16(at + 6, true), flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true), packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nl = view.getUint16(at + 28, true), el = view.getUint16(at + 30, true), cl = view.getUint16(at + 32, true), offset = view.getUint32(at + 42, true), next = at + 46 + nl + el + cl;
    if (!nl || next > end || [packed, size, offset].includes(0xffffffff)) fail("zip_invalid", "ZIP 条目尺寸或路径越界。");
    if (view.getUint16(at + 34, true) || version < 10 || version > 20 || flags & ~0x080e || (method !== 8 && flags & 6) || ![0, 8].includes(method)) fail("zip_unsupported", "ZIP 包含加密、特殊标志或不支持的压缩方式。");
    const rawName = bytes.subarray(at + 46, at + 46 + nl);
    if (!(flags & 0x800) && rawName.some(byte => byte > 127)) fail("encoding_invalid", "ZIP 中文路径未声明 UTF-8 编码。");
    const name = utf8(rawName, "package"), directory = name.endsWith("/"), key = safePath(name, directory);
    if (names.has(key)) fail("zip_member_collision", "ZIP 存在重复、大小写或 Unicode 规范化冲突的路径。", name);
    names.add(key);
    const attrs = view.getUint32(at + 38, true), mode = (attrs >>> 16) & 0xf000;
    if ((mode && mode !== (directory ? 0x4000 : 0x8000)) || ((attrs & 16) && !directory)) fail("zip_path_invalid", "ZIP 存在链接或特殊条目。", name);
    total += size;
    if (size > PREFLIGHT_LIMITS.entry || total > PREFLIGHT_LIMITS.total) fail("zip_expansion_limit", "解压声明超过单项 8 MiB 或合计 64 MiB。", name);
    if ((directory && (size || packed || method !== 0)) || (method === 0 && size !== packed)) fail("zip_invalid", "ZIP 目录或未压缩条目的长度不一致。", name);
    zipExtra(bytes, at + 46 + nl, el, rawName, name);
    entries.push({ name, rawName, directory, flags, method, version, crc, packed, size, offset, start: 0, time: view.getUint16(at + 12, true), date: view.getUint16(at + 14, true) }); at = next;
  }
  if (at !== end) fail("zip_invalid", "ZIP 条目数量和目录长度不一致。");
  const ordered = [...entries].sort((a, b) => a.offset - b.offset);
  if (ordered[0].offset !== 0) fail("zip_invalid", "ZIP 含未声明的前缀内容。");
  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i], p = entry.offset, next = ordered[i + 1]?.offset ?? start;
    if (p + 30 > next || next > start || view.getUint32(p, true) !== 0x04034b50) fail("zip_invalid", "ZIP 本地条目重叠或缺失。", entry.name);
    const nl = view.getUint16(p + 26, true), el = view.getUint16(p + 28, true); entry.start = p + 30 + nl + el;
    if (entry.start > next || nl !== entry.rawName.length || !bytes.subarray(p + 30, p + 30 + nl).every((b, k) => b === entry.rawName[k]) || view.getUint16(p + 4, true) !== entry.version || view.getUint16(p + 6, true) !== entry.flags || view.getUint16(p + 8, true) !== entry.method || view.getUint16(p + 10, true) !== entry.time || view.getUint16(p + 12, true) !== entry.date) fail("zip_invalid", "ZIP 本地记录与中央目录不一致。", entry.name);
    zipExtra(bytes, p + 30 + nl, el, entry.rawName, entry.name);
    const declared = [entry.crc, entry.packed, entry.size];
    if (declared.some((v, k) => { const value = view.getUint32(p + 14 + k * 4, true); return entry.flags & 8 ? value !== 0 && value !== v : value !== v; })) fail("zip_invalid", "ZIP 本地 CRC 或长度不一致。", entry.name);
    const dataEnd = entry.start + entry.packed, tail = next - dataEnd;
    if (tail < 0) fail("zip_invalid", "ZIP 压缩内容覆盖其他条目。", entry.name);
    if (entry.flags & 8) {
      if (![12, 16].includes(tail) || (tail === 16 && view.getUint32(dataEnd, true) !== 0x08074b50)) fail("zip_invalid", "ZIP 数据描述符无效。", entry.name);
      const d = dataEnd + (tail === 16 ? 4 : 0);
      if (declared.some((v, k) => view.getUint32(d + k * 4, true) !== v)) fail("zip_invalid", "ZIP 数据描述符校验失败。", entry.name);
    } else if (tail !== 0) fail("zip_invalid", "ZIP 条目间有未声明的内容。", entry.name);
  }
  return { entries, comment: utf8(bytes.subarray(end + 22), "zip_archive_comment") };
}
async function inflate(bytes: Uint8Array, entry: Entry): Promise<Uint8Array> {
  const packed = bytes.subarray(entry.start, entry.start + entry.packed);
  if (entry.method === 0) { if (crc32(packed) !== entry.crc) fail("zip_integrity", "包内条目 CRC 校验失败。", entry.name); return packed; }
  let stream: ReadableStream<Uint8Array>;
  try { stream = new Blob([new Uint8Array(packed)]).stream().pipeThrough(new DecompressionStream("deflate-raw")); }
  catch { return fail("decompression_unavailable", "当前浏览器不支持有界 Office 解压，请更新桌面浏览器。", entry.name); }
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      total += result.value.length;
      if (total > entry.size || total > PREFLIGHT_LIMITS.entry) { await reader.cancel(); fail("zip_expansion_limit", "实际解压长度超过目录声明或 8 MiB 上限。", entry.name); }
      chunks.push(result.value);
    }
  } catch (error) { if (error instanceof InspectionError) throw error; return fail("zip_integrity", "压缩内容损坏、截断或带有额外数据。", entry.name); }
  finally { reader.releaseLock(); }
  if (total !== entry.size) fail("zip_integrity", "条目实际解压长度与目录不一致。", entry.name);
  const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  if (crc32(output) !== entry.crc) fail("zip_integrity", "条目 CRC 校验失败。", entry.name);
  return output;
}

const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELS = new Set(["http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"]);
const WORD_NS = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const PPT_NS = new Set(["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"]);
const CORES = { docx: { path: "word/document.xml", root: "document", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", ns: WORD_NS }, pptx: { path: "ppt/presentation.xml", root: "presentation", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml", ns: PPT_NS } };
type XmlPart = { root: { local: string; uri: string }; text: string; attrs: { field: string; value: string; node: number }[]; tags: { local: string; uri: string; attrs: Record<string, string>; node: number; depth: number }[]; metadata: { field: string; value: string; node: number }[] };
type XmlBudget = { nodes: number; attrs: number };
function decodeXml(bytes: Uint8Array, part: string): string {
  let encoding = "utf-8";
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 60 && bytes[1] === 0)) encoding = "utf-16le";
  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 60)) encoding = "utf-16be";
  let text: string; try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { return fail("xml_invalid", "XML 文字编码无效。", part); }
  const declaration = text.match(/^<\?xml\s+version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])([A-Za-z][A-Za-z0-9._-]*)\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\4)?\s*\?>/), declared = declaration?.[3].toLowerCase();
  if (text.startsWith("<?xml") && !declaration) fail("xml_invalid", "XML 声明、版本或属性顺序无效。", part);
  if (declared && declared !== encoding && !(declared === "utf-16" && encoding.startsWith("utf-16"))) fail("xml_invalid", "XML 声明与实际编码不一致。", part);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)) fail("xml_invalid", "XML 包含无效字符、DTD 或实体声明。", part);
  return declaration ? text.slice(declaration[0].length) : text;
}
function inspectXml(bytes: Uint8Array, part: string, budget: XmlBudget): XmlPart {
  const text = decodeXml(bytes, part), saxOptions = { xmlns: true, trim: false, normalize: false, strictEntities: true }, parser = sax.parser(true, saxOptions);
  const result: XmlPart = { root: { local: "", uri: "" }, text: "", attrs: [], tags: [], metadata: [] };
  const stack: { local: string; uri: string; value: string; node: number }[] = []; let roots = 0, count = 0;
  let seenNames = new Set<string>(), seenExpanded = new Set<string>();
  parser.onerror = () => fail("xml_invalid", "XML 结构损坏或含不支持的实体。", part);
  parser.ondoctype = () => fail("xml_invalid", "不读取 DTD 或外部实体，请重新导出文件。", part);
  parser.onprocessinginstruction = () => fail("xml_invalid", "XML 含不支持或位置错误的处理指令。", part);
  parser.onopentagstart = () => { seenNames = new Set(); seenExpanded = new Set(); };
  parser.onattribute = raw => {
    const attr = raw as QualifiedAttribute;
    const key = `${attr.uri}|${attr.local}`;
    if (seenNames.has(attr.name) || seenExpanded.has(key)) fail("xml_invalid", "XML 标签含重复属性。", part);
    seenNames.add(attr.name); seenExpanded.add(key);
    if (++budget.attrs > PREFLIGHT_LIMITS.xmlNodes || seenNames.size > 128) fail("xml_limit", "XML 属性数量超过检查预算。", part);
  };
  parser.onopentag = raw => {
    const tag = raw as QualifiedTag;
    count++;
    if (++budget.nodes > PREFLIGHT_LIMITS.xmlNodes || stack.length >= PREFLIGHT_LIMITS.xmlDepth || Object.keys(tag.attributes).length > 128) fail("xml_limit", "XML 节点、属性或嵌套层级超过检查预算。", part);
    if (!stack.length) { if (++roots !== 1) fail("xml_invalid", "XML 必须恰有一个根节点。", part); result.root = { local: tag.local, uri: tag.uri }; }
    const attrs: Record<string, string> = Object.create(null); const seen = new Set<string>();
    for (const attr of Object.values(tag.attributes)) {
      if (attr.uri === "http://www.w3.org/2000/xmlns/") continue;
      const key = `${attr.uri}|${attr.local}`;
      if (seen.has(key)) fail("xml_invalid", "XML 属性在命名空间展开后重复。", part);
      seen.add(key); attrs[attr.local] = attr.value; result.attrs.push({ field: attr.name, value: attr.value, node: count });
    }
    result.tags.push({ local: tag.local, uri: tag.uri, attrs, node: count, depth: stack.length }); stack.push({ local: tag.local, uri: tag.uri, value: "", node: count });
  };
  const onText = (value: string) => { if (!stack.length && value.trim()) fail("xml_invalid", "XML 根节点外有额外文字。", part); result.text += value; const node = stack.at(-1); if (node) node.value += value; };
  parser.ontext = onText; parser.oncdata = onText;
  parser.onclosetag = () => { const node = stack.pop(); if (node && /^docprops\/(?:core|app|custom)\.xml$/i.test(part) && node.value.trim()) result.metadata.push({ field: node.local, value: node.value, node: node.node }); };
  try { parser.write(text).close(); } catch (error) { if (error instanceof InspectionError) throw error; fail("xml_invalid", "XML 结构损坏，请重新导出文件。", part); }
  if (roots !== 1 || stack.length) fail("xml_invalid", "XML 根节点缺失或未闭合。", part);
  return result;
}
function relationshipTarget(source: string, target: string): string {
  if (!target || /[\\:%?#\u0000-\u001f]/u.test(target)) fail("relationship_invalid", "内部关系路径含协议、转义或不安全字符。", source);
  const parts = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const bit of target.replace(/^\//, "").split("/")) { if (bit === "..") { if (!parts.length) fail("relationship_invalid", "内部关系路径越过包根目录。", source); parts.pop(); } else if (bit !== ".") { if (!bit) fail("relationship_invalid", "内部关系包含空路径段。", source); parts.push(bit); } }
  const path = parts.join("/"); safePath(path); return path;
}
const active = (value: string) => /macroenabled|vbaproject|vbadata|activex|(?:^|\/)customui(?:\/|$)|\/(?:oleobject|package|attachedtemplate|afchunk|webextension|control|connection|querytable|dataconnection|externallink)(?:$|\/)/i.test(value);
const review = (local: string) => ["ins", "del", "moveFrom", "moveTo", "moveFromRangeStart", "moveFromRangeEnd", "moveToRangeStart", "moveToRangeEnd", "cellIns", "cellDel", "cellMerge"].includes(local) || local.endsWith("Change") || /^customXml(?:Ins|Del|MoveFrom|MoveTo)Range(?:Start|End)$/.test(local);
function coverage(format: PreflightReport["format"], hasTerms: boolean): PreflightCoverage[] {
  const office = format !== "pdf", status = "not_checked" as const;
  return [
    { id: "package_structure", label: "文件包结构与资源限制", status, detail: office ? "校验 ZIP 目录、解压预算及主文档类型。" : "PDF 对象结构需选择完整检查。" },
    { id: "metadata", label: "作者与自定义属性", status, detail: "检查作者、最后修改人、机构与自定义属性。" },
    { id: "identity_terms", label: "身份词与隐藏文字", status: hasTerms ? status : "manual", detail: hasTerms ? "按提供的身份词检查文件名、部件名、XML 文字与属性。" : "填写学校、成员、教师等身份词后检查。" },
    { id: "comments_revisions", label: "批注与修订", status, detail: "检查批注相关部件及 Word 修订标记。" },
    { id: "slides_notes", label: "隐藏页与演讲者备注", status: format === "docx" ? "checked" : status, detail: format === "docx" ? "DOCX 不含 PPT 幻灯片或演讲者备注。" : "检查隐藏幻灯片及非空备注。" },
    { id: "thumbnails", label: "包内缩略图", status, detail: "检查可能保留旧封面的缩略图。" },
    { id: "external_active", label: "外部关系与主动内容", status, detail: "识别外链、宏、控件及外部模板，不执行内容。" },
    { id: "embedded_objects", label: "嵌入文件", status, detail: "列出嵌入对象，内部内容需完整检查或人工核对。" },
    { id: "image_metadata", label: "图片 EXIF/XMP/IPTC", status: "not_checked", detail: "本地初检不解析图片元数据；可选择完整检查。" },
    { id: "images_ocr", label: "图片文字与画面身份", status: "manual", detail: "逐页查看图片、截图、徽标及图片中的学校姓名。" },
    { id: "layout_rules", label: "当届格式与匿名要求", status: "manual", detail: "按适用届次、组别、赛区和阶段核对页数、排版及匿名要求。" },
  ];
}

/** Initial local inspection only. It neither uploads nor edits files or competition Gate state. */
export async function inspectSubmissionLocal(buffer: ArrayBuffer, name: string, terms: string[], onPhase?: (phase: string) => void): Promise<PreflightReport> {
  if (!(buffer instanceof ArrayBuffer) || typeof name !== "string") throw new Error("请选择文件后再检查。");
  const format = name.toLowerCase().match(/\.(docx|pptx|pdf)$/)?.[1] as PreflightReport["format"] | undefined;
  if (!format) throw new Error("支持 DOCX、PPTX 和 PDF 文件。");
  if (buffer.byteLength > PREFLIGHT_LIMITS.input) throw new Error("文件超过 20 MiB，请拆分或压缩后重试。");
  const identities = normalizeIdentityTerms(terms); onPhase?.("fingerprint");
  const report: PreflightReport = { schema: "submission-preflight/v1", name, format, bytes: buffer.byteLength, sha256: await hash(buffer), scope: "local-initial", status: "incomplete", findings: [], coverage: coverage(format, identities.length > 0), termsHash: await hash(new TextEncoder().encode(JSON.stringify(identities))) };
  const keys = new Set<string>(); let capped = false;
  const add = (finding: PreflightFinding) => {
    const key = `${finding.code}|${finding.location}|${finding.field ?? ""}`; if (keys.has(key)) return;
    if (report.findings.length >= PREFLIGHT_LIMITS.findings) { capped = true; return; }
    keys.add(key); report.findings.push(finding);
  };
  const scan = (value: string, location: string, field?: string) => {
    const norm = normalized(value), compact = norm.replace(/\s/gu, "");
    identities.forEach((term, index) => { if (norm.includes(term) || compact.includes(term.replace(/\s/gu, ""))) add({ level: "error", code: "forbidden_identity_term", message: `发现第 ${index + 1} 项身份词，请在原文件中清除并重新检查。`, location, field: field ? `${field};term:${index + 1}` : `term:${index + 1}` }); });
  };
  scan(name, "filename");
  if (format === "pdf") { onPhase?.("complete"); return report; }
  try {
    onPhase?.("package"); const bytes = new Uint8Array(buffer), { entries, comment } = inspectZip(bytes), files = new Map(entries.filter(entry => !entry.directory).map(entry => [entry.name, entry]));
    scan(comment, "zip_archive_comment"); entries.forEach(entry => scan(entry.name, "archive_member_names", entry.name));
    if (!files.has("[Content_Types].xml") || !files.has("_rels/.rels") || !files.has(CORES[format].path)) fail("office_type_mismatch", "缺少 Office 主文档或关系记录，请按正确格式重新导出。");
    onPhase?.("xml"); const parts = new Map<string, XmlPart>(), budget: XmlBudget = { nodes: 0, attrs: 0 };
    const types = inspectXml(await inflate(bytes, files.get("[Content_Types].xml")!), "[Content_Types].xml", budget);
    parts.set("[Content_Types].xml", types);
    if (types.root.local !== "Types" || types.root.uri !== CT_NS || types.tags.slice(1).some(tag => tag.depth !== 1 || tag.uri !== CT_NS || !["Default", "Override"].includes(tag.local))) fail("office_type_mismatch", "Office 内容类型记录无效。", "[Content_Types].xml");
    const defaults = new Map<string, string>(), overrides = new Map<string, string>();
    for (const tag of types.tags.slice(1)) {
      const key = tag.local === "Default" ? tag.attrs.Extension?.toLowerCase() : tag.attrs.PartName?.slice(1), value = tag.attrs.ContentType;
      const map = tag.local === "Default" ? defaults : overrides;
      if (!key || !value || map.has(key) || (tag.local === "Override" && !tag.attrs.PartName?.startsWith("/"))) fail("office_type_mismatch", "Office 内容类型声明缺失或重复。", "[Content_Types].xml");
      map.set(key, value);
    }
    const contentType = (name: string) => overrides.get(name) ?? defaults.get(name.split(".").at(-1)?.toLowerCase() ?? "") ?? "";
    for (const entry of entries) {
      if (entry.directory || entry.name === "[Content_Types].xml") continue;
      const type = contentType(entry.name), bytesPart = await inflate(bytes, entry);
      if (/\.(?:xml|rels|svg|vml)$/i.test(entry.name) || /(?:\+xml|\/xml)$/.test(type)) parts.set(entry.name, inspectXml(bytesPart, entry.name, budget));
    }
    const rootRels = parts.get("_rels/.rels")!, offices = rootRels.tags.filter(tag => tag.local === "Relationship" && OFFICE_RELS.has(tag.attrs.Type));
    if (rootRels.root.local !== "Relationships" || rootRels.root.uri !== REL_NS || offices.length !== 1 || offices[0].attrs.TargetMode === "External" || relationshipTarget("", offices[0].attrs.Target) !== CORES[format].path || overrides.get(CORES[format].path) !== CORES[format].type || files.has(CORES[format === "docx" ? "pptx" : "docx"].path) || files.has("xl/workbook.xml")) fail("office_type_mismatch", "文件内容与 DOCX/PPTX 扩展名不一致，不能仅修改文件后缀。", "_rels/.rels");
    const main = parts.get(CORES[format].path)!;
    if (main.root.local !== CORES[format].root || !CORES[format].ns.has(main.root.uri) || (format === "docx" && !main.tags.some(tag => tag.depth === 1 && tag.local === "body" && WORD_NS.has(tag.uri)))) fail("office_type_mismatch", "主文档 XML 的根节点或正文结构不正确。", CORES[format].path);
    onPhase?.("inspect");
    for (const entry of entries) {
      if (entry.directory) continue;
      const lower = entry.name.toLowerCase(), part = parts.get(entry.name);
      if (/^docprops\/thumbnail\./i.test(lower)) add({ level: "warning", code: "package_thumbnail_present", message: "保留了包内缩略图，请确认旧封面或身份信息未残留。", location: entry.name });
      if (/comment.*\.xml$/i.test(lower)) add({ level: "warning", code: "comments_present", message: "发现批注相关部件，请删除批注后重新保存。", location: entry.name });
      if (/^(?:word|ppt)\/embeddings\//i.test(lower)) add({ level: "warning", code: "embedded_files_present", message: "发现嵌入文件，请核对其内容、元数据及保留必要性。", location: entry.name });
      if (/^customxml\/.*\.(?:xml|rels)$/i.test(lower)) add({ level: "warning", code: "custom_xml_parts_present", message: "发现自定义 XML 数据，请核对隐藏内容或从原软件清除。", location: entry.name });
      if (active(lower) || active(contentType(entry.name))) add({ level: "error", code: "active_content_present", message: "发现宏、控件或主动内容，请移除并导出普通 Office 文件。", location: entry.name });
      if (!part) continue;
      scan(part.text, entry.name, "text"); part.attrs.forEach(attr => scan(attr.value, `${entry.name}#element:${attr.node}`, attr.field));
      if (/^docprops\/(?:core|app|custom)\.xml$/i.test(lower)) for (const meta of part.metadata) if (/creator|lastmodifiedby|title|subject|keywords|category|company|manager/i.test(meta.field) || lower === "docprops/custom.xml") add({ level: "warning", code: "identity_metadata", message: "此属性未清空，可能保留作者或机构信息，请在文档属性中核对并清除。", location: `${entry.name}#element:${meta.node}`, field: meta.field });
      const revisions = part.tags.filter(tag => WORD_NS.has(tag.uri) && review(tag.local));
      if (lower.startsWith("word/") && revisions.length) add({ level: "warning", code: "tracked_changes_present", message: `发现 ${revisions.length} 个修订标记，请接受或拒绝修订后重新保存。`, location: entry.name });
      if (/^ppt\/slides\/slide\d+\.xml$/i.test(lower) && part.tags[0] && ["0", "false", "off", "no"].includes(normalized(part.tags[0].attrs.show ?? ""))) add({ level: "warning", code: "hidden_slides_present", message: "此幻灯片被隐藏，请删除或确认提交需要。", location: entry.name });
      if (/^ppt\/notesslides\/notesslide\d+\.xml$/i.test(lower) && part.text.trim()) add({ level: "warning", code: "speaker_notes_present", message: "此页含非空演讲者备注，请核对身份与内容后清除。", location: entry.name });
      if (lower.endsWith(".rels") || contentType(entry.name) === "application/vnd.openxmlformats-package.relationships+xml") {
        if (part.root.local !== "Relationships" || part.root.uri !== REL_NS || part.tags.slice(1).some(tag => tag.depth !== 1 || tag.local !== "Relationship" || tag.uri !== REL_NS)) fail("relationship_invalid", "Office 关系记录结构无效。", entry.name);
        const seen = new Set<string>();
        for (const tag of part.tags.slice(1)) {
          const { Id, Type, Target, TargetMode } = tag.attrs;
          if (!Id || !Type || !Target || seen.has(Id) || (TargetMode && !["Internal", "External"].includes(TargetMode))) fail("relationship_invalid", "Office 关系 ID、目标或类型缺失或重复。", entry.name);
          seen.add(Id); const location = `${entry.name}#${Id}`;
          if (active(Type)) add({ level: "error", code: "active_content_present", message: "关系记录指向嵌入程序、控件或外部模板，请移除。", location });
          if (TargetMode === "External") {
            const web = /^https?:\/\//i.test(Target) && /\/hyperlink$/i.test(Type);
            add({ level: web ? "warning" : "error", code: web ? "external_web_relationships_present" : "external_local_or_identity_relationships", message: web ? "发现网页外链，请核对来源及公开范围。" : "发现文件、邮件或主动外部关系，请移除并核对身份残留。", location });
          } else {
            const match = entry.name === "_rels/.rels" ? null : /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(entry.name);
            if (entry.name !== "_rels/.rels" && !match) fail("relationship_invalid", "关系部件路径无效。", entry.name);
            const source = match ? `${match[1] ?? ""}${match[2]}` : "";
            if ((source && !files.has(source)) || !files.has(relationshipTarget(source, Target))) fail("relationship_invalid", "关系引用的来源或目标部件不存在。", location);
          }
        }
      }
    }
    const checked = new Set(["package_structure", "metadata", "comments_revisions", "slides_notes", "thumbnails", "external_active", "embedded_objects", ...(identities.length ? ["identity_terms"] : [])]);
    report.coverage.forEach(item => { if (checked.has(item.id)) item.status = "checked"; });
    report.status = report.findings.length ? "issues_found" : "no_issues_in_checked_scope";
  } catch (error) {
    const issue = error instanceof InspectionError ? error : new InspectionError("inspection_failed", "检查未完成，请重新导出文件或选择完整检查。");
    add({ level: "error", code: issue.code, message: issue.message, location: issue.location }); report.status = "incomplete";
  }
  if (capped) { report.status = "incomplete"; report.coverage.push({ id: "finding_limit", label: "问题列表上限", status: "not_checked", detail: "问题超过 500 项；先修复已列问题，再检查剩余部分。" }); }
  onPhase?.("complete"); return report;
}
