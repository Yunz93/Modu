import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from '../src/save-queue.ts';

test('one writer coalesces waiting snapshots and flush waits for the latest write', async () => {
  const writes = []; const gates = [];
  const queue = createSaveQueue(value => new Promise(resolve => { writes.push(value); gates.push(resolve); }), () => {});
  queue.enqueue(1); queue.enqueue(2); queue.enqueue(3);
  const done = queue.flush();
  assert.deepEqual(writes, [1]);
  gates.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, [1,3]); gates.shift()(); await done;
});
test('failed writes remain pending for an explicit retry', async () => {
  let fail = true; const writes = []; const errors = [];
  const queue = createSaveQueue(async value => { if (fail) throw Error('disk full'); writes.push(value); }, error => errors.push(String(error)));
  queue.enqueue('saved'); await assert.rejects(queue.flush(), /disk full/);
  assert.equal(errors.length, 1); fail = false; await queue.flush();
  assert.deepEqual(writes, ['saved']);
});
