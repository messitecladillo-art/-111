import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as handoffs from '../../lib/workbench-handoffs.ts';

const hookSource = fs.readFileSync(new URL('../../components/workbench/useWorkbenchHandoffs.ts', import.meta.url), 'utf8');
const hookCode = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Run the production hook against the harness hooks and the production store. */
export function workbenchHookModule(hooks) {
  const modules = { react: hooks, '@/lib/workbench-handoffs': handoffs };
  const box = { exports: {}, require(name) { assert.ok(name in modules, `Unmocked handoff dependency: ${name}`); return modules[name]; } };
  vm.runInNewContext(hookCode, box);
  return box.exports;
}

/**
 * Subscribe to actual external-store notifications; read the current snapshot
 * during every render. This boundary harness does not emulate DOM reconciliation.
 */
export function externalStoreHook(hooks, invalidate) {
  return (subscribe, getSnapshot) => {
    hooks.useEffect(() => subscribe(invalidate), [subscribe]);
    return getSnapshot();
  };
}
