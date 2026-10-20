#!/usr/bin/env node
/** Fixed input paths make independent evaluation data inaccessible to the fit operation. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseTopicTraining, parseTopicCatalog, parseTopicEvents, parseTopicSources, parseTopicModel } from '../lib/topic-advisor/parse.ts';
import { trainTopicRanker } from '../lib/topic-advisor/training.ts';

const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--check') || flags.length > 1) throw new Error('Usage: node --experimental-strip-types scripts/train-topic-advisor.mjs [--check]');
const content = new URL('../content/topic-advisor/', import.meta.url);
const specs = [['train.json', parseTopicTraining], ['catalog.json', parseTopicCatalog], ['hotspot-events.json', parseTopicEvents], ['sources.json', parseTopicSources]];
const inputs = await Promise.all(specs.map(async ([filename, parse]) => { const bytes = await readFile(new URL(filename, content)); return { filename, sha256: createHash('sha256').update(bytes).digest('hex'), value: parse(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))) }; }));
const [training, catalog, events, sources] = inputs.map(i => i.value);
const model = trainTopicRanker(training, catalog, events, sources, { trainSha256: inputs[0].sha256, catalogSha256: inputs[1].sha256, eventsSha256: inputs[2].sha256, sourcesSha256: inputs[3].sha256 });
parseTopicModel(model);
const output = `${JSON.stringify(model, null, 2)}\n`, destination = new URL('ranker.json', content);
if (flags.includes('--check')) {
  const existing = await readFile(destination, 'utf8');
  if (existing !== output) throw new Error('ranker.json is stale. Re-train from the reviewed training inputs before release.');
} else await writeFile(destination, output, 'utf8');
console.log(JSON.stringify({ status: flags.includes('--check') ? 'reproducible' : 'produced', path: fileURLToPath(destination), sha256: createHash('sha256').update(output).digest('hex'), modelVersion: model.modelVersion, pairs: model.training.pairCount, trainPairAccuracy: model.training.pairAccuracy, trainLoss: model.training.loss, evaluationDataRead: false, limitation: 'Training fit on authored synthetic preferences; not an external quality or award score.' }, null, 2));
