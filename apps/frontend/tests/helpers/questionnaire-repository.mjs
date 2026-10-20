import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as shared from '../../../../packages/evi-x-shared/src/index.ts';
import * as mapping from '../../lib/questionnaire-mapping.ts';
import * as persistence from '../../lib/questionnaire-persistence.ts';
import * as topicApi from '../../lib/topic-questionnaire-api.ts';

const code = ts.transpileModule(fs.readFileSync(new URL('../../components/hosted/questionnaire-repository.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Actual repository and pure contracts; a caller may control only the transport or binding-verifier boundary. */
export function questionnaireRepositoryModule({ contract = topicApi } = {}) {
  const modules = {
    '@evix/shared': shared,
    '@/lib/questionnaire-mapping': mapping,
    '@/lib/questionnaire-persistence': persistence,
    '@/lib/topic-questionnaire-api': contract,
  };
  // Domain parsers deliberately require plain objects from their own realm.
  // Keep repository literals in that realm instead of weakening those parsers for a VM test.
  const load = vm.runInThisContext(`(function(exports,require,structuredClone,Error){${code}\n})`);
  const exports = {};
  load(exports, name => { assert.ok(name in modules, `Unmocked questionnaire repository dependency: ${name}`); return modules[name]; }, structuredClone, Error);
  return exports;
}

export { persistence as questionnairePersistence };
