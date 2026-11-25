import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import { buildDocx } from '../lib/editor-export.ts';
import { createEditorContent, parseEditorContent } from '../lib/editor-model.ts';
import { parsePreflightReceipt } from '../lib/preflight-upload.ts';
import {
  inspectSubmissionLocal,
  normalizeIdentityTerms,
  PREFLIGHT_LIMITS,
} from '../lib/submission-preflight.ts';

const NS = {
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  office: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  app: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
};

const CONTENT_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
};

const MAIN_PATHS = {
  docx: 'word/document.xml',
  pptx: 'ppt/presentation.xml',
};

const FORBIDDEN_BRACKETS_RE = /[\u3010\u3011\u300c\u300d\u300e\u300f]/u;
const HEX_COLOR_RE = /#[0-9A-Fa-f]{3,8}\b/u;

function sha256Hex(input) {
  return createHash('sha256').update(new Uint8Array(input)).digest('hex');
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeBaseParts(kind = 'docx', extra = [], overrides = []) {
  const defaultMain =
    kind === 'docx'
      ? `<w:document xmlns:w="${NS.w}"><w:body><w:p><w:r><w:t>匿名抽样实证研究正文</w:t></w:r></w:p></w:body></w:document>`
      : `<p:presentation xmlns:p="${NS.p}"/>`;
  const overrideTags = [
    `<Override PartName="/${MAIN_PATHS[kind]}" ContentType="${CONTENT_TYPES[kind]}"/>`,
    ...overrides.map(
      item => `<Override PartName="/${item.partName}" ContentType="${item.contentType}"/>`,
    ),
  ].join('');

  return [
    {
      name: '[Content_Types].xml',
      body: `<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrideTags}</Types>`,
    },
    {
      name: '_rels/.rels',
      body: `<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.office}" Target="${MAIN_PATHS[kind]}"/></Relationships>`,
    },
    {
      name: MAIN_PATHS[kind],
      body: defaultMain,
    },
    ...extra,
  ];
}

async function buildZipBuffer(list) {
  const archive = new JSZip();
  for (const part of list) {
    archive.file(part.name, part.body);
  }
  return archive.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

function buildRawZipBuffer(list) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const part of list) {
    const original = Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body ?? '');
    const name = Buffer.from(part.name);
    const method = part.method ?? 8;
    const packed = part.packed ?? (method === 8 ? deflateRawSync(original) : original);
    const flags = part.flags ?? 0x800;
    const size = part.size ?? original.length;
    const check = part.crc ?? crc32(original);
    const extra = part.extra ?? Buffer.alloc(0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(part.version ?? 20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(check, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(part.version ?? 20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(check, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(part.attrs ?? 0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, extra, packed);
    centrals.push(central, name, extra);
    offset += local.length + name.length + extra.length + packed.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(list.length, 8);
  eocd.writeUInt16LE(list.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const combined = Buffer.concat([...locals, centralDir, eocd]);
  return combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength);
}

function assertReportStringHygiene(report, contextLabel) {
  for (const finding of report.findings) {
    for (const [key, value] of Object.entries(finding)) {
      if (typeof value !== 'string') continue;
      assert.doesNotMatch(
        value,
        FORBIDDEN_BRACKETS_RE,
        `${contextLabel}: PreflightFinding.${key} must contain zero forbidden brackets: "${value}"`,
      );
      assert.doesNotMatch(
        value,
        HEX_COLOR_RE,
        `${contextLabel}: PreflightFinding.${key} must contain zero raw #RRGGBB literals: "${value}"`,
      );
    }
  }

  for (const item of report.coverage) {
    for (const [key, value] of Object.entries(item)) {
      if (typeof value !== 'string') continue;
      assert.doesNotMatch(
        value,
        FORBIDDEN_BRACKETS_RE,
        `${contextLabel}: PreflightCoverage.${key} must contain zero forbidden brackets: "${value}"`,
      );
      assert.doesNotMatch(
        value,
        HEX_COLOR_RE,
        `${contextLabel}: PreflightCoverage.${key} must contain zero raw #RRGGBB literals: "${value}"`,
      );
    }
  }
}

test('PREFLIGHT_LIMITS and normalizeIdentityTerms enforce immutable budgets and NFKC/Cf blind-review normalization', () => {
  assert.equal(Object.isFrozen(PREFLIGHT_LIMITS), true);
  assert.equal(PREFLIGHT_LIMITS.input, 20 * 1024 * 1024);
  assert.equal(PREFLIGHT_LIMITS.entries, 2000);
  assert.equal(PREFLIGHT_LIMITS.total, 64 * 1024 * 1024);
  assert.equal(PREFLIGHT_LIMITS.entry, 8 * 1024 * 1024);
  assert.equal(PREFLIGHT_LIMITS.findings, 500);
  assert.equal(PREFLIGHT_LIMITS.xmlNodes, 300_000);
  assert.equal(PREFLIGHT_LIMITS.xmlDepth, 128);
  assert.equal(PREFLIGHT_LIMITS.terms, 128);

  const normalized = normalizeIdentityTerms([
    '  某某财经大学  ',
    '某某\u200b财经大学',
    'ＡＢＣ统计学院',
    'abc统计学院',
    '张\ufeff三',
    '指导教师  李四',
    '',
  ]);
  assert.deepEqual(normalized, ['某某财经大学', 'abc统计学院', '张三', '指导教师 李四']);

  for (const invalidTerms of [
    [123],
    Array.from({ length: PREFLIGHT_LIMITS.terms + 1 }, (_, i) => `词条${i}`),
    ['校'.repeat(65)],
    Array.from({ length: 32 }, (_, i) => `${'院'.repeat(58)}${i}`),
  ]) {
    assert.throws(
      () => normalizeIdentityTerms(invalidTerms),
      err => {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, FORBIDDEN_BRACKETS_RE);
        assert.doesNotMatch(err.message, HEX_COLOR_RE);
        return true;
      },
    );
  }
});

test('blind-review identity leaks are caught across docProps/core.xml, docProps/app.xml, DOCX body, PPTX slides/notes, and PDF preflight', async () => {
  const blindTerms = ['某某财经大学', '张三', '李四'];

  // 1. DOCX: leaks in docProps/core.xml, docProps/app.xml, and split runs inside word/document.xml
  const leakyDocxParts = makeBaseParts('docx', [
    {
      name: 'docProps/core.xml',
      body: `<cp:coreProperties xmlns:cp="${NS.core}" xmlns:dc="${NS.dc}"><dc:creator>张三</dc:creator><cp:lastModifiedBy>李四</cp:lastModifiedBy><dc:subject>某某财经大学校级立项</dc:subject></cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      body: `<Properties xmlns="${NS.app}"><Company>某某财经大学</Company><Manager>李四</Manager></Properties>`,
    },
  ]);
  leakyDocxParts[2].body = `<w:document xmlns:w="${NS.w}"><w:body><w:p><w:r><w:t>本调研由某某</w:t></w:r><w:r><w:t>财经\u200b大学团队完成，作者张  三，指导教师李四。</w:t></w:r></w:p></w:body></w:document>`;

  const docxReport = await inspectSubmissionLocal(
    await buildZipBuffer(leakyDocxParts),
    '匿名参赛正文.docx',
    blindTerms,
  );
  assert.equal(docxReport.status, 'issues_found');
  assertReportStringHygiene(docxReport, 'leaky-docx');

  const docxIdentityErrors = docxReport.findings.filter(
    f => f.level === 'error' && f.code === 'forbidden_identity_term',
  );
  assert.ok(docxIdentityErrors.some(f => f.location === 'docProps/core.xml'));
  assert.ok(docxIdentityErrors.some(f => f.location === 'docProps/app.xml'));
  assert.ok(docxIdentityErrors.some(f => f.location === 'word/document.xml' && f.field === 'text;term:1'));
  assert.ok(docxIdentityErrors.some(f => f.location === 'word/document.xml' && f.field === 'text;term:2'));
  assert.ok(docxIdentityErrors.some(f => f.location === 'word/document.xml' && f.field === 'text;term:3'));

  const docxMetaFields = docxReport.findings
    .filter(f => f.code === 'identity_metadata')
    .map(f => f.field);
  for (const expectedField of ['creator', 'lastModifiedBy', 'subject', 'Company', 'Manager']) {
    assert.ok(docxMetaFields.includes(expectedField), `Expected metadata warning for ${expectedField}`);
  }
  // Findings must reference term ordinals rather than echoing raw leaked identity strings
  for (const term of blindTerms) {
    assert.equal(JSON.stringify(docxReport.findings).includes(term), false);
  }

  // 2. PPTX: leaks in docProps/core.xml, docProps/app.xml, hidden slide text, and speaker notes
  const leakyPptxParts = makeBaseParts('pptx', [
    {
      name: 'docProps/core.xml',
      body: `<cp:coreProperties xmlns:cp="${NS.core}" xmlns:dc="${NS.dc}"><dc:creator>张三</dc:creator></cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      body: `<Properties xmlns="${NS.app}"><Company>某某财经大学</Company></Properties>`,
    },
    {
      name: 'ppt/slides/slide1.xml',
      body: `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" show="0"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>某某财经大学答辩展示</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    },
    {
      name: 'ppt/notesSlides/notesSlide1.xml',
      body: `<p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>汇报人：张三；指导教师：李四</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    },
  ]);

  const pptxReport = await inspectSubmissionLocal(
    await buildZipBuffer(leakyPptxParts),
    '答辩演示稿.pptx',
    blindTerms,
  );
  assert.equal(pptxReport.status, 'issues_found');
  assertReportStringHygiene(pptxReport, 'leaky-pptx');

  const pptxCodes = new Set(pptxReport.findings.map(f => f.code));
  assert.ok(pptxCodes.has('forbidden_identity_term'));
  assert.ok(pptxCodes.has('identity_metadata'));
  assert.ok(pptxCodes.has('hidden_slides_present'));
  assert.ok(pptxCodes.has('speaker_notes_present'));
  assert.ok(
    pptxReport.findings.some(
      f => f.code === 'forbidden_identity_term' && f.location === 'ppt/slides/slide1.xml',
    ),
  );
  assert.ok(
    pptxReport.findings.some(
      f => f.code === 'forbidden_identity_term' && f.location === 'ppt/notesSlides/notesSlide1.xml',
    ),
  );

  // 3. PDF: local filename leak detection + explicit incomplete status + deep server receipt for PDF metadata & page text
  const syntheticPdfBytes = new TextEncoder().encode(
    '%PDF-1.7\n1 0 obj << /Author (张三) /Producer (某某财经大学) >> endobj\nBT (指导教师李四) Tj ET\n%%EOF',
  ).buffer;

  const pdfLocalFilenameLeak = await inspectSubmissionLocal(
    syntheticPdfBytes,
    '某某财经大学_张三_提交稿.pdf',
    blindTerms,
  );
  assert.equal(pdfLocalFilenameLeak.format, 'pdf');
  assert.equal(pdfLocalFilenameLeak.status, 'incomplete');
  assertReportStringHygiene(pdfLocalFilenameLeak, 'pdf-local-filename-leak');
  assert.ok(
    pdfLocalFilenameLeak.findings.some(
      f => f.code === 'forbidden_identity_term' && f.location === 'filename',
    ),
  );
  assert.equal(
    pdfLocalFilenameLeak.coverage.find(c => c.id === 'metadata')?.status,
    'not_checked',
  );

  const normalizedTerms = normalizeIdentityTerms(blindTerms);
  const expectedPdfSha = sha256Hex(syntheticPdfBytes);
  const expectedTermsHash = sha256Hex(new TextEncoder().encode(JSON.stringify(normalizedTerms)));
  const deepPdfReceipt = parsePreflightReceipt(
    JSON.stringify({
      schema: 'submission-preflight/v1',
      name: '匿名定稿.pdf',
      format: 'pdf',
      bytes: syntheticPdfBytes.byteLength,
      sha256: expectedPdfSha,
      scope: 'server-deep',
      status: 'issues_found',
      termsHash: expectedTermsHash,
      cleanup: { completed: true, reason: 'temporary-upload' },
      findings: [
        {
          level: 'warning',
          code: 'identity_metadata',
          message: '此属性未清空，可能保留作者或机构信息，请在文档属性中核对并清除。',
          location: 'pdf/info',
          field: 'Author',
        },
        {
          level: 'error',
          code: 'forbidden_identity_term',
          message: '发现第 1 项身份词，请在原文件中清除并重新检查。',
          location: 'pdf/info',
          field: 'Producer;term:1',
        },
        {
          level: 'error',
          code: 'forbidden_identity_term',
          message: '发现第 3 项身份词，请在原文件中清除并重新检查。',
          location: 'pdf/page:1',
          field: 'text;term:3',
        },
      ],
      coverage: [
        { id: 'package_structure', label: '文件包结构与资源限制', status: 'checked', detail: '已核对 PDF 对象结构与流边界。' },
        { id: 'metadata', label: '作者与自定义属性', status: 'checked', detail: '已检查 PDF 文档信息字典与元数据流。' },
        { id: 'identity_terms', label: '身份词与隐藏文字', status: 'checked', detail: '已按身份词检查 PDF 元数据与页面文字层。' },
      ],
    }),
    {
      name: '匿名定稿.pdf',
      format: 'pdf',
      bytes: syntheticPdfBytes.byteLength,
      sha256: expectedPdfSha,
      termsHash: expectedTermsHash,
    },
  );
  assert.equal(deepPdfReceipt.status, 'issues_found');
  assert.equal(deepPdfReceipt.findings.length, 3);
  assertReportStringHygiene(deepPdfReceipt, 'pdf-server-deep');
});

test('Word revision residue (<w:ins>, <w:del>, and word/comments.xml) is detected with exact location and count', async () => {
  const revisionDocxParts = makeBaseParts('docx', [
    {
      name: 'word/comments.xml',
      body: `<w:comments xmlns:w="${NS.w}"><w:comment w:id="0" w:author="评阅人"><w:p><w:r><w:t>请核对抽样框权重</w:t></w:r></w:p></w:comment></w:comments>`,
    },
  ]);
  revisionDocxParts[2].body = `<w:document xmlns:w="${NS.w}"><w:body><w:p><w:ins w:id="1" w:author="修订人"><w:r><w:t>补充稳健性检验说明</w:t></w:r></w:ins><w:del w:id="2" w:author="修订人"><w:r><w:delText>旧版描述</w:delText></w:r></w:del></w:p></w:body></w:document>`;

  const report = await inspectSubmissionLocal(
    await buildZipBuffer(revisionDocxParts),
    '初稿修订核查.docx',
    ['某某财经大学'],
  );
  assert.equal(report.status, 'issues_found');
  assertReportStringHygiene(report, 'word-revision-residue');

  const trackedFinding = report.findings.find(f => f.code === 'tracked_changes_present');
  assert.ok(trackedFinding, 'Expected tracked_changes_present finding for <w:ins> and <w:del>');
  assert.equal(trackedFinding.location, 'word/document.xml');
  assert.match(trackedFinding.message, /2 个修订标记/u);

  const commentsFinding = report.findings.find(f => f.code === 'comments_present');
  assert.ok(commentsFinding, 'Expected comments_present finding for word/comments.xml');
  assert.equal(commentsFinding.location, 'word/comments.xml');
  assert.equal(
    report.coverage.find(c => c.id === 'comments_revisions')?.status,
    'checked',
  );
});

test('oversized, corrupt, encrypted, path-traversing, and unsupported archives are cleanly rejected without unhandled crashes', async () => {
  // 1. Hard input size cap (> 20 MiB) and unsupported extensions throw pure Chinese errors before archive parsing
  await assert.rejects(
    inspectSubmissionLocal(new ArrayBuffer(PREFLIGHT_LIMITS.input + 1), '超限稿件.docx', []),
    err => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /20 MiB/u);
      assert.doesNotMatch(err.message, FORBIDDEN_BRACKETS_RE);
      assert.doesNotMatch(err.message, HEX_COLOR_RE);
      return true;
    },
  );

  for (const badName of ['含宏文档.docm', '原始数据表.xlsx', '压缩包.zip']) {
    await assert.rejects(
      inspectSubmissionLocal(new ArrayBuffer(64), badName, []),
      err => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /DOCX|PPTX|PDF/u);
        assert.doesNotMatch(err.message, FORBIDDEN_BRACKETS_RE);
        assert.doesNotMatch(err.message, HEX_COLOR_RE);
        return true;
      },
    );
  }

  // 2. Corrupt / malformed / unsupported / bomb archives return status="incomplete" with clean diagnostic findings
  const badArchives = [
    {
      label: 'non-zip-garbage',
      bytes: new TextEncoder().encode('not-a-valid-office-zip-archive').buffer,
      expectedCode: 'zip_invalid',
    },
    {
      label: 'encrypted-flag',
      bytes: buildRawZipBuffer([
        { ...makeBaseParts('docx')[0], flags: 0x801 },
        ...makeBaseParts('docx').slice(1),
      ]),
      expectedCode: 'zip_unsupported',
    },
    {
      label: 'zip64-extra-header',
      bytes: buildRawZipBuffer([
        { ...makeBaseParts('docx')[0], extra: Buffer.from([1, 0, 0, 0]) },
        ...makeBaseParts('docx').slice(1),
      ]),
      expectedCode: 'zip_unsupported',
    },
    {
      label: 'crc-tamper',
      bytes: buildRawZipBuffer(
        makeBaseParts('docx', [{ name: 'word/media/chart.bin', body: 'abc', crc: 0x12345678 }]),
      ),
      expectedCode: 'zip_integrity',
    },
    {
      label: 'entry-expansion-limit',
      bytes: buildRawZipBuffer(
        makeBaseParts('docx', [
          { name: 'word/media/oversized.bin', body: 'x', size: PREFLIGHT_LIMITS.entry + 1 },
        ]),
      ),
      expectedCode: 'zip_expansion_limit',
    },
    {
      label: 'path-traversal',
      bytes: buildRawZipBuffer(
        makeBaseParts('docx', [{ name: '../escaped.xml', body: '<r/>' }]),
      ),
      expectedCode: 'zip_path_invalid',
    },
    {
      label: 'extension-spoof-pptx-as-docx',
      bytes: await buildZipBuffer(makeBaseParts('pptx')),
      expectedCode: 'office_type_mismatch',
    },
  ];

  for (const scenario of badArchives) {
    const report = await inspectSubmissionLocal(scenario.bytes, '待检文件.docx', ['某某财经大学']);
    assert.equal(report.status, 'incomplete', `${scenario.label} must resolve as incomplete`);
    assert.ok(
      report.findings.some(f => f.level === 'error' && f.code === scenario.expectedCode),
      `${scenario.label} expected ${scenario.expectedCode}, got ${JSON.stringify(report.findings)}`,
    );
    assertReportStringHygiene(report, scenario.label);
  }
});

