'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');

const {
  readBody,
  readForm,
  readJson,
  setRequestBodyTimeoutForTests,
} = require('../../lib/http');

test('request body helpers enforce byte limits for already-parsed values', async () => {
  await assert.rejects(readBody({ body: { text: 'x'.repeat(40) } }, 16), { statusCode: 413 });
  await assert.rejects(readJson({ body: { text: 'x'.repeat(40) } }, 16), { statusCode: 413 });
  await assert.rejects(readForm({ body: { text: 'x'.repeat(40) } }, 16), { statusCode: 413 });
  await assert.rejects(readBody({ body: 'ééééééééé' }, 16), { statusCode: 413 });
  await assert.rejects(readBody({ body: Buffer.alloc(17) }, 16), { statusCode: 413 });

  assert.deepEqual(await readJson({ body: { accepted: true } }, 32), { accepted: true });
  assert.equal(await readBody({ body: Buffer.from('é') }, 2), 'é');
});

test('request body helpers enforce byte limits while streaming', async () => {
  const oversized = Readable.from([Buffer.from('12345678'), Buffer.from('90123456')]);
  await assert.rejects(readBody(oversized, 12), { statusCode: 413 });

  const request = Readable.from([Buffer.from('{"ok":'), Buffer.from('true}')]);
  assert.deepEqual(await readJson(request, 16), { ok: true });
});

test('stalled request bodies stop reading and return a bounded timeout error', async (t) => {
  let paused = false;
  let returned = false;
  setRequestBodyTimeoutForTests(20);
  t.after(() => setRequestBodyTimeoutForTests(null));
  const stalled = {
    pause() { paused = true; },
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise(() => {}),
        return() { returned = true; return Promise.resolve({ done: true }); },
      };
    },
  };

  await assert.rejects(readBody(stalled, 64), { statusCode: 408 });
  assert.equal(paused, true);
  assert.equal(returned, true);
});
