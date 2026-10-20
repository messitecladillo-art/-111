import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { loadSpreadsheet, SpreadsheetImportError, XLSX_LIMITS } from "../lib/spreadsheet-import.ts";
import { parseSurveyCsv, describeNumbers } from "../lib/survey-analysis.ts";
import { createSpreadsheetWorkerHandler } from "../workers/spreadsheet-import.worker.ts";

// All workbooks in this suite are synthetic QA inputs, created in memory.
function workbook(sheets = [{ name: "答卷", rows: [["Q1. 满意度", "编号"], [1, "0001"], [2, "0002"]] }], options = {}) {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(book, sheet.sheet ?? XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  if (options.hidden) book.Workbook = { Sheets: sheets.map((_, i) => ({ Hidden: i ? 1 : 0 })) };
  return XLSX.write(book, { type: "array", bookType: "xlsx", compression: true });
}
async function mutate(bytes, change) {
  const zip = await JSZip.loadAsync(bytes); await change(zip);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
async function rewriteSheet(bytes, replace) { return mutate(bytes, async zip => zip.file("xl/worksheets/sheet1.xml", replace(await zip.file("xl/worksheets/sheet1.xml").async("string")))); }
function errorCode(code, ref) { return error => error instanceof SpreadsheetImportError && error.code === code && (ref === undefined || error.details.cellRef === ref); }
function central(bytes) { const data = new Uint8Array(bytes), view = new DataView(bytes); const end = data.length - 22; assert.equal(view.getUint32(end, true), 0x06054b50); return { data, view, end, at: view.getUint32(end + 16, true) }; }
function patchZip(bytes, callback) { const copy = bytes.slice(0); callback(central(copy)); return copy; }

 test("multi-sheet: original Chinese labels, duplicate/blank headers, stable IDs and blank rows", async () => {
  const file = workbook([{ name: "原表", rows: [["Q1.满意度", "Q1.满意度", "", "第12题 类别"], [0, "00001", "甲", true], [], [3, "00002", "乙", false]] }, { name: "分析表", rows: [["数值"], [9]] }], { hidden: true });
  const session = await loadSpreadsheet(file), inspection = session.inspect();
  assert.deepEqual(inspection.sheets.map(s => [s.name, s.hidden]), [["原表", false], ["分析表", true]]);
  assert.equal(inspection.sheets[0].previewRows[2].rowNumber, 3);
  const result = session.select({ sheetId: "sheet-0", headerRow: 1 });
  assert.deepEqual(result.table.headers, ["sheet-0:col-A", "sheet-0:col-B", "sheet-0:col-C", "sheet-0:col-D"]);
  assert.deepEqual(result.columns.map(c => c.label), ["Q1.满意度", "Q1.满意度", "", "第12题 类别"]);
  assert.deepEqual(result.columns.map(c => c.questionNumber), ["1", "1", null, "12"]);
  assert.deepEqual(result.sourceRows, [2, 3, 4]); assert.equal(result.table.skippedBlankLines, 0);
  assert.deepEqual(result.table.rows[0], ["0", "00001", "甲", "true"]);
  assert.deepEqual(result.table.rows[1], ["", "", "", ""]);
  assert.equal(result.cellMeta[2][1].ref, "B4"); assert.equal(result.cellMeta[0][0].rawValue, 0);
  assert.ok(result.issues.some(i => i.code === "DUPLICATE_HEADERS")); assert.ok(result.issues.some(i => i.code === "BLANK_HEADERS"));
  inspection.sheets[0].name = "caller mutation"; assert.equal(session.inspect().sheets[0].name, "原表");
  assert.deepEqual(session.select({ sheetId: "sheet-1", headerRow: 1 }).table.rows, [["9"]]);
 });

 test("manual header/range and no-header preserve absolute cell references", async () => {
  const session = await loadSpreadsheet(workbook([{ name: "选择", rows: [["说明", "说明", "说明"], ["x", "组别", "Q2: 分数"], ["ignore", "甲", 4], ["ignore", "乙", 5]] }]));
  const result = session.select({ sheetId: "sheet-0", headerRow: 2, range: "$B$1:$C$4" });
  assert.deepEqual(result.table.headers, ["sheet-0:col-B", "sheet-0:col-C"]); assert.deepEqual(result.sourceRows, [3, 4]);
  assert.deepEqual(result.columns.map(c => c.headerRef), ["B2", "C2"]); assert.equal(result.columns[1].questionNumber, "2");
  assert.deepEqual(result.table.rows, [["甲", "4"], ["乙", "5"]]);
  const bare = session.select({ sheetId: "sheet-0", headerRow: null, range: "B3:C4" });
  assert.deepEqual(bare.columns.map(c => [c.label, c.headerRef]), [["", null], ["", null]]); assert.deepEqual(bare.table.rows, result.table.rows);
  for (const range of ["A0:C4", "C4:B1", "A1:XFE2", "A1:C1048577", "A1:C4;E1", "A1:C5"]) assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 2, range }), error => error instanceof SpreadsheetImportError);
  assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 1, range: "B2:C4" }), errorCode("HEADER_INVALID"));
  assert.throws(() => session.select({ sheetId: "sheet-9", headerRow: 1 }), errorCode("SHEET_EMPTY"));
 });

 test("numeric raw values match CSV; formatting/date/leading zeros are separate metadata", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["分数", "编码", "日期"], [1.25, "0010", 46000], [2.5, "0020", 46001], [3.75, "0030", 46002]]);
  sheet.A2.z = "0.0%"; sheet.C2.z = "yyyy-mm-dd";
  const result = (await loadSpreadsheet(workbook([{ name: "原值", sheet }]))).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(result.table.rows[0][0], "1.25"); assert.equal(result.cellMeta[0][0].formattedValue, "125.0%");
  assert.equal(result.table.rows[0][1], "0010"); assert.equal(result.cellMeta[0][2].kind, "date"); assert.equal(result.table.rows[0][2], "46000");
  const csv = parseSurveyCsv("分数,编码,日期\n1.25,0010,46000\n2.5,0020,46001\n3.75,0030,46002");
  assert.deepEqual(result.table.rows, csv.rows); assert.deepEqual(describeNumbers(result.table.rows.map(r => Number(r[0]))), describeNumbers(csv.rows.map(r => Number(r[0]))));
 });

 test("cached formulas use exact saved values and never execute external functions", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["本地公式", "外链公式"], [3, 0]]); sheet.A2.f = "1+2"; sheet.B2.f = 'WEBSERVICE("https://example.invalid/private")';
  const oldFetch = globalThis.fetch; let fetches = 0; globalThis.fetch = () => { fetches++; throw new Error("network forbidden"); };
  try {
    const result = (await loadSpreadsheet(workbook([{ name: "公式", sheet }]))).select({ sheetId: "sheet-0", headerRow: 1 });
    assert.deepEqual(result.table.rows, [["3", "0"]]); assert.equal(result.cellMeta[0][0].formula, "1+2");
    assert.equal(result.cellMeta[0][1].formulaState, "cached"); assert.equal(result.issues.filter(i => i.code === "FORMULA_CACHED").length, 2); assert.equal(fetches, 0);
  } finally { globalThis.fetch = oldFetch; }
 });

 test("uncached formulas and Excel errors are located and cannot become missing values", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["分数", "第二列"], [3, 4]]); sheet.A2.f = "1+2";
  const file = workbook([{ name: "公式", sheet }]);
  const missing = await rewriteSheet(file, xml => xml.replace(/(<c\b[^>]*\br="A2"[^>]*>[\s\S]*?)<v>3<\/v>/u, "$1"));
  const session = await loadSpreadsheet(missing);
  assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("FORMULA_CACHE_MISSING", "A2"));
  assert.deepEqual(session.select({ sheetId: "sheet-0", headerRow: 1, range: "B1:B2" }).table.rows, [["4"]]);
  const cachedError = await rewriteSheet(file, xml => xml.replace(/<c\b[^>]*\br="A2"[^>]*>[\s\S]*?<\/c>/u, '<c r="A2" t="e"><f>1/0</f><v>#DIV/0!</v></c>'));
  assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 2 }), errorCode("NO_DATA"));
  const errorSession = await loadSpreadsheet(cachedError);
  assert.throws(() => errorSession.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("EXCEL_CELL_ERROR", "A2"));
  const missingHeader = await rewriteSheet(file, xml => xml.replace(/<c\b[^>]*\br="A1"[^>]*>[\s\S]*?<\/c>/u, '<c r="A1"><f>1+1</f></c>'));
  assert.throws(() => (session.select({ sheetId: "sheet-0", headerRow: 1 })), errorCode("FORMULA_CACHE_MISSING", "A2"));
  assert.throws(() => (errorSession.select({ sheetId: "sheet-0", headerRow: 1 })), errorCode("EXCEL_CELL_ERROR", "A2"));
  const headerSession = await loadSpreadsheet(missingHeader); assert.throws(() => headerSession.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("FORMULA_CACHE_MISSING", "A1"));
 });

 test("selected cell/string limits; labels never truncate, merged blanks never autofill", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["长".repeat(2000), "重复", "重复"], [1, "", 2]]); sheet["!merges"] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }];
  const result = (await loadSpreadsheet(workbook([{ name: "表头", sheet }]))).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(result.columns[0].label.length, 2000); assert.ok(result.issues.some(i => i.code === "MERGED_CELLS"));
  const long = await loadSpreadsheet(workbook([{ name: "超长", rows: [["长".repeat(2001)], [1]] }])); assert.throws(() => long.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("CELL_LENGTH_LIMIT", "A1"));
  const dataLong = await loadSpreadsheet(workbook([{ name: "超长值", rows: [["值"], ["x".repeat(2001)]] }])); assert.throws(() => dataLong.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("CELL_LENGTH_LIMIT", "A2"));
  const wide = XLSX.utils.aoa_to_sheet([["a"], [1]]); wide["!ref"] = "A1:CC2";
  const wideSession = await loadSpreadsheet(workbook([{ name: "宽表", sheet: wide }])); assert.equal(wideSession.inspect().sheets[0].columns, 81); assert.throws(() => wideSession.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("COLUMN_LIMIT"));
  const tall = await rewriteSheet(workbook(), xml => xml.replace(/<dimension ref="[^"]*"/u, '<dimension ref="A1:B5002"'));
  const tallSession = await loadSpreadsheet(tall); assert.equal(tallSession.inspect().sheets[0].rows, 5002); assert.throws(() => tallSession.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("ROW_LIMIT"));
  const cellBudget = await rewriteSheet(workbook(), xml => xml.replace(/<dimension ref="[^"]*"/u, '<dimension ref="A1:CB2502"'));
  const budgetSession = await loadSpreadsheet(cellBudget); assert.throws(() => budgetSession.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("CELL_LIMIT"));
 });

 test("declared sheet range cannot hide real cells; bounded manual range is explicit", async () => {
  const outside = await rewriteSheet(workbook(), xml => xml.replace(/<dimension ref="[^"]*"/u, '<dimension ref="A1:A3"'));
  await assert.rejects(loadSpreadsheet(outside), errorCode("DECLARED_RANGE_MISMATCH", "B1"));
  const expanded = await rewriteSheet(workbook(), xml => xml.replace(/<dimension ref="[^"]*"/u, '<dimension ref="A1:B10000"'));
  const session = await loadSpreadsheet(expanded); assert.equal(session.inspect().sheets[0].rows, 10000);
  assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("ROW_LIMIT"));
  assert.deepEqual(session.select({ sheetId: "sheet-0", headerRow: 1, range: "A1:B3" }).sourceRows, [2, 3]);
 });

 test("external relationships never fetch; macro parts, file punning and XML entities rejected", async () => {
  const file = workbook();
  const linked = await mutate(file, async zip => { const path = "xl/_rels/workbook.xml.rels"; zip.file(path, (await zip.file(path).async("string")).replace("</Relationships>", '<Relationship Id="external-test" Type="hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>')); });
  assert.equal((await loadSpreadsheet(linked)).inspect().issues.find(i => i.code === "EXTERNAL_LINKS_IGNORED").count, 1);
  const macro = await mutate(file, zip => zip.file("xl/vbaProject.bin", new Uint8Array([0, 1, 2]))); await assert.rejects(loadSpreadsheet(macro), errorCode("MACRO_UNSUPPORTED"));
  const macroType = await mutate(file, async zip => zip.file("[Content_Types].xml", (await zip.file("[Content_Types].xml").async("string")).replace("spreadsheetml.sheet.main+xml", "ms-excel.sheet.macroEnabled.main+xml")));
  await assert.rejects(loadSpreadsheet(macroType), errorCode("MACRO_UNSUPPORTED"));
  for (const fake of [new TextEncoder().encode("a,b\n1,2"), new Uint8Array([208, 207, 17, 224, 161, 177, 26, 225]), new Uint8Array(2_000_001)]) await assert.rejects(loadSpreadsheet(fake), error => error instanceof SpreadsheetImportError);
  const entity = await rewriteSheet(file, xml => '<!DOCTYPE worksheet [<!ENTITY leak SYSTEM "file:///private">]>' + xml); await assert.rejects(loadSpreadsheet(entity), errorCode("XML_UNSUPPORTED"));
 });

 test("ZIP preflight rejects declared bombs, actual-size lies, encryption, unsupported method and corrupt CRC", async () => {
  const file = workbook();
  const count = patchZip(file, ({ view, end }) => { view.setUint16(end + 8, 513, true); view.setUint16(end + 10, 513, true); }); await assert.rejects(loadSpreadsheet(count), errorCode("ZIP_ENTRY_LIMIT"));
  const bomb = patchZip(file, ({ view, at }) => view.setUint32(at + 24, XLSX_LIMITS.entryBytes + 1, true)); await assert.rejects(loadSpreadsheet(bomb), errorCode("ZIP_EXPANSION_LIMIT"));
  const lie = patchZip(file, ({ view, at }) => { const local = view.getUint32(at + 42, true); view.setUint32(at + 24, 1, true); view.setUint32(local + 22, 1, true); }); await assert.rejects(loadSpreadsheet(lie), errorCode("ZIP_EXPANSION_LIMIT"));
  const encrypted = patchZip(file, ({ view, at }) => view.setUint16(at + 8, 1, true)); await assert.rejects(loadSpreadsheet(encrypted), errorCode("ZIP_UNSUPPORTED"));
  const unsupported = patchZip(file, ({ view, at }) => view.setUint16(at + 10, 12, true)); await assert.rejects(loadSpreadsheet(unsupported), errorCode("ZIP_UNSUPPORTED"));
  const crc = patchZip(file, ({ view, at }) => { const local = view.getUint32(at + 42, true), wrong = view.getUint32(at + 16, true) ^ 1; view.setUint32(at + 16, wrong, true); view.setUint32(local + 14, wrong, true); }); await assert.rejects(loadSpreadsheet(crc), errorCode("ZIP_INTEGRITY"));
  await assert.rejects(loadSpreadsheet(file.slice(0, -5)), errorCode("ZIP_INVALID"));
  const path = await mutate(file, zip => zip.file("../outside.xml", "<x/>")); await assert.rejects(loadSpreadsheet(path), errorCode("ZIP_PATH_INVALID"));
 });

 test("Worker envelopes isolate request IDs, reopen failures and disposed late results", async () => {
  const events = [], handle = createSpreadsheetWorkerHandler(message => events.push(message));
  await handle({ type: "select", requestId: "early", selection: { sheetId: "sheet-0", headerRow: 1 } }); assert.equal(events.at(-1).error.code, "NOT_READY");
  await handle({ type: "open", requestId: "file-1", buffer: workbook() }); assert.equal(events.at(-1).type, "opened"); assert.ok(events.some(e => e.type === "progress" && e.phase === "decompress"));
  await handle({ type: "select", requestId: "rows-1", selection: { sheetId: "sheet-0", headerRow: 1 } }); assert.equal(events.at(-1).type, "selected"); assert.equal(events.at(-1).requestId, "rows-1");
  const pending = handle({ type: "open", requestId: "old", buffer: workbook() }); await handle({ type: "dispose", requestId: "clear" }); await pending; assert.ok(!events.some(e => e.requestId === "old" && e.type === "opened"));
  await handle({ type: "select", requestId: "after-clear", selection: { sheetId: "sheet-0", headerRow: 1 } }); assert.equal(events.at(-1).error.code, "NOT_READY");
  await handle({ type: "open", requestId: "bad", buffer: new ArrayBuffer(3) }); assert.equal(events.at(-1).error.code, "XLSX_REQUIRED");
  await handle({ type: "select", requestId: "after-failure", selection: { sheetId: "sheet-0", headerRow: 1 } }); assert.equal(events.at(-1).error.code, "NOT_READY");
  await handle({ type: "weird", requestId: "bad-request" }); assert.equal(events.at(-1).error.code, "INVALID_REQUEST");
 });

 test("shared formula caches and cached empty strings remain explicit; self-closing missing cache fails", async () => {
  const file = workbook([{ name: "共享", rows: [["共享公式", "空字符串"], [1, ""], [2, "ok"]] }]);
  const shared = await rewriteSheet(file, xml => xml.replace(/<c\b[^>]*\br="A2"[^>]*>[\s\S]*?<\/c>/u, '<c r="A2"><f t="shared" si="0" ref="A2:A3">ROW()-1</f><v>1</v></c>').replace(/<c\b[^>]*\br="A3"[^>]*>[\s\S]*?<\/c>/u, '<c r="A3"><f t="shared" si="0"/><v>2</v></c>').replace(/<c\b[^>]*\br="B2"[^>]*>[\s\S]*?<\/c>/u, '<c r="B2" t="str"><f>IF(1=1,&quot;&quot;,&quot;x&quot;)</f><v></v></c>'));
  const result = (await loadSpreadsheet(shared)).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.deepEqual(result.table.rows, [["1", ""], ["2", "ok"]]);
  assert.equal(result.cellMeta[1][0].formulaState, "cached"); assert.equal(result.cellMeta[0][1].formulaState, "cached");
  const missing = await rewriteSheet(shared, xml => xml.replace('<f t="shared" si="0"/><v>2</v>', '<f t="shared" si="0"/>'));
  const missingSession = await loadSpreadsheet(missing); assert.throws(() => missingSession.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("FORMULA_CACHE_MISSING", "A3"));
 });

 test("200,000 actual numeric cells fit the selected budget without dropping content", async context => {
  const columns = 80, count = 2500, rows = [Array.from({ length: columns }, (_, c) => "Q" + (c + 1) + ". 值")];
  for (let r = 0; r < count; r++) rows.push(Array.from({ length: columns }, (_, c) => (r + c) % 9));
  const started = performance.now(), memoryBefore = process.memoryUsage().heapUsed, file = workbook([{ name: "合成压力验收", rows }]);
  assert.ok(file.byteLength <= 2_000_000);
  const session = await loadSpreadsheet(file), result = session.select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(result.cellMeta.length * result.columns.length, 200000); assert.equal(result.table.rows.length, 2500); assert.equal(result.table.headers.length, 80);
  assert.equal(result.sourceRows[2499], 2501); assert.equal(result.cellMeta[2499][79].ref, "CB2501"); assert.equal(result.cellMeta[2499][79].rawValue, (2499 + 79) % 9);
  assert.equal(result.table.rows[0][0], "0"); assert.equal(result.table.rows[2499][79], String((2499 + 79) % 9));
  context.diagnostic(JSON.stringify({ synthetic: true, bytes: file.byteLength, cells: 200000, elapsedMs: Math.round(performance.now() - started), heapDeltaBytes: process.memoryUsage().heapUsed - memoryBefore, node: process.version, platform: process.platform, arch: process.arch }));
 });

 test("5,000 rows and 80 columns are allowed separately; no-header row limit still applies", async () => {
  const expanded = await rewriteSheet(workbook(), xml => xml.replace(/<dimension ref="[^"]*"/u, '<dimension ref="A1:B5001"'));
  const session = await loadSpreadsheet(expanded), result = session.select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(result.table.rows.length, 5000); assert.equal(result.sourceRows[4999], 5001);
  assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: null }), errorCode("ROW_LIMIT"));
  const eighty = await rewriteSheet(workbook(), xml => xml.replace(/<dimension ref="[^"]*"/u, '<dimension ref="A1:CB3"'));
  assert.equal((await loadSpreadsheet(eighty)).select({ sheetId: "sheet-0", headerRow: 1 }).columns.length, 80);
 });

 test("latest open wins when two workbooks arrive while decompression is in flight", async () => {
  const events = [], handle = createSpreadsheetWorkerHandler(event => events.push(event));
  const older = handle({ type: "open", requestId: "older", buffer: workbook([{ name: "旧", rows: [["值"], [1]] }]) });
  const newer = handle({ type: "open", requestId: "newer", buffer: workbook([{ name: "新", rows: [["值"], [7]] }]) });
  await Promise.all([older, newer]);
  assert.ok(!events.some(event => event.requestId === "older" && event.type === "opened")); assert.equal(events.filter(event => event.type === "opened").length, 1);
  await handle({ type: "select", requestId: "latest", selection: { sheetId: "sheet-0", headerRow: 1 } }); assert.deepEqual(events.at(-1).result.table.rows, [["7"]]);
 });

 test("formula and Excel-error prelude cells inside the chosen range cannot be hidden by header selection", async () => {
  const file = workbook([{ name: "说明行", rows: [["说明", "列二"], ["分数", "编码"], [1, "0001"]] }]);
  const missing = await rewriteSheet(file, xml => xml.replace(/<c\b[^>]*\br="A1"[^>]*>[\s\S]*?<\/c>/u, '<c r="A1"><f>1+1</f></c>'));
  const missingSession = await loadSpreadsheet(missing);
  assert.equal(missingSession.inspect().sheets[0].previewRows[0].values[0], "未保存计算结果");
  assert.throws(() => missingSession.select({ sheetId: "sheet-0", headerRow: 2 }), errorCode("FORMULA_CACHE_MISSING", "A1"));
  assert.deepEqual(missingSession.select({ sheetId: "sheet-0", headerRow: 2, range: "A2:B3" }).table.rows, [["1", "0001"]]);
  const error = await rewriteSheet(file, xml => xml.replace(/<c\b[^>]*\br="B1"[^>]*>[\s\S]*?<\/c>/u, '<c r="B1" t="e"><v>#N/A</v></c>'));
  assert.throws(() => missingSession.select({ sheetId: "sheet-0", headerRow: 2 }), errorCode("FORMULA_CACHE_MISSING", "A1"));
  const errorSession = await loadSpreadsheet(error); assert.throws(() => errorSession.select({ sheetId: "sheet-0", headerRow: 2 }), errorCode("EXCEL_CELL_ERROR", "B1"));
 });

 test("raw duplicate cells and invalid references are rejected before a value or error can be overwritten", async () => {
  const file = workbook();
  for (const duplicate of ['<c r="A2"><v>999</v></c>', '<c r="A2" t="e"><v>#N/A</v></c>']) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', duplicate + '<c r="A2"><v>1</v></c>'));
    await assert.rejects(loadSpreadsheet(changed), errorCode("CELL_REFERENCE_DUPLICATE", "A2"));
  }
  for (const ref of ["A0", "A01", "a2", "XFE2", "A1048577", "", "A3"]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2">', '<c r="' + ref + '">'));
    await assert.rejects(loadSpreadsheet(changed), errorCode("CELL_REFERENCE_INVALID", ref));
  }
  const encodedDuplicate = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2"><v>1</v></c><c r="A&#50;"><v>999</v></c>'));
  await assert.rejects(loadSpreadsheet(encodedDuplicate), errorCode("CELL_REFERENCE_DUPLICATE", "A2"));
 });

 test("workbook sheet names, IDs, relationship IDs and physical targets must be unique", async () => {
  const file = workbook([{ name: "第一表", rows: [["Q1"], [1]] }, { name: "第二表", rows: [["Q1"], [7]] }]);
  const modifications = [xml => xml.replace('name="第二表"', 'name="第一表"'), xml => xml.replace('sheetId="2"', 'sheetId="1"'), xml => xml.replace('r:id="rId2"', 'r:id="rId1"')];
  for (const modification of modifications) {
    const changed = await mutate(file, async zip => zip.file("xl/workbook.xml", modification(await zip.file("xl/workbook.xml").async("string"))));
    await assert.rejects(loadSpreadsheet(changed), errorCode("WORKBOOK_DIRECTORY_DUPLICATE"));
  }
  const duplicateTarget = await mutate(file, async zip => { const path = "xl/_rels/workbook.xml.rels"; zip.file(path, (await zip.file(path).async("string")).replace('Target="worksheets/sheet2.xml"', 'Target="/xl/worksheets/sheet1.xml"')); });
  await assert.rejects(loadSpreadsheet(duplicateTarget), errorCode("WORKBOOK_DIRECTORY_DUPLICATE"));
  const duplicateRelId = await mutate(file, async zip => { const path = "xl/_rels/workbook.xml.rels"; zip.file(path, (await zip.file(path).async("string")).replace('Id="rId2"', 'Id="rId1"')); });
  await assert.rejects(loadSpreadsheet(duplicateRelId), errorCode("RELATIONSHIP_INVALID"));
  const original = await loadSpreadsheet(file); assert.equal(original.select({ sheetId: "sheet-0", headerRow: 1 }).table.rows[0][0], "1"); assert.equal(original.select({ sheetId: "sheet-1", headerRow: 1 }).table.rows[0][0], "7");
 });

 test("strict XML adds duplicate-attribute, namespace, nesting and cell-content gates", async () => {
  const file = workbook();
  for (const replacement of ['<c r="A2" r="A3">', '<c xmlns:q="urn:test" q:r="A3" r="A2" r="A4">']) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2">', replacement)); await assert.rejects(loadSpreadsheet(changed), errorCode("XML_ATTRIBUTE_DUPLICATE"));
  }
  const wrongNs = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<bad:c xmlns:bad="urn:evil" r="A2"><v>1</v></bad:c>'));
  await assert.rejects(loadSpreadsheet(wrongNs), errorCode("WORKSHEET_NAMESPACE"));
  const duplicateValue = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2"><v>1</v><v>999</v></c>'));
  await assert.rejects(loadSpreadsheet(duplicateValue), errorCode("CELL_CONTENT_DUPLICATE", "A2"));
  const mismatch = await rewriteSheet(file, xml => xml.replace('</sheetData>', '</wrong>')); await assert.rejects(loadSpreadsheet(mismatch), errorCode("XML_INVALID"));
  const unknownEntity = await rewriteSheet(file, xml => xml.replace('<v>1</v>', '<v>&undefined;</v>')); await assert.rejects(loadSpreadsheet(unknownEntity), errorCode("XML_INVALID"));
  const deep = await rewriteSheet(file, xml => xml.replace('</worksheet>', '<ext>' + '<nest>'.repeat(65) + '</nest>'.repeat(65) + '</ext></worksheet>'));
  await assert.rejects(loadSpreadsheet(deep), errorCode("XML_BUDGET"));
 });

 test("malformed repeated open tags remain bounded at the independent 640,000-character scale", async context => {
  for (const count of [1000, 16000, 64000]) {
    const xml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + '<c r="A1" '.repeat(count) + '</sheetData></worksheet>';
    const changed = await rewriteSheet(workbook(), () => xml), started = performance.now();
    await assert.rejects(loadSpreadsheet(changed), errorCode("XML_INVALID"));
    context.diagnostic(JSON.stringify({ synthetic: true, repeatCount: count, xmlChars: xml.length, zipBytes: changed.byteLength, rejectionMs: Math.round(performance.now() - started) }));
  }
 });

 test("explicit self-closing empty string formula cache is accepted, numeric empty cache stays unknown", async () => {
  const file = workbook();
  const empty = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="str"><f>IF(1=1,&quot;&quot;,&quot;x&quot;)</f><v/></c>'));
  const result = (await loadSpreadsheet(empty)).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(result.table.rows[0][0], ""); assert.equal(result.cellMeta[0][0].rawValue, ""); assert.equal(result.cellMeta[0][0].formulaState, "cached");
  const numeric = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2"><f>1+1</f><v/></c>'));
  const session = await loadSpreadsheet(numeric); assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("FORMULA_CACHE_MISSING", "A2"));
 });

 test("complete finite numeric lexemes and explicit booleans reject silent SheetJS coercions including caches", async () => {
  const file = workbook();
  const invalidNumbers = ["123tail", "1,234", "0x10", "1e", "NaN", "Infinity", "1e9999", "--2"];
  for (const value of invalidNumbers) for (const formula of ["", "<f>1+1</f>"]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="n">' + formula + '<v>' + value + '</v></c>'));
    await assert.rejects(loadSpreadsheet(changed), errorCode("CELL_VALUE_INVALID", "A2"));
  }
  for (const value of ["2", "-1", "yes", "TRUE", "False", ""]) for (const formula of ["", "<f>1=1</f>"]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="b">' + formula + '<v>' + value + '</v></c>'));
    if (formula && value === "") { const session = await loadSpreadsheet(changed); assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("FORMULA_CACHE_MISSING", "A2")); }
    else await assert.rejects(loadSpreadsheet(changed), errorCode("CELL_VALUE_INVALID", "A2"));
  }
  for (const value of ["1tail", "0.5", "-1", "1e2", "9007199254740993"]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="s"><v>' + value + '</v></c>'));
    await assert.rejects(loadSpreadsheet(changed), errorCode("CELL_VALUE_INVALID", "A2"));
  }
 });

 test("legal scientific numbers, boolean values, numeric blanks and string caches retain their exact meaning", async () => {
  const file = workbook();
  for (const value of ["1.25e2", "-2.5E-2", "+.5", "1.", " 123 ", "-0", "0"]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="n"><v>' + value + '</v></c>'));
    const result = (await loadSpreadsheet(changed)).select({ sheetId: "sheet-0", headerRow: 1 }); assert.ok(Object.is(result.cellMeta[0][0].rawValue, Number(value)));
  }
  for (const value of ["0", "1", "true", "false"]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="b"><f>1=1</f><v>' + value + '</v></c>'));
    const result = (await loadSpreadsheet(changed)).select({ sheetId: "sheet-0", headerRow: 1 }); assert.equal(result.cellMeta[0][0].rawValue, value === "1" || value === "true"); assert.equal(result.cellMeta[0][0].formulaState, "cached");
  }
  // XML boolean whitespace is legal, but cannot be accepted if the downstream parser changes true to false.
  const whitespaceTrue = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="b"><v> true </v></c>'));
  await assert.rejects(loadSpreadsheet(whitespaceTrue), errorCode("CELL_VALUE_MISMATCH", "A2"));
  for (const value of ["", " \t\n "]) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="n"><v>' + value + '</v></c>'));
    const result = (await loadSpreadsheet(changed)).select({ sheetId: "sheet-0", headerRow: 1 }); assert.equal(result.cellMeta[0][0].rawValue, null); assert.equal(result.table.rows[0][0], "");
    const formula = await rewriteSheet(changed, xml => xml.replace('<c r="A2" t="n">', '<c r="A2" t="n"><f>1+1</f>'));
    const session = await loadSpreadsheet(formula); assert.throws(() => session.select({ sheetId: "sheet-0", headerRow: 1 }), errorCode("FORMULA_CACHE_MISSING", "A2"));
  }
  const textual = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="str"><f>TEXT(1,&quot;0&quot;)</f><v>123tail</v></c>'));
  const result = (await loadSpreadsheet(textual)).select({ sheetId: "sheet-0", headerRow: 1 }); assert.equal(result.cellMeta[0][0].rawValue, "123tail"); assert.equal(result.cellMeta[0][0].formulaState, "cached");
 });

 test("legal shared-string indices retain Chinese labels, emoji and leading-zero raw strings", async () => {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["编码😀", "中文 & 特殊符号"], ["00042", "甲<&>"], ["00123", "乙"]]), "共享字符串");
  const file = XLSX.write(book, { type: "array", bookType: "xlsx", bookSST: true, compression: true });
  const result = (await loadSpreadsheet(file)).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.deepEqual(result.columns.map(column => column.label), ["编码😀", "中文 & 特殊符号"]); assert.deepEqual(result.table.rows, [["00042", "甲<&>"], ["00123", "乙"]]); assert.equal(result.cellMeta[0][0].rawValue, "00042");
  const cached = await rewriteSheet(file, xml => xml.replace(/(<c r="A2" t="s">)/u, '$1<f>TEXT(42,&quot;00000&quot;)</f>'));
  const cachedResult = (await loadSpreadsheet(cached)).select({ sheetId: "sheet-0", headerRow: 1 }); assert.equal(cachedResult.cellMeta[0][0].rawValue, "00042"); assert.equal(cachedResult.cellMeta[0][0].formulaState, "cached");
 });

 test("simple values and formulas reject all nested elements without blocking legal inline rich text", async () => {
  const file = workbook();
  const brokenCells = [
    '<c r="A2"><v><x>999</x></v></c>',
    '<c r="A2"><v><x/></v></c>',
    '<c r="A2"><v><q:x xmlns:q="urn:test">999</q:x></v></c>',
    '<c r="A2"><f><x>1+1</x></f><v>2</v></c>',
    '<c r="A2"><f>1+<q:x xmlns:q="urn:test">1</q:x></f><v>2</v></c>',
    '<c r="A2" t="str"><f>TEXT(1,&quot;0&quot;)</f><v><x>text</x></v></c>'
  ];
  for (const replacement of brokenCells) {
    const changed = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', replacement));
    await assert.rejects(loadSpreadsheet(changed), errorCode("CELL_VALUE_INVALID", "A2"));
  }
  const inline = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2" t="inlineStr"><is><r><rPr><b/></rPr><t>第一</t></r><r><t xml:space="preserve"> &amp; 第二😀</t></r></is></c>'));
  const richResult = (await loadSpreadsheet(inline)).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(richResult.cellMeta[0][0].rawValue, "第一 & 第二😀"); assert.equal(richResult.table.rows[0][0], "第一 & 第二😀");
  const cdata = await rewriteSheet(file, xml => xml.replace('<c r="A2"><v>1</v></c>', '<c r="A2"><f><![CDATA[1+1]]></f><v><![CDATA[2]]></v></c>'));
  const cdataResult = (await loadSpreadsheet(cdata)).select({ sheetId: "sheet-0", headerRow: 1 });
  assert.equal(cdataResult.cellMeta[0][0].rawValue, 2); assert.equal(cdataResult.cellMeta[0][0].formulaState, "cached");
 });