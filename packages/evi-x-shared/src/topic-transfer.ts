/** evix-topic-transfer-json/1: bounded, typed JSON hashing; never a JSON serializer.
 * Numbers use finite IEEE754 binary64, with both zeros encoded as positive zero.
 * Object keys sort by UTF16 code units. Strings retain their Unicode content.
 * Limits include the domain prefix: 2,000,000 bytes, depth 16 (root 0), and
 * 160,000 value nodes. Object keys do not count as additional value nodes.
 */
const DOMAIN = new TextEncoder().encode('evix-topic-transfer-json/1\0');
const MAX_BYTES = 2_000_000;
const MAX_DEPTH = 16;
const MAX_NODES = 160_000;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function invalid(message: string): never {
  throw new TypeError(`Topic transfer: ${message}`);
}

/** Accept only JSON values. Accessor properties are inspected, never evaluated. */
export function encodeTopicTransfer(value: unknown): Uint8Array {
  const output = new Uint8Array(MAX_BYTES);
  const encoder = new TextEncoder();
  const numberBytes = new Uint8Array(8);
  const numberView = new DataView(numberBytes.buffer);
  let position = 0;
  let nodes = 0;

  function append(bytes: Uint8Array): void {
    if (bytes.length > MAX_BYTES - position) invalid('encoded input exceeds 2,000,000 bytes.');
    output.set(bytes, position);
    position += bytes.length;
  }
  function ascii(text: string): void { append(encoder.encode(text)); }
  function string(text: string): void {
    if (text.length > MAX_BYTES - position) invalid('encoded input exceeds 2,000,000 bytes.');
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) invalid('lone UTF16 surrogate.');
      } else if (unit >= 0xdc00 && unit <= 0xdfff) invalid('lone UTF16 surrogate.');
    }
    const bytes = encoder.encode(text);
    ascii(`S${bytes.length}:`);
    append(bytes);
  }
  function visit(current: unknown, depth: number): void {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) invalid('input exceeds depth or node limits.');
    if (current === null) { ascii('N'); return; }
    if (typeof current === 'boolean') { ascii(current ? 'T' : 'F'); return; }
    if (typeof current === 'string') { string(current); return; }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) invalid('numbers must be finite binary64 values.');
      numberView.setFloat64(0, current === 0 ? 0 : current, false);
      ascii('D' + Array.from(numberBytes, byte => byte.toString(16).padStart(2, '0')).join(''));
      return;
    }
    if (typeof current !== 'object' || !current) invalid('only ordinary JSON values are supported.');
    if (Object.getOwnPropertySymbols(current).length) invalid('symbol properties are unsupported.');
    const names = Object.getOwnPropertyNames(current);
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) invalid('array prototype is unsupported.');
      const length = Object.getOwnPropertyDescriptor(current, 'length')?.value;
      if (!Number.isSafeInteger(length) || length > MAX_NODES || names.length !== length + 1) invalid('sparse arrays or extra array properties are unsupported.');
      ascii(`A${length}:`);
      for (let i = 0; i < length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(i));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid('sparse arrays or accessors are unsupported.');
        visit(descriptor.value, depth + 1);
      }
      return;
    }
    if (Object.getPrototypeOf(current) !== Object.prototype) invalid('object prototype is unsupported.');
    if (names.length > MAX_NODES) invalid('input exceeds node limits.');
    ascii(`O${names.length}:`);
    for (const key of names.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      if (FORBIDDEN.has(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid('hidden, accessor or prototype-related properties are unsupported.');
      string(key);
      visit(descriptor.value, depth + 1);
    }
  }

  append(DOMAIN);
  visit(value, 0);
  return output.slice(0, position);
}

export async function topicTransferHash(value: unknown): Promise<string> {
  const bytes = encodeTopicTransfer(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
