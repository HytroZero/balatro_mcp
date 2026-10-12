import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextId } from '../src/ids.ts';

test('operation counters stay distinct across backend owners and do not depend on RPC call counts', () => {
  const first = nextId('action');
  nextId('call'); nextId('call');
  const second = nextId('action');
  const [prefix, serial] = first.split('-action-');
  assert.match(prefix!, /^\d+-\d+$/);
  assert.equal(second, `${prefix}-action-${Number(serial) + 1}`);
});
