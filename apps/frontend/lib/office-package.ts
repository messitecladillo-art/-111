/** Node/server-only structural screening, NOT antivirus or complete Office compatibility.
 * Does not modify, write, execute or fetch package content. Store the original bytes separately.
 * Supported profile: single-disk non-ZIP64 ZIP, STORE/DEFLATE, UTF-8/ASCII names,
 * well-formed XML without DTD/extra processing instructions, DOCX/PPTX and embedded XLSX.
 */
import { inflateRawSync } from "node:zlib";

export const OFFICE_PACKAGE_LIMITS = Object.freeze({ compressed: 20 * 1024 * 1024, total: 128 * 1024 * 1024, entry: 32 * 1024 * 1024, entries: 4096, controlXml: 2 * 1024 * 1024 });
type Kind = "docx" | "pptx" | "xlsx";
type Budget = { declared: number; entries: number };
type Entry = { name: string; rawName: Buffer; flags: number; method: number; version: number; time: number; date: number; crc: number; compressed: number; size: number; offset: number; dataStart: number; directory: boolean };
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = new Set(["http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"]);
const CORES = {
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", root: "document", path: "word/document.xml", namespaces: ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"] },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml", root: "presentation", path: "ppt/presentation.xml", namespaces: ["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"] },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", root: "workbook", path: "xl/workbook.xml", namespaces: ["http://schemas.openxmlformats.org/spreadsheetml/2006/main", "http://purl.oclc.org/ooxml/spreadsheetml/main"] },
} as const;
function bad(message: string): never { throw new Error(`Office 文件结构检查未通过：${message}`); }
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function utf8(bytes: Uint8Array, label: string): string { try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return bad(`${label}不是有效 UTF-8。`); } }
function partPath(name: string, directory = false): string {
  if (!name || name.length > 2048 || name.normalize("NFC") !== name || /[\\:%?#\u0000-\u0020\u007f]/u.test(name) || name.startsWith("/")) bad("包含不支持或不安全的部件路径。路径不能绝对定位、含转义或空白字符。");
  const body = directory && name.endsWith("/") ? name.slice(0, -1) : name;
  if (!body || body.split("/").some(s => !s || s === "." || s === ".." || s.endsWith("."))) bad("部件路径含空段、上级目录或歧义名称。");
  return body.toLowerCase();
}
function extraFields(extra: Buffer, rawName: Buffer, name: string) {
  const seen = new Set<number>();
  for (let p = 0; p < extra.length;) {
    if (p + 4 > extra.length) bad("ZIP 扩展字段不完整。");
    const id = extra.readUInt16LE(p), size = extra.readUInt16LE(p + 2); p += 4;
    if (p + size > extra.length || seen.has(id)) bad("ZIP 扩展字段越界或重复。");
    seen.add(id);
    if ([0x0001, 0x0017, 0x9901].includes(id)) bad("暂不支持 ZIP64 或加密扩展。");
    if (id === 0x7075 && (size < 5 || extra[p] !== 1 || extra.readUInt32LE(p + 1) !== crc32(rawName) || utf8(extra.subarray(p + 5, p + size), "扩展路径") !== name)) bad("ZIP Unicode 路径扩展与原始路径不一致。");
    p += size;
  }
}
function zipEntries(bytes: Uint8Array, budget: Budget): { data: Buffer; entries: Entry[] } {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > OFFICE_PACKAGE_LIMITS.compressed) bad("压缩文件不得超过 20 MiB。");
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.length < 22) bad("文件过短，不是完整的 ZIP/OOXML 包。");
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
    if (data.readUInt32LE(p) === 0x06054b50 && p + 22 + data.readUInt16LE(p + 20) === data.length) { end = p; break; }
  }
  if (end < 0) bad("ZIP 结束目录缺失、截断或存在尾随数据。");
  const count = data.readUInt16LE(end + 10), centralSize = data.readUInt32LE(end + 12), centralStart = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || data.readUInt16LE(end + 8) !== count) bad("不支持分卷 ZIP。");
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff) bad("不支持 ZIP64。");
  if (!count || count > OFFICE_PACKAGE_LIMITS.entries || budget.entries + count > OFFICE_PACKAGE_LIMITS.entries) bad("包内条目数量无效或超过 4096 项（含嵌入工作簿）。");
  if (centralStart + centralSize !== end || centralStart < 30 || end > data.length - 22) bad("ZIP 中央目录边界不一致或含额外记录。");
  budget.entries += count;
  const entries: Entry[] = [], names = new Set<string>();
  let p = centralStart;
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || data.readUInt32LE(p) !== 0x02014b50) bad("ZIP 中央目录条目缺失或截断。");
    const version = data.readUInt16LE(p + 6), flags = data.readUInt16LE(p + 8), method = data.readUInt16LE(p + 10);
    const compressed = data.readUInt32LE(p + 20), size = data.readUInt32LE(p + 24), nameSize = data.readUInt16LE(p + 28), extraSize = data.readUInt16LE(p + 30), commentSize = data.readUInt16LE(p + 32), offset = data.readUInt32LE(p + 42);
    const limit = p + 46 + nameSize + extraSize + commentSize;
    if (limit > end || !nameSize) bad("ZIP 条目名称或目录长度越界。");
    if (data.readUInt16LE(p + 34) || [compressed, size, offset].includes(0xffffffff) || version > 20 || version < 10) bad("不支持分卷、ZIP64 或此 ZIP 版本。");
    if ((flags & ~0x080e) !== 0 || (method !== 8 && (flags & 6)) || ![0, 8].includes(method)) bad("不支持加密、特殊标志或此压缩算法；仅支持 STORE/DEFLATE。");
    const rawName = data.subarray(p + 46, p + 46 + nameSize);
    if (!(flags & 0x0800) && rawName.some(b => b > 127)) bad("非 ASCII 文件名必须明确使用 UTF-8 编码。");
    const name = utf8(rawName, "ZIP 路径"), directory = name.endsWith("/"), key = partPath(name, directory);
    if (names.has(key)) bad("存在重复或大小写冲突的部件路径。");
    names.add(key);
    const attrs = data.readUInt32LE(p + 38), fileMode = (attrs >>> 16) & 0xf000;
    if (fileMode && fileMode !== (directory ? 0x4000 : 0x8000)) bad("不支持符号链接、设备或其他特殊 ZIP 条目。");
    if ((attrs & 0x10) && !directory) bad("ZIP 目录属性与名称不一致。");
    if (size > OFFICE_PACKAGE_LIMITS.entry || budget.declared + size > OFFICE_PACKAGE_LIMITS.total) bad("解压声明超过单项 32 MiB 或总计 128 MiB 上限。");
    budget.declared += size;
    if (directory && (size || compressed || method !== 0)) bad("ZIP 目录条目不能携带文件数据。");
    if (method === 0 && size !== compressed) bad("STORE 条目的压缩与原始长度不一致。");
    extraFields(data.subarray(p + 46 + nameSize, p + 46 + nameSize + extraSize), rawName, name);
    entries.push({ name, rawName, flags, method, version, time: data.readUInt16LE(p + 12), date: data.readUInt16LE(p + 14), crc: data.readUInt32LE(p + 16), compressed, size, offset, dataStart: 0, directory });
    p = limit;
  }
  if (p !== end) bad("中央目录记录数量或长度不一致。");
  const ordered = [...entries].sort((a, b) => a.offset - b.offset);
  if (ordered[0].offset !== 0) bad("不支持自解压前缀、隐藏记录或前置数据。");
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i], at = e.offset, next = ordered[i + 1]?.offset ?? centralStart;
    if (at + 30 > next || next > centralStart || data.readUInt32LE(at) !== 0x04034b50) bad("ZIP 本地条目重叠、越界或签名不一致。");
    const nameSize = data.readUInt16LE(at + 26), extraSize = data.readUInt16LE(at + 28);
    e.dataStart = at + 30 + nameSize + extraSize;
    if (e.dataStart > next || !data.subarray(at + 30, at + 30 + nameSize).equals(e.rawName)) bad("ZIP 本地与中央目录的名称不一致。");
    if (data.readUInt16LE(at + 4) !== e.version || data.readUInt16LE(at + 6) !== e.flags || data.readUInt16LE(at + 8) !== e.method || data.readUInt16LE(at + 10) !== e.time || data.readUInt16LE(at + 12) !== e.date) bad("ZIP 本地与中央目录的标志、版本或时间不一致。");
    const local = [data.readUInt32LE(at + 14), data.readUInt32LE(at + 18), data.readUInt32LE(at + 22)], declared = [e.crc, e.compressed, e.size];
    if (local.some((v, n) => (e.flags & 8) ? v !== 0 && v !== declared[n] : v !== declared[n])) bad("ZIP 本地 CRC 或长度与中央目录不一致。");
    extraFields(data.subarray(at + 30 + nameSize, e.dataStart), e.rawName, e.name);
    const dataEnd = e.dataStart + e.compressed;
    if (dataEnd > next) bad("压缩数据跨越或覆盖其他 ZIP 条目。");
    const tail = next - dataEnd;
    if (e.flags & 8) {
      if (tail !== 12 && tail !== 16) bad("ZIP 数据描述符缺失、越界或长度无效。");
      const descriptor = dataEnd + (tail === 16 ? 4 : 0);
      if (tail === 16 && data.readUInt32LE(dataEnd) !== 0x08074b50) bad("ZIP 数据描述符签名无效。");
      if (declared.some((v, n) => data.readUInt32LE(descriptor + n * 4) !== v)) bad("ZIP 数据描述符 CRC 或长度不一致。");
    } else if (tail !== 0) bad("ZIP 条目之间含重叠、间隙或未声明的尾随数据。");
  }
  return { data, entries };
}
function unpack(data: Buffer, entry: Entry, cap = OFFICE_PACKAGE_LIMITS.entry): Buffer {
  if (entry.size > cap) bad(`控制 XML 超过 ${cap / 1024 / 1024} MiB 上限。`);
  const compressed = data.subarray(entry.dataStart, entry.dataStart + entry.compressed);
  let output: Buffer;
  if (entry.method === 0) output = compressed;
  else {
    try {
      const result = inflateRawSync(compressed, { maxOutputLength: Math.max(1, Math.min(cap, entry.size + 1)), info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
      if (result.engine.bytesWritten !== entry.compressed) bad("DEFLATE 数据含尾随或未消费字节。");
      output = result.buffer;
    } catch (e) { if (e instanceof Error && e.message.startsWith("Office 文件结构")) throw e; return bad("DEFLATE 解压失败、截断或实际输出超过声明/资源上限。"); }
  }
  if (output.length !== entry.size || crc32(output) !== entry.crc) bad("条目实际长度或 CRC 校验失败。");
  return output;
}

type XmlNode = { name: string; local: string; uri: string; attrs: Map<string, string>; depth: number };
const XML_NS = "http://www.w3.org/XML/1998/namespace", XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const NCNAME = "[\\p{L}_][\\p{L}\\p{N}\\p{M}_.\\-]*", NAME = `(?:${NCNAME}:)?${NCNAME}`;
const namePattern = new RegExp(`^${NAME}$`, "u"), startPattern = new RegExp(`^(${NAME})`, "u");
const attrPattern = new RegExp(`[ \\t\\r\\n]+(${NAME})[ \\t\\r\\n]*=[ \\t\\r\\n]*(?:\"([^\"]*)\"|'([^']*)')`, "uy");
function entities(text: string): string {
  if (text.includes("<")) bad("XML 属性含未转义的小于号。");
  return text.replace(/&([^;]*);|&/g, (all, token: string | undefined) => {
    const known: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (token && Object.hasOwn(known, token)) return known[token];
    if (token && /^(?:#[0-9]+|#x[0-9a-fA-F]+)$/.test(token)) {
      const point = token[1] === "x" ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
      if ([9, 10, 13].includes(point) || (point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) && point !== 0xfffe && point !== 0xffff)) return String.fromCodePoint(point);
    }
    return bad("XML 含未定义、未闭合或无效字符实体。");
  });
}
function attributes(text: string): Map<string, string> {
  const out = new Map<string, string>(); let p = 0;
  while (p < text.length && !/^[ \t\r\n]*$/.test(text.slice(p))) {
    attrPattern.lastIndex = p; const m = attrPattern.exec(text);
    if (!m || out.has(m[1]) || out.size >= 256) bad("XML 属性语法、重复属性或属性数量无效。");
    out.set(m[1], entities(m[2] ?? m[3])); p = attrPattern.lastIndex;
  }
  return out;
}
function xmlText(bytes: Buffer): string {
  let encoding = "utf-8";
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 60 && bytes[1] === 0)) encoding = "utf-16le";
  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 60)) encoding = "utf-16be";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { return bad("XML 编码无效；仅支持 UTF-8/UTF-16。"); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text)) bad("XML 含不允许的控制字符。");
  for (const char of text) { const cp = char.codePointAt(0)!; if (cp >= 0xd800 && cp <= 0xdfff) bad("XML 含无效 Unicode 字符。"); }
  const declaration = text.match(/^<\?xml([ \t\r\n][\s\S]*?)\?>/);
  if (declaration) {
    const attrs = attributes(declaration[1]), declared = attrs.get("encoding")?.toLowerCase();
    const order = [...attrs.keys()].join(",");
    if (attrs.get("version") !== "1.0" || !/^version(?:,encoding)?(?:,standalone)?$/.test(order) || (attrs.has("standalone") && !["yes", "no"].includes(attrs.get("standalone")!))) bad("不支持此 XML 声明。");
    if (declared && !(declared === encoding || (declared === "utf-16" && encoding.startsWith("utf-16")))) bad("XML 声明与实际编码不一致。");
    text = text.slice(declaration[0].length);
  }
  return text;
}
/** Small bounded, namespace-aware well-formedness reader; no DTD, entity loading or DOM tree. */
function parseXml(bytes: Buffer, visit: (node: XmlNode) => void, control = false): void {
  const text = xmlText(bytes), stack: { name: string; ns: Map<string, string> }[] = [];
  let p = 0, roots = 0, nodes = 0;
  while (p < text.length) {
    if (text[p] !== "<") {
      const stop = text.indexOf("<", p), end = stop < 0 ? text.length : stop, value = text.slice(p, end);
      if (((!stack.length || control) && !/^[ \t\r\n]*$/.test(value)) || value.includes("]]>")) bad("XML 根节点之外或控制记录中有额外内容，或文本语法无效。");
      entities(value); p = end; continue;
    }
    if (text.startsWith("<!--", p)) { const end = text.indexOf("-->", p + 4); if (end < 0 || text.slice(p + 4, end).includes("--") || text[end - 1] === "-") bad("XML 注释不完整或非法。"); p = end + 3; continue; }
    if (text.startsWith("<![CDATA[", p)) { const end = text.indexOf("]]>", p + 9); if (end < 0 || !stack.length || control) bad("XML CDATA 不完整或位置无效。"); p = end + 3; continue; }
    if (text.startsWith("<!", p) || text.startsWith("<?", p)) bad("不支持 DTD、实体声明或额外 XML 处理指令。");
    let end = p + 1, quote = "";
    for (; end < text.length; end++) { const c = text[end]; if (quote) { if (c === quote) quote = ""; } else if (c === '"' || c === "'") quote = c; else if (c === ">") break; }
    if (end === text.length || quote) bad("XML 标签未闭合。");
    let tag = text.slice(p + 1, end); p = end + 1;
    if (tag.startsWith("/")) { const name = tag.slice(1).replace(/[ \t\r\n]+$/, ""); if (!namePattern.test(name) || stack.pop()?.name !== name) bad("XML 结束标签不匹配。"); continue; }
    const selfClosing = tag.endsWith("/"); if (selfClosing) tag = tag.slice(0, -1);
    const match = startPattern.exec(tag); if (!match) bad("XML 标签名称无效。");
    const name = match[1], attrs = attributes(tag.slice(name.length));
    if (++nodes > 500000 || stack.length >= 256) bad("XML 节点数量或嵌套深度超过结构检查范围。");
    let ns = stack.at(-1)?.ns ?? new Map([["xml", XML_NS]]);
    if ([...attrs.keys()].some(k => k === "xmlns" || k.startsWith("xmlns:"))) ns = new Map(ns);
    for (const [key, value] of attrs) if (key === "xmlns" || key.startsWith("xmlns:")) {
      const prefix = key === "xmlns" ? "" : key.slice(6);
      if (prefix === "xmlns" || value === XMLNS_NS || (prefix === "xml") !== (value === XML_NS) || (prefix && !value)) bad("XML 命名空间声明无效。");
      ns.set(prefix, value);
    }
    const split = name.split(":"), prefix = split.length === 2 ? split[0] : "", local = split.at(-1)!;
    if (prefix && !ns.has(prefix)) bad("XML 标签使用未声明的命名空间前缀。");
    const expanded = new Set<string>(), visibleAttrs = new Map<string, string>();
    for (const [key, value] of attrs) if (key !== "xmlns" && !key.startsWith("xmlns:")) {
      const pair = key.split(":"), uri = pair.length === 2 ? ns.get(pair[0]) : "";
      if (uri === undefined) bad("XML 属性使用未声明前缀。");
      const identity = `${uri}|${pair.at(-1)}`; if (expanded.has(identity)) bad("XML 存在命名空间等价的重复属性。");
      expanded.add(identity); visibleAttrs.set(key, value);
    }
    if (!stack.length && ++roots !== 1) bad("XML 必须恰有一个根节点。");
    visit({ name, local, uri: ns.get(prefix) ?? "", attrs: visibleAttrs, depth: stack.length });
    if (!selfClosing) stack.push({ name, ns });
  }
  if (stack.length || roots !== 1) bad("XML 结构未闭合或缺少根节点。");
}
function exactAttrs(node: XmlNode, allowed: string[], required: string[]) { if ([...node.attrs.keys()].some(k => !allowed.includes(k)) || required.some(k => !node.attrs.get(k))) bad("OOXML 控制记录含未知属性或缺少必需属性。"); }
function dangerous(value: string): boolean { return /macroenabled|vbaproject|vbadata|activex|oleobject|\/control(?:$|\/)|\/attachedtemplate$|\/afchunk$/i.test(value); }
function resolveTarget(source: string, target: string): string {
  if (!target || /[\\:%?#\u0000-\u0020\u007f]/u.test(target)) bad("不支持含转义、外部协议或歧义的内部关系路径。");
  const parts = target.startsWith("/") ? [] : source.split("/").slice(0, -1);
  for (const segment of target.replace(/^\//, "").split("/")) { if (segment === "..") { if (!parts.length) bad("内部关系逃逸包根目录。"); parts.pop(); } else if (segment !== ".") { if (!segment) bad("内部关系含空路径段。"); parts.push(segment); } }
  const result = parts.join("/"); partPath(result); return result;
}
type Relationship = { id: string; type: string; target: string; external: boolean };
function relationships(bytes: Buffer): Relationship[] {
  const found: Relationship[] = [], ids = new Set<string>();
  parseXml(bytes, node => {
    if (node.uri !== REL_NS || (node.depth === 0 ? node.local !== "Relationships" : node.depth !== 1 || node.local !== "Relationship")) bad("关系 XML 的根节点或结构无效。");
    if (!node.depth) { exactAttrs(node, [], []); return; }
    exactAttrs(node, ["Id", "Type", "Target", "TargetMode"], ["Id", "Type", "Target"]);
    const id = node.attrs.get("Id")!, type = node.attrs.get("Type")!, target = node.attrs.get("Target")!, mode = node.attrs.get("TargetMode");
    if (ids.has(id) || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id) || (mode && mode !== "Internal" && mode !== "External")) bad("关系 ID 重复、无效或 TargetMode 不支持。");
    if (dangerous(type)) bad("不支持宏、ActiveX、OLE、外部模板或替代内容关系。");
    ids.add(id); found.push({ id, type, target, external: mode === "External" });
  }, true);
  return found;
}
function inspect(bytes: Uint8Array, kind: Kind, budget: Budget, nested: boolean): number {
  const { data, entries } = zipEntries(bytes, budget), files = new Map(entries.filter(e => !e.directory).map(e => [e.name, e]));
  const typesEntry = files.get("[Content_Types].xml"), rootEntry = files.get("_rels/.rels");
  if (!typesEntry || !rootEntry) bad("缺少 [Content_Types].xml 或包级关系文件；不是支持的 OOXML 文件。");
  const typesBytes = unpack(data, typesEntry, OFFICE_PACKAGE_LIMITS.controlXml), rootBytes = unpack(data, rootEntry, OFFICE_PACKAGE_LIMITS.controlXml);
  const defaults = new Map<string, string>(), overrides = new Map<string, string>();
  parseXml(typesBytes, node => {
    if (node.uri !== CT_NS || (node.depth === 0 ? node.local !== "Types" : node.depth !== 1 || !["Default", "Override"].includes(node.local))) bad("[Content_Types].xml 结构或命名空间无效。");
    if (!node.depth) { exactAttrs(node, [], []); return; }
    const override = node.local === "Override", key = override ? "PartName" : "Extension";
    exactAttrs(node, [key, "ContentType"], [key, "ContentType"]);
    const name = node.attrs.get(key)!, type = node.attrs.get("ContentType")!.toLowerCase();
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(type) || dangerous(type)) bad("内容类型无效，或包含宏/ActiveX/OLE 标记。");
    if (override) {
      if (!name.startsWith("/")) bad("Override 部件名称必须从包根开始。");
      const path = name.slice(1); partPath(path);
      // Some PptxGenJS exports retain unused slide-master declarations. They carry no
      // payload: allow unused non-main declarations, but require every actual part's
      // type and every internal relationship target below. Duplicates remain invalid.
      if (overrides.has(path.toLowerCase())) bad("内容类型重复声明。");
      overrides.set(path.toLowerCase(), type);
    } else { if (!/^[A-Za-z0-9]+$/.test(name) || defaults.has(name.toLowerCase())) bad("默认扩展名无效或重复。"); defaults.set(name.toLowerCase(), type); }
  }, true);
  const contentType = (name: string) => overrides.get(name.toLowerCase()) ?? defaults.get(name.split(".").at(-1)!.toLowerCase());
  const rootRels = relationships(rootBytes), office = rootRels.filter(r => OFFICE_REL.has(r.type));
  if (office.length !== 1 || office[0].external) bad("包必须恰有一个内部主文档关系。");
  const main = resolveTarget("", office[0].target), mainEntry = files.get(main), core = CORES[kind];
  if (!mainEntry || contentType(main) !== core.type) bad(`实际主文档内容类型不是 ${kind.toUpperCase()}，不能只修改扩展名。`);
  const coreParts = [...files.keys()].filter(name => /(?:wordprocessingml|presentationml|spreadsheetml)\.[^.]+\.main\+xml$/i.test(contentType(name) ?? ""));
  if (coreParts.length !== 1 || Object.entries(CORES).some(([k, v]) => k !== kind && files.has(v.path))) bad("文件混合了不同 Office 主文档类型。");
  let mainFound = false;
  for (const entry of entries) {
    if (entry.directory) { unpack(data, entry); continue; }
    const name = entry.name, type = contentType(name);
    if (name !== "[Content_Types].xml" && !type) bad("部件缺少内容类型声明。");
    if (dangerous(name) || /\.(?:exe|dll|com|bat|cmd|ps1|vbs|js|hta|html?|xlsm|docm|pptm)$/i.test(name)) bad("含不支持的宏、主动内容或可执行附件。");
    const isRels = name.toLowerCase().endsWith(".rels") || type === "application/vnd.openxmlformats-package.relationships+xml", body = entry === typesEntry ? typesBytes : entry === rootEntry ? rootBytes : unpack(data, entry, isRels ? OFFICE_PACKAGE_LIMITS.controlXml : OFFICE_PACKAGE_LIMITS.entry);
    if ((body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) || (body[0] === 0x4d && body[1] === 0x5a)) bad("含不支持的 OLE 复合对象或可执行内容。");
    if (isRels) {
      if (type !== "application/vnd.openxmlformats-package.relationships+xml") bad("关系部件的内容类型不正确。");
      let source = "";
      if (name !== "_rels/.rels") { const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(name); if (!match) bad("关系部件路径无效。"); source = `${match[1] ?? ""}${match[2]}`; if (!files.has(source)) bad("关系部件对应的来源文件缺失。"); }
      for (const rel of entry === rootEntry ? rootRels : relationships(body)) if (!rel.external && !files.has(resolveTarget(source, rel.target))) bad("内部关系引用不存在的部件。");
    } else if (name !== "[Content_Types].xml" && (/\.(?:xml|vml)$/i.test(name) || type?.endsWith("+xml") || type === "application/xml" || type === "text/xml" || type === "application/vnd.openxmlformats-officedocument.vmldrawing")) {
      let root: XmlNode | undefined, hasBody = false;
      parseXml(body, node => { if (!node.depth) root = node; if (entry === mainEntry && node.depth === 1 && node.local === "body" && core.namespaces.some(ns => ns === node.uri)) hasBody = true; });
      if (entry === mainEntry) { if (!root || root.local !== core.root || !core.namespaces.some(ns => ns === root!.uri) || (kind === "docx" && !hasBody)) bad("主文档 XML 根节点、命名空间或正文结构无效。"); mainFound = true; }
    }
    const workbookType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const archiveSignature = body.length >= 4 && [0x04034b50, 0x06054b50, 0x08074b50].includes(body.readUInt32LE(0));
    if (/\/embeddings\//i.test(name) || name.toLowerCase().endsWith(".xlsx") || type === workbookType || archiveSignature) {
      if (nested || !name.toLowerCase().endsWith(".xlsx") || type !== workbookType) bad("嵌入对象仅支持无宏 XLSX 图表工作簿，暂不支持 OLE 或其他嵌入文件。");
      inspect(body, "xlsx", budget, true);
    }
  }
  if (!mainFound) bad("未能验证 Office 主文档 XML。");
  return entries.length;
}

export function inspectOfficePackage(bytes: Uint8Array, expectedKind: "docx" | "pptx"): { kind: "docx" | "pptx"; entries: number } {
  if (expectedKind !== "docx" && expectedKind !== "pptx") bad("仅支持 DOCX 或 PPTX。");
  const entries = inspect(bytes, expectedKind, { declared: 0, entries: 0 }, false);
  return { kind: expectedKind, entries };
}