test('clean anonymous DOCX built via buildDocx passes local preflight with zero error findings and 100% string hygiene', async () => {
  const content = createEditorContent();
  content.version = 2;
  content.title = '社区嵌入式养老服务供需匹配与满意度实证调查报告';
  content.subtitle = '基于多阶段分层随机抽样的结构方程与稳健性检验';
  content.report = [
    {
      id: 'sec-1',
      title: '一、研究背景与抽样设计',
      body: '本研究面向城市老年常住居民开展多阶段分层抽样，严格执行匿名审阅规范，不保留任何学校、院系、作者或指导教师身份线索。',
      source: '实地抽样调查匿名台账',
      blocks: [],
    },
    {
      id: 'sec-2',
      title: '二、实证检验与核心发现',
      body: '采用 Mann-Whitney U 与 Kruskal-Wallis H 检验比较不同年龄组满意度差异，结果具有稳健统计显著性（p < 0.001）。',
      source: '统计复现实验记录',
      blocks: [],
    },
  ];

  const anonymousDocxBlob = await buildDocx(parseEditorContent(content));
  const anonymousBuffer = await anonymousDocxBlob.arrayBuffer();
  const phases = [];

  const report = await inspectSubmissionLocal(
    anonymousBuffer,
    '全国大学生市场调查匿名参赛正文.docx',
    ['某某财经大学', '张三', '李四', '统计与数据科学学院'],
    phase => phases.push(phase),
  );

  assert.equal(report.schema, 'submission-preflight/v1');
  assert.equal(report.format, 'docx');
  assert.notEqual(report.status, 'incomplete', JSON.stringify(report.findings));
  assert.equal(report.sha256, sha256Hex(anonymousBuffer));
  assert.deepEqual(phases, ['fingerprint', 'package', 'xml', 'inspect', 'complete']);

  const errorFindings = report.findings.filter(f => f.level === 'error');
  assert.deepEqual(
    errorFindings,
    [],
    `Clean anonymous buildDocx export must produce zero error findings, got: ${JSON.stringify(errorFindings)}`,
  );

  const findingCodes = new Set(report.findings.map(f => f.code));
  assert.equal(findingCodes.has('forbidden_identity_term'), false);
  assert.equal(findingCodes.has('tracked_changes_present'), false);
  assert.equal(findingCodes.has('comments_present'), false);
  assert.equal(findingCodes.has('active_content_present'), false);

  for (const checkedId of [
    'package_structure',
    'metadata',
    'identity_terms',
    'comments_revisions',
    'slides_notes',
    'thumbnails',
    'external_active',
    'embedded_objects',
  ]) {
    assert.equal(
      report.coverage.find(c => c.id === checkedId)?.status,
      'checked',
      `Expected coverage item "${checkedId}" to be checked`,
    );
  }

  assertReportStringHygiene(report, 'clean-anonymous-buildDocx');
});
