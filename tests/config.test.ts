import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { parseOptions, projectRoot } from '../src/config.ts';

test('configuration has project-relative data defaults and explicit flags override env', () => {
  assert.equal(parseOptions([], {}).options.dataDir, resolve(projectRoot, 'data'));
  const { options } = parseOptions(['--endpoint', 'http://localhost:2345', '--timeout-ms', '456', '--data-dir', '/tmp/balatro-test'], {
    BALATRO_BRIDGE_URL: 'http://127.0.0.1:9999', BALATRO_TIMEOUT_MS: '123', BALATRO_DATA_DIR: '/tmp/ignored',
  });
  assert.equal(options.endpoint, 'http://localhost:2345'); assert.equal(options.timeoutMs, 456);
  assert.equal(options.dataDir, '/tmp/balatro-test');
});

test('configuration rejects unknown flags and invalid action deadlines', () => {
  for (const value of ['NaN', '0', '-5', '1.5', '600001']) assert.throws(() => parseOptions(['--timeout-ms', value], {}));
  assert.throws(() => parseOptions(['--config', 'old.json'], {}));
  assert.throws(() => parseOptions(['--skill-dir', '/tmp/removed'], {}));
});
