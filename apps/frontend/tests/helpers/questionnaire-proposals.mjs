import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as contract from '../../lib/questionnaire-proposals.ts';

const source = fs.readFileSync(new URL('../../components/hosted/questionnaire-proposal-repository.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

/** Run the real repository in this realm so ordinary-object receipt checks remain meaningful. */
export function questionnaireProposalRepositoryModule() {
  const output = {};
  const execute = vm.runInThisContext(`(function(exports, require){${code}\n})`);
  execute(output, name => { assert.equal(name, '@/lib/questionnaire-proposals'); return contract; });
  return output;
}
export { contract as questionnaireProposalContract };
