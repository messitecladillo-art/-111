import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import JSZip from "jszip";
import { inspectSubmissionLocal, normalizeIdentityTerms, PREFLIGHT_LIMITS } from "../lib/submission-preflight.ts";
import { createPreflightWorkerHandler } from "../lib/submission-preflight.worker.ts";
import { buildDocx, buildPptx } from "../lib/editor-export.ts";
import { createEditorContent } from "../lib/editor-model.ts";

// Synthetic OOXML only: no participant documents or survey answers.
const NS = { ct: "http://schemas.openxmlformats.org/package/2006/content-types", rel: "http://schemas.openxmlformats.org/package/2006/relationships", office: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main", p: "http://schemas.openxmlformats.org/presentationml/2006/main", a: "http://schemas.openxmlformats.org/drawingml/2006/main" };
const CT = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" };
const paths = { docx: "word/document.xml", pptx: "ppt/presentation.xml" };
const body = { docx: `<w:document xmlns:w="${NS.w}"><w:body><w:p><w:r><w:t>合成研究</w:t></w:r></w:p></w:body></w:document>`, pptx: `<p:presentation xmlns:p="${NS.p}"/>` };
function parts(kind = "docx", extra = []) { return [
  { name: "[Content_Types].xml", body: `<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${paths[kind]}" ContentType="${CT[kind]}"/></Types>` },
  { name: "_rels/.rels", body: `<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.office}" Target="${paths[kind]}"/></Relationships>` },
  { name: paths[kind], body: body[kind] }, ...extra,
]; }
async function zip(list = parts(), options = {}) { const z = new JSZip(); list.forEach(part => z.file(part.name, part.body)); return z.generateAsync({ type: "arraybuffer", compression: "DEFLATE", ...options }); }
const digest = bytes => createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
const inspect = (bytes, name = "合成报告.docx", terms = ["测试大学", "张三"]) => inspectSubmissionLocal(bytes, name, terms);
const codes = report => report.findings.map(f => f.code);
const incomplete = async (bytes, code, name) => { const report = await inspect(bytes, name); assert.equal(report.status, "incomplete"); if (code) assert(codes(report).includes(code), JSON.stringify(report.findings)); return report; };
function crc(bytes) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function rawZip(list, { descriptor = false, comment = "" } = {}) {
  const locals = [], centrals = []; let offset = 0;
  for (const part of list) {
    const original = Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body ?? ""), name = Buffer.from(part.name), method = part.method ?? 8, packed = part.packed ?? (method === 8 ? deflateRawSync(original) : original), flags = part.flags ?? (0x800 | (descriptor ? 8 : 0)), size = part.size ?? original.length, check = part.crc ?? crc(original), extra = part.extra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(part.version ?? 20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(descriptor ? 0 : check, 14); local.writeUInt32LE(descriptor ? 0 : packed.length, 18); local.writeUInt32LE(descriptor ? 0 : size, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extra.length, 28);
    const tail = descriptor ? Buffer.alloc(16) : Buffer.alloc(0); if (descriptor) { tail.writeUInt32LE(0x08074b50); tail.writeUInt32LE(check, 4); tail.writeUInt32LE(packed.length, 8); tail.writeUInt32LE(size, 12); }
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(part.version ?? 20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(check, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(part.attrs ?? 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, extra, packed, tail); centrals.push(central, name, extra); offset += local.length + name.length + extra.length + packed.length + tail.length;
  }
  const dir = Buffer.concat(centrals), note = Buffer.from(comment), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(note.length, 20);
  const bytes = Buffer.concat([...locals, dir, end, note]); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function mutate(bytes, change) { const copy = bytes.slice(0), view = new DataView(copy), end = copy.byteLength - 22; change(view, view.getUint32(end + 16, true), end); return copy; }
function addWord(value) { const base = parts(); base[2].body = `<w:document xmlns:w="${NS.w}"><w:body>${value}</w:body></w:document>`; return base; }

test("identity normalization retains ordered unique NFKC/Cf/lowercase terms and exact hash", async () => {
  assert.deepEqual(normalizeIdentityTerms([" ＡＢＣ ", "abc", "张\u200b三", " 张  三 ", "", "测试大学"]), ["abc", "张三", "张 三", "测试大学"]);
  const report = await inspect(await zip(), "报告.docx", [" ＡＢＣ ", "abc", "张\u200b三"]);
  assert.equal(report.termsHash, digest(new TextEncoder().encode(JSON.stringify(["abc", "张三"]))));
  assert.throws(() => normalizeIdentityTerms([null]), /文字列表/);
  assert.throws(() => normalizeIdentityTerms(Array.from({ length: 129 }, (_, i) => `x${i}`)), /最多/);
  assert.throws(() => normalizeIdentityTerms(['😀'.repeat(40)]), /64/);
  assert.throws(() => normalizeIdentityTerms(Array.from({ length: 30 }, (_, i) => '校'.repeat(60) + i)), /4 KiB/);
});
test("valid DOCX/PPTX STORE, DEFLATE and streamed descriptor packages with fingerprints", async () => {
  for (const format of ["docx", "pptx"]) for (const method of [0, 8]) for (const descriptor of [false, true]) {
    const bytes = rawZip(parts(format), { descriptor }); if (method === 0 && descriptor) continue;
    const actual = method === 0 ? rawZip(parts(format).map(p => ({ ...p, method }))) : bytes;
    const hash = digest(actual), report = await inspect(actual, `研究.${format}`);
    assert.equal(report.status, "no_issues_in_checked_scope", JSON.stringify(report.findings)); assert.equal(report.sha256, hash); assert.equal(digest(actual), hash); assert.equal(report.scope, "local-initial");
    assert.equal(report.coverage.find(c => c.id === "package_structure").status, "checked"); assert.equal(report.coverage.find(c => c.id === "images_ocr").status, "manual"); assert.equal(report.coverage.find(c => c.id === "image_metadata").status, "not_checked");
  }
  assert.equal((await inspect(await zip(parts(), { streamFiles: true }))).status, "no_issues_in_checked_scope");
});
test("PDF local check is explicitly incomplete, not checked objects, manual visual review", async () => {
  const report = await inspect(new TextEncoder().encode("%PDF-1.7\nsynthetic").buffer, "研究.pdf", []);
  assert.equal(report.status, "incomplete"); assert(!report.coverage.some(c => c.status === "checked")); assert.equal(report.format, "pdf");
});
test("empty identity list has manual term coverage rather than anonymous-clear guarantee", async () => {
  const report = await inspect(await zip(), "研究.docx", []); assert.equal(report.coverage.find(c => c.id === "identity_terms").status, "manual"); assert.equal(report.status, "no_issues_in_checked_scope");
});
test("real project native Word/PPT exports retain originals and initial checks complete", async () => {
  for (const [format, build] of [["docx", buildDocx], ["pptx", buildPptx]]) {
    const bytes = await (await build(createEditorContent())).arrayBuffer(), original = digest(bytes), report = await inspect(bytes, `合成导出.${format}`);
    assert.notEqual(report.status, "incomplete", JSON.stringify(report.findings)); assert.equal(report.sha256, original); assert.equal(digest(bytes), original);
  }
});
test("split runs, NFKC, Cf, whitespace, entities, filenames and XML attributes detected", async () => {
  const list = addWord('<w:p><w:r><w:t>测试</w:t></w:r><w:r><w:t>大\u200b学</w:t></w:r></w:p><w:p><w:r><w:t>张  </w:t></w:r><w:r><w:t>三</w:t></w:r></w:p><w:p name="ＡＢＣ" label="&#x5f20;&#19977;"/>');
  const report = await inspect(await zip(list), "测试大学报告.docx", ["测试大学", "张三", "abc"]);
  assert.equal(report.status, "issues_found"); assert(report.findings.some(f => f.location === "filename")); assert(report.findings.some(f => f.location === "word/document.xml" && f.field.includes("term:2"))); assert(report.findings.some(f => f.field?.startsWith("name;term:3")));
  assert(!JSON.stringify(report.findings).includes("测试大学")); // reports carry term indexes, not raw excerpts.
});
test("archive comments, canonical part names, custom XML and SVG alt attributes checked", async () => {
  const report = await inspect(rawZip(parts("docx", [{ name: "word/测试大学.xml", body: '<r>中性</r>' }, { name: "customXml/item1.xml", body: '<r><v>张三</v></r>' }, { name: "word/media/a.svg", body: '<svg xmlns="http://www.w3.org/2000/svg" aria-label="张三"/>' }]), { comment: "测试大学" }));
  for (const code of ["forbidden_identity_term", "custom_xml_parts_present"]) assert(codes(report).includes(code)); assert(report.findings.some(f => f.location === "zip_archive_comment")); assert(report.findings.some(f => f.location === "archive_member_names")); assert(report.findings.some(f => f.location.startsWith("word/media/a.svg#")));
});
test("XML content type cannot hide identity behind a binary suffix", async () => {
  const list = parts("docx", [{ name: "word/renamed.bin", body: '<r>张三</r>' }]); list[0].body = list[0].body.replace('</Types>', '<Override PartName="/word/renamed.bin" ContentType="application/xml"/></Types>');
  const report = await inspect(await zip(list)); assert(report.findings.some(f => f.location === "word/renamed.bin" && f.code === "forbidden_identity_term"));
});
test("metadata creator/lastmodifier/company and custom values get exact field locations", async () => {
  const report = await inspect(await zip(parts("docx", [{ name: "docProps/core.xml", body: '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>作者</dc:creator><cp:lastModifiedBy>修改人</cp:lastModifiedBy><dc:title>研究</dc:title></cp:coreProperties>' }, { name: "docProps/app.xml", body: '<Properties><Company>机构</Company></Properties>' }, { name: "docProps/custom.xml", body: '<Properties><property name="Team"><value>团队</value></property></Properties>' }])));
  const fields = report.findings.filter(f => f.code === "identity_metadata").map(f => f.field); for (const field of ["creator", "lastModifiedBy", "title", "Company", "value"]) assert(fields.includes(field)); assert(report.findings.every(f => f.location !== "docProps"));
});
test("Word review, comment parts, hidden slide, nonempty notes, thumbnail and embeds", async () => {
  const word = addWord('<w:p><w:ins w:author="张三"><w:r><w:t>新增</w:t></w:r></w:ins><w:pPrChange/></w:p>'); word.push({ name: "word/comments.xml", body: '<comments/>' }); assert(codes(await inspect(await zip(word))).includes("tracked_changes_present")); assert(codes(await inspect(await zip(word))).includes("comments_present"));
  const ppt = parts("pptx", [{ name: "ppt/slides/slide1.xml", body: `<p:sld xmlns:p="${NS.p}" show="0"/>` }, { name: "ppt/notesSlides/notesSlide1.xml", body: `<p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}"><a:t>合成备注</a:t></p:notes>` }, { name: "docProps/thumbnail.jpeg", body: "fake-thumbnail" }, { name: "ppt/embeddings/object1.bin", body: "fake-embedded" }]);
  for (const code of ["hidden_slides_present", "speaker_notes_present", "package_thumbnail_present", "embedded_files_present"]) assert(codes(await inspect(await zip(ppt), "研究.pptx")).includes(code));
});
test("empty notes do not produce nonempty note warning", async () => {
  const report = await inspect(await zip(parts("pptx", [{ name: "ppt/notesSlides/notesSlide1.xml", body: `<p:notes xmlns:p="${NS.p}">  </p:notes>` }])), "研究.pptx"); assert(!codes(report).includes("speaker_notes_present"));
});
test("external web/mail/file and active relation flags do not fetch or execute targets", async () => {
  const rels = `<Relationships xmlns="${NS.rel}"><Relationship Id="rId2" Type="${NS.office.replace(/officeDocument$/, "hyperlink")}" Target="https://example.invalid/source" TargetMode="External"/><Relationship Id="rId3" Type="${NS.office.replace(/officeDocument$/, "hyperlink")}" Target="mailto:author@example.invalid" TargetMode="External"/><Relationship Id="rId4" Type="${NS.office.replace(/officeDocument$/, "attachedTemplate")}" Target="file:///C:/private.dotm" TargetMode="External"/></Relationships>`;
  const report = await inspect(await zip(parts("docx", [{ name: "word/_rels/document.xml.rels", body: rels }, { name: "word/vbaProject.bin", body: "inert" }])));
  for (const code of ["external_web_relationships_present", "external_local_or_identity_relationships", "active_content_present"]) assert(codes(report).includes(code)); assert(report.findings.some(f => f.location === "word/_rels/document.xml.rels#rId3"));
});
test("findings are capped at500 and coverage/status signal incomplete", async () => {
  const items = Array.from({ length: 510 }, (_, i) => ({ name: `customXml/item${i}.xml`, body: '<r>张三</r>' })); const report = await inspect(await zip(parts("docx", items)));
  assert.equal(report.findings.length, 500); assert.equal(report.status, "incomplete"); assert.equal(report.coverage.find(c => c.id === "finding_limit").status, "not_checked");
});
test("wrong format, missing main, nested content declarations and namespace errors incomplete", async () => {
  await incomplete(await zip(parts("pptx")), "office_type_mismatch"); await incomplete(await zip(parts().slice(0, 2)), "office_type_mismatch");
  const list = parts(); list[2].body = '<document><body/></document>'; await incomplete(await zip(list), "office_type_mismatch");
  const nested = parts(); nested[0].body = nested[0].body.replace('<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="xml" ContentType="application/xml"><Default Extension="bin" ContentType="x/y"/></Default>'); await incomplete(await zip(nested), "office_type_mismatch");
});
test("malformed XML, DTD, undefined entity, duplicate attributes and bad UTF8 incomplete", async () => {
  for (const value of ['<r><a></r>', '<!DOCTYPE r [<!ENTITY id SYSTEM "file:///secret">]><r>&id;</r>', '<r>&unknown;</r>', '<r a="1" a="2"/>', '<r xmlns:x="urn:a" xmlns:y="urn:a" x:a="1" y:a="2"/>', '<r>\u0000</r>', '<r>&#0;</r>', '<r a="&#0;"/>', '<?xml version="1.1"?><r/>', '<r><?xml version="1.0"?></r>', Buffer.from([0xff, 0xff])]) await incomplete(await zip(parts("docx", [{ name: "word/settings.xml", body: value }])), "xml_invalid");
});
test("UTF16 XML is decoded and identity scanned; inconsistent encoding rejected", async () => {
  const text = '<?xml version="1.0" encoding="utf-16"?><r>张三</r>', value = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]); const report = await inspect(await zip(parts("docx", [{ name: "word/settings.xml", body: value }]))); assert(codes(report).includes("forbidden_identity_term"));
  await incomplete(await zip(parts("docx", [{ name: "word/settings.xml", body: '<?xml version="1.0" encoding="utf-16"?><r/>' }])), "xml_invalid");
});
test("global XML node/attribute budgets and nesting bounded", async () => {
  await incomplete(await zip(parts("docx", [{ name: "word/settings.xml", body: '<r>' + '<a>'.repeat(129) + '</a>'.repeat(129) + '</r>' }])), "xml_limit");
  await incomplete(await zip(parts("docx", [{ name: "word/settings.xml", body: '<r>' + '<a/>'.repeat(PREFLIGHT_LIMITS.xmlNodes) + '</r>' }])), "xml_limit");
});
test("input is bounded before hashing, unknown extension rejected", async () => {
  await assert.rejects(inspect(new ArrayBuffer(PREFLIGHT_LIMITS.input + 1)), /20 MiB/); await assert.rejects(inspect(await zip(), "报告.docm"), /支持/);
});
test("ZIP path traversal/case/NFKC/Cf duplicates and symlinks incomplete", async () => {
  for (const name of ['../private.xml', '/private.xml', 'word/../a.xml', 'word\\a.xml', 'word/%2e%2e/a.xml', 'word//a.xml', 'C:/a.xml', 'word/a.', 'word/.. /a.xml']) await incomplete(rawZip(parts("docx", [{ name, body: '<r/>' }])), "zip_path_invalid");
  for (const name of ['word/document.XML', 'ｗｏｒｄ/document.xml', 'word/docu\u200bment.xml']) await incomplete(rawZip(parts("docx", [{ name, body: '<r/>' }])), "zip_member_collision");
  await incomplete(rawZip(parts("docx", [{ name: "word/link.bin", body: "x", attrs: (0xa1ff << 16) >>> 0 }])), "zip_path_invalid");
});
test("ZIP encryption/ZIP64/unsupported compression and invalid extras incomplete", async () => {
  for (const patch of [{ flags: 0x801 }, { version: 45 }, { method: 99 }, { extra: Buffer.from([1, 0, 0, 0]) }, { extra: Buffer.from([0x17, 0, 0, 0]) }]) { const list = parts(); list[0] = { ...list[0], ...patch }; await incomplete(rawZip(list), "zip_unsupported"); }
  await incomplete(rawZip([{ ...parts()[0], extra: Buffer.from([1, 1, 10, 0, 0]) }, ...parts().slice(1)]), "zip_invalid");
});
test("central/local mismatch, descriptors, malformed directory and trailing data incomplete", async () => {
  const original = rawZip(parts());
  for (const patch of [(v) => v.setUint16(6, 0, true), (v) => v.setUint32(14, 0, true), (v, c) => v.setUint32(c + 42, 3, true), (v, c, end) => v.setUint32(end + 12, 1, true)]) await incomplete(mutate(original, patch), "zip_invalid");
  const trail = Buffer.concat([Buffer.from(original), Buffer.from('tail')]); await incomplete(trail.buffer.slice(trail.byteOffset, trail.byteOffset + trail.length), "zip_invalid"); await incomplete(original.slice(0, -1), "zip_invalid");
  const descriptor = rawZip(parts(), { descriptor: true }); await incomplete(mutate(descriptor, (v, c) => { const start = 30 + v.getUint16(26, true) + v.getUint16(28, true); v.setUint32(start + v.getUint32(c + 20, true) + 4, 0, true); }), "zip_invalid");
});
test("ZIP entry/declaration and cumulative expansion budgets before decompression", async () => {
  await incomplete(rawZip(Array.from({ length: PREFLIGHT_LIMITS.entries + 1 }, (_, i) => ({ name: `f${i}.bin`, body: '' }))), "zip_entry_limit");
  await incomplete(rawZip(parts("docx", [{ name: "word/x.bin", body: "x", size: PREFLIGHT_LIMITS.entry + 1 }])), "zip_expansion_limit");
  await incomplete(rawZip(parts("docx", Array.from({ length: 9 }, (_, i) => ({ name: `word/x${i}.bin`, body: "x", size: PREFLIGHT_LIMITS.entry })))), "zip_expansion_limit");
});
test("actual inflate bomb, size/CRC mismatch, truncated and trailing deflate are refused", async () => {
  const huge = Buffer.alloc(1024 * 1024, 65); await incomplete(rawZip(parts("docx", [{ name: "word/x.bin", body: huge, size: 1 }])), "zip_expansion_limit");
  for (const patch of [{ size: 4 }, { crc: 0 }, { packed: deflateRawSync(Buffer.from('abc')).subarray(0, 2) }, { packed: Buffer.concat([deflateRawSync(Buffer.from('abc')), Buffer.from('junk')]) }, { packed: Buffer.concat([deflateRawSync(Buffer.from('abc')), deflateRawSync(Buffer.from('extra'))]) }]) await incomplete(rawZip(parts("docx", [{ name: "word/x.bin", body: "abc", ...patch }])), "zip_integrity");
});
test("relationship missing/dangling/duplicate and traversal targets are incomplete", async () => {
  for (const records of [
    `<Relationship Id="r2" Type="urn:test" Target="missing.xml"/>`,
    `<Relationship Id="r2" Type="urn:test" Target="document.xml"/><Relationship Id="r2" Type="urn:test" Target="document.xml"/>`,
    `<Relationship Id="r2" Type="urn:test" Target="../../outside.xml"/>`,
  ]) await incomplete(await zip(parts("docx", [{ name: "word/_rels/document.xml.rels", body: `<Relationships xmlns="${NS.rel}">${records}</Relationships>` }])), "relationship_invalid");
});
test("Worker phases/receipt use request id; invalid/busy requests cannot overwrite active result", async () => {
  const output = [], handle = createPreflightWorkerHandler(msg => output.push(msg)), bytes = await zip();
  const active = handle({ id: "one", buffer: bytes, name: "研究.docx", terms: [] }); await handle({ id: "two", buffer: bytes, name: "研究.docx", terms: [] }); await active;
  assert(output.some(m => m.id === "two" && m.error)); assert.equal(output.filter(m => m.result).length, 1); assert.equal(output.find(m => m.result).id, "one"); assert.deepEqual(output.filter(m => m.phase).map(m => m.phase), ["fingerprint", "package", "xml", "inspect", "complete"]);
  await handle({ id: "bad", buffer: "not bytes", name: "研究.docx", terms: [] }); assert(output.some(m => m.id === "bad" && m.error));
  await handle({ id: "retry", buffer: await zip(), name: "研究.docx", terms: [] }); assert(output.some(m => m.id === "retry" && m.result));
});
