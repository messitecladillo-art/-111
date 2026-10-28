import assert from 'node:assert/strict';
import test from 'node:test';
import { parseService, PROVIDER_BASES } from '../src/api-types.ts';

for (const provider of ['anthropic', 'gemini']) {
  test(`native ${provider} service is accepted without a fixed model catalog`, () => {
    const service = { id: '11111111-1111-4111-8111-111111111111', label: 'Synthetic model',
      provider, baseUrl: PROVIDER_BASES[provider], model: 'user-selected-model-id', maxOutputTokens: 1024,
      capabilities: ['research', 'questionnaire', 'report'], revision: 1 };
    assert.deepEqual(parseService(service), service);
    assert.throws(() => parseService({ ...service, provider: 'unregistered-protocol' }));
  });
}
