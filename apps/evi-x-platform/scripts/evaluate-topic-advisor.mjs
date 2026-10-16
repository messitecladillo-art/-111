import { fileURLToPath } from 'node:url';
import { loadFrozenEvaluation, evaluateFrozen } from './topic-evaluation.mjs';

const args = process.argv.slice(2);
if (args.some(v => !['--verify', '--pretty'].includes(v)) || new Set(args).size !== args.length) {
  console.error('Usage: node --experimental-strip-types scripts/evaluate-topic-advisor.mjs [--verify] [--pretty]');
  process.exitCode = 2;
} else {
  try {
    const frozen = loadFrozenEvaluation(fileURLToPath(new URL('../../../', import.meta.url)));
    const result = args.includes('--verify') ? { status: 'verified', evaluationClass: 'public_calibration', ...frozen.identity } : evaluateFrozen(frozen);
    console.log(JSON.stringify(result, null, args.includes('--pretty') ? 2 : 0));
    if (result.passed === false) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'rejected', reason: error.message }));
    process.exitCode = 2;
  }
}
