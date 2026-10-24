import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as reports from '../../lib/project-report.ts';
import * as permission from '../../lib/report-permission.ts';
import * as persistence from '../../lib/report-persistence.ts';

const source = fs.readFileSync(new URL('../../components/hosted/useHostedReport.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Execute the actual lifecycle hook and pure contracts; only hooks and I/O are controlled. */
export function hostedReportHookModule(hooks, { auth, api, globals = {} }) {
  const modules = {
    react: hooks,
    '@/lib/project-report': reports,
    '@/lib/report-permission': permission,
    '@/lib/report-persistence': persistence,
    './HostedSession': auth,
    './api-client': api,
  };
  const box = {
    exports: {},
    require(name) { assert.ok(name in modules, `Unmocked report hook dependency: ${name}`); return modules[name]; },
    crypto, structuredClone, queueMicrotask,
    window: { confirm: () => true },
    ...globals,
  };
  vm.runInNewContext(code, box);
  return box.exports;
}
