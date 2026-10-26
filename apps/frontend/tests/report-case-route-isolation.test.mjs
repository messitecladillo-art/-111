import assert from 'node:assert/strict';
import test from 'node:test';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match.js';
import config from '../next.config.ts';

test('case list and dynamic details remain on the local corpus route', async () => {
  const { afterFiles } = await config.rewrites();
  const proxied = path => afterFiles.some(rule => getPathMatch(rule.source)(path) !== false);
  for (const path of ['/api/cases', '/api/cases/', '/api/cases/user-16-football-dual-track', '/api/cases/not-found']) {
    assert.equal(proxied(path), false, path);
  }
});

test('hosted identity, permissions, projects and versions still go to FastAPI', async () => {
  const { afterFiles } = await config.rewrites();
  const proxied = path => afterFiles.some(rule => getPathMatch(rule.source)(path) !== false);
  for (const path of ['/api/session', '/api/projects', '/api/projects/project-1', '/api/projects/project-1/reports', '/api/services', '/api/cases-other']) {
    assert.equal(proxied(path), true, path);
  }
});
