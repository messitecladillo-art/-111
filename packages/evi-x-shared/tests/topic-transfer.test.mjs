import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodeTopicTransfer, topicTransferHash } from '../src/topic-transfer.ts';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/topic-transfer-hash-v1.json', import.meta.url), 'utf8'));
const domain = Buffer.from('evix-topic-transfer-json/1\0', 'utf8');
const manual = body => Buffer.concat([domain, Buffer.from(body, 'utf8')]);

test('manual typed bytes fix the domain, framing, UTF8 lengths and binary64 representation', () => {
  for (const [value, body] of [
    [null, 'N'], [true, 'T'], [false, 'F'], [0, 'D0000000000000000'], [-0, 'D0000000000000000'],
    [1, 'D3ff0000000000000'], [-2.5, 'Dc004000000000000'], ['', 'S0:'], ['汉😀', 'S7:汉😀'],
    [[], 'A0:'], [{}, 'O0:'], [[null, 'x'], 'A2:NS1:x'], [{ b: false, a: true }, 'O2:S1:aTS1:bF'],
  ]) assert.deepEqual(Buffer.from(encodeTopicTransfer(value)), manual(body));
});

for (const sample of fixture.cases) {
  test(`frozen cross-runtime bytes and SHA256: ${sample.id}`, async () => {
    const expected = Buffer.from(sample.encodedHex, 'hex');
    assert.equal(createHash('sha256').update(expected).digest('hex'), sample.sha256);
    const value = JSON.parse(sample.inputJson);
    assert.deepEqual(Buffer.from(encodeTopicTransfer(value)), expected);
    assert.equal(await topicTransferHash(value), sample.sha256);
  });
}
for (const sample of fixture.invalidCases) {
  test(`frozen invalid JSON value: ${sample.id}`, async () => {
    const value = JSON.parse(sample.inputJson);
    assert.throws(() => encodeTopicTransfer(value), TypeError);
    await assert.rejects(topicTransferHash(value), TypeError);
  });
}

test('object insertion order never controls keys, including nested supplementary-plane keys', async () => {
  const first = { '\ue000': { z: 0, '\u{10000}': 1 }, '😀': 2, a: 3 };
  const second = { a: 3, '😀': 2, '\ue000': { '\u{10000}': 1, z: -0 } };
  assert.deepEqual(encodeTopicTransfer(first), encodeTopicTransfer(second));
  assert.equal(await topicTransferHash(first), await topicTransferHash(second));
  assert.ok(Buffer.from(encodeTopicTransfer(first)).indexOf(Buffer.from('S4:😀')) < Buffer.from(encodeTopicTransfer(first)).indexOf(Buffer.from('S3:\ue000')));
});

test('tags and length framing distinguish values with similar text, preserving array order', async () => {
  const values = [null, false, 0, '', 'N', '0', [], {}, ['a', 'bc'], ['ab', 'c'], ['b', 'a'], ['a', 'b']];
  const hashes = await Promise.all(values.map(topicTransferHash));
  assert.equal(new Set(hashes).size, values.length);
  assert.notEqual(await topicTransferHash('é'), await topicTransferHash('e\u0301'));
  assert.equal(await topicTransferHash(-0), await topicTransferHash(0));
  assert.equal(await topicTransferHash(1), await topicTransferHash(1.0));
});

test('finite JSON only, with no object wrappers, foreign prototypes or implicit conversions', () => {
  class Custom { toJSON() { throw new Error('must not run'); } }
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, Symbol('x'), () => 1,
    new Date(), new Number(1), new String('x'), new Boolean(false), new Map(), new Set(),
    new Uint8Array([1]), Object.create(null), Object.create({}), new Custom(), Object.setPrototypeOf([], null)]) {
    assert.throws(() => encodeTopicTransfer(value), TypeError);
  }
});

test('getters are rejected without running and hidden/symbol/extra array properties are rejected', () => {
  let getterCalls = 0;
  const getter = () => { getterCalls++; throw new Error('getter must not run'); };
  const object = Object.defineProperty({}, 'x', { enumerable: true, get: getter });
  const array = Object.defineProperty([null], '0', { enumerable: true, get: getter });
  const hidden = Object.defineProperty({}, 'x', { value: 1 });
  const symbol = { [Symbol('x')]: 1 };
  const extra = Object.assign([], { x: 1 });
  const hiddenExtra = Object.defineProperty([], 'x', { value: 1 });
  const symbolArray = Object.assign([], { [Symbol('x')]: 1 });
  for (const value of [object, array, hidden, symbol, extra, hiddenExtra, symbolArray, new Array(3), [, null]]) {
    assert.throws(() => encodeTopicTransfer(value), TypeError);
  }
  assert.equal(getterCalls, 0);
});

test('depth and value node limits accept the exact boundary and reject one additional node', () => {
  let nested = null;
  for (let i = 0; i < 16; i++) nested = [nested];
  assert.doesNotThrow(() => encodeTopicTransfer(nested));
  assert.throws(() => encodeTopicTransfer([nested]), TypeError);
  assert.doesNotThrow(() => encodeTopicTransfer(Array(159_999).fill(null)));
  assert.throws(() => encodeTopicTransfer(Array(160_000).fill(null)), TypeError);
  const cycle = []; cycle.push(cycle);
  assert.throws(() => encodeTopicTransfer(cycle), TypeError);
});

test('2MB includes the domain and typed framing; UTF8 size is measured rather than string length', async () => {
  const length = 2_000_000 - domain.length - 9; // S + seven decimal digits + colon
  const exact = 'x'.repeat(length);
  const bytes = encodeTopicTransfer(exact);
  assert.equal(bytes.length, 2_000_000);
  assert.equal(await topicTransferHash(exact), createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => encodeTopicTransfer(exact + 'x'), TypeError);
  assert.throws(() => encodeTopicTransfer('汉'.repeat(700_000)), TypeError);
});

test('encoding never mutates an input or shares output storage across calls', async () => {
  const input = Object.freeze({ x: Object.freeze([-0, '😀']) });
  const first = encodeTopicTransfer(input);
  const expected = Buffer.from(first);
  first.fill(0);
  assert.deepEqual(Buffer.from(encodeTopicTransfer(input)), expected);
  assert.equal(Object.is(input.x[0], -0), true);
  const values = [input, 0.1, ['x', null]];
  assert.deepEqual(await Promise.all(values.map(topicTransferHash)), await Promise.all(values.map(topicTransferHash)));
});
